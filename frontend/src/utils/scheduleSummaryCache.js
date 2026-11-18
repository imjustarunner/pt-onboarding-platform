/**
 * Cache for schedule-summary responses.
 * Memory TTL 90s + sessionStorage warm paint so My Schedule can show last week instantly.
 */
import { invalidateScheduleSummaryRequests } from './scheduleSummaryRequests';

const CACHE_TTL_MS = 90 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_PREFIX = 'sched_summary_v3:';
const cache = new Map();
const revisions = new Map();
let cacheGeneration = 0;
export function scheduleSummaryRevision(userId) {
  return `${cacheGeneration}:${revisions.get(Number(userId)) || 0}:${scheduleCacheIdentity()}`;
}
function scheduleCacheIdentity() {
  try {
    return JSON.stringify([localStorage.getItem('sessionId'), JSON.parse(localStorage.getItem('user') || 'null')?.id, JSON.parse(localStorage.getItem('user') || 'null')?.role,
      JSON.parse(localStorage.getItem('currentAgency') || 'null')?.id, sessionStorage.getItem('__pt_demo_window_user__')]);
  } catch { return 'unavailable'; }
}
const scopedKey = key => `${key}|viewer:${scheduleCacheIdentity()}`;
const MAX_WEEKS = 12;

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
  const storageKey = scopedKey(key);
  const entry = cache.get(storageKey);
  if (entry?.data) {
    const age = Date.now() - Number(entry.at || 0);
    if (age <= SESSION_TTL_MS) {
      return { data: entry.data, fresh: age <= CACHE_TTL_MS };
    }
  }
  try {
    const raw = sessionStorage.getItem(sessionKey(storageKey));
    if (!raw) {
      if (entry) cache.delete(storageKey);
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.at) return null;
    const storedAt = Number(parsed.at);
    if (!Number.isFinite(storedAt) || Date.now() - storedAt > SESSION_TTL_MS) {
      sessionStorage.removeItem(sessionKey(storageKey));
      if (entry) cache.delete(storageKey);
      return null;
    }
    // Keep original timestamp so "fresh" stays false after memory TTL.
    cache.set(storageKey, { data: parsed.data, at: storedAt });
    while (cache.size > MAX_WEEKS) cache.delete(cache.keys().next().value);
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
  const storageKey = scopedKey(key);
  cache.delete(storageKey);
  cache.set(storageKey, { data, at });
  while (cache.size > MAX_WEEKS) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
    try { sessionStorage.removeItem(sessionKey(oldest)); } catch { /* optional storage */ }
  }
  try {
    // Bound storage across remounts/reloads, not only the current memory map.
    const stored = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const name = sessionStorage.key(i);
      if (name?.startsWith(SESSION_PREFIX) && name !== sessionKey(storageKey)) {
        let savedAt = 0;
        try { savedAt = Number(JSON.parse(sessionStorage.getItem(name))?.at) || 0; } catch { /* expired */ }
        stored.push({ name, at: savedAt });
      }
    }
    stored.sort((a,b) => a.at - b.at);
    while (stored.length >= MAX_WEEKS) sessionStorage.removeItem(stored.shift().name);
    sessionStorage.setItem(sessionKey(storageKey), JSON.stringify({ data, at }));
  } catch {
    // quota / private mode — memory cache still works
  }
}

export function invalidateScheduleSummaryCacheForUser(userId) {
  const uid = Number(userId || 0);
  if (!uid) return;
  revisions.set(uid, (revisions.get(uid) || 0) + 1);
  invalidateScheduleSummaryRequests(uid);
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
  cacheGeneration += 1;
  invalidateScheduleSummaryRequests();
  cache.clear();
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith(SESSION_PREFIX) || k.startsWith('sched_summary_v2:'))) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}
