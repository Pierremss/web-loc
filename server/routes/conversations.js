import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ensureAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

// Helper to handle validation errors
function badRequestIfAny(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
}

// List user's conversations
router.get('/', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const [rows] = await pool.query(
    `SELECT c.*,
            (SELECT content FROM conversation_messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
            (SELECT COUNT(*) FROM conversation_messages cm WHERE cm.conversation_id = c.id AND cm.created_at > IFNULL((SELECT m2.created_at FROM conversation_messages m2 WHERE m2.id = cmem.last_read_message_id), '1970-01-01')) AS unread_count
     FROM conversation_members cmem
     JOIN conversations c ON c.id = cmem.conversation_id
     WHERE cmem.user_id = ?
     ORDER BY c.updated_at DESC`,
    [me]
  );
  res.json(rows);
});

// Create a conversation
router.post(
  '/',
  ensureAuth,
  body('name').optional().isString().isLength({ min: 1, max: 160 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('is_public').optional().isBoolean(),
  body('members').optional().isArray(),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const { name = null, description = null, is_public = false, members = [] } = req.body || {};
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query(
        'INSERT INTO conversations (name, description, owner_id, is_public) VALUES (?, ?, ?, ?)',
        [name, description, me, is_public ? 1 : 0]
      );
      const convId = r.insertId;
      // Add creator as owner
      await conn.query(
        'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
        [convId, me, 'owner']
      );
      // Add provided members (avoid duplicates and self)
      const unique = [...new Set(members.map(Number).filter((id) => id && id !== me))];
      if (unique.length) {
        const values = unique.map((uid) => [convId, uid, 'member']);
        await conn.query(
          'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES ?',[values]
        );
      }
      await conn.commit();
      const [conv] = await pool.query('SELECT * FROM conversations WHERE id = ?', [convId]);
      res.status(201).json(conv[0]);
    } catch (e) {
      await conn.rollback();
      res.status(500).json({ error: 'create_failed', details: e.message });
    } finally {
      conn.release();
    }
  }
);

// Get conversation messages (paginated)
router.get(
  '/:id/messages',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('before').optional().isISO8601(),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const before = req.query.before ? new Date(req.query.before) : null;

    // ensure membership
    const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, me]);
    if (!mem.length) return res.status(403).json({ error: 'not_member' });

    const params = [convId];
    let sql = 'SELECT * FROM conversation_messages WHERE conversation_id = ?';
    if (before) { sql += ' AND created_at < ?'; params.push(before); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    const [rows] = await pool.query(sql, params);
    res.json(rows.reverse());
  }
);

// Send message (HTTP fallback; realtime path is in socket handler)
router.post(
  '/:id/messages',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  body('content').isString().isLength({ min: 1, max: 4000 }),
  body('reply_to_id').optional().isInt({ min: 1 }),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const { content, reply_to_id = null } = req.body;

    const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, me]);
    if (!mem.length) return res.status(403).json({ error: 'not_member' });

    const [r] = await pool.query(
      'INSERT INTO conversation_messages (conversation_id, sender_id, content, reply_to_id) VALUES (?, ?, ?, ?)',
      [convId, me, content, reply_to_id]
    );
    const [rows] = await pool.query('SELECT * FROM conversation_messages WHERE id = ?', [r.insertId]);
    req.app.get('io')?.to(`conv:${convId}`).emit('conv:message:new', rows[0]);
    res.status(201).json(rows[0]);
  }
);

// Join/leave (for public or by invite)
router.post('/:id/join', ensureAuth, param('id').isInt({ min: 1 }), async (req, res) => {
  const me = Number(req.user.id);
  const convId = Number(req.params.id);
  const [[conv]] = await pool.query('SELECT * FROM conversations WHERE id = ?', [convId]);
  if (!conv) return res.status(404).json({ error: 'not_found' });
  if (!conv.is_public) return res.status(403).json({ error: 'not_public' });
  await pool.query('INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convId, me]);
  res.json({ ok: true });
});

router.post('/:id/leave', ensureAuth, param('id').isInt({ min: 1 }), async (req, res) => {
  const me = Number(req.user.id);
  const convId = Number(req.params.id);
  await pool.query('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [convId, me]);
  res.json({ ok: true });
});

// Update last read marker
router.post(
  '/:id/read',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  body('last_read_message_id').isInt({ min: 1 }),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const lastId = Number(req.body.last_read_message_id);
    const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, me]);
    if (!mem.length) return res.status(403).json({ error: 'not_member' });
    await pool.query('UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?', [lastId, convId, me]);
    req.app.get('io')?.to(`conv:${convId}`).emit('conv:read', { userId: me, last_read_message_id: lastId });
    res.json({ ok: true });
  }
);

export default router;
