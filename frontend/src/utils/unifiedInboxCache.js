// Short-lived, memory-only snapshots. Never persist message bodies to browser storage.
const snapshots = new Map();
const ttl = 5 * 60 * 1000;
export function clearUnifiedInboxCache() { snapshots.clear(); }
export function readUnifiedInboxCache(key) {
  const entry = snapshots.get(key);
  if (!entry || Date.now() - entry.at > ttl) { snapshots.delete(key); return null; }
  return entry.value;
}
export function writeUnifiedInboxCache(key, value) {
  snapshots.delete(key);
  snapshots.set(key, { at: Date.now(), value });
  while (snapshots.size > 12) snapshots.delete(snapshots.keys().next().value);
}
