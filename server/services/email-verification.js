import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import { pool } from '../db.js';

export const CODE_EXPIRATION_MINUTES = Number(process.env.EMAIL_CODE_EXPIRATION_MINUTES || 5);

let ensurePromise;

async function ensureStructures() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS verification_codes (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          email VARCHAR(255) NOT NULL,
          code CHAR(6) NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_verification_codes_user (user_id),
          CONSTRAINT fk_verification_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

export async function issueVerificationCode(userId, email) {
  await ensureStructures();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw Object.assign(new Error('E-mail inválido'), { status: 400 });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRATION_MINUTES * 60_000);
  await pool.query('DELETE FROM verification_codes WHERE user_id = ?', [userId]);
  await pool.query(
    'INSERT INTO verification_codes (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)',
    [userId, normalizedEmail, code, expiresAt]
  );

  const delivered = await sendEmail(normalizedEmail, code);
  if (!delivered) {
    console.info(`[email] Código gerado para ${normalizedEmail}: ${code} (entrega automática indisponível)`);
  }
  return { code, delivered, expiresAt };
}

export async function resendCode(email) {
  await ensureStructures();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw Object.assign(new Error('E-mail inválido'), { status: 400 });
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
  return issueVerificationCode(user.id, normalizedEmail);
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
    `SELECT vc.id, vc.user_id, vc.expires_at, u.is_verified
       FROM verification_codes vc
       JOIN users u ON u.id = vc.user_id
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
  if (record.is_verified) {
    await pool.query('DELETE FROM verification_codes WHERE user_id = ?', [record.user_id]);
    return { userId: record.user_id, alreadyVerified: true };
  }

  if (new Date(record.expires_at) < new Date()) {
    await pool.query('DELETE FROM verification_codes WHERE id = ?', [record.id]);
    const err = new Error('Código expirado');
    err.status = 400;
    throw err;
  }

  await pool.query('UPDATE users SET is_verified = 1 WHERE id = ?', [record.user_id]);
  await pool.query('DELETE FROM verification_codes WHERE user_id = ?', [record.user_id]);

  return { userId: record.user_id, alreadyVerified: false };
}
