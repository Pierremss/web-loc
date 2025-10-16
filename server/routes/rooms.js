import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ensureAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

function badRequestIfAny(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
}

// List rooms for current user (or all if admin)
router.get('/', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const [rows] = await pool.query('SELECT r.*, u.nickname AS owner_nickname FROM rooms r JOIN users u ON u.id = r.owner_id WHERE r.owner_id = ? ORDER BY r.created_at DESC', [me]);
  res.json(rows);
});

// Create room
router.post('/', ensureAuth, body('name').isString().isLength({ min: 1, max: 200 }), body('link').optional().isString().isLength({ max: 500 }), body('description').optional().isString().isLength({ max: 2000 }), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) return err;
  const me = Number(req.user.id);
  const { name, link = null, description = null } = req.body;
  const [r] = await pool.query('INSERT INTO rooms (owner_id, name, link, description) VALUES (?, ?, ?, ?)', [me, name, link, description]);
  const [rows] = await pool.query('SELECT * FROM rooms WHERE id = ?', [r.insertId]);
  res.status(201).json(rows[0]);
});

// Get single room
router.get('/:id', ensureAuth, param('id').isInt({ min: 1 }), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) return err;
  const [[row]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [Number(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

// Update room (owner only)
router.put('/:id', ensureAuth, param('id').isInt({ min: 1 }), body('name').optional().isString().isLength({ min: 1, max: 200 }), body('link').optional().isString().isLength({ max: 500 }), body('description').optional().isString().isLength({ max: 2000 }), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) return err;
  const me = Number(req.user.id);
  const id = Number(req.params.id);
  const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (room.owner_id !== me) return res.status(403).json({ error: 'not_owner' });
  const { name = room.name, link = room.link, description = room.description } = req.body;
  await pool.query('UPDATE rooms SET name = ?, link = ?, description = ? WHERE id = ?', [name, link, description, id]);
  const [[updated]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
  res.json(updated);
});

// Delete room (owner only)
router.delete('/:id', ensureAuth, param('id').isInt({ min: 1 }), async (req, res) => {
  const me = Number(req.user.id);
  const id = Number(req.params.id);
  const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (room.owner_id !== me) return res.status(403).json({ error: 'not_owner' });
  await pool.query('DELETE FROM rooms WHERE id = ?', [id]);
  res.json({ ok: true });
});

// Share room to a conversation: this will create a message in conversation with a JSON payload
router.post('/:id/share', ensureAuth, param('id').isInt({ min: 1 }), body('conversation_id').isInt({ min: 1 }), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) return err;
  const me = Number(req.user.id);
  const id = Number(req.params.id);
  const convId = Number(req.body.conversation_id);
  const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
  if (!room) return res.status(404).json({ error: 'not_found' });
  // check membership in conversation
  const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, me]);
  if (!mem.length) return res.status(403).json({ error: 'not_member' });
  // create message with special payload
  const content = JSON.stringify({ type: 'room', room_id: room.id, name: room.name, link: room.link });
  const [r] = await pool.query('INSERT INTO conversation_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [convId, me, content]);
  const [[msg]] = await pool.query('SELECT * FROM conversation_messages WHERE id = ?', [r.insertId]);
  req.app.get('io')?.to(`conv:${convId}`).emit('conv:message:new', msg);
  res.status(201).json(msg);
});

export default router;
