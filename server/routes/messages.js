import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { body, param, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

// Upload de evidências para denúncias (armazenamento local simples)
const reportUploadDir = path.resolve(process.cwd(), 'uploads', 'reports');
if (!fs.existsSync(reportUploadDir)) fs.mkdirSync(reportUploadDir, { recursive: true });

const reportStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, reportUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uid = req.user?.id ?? 'anon';
    cb(null, `rep_u${uid}_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
  }
});

const reportMaxMb = Number(process.env.REPORT_PHOTO_MAX_MB || 10); // padrão 10MB por arquivo
const reportUpload = multer({
  storage: reportStorage,
  limits: { fileSize: reportMaxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^(image\/jpeg|image\/png|image\/gif|image\/webp)$/i.test(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não suportado'));
    }
    cb(null, true);
  }
});

function reportUploadHandler(req, res, next) {
  // Só processa multipart; caso contrário segue como JSON tradicional
  if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) return next();

  reportUpload.array('photos', Number(process.env.REPORT_PHOTO_MAX_COUNT || 4))(req, res, function(err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Imagem excede limite de ${reportMaxMb}MB` });
      }
      return res.status(400).json({ error: err.message || 'Erro no upload' });
    }
    next();
  });
}

async function ensureModerationColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN banned_until DATETIME NULL`);
  } catch (err) {
    if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  try {
    await pool.query(`ALTER TABLE users ADD COLUMN disabled_until DATETIME NULL`);
  } catch (err) {
    if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

let ensuredAccountEventStructures;
async function ensureAccountEventStructures() {
  if (ensuredAccountEventStructures) return;
  ensuredAccountEventStructures = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_account_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        type VARCHAR(32) NOT NULL,
        message VARCHAR(500) NOT NULL,
        meta JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_uae_user (user_id),
        INDEX idx_uae_created (created_at)
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deleted_accounts (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_by INT NULL,
        reason VARCHAR(200) NULL,
        source VARCHAR(32) NOT NULL,
        INDEX idx_da_email (email),
        INDEX idx_da_deleted (deleted_at)
      ) ENGINE=InnoDB
    `);
  })();
  return ensuredAccountEventStructures;
}

function toSqlDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return null;
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function pickAutoAction(reportCount) {
  // Política simples (pode ser ajustada depois):
  // 1-2: registra
  // 3-4: ban 3 dias
  // 5-6: ban 14 dias
  // 7-9: disable 30 dias
  // 10+: exclusão automática
  const autoDeleteThreshold = Math.max(Number(process.env.REPORT_AUTO_DELETE_THRESHOLD || 10) || 10, 1);
  if (reportCount >= autoDeleteThreshold) return { kind: 'delete' };
  if (reportCount >= 7) return { kind: 'disable', days: 30 };
  if (reportCount >= 5) return { kind: 'ban', days: 14 };
  if (reportCount >= 3) return { kind: 'ban', days: 3 };
  return { kind: 'none' };
}

// Listar conversa com um usuário específico
router.get('/conversation/:userId', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const other = Number(req.params.userId);
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const before = req.query.before ? new Date(req.query.before) : null;

  const params = [me, me, other, other, me];
  let sql = `SELECT m.*
               FROM messages m
          LEFT JOIN message_deletions md ON md.message_id = m.id AND md.user_id = ?
              WHERE m.deleted_at IS NULL
                AND md.message_id IS NULL
                AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))`;
  if (before) { sql += ' AND m.created_at < ?'; params.push(before); }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);

  const [rows] = await pool.query(sql, params);
  return res.json(rows.reverse()); // mais antigo primeiro
});

// Limpar a conversa APENAS para o usuário atual (não apaga do outro lado)
router.post('/conversation/:userId/clear', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const other = Number(req.params.userId);
  if (!Number.isFinite(other) || other <= 0) return res.status(400).json({ error: 'invalid_user' });

  // Evita badge/notificação presa: se eu estou limpando, considero como lido tudo que recebi.
  await pool.query(
    `UPDATE messages
        SET read_at = NOW()
      WHERE deleted_at IS NULL
        AND sender_id = ?
        AND receiver_id = ?
        AND read_at IS NULL`,
    [other, me]
  );

  const [result] = await pool.query(
    `INSERT IGNORE INTO message_deletions (user_id, message_id, deleted_at)
     SELECT ?, m.id, NOW()
       FROM messages m
      WHERE m.deleted_at IS NULL
        AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))`,
    [me, me, other, other, me]
  );

  return res.json({ ok: true, cleared: result?.affectedRows ?? 0 });
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

    // Bloqueios
    const [blocks] = await pool.query(
      'SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1',
      [fromId, toId, toId, fromId]
    );
    if (blocks.length) return res.status(403).json({ error: 'blocked' });

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

// Marcar como lidas TODAS as mensagens recebidas de um usuário (DM)
// Resolve bug onde apenas a última mensagem era marcada como lida ao abrir o chat.
router.post(
  '/conversation/:userId/read',
  ensureAuth,
  param('userId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const me = Number(req.user.id);
    const other = Number(req.params.userId);
    if (!Number.isFinite(other) || other <= 0) return res.status(400).json({ error: 'invalid_user' });

    const [unread] = await pool.query(
      `SELECT id
         FROM messages
        WHERE deleted_at IS NULL
          AND sender_id = ?
          AND receiver_id = ?
          AND read_at IS NULL`,
      [other, me]
    );

    const ids = (unread || []).map((r) => Number(r.id)).filter((id) => Number.isFinite(id));
    if (!ids.length) return res.json({ ok: true, marked: 0 });

    await pool.query(
      `UPDATE messages
          SET read_at = NOW()
        WHERE deleted_at IS NULL
          AND sender_id = ?
          AND receiver_id = ?
          AND read_at IS NULL`,
      [other, me]
    );

    // Notifica o remetente para atualizar recibos de leitura.
    const io = req.app.get('io');
    for (const id of ids) {
      io?.to(`user:${other}`).emit('message:read', { messageId: id, by: me });
    }

    return res.json({ ok: true, marked: ids.length });
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
  body('scope').optional().isIn(['me', 'all']),
  async (req, res) => {
    const userId = Number(req.user.id);
    const { messageId } = req.body;
    const scope = String(req.body.scope || 'all');
    const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'not_found' });

    // scope: me -> oculta apenas para o usuário atual
    if (scope === 'me') {
      const participants = [Number(msg.sender_id), Number(msg.receiver_id)];
      if (!participants.includes(userId)) return res.status(403).json({ error: 'forbidden' });
      await pool.query(
        `INSERT IGNORE INTO message_deletions (user_id, message_id, deleted_at)
         VALUES (?, ?, NOW())`,
        [userId, messageId]
      );
      req.app.get('io')?.to(`user:${userId}`).emit('message:hidden', { id: messageId });
      return res.json({ ok: true, scope: 'me' });
    }

    // scope: all (padrão) -> apaga para todos (apenas autor)
    if (msg.sender_id !== userId) return res.status(403).json({ error: 'forbidden' });
    await pool.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [messageId]);
    const peerRoom = `user:${msg.sender_id === userId ? msg.receiver_id : msg.sender_id}`;
    req.app.get('io')?.to(peerRoom).emit('message:deleted', { id: messageId });
    return res.json({ ok: true, scope: 'all' });
  }
);

// Apagar apenas para mim (oculta a mensagem para o usuário atual)
router.post(
  '/hide',
  ensureAuth,
  body('messageId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const me = Number(req.user.id);
    const messageId = Number(req.body.messageId);

    const [[msg]] = await pool.query('SELECT id, sender_id, receiver_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!msg) return res.status(404).json({ error: 'not_found' });

    const participants = [Number(msg.sender_id), Number(msg.receiver_id)];
    if (!participants.includes(me)) return res.status(403).json({ error: 'forbidden' });

    await pool.query(
      `INSERT IGNORE INTO message_deletions (user_id, message_id, deleted_at)
       VALUES (?, ?, NOW())`,
      [me, messageId]
    );

    // Sincroniza entre múltiplos dispositivos do mesmo usuário
    req.app.get('io')?.to(`user:${me}`).emit('message:hidden', { id: messageId });
    return res.json({ ok: true });
  }
);

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
  // remover solicitações pendentes entre os dois
  await pool.query(
    'DELETE FROM friend_requests WHERE status = "pending" AND ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))',
    [blockerId, blockedId, blockedId, blockerId]
  );
  res.json({ ok: true });
});

router.post(
  '/unblock',
  ensureAuth,
  body('blockedId').isInt({ min: 1 }),
  body('restoreFriendship').optional().isBoolean(),
  async (req, res) => {
  const blockerId = Number(req.user.id);
  const blockedId = Number(req.body.blockedId);
  const restoreFriendship = req.body.restoreFriendship === undefined ? true : !!req.body.restoreFriendship;
  await pool.query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);

  if (restoreFriendship) {
    // Ao desbloquear via chat, o contato deve permanecer visível e continuar como amigo.
    // Para dados legados onde o bloqueio apagava a amizade, restauramos aqui.
    await pool.query(
      'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (LEAST(?, ?), GREATEST(?, ?))',
      [blockerId, blockedId, blockerId, blockedId]
    );
  }

  res.json({ ok: true });
});

// Status de bloqueio entre dois usuários
router.get('/block-status/:userId', ensureAuth, async (req, res) => {
  const me = Number(req.user.id);
  const other = Number(req.params.userId);
  const [[byMe]] = await pool.query('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1', [me, other]);
  const [[byOther]] = await pool.query('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1', [other, me]);
  res.json({ blockedByMe: !!byMe, blockedMe: !!byOther });
});

// Listar denúncias (admin)
router.get('/reports', ensureAuth, ensureAdmin, async (req, res) => {
  const rawLimit = req.query.limit;
  const parsedLimit = rawLimit === undefined ? null : Number(rawLimit);
  const limit = Number.isFinite(parsedLimit) ? Math.max(0, Math.min(parsedLimit, 5000)) : null;

  try {
    console.log('[messages/reports] v2 (sem JSON_ARRAYAGG)');
    // Garante tabela (para ambientes sem migração aplicada)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_reports (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        reporter_id INT NOT NULL,
        reported_id INT NOT NULL,
        context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
        reason VARCHAR(1000) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_reports_reporter (reporter_id),
        INDEX idx_user_reports_reported (reported_id)
      ) ENGINE=InnoDB
    `);

    // Histórico de denúncias (para não perder registros quando uma conta é excluída)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_reports_archive (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        original_report_id BIGINT UNSIGNED NULL,
        reporter_id INT NULL,
        reported_id INT NULL,
        context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
        reason VARCHAR(1000) NULL,
        created_at TIMESTAMP NULL,
        reporter_name VARCHAR(120) NULL,
        reporter_nickname VARCHAR(50) NULL,
        reporter_email VARCHAR(160) NULL,
        reported_name VARCHAR(120) NULL,
        reported_nickname VARCHAR(50) NULL,
        reported_email VARCHAR(160) NULL,
        action VARCHAR(32) NULL,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ura_reporter (reporter_id),
        INDEX idx_ura_reported (reported_id),
        INDEX idx_ura_created (created_at)
      ) ENGINE=InnoDB
    `);

    // Anexos de denúncias (evidências)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_report_attachments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        report_id BIGINT UNSIGNED NOT NULL,
        url VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes INT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ura_report (report_id)
      ) ENGINE=InnoDB
    `);

    const sql = `
      SELECT * FROM (
        SELECT
          ur.id AS id,
          ur.created_at,
          ur.context,
          ur.reason,
          reporter.id AS reporter_id,
          reporter.name AS reporter_name,
          reporter.nickname AS reporter_nickname,
          reporter.email AS reporter_email,
          reported.id AS reported_id,
          reported.name AS reported_name,
          reported.nickname AS reported_nickname,
          reported.email AS reported_email
        FROM user_reports ur
        LEFT JOIN users reporter ON reporter.id = ur.reporter_id
        LEFT JOIN users reported ON reported.id = ur.reported_id

        UNION ALL

        SELECT
          -ura.id AS id,
          ura.created_at,
          ura.context,
          ura.reason,
          ura.reporter_id,
          ura.reporter_name,
          ura.reporter_nickname,
          ura.reporter_email,
          ura.reported_id,
          ura.reported_name,
          ura.reported_nickname,
          ura.reported_email
        FROM user_reports_archive ura
      ) t
      ORDER BY t.created_at DESC
      ${limit && limit > 0 ? 'LIMIT ?' : ''}
    `;

    const params = [];
    if (limit && limit > 0) params.push(limit);

    const [rows] = await pool.query(sql, params);

    const reportIds = (rows || [])
      .map((r) => Number(r?.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    let attachmentsByReportId = new Map();
    if (reportIds.length) {
      const [attRows] = await pool.query(
        'SELECT report_id, url FROM user_report_attachments WHERE report_id IN (?) ORDER BY id ASC',
        [reportIds]
      );
      attachmentsByReportId = new Map();
      for (const a of attRows || []) {
        const rid = Number(a?.report_id);
        if (!Number.isFinite(rid) || rid <= 0) continue;
        const list = attachmentsByReportId.get(rid) || [];
        list.push({ url: a?.url });
        attachmentsByReportId.set(rid, list);
      }
    }

    const withAttachments = (rows || []).map((r) => {
      const rid = Number(r?.id);
      const attachments = Number.isFinite(rid) && rid > 0 ? (attachmentsByReportId.get(rid) || []) : [];
      return { ...r, attachments };
    });

    res.json(withAttachments);
  } catch (err) {
    console.error('[messages/reports] failed', err);
    res.status(500).json({ error: 'reports_failed' });
  }
});

// Apagar todas as denúncias (admin)
router.delete('/reports', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    // Garante tabela (para ambientes sem migração aplicada)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_reports (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        reporter_id INT NOT NULL,
        reported_id INT NOT NULL,
        context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
        reason VARCHAR(1000) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_reports_reporter (reporter_id),
        INDEX idx_user_reports_reported (reported_id)
      ) ENGINE=InnoDB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_reports_archive (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        original_report_id BIGINT UNSIGNED NULL,
        reporter_id INT NULL,
        reported_id INT NULL,
        context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
        reason VARCHAR(1000) NULL,
        created_at TIMESTAMP NULL,
        reporter_name VARCHAR(120) NULL,
        reporter_nickname VARCHAR(50) NULL,
        reporter_email VARCHAR(160) NULL,
        reported_name VARCHAR(120) NULL,
        reported_nickname VARCHAR(50) NULL,
        reported_email VARCHAR(160) NULL,
        action VARCHAR(32) NULL,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ura_reporter (reporter_id),
        INDEX idx_ura_reported (reported_id),
        INDEX idx_ura_created (created_at)
      ) ENGINE=InnoDB
    `);

    const [r1] = await pool.query('DELETE FROM user_reports');
    const [r2] = await pool.query('DELETE FROM user_reports_archive');
    const deleted = (r1?.affectedRows ?? 0) + (r2?.affectedRows ?? 0);
    res.json({ ok: true, deleted });
  } catch (err) {
    console.error('[messages/reports] delete failed', err);
    res.status(500).json({ error: 'reports_delete_failed' });
  }
});

// Apagar uma denúncia específica (admin)
// Observação: denúncias do histórico (archive) são expostas com id negativo.
router.delete(
  '/reports/:id',
  ensureAuth,
  ensureAdmin,
  param('id').isInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const rawId = Number(req.params.id);
    if (!Number.isInteger(rawId) || rawId === 0) {
      return res.status(400).json({ error: 'invalid_report_id' });
    }

    try {
      // Garante tabelas (para ambientes sem migração aplicada)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_reports (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          reporter_id INT NOT NULL,
          reported_id INT NOT NULL,
          context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
          reason VARCHAR(1000) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_reports_reporter (reporter_id),
          INDEX idx_user_reports_reported (reported_id)
        ) ENGINE=InnoDB
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_reports_archive (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          original_report_id BIGINT UNSIGNED NULL,
          reporter_id INT NULL,
          reported_id INT NULL,
          context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
          reason VARCHAR(1000) NULL,
          created_at TIMESTAMP NULL,
          reporter_name VARCHAR(120) NULL,
          reporter_nickname VARCHAR(50) NULL,
          reporter_email VARCHAR(160) NULL,
          reported_name VARCHAR(120) NULL,
          reported_nickname VARCHAR(50) NULL,
          reported_email VARCHAR(160) NULL,
          action VARCHAR(32) NULL,
          archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ura_reporter (reporter_id),
          INDEX idx_ura_reported (reported_id),
          INDEX idx_ura_created (created_at)
        ) ENGINE=InnoDB
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_report_attachments (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          report_id BIGINT UNSIGNED NOT NULL,
          url VARCHAR(500) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          size_bytes INT UNSIGNED NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ura_report (report_id)
        ) ENGINE=InnoDB
      `);

      // Histórico
      if (rawId < 0) {
        const archiveId = Math.abs(rawId);
        const [r] = await pool.query('DELETE FROM user_reports_archive WHERE id = ?', [archiveId]);
        const deleted = r?.affectedRows ?? 0;
        if (!deleted) return res.status(404).json({ error: 'report_not_found' });
        return res.json({ ok: true, deleted, scope: 'archive' });
      }

      // Ativo
      const reportId = rawId;
      const [attRows] = await pool.query('SELECT url FROM user_report_attachments WHERE report_id = ?', [reportId]);
      const urls = (attRows || []).map((a) => a?.url).filter(Boolean);

      await pool.query('DELETE FROM user_report_attachments WHERE report_id = ?', [reportId]);
      const [r] = await pool.query('DELETE FROM user_reports WHERE id = ?', [reportId]);

      const deleted = r?.affectedRows ?? 0;
      if (!deleted) return res.status(404).json({ error: 'report_not_found' });

      // Limpa arquivos do disco (best-effort)
      for (const url of urls) {
        try {
          const filename = path.basename(String(url));
          if (!filename) continue;
          const fullPath = path.join(reportUploadDir, filename);
          if (!fullPath.startsWith(reportUploadDir)) continue;
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch {
          // best-effort
        }
      }

      return res.json({ ok: true, deleted, scope: 'active' });
    } catch (err) {
      console.error('[messages/reports] delete one failed', err);
      return res.status(500).json({ error: 'report_delete_failed' });
    }
  }
);

// RESTful alternativa: DELETE /messages/:id
// (deve ficar DEPOIS das rotas mais específicas como /reports para não capturar "reports" como :id)
router.delete('/:id', ensureAuth, async (req, res) => {
  const userId = Number(req.user.id);
  const messageId = Number(req.params.id);

  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ error: 'invalid_message_id' });
  }

  const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
  if (!msg) return res.status(404).json({ error: 'not_found' });
  if (msg.sender_id !== userId) return res.status(403).json({ error: 'forbidden' });
  await pool.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [messageId]);
  const peerRoom = `user:${msg.sender_id === userId ? msg.receiver_id : msg.sender_id}`;
  req.app.get('io')?.to(peerRoom).emit('message:deleted', { id: messageId });
  res.json({ ok: true });
});

// Denunciar jogador
router.post(
  '/report-user',
  ensureAuth,
  reportUploadHandler,
  // Validações aceitam tanto JSON quanto multipart (campos vêm como string)
  body('reportedUserId').isInt({ min: 1 }),
  body('category').optional().isString().isLength({ min: 2, max: 60 }),
  body('details').optional().isString().isLength({ max: 900 }),
  body('reason').optional().isString().isLength({ max: 1000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const reporterId = Number(req.user.id);
    const reportedId = Number(req.body.reportedUserId);
    const category = req.body.category ? String(req.body.category).trim() : '';
    const details = req.body.details ? String(req.body.details).trim() : '';
    const legacyReason = req.body.reason ? String(req.body.reason).trim() : '';
    const reason = (category || details)
      ? [category ? `Categoria: ${category}` : '', details ? `Detalhes: ${details}` : ''].filter(Boolean).join('\n')
      : (legacyReason ? legacyReason : null);

    if (!Number.isFinite(reportedId) || reportedId <= 0) return res.status(400).json({ error: 'invalid_user' });
    if (reporterId === reportedId) return res.status(400).json({ error: 'invalid_target' });

    try {
      // Garante tabelas (para ambientes sem migração aplicada)
      await ensureModerationColumns();
      await ensureAccountEventStructures();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_reports (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          reporter_id INT NOT NULL,
          reported_id INT NOT NULL,
          context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
          reason VARCHAR(1000) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_reports_reporter (reporter_id),
          INDEX idx_user_reports_reported (reported_id)
        ) ENGINE=InnoDB
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_report_attachments (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          report_id BIGINT UNSIGNED NOT NULL,
          url VARCHAR(500) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          size_bytes INT UNSIGNED NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ura_report (report_id),
          CONSTRAINT fk_urat_report FOREIGN KEY (report_id) REFERENCES user_reports(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_reports_archive (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          original_report_id BIGINT UNSIGNED NULL,
          reporter_id INT NULL,
          reported_id INT NULL,
          context VARCHAR(32) NOT NULL DEFAULT 'direct_chat',
          reason VARCHAR(1000) NULL,
          created_at TIMESTAMP NULL,
          reporter_name VARCHAR(120) NULL,
          reporter_nickname VARCHAR(50) NULL,
          reporter_email VARCHAR(160) NULL,
          reported_name VARCHAR(120) NULL,
          reported_nickname VARCHAR(50) NULL,
          reported_email VARCHAR(160) NULL,
          action VARCHAR(32) NULL,
          archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ura_reporter (reporter_id),
          INDEX idx_ura_reported (reported_id),
          INDEX idx_ura_created (created_at)
        ) ENGINE=InnoDB
      `);

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [userRows] = await conn.query(
          'SELECT id, email, is_admin, banned_until, disabled_until FROM users WHERE id = ? FOR UPDATE',
          [reportedId]
        );
        if (!userRows.length) {
          await conn.rollback();
          return res.status(400).json({ error: 'invalid_user' });
        }

        const isAdmin = !!userRows[0].is_admin;

        const [insertRes] = await conn.query(
          'INSERT INTO user_reports (reporter_id, reported_id, context, reason) VALUES (?, ?, ?, ?)',
          [reporterId, reportedId, 'direct_chat', reason || null]
        );

        const reportId = Number(insertRes?.insertId);
        const files = Array.isArray(req.files) ? req.files : [];

        if (Number.isFinite(reportId) && reportId > 0 && files.length) {
          for (const f of files) {
            const filename = f?.filename;
            if (!filename) continue;
            const relPath = `/uploads/reports/${filename}`.replace(/\\/g, '/');
            await conn.query(
              'INSERT INTO user_report_attachments (report_id, url, mime_type, size_bytes) VALUES (?, ?, ?, ?)',
              [reportId, relPath, String(f.mimetype || ''), Number(f.size || 0)]
            );
          }
        }

        const [[countRow]] = await conn.query('SELECT COUNT(*) AS cnt FROM user_reports WHERE reported_id = ?', [reportedId]);
        const count = Number(countRow?.cnt ?? 0);

        const policy = pickAutoAction(count);

        if (!isAdmin && policy.kind !== 'none') {
          if (policy.kind === 'delete') {
            const action = 'auto_delete_reports';
            const normalizedEmail = String(userRows?.[0]?.email || '').trim().toLowerCase();

            // Captura anexos (best-effort) para tentar remover do disco após commit.
            const [attachmentRows] = await conn.query(
              `
                SELECT ura.url
                  FROM user_report_attachments ura
                  JOIN user_reports ur ON ur.id = ura.report_id
                 WHERE ur.reported_id = ?
              `,
              [reportedId]
            );
            const attachmentUrls = Array.isArray(attachmentRows)
              ? attachmentRows.map((r) => String(r?.url || '')).filter(Boolean)
              : [];

            if (normalizedEmail) {
              await conn.query(
                'INSERT INTO deleted_accounts (email, deleted_by, reason, source) VALUES (?, ?, ?, ?)',
                [normalizedEmail, null, 'Exclusão automática por excesso de denúncias', action]
              );
            }

            try {
              await conn.query(
                'INSERT INTO user_account_events (user_id, type, message, meta) VALUES (?, ?, ?, JSON_OBJECT(\'reports\', ?))',
                [reportedId, 'auto_delete', `Conta excluída automaticamente por denúncias (total: ${count}).`, count]
              );
            } catch {}

            await conn.query(
              `
                INSERT INTO user_reports_archive (
                  original_report_id,
                  reporter_id,
                  reported_id,
                  context,
                  reason,
                  created_at,
                  reporter_name,
                  reporter_nickname,
                  reporter_email,
                  reported_name,
                  reported_nickname,
                  reported_email,
                  action
                )
                SELECT
                  ur.id,
                  ur.reporter_id,
                  ur.reported_id,
                  ur.context,
                  ur.reason,
                  ur.created_at,
                  reporter.name,
                  reporter.nickname,
                  reporter.email,
                  reported.name,
                  reported.nickname,
                  reported.email,
                  ?
                FROM user_reports ur
                LEFT JOIN users reporter ON reporter.id = ur.reporter_id
                LEFT JOIN users reported ON reported.id = ur.reported_id
                WHERE ur.reported_id = ?
              `,
              [action, reportedId]
            );

            // Limpa a fila de reports (anexos removem via FK ON DELETE CASCADE)
            await conn.query('DELETE FROM user_reports WHERE reported_id = ?', [reportedId]);

            // Exclui a conta
            await conn.query('DELETE FROM users WHERE id = ?', [reportedId]);

            await conn.commit();

            // Best-effort: remove evidências do disco
            for (const url of attachmentUrls) {
              try {
                const localPath = String(url).startsWith('/uploads/reports/')
                  ? path.resolve(reportUploadDir, String(url).replace('/uploads/reports/', ''))
                  : null;
                if (!localPath) continue;
                if (!localPath.startsWith(reportUploadDir)) continue;
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
              } catch {
                // best-effort
              }
            }

            return res.json({ ok: true, action, reports: count });
          }

          const until = new Date(Date.now() + policy.days * 24 * 60 * 60_000);
          const untilSql = toSqlDateTime(until);
          if (!untilSql) {
            await conn.rollback();
            return res.status(500).json({ error: 'moderation_date_failed' });
          }

          const action = policy.kind === 'ban' ? 'auto_ban' : 'auto_disable';

          if (policy.kind === 'ban') {
            await conn.query('UPDATE users SET banned_until = ? WHERE id = ?', [untilSql, reportedId]);
          } else {
            await conn.query('UPDATE users SET disabled_until = ? WHERE id = ?', [untilSql, reportedId]);
          }

          try {
            const msg = policy.kind === 'ban'
              ? `Banimento automático por denúncias: ${policy.days} dias (total: ${count}).`
              : `Desativação automática por denúncias: ${policy.days} dias (total: ${count}).`;
            await conn.query(
              'INSERT INTO user_account_events (user_id, type, message, meta) VALUES (?, ?, ?, JSON_OBJECT(\'reports\', ?, \'until\', ?, \'days\', ?))',
              [reportedId, action, msg, count, untilSql, policy.days]
            );
          } catch {}

          await conn.query(
            `
              INSERT INTO user_reports_archive (
                original_report_id,
                reporter_id,
                reported_id,
                context,
                reason,
                created_at,
                reporter_name,
                reporter_nickname,
                reporter_email,
                reported_name,
                reported_nickname,
                reported_email,
                action
              )
              SELECT
                ur.id,
                ur.reporter_id,
                ur.reported_id,
                ur.context,
                ur.reason,
                ur.created_at,
                reporter.name,
                reporter.nickname,
                reporter.email,
                reported.name,
                reported.nickname,
                reported.email,
                ?
              FROM user_reports ur
              LEFT JOIN users reporter ON reporter.id = ur.reporter_id
              LEFT JOIN users reported ON reported.id = ur.reported_id
              WHERE ur.reported_id = ?
            `,
            [action, reportedId]
          );

          // Limpa a fila de reports (anexos removem via FK ON DELETE CASCADE)
          await conn.query('DELETE FROM user_reports WHERE reported_id = ?', [reportedId]);

          await conn.commit();
          return res.json({ ok: true, action, reports: count, until: untilSql, days: policy.days });
        }

        await conn.commit();
        return res.json({ ok: true, action: 'reported', reports: count });
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error('[messages/report-user] failed', err);
      res.status(500).json({ error: 'report_failed' });
    }
  }
);

export default router;
