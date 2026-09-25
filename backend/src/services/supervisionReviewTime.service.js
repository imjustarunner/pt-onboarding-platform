import pool from '../config/database.js';
import { policyError } from './supervisedBillingPolicy.service.js';

// Shared by review-time writes and meeting create/reschedule. Locks span tenants.
export async function withSupervisorTimeLock(userIds, work, source = pool) {
  const db = await source.getConnection();
  const keys = [...new Set(userIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a,b) => a-b).map(id => `supervision-time:${id}`);
  const locked = [];
  try {
    for (const key of keys) {
      const [[row]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
      if (Number(row?.acquired) !== 1) throw policyError(409, 'Another supervision-time update is in progress. Try again.');
      locked.push(key);
    }
    return await work(db);
  } finally {
    for (const key of locked.reverse()) await db.execute('SELECT RELEASE_LOCK(?)', [key]).catch(() => {});
    db.release();
  }
}
export function reviewInterval(input, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.startAt || '') || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.endAt || '')) throw policyError(400, 'Review times must include a timezone offset');
  const start = new Date(input.startAt), end = new Date(input.endAt);
  const minutes = (end - start) / 60000;
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480 || !Number.isInteger(minutes)) throw policyError(400, 'Record 1–480 whole minutes of review work');
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format(start); } catch { throw policyError(400, 'Choose a valid timezone'); }
  if (!input.timezone) throw policyError(400, 'Timezone is required');
  if (input.attested === true && end > now) throw policyError(400, 'Future work can be scheduled but cannot be attested');
  return { startAt: start.toISOString().slice(0,19).replace('T',' '), endAt: end.toISOString().slice(0,19).replace('T',' '), minutes };
}
export async function assertNoReviewTimeOverlap(db, userIds, startAt, endAt, excludeId = 0, allowMissing = false) {
  const ids = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!ids.length) return;
  try {
    const [rows] = await db.execute(`SELECT id FROM supervision_review_time
      WHERE supervisor_user_id IN (${ids.map(() => '?').join(',')}) AND status <> 'void' AND id <> ?
      AND start_at < ? AND end_at > ? LIMIT 1`, [...ids, excludeId, endAt, startAt]);
    if (rows.length) throw policyError(409, 'This time overlaps a scheduled or attested documentation review. Resolve the overlap first.');
  } catch (e) { if (!(allowMissing && e.code === 'ER_NO_SUCH_TABLE')) throw e; }
}
export async function assertNoMeetingOverlap(db, supervisorUserId, startAt, endAt) {
  const [rows] = await db.execute(`SELECT s.id FROM supervision_sessions s
    WHERE (s.supervisor_user_id = ? OR s.co_facilitator_user_id = ? OR s.supervisee_user_id = ?
      OR EXISTS (SELECT 1 FROM supervision_session_attendees a WHERE a.session_id = s.id AND a.user_id = ?)
      OR EXISTS (SELECT 1 FROM supervision_session_presenters p WHERE p.session_id = s.id AND p.user_id = ?))
      AND s.status NOT IN ('CANCELLED','CANCELED','MISSED') AND s.start_at < ? AND s.end_at > ? LIMIT 1`,
  [supervisorUserId, supervisorUserId, supervisorUserId, supervisorUserId, supervisorUserId, endAt, startAt]);
  if (rows.length) throw policyError(409, 'This time overlaps a supervision meeting. Record only separate review time.');
}
