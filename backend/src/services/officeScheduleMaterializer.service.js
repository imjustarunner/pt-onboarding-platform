import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';

function parseYmdParts(dateStr) {
  const raw = String(dateStr || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  return { y, mo, d };
}

function ymdFromUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeYmd(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateTime(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 19).replace('T', ' ');
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function startOfWeekISO(dateStr) {
  // Returns Sunday of the week for the given YYYY-MM-DD using UTC calendar math.
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const day = d.getUTCDay(); // 0..6
  d.setUTCDate(d.getUTCDate() - day);
  return ymdFromUtcDate(d);
}

function addDays(dateStr, days) {
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return ymdFromUtcDate(d);
}

function mysqlDateTimeForDateHour(dateStr, hour24) {
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  const base = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const totalHours = Number(hour24 || 0);
  const dayOffset = Math.floor(totalHours / 24);
  const normalizedHour = ((totalHours % 24) + 24) % 24;
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return `${ymdFromUtcDate(base)} ${String(normalizedHour).padStart(2, '0')}:00:00`;
}

function weekIndexFromAnchor(dateStr, anchorStr) {
  const ap = parseYmdParts(anchorStr);
  const dp = parseYmdParts(dateStr);
  if (!ap || !dp) return 0;
  const a = Date.UTC(ap.y, ap.mo - 1, ap.d);
  const d = Date.UTC(dp.y, dp.mo - 1, dp.d);
  const diffDays = Math.floor((d - a) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function weekdayIndexFromYmd(dateStr) {
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}

function isAssignmentActiveOnDate(assignment, dateStr) {
  const availableSince = normalizeYmd(assignment.available_since_date);
  if (availableSince && dateStr < availableSince) return false;
  const availableUntil = normalizeYmd(assignment.temporary_until_date);
  if (availableUntil && dateStr > availableUntil) return false;
  // Require ongoing provider confirmation every 2 weeks; fully expire after 6 weeks
  // without confirmation so stale assigned slots stop materializing.
  const lastTwoWeekConfirm = normalizeYmd(assignment.last_two_week_confirmed_at);
  const created = normalizeYmd(assignment.created_at);
  const confirmAnchor = lastTwoWeekConfirm || availableSince || created;
  if (confirmAnchor) {
    const expiresAt = addDays(confirmAnchor, 42);
    if (expiresAt && dateStr > expiresAt) return false;
  }

  // Weekly always active; biweekly active on even week offset from available_since_date.
  if (assignment.assigned_frequency === 'WEEKLY') return true;
  const anchor = normalizeYmd(assignment.available_since_date) || new Date().toISOString().slice(0, 10);
  const wi = weekIndexFromAnchor(dateStr, anchor);
  return wi % 2 === 0;
}

/** Exported for use by isRoomOpenAt when checking if a standing assignment blocks a slot. */
export function shouldBookOnDate(plan, assignment, dateStr) {
  if (!plan || plan.is_active === 0) return false;
  const start = normalizeYmd(plan.booking_start_date);
  if (!start) return false;
  if (dateStr < start) return false;
  const planHardLimit = addDays(start, 365);
  if (planHardLimit && dateStr > planHardLimit) return false;
  const configuredUntil = normalizeYmd(plan.active_until_date);
  if (configuredUntil && dateStr > configuredUntil) return false;

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

function bookingOccurrenceNumberForDate(plan, assignment, dateStr) {
  const start = normalizeYmd(plan?.booking_start_date);
  if (!start || dateStr < start) return 0;
  const planHardLimit = addDays(start, 365);
  const configuredUntil = String(plan?.active_until_date || '').slice(0, 10);
  const upperBound = [dateStr, planHardLimit, configuredUntil]
    .filter((x) => String(x || '').length === 10)
    .sort()[0] || dateStr;

  let count = 0;
  for (let d = start; d && d <= upperBound; d = addDays(d, 1)) {
    const weekday = weekdayIndexFromYmd(d);
    if (!Number.isInteger(weekday) || Number(weekday) !== Number(assignment?.weekday)) continue;
    if (!shouldBookOnDate(plan, assignment, d)) continue;
    count += 1;
  }
  return count;
}

function shouldBookByCount(plan, assignment, dateStr) {
  const maxCountRaw = Number(plan?.booked_occurrence_count || 0);
  if (!Number.isInteger(maxCountRaw) || maxCountRaw <= 0) return true;
  const occurrenceNumber = bookingOccurrenceNumberForDate(plan, assignment, dateStr);
  return occurrenceNumber > 0 && occurrenceNumber <= maxCountRaw;
}

const materializeInFlight = new Map();
const materializeRecent = new Map();
const MATERIALIZE_RECENT_MS = 15000;

export class OfficeScheduleMaterializer {
  static startOfWeekISO(dateStr) {
    return startOfWeekISO(dateStr);
  }

  static addDays(dateStr, days) {
    return addDays(dateStr, days);
  }

  static async materializeWeek({ officeLocationId, weekStartRaw, createdByUserId, useExactWeekStart = false }) {
    const officeId = parseInt(officeLocationId, 10);
    const rawWeekStart = normalizeYmd(weekStartRaw);
    const weekStart = useExactWeekStart
      ? rawWeekStart
      : startOfWeekISO(String(rawWeekStart || ''));
    const uid = parseInt(createdByUserId, 10) || 0;
    if (!officeId || !weekStart) return { ok: false, reason: 'invalid_args' };
    const key = `${officeId}|${weekStart}`;
    const now = Date.now();
    const recent = materializeRecent.get(key);
    if (recent && (now - recent.at) < MATERIALIZE_RECENT_MS) return recent.value;
    if (materializeInFlight.has(key)) return materializeInFlight.get(key);

    const runner = (async () => {
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const windowStart = `${weekStart} 00:00:00`;
      const windowEnd = `${addDays(weekStart, 7)} 00:00:00`;

      // Standing assignments + booking plans are the source of truth for assigned_* states.
      const standing = await OfficeStandingAssignment.listByOffice(officeId);
      const plans = await OfficeBookingPlan.listActiveByAssignmentIds(standing.map((s) => s.id));
      const planByAssignment = new Map(plans.map((p) => [p.standing_assignment_id, p]));
      const existingEvents = await OfficeEvent.listForOfficeWindow({
        officeLocationId: officeId,
        startAt: windowStart,
        endAt: windowEnd
      });
      const existingBySlot = new Map();
      for (const e of existingEvents || []) {
        const roomId = Number(e.room_id || e.roomId || 0);
        const startAt = normalizeDateTime(e.start_at || e.startAt);
        const endAt = normalizeDateTime(e.end_at || e.endAt);
        if (!roomId || !startAt || !endAt) continue;
        const slotKey = `${roomId}|${startAt}|${endAt}`;
        if (!existingBySlot.has(slotKey)) existingBySlot.set(slotKey, []);
        existingBySlot.get(slotKey).push(e);
      }

      for (const a of standing) {
        for (const date of days) {
          // Materialize only on the assignment's configured weekday.
          const weekday = weekdayIndexFromYmd(date);
          if (!Number.isInteger(weekday) || Number(weekday) !== Number(a.weekday)) continue;
          if (!isAssignmentActiveOnDate(a, date)) continue;
          const startAt = mysqlDateTimeForDateHour(date, a.hour);
          const endAt = mysqlDateTimeForDateHour(date, Number(a.hour) + 1);
          const slotKey = `${Number(a.room_id || 0)}|${startAt}|${endAt}`;
          const existingRows = existingBySlot.get(slotKey) || [];

          const extCount = Number(a.temporary_extension_count || 0);
          const untilStr = normalizeYmd(a.temporary_until_date);
          // After 2 extensions, when date > temporary_until_date, slot falls off (provider must re-request)
          if (a.availability_mode === 'TEMPORARY' && extCount >= 2 && untilStr && date > untilStr) continue;

          // Keep temporary expiry semantics, but surface approved availability as assigned_available.
          const baseSlotState = 'ASSIGNED_AVAILABLE';

          const plan = planByAssignment.get(a.id) || null;
          let slotState = baseSlotState;
          if (plan && shouldBookOnDate(plan, a, date) && shouldBookByCount(plan, a, date)) {
            slotState = 'ASSIGNED_BOOKED';
          } else if (plan && !shouldBookOnDate(plan, a, date)) {
            // Assignment weekly + booking biweekly: off-weeks are released for others to book.
            const hasStandingEvent = existingRows.some((ev) =>
              Number(ev?.standing_assignment_id || 0) === Number(a.id || 0)
              && String(ev?.status || '').toUpperCase() !== 'CANCELLED'
            );
            if (hasStandingEvent) {
              await OfficeEvent.cancelSlotIfFromStandingAssignment({
                roomId: a.room_id,
                startAt,
                endAt,
                standingAssignmentId: a.id
              });
            }
            continue; // Skip upsert - slot is open
          }

          const desiredBookedProviderId = slotState === 'ASSIGNED_BOOKED' ? Number(a.provider_id || 0) : 0;
          const hasMatchingRow = existingRows.some((ev) =>
            String(ev?.status || '').toUpperCase() !== 'CANCELLED'
            && String(ev?.slot_state || '').toUpperCase() === String(slotState || '').toUpperCase()
            && Number(ev?.standing_assignment_id || 0) === Number(a.id || 0)
            && Number(ev?.booking_plan_id || 0) === Number(plan?.id || 0)
            && Number(ev?.assigned_provider_id || 0) === Number(a.provider_id || 0)
            && Number(ev?.booked_provider_id || 0) === desiredBookedProviderId
          );
          if (hasMatchingRow) continue;

          await OfficeEvent.upsertSlotState({
            officeLocationId: officeId,
            roomId: a.room_id,
            startAt,
            endAt,
            slotState,
            standingAssignmentId: a.id,
            bookingPlanId: plan?.id || null,
            recurrenceGroupId: a.recurrence_group_id || null,
            assignedProviderId: a.provider_id,
            bookedProviderId: desiredBookedProviderId || null,
            createdByUserId: uid || 1
          });
        }
      }

      return { ok: true, officeLocationId: officeId, weekStart, days };
    })();

    materializeInFlight.set(key, runner);
    try {
      const value = await runner;
      materializeRecent.set(key, { at: Date.now(), value });
      return value;
    } finally {
      materializeInFlight.delete(key);
    }
  }
}

export default OfficeScheduleMaterializer;

