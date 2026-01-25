import pool from '../config/database.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import GoogleCalendarService from './googleCalendar.service.js';

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
          relatedEntityId: bookingPlanId
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

  static async autoForfeitStaleAvailableSlots() {
    // Forfeit assigned_available slots that have been available (unbooked) for 6 weeks.
    // Condition: active standing assignment, AVAILABLE, available_since_date <= today-42, no active booking plan.
    const [rows] = await pool.execute(
      `SELECT
         osa.id AS standing_assignment_id,
         osa.provider_id,
         ola.agency_id,
         ol.name AS office_name
       FROM office_standing_assignments osa
       JOIN office_location_agencies ola ON ola.office_location_id = osa.office_location_id
       JOIN office_locations ol ON ol.id = osa.office_location_id
       LEFT JOIN office_booking_plans bp ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
       WHERE osa.is_active = TRUE
         AND osa.availability_mode = 'AVAILABLE'
         AND osa.available_since_date IS NOT NULL
         AND osa.available_since_date <= DATE_SUB(CURDATE(), INTERVAL 42 DAY)
         AND bp.id IS NULL`
    );

    let forfeited = 0;
    let notified = 0;
    for (const r of rows || []) {
      const assignmentId = Number(r.standing_assignment_id);
      const providerId = Number(r.provider_id);
      const agencyId = Number(r.agency_id);
      if (!assignmentId || !providerId || !agencyId) continue;

      await pool.execute(
        `UPDATE office_standing_assignments
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [assignmentId]
      );
      forfeited += 1;

      // Notify provider (deduped by trigger+provider).
      try {
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
            title: 'Office slot forfeited',
            message: `An office slot remained unbooked for 6 weeks and has been forfeited (${r.office_name || 'Office'}).`,
            userId: providerId,
            agencyId,
            relatedEntityType: 'office_standing_assignment',
            relatedEntityId: assignmentId
          });
          notified += 1;
        }
      } catch {
        // ignore
      }
    }

    return { forfeited, notified };
  }

  static async run() {
    const confirms = await this.emitSixWeekBookingConfirmReminders();
    const forfeits = await this.autoForfeitStaleAvailableSlots();
    let googleSync = null;
    try {
      googleSync = await this.syncBookedToGoogle({ horizonDays: 28 });
    } catch (e) {
      // Never block watchdog on calendar sync failures.
      googleSync = { ok: false, reason: 'exception', error: String(e?.message || e) };
    }
    return { ok: true, confirms, forfeits, googleSync };
  }
}

