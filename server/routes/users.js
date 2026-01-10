import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { body, param, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

let ensured;
async function ensureAccountStructures() {
  if (ensured) return;
  ensured = (async () => {
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_types (
        user_id INT NOT NULL,
        type_id INT NOT NULL,
        PRIMARY KEY (user_id, type_id),
        CONSTRAINT fk_ut_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ut_type FOREIGN KEY (type_id) REFERENCES game_types(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_genres (
        user_id INT NOT NULL,
        genre_id INT NOT NULL,
        PRIMARY KEY (user_id, genre_id),
        CONSTRAINT fk_user_genres_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_genres_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  })();
  return ensured;
}

function toSqlDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return null;
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  if (value && typeof value === 'object' && !('length' in value)) return [value];
  return [];
}

function normalizeNumericIds(value) {
  const arr = coerceArray(value);
  const ids = arr
    .map((item) => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string' && item.trim() !== '') return Number(item);
      if (item && typeof item === 'object' && 'id' in item) return Number(item.id);
      return NaN;
    })
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

function enrichAvatar(row, req) {
  if (!row) return row;
  if (row.avatar_url && !/^https?:/i.test(row.avatar_url)) {
    const base = `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
    row.avatar_url = base + row.avatar_url;
  }
  return row;
}

// Configuração de upload de avatar (armazenamento local simples)
const uploadDir = path.resolve(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `u${req.user?.id || 'anon'}_${Date.now()}${ext}`);
  }
});
const maxMb = Number(process.env.AVATAR_MAX_MB || 20); // padrão 20MB
const upload = multer({
  storage,
  limits: { fileSize: maxMb * 1024 * 1024 }, // limite configurável
  fileFilter: (req, file, cb) => {
    if (!/^(image\/jpeg|image\/png|image\/gif|image\/webp)$/.test(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não suportado'));
    }
    cb(null, true);
  }
});

// Middleware para capturar erro de tamanho de arquivo e responder claramente
function avatarUploadHandler(req, res, next) {
  upload.single('avatar')(req, res, function(err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Imagem excede limite de ${maxMb}MB` });
      }
      return res.status(400).json({ error: err.message || 'Erro no upload' });
    }
    next();
  });
}

// Perfil público (campos limitados)
router.get('/:id/public', async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query(
    `SELECT u.id,
            u.name,
            u.nickname,
            u.platforms,
            u.game_style,
            u.available_times,
            u.profile,
            u.avatar_url,
            (
              SELECT ge.name
                FROM user_games ug
                JOIN game_genres gg ON gg.game_id = ug.game_id
                JOIN genres ge ON ge.id = gg.genre_id
               WHERE ug.user_id = u.id
               GROUP BY gg.genre_id
               ORDER BY COUNT(*) DESC, ge.name ASC
               LIMIT 1
            ) AS favorite_genre,
            u.created_at
       FROM users u
      WHERE u.id = ?
      LIMIT 1`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Não encontrado' });
  res.json(enrichAvatar(rows[0], req));
});

// Buscar usuários por nome ou apelido
router.get('/search', ensureAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ items: [] });
  const like = `%${q}%`;
  const [rows] = await pool.query(
    `SELECT id, name, nickname, email, avatar_url
     FROM users
     WHERE name LIKE ? OR nickname LIKE ?
     ORDER BY name ASC
     LIMIT 20`, [like, like]
  );
  const items = (rows || []).map((r) => enrichAvatar(r, req));
  res.json({ items });
});

// Retorna os jogos favoritos do usuário
router.get('/:id/favoritos', ensureAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);

  if (!req.user.is_admin && userId !== id) {
    const [[friendship]] = await pool.query(
      'SELECT 1 FROM friendships WHERE user_min = LEAST(?, ?) AND user_max = GREATEST(?, ?) LIMIT 1',
      [userId, id, userId, id]
    );
    if (!friendship) return res.status(403).json({ error: 'Acesso negado' });
    const [blocked] = await pool.query(
      'SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1',
      [userId, id, id, userId]
    );
    if (blocked.length) return res.status(403).json({ error: 'blocked' });
  }

  const [rows] = await pool.query(
    `SELECT g.id, g.name FROM user_games ug
     JOIN games g ON ug.game_id = g.id
     WHERE ug.user_id = ?
     ORDER BY g.name ASC`, [id]
  );
  res.json(rows);
});

// router.post('/:id/favoritos', ensureAuth, async (req, res) => {
//   const id = Number(req.params.id);
//   const userId = Number(req.user.id);
//   const { gameId } = req.body;
//   if (!req.user.is_admin && userId !== id) return res.status(403).json({ error: 'Acesso negado' });
  
//   await pool.query('INSERT INTO user_games (user_id, game_id) VALUES (?, ?)', [id, gameId]);
//   res.status(201).json({ message: 'Favorito adicionado com sucesso' });
// });
router.post('/:id/favoritos', ensureAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  const { gameId } = req.body;

  if (!req.user.is_admin && userId !== id) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Verifica se já existe
  const [rows] = await pool.query(
    'SELECT 1 FROM user_games WHERE user_id = ? AND game_id = ?',
    [id, gameId]
  );

  if (rows.length > 0) {
    return res.status(400).json({ error: 'Esse jogo já está nos favoritos do usuário' });
  }

  await pool.query(
    'INSERT INTO user_games (user_id, game_id) VALUES (?, ?)',
    [id, gameId]
  );

  res.status(201).json({ message: 'Favorito adicionado com sucesso' });
});


router.delete('/:id/favoritos/:gameId', ensureAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  const gameId = Number(req.params.gameId);
  if (!req.user.is_admin && userId !== id) return res.status(403).json({ error: 'Acesso negado' });
  
  await pool.query('DELETE FROM user_games WHERE user_id = ? AND game_id = ?', [id, gameId]);
  res.status(204).send();
});

// Listar usuários (admin)
router.get('/', ensureAuth, ensureAdmin, async (req, res) => {
  await ensureAccountStructures();
  const [rows] = await pool.query('SELECT id, name, email, is_admin, banned_until, created_at FROM users ORDER BY id DESC');
  res.json(rows);
});

// Banir usuário (admin) - suspende temporariamente
router.post(
  '/:id/ban',
  ensureAuth,
  ensureAdmin,
  param('id').isInt({ min: 1 }),
  body('minutes').optional().isInt({ min: 1, max: 43200 }),
  body('until').optional().isISO8601(),
  body('reason').optional().isString().isLength({ max: 200 }),
  async (req, res) => {
    await ensureAccountStructures();

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.params.id);
    const minutes = req.body.minutes !== undefined ? Number(req.body.minutes) : null;
    const untilRaw = req.body.until ? String(req.body.until) : null;
    const reason = req.body.reason ? String(req.body.reason).trim() : '';

    let until = null;
    if (untilRaw) {
      const d = new Date(untilRaw);
      if (Number.isFinite(d.getTime())) until = d;
    } else if (Number.isFinite(minutes) && minutes && minutes > 0) {
      until = new Date(Date.now() + minutes * 60_000);
    } else {
      until = new Date(Date.now() + 24 * 60 * 60_000); // padrão 24h
    }

    const untilSql = new Date(until.getTime() - until.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    const [[u]] = await pool.query('SELECT id, is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!u) return res.status(404).json({ error: 'Não encontrado' });
    if (u.is_admin) return res.status(400).json({ error: 'Não é permitido banir administradores' });

    await pool.query('UPDATE users SET banned_until = ? WHERE id = ?', [untilSql, userId]);

    const msg = reason
      ? `Sua conta foi suspensa temporariamente até ${untilSql}. Motivo: ${reason}`
      : `Sua conta foi suspensa temporariamente até ${untilSql}.`;

    await pool.query(
      'INSERT INTO user_account_events (user_id, type, message, meta) VALUES (?, ?, ?, JSON_OBJECT(\'until\', ?, \'reason\', ?))',
      [userId, 'ban', msg, untilSql, reason || null]
    );

    res.json({ ok: true, banned_until: untilSql });
  }
);

// Remover ban (admin)
router.post(
  '/:id/unban',
  ensureAuth,
  ensureAdmin,
  param('id').isInt({ min: 1 }),
  body('reason').optional().isString().isLength({ max: 200 }),
  async (req, res) => {
    await ensureAccountStructures();

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.params.id);
    const reason = req.body.reason ? String(req.body.reason).trim() : '';

    const [[u]] = await pool.query('SELECT id, is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!u) return res.status(404).json({ error: 'Não encontrado' });
    if (u.is_admin) return res.status(400).json({ error: 'Não é permitido alterar administradores' });

    await pool.query('UPDATE users SET banned_until = NULL WHERE id = ?', [userId]);

    const msg = reason
      ? `Sua suspensão foi removida. Observação: ${reason}`
      : 'Sua suspensão foi removida. Você já pode acessar o sistema novamente.';

    await pool.query(
      'INSERT INTO user_account_events (user_id, type, message, meta) VALUES (?, ?, ?, JSON_OBJECT(\'reason\', ?))',
      [userId, 'unban', msg, reason || null]
    );

    res.json({ ok: true });
  }
);

// Desativar usuário (admin) - impede login até uma data
router.post(
  '/:id/disable',
  ensureAuth,
  ensureAdmin,
  param('id').isInt({ min: 1 }),
  body('days').optional().isInt({ min: 1, max: 3650 }),
  body('until').optional().isISO8601(),
  body('reason').optional().isString().isLength({ max: 200 }),
  async (req, res) => {
    await ensureAccountStructures();

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.params.id);
    const days = req.body.days !== undefined ? Number(req.body.days) : null;
    const untilRaw = req.body.until ? String(req.body.until) : null;
    const reason = req.body.reason ? String(req.body.reason).trim() : '';

    let until = null;
    if (untilRaw) {
      const d = new Date(untilRaw);
      if (Number.isFinite(d.getTime())) until = d;
    } else if (Number.isFinite(days) && days && days > 0) {
      until = new Date(Date.now() + days * 24 * 60 * 60_000);
    } else {
      until = new Date(Date.now() + 30 * 24 * 60 * 60_000); // padrão 30 dias
    }

    const untilSql = toSqlDateTime(until);
    if (!untilSql) return res.status(400).json({ error: 'Data inválida' });

    const [[u]] = await pool.query('SELECT id, is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!u) return res.status(404).json({ error: 'Não encontrado' });
    if (u.is_admin) return res.status(400).json({ error: 'Não é permitido desativar administradores' });

    await pool.query('UPDATE users SET disabled_until = ? WHERE id = ?', [untilSql, userId]);

    const msg = reason
      ? `Sua conta foi desativada temporariamente até ${untilSql}. Motivo: ${reason}`
      : `Sua conta foi desativada temporariamente até ${untilSql}.`;

    await pool.query(
      'INSERT INTO user_account_events (user_id, type, message, meta) VALUES (?, ?, ?, JSON_OBJECT(\'until\', ?, \'reason\', ?))',
      [userId, 'disable', msg, untilSql, reason || null]
    );

    res.json({ ok: true, disabled_until: untilSql });
  }
);

// Reativar usuário (admin)
router.post(
  '/:id/enable',
  ensureAuth,
  ensureAdmin,
  param('id').isInt({ min: 1 }),
  body('reason').optional().isString().isLength({ max: 200 }),
  async (req, res) => {
    await ensureAccountStructures();

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.params.id);
    const reason = req.body.reason ? String(req.body.reason).trim() : '';

    const [[u]] = await pool.query('SELECT id, is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!u) return res.status(404).json({ error: 'Não encontrado' });
    if (u.is_admin) return res.status(400).json({ error: 'Não é permitido alterar administradores' });

    await pool.query('UPDATE users SET disabled_until = NULL WHERE id = ?', [userId]);

    const msg = reason
      ? `Sua conta foi reativada. Observação: ${reason}`
      : 'Sua conta foi reativada. Você já pode acessar o sistema novamente.';

    await pool.query(
      'INSERT INTO user_account_events (user_id, type, message, meta) VALUES (?, ?, ?, JSON_OBJECT(\'reason\', ?))',
      [userId, 'enable', msg, reason || null]
    );

    res.json({ ok: true });
  }
);

// Obter por id (admin ou o próprio usuário)
router.get('/:id', ensureAuth, async (req, res) => {
  await ensureAccountStructures();
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  if (!req.user.is_admin && userId !== id) return res.status(403).json({ error: 'Acesso negado' });
  const [rows] = await pool.query(
    `SELECT u.id,
            u.name,
            u.email,
            u.nickname,
            u.platforms,
            u.game_style,
            u.available_times,
            u.profile,
            u.avatar_url,
            (
              SELECT ge.name
                FROM user_games ug
                JOIN game_genres gg ON gg.game_id = ug.game_id
                JOIN genres ge ON ge.id = gg.genre_id
               WHERE ug.user_id = u.id
               GROUP BY gg.genre_id
               ORDER BY COUNT(*) DESC, ge.name ASC
               LIMIT 1
            ) AS favorite_genre,
            u.is_admin,
            u.created_at
       FROM users u
      WHERE u.id = ?`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Não encontrado' });
  const user = enrichAvatar(rows[0], req);
  try {
    const [typeRows] = await pool.query('SELECT type_id FROM user_types WHERE user_id = ? ORDER BY type_id ASC', [id]);
    const [genreRows] = await pool.query('SELECT genre_id FROM user_genres WHERE user_id = ? ORDER BY genre_id ASC', [id]);
    user.types = typeRows.map((r) => Number(r.type_id)).filter((v) => Number.isInteger(v) && v > 0);
    user.genres = genreRows.map((r) => Number(r.genre_id)).filter((v) => Number.isInteger(v) && v > 0);
  } catch {
    user.types = [];
    user.genres = [];
  }
  res.json(user);
});

// Criar usuário (admin) - útil para testes; mantém is_admin=0
router.post('/', ensureAuth, ensureAdmin,
  body('name').isLength({min:2}),
  body('email').isEmail(),
  body('password').isLength({min:6}),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, email, password } = req.body;
    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) return res.status(409).json({ error: 'E-mail já cadastrado' });
    const bcrypt = (await import('bcrypt')).default;
    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?,?,?,0)', [name, email, password_hash]);
    res.status(201).json({ id: result.insertId, name, email, is_admin: 0 });
  }
);

// Atualizar usuário (admin ou o próprio)
router.put('/:id', ensureAuth,
  body('name').optional().isLength({min:2}),
  body('email').optional().isEmail(),
  async (req, res) => {
    await ensureAccountStructures();
    const id = Number(req.params.id);
    const userId = Number(req.user.id);
    if (!req.user.is_admin && userId !== id) return res.status(403).json({ error: 'Acesso negado' });
    
    // Processar os dados antes de atualizar
    const updateData = { ...req.body };
    
    // Converter platforms de array para string separada por vírgula, se necessário
    if (updateData.platforms !== undefined) {
      if (Array.isArray(updateData.platforms)) {
        updateData.platforms = updateData.platforms.join(',');
      } else if (typeof updateData.platforms !== 'string') {
        updateData.platforms = '';
      }
    }

    const requestedTypeIds = updateData.types !== undefined ? normalizeNumericIds(updateData.types) : null;
    const requestedGenreIds = updateData.genres !== undefined ? normalizeNumericIds(updateData.genres) : null;
    delete updateData.types;
    delete updateData.genres;
    
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (requestedTypeIds && requestedTypeIds.length) {
        const [typeRows] = await conn.query('SELECT id, name FROM game_types WHERE id IN (?)', [requestedTypeIds]);
        const found = new Set(typeRows.map((r) => Number(r.id)));
        const missing = requestedTypeIds.filter((tid) => !found.has(tid));
        if (missing.length) {
          await conn.rollback();
          return res.status(400).json({ error: 'Tipos de jogo inválidos', missing });
        }
        const firstName = typeRows.find((r) => Number(r.id) === requestedTypeIds[0])?.name;
        if (typeof firstName === 'string' && firstName.trim()) {
          updateData.game_style = firstName.trim().slice(0, 80);
        }
      }

      const fields = [];
      const values = [];
      const allowed = ['name', 'email', 'nickname', 'platforms', 'game_style', 'available_times', 'profile', 'avatar_url'];
      for (const k of allowed) {
        if (updateData[k] !== undefined) {
          fields.push(`${k} = ?`);
          values.push(updateData[k]);
        }
      }

      if (!fields.length && requestedTypeIds === null && requestedGenreIds === null) {
        await conn.rollback();
        return res.status(400).json({ error: 'Nada para atualizar' });
      }

      if (fields.length) {
        values.push(id);
        await conn.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
      }

      if (requestedTypeIds !== null) {
        await conn.query('DELETE FROM user_types WHERE user_id = ?', [id]);
        if (requestedTypeIds.length) {
          const valuesSql = requestedTypeIds.map(() => '(?, ?)').join(', ');
          const params = [];
          requestedTypeIds.forEach((typeId) => params.push(id, typeId));
          await conn.query(`INSERT IGNORE INTO user_types (user_id, type_id) VALUES ${valuesSql}`, params);
        }
      }

      if (requestedGenreIds !== null) {
        if (requestedGenreIds.length) {
          const [genreRows] = await conn.query('SELECT id FROM genres WHERE id IN (?)', [requestedGenreIds]);
          const found = new Set(genreRows.map((r) => Number(r.id)));
          const missing = requestedGenreIds.filter((gid) => !found.has(gid));
          if (missing.length) {
            await conn.rollback();
            return res.status(400).json({ error: 'Gêneros inválidos', missing });
          }
        }
        await conn.query('DELETE FROM user_genres WHERE user_id = ?', [id]);
        if (requestedGenreIds.length) {
          const valuesSql = requestedGenreIds.map(() => '(?, ?)').join(', ');
          const params = [];
          requestedGenreIds.forEach((genreId) => params.push(id, genreId));
          await conn.query(`INSERT IGNORE INTO user_genres (user_id, genre_id) VALUES ${valuesSql}`, params);
        }
      }

      await conn.commit();
    } catch (err) {
      try { await conn.rollback(); } catch {}
      return res.status(500).json({ error: 'Erro ao salvar perfil', detail: err?.message });
    } finally {
      conn.release();
    }

    const [rows] = await pool.query('SELECT id, name, email, nickname, platforms, game_style, available_times, profile, avatar_url, is_admin, created_at FROM users WHERE id = ?', [id]);
    const user = enrichAvatar(rows[0], req);
    const [typeRows] = await pool.query('SELECT type_id FROM user_types WHERE user_id = ? ORDER BY type_id ASC', [id]);
    const [genreRows] = await pool.query('SELECT genre_id FROM user_genres WHERE user_id = ? ORDER BY genre_id ASC', [id]);
    user.types = typeRows.map((r) => Number(r.type_id)).filter((v) => Number.isInteger(v) && v > 0);
    user.genres = genreRows.map((r) => Number(r.genre_id)).filter((v) => Number.isInteger(v) && v > 0);
    res.json(user);
  }
);

// Upload de avatar
router.post('/:id/avatar', ensureAuth, avatarUploadHandler, async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  if (!req.user.is_admin && userId !== id) return res.status(403).json({ error: 'Acesso negado' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
  const relPath = `/uploads/avatars/${req.file.filename}`.replace(/\\/g, '/');
  await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [relPath, id]);
  const full = `${req.protocol}://${req.get('host')}${relPath}`;
  res.json({ avatar_url: full });
});

// Deletar usuário (admin ou o próprio)
router.delete('/:id', ensureAuth, async (req, res) => {
  await ensureAccountStructures();
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  if (!req.user.is_admin && userId !== id) return res.status(403).json({ error: 'Acesso negado' });

  const [[u]] = await pool.query('SELECT id, email, is_admin FROM users WHERE id = ? LIMIT 1', [id]);
  if (!u) return res.status(404).json({ error: 'Não encontrado' });
  if (u.is_admin) return res.status(400).json({ error: 'Não é permitido excluir administradores' });

  const source = req.user.is_admin ? 'admin_delete' : 'self_delete';
  await pool.query(
    'INSERT INTO deleted_accounts (email, deleted_by, reason, source) VALUES (?, ?, ?, ?)',
    [String(u.email || '').toLowerCase(), req.user.is_admin ? userId : null, null, source]
  );

  await pool.query(
    'INSERT INTO user_account_events (user_id, type, message, meta) VALUES (?, ?, ?, JSON_OBJECT(\'source\', ?))',
    [id, 'delete', 'Sua conta foi excluída.', source]
  );

  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  res.status(204).send();
});

export default router;

