import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name, created_at FROM platforms ORDER BY name ASC');
  res.json(rows);
});

router.post('/', ensureAuth, ensureAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Nome inválido'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const arr = errors.array();
      return res.status(400).json({ error: arr[0]?.msg || 'Dados inválidos', errors: arr });
    }
    const name = req.body.name.trim();
    try {
      const [exists] = await pool.query('SELECT id FROM platforms WHERE name = ?', [name]);
      if (exists.length) return res.status(409).json({ error: 'Plataforma já cadastrada' });
      const [result] = await pool.query('INSERT INTO platforms (name) VALUES (?)', [name]);
      res.status(201).json({ id: result.insertId, name });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao criar plataforma', detail: e.message });
    }
  }
);

router.put('/:id', ensureAuth, ensureAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Nome inválido'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const arr = errors.array();
      return res.status(400).json({ error: arr[0]?.msg || 'Dados inválidos', errors: arr });
    }
    const id = Number(req.params.id);
    const name = req.body.name.trim();
    try {
      const [exists] = await pool.query('SELECT id FROM platforms WHERE id = ?', [id]);
      if (!exists.length) return res.status(404).json({ error: 'Plataforma não encontrada' });
      const [dup] = await pool.query('SELECT id FROM platforms WHERE name = ? AND id <> ?', [name, id]);
      if (dup.length) return res.status(409).json({ error: 'Nome já utilizado' });
      await pool.query('UPDATE platforms SET name = ? WHERE id = ?', [name, id]);
      res.json({ id, name });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao atualizar plataforma', detail: e.message });
    }
  }
);

router.delete('/:id', ensureAuth, ensureAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query('DELETE FROM game_platforms WHERE platform_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM platforms WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Plataforma não encontrada' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover plataforma', detail: e.message });
  }
});

export default router;
