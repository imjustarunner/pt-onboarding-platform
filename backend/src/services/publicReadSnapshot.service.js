import pool from '../config/database.js';
import { createMysqlPublicSnapshotStore, createSharedPublicSnapshotCache } from './sharedPublicSnapshotCache.js';

const sharedRead = createSharedPublicSnapshotCache({ store: createMysqlPublicSnapshotStore(pool) });
let missingTableUntil = 0;
let cleanupAfter = 0;

export async function readPublicSnapshot(options, load) {
  // Tests of consuming services keep their existing DB fixtures; the cache itself
  // is tested separately with multiple instances and with the real MySQL adapter.
  if (process.env.PUBLIC_READ_CACHE_ENABLED === '0' || (process.env.NODE_ENV === 'test' && process.env.PUBLIC_READ_CACHE_ENABLED !== '1')) return load();
  if (Date.now() < missingTableUntil) return load();
  try {
    const value = await sharedRead(options, load);
    // Bound persisted week keys as calendars move forward. Do not remove leases.
    if (Date.now() > cleanupAfter) {
      cleanupAfter = Date.now() + 3600000;
      await pool.execute(`DELETE FROM public_read_snapshots WHERE updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)
        AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP(3)) LIMIT 500`).catch(() => {});
    }
    return value;
  } catch (error) {
    // Rolling deployments can briefly precede the migration. Other errors must
    // not fan out into uncached calendar rebuilds or be cached as empty schedules.
    if (error.code !== 'ER_NO_SUCH_TABLE' || !String(error.message).includes('public_read_snapshots')) throw error;
    missingTableUntil = Date.now() + 10000;
    console.warn('[public snapshots] Waiting for public_read_snapshots migration');
    return load();
  }
}
