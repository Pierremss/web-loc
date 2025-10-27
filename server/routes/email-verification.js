import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { resendCode, verifyEmailCode, CODE_EXPIRATION_MINUTES } from '../services/email-verification.js';

const router = Router();

router.post(
  '/send',
  body('email').isEmail().withMessage('Informe um e-mail válido.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = String(req.body.email).trim().toLowerCase();
    try {
      const { delivered, expiresAt } = await resendCode(email);
      return res.json({
        success: true,
        delivered,
        expiresInMinutes: CODE_EXPIRATION_MINUTES,
        message: delivered
          ? 'Código enviado para o e-mail informado.'
          : 'Código gerado, mas não foi possível enviá-lo automaticamente. Verifique a configuração SMTP.',
        expiresAt
      });
    } catch (err) {
      console.error('[verification] Falha ao enviar código', err);
      return res.status(err.status ?? 500).json({
        error: err.status ? err.message : 'Não foi possível gerar o código. Tente novamente em instantes.'
      });
    }
  }
);

router.post(
  '/confirm',
  body('email').isEmail().withMessage('Informe um e-mail válido.'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Código deve ter 6 dígitos.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = String(req.body.email).trim().toLowerCase();
    const code = String(req.body.code).trim();

    try {
      const result = await verifyEmailCode(email, code);
      return res.json({
        success: true,
        message: result.alreadyVerified
          ? 'E-mail já estava verificado.'
          : 'E-mail verificado com sucesso.',
        userId: result.userId,
        alreadyVerified: result.alreadyVerified
      });
    } catch (err) {
      console.error('[verification] Falha ao validar código', err);
      return res.status(err.status ?? 500).json({
        error: err.status ? err.message : 'Não foi possível validar o código. Tente novamente.'
      });
    }
  }
);

export default router;
