import pool from '../config/database.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import {
  refreshAllLocationsFromEhr,
  downgradeBookedWithoutExternalOverlap
} from './officeScheduleEhrSync.service.js';

export class OfficeScheduleWatchdogService {
  static async syncBookedToGoogle({ horizonDays = 28 } = {}) {
    if (!GoogleCalendarService.isConfigured()) {
      return { ok: false, reason: 'google_calendar_not_configured' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const end = OfficeScheduleMaterializer.addDays(today, Number(horizonDays || 28));

    // Materialize each week for each active building (office_location).
    // Best-effort: if tables/columns not present yet, do not crash watchdog.
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

    const startWeek = OfficeScheduleMaterializer.startOfWeekISO(today);
    const weekStarts = [];
    for (let d = 0; d <= Number(horizonDays || 28); d += 7) {
      weekStarts.push(OfficeScheduleMaterializer.addDays(startWeek, d));
    }

    for (const officeLocationId of buildings) {
      for (const ws of weekStarts) {
        try {
          await OfficeScheduleMaterializer.materializeWeek({
            officeLocationId,
            weekStartRaw: ws,
            createdByUserId: 1
          });
        } catch (e) {
          // If migrations aren't applied yet, don't block watchdog.
          if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') continue;
          throw e;
        }
      }
    }

    // Sync booked occurrences in the window.
    const startAt = `${today} 00:00:00`;
    const endAt = `${end} 23:59:59`;
    let events = [];
    try {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_events
         WHERE slot_state = 'ASSIGNED_BOOKED'
           AND start_at >= ?
           AND start_at <= ?
           AND booked_provider_id IS NOT NULL
           AND (google_provider_event_id IS NULL OR google_sync_status = 'FAILED')`,
        [startAt, endAt]
      );
      events = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return { ok: false, reason: 'google_columns_missing' };
      }
      if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: false, reason: 'office_tables_missing' };
      throw e;
    }

    let synced = 0;
    let failed = 0;
    for (const id of events) {
      const r = await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: id });
      if (r?.ok) synced += 1;
      else failed += 1;
      // light rate-limit (avoid hammering Google)
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return { ok: true, horizonDays: Number(horizonDays || 28), candidates: events.length, synced, failed };
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
   * Two-phase forfeit for AVAILABLE standing assignments that have been unbooked for 42+ days.
   *
   * Phase B1 (warn): If last_forfeit_warning_at IS NULL, send a "your slot will be released
   * in 14 days" notification and set last_forfeit_warning_at = NOW(). Do NOT forfeit yet.
   * The mandatory review splash (OfficeMandatoryReviewSplash) will surface this slot with
   * urgency so the provider can book, extend, or forfeit it themselves.
   *
   * Phase B2 (forfeit): If last_forfeit_warning_at was set 14+ days ago and the slot is
   * still unbooked, set is_active = FALSE and send the forfeit notification.
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
        // last_forfeit_warning_at column not yet added; fall back to old behavior (warn only).
        return { warned: 0, forfeited: 0, reason: 'column_missing_run_migration_697' };
      }
      throw e;
    }

    let warned = 0;
    let forfeited = 0;
    let notified = 0;

    for (const r of rows || []) {
      const assignmentId = Number(r.standing_assignment_id);
      const providerId = Number(r.provider_id);
      const agencyId = Number(r.agency_id);
      if (!assignmentId || !providerId || !agencyId) continue;

      const roomLabel = String(r.room_label || r.room_name || '').trim() || 'Room';
      const officeName = String(r.office_name || '').trim() || 'Office';
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(r.weekday)] || String(r.weekday);
      const hour = Number(r.hour);
      const hourLabel = Number.isFinite(hour) ? `${hour}:00` : '';
      const slotLabel = `${officeName} • ${roomLabel} • ${day} ${hourLabel}`;

      const warnedAt = r.last_forfeit_warning_at ? new Date(r.last_forfeit_warning_at) : null;
      const warnedDaysAgo = warnedAt ? Math.floor((Date.now() - warnedAt.getTime()) / 86400000) : null;

      if (!warnedAt) {
        // Phase B1: send warning notification; do NOT forfeit yet.
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
            message: `Your office slot has been unbooked for 6+ weeks (${slotLabel}). Please book, keep available, or release it within 14 days — otherwise it will be automatically released.`,
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
        // Phase B2: 14-day grace period has passed with no provider action — forfeit.
        try {
          await pool.execute(
            `UPDATE office_standing_assignments
             SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [assignmentId]
          );
          forfeited += 1;

          // Notify provider (deduped by trigger+provider).
          const ok = await NotificationEvent.tryCreate({
            agencyId,
            triggerKey: 'office_schedule_unbooked_forfeit',
            providerUserId: providerId,
            recipientUserId: providerId
          });
          if (ok) {
            await createNotificationAndDispatch({
              type: 'office_schedule_unbooked_forfeit',
              severity: 'warning',
              title: 'Office slot released',
              message: `An office slot remained unbooked and was automatically released after the 14-day notice period (${slotLabel}).`,
              userId: providerId,
              agencyId,
              relatedEntityType: 'office_standing_assignment',
              relatedEntityId: assignmentId,
              actorSource: 'Office Scheduling'
            });
            notified += 1;
          }
        } catch {
          // ignore per-row errors
        }
      }
      // else: warning was sent but 14-day window not yet elapsed — skip.
    }

    return { warned, forfeited, notified };
  }

  static async run() {
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

    let googleSync = null;
    try {
      googleSync = await this.syncBookedToGoogle({ horizonDays: 28 });
    } catch (e) {
      // Never block watchdog on calendar sync failures.
      googleSync = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    let ehrTnDowngrade = null;
    try {
      ehrTnDowngrade = await downgradeBookedWithoutExternalOverlap({ actorUserId: 1 });
    } catch (e) {
      ehrTnDowngrade = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }

    return { ok: true, ehrRefresh, internalSessionBook, confirms, forfeits, googleSync, ehrTnDowngrade };
  }
}
