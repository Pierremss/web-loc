import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth } from '../middleware/auth.js';

const router = Router();

// Listar conversa com um usuário específico
router.get('/conversation/:userId', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const other = Number(req.params.userId);
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const before = req.query.before ? new Date(req.query.before) : null;

  const params = [me, other, other, me];
  let sql = `SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`;
  if (before) { sql += ' AND created_at < ?'; params.push(before); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const [rows] = await pool.query(sql, params);
  return res.json(rows.reverse()); // mais antigo primeiro
});

// Enviar mensagem
router.post('/send', ensureAuth,
  body('toUserId').isInt({ min: 1 }),
  body('content').isString().isLength({ min: 1, max: 2000 }),
  body('replyToId').optional().isInt({ min: 1 }),
  body('reply_to_id').optional().isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const fromId = Number(req.user.id);
    const toId = Number(req.body.toUserId);
    const content = String(req.body.content);
    const replyToRaw = req.body.reply_to_id ?? req.body.replyToId ?? null;

    let replyToId = null;
    if (replyToRaw) {
      const candidateId = Number(replyToRaw);
      const [[replyMsg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [candidateId]);
      if (!replyMsg) return res.status(404).json({ error: 'reply_not_found' });
      const participants = [replyMsg.sender_id, replyMsg.receiver_id];
      if (!participants.includes(fromId) || !participants.includes(toId)) {
        return res.status(400).json({ error: 'reply_out_of_context' });
      }
      replyToId = candidateId;
    }

    // Opcional: validar que são amigos (não-direcional)
    const [friends] = await pool.query(
      'SELECT 1 FROM friendships WHERE user_min = LEAST(?, ?) AND user_max = GREATEST(?, ?) LIMIT 1',
      [fromId, toId, fromId, toId]
    );
    if (!friends.length) return res.status(403).json({ error: 'Usuários não são amigos' });

    const [result] = await pool.query('INSERT INTO messages (sender_id, receiver_id, content, reply_to_id) VALUES (?, ?, ?, ?)', [fromId, toId, content, replyToId]);
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);

    // Realtime: se socket estiver configurado, emita evento (será feito no módulo realtime)
    req.app.get('io')?.to(`user:${toId}`).emit('message:new', rows[0]);

    return res.status(201).json(rows[0]);
  }
);

// Marcar como lida
router.post('/read', ensureAuth,
  body('messageId').isInt({ min: 1 }),
  async (req, res) => {
    const userId = Number(req.user.id);
    const messageId = Number(req.body.messageId);
    const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.receiver_id !== userId) return res.status(403).json({ error: 'forbidden' });
    await pool.query('UPDATE messages SET read_at = NOW() WHERE id = ?', [messageId]);
    req.app.get('io')?.to(`user:${msg.sender_id}`).emit('message:read', { messageId, by: userId });
    res.json({ ok: true });
  }
);

// Editar mensagem (apenas autor)
router.post('/edit', ensureAuth,
  body('messageId').isInt({ min: 1 }),
  body('content').isString().isLength({ min: 1, max: 2000 }),
  async (req, res) => {
    const userId = Number(req.user.id);
    const { messageId, content } = req.body;
    const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.sender_id !== userId) return res.status(403).json({ error: 'forbidden' });
    await pool.query('UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ?', [content, messageId]);
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
    const peerRoom = `user:${msg.sender_id === userId ? msg.receiver_id : msg.sender_id}`;
    req.app.get('io')?.to(peerRoom).emit('message:edited', rows[0]);
    res.json(rows[0]);
  }
);

// Excluir (soft delete)
router.post('/delete', ensureAuth,
  body('messageId').isInt({ min: 1 }),
  async (req, res) => {
    const userId = Number(req.user.id);
    const { messageId } = req.body;
    const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.sender_id !== userId) return res.status(403).json({ error: 'forbidden' });
    await pool.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [messageId]);
    const peerRoom = `user:${msg.sender_id === userId ? msg.receiver_id : msg.sender_id}`;
    req.app.get('io')?.to(peerRoom).emit('message:deleted', { id: messageId });
    res.json({ ok: true });
  }
);

// RESTful alternativa: DELETE /messages/:id
router.delete('/:id', ensureAuth, async (req, res) => {
  const userId = Number(req.user.id);
  const messageId = Number(req.params.id);
  const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
  if (!msg) return res.status(404).json({ error: 'not_found' });
  if (msg.sender_id !== userId) return res.status(403).json({ error: 'forbidden' });
  await pool.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [messageId]);
  const peerRoom = `user:${msg.sender_id === userId ? msg.receiver_id : msg.sender_id}`;
  req.app.get('io')?.to(peerRoom).emit('message:deleted', { id: messageId });
  res.json({ ok: true });
});

// Reagir
router.post('/react', ensureAuth,
  body('messageId').isInt({ min: 1 }),
  body('emoji').isString().isLength({ min: 1, max: 32 }),
  async (req, res) => {
    const userId = Number(req.user.id);
    const { messageId, emoji } = req.body;
    const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'not_found' });
    // restringe a autor ou destinatário
    if (![msg.sender_id, msg.receiver_id].includes(userId)) return res.status(403).json({ error: 'forbidden' });
    await pool.query('INSERT IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [messageId, userId, emoji]);
    const peerRoom = `user:${msg.sender_id === userId ? msg.receiver_id : msg.sender_id}`;
    req.app.get('io')?.to(peerRoom).emit('message:reacted', { messageId, userId, emoji });
    res.json({ ok: true });
  }
);

// Bloquear usuário
router.post('/block', ensureAuth, body('blockedId').isInt({ min: 1 }), async (req, res) => {
  const blockerId = Number(req.user.id);
  const blockedId = Number(req.body.blockedId);
  if (blockerId === blockedId) return res.status(400).json({ error: 'invalid' });
  await pool.query('INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [blockerId, blockedId]);
  res.json({ ok: true });
});

router.post('/unblock', ensureAuth, body('blockedId').isInt({ min: 1 }), async (req, res) => {
  const blockerId = Number(req.user.id);
  const blockedId = Number(req.body.blockedId);
  await pool.query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
  res.json({ ok: true });
});

export default router;
