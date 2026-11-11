// UI preferences only. Never store records, message content, or authentication here.
const storageKey = (userId, view, key) => `auricwell:mobile-view:${Number(userId) || 'local'}:${view}:${key}`;
export function readMobileViewPreference(userId, view, key, fallback) {
  try { const value = localStorage.getItem(storageKey(userId, view, key)); return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}
export function writeMobileViewPreference(userId, view, key, value) {
  try { localStorage.setItem(storageKey(userId, view, key), JSON.stringify(value)); } catch { /* Private browsing can disable preference storage. */ }
}
