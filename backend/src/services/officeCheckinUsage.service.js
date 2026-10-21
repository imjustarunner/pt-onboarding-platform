import pool from "../config/database.js";
import OfficeScheduleMaterializer from "./officeScheduleMaterializer.service.js";
import { evaluateClientSessionBooking } from "./clientSessionBookingRollout.service.js";
import { parseFeatureFlags } from "./medicalBillingFlags.service.js";
import { utcToZonedMysqlWall } from "../utils/officeEventDateTime.util.js";
export const UNUSED_OFFICE_OCCURRENCES = 6;

// One count per completed calendar occurrence, not per hourly database duplicate.
// A recorded cancellation/no-show/closure is excused; a documented session counts
// as use. Missing check-ins from before monitoring began never count.
export function consecutiveUnusedOfficeOccurrences(
  rows,
  { timeZone = "America/Denver", holidays = [] } = {},
) {
  const dates = new Map();
  for (const row of rows) {
    const day = utcToZonedMysqlWall(row.start_at, timeZone).slice(0, 10);
    if (
      holidays.includes(day) ||
      ["CANCELLED", "CANCELED", "NO_SHOW"].includes(
        String(row.status_outcome || "").toUpperCase(),
      )
    )
      continue;
    const used =
      !!Number(row.checked_in) ||
      !!Number(row.linked_appointment) ||
      !!row.clinical_session_id ||
      String(row.status_outcome).toUpperCase() === "COMPLETED";
    dates.set(day, dates.get(day) || used);
  }
  let count = 0;
  for (const day of [...dates.keys()].sort().reverse()) {
    if (dates.get(day)) break;
    count++;
  }
  return count;
}

export async function runOfficeCheckinUsageReviews() {
  const [assignments] =
    await pool.execute(`SELECT s.*,l.timezone,a.feature_flags
    FROM office_standing_assignments s JOIN office_locations l ON l.id=s.office_location_id
    LEFT JOIN agencies a ON a.id=s.booking_agency_id WHERE s.is_active=1`);
  const result = { monitored: 0, downgraded: 0, errors: [] };
  for (const assignment of assignments) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const [[current]] = await db.execute(
        "SELECT * FROM office_standing_assignments WHERE id=? AND is_active=1 FOR UPDATE",
        [assignment.id],
      );
      if (!current) {
        await db.commit();
        continue;
      }
      const integrated = evaluateClientSessionBooking(
        parseFeatureFlags(assignment.feature_flags).clientSessionBookingRollout,
        assignment.provider_id,
      ).enabled;
      await db.execute(
        "INSERT IGNORE INTO office_assignment_checkin_usage (assignment_id) VALUES (?)",
        [assignment.id],
      );
      if (integrated) {
        await db.execute(
          "UPDATE office_assignment_checkin_usage SET monitoring_started_at=UTC_TIMESTAMP(),unused_occurrences=0,last_checked_at=UTC_TIMESTAMP() WHERE assignment_id=?",
          [assignment.id],
        );
        await db.commit();
        continue;
      }
      const [[review]] = await db.execute(
        "SELECT * FROM office_assignment_checkin_usage WHERE assignment_id=? FOR UPDATE",
        [assignment.id],
      );
      // Never re-demote a manual rebooking on old evidence: a new cycle starts at
      // the previous downgrade.
      const [rows] = await db.execute(
        `SELECT e.start_at,e.status_outcome,e.clinical_session_id,
        EXISTS(SELECT 1 FROM office_event_checkins c WHERE c.office_location_id=e.office_location_id
          AND c.provider_id=? AND c.slot_start_at>=e.start_at AND c.slot_start_at<e.end_at) checked_in,
        EXISTS(SELECT 1 FROM appointments ap WHERE ap.office_event_id=e.id) linked_appointment
        FROM office_events e WHERE e.standing_assignment_id=? AND e.status='BOOKED'
          AND e.start_at >= ? AND e.start_at >= COALESCE(?,?) AND e.end_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)
        ORDER BY e.start_at DESC`,
        [
          assignment.provider_id,
          assignment.id,
          review.monitoring_started_at,
          review.downgraded_at,
          review.monitoring_started_at,
        ],
      );
      const [holidays] = assignment.booking_agency_id
        ? await db.execute(
            "SELECT holiday_date FROM agency_holidays WHERE agency_id=? AND holiday_date>=DATE(?)",
            [assignment.booking_agency_id, review.monitoring_started_at],
          )
        : [[]];
      const count = consecutiveUnusedOfficeOccurrences(rows, {
        timeZone: assignment.timezone,
        holidays: holidays.map((h) =>
          h.holiday_date instanceof Date
            ? h.holiday_date.toISOString().slice(0, 10)
            : String(h.holiday_date).slice(0, 10),
        ),
      });
      await db.execute(
        "UPDATE office_assignment_checkin_usage SET unused_occurrences=?,last_checked_at=UTC_TIMESTAMP() WHERE assignment_id=?",
        [count, assignment.id],
      );
      result.monitored++;
      if (count >= UNUSED_OFFICE_OCCURRENCES) {
        // Retain real appointments, clinical history, and the provider's assignment.
        // Only room-only booked projections become assigned/available.
        const [plans] = await db.execute(
          "SELECT id,session_context_json FROM office_booking_plans WHERE standing_assignment_id=? AND is_active=1 FOR UPDATE",
          [assignment.id],
        );
        for (const plan of plans) {
          const context =
            typeof plan.session_context_json === "string"
              ? JSON.parse(plan.session_context_json)
              : plan.session_context_json;
          if (
            context?.clientId ||
            context?.appointmentId ||
            context?.appointmentSeriesId
          )
            continue;
          await db.execute(
            "UPDATE office_booking_plans SET is_active=0 WHERE id=?",
            [plan.id],
          );
        }
        const [updated] = await db.execute(
          `UPDATE office_events e LEFT JOIN appointments ap ON ap.office_event_id=e.id
          SET e.status='RELEASED',e.slot_state='ASSIGNED_AVAILABLE',e.booked_provider_id=NULL,e.booking_plan_id=NULL,
            e.google_sync_status='PENDING',e.updated_at=CURRENT_TIMESTAMP
          WHERE e.standing_assignment_id=? AND e.start_at>UTC_TIMESTAMP() AND e.status='BOOKED'
            AND e.client_id IS NULL AND e.clinical_session_id IS NULL AND e.billing_context_id IS NULL AND e.note_context_id IS NULL
            AND ap.id IS NULL`,
          [assignment.id],
        );
        await db.execute(
          "UPDATE office_assignment_checkin_usage SET downgraded_at=UTC_TIMESTAMP(),unused_occurrences=0 WHERE assignment_id=?",
          [assignment.id],
        );
        if (updated.affectedRows) {
          await db.execute(
            `INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source)
            VALUES ('office_assignment_usage_review','info','Office time is now assigned and available',?,?,?,?,?,'Office Scheduling')`,
            [
              "After six scheduled occurrences without a client check-in, this office time is no longer marked booked. It remains assigned to you. Existing linked appointments and past records are unchanged.",
              assignment.provider_id,
              assignment.booking_agency_id,
              "office_standing_assignment",
              assignment.id,
            ],
          );
          result.downgraded++;
        }
      }
      await db.commit();
      if (count >= UNUSED_OFFICE_OCCURRENCES)
        OfficeScheduleMaterializer.invalidateOffice(
          assignment.office_location_id,
        );
    } catch (error) {
      await db.rollback();
      result.errors.push({
        assignmentId: assignment.id,
        message: error.message,
      });
    } finally {
      db.release();
    }
  }
  return result;
}
