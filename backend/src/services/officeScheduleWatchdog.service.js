import pool from '../config/database.js';
import { runOfficeUsageReviews } from './officeAssignmentUsage.service.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import { retryFailedProviderAssignmentGoogleSync } from './providerAssignmentGoogleSync.service.js';
import { deactivateStaleStandingAssignments } from './officeStandingAssignmentMaintenance.service.js';

export class OfficeScheduleWatchdogService {
  /**
   * Materialize office events for all active buildings across a rolling horizon.
   * This runs unconditionally every watchdog cycle so recurring assignments always
   * have events available weeks ahead — independent of Google Calendar config.
   */
  static async rollMaterializationHorizon({ horizonDays = 84 } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    let buildings = [];
    try {
      const [rows] = await pool.execute(
        `SELECT id FROM office_locations WHERE is_active = TRUE AND physical_office_location_id IS NULL`
      );
      buildings = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: false, reason: 'office_tables_missing' };
      throw e;
    }

    const startWeek = OfficeScheduleMaterializer.startOfWeekMonday(today);
    const weekStarts = [];
    for (let d = 0; d <= Number(horizonDays || 84); d += 7) {
      weekStarts.push(OfficeScheduleMaterializer.addDays(startWeek, d));
    }

    let materialized = 0;
    for (const officeLocationId of buildings) {
      for (const ws of weekStarts) {
        try {
          // force:false — skip weeks already materialized recently in this process.
          // Daily rolls should not rewrite every week when nothing changed.
          await OfficeScheduleMaterializer.materializeWeek({
            officeLocationId,
            weekStartRaw: ws,
            createdByUserId: 1,
            useExactWeekStart: true,
            force: false
          });
          materialized++;
        } catch (e) {
          if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') continue;
          throw e;
        }
      }
    }
    return { ok: true, buildings: buildings.length, weekStarts: weekStarts.length, materialized };
  }

  static async syncBookedToGoogle({ horizonDays = 28 } = {}) {
    if (!GoogleCalendarService.isConfigured()) {
      return { ok: false, reason: 'google_calendar_not_configured' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const end = OfficeScheduleMaterializer.addDays(today, Number(horizonDays || 28));

    // Materialization now runs unconditionally via rollMaterializationHorizon().
    // Re-use buildings list for the Google sync loop below.
    let buildings = [];
    try {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_locations
         WHERE is_active = TRUE AND physical_office_location_id IS NULL`
      );
      buildings = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: false, reason: 'office_tables_missing' };
      throw e;
    }

    // Sync assigned/booked office slots and program staffing in the window.
    return retryFailedProviderAssignmentGoogleSync({ horizonDays: Number(horizonDays || 28) });
  }

  /**
   * Every ~6 weeks, notify admin/CPA/provider_plus/staff to review standing office
   * assignments (booked or assigned). Providers often do not log in, so this is an
   * ops inbox prompt — not a provider confirm.
   *
   * If nobody acts, bumping last_six_week_checked_at means the provider keeps the
   * slot and the next review is another ~6 weeks later (implicit snooze).
   */
  static async emitSixWeekBookingConfirmReminders() {
    const [rows] = await pool.execute(
      `SELECT
         osa.id AS standing_assignment_id,
         bp.id AS booking_plan_id,
         bp.last_confirmed_at,
         osa.provider_id,
         osa.availability_mode,
         osa.last_six_week_checked_at,
         osa.available_since_date,
         MIN(ola.agency_id) AS agency_id,
         ol.name AS office_name,
         r.name AS room_name,
         r.label AS room_label,
         osa.weekday,
         osa.hour,
         u.first_name,
         u.last_name
       FROM office_standing_assignments osa
       JOIN office_locations ol ON ol.id = osa.office_location_id
       JOIN office_rooms r ON r.id = osa.room_id
       JOIN office_location_agencies ola ON ola.office_location_id = osa.office_location_id
       JOIN users u ON u.id = osa.provider_id
       LEFT JOIN office_booking_plans bp ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
       WHERE osa.is_active = TRUE
         AND NOT EXISTS (SELECT 1 FROM office_scheduling_policies policy WHERE policy.agency_id = osa.booking_agency_id AND policy.transition_date IS NOT NULL)
         AND (osa.last_six_week_checked_at IS NULL OR osa.last_six_week_checked_at <= DATE_SUB(NOW(), INTERVAL 42 DAY))
         AND (
           (bp.id IS NOT NULL AND (bp.last_confirmed_at IS NULL OR bp.last_confirmed_at <= DATE_SUB(NOW(), INTERVAL 42 DAY)))
           OR (
             bp.id IS NULL
             AND osa.available_since_date IS NOT NULL
             AND osa.available_since_date <= DATE_SUB(CURDATE(), INTERVAL 42 DAY)
           )
         )
       GROUP BY
         osa.id, bp.id, bp.last_confirmed_at,
         osa.provider_id, osa.availability_mode, osa.last_six_week_checked_at, osa.available_since_date,
         ol.name, r.name, r.label, osa.weekday, osa.hour, u.first_name, u.last_name`
    );

    let notified = 0;
    for (const r of rows || []) {
      const agencyId = Number(r.agency_id);
      const providerId = Number(r.provider_id);
      const bookingPlanId = Number(r.booking_plan_id || 0) || null;
      const assignmentId = Number(r.standing_assignment_id);
      if (!agencyId || !providerId || !assignmentId) continue;

      const roomLabel = String(r.room_label || r.room_name || '').trim() || 'Room';
      const officeName = String(r.office_name || '').trim() || 'Office';
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(r.weekday)] || String(r.weekday);
      const hour = Number(r.hour);
      const hourLabel = Number.isFinite(hour) ? `${hour}:00` : '';
      const providerName = `${String(r.first_name || '').trim()} ${String(r.last_name || '').trim()}`.trim()
        || `Provider #${providerId}`;
      const statusLabel = bookingPlanId ? 'booked' : 'assigned (not booked)';
      const slotLabel = `${officeName} • ${roomLabel} • ${day} ${hourLabel}`;

      try {
        await createNotificationAndDispatch({
          type: 'office_schedule_standing_review_6_weeks',
          severity: 'info',
          title: 'Office standing assignment needs review',
          message: `${providerName}'s ${statusLabel} slot is due for a 6-week check (${slotLabel}). Snooze 6 weeks, downgrade, or release in Buildings / approvals.`,
          userId: null,
          agencyId,
          audienceJson: {
            admin: true,
            clinicalPracticeAssistant: true,
            schoolStaff: false,
            provider: false,
            supervisor: false
          },
          relatedEntityType: 'office_standing_assignment',
          relatedEntityId: assignmentId,
          actorSource: 'Office Scheduling'
        });
        notified += 1;
      } catch {
        // ignore
      }

      // Implicit snooze: if admin never acts, provider keeps the slot until next 6-week cycle.
      try {
        await pool.execute(
          `UPDATE office_standing_assignments
           SET last_six_week_checked_at = NOW(), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [assignmentId]
        );
        if (bookingPlanId) {
          await pool.execute(
            `UPDATE office_booking_plans
             SET last_confirmed_at = NOW(), updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [bookingPlanId]
          );
        }
      } catch {
        // ignore
      }
    }

    return { notified, candidates: (rows || []).length };
  }

  /**
   * Phase A: For AVAILABLE standing assignments with no active booking plan,
   * check if the provider has an active provider_schedule_events entry (e.g. a therapy
   * or client session — excludes internal meeting kinds) overlapping a future office_event
   * occurrence. For each overlap found, mark the event ASSIGNED_BOOKED and upsert an
   * active booking plan with bookingOrigin 'ehr_sync'. This prevents PSE-covered slots
   * from being flagged as stale and entering the forfeit warning pipeline.
   */
  static async autoBookFromInternalSessions() {
    let booked = 0;

    let rows = [];
    try {
      [rows] = await pool.query(
        `SELECT
           oe.id AS event_id,
           oe.standing_assignment_id,
           osa.provider_id,
           osa.assigned_frequency,
           DATE(oe.start_at) AS event_date,
           oe.start_at,
           oe.end_at
         FROM office_events oe
         JOIN office_standing_assignments osa ON osa.id = oe.standing_assignment_id
         LEFT JOIN office_booking_plans bp
           ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
         WHERE osa.is_active = TRUE
           AND NOT EXISTS (SELECT 1 FROM office_scheduling_policies policy WHERE policy.agency_id = osa.booking_agency_id AND policy.transition_date IS NOT NULL)
           AND osa.availability_mode = 'AVAILABLE'
           AND oe.slot_state IN ('ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY')
           AND oe.start_at >= NOW()
           AND bp.id IS NULL
           AND EXISTS (
             SELECT 1
             FROM provider_schedule_events pse
             WHERE pse.provider_id = osa.provider_id
               AND pse.status = 'ACTIVE'
               AND UPPER(COALESCE(pse.kind, '')) NOT IN ('TEAM_MEETING', 'HUDDLE')
               AND pse.start_at IS NOT NULL
               AND pse.end_at IS NOT NULL
               AND pse.start_at < oe.end_at
               AND pse.end_at > oe.start_at
           )`
      );
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
        return { booked: 0, reason: 'tables_missing' };
      }
      throw e;
    }

    // Group by standing_assignment_id — we only need to upsert one booking plan per assignment
    // even if multiple upcoming events overlap PSE entries.
    const seenAssignments = new Set();

    for (const r of rows || []) {
      const eventId = Number(r.event_id);
      const assignmentId = Number(r.standing_assignment_id);
      const providerId = Number(r.provider_id);
      const eventDate = String(r.event_date || '').slice(0, 10);
      const freq = String(r.assigned_frequency || 'WEEKLY').toUpperCase();

      if (!eventId || !assignmentId || !providerId || !eventDate) continue;

      try {
        // Mark this specific event as BOOKED.
        await OfficeEvent.markBooked({ eventId, bookedProviderId: providerId });
        booked += 1;

        // Upsert the booking plan once per assignment (not once per overlapping event).
        if (!seenAssignments.has(assignmentId)) {
          seenAssignments.add(assignmentId);
          await OfficeBookingPlan.upsertActive({
            standingAssignmentId: assignmentId,
            bookedFrequency: freq,
            bookingStartDate: eventDate,
            activeUntilDate: null,
            bookedOccurrenceCount: null,
            createdByUserId: 1,
            bookingOrigin: 'ehr_sync'
          });
        }
      } catch {
        // Best-effort per event; do not block the rest of the run.
      }
    }

    return { booked };
  }

  /**
   * Legacy auto-forfeit / DROP_ASSIGNMENT queue disabled.
   * Standing assignments are reviewed via emitSixWeekBookingConfirmReminders (admin inbox).
   * Admins snooze (+6 weeks), downgrade booked→assigned, or release assigned→open manually.
   */
  static async autoForfeitStaleAvailableSlots() {
    return runOfficeUsageReviews();
  }

  static async run() {
    // Only one process (Cloud Run instance / local) should run this heavy job.
    // Without a lock, min-instances + local npm run against stage DB multiplies load.
    // GET_LOCK is connection-scoped — hold one connection for the whole run.
    const lockName = 'office_schedule_watchdog_v1';
    let conn = null;
    let gotLock = false;
    try {
      conn = await pool.getConnection();
      const [[lockRow]] = await conn.execute('SELECT GET_LOCK(?, 0) AS got_lock', [lockName]);
      gotLock = Number(lockRow?.got_lock) === 1;
    } catch (e) {
      console.warn('[watchdog] lock check failed; proceeding cautiously:', e?.message || e);
      gotLock = true;
    }
    if (!gotLock) {
      if (conn) try { conn.release(); } catch { /* ignore */ }
      console.info('[watchdog] skipped — another process already holds the lock');
      return { ok: true, skipped: true, reason: 'lock_not_acquired' };
    }

    try {
      return await this._runLocked();
    } finally {
      if (conn) {
        try { await conn.execute('SELECT RELEASE_LOCK(?)', [lockName]); } catch { /* ignore */ }
        try { conn.release(); } catch { /* ignore */ }
      }
    }
  }

  static async _runLocked() {
    // Always roll the materialization horizon first so recurring assignments have
    // events for the next 12 weeks regardless of Google Calendar config.
    let materializationRoll = null;
    try {
      materializationRoll = await this.rollMaterializationHorizon({ horizonDays: 84 });
    } catch (e) {
      materializationRoll = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    // After materialization, retire expired / orphaned standing assignments and
    // mirror removals to Google Calendar.
    let staleAssignmentCleanup = null;
    try {
      staleAssignmentCleanup = await deactivateStaleStandingAssignments();
    } catch (e) {
      staleAssignmentCleanup = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    // Office state and retention come from this app. External calendars are optional mirrors.
    const ehrRefresh = { skipped: true, reason: 'app_is_source_of_truth' };
    const internalSessionBook = { skipped: true, reason: 'appointments_only' };
    const confirms = { skipped: true, reason: 'replaced_by_usage_reviews' };
    const forfeits = await this.autoForfeitStaleAvailableSlots();
    let inactiveCleanup = null;
    try {
      inactiveCleanup = await this.cleanupInactiveProviderBookings();
    } catch (e) {
      inactiveCleanup = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    let googleSync = null;
    try {
      googleSync = await this.syncBookedToGoogle({ horizonDays: 28 });
    } catch (e) {
      // Never block watchdog on calendar sync failures.
      googleSync = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    const icsCoverageAudit = { skipped: true, reason: 'external_calendar_not_required' };

    console.info('[watchdog]', JSON.stringify({
      staleDeactivatedCount: Number(staleAssignmentCleanup?.assignmentsDeactivated || 0),
      staleRematerializedOffices: Number(staleAssignmentCleanup?.rematerializedOffices || 0),
      staleOrphanLogged: Number(staleAssignmentCleanup?.orphanLogged || 0),
      inactiveCancelledCount: Number(inactiveCleanup?.eventsCancel || 0)
    }));

    return {
      ok: true,
      staleAssignmentCleanup,
      materializationRoll,
      ehrRefresh,
      internalSessionBook,
      confirms,
      forfeits,
      inactiveCleanup,
      googleSync,
      icsCoverageAudit,
      log: {
        staleDeactivatedCount: Number(staleAssignmentCleanup?.assignmentsDeactivated || 0),
        staleRematerializedOffices: Number(staleAssignmentCleanup?.rematerializedOffices || 0),
        staleOrphanLogged: Number(staleAssignmentCleanup?.orphanLogged || 0),
        inactiveCancelledCount: Number(inactiveCleanup?.eventsCancel || 0)
      }
    };
  }

  /**
   * Cancel all future office bookings and deactivate all standing assignments
   * for users who are archived (is_archived = TRUE) or deactivated (is_active = FALSE).
   * Safe to run daily — skips users who are already fully cleaned up.
   */
  static async cleanupInactiveProviderBookings() {
    // Use the durable cleanup path, which also preserves bookings claimed by
    // another active clinician and stops templates before removing occurrences.
    const [queued] = await pool.execute(`INSERT IGNORE INTO provider_offboarding_jobs (provider_id,actor_user_id)
      SELECT u.id,u.archived_by_user_id FROM users u
      WHERE (COALESCE(u.is_archived,0)=1 OR COALESCE(u.is_active,1)=0 OR UPPER(COALESCE(u.status,'')) IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED'))
        AND (EXISTS(SELECT 1 FROM office_standing_assignments a WHERE a.provider_id=u.id AND a.is_active=1)
          OR EXISTS(SELECT 1 FROM office_events e WHERE COALESCE(e.booked_provider_id,e.assigned_provider_id)=u.id AND e.end_at>=UTC_TIMESTAMP() AND e.status<>'CANCELLED'))`);
    const {processPendingProviderOffboarding} = await import('./providerOffboarding.service.js');
    await processPendingProviderOffboarding();
    return {ok:true,queued:Number(queued.affectedRows || 0)};
  }
}
