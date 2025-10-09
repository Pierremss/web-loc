import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

function normalizePlatformIds(input) {
  if (!Array.isArray(input)) return [];
  const ids = input.map((item) => {
    if (typeof item === 'number') return item;
    if (typeof item === 'string') return Number(item);
    if (item && typeof item === 'object' && 'id' in item) return Number(item.id);
    return NaN;
  }).filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

async function attachPlatforms(games) {
  if (!games.length) return [];
  const gameIds = games.map((g) => g.id);
  const [relations] = await pool.query(
    'SELECT gp.game_id, p.id, p.name FROM game_platforms gp JOIN platforms p ON p.id = gp.platform_id WHERE gp.game_id IN (?) ORDER BY p.name ASC',
    [gameIds]
  );
  const platformMap = new Map();
  relations.forEach((row) => {
    if (!platformMap.has(row.game_id)) platformMap.set(row.game_id, []);
    platformMap.get(row.game_id).push({ id: row.id, name: row.name });
  });
  return games.map((game) => ({
    ...game,
    platforms: platformMap.get(game.id) || []
  }));
}

async function fetchPlatformsByIds(ids, conn = pool) {
  if (!ids.length) return [];
  const [rows] = await conn.query('SELECT id, name FROM platforms WHERE id IN (?)', [ids]);
  return rows;
}

async function ensureValidPlatforms(ids, conn = pool) {
  if (!ids.length) {
    return { valid: false, error: { status: 400, message: 'Informe pelo menos uma plataforma válida' } };
  }
  const rows = await fetchPlatformsByIds(ids, conn);
  if (rows.length !== ids.length) {
    const foundIds = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    return { valid: false, error: { status: 400, message: 'Plataformas inválidas', missing } };
  }
  return { valid: true, data: rows };
}

// Listar jogos (aberto)
router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name, created_at FROM games ORDER BY name ASC');
  const withPlatforms = await attachPlatforms(rows);
  res.json(withPlatforms);
});

// Obter jogo individual
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query('SELECT id, name, created_at FROM games WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Jogo não encontrado' });
  const [withPlatforms] = await attachPlatforms(rows);
  res.json(withPlatforms);
});

// Criar jogo (admin)
router.post('/', ensureAuth, ensureAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Nome obrigatório'),
  body('platforms').isArray({ min: 1 }).withMessage('Informe as plataformas'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const name = req.body.name.trim();
    const platformIds = normalizePlatformIds(req.body.platforms);
    const validation = await ensureValidPlatforms(platformIds);
    if (!validation.valid) {
      return res.status(validation.error.status).json({ error: validation.error.message, missing: validation.error.missing });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query('INSERT INTO games (name) VALUES (?)', [name]);
      const values = platformIds.flatMap((platformId) => [result.insertId, platformId]);
      const placeholders = platformIds.map(() => '(?, ?)').join(', ');
      await conn.query(`INSERT INTO game_platforms (game_id, platform_id) VALUES ${placeholders}`, values);
      await conn.commit();

      res.status(201).json({
        id: result.insertId,
        name,
        platforms: validation.data
      });
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Já existe um jogo com este nome' });
      }
      res.status(500).json({ error: 'Erro ao criar jogo', detail: e.message });
    } finally {
      conn.release();
    }
  }
);

// Atualizar jogo (admin)
router.put('/:id', ensureAuth, ensureAdmin,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Nome inválido'),
  body('platforms').optional().isArray().withMessage('Plataformas inválidas'),
  async (req, res) => {
    const id = Number(req.params.id);
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const hasPlatformsField = Object.prototype.hasOwnProperty.call(req.body, 'platforms');
    const platformIds = hasPlatformsField ? normalizePlatformIds(req.body.platforms) : null;
    let validatedPlatforms = null;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existingRows] = await conn.query('SELECT id, name FROM games WHERE id = ?', [id]);
      if (!existingRows.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Jogo não encontrado' });
      }

      const updates = [];
      const params = [];
      if (req.body.name) {
        updates.push('name = ?');
        params.push(req.body.name.trim());
      }

      if (updates.length) {
        params.push(id);
        await conn.query(`UPDATE games SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      if (hasPlatformsField) {
        const validation = await ensureValidPlatforms(platformIds, conn);
        if (!validation.valid) {
          await conn.rollback();
          return res.status(validation.error.status).json({ error: validation.error.message, missing: validation.error.missing });
        }
        validatedPlatforms = validation.data;
        await conn.query('DELETE FROM game_platforms WHERE game_id = ?', [id]);
        if (platformIds.length) {
          const values = platformIds.flatMap((platformId) => [id, platformId]);
          const placeholders = platformIds.map(() => '(?, ?)').join(', ');
          await conn.query(`INSERT INTO game_platforms (game_id, platform_id) VALUES ${placeholders}`, values);
        }
      }

      await conn.commit();

      const gameName = req.body.name ? req.body.name.trim() : existingRows[0].name;
      if (!validatedPlatforms) {
        const [withPlatforms] = await attachPlatforms([{ id, name: gameName }]);
        return res.json({ id, name: gameName, platforms: withPlatforms.platforms });
      }
      return res.json({ id, name: gameName, platforms: validatedPlatforms });
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Já existe um jogo com este nome' });
      }
      res.status(500).json({ error: 'Erro ao atualizar jogo', detail: e.message });
    } finally {
      conn.release();
    }
  }
);

// Deletar jogo (admin)
router.delete('/:id', ensureAuth, ensureAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [result] = await pool.query('DELETE FROM games WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Jogo não encontrado' });
  res.status(204).send();
});

export default router;