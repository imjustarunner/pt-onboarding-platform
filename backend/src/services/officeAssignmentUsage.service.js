import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { releaseOfficeReservation } from './officeReservationRelease.service.js';
import { utcToZonedMysqlWall, mysqlDateTimeForDateHour } from '../utils/officeEventDateTime.util.js';
import { appointmentMode, reviewStage, twoBusinessDayDeadline, ymd, recurringOfficeBlock, isProtectedInteriorHour } from '../utils/officeSchedulingPolicy.js';

// A 14:30–15:30 appointment protects BOTH the 14:00 and 15:00 hourly assignments.
// Outcomes deliberately do not filter this query: cancellations and no-shows count.
export async function latestOfficeAppointmentDate(db, assignment, today) {
  const zone = assignment.timezone || 'America/Denver';
  const [rows] = await db.execute(`SELECT start_at, end_at FROM appointments
    WHERE provider_user_id = ? AND room_id = ? AND office_location_id = ?
      AND end_at > ?
    UNION ALL
    SELECT start_at, end_at FROM office_events
    WHERE COALESCE(booked_provider_id, assigned_provider_id) = ? AND room_id = ? AND office_location_id = ?
      AND (client_id IS NOT NULL OR clinical_session_id IS NOT NULL) AND end_at > ?`,
  [assignment.provider_id, assignment.room_id, assignment.office_location_id,
    mysqlDateTimeForDateHour(ymd(assignment.transition_date), 0, zone),
    assignment.provider_id, assignment.room_id, assignment.office_location_id,
    mysqlDateTimeForDateHour(ymd(assignment.transition_date), 0, zone)]);
  let latest = '';
  for (const row of rows) {
    const from = utcToZonedMysqlWall(row.start_at, zone);
    const to = utcToZonedMysqlWall(row.end_at, zone);
    const date = from.slice(0, 10);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() !== Number(assignment.weekday)) continue;
    const start = `${date} ${String(assignment.hour).padStart(2, '0')}:00:00`;
    const end = Number(assignment.hour) === 23
      ? `${new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)} 00:00:00`
      : `${date} ${String(Number(assignment.hour) + 1).padStart(2, '0')}:00:00`;
    if (from < end && to > start && date > latest) latest = date;
  }
  return latest;
}

export async function runOfficeUsageReviews() {
  const [assignments] = await pool.execute(`SELECT a.*, p.transition_date, l.timezone, l.name office_name, r.name room_name
    FROM office_standing_assignments a JOIN office_scheduling_policies p ON p.agency_id = a.booking_agency_id
    JOIN office_locations l ON l.id = a.office_location_id JOIN office_rooms r ON r.id = a.room_id
    WHERE a.is_active = TRUE AND p.transition_date IS NOT NULL`);
  const result = { warned: 0, actionRequired: 0, released: 0, errors: [] };
  const lastUseById = new Map();
  const loadUse = async (conn, assignment, today) => {
    const id = Number(assignment.id);
    if (!lastUseById.has(id)) lastUseById.set(id, await latestOfficeAppointmentDate(conn, assignment, today));
    return lastUseById.get(id);
  };
  for (const a of assignments) {
    const today = utcToZonedMysqlWall(new Date(), a.timezone || 'America/Denver').slice(0, 10);
    if (!appointmentMode(a, today)) continue;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const baseline = [ymd(a.transition_date), ymd(a.created_at), ymd(a.available_since_date)].filter(Boolean).sort().at(-1);
      await conn.execute('INSERT IGNORE INTO office_assignment_usage_reviews (assignment_id, cycle_start_date) VALUES (?, ?)', [a.id, baseline]);
      const [[review]] = await conn.execute('SELECT * FROM office_assignment_usage_reviews WHERE assignment_id = ? FOR UPDATE', [a.id]);
      if (review.status === 'released') { await conn.commit(); continue; }
      const lastUse = await loadUse(conn, a, today);
      const block = recurringOfficeBlock(a, assignments, today);
      for (const sibling of block) await loadUse(conn, sibling, today);
      if (isProtectedInteriorHour(a, block, lastUseById, today)) {
        await conn.execute(`UPDATE office_assignment_usage_reviews SET status = 'protected_interior', cycle_start_date = ?,
          warned_at = NULL, action_required_at = NULL, deadline_date = NULL, requested_at = NULL WHERE assignment_id = ?`, [today, a.id]);
        await conn.commit();
        continue;
      }
      // When a protected gap becomes an unused edge, give it a fresh review
      // cycle, never apply an old release deadline from before it was protected.
      if (review.status === 'protected_interior') {
        await conn.execute(`UPDATE office_assignment_usage_reviews SET status = 'monitoring', cycle_start_date = ?,
          warned_at = NULL, action_required_at = NULL, deadline_date = NULL, requested_at = NULL WHERE assignment_id = ?`, [today, a.id]);
        Object.assign(review, { cycle_start_date: today, status: 'monitoring', warned_at: null, action_required_at: null, deadline_date: null });
      }
      const start = [baseline, ymd(review.cycle_start_date), lastUse].filter(Boolean).sort().at(-1);
      if (start > ymd(review.cycle_start_date)) {
        await conn.execute(`UPDATE office_assignment_usage_reviews SET cycle_start_date = ?, warned_at = NULL,
          action_required_at = NULL, deadline_date = NULL, requested_at = NULL, status = 'monitoring' WHERE assignment_id = ?`, [start, a.id]);
        Object.assign(review, { cycle_start_date: start, warned_at: null, deadline_date: null, action_required_at: null, status: 'monitoring' });
      }
      const stage = reviewStage({ today, start, deadline: ymd(review.deadline_date), pending: review.status === 'pending' });
      const label = `${a.office_name} · ${a.room_name} · ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][a.weekday]} ${a.hour}:00–${Number(a.hour) + 1}:00`;
      if (stage === 'release') {
        await releaseOfficeReservation({ assignmentId: a.id, date: today, scope: 'future', actorUserId: a.provider_id, officeLocationId: a.office_location_id });
        await conn.execute("UPDATE office_assignment_usage_reviews SET status = 'released' WHERE assignment_id = ?", [a.id]);
        await notify(a, 'Office assignment released', `${label} was released after the re-request deadline. You can request this office time again through My Schedule.`);
        result.released++;
      } else if (stage === 'action_required' && !review.action_required_at) {
        const [holidays] = await conn.execute('SELECT holiday_date FROM agency_holidays WHERE agency_id = ? AND holiday_date >= ?', [a.booking_agency_id, today]);
        const deadline = twoBusinessDayDeadline(today, holidays.map(h => h.holiday_date));
        await notify(a, 'Action required: request to keep your office time', `${label} has had no qualifying appointment for four weeks. In My Schedule, choose Request to keep this office time by the end of ${deadline} (${a.timezone || 'America/Denver'}). Otherwise the assignment will be released. Cancellations and no-shows count as use.`);
        await conn.execute("UPDATE office_assignment_usage_reviews SET status = 'action_required', action_required_at = UTC_TIMESTAMP(), deadline_date = ? WHERE assignment_id = ?", [deadline, a.id]);
        result.actionRequired++;
      } else if (stage === 'warning' && !review.warned_at) {
        await notify(a, 'Your office time has been unused for two weeks', `${label} has had no qualifying appointment for two weeks. At four weeks you will need to request to keep it. Cancellations and no-shows preserve your assignment. Review this time in My Schedule.`);
        await conn.execute("UPDATE office_assignment_usage_reviews SET status = 'warning', warned_at = UTC_TIMESTAMP() WHERE assignment_id = ?", [a.id]);
        result.warned++;
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      result.errors.push({ assignmentId: a.id, message: error.message });
    } finally { conn.release(); }
  }
  return result;
}
async function notify(a, title, message) {
  await createNotificationAndDispatch({ type: 'office_assignment_usage_review', severity: 'warning', title, message,
    userId: a.provider_id, agencyId: a.booking_agency_id, relatedEntityType: 'office_standing_assignment', relatedEntityId: a.id, actorSource: 'Office Scheduling' });
}
