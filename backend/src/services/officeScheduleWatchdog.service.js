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
          await OfficeScheduleMaterializer.materializeWeek({
            officeLocationId,
            weekStartRaw: ws,
            createdByUserId: 1,
            useExactWeekStart: true,
            force: true
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

  static async emitSixWeekBookingConfirmReminders() {
    // Remind providers to confirm booked plans every ~6 weeks.
    // Use office_standing_assignments.last_six_week_checked_at to avoid spamming.
    const [rows] = await pool.execute(
      `SELECT
         bp.id AS booking_plan_id,
         bp.standing_assignment_id,
         bp.last_confirmed_at,
         osa.provider_id,
         osa.last_six_week_checked_at,
         MIN(ola.agency_id) AS agency_id,
         ol.name AS office_name,
         r.name AS room_name,
         r.label AS room_label,
         osa.weekday,
         osa.hour
       FROM office_booking_plans bp
       JOIN office_standing_assignments osa ON osa.id = bp.standing_assignment_id
       JOIN office_locations ol ON ol.id = osa.office_location_id
       JOIN office_rooms r ON r.id = osa.room_id
       JOIN office_location_agencies ola ON ola.office_location_id = osa.office_location_id
       JOIN user_agencies ua ON ua.user_id = osa.provider_id AND ua.agency_id = ola.agency_id
       WHERE bp.is_active = TRUE
         AND osa.is_active = TRUE
         AND (bp.last_confirmed_at IS NULL OR bp.last_confirmed_at <= DATE_SUB(NOW(), INTERVAL 42 DAY))
         AND (osa.last_six_week_checked_at IS NULL OR osa.last_six_week_checked_at <= DATE_SUB(NOW(), INTERVAL 42 DAY))
       GROUP BY
         bp.id, bp.standing_assignment_id, bp.last_confirmed_at,
         osa.provider_id, osa.last_six_week_checked_at,
         ol.name, r.name, r.label, osa.weekday, osa.hour`
    );

    let notified = 0;
    for (const r of rows || []) {
      const agencyId = Number(r.agency_id);
      const providerId = Number(r.provider_id);
      const bookingPlanId = Number(r.booking_plan_id);
      const assignmentId = Number(r.standing_assignment_id);
      if (!agencyId || !providerId || !bookingPlanId || !assignmentId) continue;

      const roomLabel = String(r.room_label || r.room_name || '').trim() || 'Room';
      const officeName = String(r.office_name || '').trim() || 'Office';
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(r.weekday)] || String(r.weekday);
      const hour = Number(r.hour);
      const hourLabel = Number.isFinite(hour) ? `${hour}:00` : '';

      try {
        await createNotificationAndDispatch({
          type: 'office_schedule_booking_confirm_6_weeks',
          severity: 'info',
          title: 'Confirm office booking',
          message: `Is this still booked? ${officeName} • ${roomLabel} • ${day} ${hourLabel}`,
          userId: providerId,
          agencyId,
          relatedEntityType: 'office_booking_plan',
          relatedEntityId: bookingPlanId,
          actorSource: 'Office Scheduling'
        });
        notified += 1;
      } catch {
        // ignore
      }

      // Mark that we've prompted recently (so we don't re-prompt daily).
      try {
        await pool.execute(
          `UPDATE office_standing_assignments
           SET last_six_week_checked_at = NOW(), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [assignmentId]
        );
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
   * Two-phase review pipeline for AVAILABLE standing assignments unbooked for 42+ days.
   *
   * Phase B1 (warn): If last_forfeit_warning_at IS NULL, send the provider a heads-up that
   * their slot has been unbooked for 6+ weeks and ask them to act within 14 days.
   * Set last_forfeit_warning_at = NOW(). Do NOT drop the slot.
   *
   * Phase B2 (queue for admin review): If last_forfeit_warning_at was set 14+ days ago and
   * the slot is still unbooked with no pending DROP_ASSIGNMENT request already queued,
   * create a PENDING office_booking_requests row (type = DROP_ASSIGNMENT) so that the same
   * CPA/admin approvers who manage schedules can approve or deny the release.
   * The assignment stays active and keeps materializing until an admin decides.
   *
   * Any provider action (keepAvailable, setBookingPlan, extendTemporary, forfeitAssignment)
   * must clear last_forfeit_warning_at = NULL so the clock resets.
   */
  static async autoForfeitStaleAvailableSlots() {
    // Base query fragment for stale AVAILABLE slots (no active booking plan, 42+ days stale).
    const baseWhere = `
      osa.is_active = TRUE
      AND osa.availability_mode = 'AVAILABLE'
      AND osa.available_since_date IS NOT NULL
      AND GREATEST(
        osa.available_since_date,
        COALESCE(DATE(osa.last_two_week_confirmed_at), '1970-01-01')
      ) <= DATE_SUB(CURDATE(), INTERVAL 42 DAY)
      AND bp.id IS NULL
    `;

    const selectCols = `
      osa.id AS standing_assignment_id,
      osa.provider_id,
      osa.office_location_id,
      osa.room_id,
      osa.last_forfeit_warning_at,
      ola.agency_id,
      ol.name AS office_name,
      r.name AS room_name,
      r.label AS room_label,
      osa.weekday,
      osa.hour
    `;

    const joins = `
      JOIN office_location_agencies ola ON ola.office_location_id = osa.office_location_id
      JOIN office_locations ol ON ol.id = osa.office_location_id
      JOIN office_rooms r ON r.id = osa.room_id
      LEFT JOIN office_booking_plans bp ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
    `;

    let rows = [];
    try {
      [rows] = await pool.query(
        `SELECT ${selectCols}
         FROM office_standing_assignments osa
         ${joins}
         WHERE ${baseWhere}`
      );
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return { warned: 0, queued: 0, reason: 'column_missing_run_migration_697' };
      }
      throw e;
    }

    let warned = 0;
    let queued = 0;

    for (const r of rows || []) {
      const assignmentId = Number(r.standing_assignment_id);
      const providerId = Number(r.provider_id);
      const agencyId = Number(r.agency_id);
      const officeLocationId = Number(r.office_location_id);
      const roomId = Number(r.room_id) || null;
      if (!assignmentId || !providerId || !agencyId || !officeLocationId) continue;

      const roomLabel = String(r.room_label || r.room_name || '').trim() || 'Room';
      const officeName = String(r.office_name || '').trim() || 'Office';
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(r.weekday)] || String(r.weekday);
      const hour = Number(r.hour);
      const hourLabel = Number.isFinite(hour) ? `${hour}:00` : '';
      const slotLabel = `${officeName} • ${roomLabel} • ${day} ${hourLabel}`;

      const warnedAt = r.last_forfeit_warning_at ? new Date(r.last_forfeit_warning_at) : null;
      const warnedDaysAgo = warnedAt ? Math.floor((Date.now() - warnedAt.getTime()) / 86400000) : null;

      if (!warnedAt) {
        // Phase B1: notify provider; do NOT drop the slot.
        try {
          await pool.execute(
            `UPDATE office_standing_assignments
             SET last_forfeit_warning_at = NOW(), updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [assignmentId]
          );

          await createNotificationAndDispatch({
            type: 'office_schedule_forfeit_warning',
            severity: 'warning',
            title: 'Office slot needs your attention',
            message: `Your office slot has been unbooked for 6+ weeks (${slotLabel}). Please book, keep available, or release it within 14 days — otherwise an admin review will be initiated to determine whether the slot should be released.`,
            userId: providerId,
            agencyId,
            relatedEntityType: 'office_standing_assignment',
            relatedEntityId: assignmentId,
            actorSource: 'Office Scheduling'
          });
          warned += 1;
        } catch {
          // ignore per-row errors
        }
      } else if (warnedDaysAgo !== null && warnedDaysAgo >= 14) {
        // Phase B2: 14-day grace passed with no provider action.
        // Queue a DROP_ASSIGNMENT request for admin approval instead of auto-forfeiting.
        try {
          // Check if a pending drop request already exists for this assignment.
          const [existing] = await pool.query(
            `SELECT id FROM office_booking_requests
             WHERE request_type = 'DROP_ASSIGNMENT'
               AND status = 'PENDING'
               AND JSON_UNQUOTE(JSON_EXTRACT(requester_notes, '$.standingAssignmentId')) = ?
             LIMIT 1`,
            [String(assignmentId)]
          );
          if ((existing || []).length > 0) continue;

          const notePayload = JSON.stringify({
            standingAssignmentId: assignmentId,
            slotLabel,
            reason: 'unbooked_6_weeks',
            warnedAt: warnedAt?.toISOString() ?? null
          });

          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          await pool.execute(
            `INSERT INTO office_booking_requests
               (request_type, status, office_location_id, room_id, requested_provider_id,
                start_at, end_at, recurrence, requester_notes, created_at, updated_at)
             VALUES ('DROP_ASSIGNMENT', 'PENDING', ?, ?, ?, ?, ?, 'ONCE', ?, ?, ?)`,
            [officeLocationId, roomId, providerId, now, now, notePayload, now, now]
          );
          queued += 1;

          await createNotificationAndDispatch({
            type: 'office_schedule_drop_review_queued',
            severity: 'info',
            title: 'Office slot pending admin review',
            message: `Your office slot (${slotLabel}) has been unbooked for several weeks. An admin will review whether it should be released. Your slot remains active in the meantime.`,
            userId: providerId,
            agencyId,
            relatedEntityType: 'office_standing_assignment',
            relatedEntityId: assignmentId,
            actorSource: 'Office Scheduling'
          });
        } catch {
          // ignore per-row errors
        }
      }
      // else: warning sent but 14-day window not yet elapsed — skip.
    }

    return { warned, queued };
  }

  static async run() {
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
