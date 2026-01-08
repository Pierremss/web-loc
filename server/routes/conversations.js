import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { ensureAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

let conversationAvatarColumnAvailable = true;

async function insertConversationRow(conn, { name, description, ownerId, isPublic, avatarUrl }) {
  const columns = conversationAvatarColumnAvailable
    ? 'name, description, owner_id, is_public, avatar_url'
    : 'name, description, owner_id, is_public';
  const placeholders = conversationAvatarColumnAvailable ? '?, ?, ?, ?, ?' : '?, ?, ?, ?';
  const values = conversationAvatarColumnAvailable
    ? [name, description, ownerId, isPublic, avatarUrl]
    : [name, description, ownerId, isPublic];
  try {
    const [result] = await conn.query(`INSERT INTO conversations (${columns}) VALUES (${placeholders})`, values);
    return result;
  } catch (err) {
    if (
      conversationAvatarColumnAvailable &&
      err?.code === 'ER_BAD_FIELD_ERROR' &&
      /avatar_url/i.test(err?.message || '')
    ) {
      conversationAvatarColumnAvailable = false;
      return insertConversationRow(conn, { name, description, ownerId, isPublic, avatarUrl: null });
    }
    throw err;
  }
}

const conversationUploadsDir = path.resolve(process.cwd(), 'uploads', 'conversations');
if (!fs.existsSync(conversationUploadsDir)) fs.mkdirSync(conversationUploadsDir, { recursive: true });

const conversationAvatarMaxMb = Number(process.env.CONVERSATION_AVATAR_MAX_MB || 10);
const conversationAvatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, conversationUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `conversation_${randomUUID().replace(/-/g, '')}${ext}`);
  }
});

const conversationAvatarUpload = multer({
  storage: conversationAvatarStorage,
  limits: { fileSize: conversationAvatarMaxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//i.test(file?.mimetype || '')) {
      return cb(new Error('Tipo de imagem inválido'));
    }
    cb(null, true);
  }
});

// Helper to handle validation errors
function badRequestIfAny(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
}

function optionalConversationAvatar(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) return next();
  conversationAvatarUpload.single('avatar')(req, res, (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Avatar excede ${conversationAvatarMaxMb}MB` });
      }
      return res.status(400).json({ error: uploadErr.message });
    }
    next();
  });
}

async function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[conversations] Falha ao remover upload descartado', file.path, err?.message);
    }
  }
}

function normalizeArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    return Object.values(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

async function getConversationAndMyRole(convId, me) {
  const [[conversation]] = await pool.query('SELECT * FROM conversations WHERE id = ?', [convId]);
  if (!conversation) return { conversation: null, myRole: null };
  const [[membership]] = await pool.query(
    'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [convId, me]
  );
  return { conversation, myRole: membership?.role ?? null };
}

function canManageConversation(conversation, me, myRole) {
  if (!conversation) return false;
  if (Number(conversation.owner_id) === Number(me)) return true;
  return myRole === 'admin' || myRole === 'owner';
}

async function deleteConversationAvatarIfExists(url) {
  if (!url) return;
  const normalized = String(url);
  if (!normalized.startsWith('/uploads/conversations/')) return;
  const targetPath = path.resolve(process.cwd(), normalized.replace(/^\/+/, ''));
  try {
    await fs.promises.unlink(targetPath);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[conversations] Não foi possível remover avatar antigo', normalized, err?.message);
    }
  }
}

// List user's conversations
router.get('/', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const [rows] = await pool.query(
    `SELECT c.*,
            (SELECT content
               FROM conversation_messages cm
              WHERE cm.conversation_id = c.id
                AND cm.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM conversation_message_deletions cmd
                   WHERE cmd.user_id = cmem.user_id AND cmd.message_id = cm.id
                )
              ORDER BY cm.created_at DESC
              LIMIT 1) AS last_message,
            (SELECT sender_id
               FROM conversation_messages cm
              WHERE cm.conversation_id = c.id
                AND cm.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM conversation_message_deletions cmd
                   WHERE cmd.user_id = cmem.user_id AND cmd.message_id = cm.id
                )
              ORDER BY cm.created_at DESC
              LIMIT 1) AS last_sender_id,
            (SELECT created_at
               FROM conversation_messages cm
              WHERE cm.conversation_id = c.id
                AND cm.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM conversation_message_deletions cmd
                   WHERE cmd.user_id = cmem.user_id AND cmd.message_id = cm.id
                )
              ORDER BY cm.created_at DESC
              LIMIT 1) AS last_message_at,
            (SELECT COALESCE(u.nickname, u.name, u.email)
               FROM conversation_messages cm
               JOIN users u ON u.id = cm.sender_id
              WHERE cm.conversation_id = c.id
                AND cm.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM conversation_message_deletions cmd
                   WHERE cmd.user_id = cmem.user_id AND cmd.message_id = cm.id
                )
              ORDER BY cm.created_at DESC
              LIMIT 1) AS last_sender_name,
            (SELECT COUNT(*)
               FROM conversation_messages cm
              WHERE cm.conversation_id = c.id
                AND cm.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM conversation_message_deletions cmd
                   WHERE cmd.user_id = cmem.user_id AND cmd.message_id = cm.id
                )
                AND cm.created_at > IFNULL((SELECT m2.created_at FROM conversation_messages m2 WHERE m2.id = cmem.last_read_message_id), '1970-01-01')) AS unread_count
     FROM conversation_members cmem
     JOIN conversations c ON c.id = cmem.conversation_id
     WHERE cmem.user_id = ?
     ORDER BY c.updated_at DESC`,
    [me]
  );
  res.json(rows);
});

// Delete a conversation message (soft delete; author-only)
router.delete(
  '/:id/messages/:messageId',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  param('messageId').isInt({ min: 1 }),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const messageId = Number(req.params.messageId);

    const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, me]);
    if (!mem.length) return res.status(403).json({ error: 'not_member' });

    const [[msg]] = await pool.query(
      'SELECT id, conversation_id, sender_id, deleted_at FROM conversation_messages WHERE id = ? AND conversation_id = ? LIMIT 1',
      [messageId, convId]
    );
    if (!msg) return res.status(404).json({ error: 'not_found' });
    if (msg.deleted_at) return res.json({ ok: true });
    if (Number(msg.sender_id) !== me) return res.status(403).json({ error: 'forbidden' });

    await pool.query('UPDATE conversation_messages SET deleted_at = NOW(), content = "" WHERE id = ? AND conversation_id = ?', [messageId, convId]);

    const io = req.app.get('io');
    io?.to(`conv:${convId}`).emit('conv:message:deleted', { id: messageId, conversationId: convId });
    res.json({ ok: true });
  }
);

// Create a conversation
router.post(
  '/',
  ensureAuth,
  optionalConversationAvatar,
  body('name').optional().isString().isLength({ min: 1, max: 160 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('is_public').optional().isBoolean(),
  body('members').optional().customSanitizer(normalizeArrayField).isArray(),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) {
      await removeUploadedFile(req.file);
      return err;
    }
    const me = Number(req.user.id);
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const name = rawName.length ? rawName : null;
    const rawDescription = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const description = rawDescription.length ? rawDescription : null;
    const is_public = req.body?.is_public === true || req.body?.is_public === 'true' || req.body?.is_public === 1 || req.body?.is_public === '1';
    const rawMembers = Array.isArray(req.body?.members) ? req.body.members : [];
    const members = rawMembers.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    const uniqueInvitees = [...new Set(members.filter((id) => id && id !== me))];

    if (!uniqueInvitees.length) {
      await removeUploadedFile(req.file);
      return res.status(400).json({
        error: 'members_required',
        message: 'Para criar uma sala, convide pelo menos 1 amigo para participar.'
      });
    }
    const avatarUrl = req.file ? `/uploads/conversations/${req.file.filename}`.replace(/\\/g, '/') : null;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const r = await insertConversationRow(conn, {
        name,
        description,
        ownerId: me,
        isPublic: is_public ? 1 : 0,
        avatarUrl
      });
      const convId = r.insertId;
      await conn.query(
        'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
        [convId, me, 'member']
      ); // manter compatibilidade mesmo sem enum 'owner'
      for (const uid of uniqueInvitees) {
        await conn.query(
          'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
          [convId, uid, 'member']
        );
      }
      await conn.commit();
      const [conv] = await pool.query('SELECT * FROM conversations WHERE id = ?', [convId]);
      res.status(201).json(conv[0]);
    } catch (e) {
      await conn.rollback();
      await removeUploadedFile(req.file);
      res.status(500).json({ error: 'create_failed', details: e.message });
    } finally {
      conn.release();
    }
  }
);

// Conversation details (with members)
router.get(
  '/:id',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const [[conversation]] = await pool.query('SELECT * FROM conversations WHERE id = ?', [convId]);
    if (!conversation) {
      return res.status(404).json({ error: 'not_found' });
    }
    const [membership] = await pool.query(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [convId, me]
    );
    if (!membership.length) {
      return res.status(403).json({ error: 'not_member' });
    }
    const [members] = await pool.query(
      `SELECT cm.user_id, cm.role, cm.joined_at, u.name, u.nickname, u.email, u.avatar_url
         FROM conversation_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ?
        ORDER BY CASE
          WHEN cm.role = 'owner' THEN 0
          WHEN cm.role = 'admin' THEN 1
          ELSE 2
        END, u.nickname IS NULL, u.nickname, u.name`,
      [convId]
    );
    res.json({ ...conversation, members });
  }
);

// Update conversation (owner/admin)
router.put(
  '/:id',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  body('name').optional().isString().isLength({ min: 1, max: 160 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('is_public').optional().isBoolean(),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;

    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const { conversation, myRole } = await getConversationAndMyRole(convId, me);
    if (!conversation) return res.status(404).json({ error: 'not_found' });

    if (!myRole) return res.status(403).json({ error: 'not_member' });
    if (!canManageConversation(conversation, me, myRole)) {
      return res.status(403).json({ error: 'not_allowed' });
    }

    const nextName = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
    const nextDescription = typeof req.body?.description === 'string' ? req.body.description.trim() : undefined;
    const nextIsPublic = req.body?.is_public;

    const name = nextName !== undefined ? nextName : conversation.name;
    const description =
      nextDescription !== undefined
        ? (nextDescription.length ? nextDescription : null)
        : conversation.description;

    const is_public =
      nextIsPublic === undefined
        ? conversation.is_public
        : nextIsPublic === true || nextIsPublic === 'true' || nextIsPublic === 1 || nextIsPublic === '1'
          ? 1
          : 0;

    await pool.query(
      'UPDATE conversations SET name = ?, description = ?, is_public = ?, updated_at = NOW() WHERE id = ?',
      [name, description, is_public, convId]
    );

    const [[updated]] = await pool.query('SELECT * FROM conversations WHERE id = ?', [convId]);
    res.json(updated);
  }
);

// Update conversation avatar (owner/admin)
router.post(
  '/:id/avatar',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  (req, res, next) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    conversationAvatarUpload.single('avatar')(req, res, (uploadErr) => {
      if (uploadErr) {
        if (uploadErr.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `Avatar excede ${conversationAvatarMaxMb}MB` });
        }
        return res.status(400).json({ error: uploadErr.message });
      }
      next();
    });
  },
  async (req, res) => {
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const { conversation, myRole } = await getConversationAndMyRole(convId, me);
    if (!conversation) return res.status(404).json({ error: 'not_found' });
    if (!myRole) {
      await removeUploadedFile(req.file);
      return res.status(403).json({ error: 'not_member' });
    }
    if (!canManageConversation(conversation, me, myRole)) {
      await removeUploadedFile(req.file);
      return res.status(403).json({ error: 'not_allowed' });
    }
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const avatarUrl = `/uploads/conversations/${req.file.filename}`.replace(/\\/g, '/');
    if (conversationAvatarColumnAvailable) {
      await deleteConversationAvatarIfExists(conversation.avatar_url);
      await pool.query('UPDATE conversations SET avatar_url = ?, updated_at = NOW() WHERE id = ?', [avatarUrl, convId]);
      return res.json({ avatar_url: avatarUrl });
    }

    await removeUploadedFile(req.file);
    return res.status(400).json({ error: 'avatar_not_supported' });
  }
);

// List members (member-only)
router.get(
  '/:id/members',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const { conversation, myRole } = await getConversationAndMyRole(convId, me);
    if (!conversation) return res.status(404).json({ error: 'not_found' });
    if (!myRole) return res.status(403).json({ error: 'not_member' });
    const [members] = await pool.query(
      `SELECT cm.user_id, cm.role, cm.joined_at, u.name, u.nickname, u.email, u.avatar_url
         FROM conversation_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ?
        ORDER BY CASE
          WHEN cm.role = 'owner' THEN 0
          WHEN cm.role = 'admin' THEN 1
          ELSE 2
        END, u.nickname IS NULL, u.nickname, u.name`,
      [convId]
    );
    res.json(members);
  }
);

// Add member by email (owner/admin)
router.post(
  '/:id/members',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  body('email').isEmail(),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const email = String(req.body.email ?? '').trim().toLowerCase();

    const { conversation, myRole } = await getConversationAndMyRole(convId, me);
    if (!conversation) return res.status(404).json({ error: 'not_found' });
    if (!myRole) return res.status(403).json({ error: 'not_member' });
    if (!canManageConversation(conversation, me, myRole)) {
      return res.status(403).json({ error: 'not_allowed' });
    }

    const [[user]] = await pool.query('SELECT id, name, nickname, email, avatar_url FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const [[existing]] = await pool.query(
      'SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [convId, user.id]
    );
    const wasMember = !!existing;

    const role = Number(user.id) === Number(conversation.owner_id) ? 'owner' : 'member';
    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
      [convId, user.id, role]
    );
    const [[member]] = await pool.query(
      `SELECT cm.user_id, cm.role, cm.joined_at, u.name, u.nickname, u.email, u.avatar_url
         FROM conversation_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ? AND cm.user_id = ?
        LIMIT 1`,
      [convId, user.id]
    );

    req.app.get('io')?.to(`conv:${convId}`).emit('conv:members:changed', { conversationId: convId });

    // Notifica o usuário que acabou de ser adicionado (realtime)
    if (!wasMember) {
      req.app.get('io')?.to(`user:${user.id}`).emit('conv:member:added', {
        conversationId: convId,
        addedByUserId: me,
      });
    }
    res.status(201).json(member);
  }
);

// Remove member (owner/admin)
router.delete(
  '/:id/members/:userId',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  param('userId').isInt({ min: 1 }),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;

    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const memberId = Number(req.params.userId);
    const { conversation, myRole } = await getConversationAndMyRole(convId, me);

    if (!conversation) return res.status(404).json({ error: 'not_found' });
    if (!myRole) return res.status(403).json({ error: 'not_member' });
    if (!canManageConversation(conversation, me, myRole)) {
      return res.status(403).json({ error: 'not_allowed' });
    }
    if (Number(conversation.owner_id) === Number(memberId)) {
      return res.status(400).json({ error: 'cannot_remove_owner' });
    }

    await pool.query('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [convId, memberId]);
    req.app.get('io')?.to(`conv:${convId}`).emit('conv:members:changed', { conversationId: convId });
    res.json({ ok: true });
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

        const params = [me, convId];
    let sql = `SELECT cm.*, 
                      COALESCE(u.nickname, u.name, u.email) AS sender_name,
                      u.avatar_url AS sender_avatar
                 FROM conversation_messages cm
                 JOIN users u ON u.id = cm.sender_id
         LEFT JOIN conversation_message_deletions cmd ON cmd.message_id = cm.id AND cmd.user_id = ?
           WHERE cm.conversation_id = ?
             AND cmd.message_id IS NULL`;
        if (before) { sql += ' AND created_at < ?'; params.push(before); }
    sql += ' ORDER BY cm.created_at DESC LIMIT ?';
    params.push(limit);
    const [rows] = await pool.query(sql, params);
    const [readStates] = await pool.query(
      `SELECT cm.user_id,
              cm.last_read_message_id,
              COALESCE(u.nickname, u.name, u.email) AS display_name,
              u.avatar_url
         FROM conversation_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ?
        ORDER BY cm.last_read_message_id IS NULL, cm.last_read_message_id DESC`,
      [convId]
    );
    const decorated = rows.map((msg) => {
      const msgId = Number(msg?.id);
      if (!Number.isFinite(msgId)) {
        return { ...msg, read_by: [] };
      }
      const senderId = Number(msg.sender_id);
      const readBy = readStates
        .filter((reader) => {
          const lastRead = Number(reader?.last_read_message_id);
          const readerId = Number(reader?.user_id);
          if (!Number.isFinite(lastRead)) return false;
          if (!Number.isFinite(readerId)) return false;
          if (readerId === senderId) return false;
          return lastRead >= msgId;
        })
        .map((reader) => ({
          user_id: Number(reader.user_id),
          name: reader.display_name,
          avatar_url: reader.avatar_url,
        }));
      return { ...msg, read_by: readBy };
    });
    res.json(decorated.reverse());
  }
);

// Apagar mensagem de sala apenas para mim (oculta para o usuário atual)
router.post(
  '/:id/messages/:messageId/hide',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  param('messageId').isInt({ min: 1 }),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;
    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const messageId = Number(req.params.messageId);

    const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, me]);
    if (!mem.length) return res.status(403).json({ error: 'not_member' });

    const [[msg]] = await pool.query(
      'SELECT id FROM conversation_messages WHERE id = ? AND conversation_id = ? LIMIT 1',
      [messageId, convId]
    );
    if (!msg) return res.status(404).json({ error: 'not_found' });

    await pool.query(
      `INSERT IGNORE INTO conversation_message_deletions (user_id, message_id, deleted_at)
       VALUES (?, ?, NOW())`,
      [me, messageId]
    );

    // Sincroniza entre dispositivos do mesmo usuário
    req.app.get('io')?.to(`user:${me}`).emit('conv:message:hidden', { id: messageId, conversationId: convId });
    return res.json({ ok: true });
  }
);

// Padronizado: apagar mensagem de sala (scope: me|all)
router.post(
  '/:id/messages/:messageId/delete',
  ensureAuth,
  param('id').isInt({ min: 1 }),
  param('messageId').isInt({ min: 1 }),
  body('scope').optional().isIn(['me', 'all']),
  async (req, res) => {
    const err = badRequestIfAny(req, res);
    if (err) return err;

    const me = Number(req.user.id);
    const convId = Number(req.params.id);
    const messageId = Number(req.params.messageId);
    const scope = String(req.body.scope || 'all');

    const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, me]);
    if (!mem.length) return res.status(403).json({ error: 'not_member' });

    const [[msg]] = await pool.query(
      'SELECT id, sender_id, deleted_at FROM conversation_messages WHERE id = ? AND conversation_id = ? LIMIT 1',
      [messageId, convId]
    );
    if (!msg) return res.status(404).json({ error: 'not_found' });

    // scope: me -> ocultar para o usuário atual
    if (scope === 'me') {
      await pool.query(
        `INSERT IGNORE INTO conversation_message_deletions (user_id, message_id, deleted_at)
         VALUES (?, ?, NOW())`,
        [me, messageId]
      );
      req.app.get('io')?.to(`user:${me}`).emit('conv:message:hidden', { id: messageId, conversationId: convId });
      return res.json({ ok: true, scope: 'me' });
    }

    // scope: all (padrão) -> apagar para todos (apenas autor)
    if (Number(msg.sender_id) !== me) return res.status(403).json({ error: 'forbidden' });
    if (!msg.deleted_at) {
      await pool.query('UPDATE conversation_messages SET deleted_at = NOW() WHERE id = ? AND conversation_id = ?', [messageId, convId]);
    }
    req.app.get('io')?.to(`conv:${convId}`).emit('conv:message:deleted', { id: messageId, conversationId: convId });
    return res.json({ ok: true, scope: 'all' });
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
    const [[message]] = await pool.query(
      `SELECT cm.*, COALESCE(u.nickname, u.name, u.email) AS sender_name, u.avatar_url AS sender_avatar
         FROM conversation_messages cm
         JOIN users u ON u.id = cm.sender_id
        WHERE cm.id = ?`,
      [r.insertId]
    );
    message.read_by = [];
    const io = req.app.get('io');
    io?.to(`conv:${convId}`).emit('conv:message:new', message);

    // Notificação (inbox) para membros mesmo fora da sala.
    // Mantém o mesmo comportamento do fluxo realtime (socket handler).
    try {
      const [members] = await pool.query('SELECT user_id FROM conversation_members WHERE conversation_id = ?', [convId]);
      for (const m of members) {
        const uid = Number(m.user_id);
        if (!Number.isFinite(uid) || uid === me) continue;
        io?.to(`user:${uid}`).emit('conv:message:notify', message);
      }
    } catch {
      // falha silenciosa: a mensagem já foi enviada ao grupo
    }
    res.status(201).json(message);
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

router.delete('/:id', ensureAuth, param('id').isInt({ min: 1 }), async (req, res) => {
  const err = badRequestIfAny(req, res);
  if (err) return err;
  const me = Number(req.user.id);
  const convId = Number(req.params.id);
  const [[conv]] = await pool.query('SELECT id, owner_id FROM conversations WHERE id = ?', [convId]);
  if (!conv) {
    return res.status(404).json({ error: 'not_found' });
  }
  if (Number(conv.owner_id) !== me) {
    return res.status(403).json({ error: 'not_owner' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM conversation_messages WHERE conversation_id = ?', [convId]);
    await conn.query('DELETE FROM conversation_members WHERE conversation_id = ?', [convId]);
    await conn.query('DELETE FROM conversations WHERE id = ?', [convId]);
    await conn.commit();
    req.app.get('io')?.to(`conv:${convId}`).emit('conv:deleted', { conversationId: convId });
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: 'delete_failed', details: error.message });
  } finally {
    conn.release();
  }
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
    req.app.get('io')?.to(`conv:${convId}`).emit('conv:read', { conversationId: convId, userId: me, last_read_message_id: lastId });
    res.json({ ok: true });
  }
);

export default router;
