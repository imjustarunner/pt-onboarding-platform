import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { utcDateToZonedYmd, toUtcIso } from '../utils/zonedWallTime.util.js';
import { recordEventEmployeeClockIn, recordEventEmployeeClockOut } from './skillBuildersEventKioskPunch.service.js';
import { isEventCoordinator } from './companyEventOperations.service.js';
import { EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (raw) => { try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { return {}; } };
const ymd = (raw) => raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw || '').slice(0, 10);

export async function loadEmployeeEvent({ eventId, userId, db = pool }) {
  const eid = Number(eventId), uid = Number(userId);
  if (!Number.isInteger(eid) || eid <= 0 || !Number.isInteger(uid) || uid <= 0) fail(400, 'Valid event and user IDs are required');
  const [rows] = await db.execute(
    `SELECT e.id, e.agency_id, e.title, e.starts_at, e.ends_at, e.timezone, e.is_active, e.school_event_status, u.role AS user_role
     FROM company_events e
     JOIN user_agencies ua ON ua.agency_id = e.agency_id AND ua.user_id = ? AND COALESCE(ua.is_active, 1) = 1
     JOIN users u ON u.id = ua.user_id AND COALESCE(u.is_archived, 0) = 0 AND u.is_active = 1 AND u.terminated_at IS NULL
       AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL})
     WHERE e.id = ? AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING', 'PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN') LIMIT 1`, [uid, eid]);
  const event = rows?.[0];
  if (!event) fail(404, 'Event not found');
  return event;
}

export async function employeeAssignedToEvent({ event, userId, date, anyDate = false, db = pool }) {
  const [rows] = await db.execute(
    `SELECT 1 AS assigned FROM company_event_provider_assignments WHERE company_event_id = ? AND provider_user_id = ?
     UNION ALL
     SELECT 1 FROM company_event_session_providers sp
     JOIN company_event_session_dates sd ON sd.id = sp.session_date_id AND sd.company_event_id = sp.company_event_id
     WHERE sp.company_event_id = ? AND sp.agency_id = ? AND sp.provider_user_id = ? AND sp.assignment_status = 'finalized' ${anyDate ? '' : 'AND sd.session_date = ?'}
     UNION ALL
     SELECT 1 FROM skills_group_providers gp JOIN skills_groups g ON g.id = gp.skills_group_id
     WHERE g.company_event_id = ? AND g.agency_id = ? AND gp.provider_user_id = ? LIMIT 1`,
    [event.id, userId, event.id, event.agency_id, userId, ...(anyDate ? [] : [date]), event.id, event.agency_id, userId]);
  return !!rows?.length;
}

export async function isEmployeeEventDay({ event, date, db = pool }) {
  const [sessions] = await db.execute('SELECT session_date FROM company_event_session_dates WHERE company_event_id = ?', [event.id]);
  if (sessions.length) return sessions.some((s) => ymd(s.session_date) === date);
  const start = utcDateToZonedYmd(event.starts_at, event.timezone), end = utcDateToZonedYmd(event.ends_at, event.timezone);
  return !!start && !!end && date >= start && date <= end;
}

export async function getEmployeeEventParticipation({ eventId, userId, db = pool, now = new Date() }) {
  const event = await loadEmployeeEvent({ eventId, userId, db });
  const date = utcDateToZonedYmd(now, event.timezone);
  const assigned = await employeeAssignedToEvent({ event, userId, date, db });
  const canSubmitTravel = assigned || await employeeAssignedToEvent({ event, userId, anyDate: true, db });
  const [punches] = await db.execute(
    'SELECT id, punch_type, punched_at, session_id FROM skill_builders_event_kiosk_punches WHERE company_event_id = ? AND user_id = ? ORDER BY punched_at DESC, id DESC LIMIT 1', [event.id, userId]);
  const last = punches?.[0] || null;
  const clockedIn = last?.punch_type === 'clock_in';
  const isEventDay = await isEmployeeEventDay({ event, date, db });
  const canManage = ['super_admin', 'admin', 'support', 'staff'].includes(String(event.user_role || '').toLowerCase())
    || await isEventCoordinator({ userId, agencyId: event.agency_id, eventId: event.id });
  return { eventId: Number(event.id), agencyId: Number(event.agency_id), userId: Number(userId), assigned, canSubmitTravel, clockedIn, isEventDay, canManage,
    canCheckIn: assigned && isEventDay && Number(event.is_active) === 1 && event.school_event_status !== 'canceled' && !clockedIn, canCheckOut: clockedIn,
    timezone: event.timezone || 'America/Denver', today: date,
    lastPunch: last ? { id: Number(last.id), type: last.punch_type, at: toUtcIso(last.punched_at), sessionId: last.session_id } : null,
    travelClaimDefaults: { categoryGroup: 'support_activity', serviceTypeKey: 'approved_travel', companyEventId: Number(event.id), eventWorkType: 'travel' } };
}

export function eventCheckoutInstant(checkoutAt, now = new Date()) {
  if (checkoutAt == null) return now;
  if (typeof checkoutAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(checkoutAt)) {
    fail(400, 'Checkout time must include a date and timezone');
  }
  const chosen = new Date(checkoutAt);
  if (!Number.isFinite(chosen.getTime())) fail(400, 'Enter a valid checkout time');
  if (chosen > now) fail(400, 'Checkout time cannot be in the future');
  return chosen;
}

export async function recordEmployeeEventParticipation({ eventId, userId, action, checkoutAt = null, ip = null, now = new Date(), source = 'employee_event_link', idempotencyKey = null }) {
  if (!['check-in', 'check-out'].includes(action)) fail(400, 'Invalid attendance action');
  if (action !== 'check-out' && checkoutAt != null) fail(400, 'A checkout time can only be supplied when checking out');
  const clockOutAt = action === 'check-out' ? eventCheckoutInstant(checkoutAt, now) : null;
  const db = await pool.getConnection();
  let result;
  try {
    await db.beginTransaction();
    // Attendance and event travel use the same lock, including concurrent phone taps.
    await db.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const event = await loadEmployeeEvent({ eventId, userId, db });
    if (idempotencyKey) {
      const [receipt] = await db.execute(`INSERT IGNORE INTO company_event_checkin_sms_receipts
        (provider_message_id, user_id, company_event_id, action) VALUES (?, ?, ?, ?)`, [idempotencyKey, userId, event.id, action]);
      if (!receipt.affectedRows) { await db.commit(); return { ok: true, alreadyProcessed: true }; }
    }
    const date = utcDateToZonedYmd(now, event.timezone);
    if (action === 'check-in') {
      if (Number(event.is_active) !== 1 || event.school_event_status === 'canceled') fail(409, 'This event is inactive or canceled');
      if (!(await isEmployeeEventDay({ event, date, db }))) fail(409, 'Check-in is available on the event date');
      if (!(await employeeAssignedToEvent({ event, userId, date, db }))) fail(403, 'A coordinator must assign you before you can check in');
    } else {
      const [punches] = await db.execute(`SELECT id, punch_type, punched_at FROM skill_builders_event_kiosk_punches
        WHERE company_event_id = ? AND user_id = ? ORDER BY punched_at DESC, id DESC LIMIT 1`, [event.id, userId]);
      const last = punches[0];
      if (!last || last.punch_type !== 'clock_in') fail(409, 'You are not currently clocked in to this event');
      if (clockOutAt <= new Date(toUtcIso(last.punched_at))) fail(400, 'Checkout time must be after your clock-in time');
    }
    result = action === 'check-in'
      ? await recordEventEmployeeClockIn(db, { eventId: event.id, agencyId: event.agency_id, userId, kioskDateYmd: date, punchedAt: now, source })
      : await recordEventEmployeeClockOut(db, { eventId: event.id, agencyId: event.agency_id, userId, clockOutAt,
        source: checkoutAt != null ? `${source}_manual_time` : source });
    if (idempotencyKey && action === 'check-in' && result.error?.status === 409 && result.error.message.startsWith('Already clocked in')) {
      await db.commit(); return { ok: true, alreadyProcessed: true };
    }
    if (result.error) fail(result.error.status, result.error.message);
    if (action === 'check-in') {
      await db.execute(`INSERT INTO event_day_kiosk_checkins
        (company_event_id, agency_id, user_id, person_type, action, checked_in_at, kiosk_date, ip_address)
        VALUES (?, ?, ?, 'employee', 'check_in', ?, ?, ?)`, [event.id, event.agency_id, userId, now, date, ip]);
    } else {
      await db.execute(`UPDATE event_day_kiosk_checkins SET action = 'check_out', checked_out_at = ?, updated_at = NOW()
        WHERE company_event_id = ? AND agency_id = ? AND user_id = ? AND person_type = 'employee' AND action = 'check_in' AND voided_at IS NULL
        ORDER BY checked_in_at DESC, id DESC LIMIT 1`,
      [clockOutAt, event.id, event.agency_id, userId]);
    }
    await db.commit();
  } catch (err) { await db.rollback(); throw err; } finally { db.release(); }
  return { ...result, ...(await getEmployeeEventParticipation({ eventId, userId })) };
}

export function eventTravelInterval(payload, now = new Date()) {
  const explicitInstant = (raw) => typeof raw === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw);
  if (!explicitInstant(payload?.travelStartedAt) || !explicitInstant(payload?.travelEndedAt)) fail(400, 'Travel start and end must include a timezone');
  const start = new Date(payload.travelStartedAt), end = new Date(payload.travelEndedAt);
  const minutes = Math.round((end - start) / 60000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) fail(400, 'Enter a valid departure date/time and arrival date/time.');
  if (end <= start) fail(400, 'Arrival must be after departure. Check both dates and AM/PM.');
  if (end - start > 24 * 3600000) fail(400, 'This trip is longer than 24 hours. Enter only this part of the journey and check both dates and AM/PM.');
  if (minutes < 1) fail(400, 'Enter at least one minute between departure and arrival.');
  if (end > now) fail(400, 'Travel time cannot end in the future');
  return { start, end, minutes };
}

export async function validateEventTravelPayload({ agencyId, userId, claimDate, payload, excludeClaimId = null, db = pool, now = new Date() }) {
  if (!payload?.companyEventId || payload.eventWorkType !== 'travel') fail(400, 'An event and travel work type are required');
  const event = await loadEmployeeEvent({ eventId: payload.companyEventId, userId, db });
  if (Number(event.agency_id) !== Number(agencyId)) fail(403, 'Event does not belong to this organization');
  const { start, end, minutes } = eventTravelInterval(payload, now);
  const date = utcDateToZonedYmd(end, event.timezone);
  if (ymd(claimDate) !== date) fail(400, 'Travel claim date must match the travel end date in the event timezone');
  if (!(await employeeAssignedToEvent({ event, userId, date, db }))) fail(403, 'Event travel requires a coordinator assignment');
  if (!(await isEmployeeEventDay({ event, date, db }))) fail(400, 'Event travel must be on an event date');
  if (payload.categoryGroup !== 'support_activity') fail(400, 'Event travel must use Support Activity Time');
  if (payload.travelDirection != null && !['to_event', 'from_event'].includes(payload.travelDirection)) fail(400, 'Choose travel to or from the event');
  const [types] = await db.execute(`SELECT id, label FROM payroll_indirect_service_types WHERE agency_id = ? AND type_key = 'approved_travel' AND pay_bucket = 'support' AND is_active = 1 LIMIT 1`, [agencyId]);
  const type = types?.[0];
  if (!type) fail(409, 'Approved Travel is not enabled for this organization');
  const allocations = payload.allocations || [];
  if (Number(payload.totalMinutes) !== minutes || allocations.length !== 1 || Number(allocations[0].serviceTypeId) !== Number(type.id) || Number(allocations[0].minutes) !== minutes) fail(400, 'Travel allocation must match the actual travel interval and Approved Travel category');
  const [overlap] = await db.execute(
    `SELECT p.id FROM skill_builders_event_kiosk_punches p JOIN company_events e ON e.id = p.company_event_id
     WHERE p.user_id = ? AND e.agency_id = ? AND p.punch_type = 'clock_in' AND p.punched_at < ?
       AND COALESCE((SELECT MIN(o.punched_at) FROM skill_builders_event_kiosk_punches o
                     WHERE o.company_event_id = p.company_event_id AND o.user_id = p.user_id AND o.punch_type = 'clock_out' AND o.punched_at >= p.punched_at), ?) > ? LIMIT 1`,
    [userId, agencyId, end, now, start]);
  if (overlap.length) fail(409, 'Travel overlaps time already recorded at an event');
  const [claims] = await db.execute(`SELECT id, payload_json FROM payroll_time_claims WHERE agency_id = ? AND user_id = ? AND status IN ('submitted', 'approved', 'paid', 'deferred') AND claim_type = 'indirect_time' AND id != ?`, [agencyId, userId, excludeClaimId || 0]);
  for (const claim of claims) {
    const other = json(claim.payload_json);
    const intervals = other.eventTravelReport?.segments || [{ startedAt: other.travelStartedAt || other.clockInAt || other.startedAt, endedAt: other.travelEndedAt || other.clockOutAt || other.endedAt }];
    for (const interval of intervals) {
      const otherStart = new Date(interval.startedAt), otherEnd = new Date(interval.endedAt);
      if (Number.isFinite(otherStart.getTime()) && Number.isFinite(otherEnd.getTime()) && start < otherEnd && end > otherStart) fail(409, 'Travel overlaps a pending or approved time claim');
    }
  }
  return { ...payload, companyEventId: Number(event.id), eventTitle: event.title, eventTimezone: event.timezone || 'America/Denver', source: 'company_event_travel',
    eventWorkType: 'travel', travelStartedAt: start.toISOString(), travelEndedAt: end.toISOString(), totalMinutes: minutes,
    allocations: [{ serviceTypeId: Number(type.id), serviceTypeKey: 'approved_travel', serviceTypeLabel: type.label, minutes, payBucket: 'support' }] };
}

export async function buildEventTravelClaim({ eventId, userId, travelStartedAt, travelEndedAt, travelDirection = null, attestation = false, db = pool }) {
  const event = await loadEmployeeEvent({ eventId, userId, db });
  const interval = eventTravelInterval({ travelStartedAt, travelEndedAt });
  const [types] = await db.execute(`SELECT id, label FROM payroll_indirect_service_types WHERE agency_id = ? AND type_key = 'approved_travel' AND pay_bucket = 'support' AND is_active = 1 LIMIT 1`, [event.agency_id]);
  const type = types?.[0];
  if (!type) fail(409, 'Approved Travel is not enabled for this organization');
  const claimDate = utcDateToZonedYmd(interval.end, event.timezone);
  const payload = await validateEventTravelPayload({ agencyId: event.agency_id, userId, claimDate, db, payload: {
    companyEventId: Number(event.id), eventWorkType: 'travel', categoryGroup: 'support_activity', travelStartedAt, travelEndedAt, travelDirection,
    attestation: attestation === true, entryMethod: 'manual', allocationMode: 'duration', totalMinutes: interval.minutes,
    allocations: [{ serviceTypeId: type.id, serviceTypeKey: 'approved_travel', serviceTypeLabel: type.label, minutes: interval.minutes, payBucket: 'support' }]
  } });
  return { agencyId: Number(event.agency_id), claimDate, claimType: 'indirect_time', payload };
}

export async function persistEventTravelClaim(args, { existingClaimId = null } = {}) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [args.userId]);
    if (existingClaimId) {
      const [existing] = await db.execute('SELECT status FROM payroll_time_claims WHERE id = ? AND user_id = ? AND agency_id = ? FOR UPDATE', [existingClaimId, args.userId, args.agencyId]);
      if (!existing[0] || !['submitted', 'withdrawn', 'deferred', 'rejected'].includes(existing[0].status)) fail(409, 'Only pending or returned travel claims can be edited');
    }
    const payload = await validateEventTravelPayload({ ...args, excludeClaimId: existingClaimId, db });
    const result = existingClaimId
      ? await PayrollTimeClaim.resubmit({ id: existingClaimId, claimDate: args.claimDate, payload, db })
      : await PayrollTimeClaim.create({ ...args, payload, db });
    await db.commit();
    return result;
  } catch (err) { await db.rollback(); throw err; } finally { db.release(); }
}
