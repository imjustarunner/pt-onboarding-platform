const FAV_KEY = (userId) => `noteAid:favorites:${userId || 'anon'}`;
const RECENT_KEY = (userId) => `noteAid:recent:${userId || 'anon'}`;
const MAX_RECENT = 8;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function listFavoriteAidIds(userId) {
  const raw = readJson(FAV_KEY(userId), []);
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function isFavoriteAid(userId, aidId) {
  return listFavoriteAidIds(userId).includes(String(aidId || ''));
}

export function toggleFavoriteAid(userId, aidId) {
  const id = String(aidId || '');
  if (!id) return listFavoriteAidIds(userId);
  const set = new Set(listFavoriteAidIds(userId));
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const next = [...set];
  try {
    localStorage.setItem(FAV_KEY(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function listRecentAidIds(userId) {
  const raw = readJson(RECENT_KEY(userId), []);
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => (typeof row === 'string' ? row : row?.aidId)).filter(Boolean).map(String);
}

export function rememberRecentAid(userId, aidId) {
  const id = String(aidId || '');
  if (!id) return listRecentAidIds(userId);
  const next = [id, ...listRecentAidIds(userId).filter((x) => x !== id)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY(userId), JSON.stringify(next.map((aidId) => ({ aidId, at: Date.now() }))));
  } catch {
    /* ignore */
  }
  return next;
}
