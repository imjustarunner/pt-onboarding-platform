/** Trusted payroll comparison facts. Never exposes descriptions, event titles, dates, identities or raw payloads to a worker. */
import pool from '../config/database.js';
import { assistantDigest, assistantError } from './assistantTeamPolicy.js';
import { overlapsRecordedAttendance } from '../utils/eventTravelOverlap.js';

const VERSION = 'assistant-payroll-facts-v1';
const STATUSES = "'submitted','returned','needs_changes','deferred','approved','paid'";
const KEYS = { total_minutes: 'totalMinutes', minutes: 'minutes', source_name: 'source', kiosk_punch: 'kioskPunchInId', schedule_event: 'scheduleEventId', bucket_role: 'bucketRole', sibling_claim: 'siblingClaimId', clock_start: 'clockInAt', clock_end: 'clockOutAt', travel_start: 'travelStartedAt', travel_end: 'travelEndedAt', generic_start: 'startedAt', generic_end: 'endedAt' };
const projection = `c.id,c.agency_id,c.user_id,c.status,c.claim_type,c.suggested_payroll_period_id,c.updated_at,${Object.entries(KEYS).map(([alias, key]) => `JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.${key}')) ${alias}`).join(',')}`;
const positiveId = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const fail = code => assistantError(503, code, 'Payroll validation facts require staff review. No validation packet was released.');
export function parseAssistantPayrollMinutes(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10080 ? number : null;
}
function instant(value) {
  const raw = String(value || '');
  if (raw.length > 40 || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const number = Date.parse(raw), calendarDay = Date.parse(raw.slice(0, 10));
  if (!Number.isFinite(calendarDay) || new Date(calendarDay).toISOString().slice(0, 10) !== raw.slice(0, 10)) return null;
  return Number.isFinite(number) ? number : null;
}
function interval(row) {
  for (const [startKey, endKey, kind] of [['travel_start', 'travel_end', 'travel'], ['clock_start', 'clock_end', row.claim_type === 'skill_builder_event' ? 'attendance' : 'other'], ['generic_start', 'generic_end', 'other']]) {
    if ((!row[startKey] || row[startKey] === 'null') && (!row[endKey] || row[endKey] === 'null')) continue;
    const start = instant(row[startKey]), end = instant(row[endKey]);
    return start != null && end != null && end > start && end - start <= 86400000 ? { start, end, kind } : null;
  }
  return null;
}
function fact(row) {
  const bucket = ['direct', 'indirect', 'other_1', 'other_2', 'other_3'].includes(row.bucket_role) ? row.bucket_role : null;
  const ignored = ['supervision_payroll_correction', 'direct_care_auto_indirect_carryover'].includes(row.source_name);
  const kiosk = row.claim_type === 'skill_builder_event' ? positiveId(row.kiosk_punch) : null;
  const meeting = row.claim_type === 'meeting_training' ? positiveId(row.schedule_event) : null;
  return { id: Number(row.id), agencyId: Number(row.agency_id), userId: Number(row.user_id), status: String(row.status), claimType: String(row.claim_type), suggestedPeriodId: positiveId(row.suggested_payroll_period_id), updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at || null,
    minutes: parseAssistantPayrollMinutes(row.total_minutes === 'null' ? row.minutes : row.total_minutes ?? row.minutes), ignored, origin: ignored ? null : kiosk ? { kind: 'kiosk', id: kiosk } : meeting ? { kind: 'meeting', id: meeting } : null, bucket, siblingId: positiveId(row.sibling_claim), interval: ignored ? null : interval(row) };
}
function intentionalSplit(left, right) {
  if (!left.origin || left.origin.kind !== 'kiosk' || !right.origin || right.origin.kind !== 'kiosk' || left.origin.id !== right.origin.id) return false;
  // Kiosk attendance deliberately creates direct + remainder claims for one shift.
  return !!left.bucket && !!right.bucket && ((left.bucket === 'direct') !== (right.bucket === 'direct'));
}
function duplicateSource(left, right) {
  if (!left.origin || !right.origin || left.origin.kind !== right.origin.kind || left.origin.id !== right.origin.id || intentionalSplit(left, right)) return false;
  if (left.origin.kind === 'kiosk' && (!left.bucket || !right.bucket)) return false;
  return true;
}
function overlap(left, right) {
  if (!left.interval || !right.interval || intentionalSplit(left, right)) return false;
  const a = left.interval, b = right.interval;
  // Reuse the existing minute-input boundary rule for travel versus attendance.
  if (a.kind === 'travel' && b.kind === 'attendance') return overlapsRecordedAttendance({ startedAt: new Date(a.start), endedAt: new Date(a.end) }, { startedAt: new Date(b.start), endedAt: new Date(b.end) });
  if (b.kind === 'travel' && a.kind === 'attendance') return overlapsRecordedAttendance({ startedAt: new Date(b.start), endedAt: new Date(b.end) }, { startedAt: new Date(a.start), endedAt: new Date(a.end) });
  return a.start < b.end && a.end > b.start;
}
export function computeAssistantPayrollFlags(target, peers) {
  let duplicateCount = 0, overlapCount = 0, unverifiedCount = 0;
  for (const peer of peers) {
    if (peer.id === target.id || peer.agencyId !== target.agencyId || peer.userId !== target.userId || peer.ignored || intentionalSplit(target, peer)) continue;
    if (duplicateSource(target, peer)) duplicateCount++;
    if (!target.interval || !peer.interval) unverifiedCount++;
    else if (overlap(target, peer)) overlapCount++;
  }
  const flags = [];
  if (duplicateCount) flags.push('POSSIBLE_DUPLICATE_SOURCE_EVENT');
  if (overlapCount) flags.push('RECORDED_TIME_OVERLAP');
  if (!target.interval || unverifiedCount) flags.push('OVERLAP_NOT_VERIFIABLE');
  if (target.origin?.kind === 'kiosk' && !target.bucket) flags.push('EVENT_SPLIT_REQUIRES_REVIEW');
  return { flags, counts: { possibleDuplicateSources: duplicateCount, recordedTimeOverlaps: overlapCount, unverifiablePeerIntervals: unverifiedCount } };
}

export async function readAssistantPayrollSnapshot({ agencyId, sourceId, maxPeers = 1000 }, db = pool) {
  if (!positiveId(agencyId) || !positiveId(sourceId)) throw fail('PAYROLL_FACTS_SCOPE_INVALID');
  const limit = Math.max(1, Math.min(1000, Math.trunc(Number(maxPeers) || 1000)));
  let conn, transaction = false;
  try {
    conn = typeof db.getConnection === 'function' ? await db.getConnection() : db;
    if (conn !== db && conn.query && conn.rollback) {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await conn.query('START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT'); transaction = true;
    }
    const [[raw]] = await conn.execute(`SELECT ${projection} FROM payroll_time_claims c WHERE c.agency_id=? AND c.id=?`, [Number(agencyId), Number(sourceId)]);
    if (!raw || Number(raw.agency_id) !== Number(agencyId) || !positiveId(raw.user_id)) throw fail('PAYROLL_FACTS_SOURCE_UNAVAILABLE');
    const target = fact(raw), peers = []; let after = 0;
    for (;;) {
      const [rows] = await conn.execute(`SELECT ${projection} FROM payroll_time_claims c WHERE c.agency_id=? AND c.user_id=? AND c.id>? AND c.status IN (${STATUSES}) ORDER BY c.id LIMIT 200`, [Number(agencyId), Number(raw.user_id), after]);
      for (const row of rows) {
        if (Number(row.agency_id) !== target.agencyId || Number(row.user_id) !== target.userId || !positiveId(row.id)) throw fail('PAYROLL_FACTS_SCOPE_INVALID');
        if (Number(row.id) !== target.id) peers.push(fact(row));
        if (peers.length > limit) throw fail('PAYROLL_PEER_LIMIT_EXCEEDED');
      }
      if (rows.length < 200) break;
      const next = Number(rows.at(-1).id); if (next <= after) throw fail('PAYROLL_PEER_SCAN_INCOMPLETE'); after = next;
    }
    const validation = computeAssistantPayrollFlags(target, peers);
    return { target, peers, validation, sourceRevision: assistantDigest({ version: VERSION, target, peers }) };
  } catch (cause) {
    if (String(cause?.code || '').startsWith('PAYROLL_')) throw cause;
    throw fail('PAYROLL_FACTS_UNAVAILABLE');
  } finally {
    try { if (transaction) await conn.rollback(); } finally { if (conn && conn !== db) conn.release(); }
  }
}
