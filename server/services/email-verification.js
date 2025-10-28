import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import { pool } from '../db.js';

export const CODE_EXPIRATION_MINUTES = Number(process.env.EMAIL_CODE_EXPIRATION_MINUTES || 5);

let ensurePromise;

async function ensureStructures() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pending_users (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(120) NOT NULL,
          nickname VARCHAR(50),
          email VARCHAR(160) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          platforms VARCHAR(100),
          game_style VARCHAR(20),
          available_times TEXT,
          profile TEXT,
          avatar_url VARCHAR(500) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pending_user_games (
          pending_user_id INT UNSIGNED NOT NULL,
          game_id INT NOT NULL,
          PRIMARY KEY (pending_user_id, game_id),
          CONSTRAINT fk_pug_pending_user FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE,
          CONSTRAINT fk_pug_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS verification_codes (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id INT NULL,
          pending_user_id INT UNSIGNED NULL,
          email VARCHAR(255) NOT NULL,
          code CHAR(6) NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_verification_codes_user (user_id),
          KEY idx_verification_codes_pending (pending_user_id),
          KEY idx_verification_codes_email (email),
          CONSTRAINT fk_verification_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_verification_codes_pending FOREIGN KEY (pending_user_id) REFERENCES pending_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      try {
        await pool.query(`
          ALTER TABLE users
            ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 0;
        `);
      } catch (err) {
        if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
      }
    })();
  }
  return ensurePromise;
}

function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function buildTransporter() {
  if (String(process.env.EMAIL_TEST_MODE || '').toLowerCase() === 'true' || process.env.EMAIL_TEST_MODE === '1') {
    console.info('[email] EMAIL_TEST_MODE ativo - usando transporte JSON (e-mails não serão enviados).');
    return nodemailer.createTransport({ jsonTransport: true });
  }
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;
  if (!user || !pass) {
    console.warn('[email] GMAIL_USER ou GMAIL_PASS não configurados; códigos não serão enviados por e-mail.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

const transporter = buildTransporter();

async function sendEmail(to, code) {
  if (!transporter) return false;
  try {
    const info = await transporter.sendMail({
      from: `"WebLoc" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Seu código de verificação - WebLoc',
      text: `Use o código ${code} para validar seu e-mail. Ele expira em ${CODE_EXPIRATION_MINUTES} minutos.`,
      html: `<p>Use o código <strong>${code}</strong> para validar seu e-mail.</p><p>Ele expira em ${CODE_EXPIRATION_MINUTES} minutos.</p>`
    });

    if (transporter.options.jsonTransport) {
      console.info('[email][teste] Conteúdo do e-mail de verificação:', info.message);
    }

    const notificationRecipient = process.env.REGISTRATION_NOTIFY_EMAIL || 'francojulia933@gmail.com';
    if (notificationRecipient) {
      const normalizedTarget = notificationRecipient.trim();
      if (normalizedTarget) {
        const notificationInfo = await transporter.sendMail({
          from: `"WebLoc" <${process.env.GMAIL_USER}>`,
          to: normalizedTarget,
          subject: 'Novo cadastro aguardando verificação',
          text: `Um usuário iniciou um cadastro com o e-mail ${to} e está aguardando a verificação do código.`
        }).catch((notificationErr) => {
          console.warn('[email] Falha ao notificar registro para', normalizedTarget, notificationErr?.message);
        });
        if (transporter.options.jsonTransport && notificationInfo?.message) {
          console.info('[email][teste] Conteúdo do e-mail de notificação:', notificationInfo.message);
        }
      }
    }
    return true;
  } catch (err) {
    console.error('[email] Falha ao enviar código', err);
    return false;
  }
}

async function createVerificationCode({ userId = null, pendingUserId = null, email }) {
  await ensureStructures();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw Object.assign(new Error('E-mail inválido'), { status: 400 });
  }
  if ((userId && pendingUserId) || (!userId && !pendingUserId)) {
    throw Object.assign(new Error('Destino do código inválido'), { status: 400 });
  }

  const targetField = userId ? 'user_id' : 'pending_user_id';
  const targetValue = userId ?? pendingUserId;

  await pool.query('DELETE FROM verification_codes WHERE email = ?', [normalizedEmail]);
  await pool.query(`DELETE FROM verification_codes WHERE ${targetField} = ?`, [targetValue]);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRATION_MINUTES * 60_000);
  await pool.query(
    'INSERT INTO verification_codes (user_id, pending_user_id, email, code, expires_at) VALUES (?, ?, ?, ?, ?)',
    [userId, pendingUserId, normalizedEmail, code, expiresAt]
  );

  const delivered = await sendEmail(normalizedEmail, code);
  if (!delivered) {
    console.info(`[email] Código gerado para ${normalizedEmail}: ${code} (entrega automática indisponível)`);
  }
  return { code, delivered, expiresAt };
}

export async function issueVerificationCodeForPending(pendingUserId, email) {
  return createVerificationCode({ pendingUserId, email });
}

export async function issueVerificationCodeForUser(userId, email) {
  return createVerificationCode({ userId, email });
}

export async function resendCode(email) {
  await ensureStructures();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw Object.assign(new Error('E-mail inválido'), { status: 400 });
  }

  const [pendingRows] = await pool.query('SELECT id FROM pending_users WHERE email = ?', [normalizedEmail]);
  if (pendingRows.length) {
    return issueVerificationCodeForPending(pendingRows[0].id, normalizedEmail);
  }

  const [rows] = await pool.query('SELECT id, is_verified FROM users WHERE email = ?', [normalizedEmail]);
  if (!rows.length) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }
  const user = rows[0];
  if (user.is_verified) {
    const err = new Error('E-mail já verificado');
    err.status = 409;
    throw err;
  }
  return issueVerificationCodeForUser(user.id, normalizedEmail);
}

export async function verifyEmailCode(email, code) {
  await ensureStructures();
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code ?? '').trim();
  if (!normalizedEmail || !/^[0-9]{6}$/.test(normalizedCode)) {
    const err = new Error('Código ou e-mail inválido');
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.query(
    `SELECT vc.id,
            vc.user_id,
            vc.pending_user_id,
            vc.expires_at,
            u.is_verified AS user_is_verified,
            pu.id AS pending_id,
            pu.name AS pending_name,
            pu.nickname AS pending_nickname,
            pu.email AS pending_email,
            pu.password_hash AS pending_password_hash,
            pu.platforms AS pending_platforms,
            pu.game_style AS pending_game_style,
            pu.available_times AS pending_available_times,
            pu.profile AS pending_profile,
            pu.avatar_url AS pending_avatar_url
       FROM verification_codes vc
       LEFT JOIN users u ON u.id = vc.user_id
       LEFT JOIN pending_users pu ON pu.id = vc.pending_user_id
      WHERE vc.email = ? AND vc.code = ?
      ORDER BY vc.created_at DESC
      LIMIT 1`,
    [normalizedEmail, normalizedCode]
  );

  if (!rows.length) {
    const err = new Error('Código inválido');
    err.status = 400;
    throw err;
  }

  const record = rows[0];
  if (new Date(record.expires_at) < new Date()) {
    await pool.query('DELETE FROM verification_codes WHERE id = ?', [record.id]);
    const err = new Error('Código expirado');
    err.status = 400;
    throw err;
  }

  if (record.user_id) {
    if (record.user_is_verified === null || typeof record.user_is_verified === 'undefined') {
      await pool.query('DELETE FROM verification_codes WHERE id = ?', [record.id]);
      const err = new Error('Usuário não encontrado');
      err.status = 404;
      throw err;
    }
    if (!record.user_is_verified) {
      await pool.query('UPDATE users SET is_verified = 1 WHERE id = ?', [record.user_id]);
    }
    await pool.query('DELETE FROM verification_codes WHERE user_id = ?', [record.user_id]);
    return { userId: record.user_id, alreadyVerified: !!record.user_is_verified };
  }

  if (!record.pending_user_id || !record.pending_email) {
    await pool.query('DELETE FROM verification_codes WHERE id = ?', [record.id]);
    const err = new Error('Código inválido');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [pendingRows] = await conn.query('SELECT * FROM pending_users WHERE id = ? FOR UPDATE', [record.pending_user_id]);
    if (!pendingRows.length) {
      await conn.query('DELETE FROM verification_codes WHERE pending_user_id = ?', [record.pending_user_id]);
      throw Object.assign(new Error('Cadastro pendente não encontrado'), { status: 404 });
    }
    const pending = pendingRows[0];

    const [existingRows] = await conn.query('SELECT id, is_verified FROM users WHERE email = ? LIMIT 1 FOR UPDATE', [pending.email]);
    let userId;
    let alreadyVerified = false;
    if (existingRows.length) {
      const existing = existingRows[0];
      userId = existing.id;
      alreadyVerified = existing.is_verified === 1;
      if (!alreadyVerified) {
        await conn.query('UPDATE users SET is_verified = 1 WHERE id = ?', [existing.id]);
      }
    } else {
      const [result] = await conn.query(
        `INSERT INTO users (name, nickname, email, password_hash, is_admin, is_verified, platforms, game_style, available_times, profile, avatar_url)
         VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`,
        [
          pending.name,
          pending.nickname,
          pending.email,
          pending.password_hash,
          pending.platforms,
          pending.game_style,
          pending.available_times,
          pending.profile,
          pending.avatar_url
        ]
      );
      userId = result.insertId;

      const [pendingGames] = await conn.query('SELECT game_id FROM pending_user_games WHERE pending_user_id = ?', [record.pending_user_id]);
      if (pendingGames.length) {
        const values = pendingGames.map(() => '(?, ?)').join(', ');
        const params = [];
        pendingGames.forEach(({ game_id }) => {
          params.push(userId, game_id);
        });
        await conn.query(`INSERT IGNORE INTO user_games (user_id, game_id) VALUES ${values}`, params);
      }
    }

    await conn.query('DELETE FROM verification_codes WHERE pending_user_id = ?', [record.pending_user_id]);
    await conn.query('DELETE FROM verification_codes WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM pending_users WHERE id = ?', [record.pending_user_id]);

    await conn.commit();
    return { userId, alreadyVerified };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
