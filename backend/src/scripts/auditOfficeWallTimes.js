import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { legacyOfficeWallTimeTarget } from '../utils/officeLegacyWallTime.js';
const apply = process.argv.includes('--apply');
const utc = value => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`);
let conn;
try {
  conn = await pool.getConnection(); await conn.beginTransaction();
  // One transaction keeps corrections, duplicate cancellations, and conflict checks together.
  await conn.execute('SELECT id FROM office_rooms ORDER BY id FOR UPDATE');
  const [rows] = await conn.execute(`SELECT e.*, a.is_active AS assignment_active, a.weekday AS assignment_weekday,
    a.hour AS assignment_hour, a.room_id AS assignment_room_id, a.provider_id AS assignment_provider_id, p.is_active AS active_booking_plan, l.timezone AS office_timezone
    FROM office_events e LEFT JOIN office_standing_assignments a ON a.id=e.standing_assignment_id
    LEFT JOIN office_booking_plans p ON p.id=e.booking_plan_id
    JOIN office_locations l ON l.id=e.office_location_id
    WHERE e.end_at > UTC_TIMESTAMP() AND (e.status IS NULL OR e.status NOT IN ('CANCELLED','CANCELED')) FOR UPDATE`);
  const candidates = rows.map(event => ({ event, target: legacyOfficeWallTimeTarget(event) })).filter(row => row.target);
  const orphanAvailability = rows.filter(event => event.assignment_active === 0 && event.status === 'RELEASED'
    && !event.active_booking_plan && Number(event.assigned_provider_id) === Number(event.assignment_provider_id)
    && !event.client_id && !event.clinical_session_id && !event.billing_context_id && !event.note_context_id);
  const ids = [...candidates.map(row => row.event.id), ...orphanAvailability.map(row => row.id)];
  const protectedIds = new Set();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [appointments] = await conn.execute(`SELECT office_event_id FROM appointments WHERE office_event_id IN (${ph})`, ids);
    const [clinical] = await clinicalPool.execute(`SELECT office_event_id FROM clinical_sessions WHERE office_event_id IN (${ph})`, ids);
    for (const row of [...appointments, ...clinical]) protectedIds.add(Number(row.office_event_id));
  }
  for (const row of [...candidates, ...orphanAvailability.map(event => ({ event }))]) {
    if (row.event.google_provider_event_id || row.event.google_room_event_id || ['COMPLETED','NO_SHOW'].includes(row.event.status_outcome)) protectedIds.add(Number(row.event.id));
  }
  const safe = candidates.filter(row => !protectedIds.has(Number(row.event.id)));
  const safeIds = new Set(safe.map(row => Number(row.event.id)));
  const duplicates = [], moves = [], conflicts = [];
  for (const row of safe) {
    const blockers = rows.filter(other => Number(other.room_id) === Number(row.event.room_id) && !safeIds.has(Number(other.id))
      && utc(other.start_at) < utc(row.target.endAt) && utc(other.end_at) > utc(row.target.startAt));
    const canonical = blockers.length === 1 && Number(blockers[0].standing_assignment_id) === Number(row.event.standing_assignment_id)
      && utc(blockers[0].start_at).getTime() === utc(row.target.startAt).getTime()
      && utc(blockers[0].end_at).getTime() === utc(row.target.endAt).getTime()
      && Number(blockers[0].booked_provider_id || blockers[0].assigned_provider_id) === Number(row.event.booked_provider_id || row.event.assigned_provider_id);
    if (canonical) duplicates.push(row);
    else if (blockers.length) conflicts.push({ id: row.event.id, blockerIds: blockers.map(e => e.id) });
    else moves.push(row);
  }
  const safeOrphans = orphanAvailability.filter(row => !protectedIds.has(Number(row.id)));
  const targets = new Set();
  for (const row of moves) {
    const key = `${row.event.room_id}/${row.target.startAt}/${row.target.endAt}`;
    if (targets.has(key)) conflicts.push({ id: row.event.id, reason: 'duplicate target among proposed corrections' });
    targets.add(key);
  }
  const report = { applied: false, candidates: candidates.length, protectedIds: [...protectedIds], conflicts,
    moves: moves.map(row => ({ id: row.event.id, from: row.event.start_at, to: row.target.startAt })),
    orphanAvailabilityIds: safeOrphans.map(row => row.id),
    duplicateIds: duplicates.map(row => row.event.id) };
  if (apply && (conflicts.length || protectedIds.size)) throw new Error(`Review required: ${conflicts.length} conflicts and ${protectedIds.size} linked records. No changes applied.`);
  if (apply && (safe.length || safeOrphans.length)) {
    // Temporarily free generated active-slot unique keys; all original IDs and history remain.
    const affectedIds = [...safeIds, ...safeOrphans.map(row => row.id)];
    const ph = affectedIds.map(() => '?').join(',');
    await conn.execute(`UPDATE office_events SET status='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE id IN (${ph})`, affectedIds);
    for (const row of moves) {
      await conn.execute("UPDATE office_events SET start_at=?, end_at=?, status=?, google_sync_status='PENDING', updated_at=CURRENT_TIMESTAMP WHERE id=?", [row.target.startAt, row.target.endAt, row.event.status, row.event.id]);
    }
    for (const table of ['provider_virtual_slot_availability','provider_in_person_slot_availability']) {
      await conn.execute(`UPDATE ${table} av JOIN office_events e ON e.id=av.source_event_id SET av.is_active=FALSE WHERE e.id IN (${ph})`, affectedIds);
    }
    await conn.commit(); report.applied = true;
  } else await conn.rollback();
  console.log(JSON.stringify(report));
} catch(error) { if (conn) await conn.rollback(); console.error(error.code || error.message); process.exitCode=1; }
finally { conn?.release(); await pool.end(); await clinicalPool.end(); }
