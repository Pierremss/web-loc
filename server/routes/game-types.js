import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name, created_at FROM game_types ORDER BY name ASC');
  res.json(rows);
});

router.post('/', ensureAuth, ensureAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Nome inválido'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0]?.msg || 'Dados inválidos', errors: errors.array() });
    const name = req.body.name.trim();
    try {
      const [exists] = await pool.query('SELECT id FROM game_types WHERE name = ?', [name]);
      if (exists.length) return res.status(409).json({ error: 'Tipo já cadastrado' });
      const [result] = await pool.query('INSERT INTO game_types (name) VALUES (?)', [name]);
      res.status(201).json({ id: result.insertId, name });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao criar tipo', detail: e.message });
    }
  }
);

router.put('/:id', ensureAuth, ensureAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Nome inválido'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0]?.msg || 'Dados inválidos', errors: errors.array() });
    const id = Number(req.params.id);
    const name = req.body.name.trim();
    try {
      const [exists] = await pool.query('SELECT id FROM game_types WHERE id = ?', [id]);
      if (!exists.length) return res.status(404).json({ error: 'Tipo não encontrado' });
      const [dup] = await pool.query('SELECT id FROM game_types WHERE name = ? AND id <> ?', [name, id]);
      if (dup.length) return res.status(409).json({ error: 'Nome já utilizado' });
      await pool.query('UPDATE game_types SET name = ? WHERE id = ?', [name, id]);
      res.json({ id, name });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao atualizar tipo', detail: e.message });
    }
  }
);

router.delete('/:id', ensureAuth, ensureAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query('DELETE FROM game_game_types WHERE type_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM game_types WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Tipo não encontrado' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover tipo', detail: e.message });
  }
});

export default router;
