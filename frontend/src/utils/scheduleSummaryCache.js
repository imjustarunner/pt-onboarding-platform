/**
 * Cache for schedule-summary responses.
 * Memory TTL 90s + sessionStorage warm paint so My Schedule can show last week instantly.
 */
const CACHE_TTL_MS = 90 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_PREFIX = 'sched_summary_v1:';
const cache = new Map();

function sessionKey(key) {
  return `${SESSION_PREFIX}${key}`;
}

export function getScheduleSummary(key) {
  const pack = getScheduleSummaryStale(key);
  return pack?.fresh ? pack.data : null;
}

/**
 * Return cached schedule data for instant paint.
 * - fresh: within memory TTL (caller can skip network)
 * - stale: sessionStorage hit older than memory TTL (paint, then refresh)
 */
export function getScheduleSummaryStale(key) {
  const entry = cache.get(key);
  if (entry?.data) {
    const age = Date.now() - Number(entry.at || 0);
    if (age <= CACHE_TTL_MS) {
      return { data: entry.data, fresh: true };
    }
  }
  try {
    const raw = sessionStorage.getItem(sessionKey(key));
    if (!raw) {
      if (entry) cache.delete(key);
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.at) return null;
    const storedAt = Number(parsed.at);
    if (!Number.isFinite(storedAt) || Date.now() - storedAt > SESSION_TTL_MS) {
      sessionStorage.removeItem(sessionKey(key));
      if (entry) cache.delete(key);
      return null;
    }
    // Keep original timestamp so "fresh" stays false after memory TTL.
    cache.set(key, { data: parsed.data, at: storedAt });
    return {
      data: parsed.data,
      fresh: Date.now() - storedAt <= CACHE_TTL_MS
    };
  } catch {
    return null;
  }
}

export function setScheduleSummary(key, data) {
  const at = Date.now();
  cache.set(key, { data, at });
  try {
    sessionStorage.setItem(sessionKey(key), JSON.stringify({ data, at }));
  } catch {
    // quota / private mode — memory cache still works
  }
}

export function invalidateScheduleSummaryCacheForUser(userId) {
  const uid = Number(userId || 0);
  if (!uid) return;
  const prefix = `${uid}|`;
  for (const key of [...cache.keys()]) {
    if (String(key).startsWith(prefix)) cache.delete(key);
  }
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX + prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function clearScheduleSummaryCache() {
  cache.clear();
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}
