import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';
import { importRawgCatalog } from '../services/rawg-importer.js';

const router = Router();

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = Math.min(
  Math.max(Number(process.env.GAMES_PAGE_SIZE) || 24, 1),
  MAX_PAGE_SIZE
);

const ORDER_MAP = Object.freeze({
  name: 'g.name ASC',
  '-name': 'g.name DESC',
  released: 'g.released ASC',
  '-released': 'g.released DESC',
  rating: 'g.rating ASC',
  '-rating': 'g.rating DESC',
  metacritic: 'g.metacritic ASC',
  '-metacritic': 'g.metacritic DESC',
  '-created_at': 'g.created_at DESC',
  created_at: 'g.created_at ASC'
});

function parseIdsParam(raw) {
  if (!raw) return [];
  const serialized = Array.isArray(raw) ? raw.join(',') : String(raw);
  return serialized
    .split(',')
    .map((value) => Number.parseInt(String(value).trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function parsePositiveInt(raw, fallback) {
  const numeric = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function resolveOrder(order) {
  if (typeof order !== 'string') return ORDER_MAP.name;
  return ORDER_MAP[order] ?? ORDER_MAP.name;
}

function buildFilterClauses({ search, platformIds, genreIds, typeIds }) {
  const clauses = [];
  const params = [];

  if (search) {
    clauses.push('LOWER(g.name) LIKE ?');
    params.push(`%${search.toLowerCase()}%`);
  }

  if (platformIds.length) {
    clauses.push(
      'EXISTS (SELECT 1 FROM game_platforms gp WHERE gp.game_id = g.id AND gp.platform_id IN (?))'
    );
    params.push(platformIds);
  }

  if (genreIds.length) {
    clauses.push(
      'EXISTS (SELECT 1 FROM game_genres gg WHERE gg.game_id = g.id AND gg.genre_id IN (?))'
    );
    params.push(genreIds);
  }

  if (typeIds.length) {
    clauses.push(
      'EXISTS (SELECT 1 FROM game_game_types gt WHERE gt.game_id = g.id AND gt.type_id IN (?))'
    );
    params.push(typeIds);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function normalizeIds(input) {
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

async function attachGenres(games) {
  if (!games.length) return [];
  const gameIds = games.map((g) => g.id);
  const [relations] = await pool.query(
    'SELECT gg.game_id, g.id, g.name FROM game_genres gg JOIN genres g ON g.id = gg.genre_id WHERE gg.game_id IN (?) ORDER BY g.name ASC',
    [gameIds]
  );
  const map = new Map();
  relations.forEach((row) => {
    if (!map.has(row.game_id)) map.set(row.game_id, []);
    map.get(row.game_id).push({ id: row.id, name: row.name });
  });
  return games.map((game) => ({ ...game, genres: map.get(game.id) || [] }));
}

async function attachTypes(games) {
  if (!games.length) return [];
  const gameIds = games.map((g) => g.id);
  const [relations] = await pool.query(
    'SELECT ggt.game_id, t.id, t.name FROM game_game_types ggt JOIN game_types t ON t.id = ggt.type_id WHERE ggt.game_id IN (?) ORDER BY t.name ASC',
    [gameIds]
  );
  const map = new Map();
  relations.forEach((row) => {
    if (!map.has(row.game_id)) map.set(row.game_id, []);
    map.get(row.game_id).push({ id: row.id, name: row.name });
  });
  return games.map((game) => ({ ...game, types: map.get(game.id) || [] }));
}

async function fetchPlatformsByIds(ids, conn = pool) {
  if (!ids.length) return [];
  const [rows] = await conn.query('SELECT id, name FROM platforms WHERE id IN (?)', [ids]);
  return rows;
}

async function fetchGenresByIds(ids, conn = pool) {
  if (!ids.length) return [];
  const [rows] = await conn.query('SELECT id, name FROM genres WHERE id IN (?)', [ids]);
  return rows;
}

async function fetchTypesByIds(ids, conn = pool) {
  if (!ids.length) return [];
  const [rows] = await conn.query('SELECT id, name FROM game_types WHERE id IN (?)', [ids]);
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

async function ensureValidGenres(ids, conn = pool) {
  if (!ids.length) {
    return { valid: false, error: { status: 400, message: 'Informe pelo menos um gênero válido' } };
  }
  const rows = await fetchGenresByIds(ids, conn);
  if (rows.length !== ids.length) {
    const foundIds = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    return { valid: false, error: { status: 400, message: 'Gêneros inválidos', missing } };
  }
  return { valid: true, data: rows };
}

async function ensureValidTypes(ids, conn = pool) {
  if (!ids.length) {
    return { valid: false, error: { status: 400, message: 'Informe pelo menos um tipo válido' } };
  }
  const rows = await fetchTypesByIds(ids, conn);
  if (rows.length !== ids.length) {
    const foundIds = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    return { valid: false, error: { status: 400, message: 'Tipos inválidos', missing } };
  }
  return { valid: true, data: rows };
}

// Listar jogos (aberto)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(parsePositiveInt(req.query.page, 1), 1);
    const requestedPageSize = parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(Math.max(requestedPageSize, 1), MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const order = resolveOrder(req.query.order);
    const platformIds = parseIdsParam(req.query.platforms);
    const genreIds = parseIdsParam(req.query.genres);
    const typeIds = parseIdsParam(req.query.types);

    const filters = buildFilterClauses({ search, platformIds, genreIds, typeIds });
    const whereSql = filters.sql;

    const countParams = filters.params.slice();
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM games g ${whereSql}`,
      countParams
    );
    const total = countRows?.[0]?.total ?? 0;

    const dataParams = filters.params.slice();
    dataParams.push(pageSize, offset);
    const [rows] = await pool.query(
      `SELECT g.id, g.name, g.rawg_id, g.slug, g.description, g.released, g.background_image, g.rating, g.ratings_count, g.metacritic, g.created_at, g.updated_at
       FROM games g
       ${whereSql}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
      dataParams
    );

    let enriched = await attachPlatforms(rows);
    enriched = await attachGenres(enriched);
    enriched = await attachTypes(enriched);

    const totalPages = total === 0 ? 0 : Math.max(Math.ceil(total / pageSize), 1);
    res.json({
      data: enriched,
      meta: {
        total,
        page,
        pageSize,
        totalPages,
        hasNext: totalPages > 0 && page < totalPages,
        hasPrevious: totalPages > 0 && page > 1
      }
    });
  } catch (err) {
    console.error('Erro ao listar jogos', err);
    res.status(500).json({ error: 'Não foi possível recuperar os jogos' });
  }
});

// Obter jogo individual
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`
      SELECT id, name, rawg_id, slug, description, released, background_image, rating, ratings_count, metacritic, created_at, updated_at
      FROM games
      WHERE id = ?
    `, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Jogo não encontrado' });
    let [withPlatforms] = await attachPlatforms(rows);
    withPlatforms = await attachGenres(withPlatforms);
    withPlatforms = await attachTypes(withPlatforms);
    res.json(withPlatforms);
  } catch (err) {
    console.error('Erro ao carregar jogo', err);
    res.status(500).json({ error: 'Não foi possível recuperar o jogo' });
  }
});

// Criar jogo (admin)
router.post('/', ensureAuth, ensureAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Nome obrigatório'),
  body('platforms').isArray({ min: 1 }).withMessage('Informe as plataformas'),
  body('genres').optional().isArray().withMessage('Gêneros inválidos'),
  body('types').optional().isArray().withMessage('Tipos inválidos'),
  async (req, res) => {
    let conn;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const name = req.body.name.trim();
      const platformIds = normalizeIds(req.body.platforms);
      const genreIds = normalizeIds(req.body.genres || []);
      const typeIds = normalizeIds(req.body.types || []);
      const validation = await ensureValidPlatforms(platformIds);
      if (!validation.valid) {
        return res.status(validation.error.status).json({ error: validation.error.message, missing: validation.error.missing });
      }

      // validate genres/types if provided
      let validatedGenres = [];
      let validatedTypes = [];
      if (genreIds.length) {
        const vg = await ensureValidGenres(genreIds);
        if (!vg.valid) return res.status(vg.error.status).json({ error: vg.error.message, missing: vg.error.missing });
        validatedGenres = vg.data;
      }
      if (typeIds.length) {
        const vt = await ensureValidTypes(typeIds);
        if (!vt.valid) return res.status(vt.error.status).json({ error: vt.error.message, missing: vt.error.missing });
        validatedTypes = vt.data;
      }

      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [result] = await conn.query('INSERT INTO games (name) VALUES (?)', [name]);
      const values = platformIds.flatMap((platformId) => [result.insertId, platformId]);
      const placeholders = platformIds.map(() => '(?, ?)').join(', ');
      await conn.query(`INSERT INTO game_platforms (game_id, platform_id) VALUES ${placeholders}`, values);
      if (validatedGenres.length) {
        const gValues = genreIds.flatMap((gid) => [result.insertId, gid]);
        const gPlaceholders = genreIds.map(() => '(?, ?)').join(', ');
        await conn.query(`INSERT INTO game_genres (game_id, genre_id) VALUES ${gPlaceholders}`, gValues);
      }
      if (validatedTypes.length) {
        const tValues = typeIds.flatMap((tid) => [result.insertId, tid]);
        const tPlaceholders = typeIds.map(() => '(?, ?)').join(', ');
        await conn.query(`INSERT INTO game_game_types (game_id, type_id) VALUES ${tPlaceholders}`, tValues);
      }
      await conn.commit();

      return res.status(201).json({
        id: result.insertId,
        name,
        platforms: validation.data
      });
    } catch (e) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackErr) {
          console.error('Falha ao executar rollback da criação de jogo', rollbackErr);
        }
      }
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Já existe um jogo com este nome' });
      }
      console.error('Erro ao criar jogo', e);
      return res.status(500).json({ error: 'Erro ao criar jogo' });
    } finally {
      if (conn) conn.release();
    }
  }
);

// Atualizar jogo (admin)
router.put('/:id', ensureAuth, ensureAdmin,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Nome inválido'),
  body('platforms').optional().isArray().withMessage('Plataformas inválidas'),
  body('genres').optional().isArray().withMessage('Gêneros inválidos'),
  body('types').optional().isArray().withMessage('Tipos inválidos'),
  async (req, res) => {
    let conn;
    try {
      const id = Number(req.params.id);
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const hasPlatformsField = Object.prototype.hasOwnProperty.call(req.body, 'platforms');
      const hasGenresField = Object.prototype.hasOwnProperty.call(req.body, 'genres');
      const hasTypesField = Object.prototype.hasOwnProperty.call(req.body, 'types');
      const platformIds = hasPlatformsField ? normalizeIds(req.body.platforms) : null;
      const genreIds = hasGenresField ? normalizeIds(req.body.genres) : null;
      const typeIds = hasTypesField ? normalizeIds(req.body.types) : null;
      let validatedPlatforms = null;
      let validatedGenres = null;
      let validatedTypes = null;

      conn = await pool.getConnection();
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
      if (hasGenresField) {
        const validation = await ensureValidGenres(genreIds, conn);
        if (!validation.valid) {
          await conn.rollback();
          return res.status(validation.error.status).json({ error: validation.error.message, missing: validation.error.missing });
        }
        validatedGenres = validation.data;
        await conn.query('DELETE FROM game_genres WHERE game_id = ?', [id]);
        if (genreIds.length) {
          const gValues = genreIds.flatMap((gid) => [id, gid]);
          const gPlaceholders = genreIds.map(() => '(?, ?)').join(', ');
          await conn.query(`INSERT INTO game_genres (game_id, genre_id) VALUES ${gPlaceholders}`, gValues);
        }
      }
      if (hasTypesField) {
        const validation = await ensureValidTypes(typeIds, conn);
        if (!validation.valid) {
          await conn.rollback();
          return res.status(validation.error.status).json({ error: validation.error.message, missing: validation.error.missing });
        }
        validatedTypes = validation.data;
        await conn.query('DELETE FROM game_game_types WHERE game_id = ?', [id]);
        if (typeIds.length) {
          const tValues = typeIds.flatMap((tid) => [id, tid]);
          const tPlaceholders = typeIds.map(() => '(?, ?)').join(', ');
          await conn.query(`INSERT INTO game_game_types (game_id, type_id) VALUES ${tPlaceholders}`, tValues);
        }
      }

      await conn.commit();

      const gameName = req.body.name ? req.body.name.trim() : existingRows[0].name;
      const response = { id, name: gameName };
      if (!validatedPlatforms) {
        const [withPlatforms] = await attachPlatforms([{ id, name: gameName }]);
        response.platforms = withPlatforms.platforms;
      } else {
        response.platforms = validatedPlatforms;
      }
      if (!validatedGenres) {
        const [withGenres] = await attachGenres([{ id, name: gameName }]);
        response.genres = withGenres.genres;
      } else {
        response.genres = validatedGenres;
      }
      if (!validatedTypes) {
        const [withTypes] = await attachTypes([{ id, name: gameName }]);
        response.types = withTypes.types;
      } else {
        response.types = validatedTypes;
      }
      return res.json(response);
    } catch (e) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackErr) {
          console.error('Falha ao executar rollback da atualização de jogo', rollbackErr);
        }
      }
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Já existe um jogo com este nome' });
      }
      console.error('Erro ao atualizar jogo', e);
      return res.status(500).json({ error: 'Erro ao atualizar jogo' });
    } finally {
      if (conn) conn.release();
    }
  }
);

router.post('/import/rawg', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const options = {
      pageSize: parseOptionalInt(req.body?.pageSize),
      delayMs: parseOptionalInt(req.body?.delayMs),
      pages: parseOptionalInt(req.body?.pages),
      startPage: parseOptionalInt(req.body?.startPage),
      ordering: typeof req.body?.ordering === 'string' ? req.body.ordering : undefined,
      fetchDetails: parseOptionalBool(req.body?.fetchDetails),
      dryRun: parseOptionalBool(req.body?.dryRun),
    };
    const summary = await importRawgCatalog(options);
    res.status(200).json({ message: 'Importação RAWG concluída', summary });
  } catch (error) {
    console.error('Erro ao importar catálogo RAWG', error);
    res.status(500).json({ error: error.message || 'Falha ao importar jogos da RAWG' });
  }
});

// Deletar jogo (admin)
router.delete('/:id', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [result] = await pool.query('DELETE FROM games WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Jogo não encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao remover jogo', err);
    res.status(500).json({ error: 'Erro ao remover jogo' });
  }
});

export default router;

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseOptionalBool(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'sim'].includes(normalized)) return true;
  if (['false', '0', 'no', 'nao', 'não'].includes(normalized)) return false;
  return undefined;
}