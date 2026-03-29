import { pool } from '../db.js';
import { rawgClient } from './rawg-client.js';

const DEFAULT_PAGE_SIZE = Number(process.env.RAWG_IMPORT_PAGE_SIZE || 40);
const DEFAULT_DELAY_MS = Number(process.env.RAWG_IMPORT_DELAY_MS || 1100);
const DEFAULT_MAX_RETRIES = Number(process.env.RAWG_IMPORT_RETRIES || 3);
const RETRY_BACKOFF_FACTOR = Number(process.env.RAWG_IMPORT_BACKOFF || 1.8);

export async function importRawgCatalog(options = {}) {
  const importer = new RawgImporter(options);
  return importer.run();
}

class RawgImporter {
  constructor(options = {}) {
    if (!process.env.RAWG_API_KEY) {
      throw new Error('RAWG_API_KEY não configurada. Defina no arquivo .env do servidor.');
    }
    this.pool = options.pool || pool;
    this.pageSize = Number(options.pageSize || DEFAULT_PAGE_SIZE);
    this.delayMs = Number(options.delayMs || DEFAULT_DELAY_MS);
    this.maxPages = options.pages ? Number(options.pages) : null;
    this.startPage = Number(options.startPage || 1);
    this.ordering = options.ordering;
    this.fetchDetails = Boolean(options.fetchDetails);
    this.dryRun = Boolean(options.dryRun);
  this.maxRetries = Number.isFinite(Number(options.maxRetries)) ? Number(options.maxRetries) : DEFAULT_MAX_RETRIES;
    this.logger = options.logger || console;
    this.signal = options.signal;
    this.summary = { processed: 0, created: 0, updated: 0, skipped: 0 };
    this.platformCache = new Map();
    this.genreCache = new Map();
  }

  async run() {
    let page = this.startPage;
    this.logHeader();

    while (!this.signal?.aborted) {
      this.logger.log(`\n→ Buscando página ${page}...`);
      const pageData = await this.fetchPageWithRetry(page);

      if (!pageData.results?.length) {
        this.logger.log('Nenhum jogo retornado. Encerrando importação.');
        break;
      }

      for (const game of pageData.results) {
        if (this.signal?.aborted) break;
        const merged = await this.enrichGame(game);
        if (!merged.name) {
          this.summary.skipped += 1;
          continue;
        }
        if (this.dryRun) {
          this.logger.log(`- [dry-run] ${merged.name}`);
          this.summary.processed += 1;
          continue;
        }
        const { created, updated } = await this.upsertGame(merged);
        if (created) this.summary.created += 1;
        if (updated) this.summary.updated += 1;
        if (!created && !updated) this.summary.skipped += 1;
        this.summary.processed += 1;
      }

      if (!pageData.next) {
        this.logger.log('Sem próxima página. Import finalizado.');
        break;
      }

      if (this.maxPages && (page - this.startPage + 1) >= this.maxPages) {
        this.logger.log(`Limite de páginas (${this.maxPages}) atingido. Encerrando.`);
        break;
      }

      page += 1;
      await this.sleep(this.delayMs);
    }

    this.logger.log('\nResumo importação RAWG:');
    this.logger.log(`Jogos processados: ${this.summary.processed}`);
    this.logger.log(`Jogos criados: ${this.summary.created}`);
    this.logger.log(`Jogos atualizados: ${this.summary.updated}`);
    this.logger.log(`Jogos pulados: ${this.summary.skipped}`);

    return this.summary;
  }

  async enrichGame(game) {
    if (!this.fetchDetails) return this.mapSummaryGame(game);
    try {
      await this.sleep(this.delayMs);
      const details = await this.retryAsync(() => rawgClient.fetchGameDetails(game.id), {
        label: `detalhes do jogo RAWG ${game.id}`
      });
      return this.mergeGameData(game, details);
    } catch (error) {
      this.logger.warn(`Aviso: falha ao carregar detalhes de ${game.name} (ID RAWG ${game.id}): ${error.message}`);
      return this.mapSummaryGame(game);
    }
  }

  async fetchPageWithRetry(page) {
    return this.retryAsync(() => rawgClient.fetchGamesPage({
      page,
      pageSize: this.pageSize,
      ordering: this.ordering
    }), {
      label: `página ${page}`
    });
  }

  mapSummaryGame(game) {
    return {
      rawgId: game.id,
      name: game.name,
      slug: game.slug || null,
      description: null,
      released: game.released || null,
      backgroundImage: game.background_image || null,
      rating: game.rating ?? null,
      ratingsCount: game.ratings_count ?? null,
      metacritic: game.metacritic ?? null,
      platforms: Array.isArray(game.platforms) ? game.platforms : [],
      genres: Array.isArray(game.genres) ? game.genres : []
    };
  }

  mergeGameData(summary, details) {
    return {
      rawgId: details?.id ?? summary.id,
      name: details?.name ?? summary.name,
      slug: details?.slug ?? summary.slug ?? null,
      description: details?.description_raw ?? null,
      released: details?.released ?? summary.released ?? null,
      backgroundImage: details?.background_image ?? summary.background_image ?? null,
      rating: details?.rating ?? summary.rating ?? null,
      ratingsCount: details?.ratings_count ?? summary.ratings_count ?? null,
      metacritic: details?.metacritic ?? summary.metacritic ?? null,
      platforms: Array.isArray(details?.platforms) && details.platforms.length ? details.platforms : (Array.isArray(summary.platforms) ? summary.platforms : []),
      genres: Array.isArray(details?.genres) && details.genres.length ? details.genres : (Array.isArray(summary.genres) ? summary.genres : [])
    };
  }

  async upsertGame(gameData) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const insertValues = [
        gameData.name,
        gameData.rawgId,
        gameData.slug,
        gameData.description,
        this.normalizeDate(gameData.released),
        gameData.backgroundImage,
        this.normalizeRating(gameData.rating),
        this.normalizeInt(gameData.ratingsCount),
        this.normalizeInt(gameData.metacritic)
      ];

      const [result] = await conn.query(
        `INSERT INTO games (name, rawg_id, slug, description, released, background_image, rating, ratings_count, metacritic)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           slug = VALUES(slug),
           description = VALUES(description),
           released = VALUES(released),
           background_image = VALUES(background_image),
           rating = VALUES(rating),
           ratings_count = VALUES(ratings_count),
           metacritic = VALUES(metacritic),
           rawg_id = IFNULL(rawg_id, VALUES(rawg_id))`,
        insertValues
      );

      const [rows] = await conn.query('SELECT id FROM games WHERE rawg_id = ? OR name = ? LIMIT 1', [gameData.rawgId, gameData.name]);
      if (!rows.length) throw new Error('Falha ao localizar ID do jogo recém inserido');
      const gameId = rows[0].id;

      const platforms = await this.resolvePlatforms(conn, gameData.platforms);
      const genres = await this.resolveGenres(conn, gameData.genres);

      await conn.query('DELETE FROM game_platforms WHERE game_id = ?', [gameId]);
      if (platforms.length) {
        const values = platforms.flatMap((platformId) => [gameId, platformId]);
        const placeholders = platforms.map(() => '(?, ?)').join(', ');
        await conn.query(`INSERT INTO game_platforms (game_id, platform_id) VALUES ${placeholders}`, values);
      }

      await conn.query('DELETE FROM game_genres WHERE game_id = ?', [gameId]);
      if (genres.length) {
        const values = genres.flatMap((genreId) => [gameId, genreId]);
        const placeholders = genres.map(() => '(?, ?)').join(', ');
        await conn.query(`INSERT INTO game_genres (game_id, genre_id) VALUES ${placeholders}`, values);
      }

      await conn.commit();
      const created = result.affectedRows === 1;
      const updated = result.affectedRows > 1;
      return { created, updated };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async resolvePlatforms(conn, rawgPlatforms) {
    const ids = [];
    for (const entry of rawgPlatforms || []) {
      const name = entry?.platform?.name?.trim();
      if (!name) continue;
      const normalized = name.toUpperCase();
      if (this.platformCache.has(normalized)) {
        ids.push(this.platformCache.get(normalized));
        continue;
      }
      const [rows] = await conn.query('SELECT id FROM platforms WHERE UPPER(name) = ? LIMIT 1', [normalized]);
      if (rows.length) {
        this.platformCache.set(normalized, rows[0].id);
        ids.push(rows[0].id);
        continue;
      }
      const [result] = await conn.query('INSERT INTO platforms (name) VALUES (?)', [name]);
      this.platformCache.set(normalized, result.insertId);
      ids.push(result.insertId);
    }
    return [...new Set(ids)];
  }

  async resolveGenres(conn, rawgGenres) {
    const ids = [];
    for (const entry of rawgGenres || []) {
      const name = entry?.name?.trim();
      if (!name) continue;
      const normalized = name.toUpperCase();
      if (this.genreCache.has(normalized)) {
        ids.push(this.genreCache.get(normalized));
        continue;
      }
      const [rows] = await conn.query('SELECT id FROM genres WHERE UPPER(name) = ? LIMIT 1', [normalized]);
      if (rows.length) {
        this.genreCache.set(normalized, rows[0].id);
        ids.push(rows[0].id);
        continue;
      }
      const [result] = await conn.query('INSERT INTO genres (name) VALUES (?)', [name]);
      this.genreCache.set(normalized, result.insertId);
      ids.push(result.insertId);
    }
    return [...new Set(ids)];
  }

  normalizeDate(value) {
    if (!value) return null;
    const trimmed = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  }

  normalizeRating(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return null;
    return Number(Math.min(Math.max(numeric, 0), 999).toFixed(1));
  }

  normalizeInt(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric)) return null;
    if (numeric < 0) return 0;
    return numeric;
  }

  async retryAsync(fn, { label }) {
    let attempt = 0;
    let lastError;
    while (attempt < this.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= this.maxRetries) break;
        const waitMs = Math.round(this.delayMs * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1));
        this.logger.warn(`Falha ao recuperar ${label} (tentativa ${attempt}/${this.maxRetries}): ${error.message}. Repetindo em ${waitMs}ms...`);
        await this.sleep(waitMs);
      }
    }
    throw lastError;
  }

  sleep(ms) {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  logHeader() {
    this.logger.log('=== Importador RAWG -> WebLoc ===');
    this.logger.log(`Page size: ${this.pageSize}`);
    this.logger.log(`Delay entre requisições: ${this.delayMs} ms`);
    if (this.maxPages) this.logger.log(`Limite de páginas: ${this.maxPages}`);
    this.logger.log(`Página inicial: ${this.startPage}`);
    this.logger.log(`Ordering: ${this.ordering || 'padrão'}`);
    this.logger.log(`Detalhes individuais: ${this.fetchDetails ? 'sim' : 'não'}`);
    this.logger.log(`Dry-run: ${this.dryRun ? 'sim' : 'não'}`);
    this.logger.log(`Tentativas por requisição: ${this.maxRetries}`);
  }
}
