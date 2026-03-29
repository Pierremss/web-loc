import dotenv from 'dotenv';
dotenv.config();

if (typeof fetch !== 'function') {
  const { default: fetchPolyfill } = await import('node-fetch');
  globalThis.fetch = fetchPolyfill;
}

const API_BASE_URL = process.env.RAWG_API_BASE_URL || 'https://api.rawg.io/api';
const API_KEY = process.env.RAWG_API_KEY;

function ensureApiKey() {
  if (!API_KEY) {
    throw new Error('RAWG_API_KEY não configurada. Defina no arquivo .env do servidor.');
  }
}

function buildUrl(path, params = {}) {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);
  const searchParams = url.searchParams;
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, value);
  });
  searchParams.set('key', API_KEY);
  return url.toString();
}

async function handleResponse(response) {
  if (!response.ok) {
    const text = await response.text().catch(() => '<sem corpo>');
    const error = new Error(`RAWG API falhou (${response.status} ${response.statusText})`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return response.json();
}

export async function fetchGamesPage({ page = 1, pageSize = 40, ordering, dates, platforms, genres, search } = {}) {
  ensureApiKey();
  const url = buildUrl('/games', {
    page,
    page_size: pageSize,
    ordering,
    dates,
    platforms,
    genres,
    search
  });
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  return handleResponse(response);
}

export async function fetchGameDetails(rawgId) {
  ensureApiKey();
  const url = buildUrl(`/games/${rawgId}`);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  return handleResponse(response);
}

export const rawgClient = {
  fetchGamesPage,
  fetchGameDetails
};
