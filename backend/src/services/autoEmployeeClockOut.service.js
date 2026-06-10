/**
 * Auto Employee Clock-Out
 *
 * Runs on a schedule (every 5 min). For any employee who is still clocked
 * in to an event, if every client at that event has checked out AND at
 * least AUTO_CLOCK_OUT_AFTER_MINUTES have elapsed since the last client's
 * checkout, the employee is automatically clocked out at
 * (last_client_checkout + AUTO_CLOCK_OUT_AFTER_MINUTES).
 *
 * This handles staff who forget to clock out at the end of the day.
 * Employees can still edit the resulting time entry via My Payroll.
 */

import pool from '../config/database.js';
import { recordSkillBuilderEventClockOut } from './skillBuildersEventKioskPunch.service.js';

const AUTO_CLOCK_OUT_AFTER_MINUTES = 90;

export async function runAutoEmployeeClockOut() {
  // Find all open clock-in punches from the last 2 days.
  // "Open" means no clock_out row with punched_at >= the clock_in's punched_at.
  const [openPunches] = await pool.execute(`
    SELECT
      p.id          AS punch_id,
      p.company_event_id,
      p.user_id,
      p.punched_at  AS clocked_in_at,
      p.session_id,
      ce.agency_id,
      DATE(p.punched_at) AS event_date
    FROM skill_builders_event_kiosk_punches p
    JOIN company_events ce ON ce.id = p.company_event_id
    WHERE
      p.punch_type = 'clock_in'
      AND p.punched_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
      AND NOT EXISTS (
        SELECT 1
        FROM skill_builders_event_kiosk_punches po
        WHERE po.company_event_id = p.company_event_id
          AND po.user_id          = p.user_id
          AND po.punch_type       = 'clock_out'
          AND po.punched_at      >= p.punched_at
      )
  `);

  if (!openPunches.length) return { clockedOut: [] };

  const clockedOut = [];

  for (const punch of openPunches) {
    const { company_event_id, user_id, agency_id, event_date } = punch;

    // ── Are any clients still checked in at this event today? ─────────────────
    // "Still in" = action = 'check_in' AND no corresponding program-event release.
    const [[{ still_in }]] = await pool.execute(`
      SELECT COUNT(*) AS still_in
      FROM event_day_kiosk_checkins ki
      WHERE
        ki.company_event_id = ?
        AND ki.kiosk_date   = ?
        AND ki.person_type  = 'client'
        AND ki.action       = 'check_in'
        AND NOT EXISTS (
          SELECT 1
          FROM company_event_releases r
          WHERE r.client_id          = ki.client_id
            AND r.company_event_id   = ki.company_event_id
            AND DATE(r.signed_at)    = ki.kiosk_date
        )
    `, [company_event_id, event_date]);

    if (Number(still_in) > 0) continue; // at least one client still here

    // ── Count total client check-ins for this event/date ──────────────────────
    // We need at least 1 to confirm an actual session occurred.
    const [[{ total_clients }]] = await pool.execute(`
      SELECT COUNT(*) AS total_clients
      FROM event_day_kiosk_checkins
      WHERE
        company_event_id = ?
        AND kiosk_date   = ?
        AND person_type  = 'client'
        AND action      != 'voided'
    `, [company_event_id, event_date]);

    if (Number(total_clients) === 0) continue; // no clients ever checked in — skip

    // ── Find the time the last client left ────────────────────────────────────
    // Covers both Skill Builders (checked_out_at in event_day_kiosk_checkins)
    // and Program events (signed_at in company_event_releases).
    const [[{ last_checkout_at }]] = await pool.execute(`
      SELECT MAX(t) AS last_checkout_at FROM (
        SELECT checked_out_at AS t
        FROM event_day_kiosk_checkins
        WHERE company_event_id = ?
          AND kiosk_date       = ?
          AND person_type      = 'client'
          AND action           = 'check_out'
          AND checked_out_at  IS NOT NULL
        UNION ALL
        SELECT signed_at AS t
        FROM company_event_releases
        WHERE company_event_id = ?
          AND DATE(signed_at)  = ?
      ) AS checkouts
    `, [company_event_id, event_date, company_event_id, event_date]);

    if (!last_checkout_at) continue; // no recorded checkout time

    const lastCheckout = new Date(last_checkout_at);
    const autoClockOutAt = new Date(lastCheckout.getTime() + AUTO_CLOCK_OUT_AFTER_MINUTES * 60 * 1000);

    if (new Date() < autoClockOutAt) continue; // grace period hasn't elapsed yet

    // ── Clock out the employee, backdated to (last client checkout + 90 min) ──
    const result = await recordSkillBuilderEventClockOut(pool, {
      agencyId:   agency_id,
      eventId:    company_event_id,
      userId:     user_id,
      clockOutAt: autoClockOutAt,
      source:     'auto_all_clients_out'
    });

    if (result?.ok) {
      clockedOut.push({ userId: user_id, eventId: company_event_id, clockOutAt: autoClockOutAt });
      console.log(
        `[autoEmployeeClockOut] User ${user_id} auto clocked out of event ${company_event_id}` +
        ` at ${autoClockOutAt.toISOString()} (${AUTO_CLOCK_OUT_AFTER_MINUTES} min after last client)`
      );
    }
  }

  return { clockedOut };
}
