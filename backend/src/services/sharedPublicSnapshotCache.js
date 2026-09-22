import { createHash, randomUUID } from 'node:crypto';

// The store owns leases, so separate Cloud Run instances coalesce the same refresh.
// Only explicitly public DTOs belong here. Never use this for booking validation.
export function createSharedPublicSnapshotCache({ store, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), waitMs = 55000 }) {
  const inFlight = new Map();
  return async function readSnapshot({ key, kind, providerId = null, ttlSeconds = 60 }, load) {
    const cacheKey = createHash('sha256').update(JSON.stringify(key)).digest('hex');
    if (!inFlight.has(cacheKey)) {
      const job = (async () => {
        const deadline = now() + waitMs;
        while (now() <= deadline) {
          const hit = await store.read(cacheKey);
          if (hit !== null) return hit;
          const token = randomUUID();
          if (await store.claim({ cacheKey, kind, providerId, token })) {
            try {
              const value = await load();
              // An edit can invalidate a snapshot while it is being built. A lost
              // lease must not republish or return the obsolete result.
              if (await store.publish({ cacheKey, token, value, ttlSeconds })) return value;
            } finally {
              await store.release(cacheKey, token);
            }
          }
          await sleep(200);
        }
        throw Object.assign(new Error('Availability is being refreshed. Please try again shortly.'), { status: 503 });
      })();
      inFlight.set(cacheKey, job);
      void job.finally(() => { if (inFlight.get(cacheKey) === job) inFlight.delete(cacheKey); }).catch(() => {});
    }
    // Callers filter/sort results independently; never share mutable objects.
    return structuredClone(await inFlight.get(cacheKey));
  };
}

export function createMysqlPublicSnapshotStore(pool) {
  return {
    async read(cacheKey) {
      const [rows] = await pool.execute(`SELECT payload FROM public_read_snapshots
        WHERE cache_key=? AND expires_at>UTC_TIMESTAMP(3) AND payload IS NOT NULL`, [cacheKey]);
      if (!rows[0]) return null;
      return typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    },
    async claim({ cacheKey, kind, providerId, token }) {
      await pool.execute(`INSERT IGNORE INTO public_read_snapshots (cache_key,kind,provider_id) VALUES (?,?,?)`, [cacheKey, kind, providerId]);
      const [result] = await pool.execute(`UPDATE public_read_snapshots
        SET lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 90 SECOND)
        WHERE cache_key=? AND (expires_at IS NULL OR expires_at<=UTC_TIMESTAMP(3))
          AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))`, [token, cacheKey]);
      return result.affectedRows === 1;
    },
    async publish({ cacheKey, token, value, ttlSeconds }) {
      const [result] = await pool.execute(`UPDATE public_read_snapshots
        SET payload=?,expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),lease_token=NULL,lease_until=NULL
        WHERE cache_key=? AND lease_token=? AND lease_until>UTC_TIMESTAMP(3)`, [JSON.stringify(value), ttlSeconds, cacheKey, token]);
      return result.affectedRows === 1;
    },
    async release(cacheKey, token) {
      await pool.execute('UPDATE public_read_snapshots SET lease_token=NULL,lease_until=NULL WHERE cache_key=? AND lease_token=?', [cacheKey, token]);
    }
  };
}
