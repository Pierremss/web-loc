import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth } from '../middleware/auth.js';

const router = Router();

// Lista um "deck" de perfis ainda não vistos (sem like/pass do usuário)
router.get('/deck', ensureAuth, async (req, res) => {
  const userId = Number(req.user.id);
  const limit = Math.min(Number(req.query.limit || 20), 50);
  try {
  let [rows] = await pool.query(
      `SELECT u.id, u.name, u.nickname, u.platforms, u.game_style, u.avatar_url
       FROM users u
       LEFT JOIN friend_requests fr_self
         ON fr_self.requester_id = ? AND fr_self.receiver_id = u.id
       LEFT JOIN friendships f
         ON (f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?)
       LEFT JOIN user_blocks b1 ON b1.blocker_id = ? AND b1.blocked_id = u.id
       LEFT JOIN user_blocks b2 ON b2.blocker_id = u.id AND b2.blocked_id = ?
       WHERE u.id <> ?
         AND fr_self.receiver_id IS NULL
         AND f.id IS NULL
         AND b1.blocked_id IS NULL
         AND b2.blocker_id IS NULL
       ORDER BY u.created_at DESC
       LIMIT ?`,
      [userId, userId, userId, userId, userId, userId, limit]
    );
    // Enriquecer avatar_url para absoluta
    const base = `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
    rows = rows.map(r => {
      if (r?.avatar_url && !/^https?:/i.test(r.avatar_url)) {
        r.avatar_url = base + r.avatar_url;
      }
      return r;
    });
    return res.json({ items: rows });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao carregar deck', detail: e.message });
  }
});

// Dar like (equivale a criar/atualizar friend_request como pending).
// Se já houver pending do alvo para o usuário, vira match: aceita ambos e cria friendship.
router.post('/like', ensureAuth,
  body('toUserId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const fromId = Number(req.user.id);
    const toId = Number(req.body.toUserId);
    if (fromId === toId) return res.status(400).json({ error: 'Ação inválida' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Registrar meu like (pending)
      await conn.query(
        `INSERT INTO friend_requests (requester_id, receiver_id, status)
         VALUES (?, ?, 'pending')
         ON DUPLICATE KEY UPDATE status = 'pending'`,
        [fromId, toId]
      );

      // Verificar like recíproco
      const [[reciprocal]] = await conn.query(
        `SELECT id, status FROM friend_requests
         WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
         LIMIT 1`,
        [toId, fromId]
      );

      let matched = false;
      if (reciprocal) {
        // Aceitar ambos e criar amizade (par ordenado)
        await conn.query(
          `UPDATE friend_requests SET status = 'accepted'
           WHERE (requester_id = ? AND receiver_id = ? AND status = 'pending')
              OR (requester_id = ? AND receiver_id = ? AND status = 'pending')`,
          [fromId, toId, toId, fromId]
        );
        await conn.query(
          `INSERT IGNORE INTO friendships (user_id, friend_id)
           VALUES (LEAST(?, ?), GREATEST(?, ?))`,
          [fromId, toId, fromId, toId]
        );
        matched = true;
      }

      await conn.commit();

      const io = req.app.get('io');
      // Notificações em tempo real
      io?.to(`user:${toId}`).emit('friend:request', { fromUserId: fromId });
      if (matched) {
        io?.to(`user:${toId}`).emit('friend:accepted', { byUserId: fromId });
        io?.to(`user:${fromId}`).emit('friend:accepted', { byUserId: toId });
      }

      return res.status(201).json({ message: matched ? 'Match!' : 'Like enviado', matched });
    } catch (e) {
      await conn.rollback();
      return res.status(500).json({ error: 'Erro ao processar like', detail: e.message });
    } finally {
      conn.release();
    }
  }
);

// Passar (não mostrar novamente): marca como declined em friend_requests
router.post('/pass', ensureAuth,
  body('toUserId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const fromId = Number(req.user.id);
    const toId = Number(req.body.toUserId);
    if (fromId === toId) return res.status(400).json({ error: 'Ação inválida' });
    try {
      await pool.query(
        `INSERT INTO friend_requests (requester_id, receiver_id, status)
         VALUES (?, ?, 'declined')
         ON DUPLICATE KEY UPDATE status = 'declined'`,
        [fromId, toId]
      );
      return res.status(201).json({ message: 'Pass registrado' });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao registrar pass', detail: e.message });
    }
  }
);

export default router;
