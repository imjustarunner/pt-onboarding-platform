import { AsyncLocalStorage } from 'node:async_hooks';
import pool from '../config/database.js';
import { databasePoolLimits } from '../config/databasePoolLimits.js';

const activeDraftLock = new AsyncLocalStorage();
// Existing diagnosis/audit helpers may need a second main-pool connection while
// finalization owns the draft lock. Always leave capacity for those queries.
const connectionLimit = pool.pool?.config?.connectionLimit || databasePoolLimits().connectionLimit;
const maxConcurrentLocks = Math.min(4, connectionLimit - 1);
let concurrentLocks = 0;
const busy = () => Object.assign(new Error('This intake note is being updated. Wait for that change to finish, then reload and review it before trying again.'), { status: 409, code: 'INTAKE_DRAFT_BUSY' });

export function intakeDraftDatabase() { return activeDraftLock.getStore()?.connection || pool; }

/** Serialize reviewed finalization and every draft mutation across backend instances. */
export async function withIntakeDraftMutationLock(draftId, operation) {
  const id = Number(draftId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid draftId');
  const active = activeDraftLock.getStore();
  if (active?.draftId === id) return operation();
  // There are no multi-draft mutations in this flow. Reject nesting rather than
  // allowing two requests to acquire different draft locks in opposite order.
  if (maxConcurrentLocks < 1) throw Object.assign(new Error('Intake note updates are temporarily unavailable. Your draft is preserved; contact your administrator.'), { status: 503, code: 'INTAKE_DRAFT_LOCK_UNAVAILABLE' });
  if (active || concurrentLocks >= maxConcurrentLocks) throw busy();
  concurrentLocks += 1;
  let connection;
  const lockName = `intake-draft:${id}`;
  let acquired = false;
  let releaseFailed = false;
  try {
    connection = await pool.getConnection();
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) throw busy();
    return await activeDraftLock.run({ draftId: id, connection }, operation);
  } finally {
    try {
      if (acquired) await connection.execute('SELECT RELEASE_LOCK(?) AS released', [lockName]);
    } catch {
      // Never return a connection with an uncertain lock to the pool, or turn a
      // successful finalization into an error that invites an accidental retry.
      releaseFailed = true;
      try { connection.destroy(); } catch { /* connection is already closed */ }
      console.error('[intakeDraftMutationLock] Lock connection was closed after release failed');
    } finally {
      concurrentLocks -= 1;
      if (connection && !releaseFailed) connection.release();
    }
  }
}
