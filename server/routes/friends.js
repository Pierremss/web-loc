import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth } from '../middleware/auth.js';

const router = Router();

// Enviar pedido de amizade
router.post('/request', ensureAuth,
  body('toUserId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const fromId = Number(req.user.id);
    const toId = Number(req.body.toUserId);
    if (fromId === toId) return res.status(400).json({ error: 'Não é possível adicionar a si mesmo' });

    try {
      await pool.query('INSERT IGNORE INTO friend_requests (requester_id, receiver_id) VALUES (?, ?)', [fromId, toId]);
      // Notificar destinatário em tempo real
      req.app.get('io')?.to(`user:${toId}`).emit('friend:request', { fromUserId: fromId });
      return res.status(201).json({ message: 'Pedido enviado' });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao enviar pedido', detail: e.message });
    }
  }
);

// Aceitar pedido
router.post('/accept', ensureAuth,
  body('requesterId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const userId = Number(req.user.id);
    const requesterId = Number(req.body.requesterId);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [reqRows] = await conn.query(
        'SELECT id, status FROM friend_requests WHERE requester_id = ? AND receiver_id = ? FOR UPDATE',
        [requesterId, userId]
      );
      if (!reqRows.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }
      if (reqRows[0].status === 'accepted') {
        await conn.rollback();
        return res.status(200).json({ message: 'Já aceito' });
      }
      await conn.query('UPDATE friend_requests SET status = "accepted" WHERE requester_id = ? AND receiver_id = ?', [requesterId, userId]);
  // Inserção única usando par não-direcional (LEAST/GREATEST)
  await conn.query('INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (LEAST(?, ?), GREATEST(?, ?))', [userId, requesterId, userId, requesterId]);
  await conn.commit();
  // Notificar solicitante
  req.app.get('io')?.to(`user:${requesterId}`).emit('friend:accepted', { byUserId: userId });
  return res.json({ message: 'Amizade criada' });
    } catch (e) {
      await conn.rollback();
      return res.status(500).json({ error: 'Erro ao aceitar pedido', detail: e.message });
    } finally {
      conn.release();
    }
  }
);

// Recusar pedido
router.post('/decline', ensureAuth,
  body('requesterId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const userId = Number(req.user.id);
    const requesterId = Number(req.body.requesterId);
  await pool.query('UPDATE friend_requests SET status = "declined" WHERE requester_id = ? AND receiver_id = ?', [requesterId, userId]);
  // Notificar solicitante
  req.app.get('io')?.to(`user:${requesterId}`).emit('friend:declined', { byUserId: userId });
  return res.json({ message: 'Pedido recusado' });
  }
);

// Remover amigo
router.delete('/:friendId', ensureAuth, async (req, res) => {
  const userId = Number(req.user.id);
  const friendId = Number(req.params.friendId);
  await pool.query('DELETE FROM friendships WHERE user_min = LEAST(?, ?) AND user_max = GREATEST(?, ?)', [userId, friendId, userId, friendId]);
  return res.status(204).send();
});

// Listar amigos do usuário atual
router.get('/', ensureAuth, async (req, res) => {
  const userId = Number(req.user.id);
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.nickname, u.email
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN ? = f.user_id THEN f.friend_id ELSE f.user_id END
     WHERE ? IN (f.user_id, f.friend_id)
     ORDER BY u.name ASC`,
    [userId, userId]
  );
  return res.json(rows);
});

// Listar pedidos recebidos pendentes
router.get('/requests', ensureAuth, async (req, res) => {
  const userId = Number(req.user.id);
  const [rows] = await pool.query(
    `SELECT fr.requester_id AS fromUserId, u.name, u.nickname, fr.created_at
     FROM friend_requests fr
     JOIN users u ON u.id = fr.requester_id
     WHERE fr.receiver_id = ? AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [userId]
  );
  return res.json(rows);
});

export default router;
