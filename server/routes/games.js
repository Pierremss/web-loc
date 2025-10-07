import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

// Listar jogos (aberto)
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM games ORDER BY name ASC');
  res.json(rows);
});

// Obter jogo
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query('SELECT * FROM games WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Não encontrado' });
  res.json(rows[0]);
});

// Criar jogo (admin)
router.post('/', ensureAuth, ensureAdmin,
  body('name').isLength({min:2}),
  body('platforms').isArray({min:1}),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, platforms } = req.body;
    const setVal = platforms.join(',');
    try {
      const [result] = await pool.query('INSERT INTO games (name, platforms) VALUES (?, ?)', [name, setVal]);
      res.status(201).json({ id: result.insertId, name, platforms });
    } catch(e) {
      res.status(500).json({ error: 'Erro ao criar jogo', detail: e.message });
    }
  }
);

// Atualizar jogo (admin)
router.put('/:id', ensureAuth, ensureAdmin,
  body('name').optional().isLength({min:2}),
  body('platforms').optional().isArray({min:1}),
  async (req, res) => {
    const id = Number(req.params.id);
    const fields = [];
    const values = [];
    if (req.body.name) { fields.push('name = ?'); values.push(req.body.name); }
    if (req.body.platforms) { fields.push('platforms = ?'); values.push(req.body.platforms.join(',')); }
    if (!fields.length) return res.status(400).json({ error: 'Nada para atualizar' });
    values.push(id);
    await pool.query(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM games WHERE id = ?', [id]);
    res.json({ id, name: rows[0].name, platforms: rows[0].platforms.split(',') });
  }
);

// Deletar jogo (admin)
router.delete('/:id', ensureAuth, ensureAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await pool.query('DELETE FROM games WHERE id = ?', [id]);
  res.status(204).send();
});

export default router;