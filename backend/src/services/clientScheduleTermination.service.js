import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';

export const isTerminatedClient = client => String(client?.client_status_key || client?.status_key || '').toLowerCase() === 'terminated'
  || String(client?.client_status_label || '').toLowerCase().includes('terminated');

// Called with the same transaction as Client.update, so a committed termination
// always has a durable retry even if either database is temporarily unavailable.
export async function enqueueClientScheduleTermination(db, clientId, actorUserId) {
  const [[client]] = await db.execute(`SELECT c.id, s.status_key, s.label AS client_status_label
    FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=?`, [clientId]);
  if (!isTerminatedClient(client)) return null;
  const [result] = await db.execute('INSERT INTO client_schedule_termination_jobs (client_id,actor_user_id) VALUES (?,?)', [clientId, actorUserId]);
  return result.insertId;
}

export async function restoreTerminatedClientRoom(eventId, clientId, actorUserId, cutoffAt) {
  const event = await OfficeEvent.findById(eventId);
  if (!event) return;
  const cancelled = await OfficeEvent.withRoomSlotLock({ roomId: event.room_id, startAt: event.start_at, endAt: event.end_at }, async db => {
    const [[current]] = await db.execute('SELECT * FROM office_events WHERE id=? FOR UPDATE', [eventId]);
    if (!current || (current.client_id && Number(current.client_id) !== Number(clientId))) return false;
    // A shared appointment still needs its room after one participant leaves.
    const [remaining] = await db.execute(`SELECT p.id FROM appointment_participants p JOIN appointments a ON a.id=p.appointment_id
      WHERE a.office_event_id=? AND p.client_id<>? AND p.role IN ('client','student')
      AND a.status IN ('scheduled','confirmed') LIMIT 1`, [eventId, clientId]);
    if (remaining.length) {
      await db.execute('UPDATE office_events SET client_id=NULL WHERE id=? AND client_id=?', [eventId, clientId]);
      return false;
    }
    await db.execute(`UPDATE office_events SET status='CANCELLED',slot_state=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND start_at>=?`, [eventId, cutoffAt]);
    let assignment = null;
    if (current.standing_assignment_id) {
      [[assignment]] = await db.execute('SELECT * FROM office_standing_assignments WHERE id=? AND is_active=1', [current.standing_assignment_id]);
      if (assignment) await db.execute(`UPDATE office_standing_assignments SET client_booking_released_at=COALESCE(client_booking_released_at,?) WHERE id=?`, [cutoffAt, assignment.id]);
    }
    const provider = assignment?.provider_id || current.assigned_provider_id || current.booked_provider_id;
    if (!provider) return true;
    // Keep the cancelled, linked row as history. A distinct unlinked row is safe
    // to reopen for another client, and retries see that row instead of cloning it.
    const [active] = await db.execute(`SELECT id FROM office_events WHERE room_id=? AND start_at<? AND end_at>?
      AND status<>'CANCELLED' FOR UPDATE`, [current.room_id, current.end_at, current.start_at]);
    const originalContext = typeof current.session_context_json === 'string' ? JSON.parse(current.session_context_json) : current.session_context_json;
    const availabilityContext = JSON.stringify({ agencyId: assignment?.booking_agency_id || originalContext?.agencyId || null, bookingSource:'office_assignment' });
    if (!active.length) await db.execute(`INSERT INTO office_events
      (office_location_id,room_id,start_at,end_at,status,slot_state,standing_assignment_id,assigned_provider_id,source,created_by_user_id,session_context_json)
      VALUES (?,?,?,?,'RELEASED','ASSIGNED_AVAILABLE',?,?,'SUPPORT',?,?)`,
    [current.office_location_id,current.room_id,current.start_at,current.end_at,assignment?.id || null,provider,actorUserId || current.created_by_user_id,availabilityContext]);
    return true;
  });
  if (!cancelled) return;
  OfficeScheduleMaterializer.invalidateOffice(event.office_location_id);
  if (event.google_provider_event_id) {
    const { default: Google } = await import('./googleCalendar.service.js');
    const result = await Google.cancelBookedOfficeEvent({ officeEventId: event.id });
    if (!result?.ok && !result?.skipped) throw Object.assign(new Error('Room calendar cancellation needs retry'), {code:'ROOM_CALENDAR_RETRY'});
  }
}

async function cancelAppointmentItem(job, item) {
  const snapshot = typeof item.snapshot_json === 'string' ? JSON.parse(item.snapshot_json) : item.snapshot_json;
  const { appointment: a, participants } = snapshot;
  let group = false;
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[current]] = await db.execute('SELECT status FROM appointments WHERE id=? FOR UPDATE', [a.id]);
    if (!current || !['scheduled','confirmed','draft','canceled_by_organization'].includes(current.status)) {
      await db.rollback();
      return;
    }
    const [remainingClients] = await db.execute(`SELECT id FROM appointment_participants WHERE appointment_id=? AND client_id<>? AND role IN ('client','student')`, [a.id,job.client_id]);
    group = remainingClients.length > 0;
    if (group) {
      // Original participants are retained in the durable audit snapshot.
      await db.execute('DELETE FROM appointment_participants WHERE appointment_id=? AND client_id=?', [a.id,job.client_id]);
      await db.execute(`UPDATE appointment_billing SET payment_status='review',responsible_client_id=NULL,
        notes='Client terminated; select a new responsible party before settlement.' WHERE appointment_id=? AND responsible_client_id=?`, [a.id,job.client_id]);
    } else {
      await db.execute(`UPDATE appointments SET status='canceled_by_organization',cancellation_reason='Client terminated',
        cancellation_fee_cents=0,canceled_at=COALESCE(canceled_at,CURRENT_TIMESTAMP),canceled_by_user_id=?,updated_by_user_id=? WHERE id=?`, [job.actor_user_id,job.actor_user_id,a.id]);
      if (a.provider_schedule_event_id) await db.execute(`UPDATE provider_schedule_events SET status='CANCELLED',recurrence_stopped=1,recurrence_calendar_pending=1,updated_by_user_id=? WHERE id=?`, [job.actor_user_id,a.provider_schedule_event_id]);
    }
    await db.execute(`UPDATE appointment_reminders SET status='canceled' WHERE appointment_id=? AND status='pending'${group ? ` AND recipient_participant_id IN (${participants.filter(p => Number(p.client_id) === Number(job.client_id)).map(() => '?').join(',') || 'NULL'})` : ''}`, group ? [a.id,...participants.filter(p => Number(p.client_id) === Number(job.client_id)).map(p => p.id)] : [a.id]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  const entitlement = group && a.package_entitlement_id ? await BookingPackage.findEntitlementById(a.package_entitlement_id,a.agency_id) : null;
  if (a.package_entitlement_id && (!group || Number(entitlement?.clientId) === Number(job.client_id))) {
    await BookingPackage.applyAppointmentUsage({ entitlementId:a.package_entitlement_id,agencyId:a.agency_id,appointmentId:a.id,mode:'release',actorUserId:job.actor_user_id });
    if (group) {
      await pool.execute('UPDATE appointments SET package_entitlement_id=NULL WHERE id=?', [a.id]);
      await pool.execute("UPDATE appointment_billing SET package_entitlement_id=NULL,payment_status='review' WHERE appointment_id=?", [a.id]);
    }
  }
  if (group) {
    const [[remainingSession]] = await clinicalPool.execute(`SELECT id FROM clinical_sessions WHERE appointment_id=? AND client_id<>?
      AND encounter_status NOT IN ('cancelled','canceled','voided') ORDER BY id LIMIT 1`, [a.id,job.client_id]);
    await pool.execute('UPDATE appointments SET clinical_session_id=? WHERE id=?', [remainingSession?.id || null,a.id]);
  }
  if (a.office_event_id) await restoreTerminatedClientRoom(a.office_event_id,job.client_id,job.actor_user_id,job.cutoff_at);
}

export async function processClientScheduleTermination(jobId) {
  const [[job]] = await pool.execute('SELECT client_id FROM client_schedule_termination_jobs WHERE id=?', [jobId]);
  if (!job) return { completed: true };
  return withClientSchedulingLock([job.client_id], () => processLockedTermination(jobId), { allowCleanup: true });
}
async function processLockedTermination(jobId) {
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [`client_schedule_termination:${jobId}`]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) return { pending: true };
    const [[job]] = await db.execute('SELECT * FROM client_schedule_termination_jobs WHERE id=? AND completed_at IS NULL', [jobId]);
    if (!job) return { completed: true };
    await db.execute('UPDATE client_schedule_termination_jobs SET attempts=attempts+1 WHERE id=?', [jobId]);
    // Stop plan renewal before touching occurrences; serialize with explicit
    // series creation so its last occurrence cannot arrive after cleanup.
    const [plans] = await db.execute(`SELECT p.id,p.standing_assignment_id FROM office_booking_plans p WHERE p.is_active=1
      AND (JSON_UNQUOTE(JSON_EXTRACT(p.session_context_json,'$.clientId'))=?
        OR (JSON_EXTRACT(p.session_context_json,'$.clientId') IS NULL AND EXISTS
          (SELECT 1 FROM office_events e WHERE e.booking_plan_id=p.id AND e.client_id=? AND e.start_at>=? AND e.status='BOOKED')))`,
    [String(job.client_id),job.client_id,job.cutoff_at]);
    for (const plan of plans) {
      const lockName = `office_session_plan:${plan.id}`;
      const [[planLock]] = await db.execute('SELECT GET_LOCK(?,8) AS acquired', [lockName]);
      if (Number(planLock?.acquired) !== 1) throw Object.assign(new Error('Series busy'), { code:'SERIES_BUSY' });
      try {
        await db.execute('UPDATE office_booking_plans SET is_active=0 WHERE id=?', [plan.id]);
        await db.execute('UPDATE office_standing_assignments SET client_booking_released_at=COALESCE(client_booking_released_at,?) WHERE id=?', [job.cutoff_at,plan.standing_assignment_id]);
      } finally { await db.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
    }
    const [appointments] = await db.execute(`SELECT DISTINCT a.* FROM appointments a LEFT JOIN appointment_participants p ON p.appointment_id=a.id
      LEFT JOIN office_events e ON e.id=a.office_event_id WHERE (p.client_id=? OR e.client_id=?) AND a.start_at>=? AND a.status IN ('scheduled','confirmed','draft')`, [job.client_id,job.client_id,job.cutoff_at]);
    for (const appointment of appointments) {
      const [participants] = await db.execute('SELECT * FROM appointment_participants WHERE appointment_id=?', [appointment.id]);
      const snapshot = {
        appointment: Object.fromEntries(['id','agency_id','office_event_id','provider_schedule_event_id','package_entitlement_id','start_at','end_at','status'].map(key => [key,appointment[key]])),
        participants: participants.map(({id,client_id,role,is_billing_responsible}) => ({id,client_id,role,is_billing_responsible}))
      };
      await db.execute('INSERT IGNORE INTO client_schedule_termination_items (job_id,appointment_id,snapshot_json) VALUES (?,?,?)', [jobId,appointment.id,JSON.stringify(snapshot)]);
    }
    const [items] = await db.execute('SELECT * FROM client_schedule_termination_items WHERE job_id=? AND completed_at IS NULL', [jobId]);
    for (const item of items) {
      await cancelAppointmentItem(job,item);
      await db.execute('UPDATE client_schedule_termination_items SET completed_at=CURRENT_TIMESTAMP WHERE job_id=? AND appointment_id=?', [jobId,item.appointment_id]);
    }
    // Also release reservations not yet linked to a canonical appointment.
    const [rooms] = await db.execute(`SELECT e.id FROM office_events e LEFT JOIN office_booking_plans p ON p.id=e.booking_plan_id
      WHERE (e.client_id=? OR (e.client_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(p.session_context_json,'$.clientId'))=?))
        AND e.start_at>=? AND (e.status='BOOKED' OR (e.status='CANCELLED' AND e.google_provider_event_id IS NOT NULL))`, [job.client_id,String(job.client_id),job.cutoff_at]);
    for (const room of rooms) await restoreTerminatedClientRoom(room.id,job.client_id,job.actor_user_id,job.cutoff_at);
    await db.execute(`UPDATE provider_schedule_events e SET status='CANCELLED',recurrence_stopped=1,
      recurrence_calendar_pending=1,updated_by_user_id=? WHERE e.client_id=? AND e.start_at>=? AND e.status='ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id
        WHERE a.provider_schedule_event_id=e.id AND p.client_id<>? AND a.status IN ('scheduled','confirmed'))`,
    [job.actor_user_id,job.client_id,job.cutoff_at,job.client_id]);
    await clinicalPool.execute(`UPDATE clinical_sessions SET encounter_status='cancelled',claim_blocked_reason='Client terminated; future session cancelled',updated_at=CURRENT_TIMESTAMP
      WHERE client_id=? AND scheduled_start_at>=? AND encounter_status IN ('scheduled','confirmed','cancelled') AND billing_encounter_id IS NULL`, [job.client_id,job.cutoff_at]);
    await db.execute('UPDATE client_schedule_termination_jobs SET completed_at=CURRENT_TIMESTAMP,last_error_code=NULL WHERE id=?', [jobId]);
    return { completed:true,cancelled:items.length };
  } catch (error) {
    await db.execute('UPDATE client_schedule_termination_jobs SET last_error_code=? WHERE id=?', [String(error.code || 'CLEANUP_FAILED').slice(0,100),jobId]);
    throw error;
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [`client_schedule_termination:${jobId}`]); }
    finally { db.release(); }
  }
}

export async function processPendingClientScheduleTerminations() {
  const [jobs] = await pool.execute('SELECT id FROM client_schedule_termination_jobs WHERE completed_at IS NULL ORDER BY id LIMIT 20');
  for (const job of jobs) {
    try { await processClientScheduleTermination(job.id); }
    catch (error) { console.warn('[client termination schedule] Retry pending',job.id,error.code || 'CLEANUP_FAILED'); }
  }
}
