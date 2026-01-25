import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';

function startOfWeekISO(dateStr) {
  // Returns Sunday of the week for the given YYYY-MM-DD (local time)
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0..6
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function isoForDateHour(dateStr, hour24) {
  const hh = String(hour24).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:00:00`).toISOString();
}

function weekIndexFromAnchor(dateStr, anchorStr) {
  const a = new Date(`${anchorStr}T00:00:00`);
  const d = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.floor((d - a) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function isAssignmentActiveOnDate(assignment, dateStr) {
  // Weekly always active; biweekly active on even week offset from available_since_date.
  if (assignment.assigned_frequency === 'WEEKLY') return true;
  const anchor = assignment.available_since_date || new Date().toISOString().slice(0, 10);
  const wi = weekIndexFromAnchor(dateStr, anchor);
  return wi % 2 === 0;
}

function shouldBookOnDate(plan, assignment, dateStr) {
  if (!plan || plan.is_active === 0) return false;
  const start = String(plan.booking_start_date || '').slice(0, 10);
  if (!start) return false;
  if (dateStr < start) return false;

  if (plan.booked_frequency === 'WEEKLY') return true;

  if (plan.booked_frequency === 'BIWEEKLY') {
    if (assignment.assigned_frequency === 'BIWEEKLY') return true;
    const wi = weekIndexFromAnchor(dateStr, start);
    return wi % 2 === 0;
  }

  if (plan.booked_frequency === 'MONTHLY') {
    // Caller handles month de-dupe if needed; for Stage1 we mirror all ASSIGNED_BOOKED.
    return true;
  }

  return false;
}

export class OfficeScheduleMaterializer {
  static startOfWeekISO(dateStr) {
    return startOfWeekISO(dateStr);
  }

  static addDays(dateStr, days) {
    return addDays(dateStr, days);
  }

  static async materializeWeek({ officeLocationId, weekStartRaw, createdByUserId }) {
    const officeId = parseInt(officeLocationId, 10);
    const weekStart = startOfWeekISO(String(weekStartRaw || ''));
    const uid = parseInt(createdByUserId, 10) || 0;
    if (!officeId || !weekStart) return { ok: false, reason: 'invalid_args' };

    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    // Standing assignments + booking plans are the source of truth for assigned_* states.
    const standing = await OfficeStandingAssignment.listByOffice(officeId);
    const plans = await OfficeBookingPlan.listActiveByAssignmentIds(standing.map((s) => s.id));
    const planByAssignment = new Map(plans.map((p) => [p.standing_assignment_id, p]));

    for (const a of standing) {
      for (const date of days) {
        if (!isAssignmentActiveOnDate(a, date)) continue;
        const startAt = isoForDateHour(date, a.hour);
        const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();

        const isTemporary =
          a.availability_mode === 'TEMPORARY' &&
          a.temporary_until_date &&
          date <= String(a.temporary_until_date).slice(0, 10);
        const baseSlotState = isTemporary ? 'ASSIGNED_TEMPORARY' : 'ASSIGNED_AVAILABLE';

        const plan = planByAssignment.get(a.id) || null;
        let slotState = baseSlotState;
        if (plan && shouldBookOnDate(plan, a, date)) {
          slotState = 'ASSIGNED_BOOKED';
        }

        await OfficeEvent.upsertSlotState({
          officeLocationId: officeId,
          roomId: a.room_id,
          startAt,
          endAt,
          slotState,
          standingAssignmentId: a.id,
          bookingPlanId: plan?.id || null,
          assignedProviderId: a.provider_id,
          bookedProviderId: slotState === 'ASSIGNED_BOOKED' ? a.provider_id : null,
          createdByUserId: uid || 1
        });
      }
    }

    return { ok: true, officeLocationId: officeId, weekStart, days };
  }
}

export default OfficeScheduleMaterializer;

