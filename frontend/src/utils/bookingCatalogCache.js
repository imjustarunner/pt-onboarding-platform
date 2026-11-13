/** Share concurrent catalog reads and reuse them while the same booking is edited. */
export function createBookingCatalogCache(api, { ttlMs = 60000, now = Date.now } = {}) {
  const entries = new Map();
  return async (path, params, { force = false } = {}) => {
    const key = `${path}:${params.agencyId}:${params.providerId}`;
    const current = entries.get(key);
    if (current?.pending) return current.pending;
    if (!force && current && current.expiresAt > now()) return current.data;
    const entry = {};
    entry.pending = api.get(path, { params, skipGlobalLoading: true }).then(response => {
      entry.data = response.data; entry.expiresAt = now() + ttlMs; entry.pending = null;
      return entry.data;
    }).catch(error => { entries.delete(key); throw error; });
    entries.set(key, entry);
    return entry.pending;
  };
}
