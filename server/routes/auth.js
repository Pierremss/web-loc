import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { issueVerificationCodeForPending, CODE_EXPIRATION_MINUTES } from '../services/email-verification.js';
import { requestPasswordReset, resetPasswordWithCode, RESET_CODE_EXPIRATION_MINUTES } from '../services/password-reset.js';

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
  return ensured;
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
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  if (value && typeof value === 'object' && !('length' in value)) {
    return [value];
  }
  return [];
}

function normalizeNumericIds(value) {
  const arr = coerceArray(value);
  const ids = arr.map((item) => {
    if (typeof item === 'number') return item;
    if (typeof item === 'string' && item.trim() !== '') return Number(item);
    if (item && typeof item === 'object' && 'id' in item) return Number(item.id);
    return NaN;
  }).filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

async function fetchPlatformsByIds(ids) {
  if (!ids.length) return [];
  const [rows] = await pool.query('SELECT id, name FROM platforms WHERE id IN (?)', [ids]);
  return rows;
}

async function fetchTypesByIds(ids) {
  if (!ids.length) return [];
  const [rows] = await pool.query('SELECT id, name FROM game_types WHERE id IN (?)', [ids]);
  return rows;
}

async function fetchGenresByIds(ids) {
  if (!ids.length) return [];
  const [rows] = await pool.query('SELECT id, name FROM genres WHERE id IN (?)', [ids]);
  return rows;
}

// Configuração de upload para avatar no cadastro
const regUploadDir = path.resolve(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(regUploadDir)) fs.mkdirSync(regUploadDir, { recursive: true });
const regStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, regUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `reg_${Date.now()}${ext}`);
  }
});
const regMaxMb = Number(process.env.AVATAR_MAX_MB || 20);
const regUpload = multer({
  storage: regStorage,
  limits: { fileSize: regMaxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) {
      return cb(new Error('Tipo de imagem inválido'));
    }
    cb(null, true);
  }
});

router.post('/register', 
  // multer primeiro
  (req, res, next) => {
    // Decide se é multipart; se não for continua
    if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) return next();
    regUpload.single('avatar')(req, res, function(err) {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Avatar excede ${regMaxMb}MB` });
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  body('name').isLength({min:2}).withMessage('Nome inválido'),
  body('nickname').isLength({min:2}).withMessage('Apelido inválido'),
  body('email').isEmail().withMessage('E-mail inválido'),
  body('password').isLength({min:6}).withMessage('Senha mínima de 6'),
  body('platforms').custom(val => Array.isArray(val) || typeof val === 'string').withMessage('Plataformas inválidas'),
  body('types').optional().custom(val => Array.isArray(val) || typeof val === 'string').withMessage('Tipos de jogo inválidos'),
  body('genres').optional().custom(val => Array.isArray(val) || typeof val === 'string').withMessage('Gêneros inválidos'),
  body('game_style').isString().withMessage('Estilo de jogo inválido'),
  body('available_times').isString().withMessage('Horários inválidos'),
  body('profile').isString().withMessage('Perfil inválido'),
  async (req, res) => {
    // Log para depuração dos dados recebidos
    console.log('Dados recebidos no cadastro:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const arr = errors.array();
      return res.status(400).json({ error: arr[0]?.msg || 'Dados inválidos', errors: arr });
    }

  let { name, nickname, email, password, platforms, game_style, available_times, profile, jogos_favoritos, types, genres } = req.body;
  const platformIds = normalizeNumericIds(platforms);
  const favoriteGameIds = normalizeNumericIds(jogos_favoritos);
  const typeIds = normalizeNumericIds(types);
  const genreIds = normalizeNumericIds(genres);
  if (!platformIds.length) {
    return res.status(400).json({ error: 'Selecione ao menos uma plataforma válida' });
  }
  if (!typeIds.length) {
    return res.status(400).json({ error: 'Selecione ao menos um tipo de jogo válido' });
  }
  let platformsString = '';
    // Garante que os demais campos não sejam undefined
  nickname = typeof nickname === 'string' ? nickname : '';
  game_style = typeof game_style === 'string' ? game_style : '';
  available_times = typeof available_times === 'string' ? available_times : '';
  profile = typeof profile === 'string' ? profile : '';

    try {
      const platformRows = await fetchPlatformsByIds(platformIds);
      const foundIds = new Set(platformRows.map((row) => row.id));
      const missingPlatforms = platformIds.filter((id) => !foundIds.has(id));
      if (missingPlatforms.length) {
        return res.status(400).json({ error: 'Plataformas inválidas', missing: missingPlatforms });
      }
      const platformNames = platformRows
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => row.name);
      platformsString = platformNames.join(',');

      const typeRows = await fetchTypesByIds(typeIds);
      const foundTypeIds = new Set(typeRows.map((row) => row.id));
      const missingTypes = typeIds.filter((id) => !foundTypeIds.has(id));
      if (missingTypes.length) {
        return res.status(400).json({ error: 'Tipos de jogo inválidos', missing: missingTypes });
      }
      const orderedTypes = typeIds
        .map((id) => typeRows.find((row) => row.id === id)?.name)
        .filter((name) => typeof name === 'string' && name.trim().length);
      game_style = orderedTypes[0] || game_style || '';
      if (game_style.length > 80) {
        game_style = game_style.slice(0, 80);
      }

      if (genreIds.length) {
        const genreRows = await fetchGenresByIds(genreIds);
        const foundGenreIds = new Set(genreRows.map((row) => row.id));
        const missingGenres = genreIds.filter((id) => !foundGenreIds.has(id));
        if (missingGenres.length) {
          return res.status(400).json({ error: 'Gêneros inválidos', missing: missingGenres });
        }
      }

      email = String(email ?? '').trim().toLowerCase();
      const [existingUsers] = await pool.query('SELECT id, is_verified FROM users WHERE email = ?', [email]);
      if (existingUsers.length) {
        const existing = existingUsers[0];
        return res.status(409).json({
          error: existing.is_verified
            ? 'E-mail já cadastrado. Faça login para acessar.'
            : 'Um cadastro para este e-mail já existe. Finalize a verificação para concluir o acesso.'
        });
      }

      const [pendingExisting] = await pool.query('SELECT id FROM pending_users WHERE email = ?', [email]);
      if (pendingExisting.length) {
        return res.status(409).json({
          error: 'Já existe um cadastro aguardando verificação para este e-mail. Utilize o código recebido ou solicite um novo.'
        });
      }

      const password_hash = await bcrypt.hash(password, 10);
      let avatar_url = null;
      if (req.file) {
        avatar_url = `/uploads/avatars/${req.file.filename}`.replace(/\\/g,'/');
      }
      const [result] = await pool.query(
        'INSERT INTO pending_users (name, nickname, email, password_hash, platforms, game_style, available_times, profile, avatar_url) VALUES (?,?,?,?,?,?,?,?,?)',
        [name, nickname, email, password_hash, platformsString, game_style, available_times, profile, avatar_url]
      );
      const pendingUserId = result.insertId;
      if (favoriteGameIds.length > 0) {
        const values = favoriteGameIds.map(() => '(?, ?)').join(', ');
        const params = [];
        favoriteGameIds.forEach((gameId) => {
          params.push(pendingUserId, gameId);
        });
        await pool.query(`INSERT IGNORE INTO pending_user_games (pending_user_id, game_id) VALUES ${values}`, params);
      }
      if (typeIds.length > 0) {
        const values = typeIds.map(() => '(?, ?)').join(', ');
        const params = [];
        typeIds.forEach((typeId) => {
          params.push(pendingUserId, typeId);
        });
        await pool.query(`INSERT IGNORE INTO pending_user_types (pending_user_id, type_id) VALUES ${values}`, params);
      }

      if (genreIds.length > 0) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS pending_user_genres (
            pending_user_id INT UNSIGNED NOT NULL,
            genre_id INT NOT NULL,
            PRIMARY KEY (pending_user_id, genre_id),
            CONSTRAINT fk_pugr_pending_user FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE,
            CONSTRAINT fk_pugr_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        const values = genreIds.map(() => '(?, ?)').join(', ');
        const params = [];
        genreIds.forEach((genreId) => {
          params.push(pendingUserId, genreId);
        });
        await pool.query(`INSERT IGNORE INTO pending_user_genres (pending_user_id, genre_id) VALUES ${values}`, params);
      }
      let delivered = false;
      let expiresAt = null;
      try {
        const issued = await issueVerificationCodeForPending(pendingUserId, email);
        delivered = issued.delivered;
        expiresAt = issued.expiresAt;
      } catch (err) {
        console.error('[auth] Cadastro criado, mas falha ao emitir código de verificação', err);
      }

      return res.status(201).json({
        success: true,
        pendingUserId,
        email,
        requiresVerification: true,
        delivered,
        expiresAt,
        expiresInMinutes: CODE_EXPIRATION_MINUTES,
        message: delivered
          ? 'Conta criada! Enviamos um código de verificação para o seu e-mail.'
          : 'Conta criada! Gere um novo código de verificação para ativar seu acesso.'
      });
    } catch (e) {
      return res.status(500).json({ error: 'Erro no cadastro', detail: e.message });
    }
});

/**
 * POST /api/auth/login
 * Se email/senha coincidirem com ADMIN_*, autentica como admin (sem banco).
 * Caso contrário, autentica como jogador no banco.
 */
router.post('/login', 
  body('email').isEmail(),
  body('password').isLength({min:1}),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    await ensureAccountStructures();

    const { email, password } = req.body;
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    // Admin login (predefinido)
    if (email === process.env.ADMIN_EMAIL) {
      if (password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ id: 0, email, is_admin: true, name: 'Administrador' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '2h' });
        return res.json({ token, user: { id: 0, name: 'Administrador', email, is_admin: 1 } });
      } else {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }
    }

    try {
      const [pendingRows] = await pool.query('SELECT id FROM pending_users WHERE email = ?', [normalizedEmail]);
      if (pendingRows.length) {
        return res.status(403).json({
          error: 'Cadastro aguardando verificação de e-mail. Confirme o código enviado para prosseguir.',
          requiresVerification: true,
          pending: true
        });
      }

      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
      if (!rows.length) {
        const [deleted] = await pool.query(
          'SELECT deleted_at, source FROM deleted_accounts WHERE email = ? ORDER BY deleted_at DESC LIMIT 1',
          [normalizedEmail]
        );
        if (deleted.length) {
          return res.status(403).json({
            error: 'deleted',
            message: 'Sua conta foi excluída e não está mais disponível.',
            deleted_at: deleted[0].deleted_at,
            source: deleted[0].source
          });
        }
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }
      const user = rows[0];
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

      if (!user.is_verified) {
        return res.status(403).json({
          error: 'E-mail não verificado. Confirme o código enviado para o seu e-mail.',
          requiresVerification: true
        });
      }

      const bannedUntil = user.banned_until ? new Date(user.banned_until) : null;
      if (bannedUntil && Number.isFinite(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now()) {
        return res.status(403).json({
          error: 'banned',
          banned_until: user.banned_until,
          message: 'Sua conta está suspensa temporariamente.'
        });
      }

  const token = jwt.sign({ id: user.id, email: user.email, is_admin: !!user.is_admin, name: user.name }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '2h' });
      let avatar = user.avatar_url;
      if (avatar && !/^https?:/i.test(avatar)) {
        avatar = `${req.protocol}://${req.get('host')}${avatar}`;
      }
      return res.json({ token, user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        nickname: user.nickname,
        platforms: user.platforms,
        game_style: user.game_style,
        available_times: user.available_times,
        profile: user.profile,
        avatar_url: avatar,
        is_admin: user.is_admin 
      } });
    } catch (e) {
      return res.status(500).json({ error: 'Erro no login', detail: e.message });
    }
});

  router.post(
    '/forgot-password',
    body('email').isEmail().withMessage('Informe um e-mail válido.'),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const email = String(req.body.email ?? '').trim().toLowerCase();

      try {
        const result = await requestPasswordReset(email);
        return res.json({
          success: true,
          message: 'Se encontrarmos uma conta para este e-mail, enviaremos um código de redefinição.',
          delivered: result.delivered,
          expiresAt: result.expiresAt,
          expiresInMinutes: RESET_CODE_EXPIRATION_MINUTES
        });
      } catch (err) {
        console.error('[auth] Falha ao iniciar redefinição de senha', err);
        return res.status(err.status ?? 500).json({
          error: err.status ? err.message : 'Não foi possível iniciar o processo de redefinição de senha. Tente novamente em instantes.'
        });
      }
    }
  );

  router.post(
    '/reset-password',
    body('email').isEmail().withMessage('Informe um e-mail válido.'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Código inválido.'),
    body('password').isLength({ min: 6 }).withMessage('A nova senha deve ter pelo menos 6 caracteres.'),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const email = String(req.body.email ?? '').trim().toLowerCase();
      const code = String(req.body.code ?? '').trim();
      const password = String(req.body.password ?? '');

      try {
        await resetPasswordWithCode({ email, code, newPassword: password });
        return res.json({
          success: true,
          message: 'Senha atualizada com sucesso. Você já pode fazer login com a nova senha.'
        });
      } catch (err) {
        console.error('[auth] Falha ao redefinir senha', err);
        return res.status(err.status ?? 500).json({
          error: err.status ? err.message : 'Não foi possível redefinir a senha. Verifique os dados e tente novamente.'
        });
      }
    }
  );

export default router;