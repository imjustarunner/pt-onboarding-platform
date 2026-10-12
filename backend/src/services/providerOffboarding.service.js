import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import BookingPackage from '../models/BookingPackage.model.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';

const inactive = user => Number(user?.is_archived) === 1 || ['ARCHIVED','INACTIVE_EMPLOYEE'].includes(String(user?.status || '').toUpperCase());
const reason = 'Provider archived or inactive; client remains active for reassignment';

async function cleanSchedule(db, job) {
  const uid = Number(job.provider_id);
  const at = job.cutoff_at;
  const actor = job.actor_user_id || null;
  const counts = {};
  const change = async (key, sql, values) => {
    const [result] = await db.execute(sql, values);
    counts[key] = Number(result.affectedRows || 0);
  };
  await db.beginTransaction();
  try {
    const [[user]] = await db.execute('SELECT id,status,is_archived FROM users WHERE id=? FOR UPDATE', [uid]);
    if (!inactive(user)) {
      await db.execute('UPDATE provider_offboarding_jobs SET completed_at=CURRENT_TIMESTAMP,last_error_code=NULL WHERE id=?', [job.id]);
      await db.commit();
      return { skipped: true };
    }
    // Lock and stop the source records first. Future occurrences cannot renew.
    const [assignments] = await db.execute('SELECT id,office_location_id FROM office_standing_assignments WHERE provider_id=? FOR UPDATE', [uid]);
    await change('plans', `UPDATE office_booking_plans p JOIN office_standing_assignments a ON a.id=p.standing_assignment_id
      SET p.is_active=0 WHERE a.provider_id=? AND p.is_active=1`, [uid]);
    await change('assignments', 'UPDATE office_standing_assignments SET is_active=0,bookable_in_person=0,bookable_virtual=0 WHERE provider_id=? AND is_active=1', [uid]);
    await change('legacyReservations', 'DELETE FROM office_room_assignments WHERE assigned_user_id=? AND start_at>=?', [uid,at]);
    await db.execute('UPDATE office_room_assignments SET end_at=? WHERE assigned_user_id=? AND start_at<? AND (end_at IS NULL OR end_at>?)', [at,uid,at,at]);
    await change('requests', "UPDATE office_booking_requests SET status='CANCELLED' WHERE requested_provider_id=? AND status='PENDING'", [uid]);
    await change('legacyRequests', "UPDATE office_room_requests SET status='CANCELLED' WHERE user_id=? AND status='PENDING'", [uid]);
    for (const table of ['provider_office_availability_requests','provider_school_availability_requests']) {
      await db.execute(`UPDATE ${table} SET status='CANCELLED' WHERE provider_id=? AND status='PENDING'`, [uid]);
    }
    await db.execute("UPDATE public_appointment_requests SET status='CANCELLED' WHERE provider_id=? AND status='PENDING'", [uid]);
    await db.execute(`UPDATE public_provider_slot_holds SET released_at=UTC_TIMESTAMP(3),resolution='PROVIDER_INACTIVE',resolved_by_user_id=?
      WHERE provider_id=? AND released_at IS NULL`, [actor,uid]);

    const [appointments] = await db.execute(`SELECT id,agency_id,package_entitlement_id FROM appointments
      WHERE provider_user_id=? AND start_at>=? AND status IN ('draft','scheduled','confirmed') FOR UPDATE`, [uid,at]);
    for (const a of appointments) {
      await db.execute(`INSERT IGNORE INTO provider_offboarding_items (job_id,item_kind,item_id,snapshot_json) VALUES (?,'appointment',?,?)`, [job.id,a.id,JSON.stringify(a)]);
      await db.execute(`UPDATE appointments SET status='canceled_by_organization',cancellation_reason=?,cancellation_fee_cents=0,
        canceled_at=COALESCE(canceled_at,CURRENT_TIMESTAMP),canceled_by_user_id=?,updated_by_user_id=? WHERE id=?`, [reason,actor,actor,a.id]);
      await db.execute("UPDATE appointment_reminders SET status='canceled' WHERE appointment_id=? AND status='pending'", [a.id]);
    }
    counts.appointments = appointments.length;

    // A different clinician may have claimed released room time. Keep their
    // booked occurrence, but detach it from the departing provider's template.
    await db.execute(`UPDATE office_events e LEFT JOIN office_standing_assignments a ON a.id=e.standing_assignment_id
      SET e.booking_plan_id=IF(a.provider_id=?,NULL,e.booking_plan_id),
        e.standing_assignment_id=IF(a.provider_id=?,NULL,e.standing_assignment_id),e.assigned_provider_id=e.booked_provider_id
      WHERE (a.provider_id=? OR e.assigned_provider_id=?) AND e.booked_provider_id IS NOT NULL AND e.booked_provider_id<>?
        AND e.end_at>=? AND e.status<>'CANCELLED'`, [uid,uid,uid,uid,uid,at]);
    const [events] = await db.execute(`SELECT id,office_location_id,google_provider_event_id FROM office_events
      WHERE end_at>=? AND status<>'CANCELLED' AND (booked_provider_id=?
        OR (assigned_provider_id=? AND (booked_provider_id IS NULL OR booked_provider_id=?))
        OR (assigned_provider_id IS NULL AND booked_provider_id IS NULL AND standing_assignment_id IN
          (SELECT id FROM office_standing_assignments WHERE provider_id=?))) FOR UPDATE`, [at,uid,uid,uid,uid]);
    for (const event of events) {
      if (event.google_provider_event_id) await db.execute(`INSERT IGNORE INTO provider_offboarding_items
        (job_id,item_kind,item_id,snapshot_json) VALUES (?,'office_calendar',?,?)`, [job.id,event.id,JSON.stringify({id:event.id})]);
      await db.execute("UPDATE office_events SET status='CANCELLED',slot_state=NULL,cancellation_reason=? WHERE id=?", [reason,event.id]);
    }
    counts.officeReservations = events.length;
    // Stop every template, including past anchors, without changing past status.
    await db.execute('UPDATE provider_schedule_events SET recurrence_stopped=1 WHERE provider_id=? AND recurrence_series_id IS NOT NULL', [uid]);
    await change('scheduleEvents', `UPDATE provider_schedule_events SET status='CANCELLED',recurrence_stopped=1,recurrence_horizon_held=0,
      recurrence_calendar_pending=1,updated_by_user_id=? WHERE provider_id=? AND meeting_completed_at IS NULL
      AND (start_at>=? OR (all_day=1 AND start_date>=DATE(?))) AND (status='ACTIVE' OR recurrence_horizon_held=1)`, [actor,uid,at,at]);
    await db.execute('UPDATE supervision_sessions SET recurrence_stopped=1 WHERE supervisor_user_id=? AND recurrence_series_id IS NOT NULL', [uid]);
    await change('supervision', `UPDATE supervision_sessions SET status='CANCELLED',recurrence_stopped=1,recurrence_horizon_held=0,
      recurrence_calendar_pending=1 WHERE supervisor_user_id=? AND start_at>=? AND finalized_at IS NULL
      AND (status='SCHEDULED' OR recurrence_horizon_held=1)`, [uid,at]);
    await db.execute(`DELETE a FROM provider_schedule_event_attendees a JOIN provider_schedule_events e ON e.id=a.event_id
      WHERE a.user_id=? AND e.start_at>=? AND e.provider_id<>?`, [uid,at,uid]);
    await db.execute(`UPDATE supervision_session_attendees a JOIN supervision_sessions s ON s.id=a.session_id
      SET a.status='REMOVED' WHERE a.user_id=? AND s.start_at>=? AND s.finalized_at IS NULL`, [uid,at]);

    const [clients] = await db.execute(`SELECT c.id,c.provider_id FROM clients c WHERE c.provider_id=? OR EXISTS
      (SELECT 1 FROM client_provider_assignments a WHERE a.client_id=c.id AND a.provider_user_id=? AND a.is_active=1) FOR UPDATE`, [uid,uid]);
    await change('clientAssignments', 'UPDATE client_provider_assignments SET is_active=0,updated_by_user_id=? WHERE provider_user_id=? AND is_active=1', [actor,uid]);
    let unassigned = 0;
    for (const client of clients) {
      if (Number(client.provider_id) !== uid) continue;
      const [[next]] = await db.execute(`SELECT a.provider_user_id,a.service_day FROM client_provider_assignments a JOIN users u ON u.id=a.provider_user_id
        WHERE a.client_id=? AND a.is_active=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
          AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE_EMPLOYEE','TERMINATED_PENDING','TERMINATED')
        ORDER BY a.is_primary DESC,a.updated_at DESC,a.id LIMIT 1`, [client.id]);
      await db.execute('UPDATE clients SET provider_id=?,service_day=?,updated_by_user_id=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=? AND provider_id=?', [next?.provider_user_id || null,next?.service_day || null,actor,client.id,uid]);
      if (!next) unassigned++;
    }
    counts.clientsReadyForReassignment = unassigned;
    for (const table of ['provider_in_person_slot_availability','provider_virtual_slot_availability']) {
      await change(table, `UPDATE ${table} SET is_active=0 WHERE provider_id=? AND is_active=1`, [uid]);
    }
    await db.execute('UPDATE provider_in_office_availability SET is_available=0 WHERE provider_id=?', [uid]);
    // These are weekly planning templates, not visit or clinical history.
    await db.execute('DELETE FROM provider_virtual_working_hours WHERE provider_id=?', [uid]);
    await db.execute('DELETE FROM soft_schedule_slots WHERE provider_user_id=?', [uid]);
    await db.execute('DELETE FROM school_provider_schedule_entries WHERE provider_user_id=?', [uid]);
    await db.execute('UPDATE provider_school_assignments SET is_active=0,slots_available=0 WHERE provider_user_id=?', [uid]);
    await db.execute('UPDATE school_day_provider_assignments SET is_active=0 WHERE provider_user_id=?', [uid]);
    await db.execute('UPDATE user_office_locations SET is_active=0 WHERE user_id=?', [uid]);
    await db.execute('UPDATE users SET is_active=0,provider_accepting_new_clients=0 WHERE id=?', [uid]);
    await db.execute('UPDATE provider_offboarding_jobs SET schedule_cleaned_at=CURRENT_TIMESTAMP,summary_json=? WHERE id=?', [JSON.stringify(counts),job.id]);
    await db.commit();
    for (const id of new Set([...assignments,...events].map(row => row.office_location_id))) OfficeScheduleMaterializer.invalidateOffice(id);
    return counts;
  } catch (error) { await db.rollback(); throw error; }
}

export async function processProviderOffboarding(jobId) {
  const db = await pool.getConnection();
  let locked = false;
  let recurrenceLocked = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [`provider-offboarding:${jobId}`]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) return { pending: true };
    const [[job]] = await db.execute('SELECT * FROM provider_offboarding_jobs WHERE id=? AND completed_at IS NULL', [jobId]);
    if (!job) return { completed: true };
    await db.execute('UPDATE provider_offboarding_jobs SET attempts=attempts+1 WHERE id=?', [jobId]);
    if (!job.schedule_cleaned_at) {
      const [[recurrenceLock]] = await db.execute("SELECT GET_LOCK('recurring-schedule-year',10) AS acquired");
      recurrenceLocked = Number(recurrenceLock?.acquired) === 1;
      if (!recurrenceLocked) throw Object.assign(new Error('Schedule renewal is busy'), {code:'SCHEDULE_BUSY'});
      const result = await cleanSchedule(db,job);
      await db.execute("SELECT RELEASE_LOCK('recurring-schedule-year')");
      recurrenceLocked = false;
      if (result.skipped) return { completed:true,skipped:true };
    }
    // Cross-database/external work has durable items and is safe to retry. Never
    // call client termination: the clients themselves remain active.
    const [[currentUser]] = await db.execute('SELECT status,is_archived FROM users WHERE id=?', [job.provider_id]);
    // A retry must not cancel new sessions made after an administrator restored
    // the account. Old future sessions still need their cancellation mirrored.
    const restored = !inactive(currentUser);
    await clinicalPool.execute(`UPDATE clinical_sessions SET encounter_status='cancelled',claim_blocked_reason=?,updated_at=CURRENT_TIMESTAMP
      WHERE provider_user_id=? AND scheduled_start_at>=? AND encounter_status IN ('scheduled','confirmed') AND billing_encounter_id IS NULL
        ${restored ? 'AND created_at<=?' : ''}`, [reason,job.provider_id,job.cutoff_at,...(restored ? [job.cutoff_at] : [])]);
    const [items] = await db.execute('SELECT * FROM provider_offboarding_items WHERE job_id=? AND completed_at IS NULL', [jobId]);
    for (const item of items) {
      const snapshot = typeof item.snapshot_json === 'string' ? JSON.parse(item.snapshot_json) : item.snapshot_json;
      if (item.item_kind === 'appointment' && snapshot.package_entitlement_id) {
        const [[current]] = await db.execute('SELECT status FROM appointments WHERE id=?', [item.item_id]);
        if (current?.status === 'canceled_by_organization') await BookingPackage.applyAppointmentUsage({ entitlementId:snapshot.package_entitlement_id,agencyId:snapshot.agency_id,appointmentId:item.item_id,mode:'release',actorUserId:job.actor_user_id });
      } else if (item.item_kind === 'office_calendar') {
        const [[current]] = await db.execute('SELECT status FROM office_events WHERE id=?', [item.item_id]);
        if (current?.status === 'CANCELLED') {
          const { default: Google } = await import('./googleCalendar.service.js');
          const result = await Google.cancelBookedOfficeEvent({ officeEventId:item.item_id });
          if (!result?.ok && !result?.skipped) throw Object.assign(new Error('Calendar removal needs retry'), {code:'OFFICE_CALENDAR_RETRY'});
        }
      }
      await db.execute('UPDATE provider_offboarding_items SET completed_at=CURRENT_TIMESTAMP WHERE job_id=? AND item_kind=? AND item_id=?', [jobId,item.item_kind,item.item_id]);
    }
    await db.execute('UPDATE provider_offboarding_jobs SET completed_at=CURRENT_TIMESTAMP,last_error_code=NULL WHERE id=?', [jobId]);
    return { completed:true };
  } catch (error) {
    await db.execute('UPDATE provider_offboarding_jobs SET last_error_code=? WHERE id=?', [String(error.code || 'CLEANUP_FAILED').slice(0,100),jobId]);
    throw error;
  } finally {
    try {
      if (recurrenceLocked) await db.execute("SELECT RELEASE_LOCK('recurring-schedule-year')").catch(() => {});
      if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [`provider-offboarding:${jobId}`]).catch(() => {});
    } finally { db.release(); }
  }
}

export async function processPendingProviderOffboarding() {
  const [jobs] = await pool.execute(`SELECT id FROM provider_offboarding_jobs WHERE completed_at IS NULL
    ORDER BY attempts,id LIMIT 20`);
  for (const job of jobs) {
    try { await processProviderOffboarding(job.id); }
    catch (error) { console.warn('[provider offboarding] Retry pending',job.id,error.code || 'CLEANUP_FAILED'); }
  }
}
