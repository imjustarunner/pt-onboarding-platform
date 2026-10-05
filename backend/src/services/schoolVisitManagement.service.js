import Task from '../models/Task.model.js';
import Notification from '../models/Notification.model.js';
import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { normalizeSchoolVisitRequest, normalizeSchoolVisitUpdate } from '../utils/schoolVisitChange.js';
import { updateSchoolPortalEvent } from './schoolPortalEvents.service.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export async function loadSchoolVisit(id, db = pool) {
  const [[row]] = await db.execute(`SELECT b.*, a.name school_name FROM school_reinit_checkin_bookings b
    JOIN agencies a ON a.id=b.school_agency_id JOIN agencies parent ON parent.id=b.agency_id AND parent.slug='itsco'
    WHERE b.id=?`, [id]);
  if (!row) fail('School visit not found', 404);
  return row;
}
export function publicSchoolVisit(row) {
  return { id: row.id, schoolName: row.school_name, startsAt: utcMysqlToIso(row.starts_at), endsAt: utcMysqlToIso(row.ends_at),
    modality: row.modality, location: row.location_text, meetLink: row.meet_link, status: row.status,
    revision: row.visit_revision, calendarSyncStatus: row.calendar_sync_status };
}
export async function canManageSchoolVisit(user, booking) {
  if (user?.role === 'super_admin') return true;
  if (!user?.id) return false;
  const [[membership]] = await pool.execute('SELECT 1 allowed FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1', [user.id, booking.agency_id]);
  if (!membership) return false;
  if (['admin', 'support', 'staff', 'clinical_practice_assistant'].includes(user.role)) return true;
  const [[host]] = await pool.execute('SELECT 1 allowed FROM school_reinit_checkin_slot_host_events WHERE slot_id=? AND host_user_id=?', [booking.slot_id, user.id]);
  return !!host;
}
async function withVisitLock(id, fn) {
  const db = await pool.getConnection(); let locked = false;
  const name = `school-visit-reminder:${id}`;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) acquired', [name]);
    locked = !!lock.acquired;
    if (!locked) fail('This visit is being updated. Please try again.', 409);
    return await fn(db);
  } finally { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [name]); db.release(); }
}

async function notifyVisitRequest(booking, requestId, db) {
  const [hosts] = await db.execute('SELECT host_user_id FROM school_reinit_checkin_slot_host_events WHERE slot_id=?', [booking.slot_id]);
  for (const host of hosts) {
    const [[existing]] = await db.execute("SELECT id FROM tasks WHERE source_ref_type='school_visit_request' AND source_ref_id=? AND assigned_to_user_id=? LIMIT 1", [String(requestId), host.host_user_id]);
    const task = existing || await Task.create({ taskType: 'custom', title: `School visit change requested — ${booking.school_name}`,
      description: `Review the school's request and confirm any new arrangements: /school-visits/${booking.id}/manage`,
      assignedToUserId: host.host_user_id, assignedToAgencyId: booking.agency_id, assignedByUserId: host.host_user_id,
      sourceRefType: 'school_visit_request', sourceRefId: requestId, isPrivate: true,
      metadata: { url: `/school-visits/${booking.id}/manage`, bookingId: booking.id, requestId } });
    await Notification.coalesceOrCreate({ type: 'custom_task_assigned', severity: 'info', title: 'School visit change requested',
      message: `${booking.school_name} requested a change. Open the assigned task to review the visit.`,
      userId: host.host_user_id, agencyId: booking.agency_id, relatedEntityType: 'task', relatedEntityId: task.id });
  }
}
async function completeVisitRequestTasks(requestId) {
  if (!requestId) return;
  const [tasks] = await pool.execute("SELECT id FROM tasks WHERE source_ref_type='school_visit_request' AND source_ref_id=? AND status NOT IN ('completed','overridden')", [String(requestId)]);
  for (const task of tasks) await Task.updateStatus(task.id, 'completed');
}

export async function requestSchoolVisitChange(id, body) {
  const request = normalizeSchoolVisitRequest(body);
  return withVisitLock(id, async db => {
    const booking = await loadSchoolVisit(id, db);
    if (booking.status !== 'booked' || new Date(utcMysqlToIso(booking.ends_at)) < new Date()) fail('This visit is no longer available for change requests. Please contact schools@itsco.health.', 409);
    if (Number(body.revision) !== Number(booking.visit_revision)) fail('The visit details changed. Refresh this page before submitting.', 409);
    const [[existing]] = await db.execute("SELECT id FROM school_reinit_change_requests WHERE entity_type='school_visit' AND entity_id=? AND status='pending' LIMIT 1", [id]);
    if (existing) {
      await notifyVisitRequest(booking, existing.id, db);
      return { requestId: existing.id, alreadyPending: true };
    }
    const [result] = await db.execute(`INSERT INTO school_reinit_change_requests
      (cycle_id,entity_type,entity_id,action,status,before_json,after_json,submitted_by_actor_type,submitted_by_display_name)
      VALUES (?,'school_visit',?,?,'pending',?,?,'token_guest',?)`,
      [booking.cycle_id, id, request.kind === 'cancel' ? 'delete' : 'modify', JSON.stringify(publicSchoolVisit(booking)), JSON.stringify(request), request.name]);
    // Existing school change-request queue remains the record of review. Nothing
    // about an appointment changes until a host/agency member applies an update.
    await notifyVisitRequest(booking, result.insertId, db);
    return { requestId: result.insertId, alreadyPending: false };
  });
}
export async function schoolVisitManagerData(id) {
  const booking = await loadSchoolVisit(id);
  const [requests] = await pool.execute("SELECT id,status,action,after_json,submitted_by_display_name,created_at,resolution_note FROM school_reinit_change_requests WHERE entity_type='school_visit' AND entity_id=? ORDER BY id DESC", [id]);
  const [reminders] = await pool.execute('SELECT delivery_status,last_error,sent_at,recipient FROM school_visit_reminders WHERE booking_id=? ORDER BY id DESC LIMIT 10', [id]);
  const [hosts] = await pool.execute('SELECT h.google_event_id,u.email FROM school_reinit_checkin_slot_host_events h JOIN users u ON u.id=h.host_user_id WHERE h.slot_id=?', [booking.slot_id]);
  const rachel = hosts.find(h => h.email?.toLowerCase() === 'rachel@itsco.health');
  const remote = rachel ? await GoogleCalendarService.getEvent({ subjectEmail: rachel.email, eventId: rachel.google_event_id }) : null;
  return { visit: publicSchoolVisit(booking), calendarSyncError: booking.calendar_sync_error,
    calendar: remote?.ok ? remote.event : null, calendarError: remote && !remote.ok ? remote.reason : null, requests, reminders };
}

async function syncSchoolVisit(booking, actorUserId, db) {
  const [hosts] = await db.execute(`SELECT h.*,u.email FROM school_reinit_checkin_slot_host_events h JOIN users u ON u.id=h.host_user_id WHERE h.slot_id=?`, [booking.slot_id]);
  if (!hosts.length || !GoogleCalendarService.isConfigured()) fail('Host calendar is not configured', 503);
  const cancelled = booking.status === 'cancelled';
  const title = `${booking.modality === 'virtual' ? 'Virtual' : 'In person'} school visit — ${booking.school_name}`;
  let meetLink = booking.meet_link;
  for (const host of hosts) {
    if (!host.google_event_id || !host.email) fail('A linked host calendar event is missing', 503);
    const result = cancelled
      ? await GoogleCalendarService.deleteEvent({ subjectEmail: host.email, eventId: host.google_event_id })
      : await GoogleCalendarService.patchEventDetails({ subjectEmail: host.email, eventId: host.google_event_id,
          summary: title, description: `${title}.\nUpdated in the school visit manager.\n${booking.modality === 'virtual' ? 'Meet virtually using the calendar meeting link.' : `Location: ${booking.location_text}`}`,
          location: booking.modality === 'virtual' ? '' : booking.location_text,
          startAt: utcMysqlToIso(booking.starts_at), endAt: utcMysqlToIso(booking.ends_at), timeZone: 'America/Denver',
          createMeetLink: booking.modality === 'virtual' });
    if (!result?.ok) fail(`Calendar update failed: ${result?.reason || 'unknown'}`, 503);
    if (!cancelled && booking.modality === 'virtual') {
      if (!result.meetLink) fail('The virtual meeting link is not ready. Retry calendar sync.', 503);
      meetLink = result.meetLink;
    }
    if (host.provider_schedule_event_id) await db.execute(`UPDATE provider_schedule_events
      SET start_at=?,end_at=?,status=?,title=?,description=?,google_meet_link=? WHERE id=?`,
      [booking.starts_at, booking.ends_at, cancelled ? 'CANCELLED' : 'ACTIVE', title,
        cancelled ? 'School visit cancelled in visit manager' : title, booking.modality === 'virtual' ? meetLink : null, host.provider_schedule_event_id]);
    await db.execute('UPDATE school_reinit_checkin_slot_host_events SET google_meet_link=? WHERE id=?', [booking.modality === 'virtual' ? meetLink : null, host.id]);
  }
  if (booking.company_event_id) await updateSchoolPortalEvent({ eventId: booking.company_event_id,
    organizationId: booking.school_agency_id, agencyId: booking.agency_id, userId: actorUserId,
    title, description: cancelled ? 'This school visit has been cancelled.' : `${title}\n${booking.modality === 'virtual' ? meetLink : booking.location_text}`,
    startsAt: new Date(utcMysqlToIso(booking.starts_at)), endsAt: new Date(utcMysqlToIso(booking.ends_at)),
    schoolEventStatus: cancelled ? 'canceled' : 'rescheduled' });
  await db.execute("UPDATE school_reinit_checkin_bookings SET meet_link=?,calendar_sync_status='ready',calendar_sync_error=NULL WHERE id=?", [booking.modality === 'virtual' ? meetLink : null, booking.id]);
  await db.execute('UPDATE school_reinit_checkin_slots SET google_meet_link=? WHERE id=?', [booking.modality === 'virtual' ? meetLink : null, booking.slot_id]);
}

export async function manageSchoolVisit(id, body, user) {
  return withVisitLock(id, async db => {
    let booking = await loadSchoolVisit(id, db);
    if (!(await canManageSchoolVisit(user, booking))) fail('You cannot manage this school visit.', 403);
    if (Number(body.revision) !== Number(booking.visit_revision)) fail('The visit changed. Refresh before saving.', 409);
    if (body.action === 'reject_request') {
      const [result] = await db.execute(`UPDATE school_reinit_change_requests SET status='rejected',resolved_by_user_id=?,resolved_at=UTC_TIMESTAMP(),resolution_note=?
        WHERE id=? AND entity_type='school_visit' AND entity_id=? AND status='pending'`,
        [user.id, String(body.note || 'Please follow Rachel’s latest confirmed arrangements.').slice(0, 500), Number(body.requestId), id]);
      if (!result.affectedRows) fail('Pending request not found', 409);
      await completeVisitRequestTasks(body.requestId);
      return { saved: true, synced: true };
    }
    if (body.action !== 'retry_sync') {
      if (booking.status !== 'booked') fail('This visit has been cancelled.', 409);
      const change = normalizeSchoolVisitUpdate(body);
      const [hostRows] = await db.execute('SELECT host_user_id FROM school_reinit_checkin_slot_host_events WHERE slot_id=? ORDER BY host_user_id', [booking.slot_id]);
      if (change.action !== 'cancel') {
        for (const host of hostRows) {
          const [[conflict]] = await db.execute(`SELECT id FROM provider_schedule_events WHERE provider_id=? AND status='ACTIVE'
            AND start_at<? AND end_at>? AND id NOT IN (SELECT provider_schedule_event_id FROM school_reinit_checkin_slot_host_events WHERE slot_id=? AND provider_schedule_event_id IS NOT NULL) LIMIT 1`,
            [host.host_user_id, change.endsAt, change.startsAt, booking.slot_id]);
          if (conflict) fail('A host already has an appointment during that time. Choose another time.', 409);
        }
      }
      await db.beginTransaction();
      try {
        const next = change.action === 'cancel' ? { ...booking, status: 'cancelled' } : { ...booking,
          starts_at: change.startsAt, ends_at: change.endsAt, modality: change.modality, location_text: change.location,
          location_mode: change.modality === 'virtual' ? 'virtual' : 'school' };
        next.visit_revision = Number(booking.visit_revision) + 1;
        await db.execute(`UPDATE school_reinit_checkin_bookings SET starts_at=?,ends_at=?,modality=?,location_text=?,location_mode=?,status=?,
          visit_revision=?,calendar_sync_status='pending',calendar_sync_error=NULL WHERE id=?`,
          [next.starts_at, next.ends_at, next.modality, next.location_text, next.location_mode, next.status, next.visit_revision, id]);
        await db.execute('UPDATE school_reinit_checkin_slots SET starts_at=?,ends_at=?,modality=?,status=?,is_active=? WHERE id=?',
          [next.starts_at, next.ends_at, next.modality, next.status, next.status === 'cancelled' ? 0 : 1, booking.slot_id]);
        await db.execute('INSERT INTO school_visit_changes(booking_id,revision,action,before_json,after_json,actor_user_id) VALUES(?,?,?,?,?,?)',
          [id, next.visit_revision, change.action, JSON.stringify(publicSchoolVisit(booking)), JSON.stringify(publicSchoolVisit(next)), user.id]);
        if (body.requestId) {
          const [resolved] = await db.execute(`UPDATE school_reinit_change_requests SET status='approved',resolved_by_user_id=?,resolved_at=UTC_TIMESTAMP(),resolution_note='Applied in school visit manager'
            WHERE id=? AND entity_type='school_visit' AND entity_id=? AND status='pending'`, [user.id, Number(body.requestId), id]);
          if (!resolved.affectedRows) fail('The request was already resolved. Refresh this visit.', 409);
        }
        await db.execute("UPDATE school_visit_reminders SET delivery_status='obsolete',last_error='Visit changed' WHERE booking_id=? AND delivery_status IN ('pending','review')", [id]);
        await db.commit(); booking = next;
      } catch (error) { await db.rollback(); throw error; }
    }
    try {
      await syncSchoolVisit(booking, user.id, db);
      await completeVisitRequestTasks(body.requestId);
      return { saved: true, synced: true, message: booking.status === 'cancelled' ? 'Visit cancelled. Linked calendar invitations have been cancelled.' : 'Visit updated. Linked calendar invitations have been updated.' };
    } catch (error) {
      await db.execute("UPDATE school_reinit_checkin_bookings SET calendar_sync_status='error',calendar_sync_error=? WHERE id=?", [String(error.message).slice(0, 500), id]);
      return { saved: true, synced: false, message: 'Saved in the app. Calendar sync needs attention; reminders are paused until sync succeeds.', error: error.message };
    }
  });
}
