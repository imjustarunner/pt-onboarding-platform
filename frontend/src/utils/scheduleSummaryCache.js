/**
 * Simple cache for schedule-summary responses.
 * TTL: 90 seconds - balances freshness with instant display on revisit.
 * Caller builds key from userId, agencyIds, weekStart, overlay params.
 */
const CACHE_TTL_MS = 90 * 1000;
const cache = new Map();

export function getScheduleSummary(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setScheduleSummary(key, data) {
  cache.set(key, { data, at: Date.now() });
}

export function invalidateScheduleSummaryCacheForUser(userId) {
  const uid = Number(userId || 0);
  if (!uid) return;
  const prefix = `${uid}|`;
  for (const key of cache.keys()) {
    if (String(key).startsWith(prefix)) cache.delete(key);
  }
}

export function clearScheduleSummaryCache() {
  cache.clear();
}
