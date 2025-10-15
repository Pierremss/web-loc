import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { ensureAuth } from '../middleware/auth.js';

const router = Router();

const PLATFORM_WEIGHT = 25;
const GAMES_WEIGHT = 50;
const STYLE_WEIGHT = 15;
const SCHEDULE_WEIGHT = 10;

function parseNumericArray(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return Array.from(new Set(arr.map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0)));
}

function parseStringArray(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return Array.from(new Set(arr.map(v => String(v).trim()).filter(Boolean)));
}

function parsePlatforms(csv) {
  if (!csv) return [];
  return csv.split(',').map(p => p.trim()).filter(Boolean);
}

function parseSchedule(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      const normalized = {};
      for (const [day, periods] of Object.entries(parsed)) {
        if (Array.isArray(periods) && periods.length) {
          normalized[day] = Array.from(new Set(periods.map(p => String(p))));
        }
      }
      return normalized;
    }
  } catch {}
  return {};
}

function scheduleOverlap(a, b) {
  const overlap = [];
  let count = 0;
  Object.entries(a).forEach(([day, periods]) => {
    if (!Array.isArray(periods) || !periods.length) return;
    const other = new Set(b[day] || []);
    const shared = periods.filter(p => other.has(p));
    if (shared.length) {
      overlap.push({ day, periods: shared });
      count += shared.length;
    }
  });
  return { overlap, count };
}

function countScheduleSlots(schedule) {
  return Object.values(schedule).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
}

function summarizeBio(profile) {
  if (!profile) return '';
  const clean = String(profile).trim();
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157)}...`;
}

async function loadPlatformsByName(names) {
  if (!names.length) return new Map();
  const [rows] = await pool.query('SELECT id, name FROM platforms WHERE name IN (?)', [names]);
  const map = new Map();
  rows.forEach((row) => map.set(row.name, { id: row.id, name: row.name }));
  return map;
}

async function loadUserFavorites(userIds) {
  if (!userIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT ug.user_id, g.id, g.name
     FROM user_games ug
     JOIN games g ON g.id = ug.game_id
     WHERE ug.user_id IN (?)`,
    [userIds]
  );
  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.user_id)) grouped.set(row.user_id, []);
    grouped.get(row.user_id).push({ id: row.id, name: row.name });
  });
  return grouped;
}

function computeCompatibility(me, candidate) {
  const commonGames = candidate.games.filter((game) => me.gameIds.has(game.id));
  const sharedPlatforms = candidate.platformNames.filter((name) => me.platformNames.has(name));
  const styleMatch = me.gameStyle && candidate.gameStyle && me.gameStyle === candidate.gameStyle;
  const { overlap, count } = scheduleOverlap(me.schedule, candidate.schedule);

  const totalGames = Math.min(me.totalGames, candidate.games.length) || 1;
  const totalPlatforms = Math.min(me.totalPlatforms, candidate.platformNames.length) || 1;
  const totalSlots = Math.min(me.totalScheduleSlots, candidate.totalScheduleSlots) || 1;

  const scoreGames = (commonGames.length / totalGames) * GAMES_WEIGHT;
  const scorePlatforms = (sharedPlatforms.length / totalPlatforms) * PLATFORM_WEIGHT;
  const scoreStyle = styleMatch ? STYLE_WEIGHT : 0;
  const scoreSchedule = (count / totalSlots) * SCHEDULE_WEIGHT;

  const score = Math.round(scoreGames + scorePlatforms + scoreStyle + scoreSchedule);

  return {
    score,
    weights: {
      games: GAMES_WEIGHT,
      platforms: PLATFORM_WEIGHT,
      style: STYLE_WEIGHT,
      schedule: SCHEDULE_WEIGHT
    },
    totals: {
      games: totalGames,
      platforms: totalPlatforms,
      schedule: totalSlots
    },
    breakdown: {
      games: Math.round(scoreGames),
      platforms: Math.round(scorePlatforms),
      style: Math.round(scoreStyle),
      schedule: Math.round(scoreSchedule)
    },
    commonGames,
    sharedPlatforms,
    styleMatch,
    scheduleOverlap: overlap
  };
}

function mapPlatforms(names, platformMap) {
  return names.map((name) => platformMap.get(name) || { id: null, name });
}

// Lista um "deck" de perfis ainda não vistos (sem like/pass do usuário)
router.get('/deck', ensureAuth, async (req, res) => {
  const userId = Number(req.user.id);
  const limit = Math.min(Number(req.query.limit || 20), 50);
  const minCompatibility = Number(req.query.minCompatibility || 0);
  const platformIdsFilter = parseNumericArray(req.query.platformIds);
  const gameStyleFilter = String(req.query.gameStyle || '').trim();
  const periodFilter = String(req.query.period || '').trim();

  try {
    const [[meRow]] = await pool.query(
      'SELECT platforms, game_style, available_times FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!meRow) return res.status(404).json({ error: 'Usuário não encontrado' });

    const mePlatforms = parsePlatforms(meRow.platforms || '');
    const meSchedule = parseSchedule(meRow.available_times);
    const meFavorites = await loadUserFavorites([userId]);
    const meGames = meFavorites.get(userId) || [];
    const platformFilterNames = platformIdsFilter.length
      ? (await pool.query('SELECT name FROM platforms WHERE id IN (?)', [platformIdsFilter]))[0].map(r => r.name)
      : [];

    const baseParams = [userId, userId, userId, userId, userId, userId];
    const filters = [];
    const filterValues = [];
    if (gameStyleFilter) {
      filters.push('u.game_style = ?');
      filterValues.push(gameStyleFilter);
    }
    platformFilterNames.forEach((name) => {
      filters.push('FIND_IN_SET(?, u.platforms) > 0');
      filterValues.push(name);
    });

    const whereExtra = filters.length ? ` AND ${filters.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.nickname, u.platforms, u.game_style, u.avatar_url, u.profile, u.available_times, u.created_at
       FROM users u
       LEFT JOIN friend_requests fr_self
         ON fr_self.requester_id = ? AND fr_self.receiver_id = u.id
       LEFT JOIN friendships f
         ON (f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?)
       LEFT JOIN user_blocks b1 ON b1.blocker_id = ? AND b1.blocked_id = u.id
       LEFT JOIN user_blocks b2 ON b2.blocker_id = u.id AND b2.blocked_id = ?
       WHERE u.id <> ?
         AND fr_self.receiver_id IS NULL
         AND f.id IS NULL
         AND b1.blocked_id IS NULL
         AND b2.blocker_id IS NULL
         ${whereExtra}
       ORDER BY u.created_at DESC
       LIMIT ?`,
      [...baseParams, ...filterValues, limit * 2]
    );

    const candidateIds = rows.map((row) => row.id);
    const favoritesMap = await loadUserFavorites(candidateIds);

    const platformNameSet = new Set(mePlatforms);
    rows.forEach((row) => parsePlatforms(row.platforms).forEach((name) => platformNameSet.add(name)));
    platformFilterNames.forEach((name) => platformNameSet.add(name));
    const platformMap = await loadPlatformsByName(Array.from(platformNameSet).filter(Boolean));

    const baseUrl = `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');

    const meContext = {
      platformNames: new Set(mePlatforms),
      totalPlatforms: mePlatforms.length,
      gameIds: new Set(meGames.map((g) => g.id)),
      totalGames: meGames.length,
      gameStyle: meRow.game_style || '',
      schedule: meSchedule,
      totalScheduleSlots: countScheduleSlots(meSchedule)
    };

    const filtered = [];
    for (const row of rows) {
      const platformNames = parsePlatforms(row.platforms);
      const schedule = parseSchedule(row.available_times);
      if (periodFilter) {
        const hasPeriod = Object.values(schedule).some((periods) => Array.isArray(periods) && periods.includes(periodFilter));
        if (!hasPeriod) continue;
      }

      const games = favoritesMap.get(row.id) || [];
      const candidateContext = {
        games,
        platformNames,
        gameStyle: row.game_style || '',
        schedule,
        totalScheduleSlots: countScheduleSlots(schedule)
      };
      const compatibility = computeCompatibility(meContext, candidateContext);
      compatibility.sharedPlatforms = mapPlatforms(compatibility.sharedPlatforms, platformMap);
      if (compatibility.score < minCompatibility) continue;

      const platforms = mapPlatforms(platformNames, platformMap);
      const avatar = row.avatar_url && !/^https?:/i.test(row.avatar_url) ? baseUrl + row.avatar_url : row.avatar_url;

      filtered.push({
        id: row.id,
        name: row.name,
        nickname: row.nickname,
        avatar_url: avatar,
        game_style: row.game_style,
        platforms,
        compatibility,
        summary: {
          bio: summarizeBio(row.profile),
          favoriteCount: games.length,
          availableTimes: row.available_times
        }
      });
      if (filtered.length >= limit) break;
    }

    return res.json({
      items: filtered,
      filters: {
        applied: {
          platformIds: platformIdsFilter,
          gameStyle: gameStyleFilter || null,
          period: periodFilter || null,
          minCompatibility
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao carregar deck', detail: e.message });
  }
});

router.get('/profile/:id', ensureAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const [[userRow]] = await pool.query(
      `SELECT id, name, nickname, platforms, game_style, available_times, profile, avatar_url, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [targetId]
    );
    if (!userRow) return res.status(404).json({ error: 'Perfil não encontrado' });

    const [gamesRows] = await pool.query(
      `SELECT g.id, g.name, g.created_at
       FROM user_games ug
       JOIN games g ON g.id = ug.game_id
       WHERE ug.user_id = ?
       ORDER BY g.name ASC`,
      [targetId]
    );

    const platformNames = parsePlatforms(userRow.platforms);
    const platformMap = await loadPlatformsByName(platformNames);
    const platforms = mapPlatforms(platformNames, platformMap);
    const schedule = parseSchedule(userRow.available_times);
    const scheduleArray = Object.entries(schedule).map(([day, periods]) => ({ day, periods }));
    const avatar = userRow.avatar_url && !/^https?:/i.test(userRow.avatar_url)
      ? `${req.protocol}://${req.get('host')}`.replace(/\/$/, '') + userRow.avatar_url
      : userRow.avatar_url;

    return res.json({
      id: userRow.id,
      name: userRow.name,
      nickname: userRow.nickname,
      avatar_url: avatar,
      game_style: userRow.game_style,
      profile: userRow.profile,
      platforms,
      availableTimes: scheduleArray,
      favoriteGames: gamesRows,
      created_at: userRow.created_at
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao carregar perfil', detail: e.message });
  }
});

// Dar like (equivale a criar/atualizar friend_request como pending).
// Se já houver pending do alvo para o usuário, vira match: aceita ambos e cria friendship.
router.post('/like', ensureAuth,
  body('toUserId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const fromId = Number(req.user.id);
    const toId = Number(req.body.toUserId);
    if (fromId === toId) return res.status(400).json({ error: 'Ação inválida' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Registrar meu like (pending)
      await conn.query(
        `INSERT INTO friend_requests (requester_id, receiver_id, status)
         VALUES (?, ?, 'pending')
         ON DUPLICATE KEY UPDATE status = 'pending'`,
        [fromId, toId]
      );

      // Verificar like recíproco
      const [[reciprocal]] = await conn.query(
        `SELECT id, status FROM friend_requests
         WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'
         LIMIT 1`,
        [toId, fromId]
      );

      let matched = false;
      if (reciprocal) {
        // Aceitar ambos e criar amizade (par ordenado)
        await conn.query(
          `UPDATE friend_requests SET status = 'accepted'
           WHERE (requester_id = ? AND receiver_id = ? AND status = 'pending')
              OR (requester_id = ? AND receiver_id = ? AND status = 'pending')`,
          [fromId, toId, toId, fromId]
        );
        await conn.query(
          `INSERT IGNORE INTO friendships (user_id, friend_id)
           VALUES (LEAST(?, ?), GREATEST(?, ?))`,
          [fromId, toId, fromId, toId]
        );
        matched = true;
      }

      await conn.commit();

      const io = req.app.get('io');
      // Notificações em tempo real
      io?.to(`user:${toId}`).emit('friend:request', { fromUserId: fromId });
      if (matched) {
        io?.to(`user:${toId}`).emit('friend:accepted', { byUserId: fromId });
        io?.to(`user:${fromId}`).emit('friend:accepted', { byUserId: toId });
      }

      return res.status(201).json({ message: matched ? 'Match!' : 'Like enviado', matched });
    } catch (e) {
      await conn.rollback();
      return res.status(500).json({ error: 'Erro ao processar like', detail: e.message });
    } finally {
      conn.release();
    }
  }
);

// Passar (não mostrar novamente): marca como declined em friend_requests
router.post('/pass', ensureAuth,
  body('toUserId').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const fromId = Number(req.user.id);
    const toId = Number(req.body.toUserId);
    if (fromId === toId) return res.status(400).json({ error: 'Ação inválida' });
    try {
      await pool.query(
        `INSERT INTO friend_requests (requester_id, receiver_id, status)
         VALUES (?, ?, 'declined')
         ON DUPLICATE KEY UPDATE status = 'declined'`,
        [fromId, toId]
      );
      return res.status(201).json({ message: 'Pass registrado' });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao registrar pass', detail: e.message });
    }
  }
);

export default router;
