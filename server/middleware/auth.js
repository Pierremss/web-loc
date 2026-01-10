import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

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
  })();
  return ensured;
}

export async function ensureAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    await ensureAccountStructures();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Admin "predefinido" (login via env) usa id=0 e não existe no banco.
    if (payload && Number(payload.id) === 0 && payload.is_admin) {
      req.user = payload;
      return next();
    }

    const userId = Number(payload?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // JWT é stateless: valida existência do usuário para permitir revogação por exclusão.
    const [rows] = await pool.query('SELECT id, is_admin, banned_until, disabled_until FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const disabledUntil = rows[0].disabled_until ? new Date(rows[0].disabled_until) : null;
    if (disabledUntil && Number.isFinite(disabledUntil.getTime()) && disabledUntil.getTime() > Date.now()) {
      return res.status(403).json({
        error: 'disabled',
        disabled_until: rows[0].disabled_until,
        message: 'Sua conta está desativada temporariamente.'
      });
    }

    const bannedUntil = rows[0].banned_until ? new Date(rows[0].banned_until) : null;
    if (bannedUntil && Number.isFinite(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now()) {
      return res.status(403).json({
        error: 'banned',
        banned_until: rows[0].banned_until,
        message: 'Sua conta está suspensa temporariamente.'
      });
    }

    req.user = { ...payload, id: userId, is_admin: !!rows[0].is_admin };
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function ensureAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Acesso negado (admin)' });
  next();
}