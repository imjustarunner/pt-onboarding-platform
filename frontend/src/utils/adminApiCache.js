/**
 * In-memory cache for admin dashboard API responses.
 * TTL: 60 seconds - balances freshness with faster repeat navigation.
 */
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function getKey(url, params = {}) {
  const p = typeof params === 'object' && params !== null
    ? Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&')
    : '';
  return `${url}${p ? `?${p}` : ''}`;
}

export function getCached(url, params) {
  const key = getKey(url, params);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(url, params, data) {
  const key = getKey(url, params);
  cache.set(key, { data, at: Date.now() });
}
