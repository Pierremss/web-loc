import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();

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

  let { name, nickname, email, password, platforms, game_style, available_times, profile, jogos_favoritos } = req.body;
  // Se campos vierem JSON em string (por causa de multipart) tentar parse
  try { if (typeof jogos_favoritos === 'string' && jogos_favoritos.startsWith('[')) jogos_favoritos = JSON.parse(jogos_favoritos); } catch {}
  try { if (typeof platforms === 'string' && platforms.startsWith('[')) platforms = JSON.parse(platforms); } catch {}
    // Garante que platforms seja string separada por vírgula
    if (Array.isArray(platforms)) {
      platforms = platforms.join(',');
    } else if (typeof platforms === 'string') {
      // mantém como está
    } else {
      platforms = '';
    }
    // Garante que os demais campos não sejam undefined
  nickname = typeof nickname === 'string' ? nickname : '';
  game_style = typeof game_style === 'string' ? game_style : '';
  available_times = typeof available_times === 'string' ? available_times : '';
  profile = typeof profile === 'string' ? profile : '';

    try {
      const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (exists.length) return res.status(409).json({ error: 'E-mail já cadastrado' });
      const password_hash = await bcrypt.hash(password, 10);
      let avatar_url = null;
      if (req.file) {
        avatar_url = `/uploads/avatars/${req.file.filename}`.replace(/\\/g,'/');
      }
      const [result] = await pool.query(
        'INSERT INTO users (name, nickname, email, password_hash, is_admin, platforms, game_style, available_times, profile, avatar_url) VALUES (?,?,?,?,0,?,?,?,?,?)',
        [name, nickname, email, password_hash, platforms, game_style, available_times, profile, avatar_url]
      );
      const userId = result.insertId;
      // Salvar jogos favoritos na tabela user_games
      if (Array.isArray(jogos_favoritos) && jogos_favoritos.length > 0) {
        for (const gameId of jogos_favoritos) {
          await pool.query('INSERT INTO user_games (user_id, game_id) VALUES (?,?)', [userId, gameId]);
        }
      }
  // Buscar todos os dados do usuário recém cadastrado
      const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
      const user = userRows[0];
      if (user && user.avatar_url && !/^https?:/i.test(user.avatar_url)) {
        user.avatar_url = `${req.protocol}://${req.get('host')}${user.avatar_url}`;
      }
      return res.status(201).json(user);
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

    const { email, password } = req.body;

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
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });
      const user = rows[0];
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

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

export default router;