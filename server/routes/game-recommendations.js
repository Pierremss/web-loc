import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth, ensureAdmin } from '../middleware/auth.js';

const router = Router();

const ADMIN_RECOMMENDATION_SELECT = `
  SELECT gr.id, gr.user_id, gr.game_name, gr.platform, gr.genre, gr.game_type, gr.notes, gr.status,
    gr.admin_notes, gr.resolved_at, gr.created_game_id, gr.created_at, gr.updated_at,
         u.name AS user_name, u.nickname AS user_nickname, u.email AS user_email
  FROM game_recommendations gr
  JOIN users u ON u.id = gr.user_id`;

const RECOMMENDATION_WITH_USER_QUERY = `${ADMIN_RECOMMENDATION_SELECT}
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

router.get('/mine', ensureAuth, async (req, res) => {
  try {
    const userId = extractUserId(req.user);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const rows = await listRecommendationsForUser(userId);
    return res.json(rows.map(formatRecommendation));
  } catch (err) {
    console.error('Erro ao listar recomendações do jogador', err);
    return res.status(500).json({ error: 'Não foi possível carregar suas recomendações' });
  }
});

router.get('/', ensureAuth, async (req, res) => {
  try {
    const isAdmin = Boolean(req.user?.is_admin);
    if (!isAdmin) {
      const userId = extractUserId(req.user);
      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }
      const rows = await listRecommendationsForUser(userId);
      return res.json(rows.map(formatRecommendation));
    }

    const order = typeof req.query?.order === 'string' ? req.query.order.toLowerCase() : '';
    const orderClause = buildAdminOrderClause(order);

    const [rows] = await pool.query(
      `${ADMIN_RECOMMENDATION_SELECT}
       ORDER BY ${orderClause}`
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

    const rawStatus = typeof req.body.status === 'string' ? req.body.status.trim().toLowerCase() : null;
    const status = rawStatus && ['pending', 'accepted', 'rejected'].includes(rawStatus) ? rawStatus : null;
    const hasAdminNotes = Object.prototype.hasOwnProperty.call(req.body, 'adminNotes');
    const adminNotes = typeof req.body.adminNotes === 'string' && req.body.adminNotes.trim().length
      ? req.body.adminNotes.trim()
      : null;

    const [existingRows] = await pool.query(
      'SELECT id, status, game_name, platform, genre, game_type, created_game_id FROM game_recommendations WHERE id = ?',
      [id]
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: 'Recomendação não encontrada' });
    }

    const recommendation = existingRows[0];
    const updateFragments = buildRecommendationUpdateFragments({ status, adminNotes, hasAdminNotes });
  const wasAccepted = recommendation.status === 'accepted';
  const isAcceptingNow = status === 'accepted' && !wasAccepted;
  const isRejectingNow = status === 'rejected';
  const isLeavingAccepted = wasAccepted && isRejectingNow;

    if (!updateFragments.updates.length && !isLeavingAccepted) {
      const current = await fetchRecommendationWithUser(id);
      if (!current) {
        return res.status(404).json({ error: 'Recomendação não encontrada' });
      }
      const recommendationPayload = formatRecommendation(current);
      return res.json({
        ...recommendationPayload,
        message: 'Nenhuma alteração aplicada.'
      });
    }

    let createdGameId = recommendation.created_game_id ?? null;
    let gameCreated = false;
    let gameRemoved = false;

    if (isAcceptingNow) {
      conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const { gameId, created } = await ensureGameFromRecommendation(conn, recommendation);
        if (created) {
          updateFragments.updates.push('created_game_id = ?');
          updateFragments.params.push(gameId);
          createdGameId = gameId;
          gameCreated = true;
        }
        await conn.query(
          `UPDATE game_recommendations SET ${updateFragments.updates.join(', ')} WHERE id = ?`,
          [...updateFragments.params, id]
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
        conn = null;
      }
    } else if (isLeavingAccepted) {
      // Re-fetch current created_game_id under lock and remove only that specific game
      conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // lock the recommendation row to read the current created_game_id
        const [lockRows] = await conn.query('SELECT created_game_id FROM game_recommendations WHERE id = ? FOR UPDATE', [id]);
        const currentCreatedId = (lockRows[0] && lockRows[0].created_game_id) ? lockRows[0].created_game_id : null;

        // always clear created_game_id on this recommendation
        updateFragments.updates.push('created_game_id = NULL');
        await conn.query(
          `UPDATE game_recommendations SET ${updateFragments.updates.join(', ')} WHERE id = ?`,
          [...updateFragments.params, id]
        );

        if (currentCreatedId) {
          // check if other recommendations reference this same created_game_id
          const [refRows] = await conn.query('SELECT COUNT(*) AS cnt FROM game_recommendations WHERE created_game_id = ?', [currentCreatedId]);
          const refs = refRows[0] && typeof refRows[0].cnt !== 'undefined' ? Number(refRows[0].cnt) : 0;
          if (refs === 0) {
            // safe to delete the game (no other recommendation keeps it)
            await conn.query('DELETE FROM games WHERE id = ?', [currentCreatedId]);
            gameRemoved = true;
            createdGameId = null;
          } else {
            // another recommendation still references the same game_id; do not delete
            gameRemoved = false;
          }
        }

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
        conn = null;
      }
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

    const recommendationPayload = formatRecommendation(updatedRow);
    const message = buildStatusMessage(updatedRow.status, { gameCreated, gameRemoved });

    return res.json({
      ...recommendationPayload,
      message
    });
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
  createdGameId: row.created_game_id ?? null,
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

function buildStatusMessage(status, { gameCreated = false, gameRemoved = false } = {}) {
  switch (status) {
    case 'accepted':
      return gameCreated
        ? 'Recomendação aceita. Jogo criado e vinculado com sucesso.'
        : 'Recomendação aceita.';
    case 'rejected':
      return gameRemoved
        ? 'Recomendação rejeitada. Jogo criado anteriormente foi removido.'
        : 'Recomendação rejeitada.';
    case 'pending':
      return 'Recomendação marcada como pendente.';
    default:
      return 'Recomendação atualizada.';
  }
}

function buildAdminOrderClause(order) {
  switch (order) {
    case 'created-asc':
      return 'gr.created_at ASC, gr.id ASC';
    case 'name-asc':
      return 'gr.game_name ASC, gr.created_at DESC';
    case 'name-desc':
      return 'gr.game_name DESC, gr.created_at DESC';
    case 'created-desc':
    default:
      return 'gr.created_at DESC, gr.id DESC';
  }
}

async function fetchRecommendationWithUser(id) {
  const [rows] = await pool.query(RECOMMENDATION_WITH_USER_QUERY, [id]);
  return rows[0] ?? null;
}

function extractUserId(user) {
  if (!user) return null;
  const raw = typeof user.id === 'string' ? Number.parseInt(user.id, 10) : user.id;
  if (!Number.isInteger(raw) || raw <= 0) return null;
  return raw;
}

async function listRecommendationsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT gr.id, gr.user_id, gr.game_name, gr.platform, gr.genre, gr.game_type, gr.notes, gr.status,
            gr.admin_notes, gr.resolved_at, gr.created_game_id, gr.created_at, gr.updated_at,
            u.name AS user_name, u.nickname AS user_nickname, u.email AS user_email
     FROM game_recommendations gr
     LEFT JOIN users u ON u.id = gr.user_id
     WHERE gr.user_id = ?
     ORDER BY gr.created_at DESC`,
    [userId]
  );
  return rows;
}

async function ensureGameFromRecommendation(conn, recommendation) {
  const gameName = sanitizeName(recommendation.game_name, GAME_NAME_MAX_LENGTH);
  if (!gameName) {
    throw new Error('Nome do jogo ausente na recomendação');
  }

  const { id: gameId, created } = await findOrCreateGame(conn, gameName);

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

  return { gameId, created };
}

async function findOrCreateGame(conn, name) {
  const normalized = name.toUpperCase();
  const [existing] = await conn.query('SELECT id FROM games WHERE UPPER(name) = ? LIMIT 1', [normalized]);
  if (existing.length) return { id: existing[0].id, created: false };

  try {
    const [result] = await conn.query('INSERT INTO games (name) VALUES (?)', [name]);
    return { id: result.insertId, created: true };
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      const [rows] = await conn.query('SELECT id FROM games WHERE UPPER(name) = ? LIMIT 1', [normalized]);
      if (rows.length) return { id: rows[0].id, created: false };
    }
    throw error;
  }
}

async function removeCreatedGame(conn, gameId) {
  const numericId = typeof gameId === 'string' ? Number.parseInt(gameId, 10) : gameId;
  if (!Number.isInteger(numericId) || numericId <= 0) return;
  await conn.query('DELETE FROM games WHERE id = ?', [numericId]);
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
