import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';

export const RESET_CODE_EXPIRATION_MINUTES = Number(process.env.PASSWORD_RESET_CODE_EXPIRATION_MINUTES || 10);

let ensurePromise;

async function ensureStructures() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_requests (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          email VARCHAR(255) NOT NULL,
          code CHAR(6) NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          consumed_at DATETIME NULL,
          PRIMARY KEY (id),
          KEY idx_password_reset_user (user_id),
          KEY idx_password_reset_email (email),
          CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
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
    console.info('[password-reset] EMAIL_TEST_MODE ativo - transporte JSON (sem envio real).');
    return nodemailer.createTransport({ jsonTransport: true });
  }
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;
  if (!user || !pass) {
    console.warn('[password-reset] Credenciais de e-mail não configuradas. Códigos não serão enviados.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

const transporter = buildTransporter();

async function sendResetEmail({ to, code, name }) {
  if (!transporter) return false;
  try {
    const subject = 'Redefinição de senha - WebLoc';
    const greeting = name ? `Olá, ${name}!` : 'Olá!';
    const html = `
      <p>${greeting}</p>
      <p>Recebemos uma solicitação para redefinir sua senha na WebLoc.</p>
      <p>Use o código <strong>${code}</strong> para continuar a redefinição. Ele expira em ${RESET_CODE_EXPIRATION_MINUTES} minutos.</p>
      <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
    `;

    const info = await transporter.sendMail({
      from: `WebLoc <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      text: `${greeting}\nUse o código ${code} para redefinir sua senha. Ele expira em ${RESET_CODE_EXPIRATION_MINUTES} minutos. Ignore se não solicitou.`
    });

    if (transporter.options?.jsonTransport && info?.message) {
      console.info('[password-reset][test] Conteúdo do e-mail de redefinição:', info.message);
    }
    return true;
  } catch (err) {
    console.error('[password-reset] Falha ao enviar e-mail de redefinição', err);
    return false;
  }
}

export async function requestPasswordReset(rawEmail) {
  await ensureStructures();
  const email = normalizeEmail(rawEmail);
  if (!email) {
    const err = new Error('E-mail inválido');
    err.status = 400;
    throw err;
  }

  const [users] = await pool.query('SELECT id, name, is_verified FROM users WHERE email = ? LIMIT 1', [email]);
  if (!users.length || !users[0]?.is_verified) {
    return {
      delivered: false,
      expiresAt: null,
      expiresInMinutes: RESET_CODE_EXPIRATION_MINUTES,
      userFound: false
    };
  }

  const user = users[0];

  await pool.query('DELETE FROM password_reset_requests WHERE user_id = ? OR email = ?', [user.id, email]);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRATION_MINUTES * 60_000);

  await pool.query(
    'INSERT INTO password_reset_requests (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)',
    [user.id, email, code, expiresAt]
  );

  const delivered = await sendResetEmail({ to: email, code, name: user.name });
  if (!delivered) {
    console.info(`[password-reset] Código gerado para ${email}: ${code} (entrega automática indisponível)`);
  }

  return {
    delivered,
    expiresAt,
    expiresInMinutes: RESET_CODE_EXPIRATION_MINUTES,
    userFound: true
  };
}

export async function resetPasswordWithCode({ email: rawEmail, code: rawCode, newPassword }) {
  await ensureStructures();
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode ?? '').trim();

  if (!email || !/^[0-9]{6}$/.test(code)) {
    const err = new Error('Código inválido');
    err.status = 400;
    throw err;
  }

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    const err = new Error('Senha inválida');
    err.status = 400;
    throw err;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM password_reset_requests WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [email, code]
    );

    if (!rows.length) {
      const err = new Error('Código inválido');
      err.status = 400;
      throw err;
    }

    const request = rows[0];
    const isExpired = new Date(request.expires_at) < new Date();
    if (isExpired) {
      const err = new Error('Código expirado');
      err.status = 400;
      err.resetRequestId = request.id;
      throw err;
    }

    const [userRows] = await conn.query('SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [request.user_id]);
    if (!userRows.length) {
      const err = new Error('Usuário não encontrado');
      err.status = 404;
      err.resetRequestId = request.id;
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, request.user_id]);
    await conn.query('UPDATE password_reset_requests SET consumed_at = NOW() WHERE id = ?', [request.id]);
    await conn.query('DELETE FROM password_reset_requests WHERE user_id = ?', [request.user_id]);

    await conn.commit();
    return { success: true };
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('[password-reset] Falha ao executar rollback', rollbackErr);
      }
    }

    if (err?.resetRequestId) {
      try {
        await pool.query('DELETE FROM password_reset_requests WHERE id = ?', [err.resetRequestId]);
      } catch (cleanupErr) {
        console.warn('[password-reset] Falha ao limpar requisição expirada', cleanupErr?.message);
      }
    }

    throw err;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}
