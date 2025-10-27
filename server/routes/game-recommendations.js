import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

const RECOMMENDATION_WITH_USER_QUERY = `
  SELECT gr.id, gr.user_id, gr.game_name, gr.platform, gr.genre, gr.game_type, gr.notes, gr.status,
         gr.admin_notes, gr.resolved_at, gr.created_at, gr.updated_at,
         u.name AS user_name, u.nickname AS user_nickname, u.email AS user_email
  FROM game_recommendations gr
  JOIN users u ON u.id = gr.user_id
  WHERE gr.id = ?`;

const GAME_NAME_MAX_LENGTH = 160;
const CATALOG_NAME_MAX_LENGTH = 80;

const createValidators = [
  body('gameName').trim().isLength({ min: 2, max: 255 }).withMessage('Informe o nome do jogo'),
  body('platform').trim().isLength({ min: 2, max: 255 }).withMessage('Informe a plataforma'),
  body('genre').trim().isLength({ min: 2, max: 255 }).withMessage('Informe o gênero'),
  body('gameType').trim().isLength({ min: 2, max: 255 }).withMessage('Informe o tipo'),
  body('notes').optional({ nullable: true }).isLength({ max: 4000 }).withMessage('Observações muito extensas'),
];

router.post('/', ensureAuth, createValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { gameName, platform, genre, gameType, notes = null } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const payload = [userId, gameName.trim(), platform.trim(), genre.trim(), gameType.trim(), notes ? String(notes).trim() : null];
    const [result] = await pool.query(
      `INSERT INTO game_recommendations (user_id, game_name, platform, genre, game_type, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      payload,
    );

    const [rows] = await pool.query(RECOMMENDATION_WITH_USER_QUERY, [result.insertId]);

    const row = rows[0];
    return res.status(201).json(formatRecommendation(row));
  } catch (err) {
    console.error('Erro ao registrar recomendação de jogo', err);
    return res.status(500).json({ error: 'Não foi possível registrar a recomendação' });
  }
});

router.get('/', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT gr.id, gr.user_id, gr.game_name, gr.platform, gr.genre, gr.game_type, gr.notes, gr.status,
              gr.admin_notes, gr.resolved_at, gr.created_at, gr.updated_at,
              u.name AS user_name, u.nickname AS user_nickname, u.email AS user_email
       FROM game_recommendations gr
       JOIN users u ON u.id = gr.user_id
       ORDER BY gr.created_at DESC`
    );

    return res.json(rows.map(formatRecommendation));
  } catch (err) {
    console.error('Erro ao listar recomendações de jogos', err);
    return res.status(500).json({ error: 'Não foi possível carregar as recomendações' });
  }
});

const updateValidators = [
  body('status').optional().isIn(['pending', 'accepted', 'rejected']).withMessage('Status inválido'),
  body('adminNotes').optional({ nullable: true }).isLength({ max: 4000 }).withMessage('Notas administrativas muito extensas'),
];

router.patch('/:id', ensureAuth, ensureAdmin, updateValidators, async (req, res) => {
  let conn;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const status = req.body.status ?? null;
    const hasAdminNotes = Object.prototype.hasOwnProperty.call(req.body, 'adminNotes');
    const adminNotes = typeof req.body.adminNotes === 'string' && req.body.adminNotes.trim().length
      ? req.body.adminNotes.trim()
      : null;

    const [existingRows] = await pool.query(
      'SELECT id, status, game_name, platform, genre, game_type FROM game_recommendations WHERE id = ?',
      [id]
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: 'Recomendação não encontrada' });
    }

    const recommendation = existingRows[0];
    const updateFragments = buildRecommendationUpdateFragments({ status, adminNotes, hasAdminNotes });

    if (!updateFragments.updates.length) {
      return res.status(200).json({ message: 'Nada para atualizar' });
    }

    const shouldCreateGame = status === 'accepted' && recommendation.status !== 'accepted';
    let createdGameId = null;

    if (shouldCreateGame) {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      createdGameId = await ensureGameFromRecommendation(conn, recommendation);
      await conn.query(
        `UPDATE game_recommendations SET ${updateFragments.updates.join(', ')} WHERE id = ?`,
        [...updateFragments.params, id]
      );
      await conn.commit();
      conn.release();
      conn = null;
    } else {
      await pool.query(
        `UPDATE game_recommendations SET ${updateFragments.updates.join(', ')} WHERE id = ?`,
        [...updateFragments.params, id]
      );
    }

    const updatedRow = await fetchRecommendationWithUser(id);
    if (!updatedRow) {
      return res.status(404).json({ error: 'Recomendação não encontrada' });
    }

    const payload = formatRecommendation(updatedRow);
    if (createdGameId) {
      payload.createdGameId = createdGameId;
    }

    return res.json(payload);
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('Falha ao executar rollback da recomendação', rollbackErr);
      } finally {
        conn.release();
      }
    }
    console.error('Erro ao atualizar recomendação de jogo', err);
    return res.status(500).json({ error: 'Não foi possível atualizar a recomendação' });
  }
});

function formatRecommendation(row) {
  return {
    id: row.id,
    gameName: row.game_name,
    platform: row.platform,
    genre: row.genre,
    gameType: row.game_type,
    notes: row.notes,
    status: row.status,
    adminNotes: row.admin_notes,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: {
      id: row.user_id,
      name: row.user_name,
      nickname: row.user_nickname,
      email: row.user_email,
    },
  };
}

function buildRecommendationUpdateFragments({ status, adminNotes, hasAdminNotes }) {
  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
    updates.push(status === 'accepted' || status === 'rejected'
      ? 'resolved_at = CURRENT_TIMESTAMP'
      : 'resolved_at = NULL');
  }

  if (hasAdminNotes) {
    updates.push('admin_notes = ?');
    params.push(adminNotes);
  }

  return { updates, params };
}

async function fetchRecommendationWithUser(id) {
  const [rows] = await pool.query(RECOMMENDATION_WITH_USER_QUERY, [id]);
  return rows[0] ?? null;
}

async function ensureGameFromRecommendation(conn, recommendation) {
  const gameName = sanitizeName(recommendation.game_name, GAME_NAME_MAX_LENGTH);
  if (!gameName) {
    throw new Error('Nome do jogo ausente na recomendação');
  }

  const gameId = await findOrCreateGame(conn, gameName);

  const platformNames = uniqueCaseInsensitive(splitNameList(recommendation.platform, CATALOG_NAME_MAX_LENGTH));
  const genreNames = uniqueCaseInsensitive(splitNameList(recommendation.genre, CATALOG_NAME_MAX_LENGTH));
  const typeNames = uniqueCaseInsensitive(splitNameList(recommendation.game_type, CATALOG_NAME_MAX_LENGTH));

  const platformIds = await resolveCatalogIds(conn, platformNames, findOrCreatePlatform);
  const genreIds = await resolveCatalogIds(conn, genreNames, findOrCreateGenre);
  const typeIds = await resolveCatalogIds(conn, typeNames, findOrCreateGameType);

  if (platformIds.length) {
    const values = platformIds.flatMap((platformId) => [gameId, platformId]);
    const placeholders = platformIds.map(() => '(?, ?)').join(', ');
    await conn.query(`INSERT IGNORE INTO game_platforms (game_id, platform_id) VALUES ${placeholders}`, values);
  }

  if (genreIds.length) {
    const values = genreIds.flatMap((genreId) => [gameId, genreId]);
    const placeholders = genreIds.map(() => '(?, ?)').join(', ');
    await conn.query(`INSERT IGNORE INTO game_genres (game_id, genre_id) VALUES ${placeholders}`, values);
  }

  if (typeIds.length) {
    const values = typeIds.flatMap((typeId) => [gameId, typeId]);
    const placeholders = typeIds.map(() => '(?, ?)').join(', ');
    await conn.query(`INSERT IGNORE INTO game_game_types (game_id, type_id) VALUES ${placeholders}`, values);
  }

  return gameId;
}

async function findOrCreateGame(conn, name) {
  const normalized = name.toUpperCase();
  const [existing] = await conn.query('SELECT id FROM games WHERE UPPER(name) = ? LIMIT 1', [normalized]);
  if (existing.length) return existing[0].id;

  try {
    const [result] = await conn.query('INSERT INTO games (name) VALUES (?)', [name]);
    return result.insertId;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      const [rows] = await conn.query('SELECT id FROM games WHERE UPPER(name) = ? LIMIT 1', [normalized]);
      if (rows.length) return rows[0].id;
    }
    throw error;
  }
}

async function resolveCatalogIds(conn, names, resolver) {
  const ids = [];
  for (const name of names) {
    try {
      const id = await resolver(conn, name);
      if (id) ids.push(id);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        // Conflitos já são tratados dentro do resolver; continuar fluxo.
        continue;
      }
      throw error;
    }
  }
  return [...new Set(ids)];
}

async function findOrCreatePlatform(conn, name) {
  return findOrCreateCatalogEntity(conn, 'platforms', name);
}

async function findOrCreateGenre(conn, name) {
  return findOrCreateCatalogEntity(conn, 'genres', name);
}

async function findOrCreateGameType(conn, name) {
  return findOrCreateCatalogEntity(conn, 'game_types', name);
}

async function findOrCreateCatalogEntity(conn, table, rawName) {
  const allowedTables = new Set(['platforms', 'genres', 'game_types']);
  if (!allowedTables.has(table)) {
    throw new Error(`Tabela de catálogo não suportada: ${table}`);
  }
  const sanitized = sanitizeName(rawName, CATALOG_NAME_MAX_LENGTH);
  if (!sanitized) return null;
  const normalized = sanitized.toUpperCase();

  const [existing] = await conn.query(`SELECT id FROM ${table} WHERE UPPER(name) = ? LIMIT 1`, [normalized]);
  if (existing.length) return existing[0].id;

  try {
    const [result] = await conn.query(`INSERT INTO ${table} (name) VALUES (?)`, [sanitized]);
    return result.insertId;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      const [rows] = await conn.query(`SELECT id FROM ${table} WHERE UPPER(name) = ? LIMIT 1`, [normalized]);
      if (rows.length) return rows[0].id;
    }
    throw error;
  }
}

function splitNameList(rawValue, maxLength) {
  if (rawValue == null) return [];
  const text = String(rawValue);
  const hasSeparators = /[;,\/|]/.test(text);
  if (!hasSeparators) {
    const single = sanitizeName(text, maxLength);
    return single ? [single] : [];
  }
  return text
    .split(/[;,\/|]/)
    .map((entry) => sanitizeName(entry, maxLength))
    .filter(Boolean);
}

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = value.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function sanitizeName(rawValue, maxLength) {
  if (rawValue == null) return null;
  const text = typeof rawValue === 'string' ? rawValue : String(rawValue);
  const trimmed = text.trim();
  if (!trimmed) return null;
  const normalizedWhitespace = trimmed.replace(/\s+/g, ' ');
  if (maxLength && normalizedWhitespace.length > maxLength) {
    return normalizedWhitespace.slice(0, maxLength);
  }
  return normalizedWhitespace;
}

export default router;
