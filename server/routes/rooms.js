import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { ensureAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

const roomUploadsDir = path.resolve(process.cwd(), 'uploads', 'rooms');
if (!fs.existsSync(roomUploadsDir)) fs.mkdirSync(roomUploadsDir, { recursive: true });

const roomAvatarMaxMb = Number(process.env.ROOM_AVATAR_MAX_MB || 10);
const roomAvatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, roomUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `room_${randomUUID().replace(/-/g, '')}${ext}`);
  }
});

const roomAvatarUpload = multer({
  storage: roomAvatarStorage,
  limits: { fileSize: roomAvatarMaxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//i.test(file?.mimetype || '')) {
      return cb(new Error('Tipo de imagem inválido'));
    }
    cb(null, true);
  }
});

async function deleteRoomAvatarIfExists(url) {
  if (!url) return;
  const normalized = String(url);
  if (!normalized.startsWith('/uploads/rooms/')) return;
  const targetPath = path.resolve(process.cwd(), normalized.replace(/^\/+/, ''));
  try {
    await fs.promises.unlink(targetPath);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[rooms] Não foi possível remover avatar antigo', normalized, err?.message);
    }
  }
}

async function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[rooms] Falha ao remover upload descartado', file.path, err?.message);
    }
  }
}

function badRequestIfAny(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
}

function optionalRoomAvatar(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) return next();
  roomAvatarUpload.single('avatar')(req, res, (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Avatar excede ${roomAvatarMaxMb}MB` });
      }
      return res.status(400).json({ error: uploadErr.message });
    }
    next();
  });
}

// List rooms for current user (or all if admin)
router.get('/', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const [rows] = await pool.query(
    `SELECT r.*, u.nickname AS owner_nickname,
            (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS member_count
       FROM rooms r
       JOIN users u ON u.id = r.owner_id
      WHERE r.owner_id = ?
      ORDER BY r.created_at DESC`,
    [me]
  );
  res.json(rows);
});

// Create room
router.post('/', ensureAuth, optionalRoomAvatar, body('name').isString().isLength({ min: 1, max: 200 }), body('link').optional().isString().isLength({ max: 500 }), body('description').optional().isString().isLength({ max: 2000 }), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) { await removeUploadedFile(req.file); return err; }
  const me = Number(req.user.id);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const link = typeof req.body?.link === 'string' ? req.body.link.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!name.length) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ error: 'Informe um nome para a sala' });
  }
  const normalizedLink = link.length ? link : null;
  const normalizedDescription = description.length ? description : null;
  const avatarUrl = req.file ? `/uploads/rooms/${req.file.filename}`.replace(/\\/g, '/') : null;
  try {
    const [r] = await pool.query('INSERT INTO rooms (owner_id, name, link, description, avatar_url) VALUES (?, ?, ?, ?, ?)', [me, name, normalizedLink, normalizedDescription, avatarUrl]);
    await pool.query('INSERT IGNORE INTO room_members (room_id, user_id, role, added_by) VALUES (?, ?, ?, ?)', [r.insertId, me, 'owner', me]);
    const [[row]] = await pool.query(
      `SELECT r.*, u.nickname AS owner_nickname,
              (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS member_count
         FROM rooms r
         JOIN users u ON u.id = r.owner_id
        WHERE r.id = ?
        LIMIT 1`,
      [r.insertId]
    );
    res.status(201).json(row);
  } catch (error) {
    await removeUploadedFile(req.file);
    console.error('[rooms] Falha ao criar sala', error);
    return res.status(500).json({ error: 'Erro ao criar sala' });
  }
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
  const [[updated]] = await pool.query(
    `SELECT r.*, u.nickname AS owner_nickname,
            (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS member_count
       FROM rooms r
       JOIN users u ON u.id = r.owner_id
      WHERE r.id = ?
      LIMIT 1`,
    [id]
  );
  res.json(updated);
});

router.post(
  '/:id/avatar',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  (req, res, next) => {
    const err = badRequestIfAny(req, res); if (err) return err;
    roomAvatarUpload.single('avatar')(req, res, (uploadErr) => {
      if (uploadErr) {
        if (uploadErr.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `Avatar excede ${roomAvatarMaxMb}MB` });
        }
        return res.status(400).json({ error: uploadErr.message });
      }
      next();
    });
  },
  async (req, res) => {
    const me = Number(req.user.id);
    const id = Number(req.params.id);
    const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
    if (!room) return res.status(404).json({ error: 'not_found' });
    if (room.owner_id !== me) return res.status(403).json({ error: 'not_owner' });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const avatarUrl = `/uploads/rooms/${req.file.filename}`.replace(/\\/g, '/');
    await deleteRoomAvatarIfExists(room.avatar_url);
    await pool.query('UPDATE rooms SET avatar_url = ?, updated_at = NOW() WHERE id = ?', [avatarUrl, id]);
    res.json({ avatar_url: avatarUrl });
  }
);

// Delete room (owner only)
router.delete('/:id', ensureAuth, param('id').isInt({ min: 1 }), async (req, res) => {
  const me = Number(req.user.id);
  const id = Number(req.params.id);
  const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (room.owner_id !== me) return res.status(403).json({ error: 'not_owner' });
  await deleteRoomAvatarIfExists(room.avatar_url);
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

router.get('/:id/members', ensureAuth, param('id').isInt({ min: 1 }), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) return err;
  const me = Number(req.user.id);
  const id = Number(req.params.id);
  const [[room]] = await pool.query('SELECT owner_id FROM rooms WHERE id = ?', [id]);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (room.owner_id !== me) return res.status(403).json({ error: 'not_owner' });
  const [members] = await pool.query(
    `SELECT rm.room_id, rm.user_id, rm.role, rm.created_at,
            u.nickname, u.email, u.avatar_url
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
      WHERE rm.room_id = ?
      ORDER BY CASE WHEN rm.user_id = ? THEN 0 ELSE 1 END, u.nickname ASC`,
    [id, room.owner_id]
  );
  res.json(members);
});

router.post('/:id/members', ensureAuth, param('id').isInt({ min: 1 }), body('email').isEmail(), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) return err;
  const me = Number(req.user.id);
  const id = Number(req.params.id);
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const [[room]] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (room.owner_id !== me) return res.status(403).json({ error: 'not_owner' });
  const [[user]] = await pool.query('SELECT id, nickname, email, avatar_url FROM users WHERE email = ?', [email]);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const role = user.id === room.owner_id ? 'owner' : 'member';
  await pool.query(
    'INSERT INTO room_members (room_id, user_id, role, added_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role), added_by = VALUES(added_by)',
    [id, user.id, role, me]
  );
  const [[member]] = await pool.query(
    `SELECT rm.room_id, rm.user_id, rm.role, rm.created_at,
            u.nickname, u.email, u.avatar_url
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
      WHERE rm.room_id = ? AND rm.user_id = ?
      LIMIT 1`,
    [id, user.id]
  );
  res.status(201).json(member);
});

router.delete('/:id/members/:userId', ensureAuth, param('id').isInt({ min: 1 }), param('userId').isInt({ min: 1 }), async (req, res) => {
  const err = badRequestIfAny(req, res); if (err) return err;
  const me = Number(req.user.id);
  const id = Number(req.params.id);
  const memberId = Number(req.params.userId);
  const [[room]] = await pool.query('SELECT owner_id FROM rooms WHERE id = ?', [id]);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (room.owner_id !== me) return res.status(403).json({ error: 'not_owner' });
  if (memberId === room.owner_id) return res.status(400).json({ error: 'cannot_remove_owner' });
  await pool.query('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [id, memberId]);
  res.json({ ok: true });
});

export default router;
