import pool from '../config/database.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import {
  refreshAllLocationsFromEhr,
  auditIcsCoverageAllLocations,
  downgradeBookedWithoutExternalOverlap
} from './officeScheduleEhrSync.service.js';
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
        `SELECT id FROM office_locations WHERE is_active = TRUE`
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
         WHERE is_active = TRUE`
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
    return { warned: 0, queued: 0, disabled: true, reason: 'admin_review_only' };
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

    let ehrRefresh = null;
    try {
      // Match Therapy Notes / ICS busy blocks to assigned office slots → mark booked (same as admin refresh).
      ehrRefresh = await refreshAllLocationsFromEhr({ actorUserId: 1 });
    } catch (e) {
      ehrRefresh = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    // Phase A: auto-book slots that overlap provider_schedule_events (internal sessions).
    let internalSessionBook = null;
    try {
      internalSessionBook = await this.autoBookFromInternalSessions();
    } catch (e) {
      internalSessionBook = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    const confirms = await this.emitSixWeekBookingConfirmReminders();
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

    // ICS coverage audit runs at the same 6-week cadence as booking confirm reminders.
    // It flags (but never auto-cancels) slots with insufficient clinical session coverage.
    // downgradeBookedWithoutExternalOverlap is now a no-op; audit replaces it.
    let icsCoverageAudit = null;
    try {
      icsCoverageAudit = await auditIcsCoverageAllLocations({ actorUserId: 1 });
    } catch (e) {
      icsCoverageAudit = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

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
    // Only clean up providers/users who have been inactive for at least 14 days.
    // This guards against a transient deactivation (e.g. a provider re-enabled the same day)
    // accidentally wiping their office bookings before the correction is made.
    const [inactiveProviders] = await pool.execute(
      `SELECT id FROM users
       WHERE (is_archived = TRUE OR is_active = FALSE)
         AND (updated_at IS NULL OR updated_at <= DATE_SUB(NOW(), INTERVAL 14 DAY))
         AND role IN ('PROVIDER', 'provider', 'therapist', 'THERAPIST', 'clinician', 'CLINICIAN',
                      'provider_plus', 'PROVIDER_PLUS')`
    );

    // Broad fallback: any user inactive for 14+ days.
    const [anyInactive] = await pool.execute(
      `SELECT DISTINCT u.id FROM users u
       WHERE (u.is_archived = TRUE OR u.is_active = FALSE)
         AND (u.updated_at IS NULL OR u.updated_at <= DATE_SUB(NOW(), INTERVAL 14 DAY))`
    );

    const providerIdSet = new Set([
      ...inactiveProviders.map((r) => r.id),
      ...anyInactive.map((r) => r.id)
    ]);
    const providerIds = [...providerIdSet];

    if (!providerIds.length) return { ok: true, eventsCancel: 0, assignmentsDeactivated: 0 };

    const ph = providerIds.map(() => '?').join(',');

    // 1. Cancel all future office_events where this provider is the booked or assigned provider.
    const [evResult] = await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE (booked_provider_id IN (${ph}) OR assigned_provider_id IN (${ph}))
         AND start_at >= NOW()
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
      [...providerIds, ...providerIds]
    );

    // 2. Deactivate all active standing assignments for these providers.
    const [aResult] = await pool.execute(
      `UPDATE office_standing_assignments
       SET is_active = FALSE, updated_at = NOW()
       WHERE provider_id IN (${ph})
         AND is_active = TRUE`,
      providerIds
    );

    // 3. Cancel future materialized events tied to those now-deactivated assignments.
    //    Run even if aResult.affectedRows = 0 to catch any that slipped through.
    await pool.execute(
      `UPDATE office_events oe
       JOIN office_standing_assignments osa ON osa.id = oe.standing_assignment_id
       SET oe.status = 'CANCELLED', oe.updated_at = NOW()
       WHERE osa.provider_id IN (${ph})
         AND osa.is_active = FALSE
         AND oe.start_at >= NOW()
         AND (oe.status IS NULL OR UPPER(oe.status) <> 'CANCELLED')`,
      providerIds
    );

    // 4. Deactivate active booking plans for these providers' assignments.
    await pool.execute(
      `UPDATE office_booking_plans bp
       JOIN office_standing_assignments osa ON osa.id = bp.standing_assignment_id
       SET bp.is_active = FALSE, bp.updated_at = NOW()
       WHERE osa.provider_id IN (${ph})
         AND bp.is_active = TRUE`,
      providerIds
    );

    // 5. Cancel any pending DROP_ASSIGNMENT or other booking requests from these providers.
    await pool.execute(
      `UPDATE office_booking_requests
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE requested_provider_id IN (${ph})
         AND status = 'PENDING'`,
      providerIds
    );

    return {
      ok: true,
      eventsCancel: evResult.affectedRows,
      assignmentsDeactivated: aResult.affectedRows
    };
  }
}
