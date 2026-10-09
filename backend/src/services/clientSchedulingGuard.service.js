import { AsyncLocalStorage } from 'node:async_hooks';
import pool from '../config/database.js';
const held = new AsyncLocalStorage();
export const hasClientSchedulingLock = () => (held.getStore()?.size || 0) > 0;
export function assertClientNotTerminated(client) {
  if (String(client?.client_status_key || client?.status_key || '').toLowerCase() === 'terminated'
      || String(client?.client_status_label || '').toLowerCase().includes('terminated')) {
    throw Object.assign(new Error('This client is terminated. Restore their active status before booking future sessions.'), { status:409,code:'CLIENT_TERMINATED' });
  }
}
// Reentrant across office-plan -> context -> appointment calls in one request.
export async function withClientSchedulingLock(clientIds, work, { allowCleanup = false } = {}) {
  const previous = held.getStore() || new Set();
  const ids = [...new Set(clientIds.map(Number).filter(id => id > 0 && !previous.has(id)))].sort((a,b)=>a-b);
  if (!ids.length) return work();
  const db = await pool.getConnection();
  const locked=[];
  try {
    for (const id of ids) {
      const [[row]] = await db.execute('SELECT GET_LOCK(?,8) AS acquired', [`client-schedule:${id}`]);
      if (Number(row?.acquired)!==1) throw Object.assign(new Error('This client schedule is being updated. Please retry.'), {status:409,code:'CLIENT_SCHEDULE_BUSY'});
      locked.push(id);
    }
    if (!allowCleanup) {
      for (const id of ids) {
        const [pending] = await db.execute('SELECT id FROM client_schedule_termination_jobs WHERE client_id=? AND completed_at IS NULL LIMIT 1', [id]);
        if (pending.length) throw Object.assign(new Error('Client termination cleanup is still finishing. Please retry shortly.'), {status:409,code:'CLIENT_TERMINATION_PENDING'});
      }
    }
    return await held.run(new Set([...previous,...ids]),work);
  } finally {
    for (const id of locked.reverse()) await db.execute('SELECT RELEASE_LOCK(?)',[`client-schedule:${id}`]).catch(()=>{});
    db.release();
  }
}
