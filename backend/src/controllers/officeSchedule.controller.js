import pool from '../config/database.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeRoom from '../models/OfficeRoom.model.js';
import OfficeRoomRequest from '../models/OfficeRoomRequest.model.js';
import OfficeRoomAssignment from '../models/OfficeRoomAssignment.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeBookingRequest from '../models/OfficeBookingRequest.model.js';
import User from '../models/User.model.js';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import OfficeScheduleMaterializer from '../services/officeScheduleMaterializer.service.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';

const canManageSchedule = (role) =>
  role === 'clinical_practice_assistant' || role === 'admin' || role === 'super_admin' || role === 'support' || role === 'staff';

function formatClinicianName(firstName, lastName) {
  const li = (lastName || '').trim().slice(0, 1);
  const ln = li ? `${li}.` : '';
  return `${firstName || ''} ${ln}`.trim();
}

function localYmdInTz(dateLike, timeZone) {
  try {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    // en-CA yields YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return '';
  }
}

function mysqlDateTimeForDateHour(dateStr, hour24) {
  const m = String(dateStr || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const base = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const totalHours = Number(hour24 || 0);
  const dayOffset = Math.floor(totalHours / 24);
  const normalizedHour = ((totalHours % 24) + 24) % 24;
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const ymd = base.toISOString().slice(0, 10);
  return `${ymd} ${String(normalizedHour).padStart(2, '0')}:00:00`;
}

function normalizeMysqlDateTime(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function parseSlotDateHour(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      date: value.toISOString().slice(0, 10),
      hour: value.getUTCHours()
    };
  }
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})/);
  if (!m) return null;
  const hour = Number(m[2]);
  if (!Number.isInteger(hour)) return null;
  return { date: m[1], hour };
}

function timeMs(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    const ss = Number(m[6]);
    return Date.UTC(y, mo, d, hh, mm, ss);
  }
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayHourInTz(dateLike, timeZone) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: '2-digit',
      hour12: false
    }).formatToParts(d);
    const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
    const hourStr = parts.find((p) => p.type === 'hour')?.value || '';
    const hour = parseInt(hourStr, 10);
    const normalizedHour = hour === 24 ? 0 : hour;
    const idx = WEEKDAY_NAMES.indexOf(weekday);
    if (idx < 0 || !Number.isInteger(normalizedHour)) return null;
    return { weekdayName: weekday, weekdayIndex: idx, hour: normalizedHour };
  } catch {
    return null;
  }
}

async function isRoomOpenAt({ officeLocationId, roomId, startAt, endAt, officeTimeZone }) {
  // If any event overlaps this window, it is not open.
  const [eventRows] = await pool.execute(
    `SELECT 1
     FROM office_events
     WHERE room_id = ?
       AND start_at < ?
       AND end_at > ?
       AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
     LIMIT 1`,
    [roomId, endAt, startAt]
  );
  if (eventRows?.[0]) return false;

  // If a legacy assignment overlaps, treat as not open.
  const [assignRows] = await pool.execute(
    `SELECT 1
     FROM office_room_assignments
     WHERE room_id = ?
       AND start_at < ?
       AND (end_at IS NULL OR end_at > ?)
     LIMIT 1`,
    [roomId, endAt, startAt]
  );
  if (assignRows?.[0]) return false;

  // If a standing assignment is active for this slot, treat as not open.
  // (Materializer usually creates events for these, but this is a safe guard.)
  const tz = officeTimeZone || 'America/New_York';
  const wh = weekdayHourInTz(startAt, tz);
  if (wh) {
    const st = await OfficeStandingAssignment.findActiveBySlot({
      officeLocationId,
      roomId,
      weekday: wh.weekdayIndex,
      hour: wh.hour
    });
    if (st?.id) return false;
  }

  return true;
}

async function userHasBlockingExpiredCredential(userId) {
  // Model method is findByUser (not findByUserId)
  const docs = await UserComplianceDocument.findByUser(userId);
  const today = new Date(new Date().toISOString().slice(0, 10));
  return (docs || []).some((d) => {
    if (!d.is_blocking) return false;
    if (!d.expiration_date) return false;
    return new Date(d.expiration_date) < today;
  });
}

const startOfWeekISO = OfficeScheduleMaterializer.startOfWeekISO;
const addDays = OfficeScheduleMaterializer.addDays;

export const listLocations = async (req, res, next) => {
  try {
    // Compliance gate: blocking expired credential => no scheduling access
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    if (req.user.role === 'super_admin') {
      const rows = await OfficeLocation.listAll({ includeInactive: false });
      return res.json(rows || []);
    }

    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = userAgencies.map((a) => a.id);
    if (agencyIds.length === 0) return res.json([]);

    const all = [];
    for (const agencyId of agencyIds) {
      const rows = await OfficeLocation.findByAgencyMembership(agencyId);
      all.push(...rows);
    }
    // De-dupe (multi-agency users will see shared offices)
    const byId = new Map();
    for (const r of all) byId.set(r.id, r);
    res.json(Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
  } catch (e) {
    next(e);
  }
};

export const listLocationProviders = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can view building provider options' } });
    }

    const { locationId } = req.params;
    const officeLocationId = parseInt(locationId, 10);
    if (!officeLocationId) return res.status(400).json({ error: { message: 'Invalid location id' } });

    const loc = await OfficeLocation.findById(officeLocationId);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Phase 2 foundation: if explicit user_office_locations links exist, include them as canonical.
    // Backward compatible fallback to agency-based linkage when the table is not present yet.
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT
            u.id,
            u.first_name,
            u.last_name,
            u.email,
            u.role,
            u.has_provider_access,
            u.is_active,
            u.status,
            u.is_archived
         FROM users u
         LEFT JOIN user_office_locations uol
           ON uol.user_id = u.id
          AND uol.office_location_id = ?
          AND (uol.is_active IS NULL OR uol.is_active = TRUE)
         LEFT JOIN user_agencies ua ON ua.user_id = u.id
         LEFT JOIN office_location_agencies ola
           ON ola.agency_id = ua.agency_id
          AND ola.office_location_id = ?
         WHERE (uol.user_id IS NOT NULL OR ola.office_location_id IS NOT NULL)
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
           AND (
             u.role IN ('provider', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'staff')
             OR (u.has_provider_access = TRUE)
           )
           AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [officeLocationId, officeLocationId]
      );
      return res.json(rows || []);
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      const [rows] = await pool.execute(
        `SELECT DISTINCT
            u.id,
            u.first_name,
            u.last_name,
            u.email,
            u.role,
            u.has_provider_access,
            u.is_active,
            u.status,
            u.is_archived
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         JOIN office_location_agencies ola ON ola.agency_id = ua.agency_id
         WHERE ola.office_location_id = ?
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
           AND (
             u.role IN ('provider', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'staff')
             OR (u.has_provider_access = TRUE)
           )
           AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [officeLocationId]
      );
      return res.json(rows || []);
    }
  } catch (e) {
    next(e);
  }
};

// Weekly room grid: Mon–Sun hourly 7am–9pm (end hour exclusive in UI)
export const getWeeklyGrid = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { locationId } = req.params;
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
    const weekStart = startOfWeekISO(weekStartRaw);
    if (!weekStart) {
      return res.status(400).json({ error: { message: 'weekStart must be YYYY-MM-DD' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const windowStart = `${weekStart} 00:00:00`;
    const windowEnd = `${addDays(weekStart, 7)} 00:00:00`;

    // Normalize slots for each room/day/hour
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));

    // Materialize office_events rows for assigned slots in this week (so kiosk has stable event IDs).
    await OfficeScheduleMaterializer.materializeWeek({
      officeLocationId: parseInt(locationId),
      weekStartRaw: weekStart,
      createdByUserId: req.user.id
    });

    const officeLocationIdNum = parseInt(locationId);
    const events = await OfficeEvent.listForOfficeWindow({ officeLocationId: officeLocationIdNum, startAt: windowStart, endAt: windowEnd });
    // Legacy assignments (office_room_assignments) are treated as assigned_available for now.
    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt: windowStart,
      endAt: windowEnd
    });
    const virtualIntakeSlotKeys = new Set();
    try {
      const [virtualRows] = await pool.execute(
        `SELECT provider_id, start_at, end_at
         FROM provider_virtual_slot_availability
         WHERE office_location_id = ?
           AND is_active = TRUE
           AND session_type IN ('INTAKE', 'BOTH')
           AND start_at < ?
           AND end_at > ?`,
        [officeLocationIdNum, windowEnd, windowStart]
      );
      for (const row of virtualRows || []) {
        const providerId = Number(row.provider_id || 0);
        const startAt = normalizeMysqlDateTime(row.start_at);
        const endAt = normalizeMysqlDateTime(row.end_at);
        if (!providerId || !startAt || !endAt) continue;
        virtualIntakeSlotKeys.add(`${providerId}:${startAt}:${endAt}`);
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    const inPersonIntakeSlotKeys = new Set();
    try {
      const [inPersonRows] = await pool.execute(
        `SELECT provider_id, start_at, end_at
         FROM provider_in_person_slot_availability
         WHERE office_location_id = ?
           AND is_active = TRUE
           AND start_at < ?
           AND end_at > ?`,
        [officeLocationIdNum, windowEnd, windowStart]
      );
      for (const row of inPersonRows || []) {
        const providerId = Number(row.provider_id || 0);
        const startAt = normalizeMysqlDateTime(row.start_at);
        const endAt = normalizeMysqlDateTime(row.end_at);
        if (!providerId || !startAt || !endAt) continue;
        inPersonIntakeSlotKeys.add(`${providerId}:${startAt}:${endAt}`);
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Index events by room+date+hour (hourly grid; pick state with highest precedence)
    const key = (roomId, date, hour) => `${roomId}:${date}:${hour}`;
    const eventBySlot = new Map();
    for (const e of events || []) {
      const slot = parseSlotDateHour(e.start_at);
      if (!slot) continue;
      const date = slot.date;
      const hour = slot.hour;
      const k = key(e.room_id, date, hour);
      // Precedence: assigned_booked over assigned_temporary over assigned_available
      const prev = eventBySlot.get(k);
      if (!prev) {
        eventBySlot.set(k, e);
      } else {
        const rank = (x) => {
          const st = x?.slot_state || null;
          if (st === 'ASSIGNED_BOOKED' || x?.status === 'BOOKED') return 3;
          if (st === 'ASSIGNED_TEMPORARY') return 2;
          if (st === 'ASSIGNED_AVAILABLE' || x?.status === 'RELEASED') return 1;
          return 0;
        };
        if (rank(e) > rank(prev)) eventBySlot.set(k, e);
      }
    }

    // Index assignments by room+date+hour (treat as "assigned" if overlapping the hour slot)
    const assignedBySlot = new Map();
    for (const a of assignments || []) {
      const assignmentStartMs = timeMs(a.start_at);
      const assignmentEndMs = a.end_at ? timeMs(a.end_at) : null;
      if (!Number.isFinite(assignmentStartMs)) continue;
      for (const date of days) {
        for (const hour of hours) {
          const slotStart = mysqlDateTimeForDateHour(date, hour);
          const slotEnd = mysqlDateTimeForDateHour(date, Number(hour) + 1);
          const slotStartMs = timeMs(slotStart);
          const slotEndMs = timeMs(slotEnd);
          if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs)) continue;
          const overlaps = assignmentStartMs < slotEndMs && (assignmentEndMs === null || assignmentEndMs > slotStartMs);
          if (!overlaps) continue;
          const k = key(a.room_id, date, hour);
          if (!assignedBySlot.has(k)) assignedBySlot.set(k, a);
        }
      }
    }

    const slots = [];
    for (const room of rooms) {
      for (const date of days) {
        for (const hour of hours) {
          const k = key(room.id, date, hour);
          const e = eventBySlot.get(k);
          if (e) {
            const st = e.slot_state || (e.status === 'BOOKED' ? 'ASSIGNED_BOOKED' : 'ASSIGNED_AVAILABLE');
            const state =
              st === 'ASSIGNED_BOOKED'
                ? 'assigned_booked'
                : st === 'ASSIGNED_TEMPORARY'
                  ? 'assigned_temporary'
                  : 'assigned_available';
            const bookedFirst = String(e.booked_provider_first_name || '').trim();
            const bookedLast = String(e.booked_provider_last_name || '').trim();
            const bookedLi = bookedLast.slice(0, 1);
            const bookedInitials = `${bookedFirst.slice(0, 1)}${bookedLi}`.toUpperCase();

            const assignedFirst = String(e.assigned_provider_first_name || '').trim();
            const assignedLast = String(e.assigned_provider_last_name || '').trim();
            const assignedLi = assignedLast.slice(0, 1);
            const assignedInitials = `${assignedFirst.slice(0, 1)}${assignedLi}`.toUpperCase();

            const assignedProviderName = assignedFirst || assignedLast ? formatClinicianName(assignedFirst, assignedLast) : '';
            const bookedProviderName = bookedFirst || bookedLast ? formatClinicianName(bookedFirst, bookedLast) : '';
            const displayInitials = bookedInitials || assignedInitials || null;
            const slotStartAt = mysqlDateTimeForDateHour(date, hour);
            const slotEndAt = mysqlDateTimeForDateHour(date, Number(hour) + 1);
            const virtualIntakeEnabled =
              Boolean(e.assigned_provider_id || e.booked_provider_id) &&
              Boolean(slotStartAt) &&
              Boolean(slotEndAt) &&
              virtualIntakeSlotKeys.has(
                `${Number(e.assigned_provider_id || e.booked_provider_id)}:${slotStartAt}:${slotEndAt}`
              );
            const inPersonIntakeEnabled =
              Boolean(e.assigned_provider_id || e.booked_provider_id) &&
              Boolean(slotStartAt) &&
              Boolean(slotEndAt) &&
              inPersonIntakeSlotKeys.has(
                `${Number(e.assigned_provider_id || e.booked_provider_id)}:${slotStartAt}:${slotEndAt}`
              );
            slots.push({
              roomId: room.id,
              date,
              hour,
              state,
              eventId: e.id,
              standingAssignmentId: e.standing_assignment_id || null,
              bookingPlanId: e.booking_plan_id || null,
              recurrenceGroupId: e.recurrence_group_id || null,
              providerId: e.assigned_provider_id || e.booked_provider_id || null,
              providerInitials: displayInitials,
              assignedProviderId: e.assigned_provider_id || null,
              bookedProviderId: e.booked_provider_id || null,
              assignedProviderName: assignedProviderName || null,
              bookedProviderName: bookedProviderName || null,
              virtualIntakeEnabled,
              inPersonIntakeEnabled
            });
            continue;
          }
          const a = assignedBySlot.get(k);
          if (a) {
            let assignmentEventId = null;
            const slotStartAt = `${date} ${String(hour).padStart(2, '0')}:00:00`;
            const slotEndAt = `${date} ${String(hour + 1).padStart(2, '0')}:00:00`;
            try {
              // Backfill hourly event rows for legacy assignment-only slots so admin actions
              // (booked/virtual/cancel) always have a stable event id to operate on.
              // eslint-disable-next-line no-await-in-loop
              const ev = await OfficeEvent.upsertSlotState({
                officeLocationId: officeLocationIdNum,
                roomId: room.id,
                startAt: slotStartAt,
                endAt: slotEndAt,
                slotState: 'ASSIGNED_AVAILABLE',
                standingAssignmentId: null,
                bookingPlanId: null,
                assignedProviderId: a.assigned_user_id || null,
                bookedProviderId: null,
                createdByUserId: req.user.id
              });
              assignmentEventId = ev?.id || null;
            } catch (err) {
              if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
            }

            const initials = `${String(a.first_name || '').slice(0, 1)}${String(a.last_name || '').slice(0, 1)}`.toUpperCase();
            const virtualIntakeEnabled =
              Boolean(a.assigned_user_id) &&
              Boolean(slotStartAt) &&
              Boolean(slotEndAt) &&
              virtualIntakeSlotKeys.has(`${Number(a.assigned_user_id)}:${slotStartAt}:${slotEndAt}`);
            const inPersonIntakeEnabled =
              Boolean(a.assigned_user_id) &&
              Boolean(slotStartAt) &&
              Boolean(slotEndAt) &&
              inPersonIntakeSlotKeys.has(`${Number(a.assigned_user_id)}:${slotStartAt}:${slotEndAt}`);
            slots.push({
              roomId: room.id,
              date,
              hour,
              state: 'assigned_available',
              eventId: assignmentEventId,
              recurrenceGroupId: null,
              providerId: a.assigned_user_id,
              providerInitials: initials || null,
              assignedProviderId: a.assigned_user_id,
              bookedProviderId: null,
              assignedProviderName: formatClinicianName(a.first_name, a.last_name) || null,
              bookedProviderName: null,
              virtualIntakeEnabled,
              inPersonIntakeEnabled
            });
            continue;
          }
          slots.push({
            roomId: room.id,
            date,
            hour,
            state: 'open',
            eventId: null,
            recurrenceGroupId: null,
            providerId: null,
            providerInitials: null,
            assignedProviderId: null,
            bookedProviderId: null,
            assignedProviderName: null,
            bookedProviderName: null,
            virtualIntakeEnabled: false,
            inPersonIntakeEnabled: false
          });
        }
      }
    }

    // Attach recurrence/frequency metadata to support modern office layout UIs.
    // - standingAssignmentId => office_standing_assignments.assigned_frequency (WEEKLY/BIWEEKLY)
    // - bookingPlanId => office_booking_plans.booked_frequency (WEEKLY/BIWEEKLY/MONTHLY)
    const standingIds = Array.from(
      new Set((slots || []).map((s) => parseInt(s?.standingAssignmentId, 10)).filter((n) => Number.isInteger(n) && n > 0))
    );
    const planIds = Array.from(
      new Set((slots || []).map((s) => parseInt(s?.bookingPlanId, 10)).filter((n) => Number.isInteger(n) && n > 0))
    );

    const assignedFreqByStandingId = new Map();
    if (standingIds.length) {
      const placeholders = standingIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT id, assigned_frequency
         FROM office_standing_assignments
         WHERE id IN (${placeholders})`,
        standingIds
      );
      for (const r of rows || []) assignedFreqByStandingId.set(Number(r.id), String(r.assigned_frequency || '').toUpperCase());
    }

    const bookedFreqByPlanId = new Map();
    const bookedStartByPlanId = new Map();
    const bookedUntilByPlanId = new Map();
    const bookedCountByPlanId = new Map();
    if (planIds.length) {
      const placeholders = planIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT id, booked_frequency, booking_start_date, active_until_date, booked_occurrence_count
         FROM office_booking_plans
         WHERE id IN (${placeholders})`,
        planIds
      );
      for (const r of rows || []) {
        const pid = Number(r.id);
        bookedFreqByPlanId.set(pid, String(r.booked_frequency || '').toUpperCase());
        bookedStartByPlanId.set(pid, r.booking_start_date ? String(r.booking_start_date).slice(0, 10) : null);
        bookedUntilByPlanId.set(pid, r.active_until_date ? String(r.active_until_date).slice(0, 10) : null);
        bookedCountByPlanId.set(pid, Number.isInteger(Number(r.booked_occurrence_count)) ? Number(r.booked_occurrence_count) : null);
      }
    }

    const frequencyMeta = ({ assignedFrequency, bookedFrequency, state }) => {
      const normalize = (v) => String(v || '').trim().toUpperCase();
      const f = normalize(bookedFrequency) || normalize(assignedFrequency);
      if (f === 'WEEKLY') return { frequency: f, frequencyLabel: 'Weekly', frequencyBadge: 'W' };
      if (f === 'BIWEEKLY') return { frequency: f, frequencyLabel: 'Biweekly', frequencyBadge: 'BW' };
      if (f === 'MONTHLY') return { frequency: f, frequencyLabel: 'Monthly', frequencyBadge: 'M' };
      // If a slot is booked/assigned but not tied to a standing assignment or booking plan,
      // treat it as a one-off occurrence for display purposes.
      const st = String(state || '');
      if (st === 'assigned_booked' || st === 'assigned_temporary' || st === 'assigned_available') {
        return { frequency: 'ONCE', frequencyLabel: 'Once', frequencyBadge: '1x' };
      }
      return { frequency: null, frequencyLabel: null, frequencyBadge: null };
    };

    for (const s of slots) {
      const standingId = Number(s.standingAssignmentId || 0) || null;
      const planId = Number(s.bookingPlanId || 0) || null;
      const assignedFrequency = standingId ? assignedFreqByStandingId.get(standingId) || null : null;
      const bookedFrequency = planId ? bookedFreqByPlanId.get(planId) || null : null;
      const bookingStartDate = planId ? bookedStartByPlanId.get(planId) || null : null;
      const bookingActiveUntilDate = planId ? bookedUntilByPlanId.get(planId) || null : null;
      const bookingOccurrenceCount = planId ? bookedCountByPlanId.get(planId) || null : null;
      const meta = frequencyMeta({ assignedFrequency, bookedFrequency, state: s.state });
      s.assignedFrequency = assignedFrequency;
      s.bookedFrequency = bookedFrequency;
      s.bookingStartDate = bookingStartDate;
      s.bookingActiveUntilDate = bookingActiveUntilDate;
      s.bookingOccurrenceCount = bookingOccurrenceCount;
      s.frequency = meta.frequency;
      s.frequencyLabel = meta.frequencyLabel;
      s.frequencyBadge = meta.frequencyBadge;
    }

    const [cancelledGoogleRows] = await pool.execute(
      `SELECT
         e.id,
         e.start_at,
         e.end_at,
         e.google_provider_event_id,
         e.google_provider_calendar_id,
         e.google_room_resource_email,
         e.google_sync_status,
         e.google_sync_error,
         r.id AS room_id,
         r.room_number,
         r.label AS room_label,
         r.name AS room_name
       FROM office_events e
       JOIN office_rooms r ON r.id = e.room_id
       WHERE e.office_location_id = ?
         AND e.start_at < ?
         AND e.end_at > ?
         AND UPPER(COALESCE(e.status, '')) = 'CANCELLED'
         AND (
           e.google_provider_event_id IS NOT NULL
           OR UPPER(COALESCE(e.google_sync_status, '')) IN ('FAILED', 'PENDING')
         )
       ORDER BY e.start_at ASC`,
      [officeLocationIdNum, windowEnd, windowStart]
    );
    const cancelledGoogleEvents = (cancelledGoogleRows || []).map((r) => ({
      id: Number(r.id),
      roomId: Number(r.room_id),
      roomNumber: r.room_number ?? null,
      roomLabel: r.room_label ?? r.room_name ?? null,
      startAt: normalizeMysqlDateTime(r.start_at),
      endAt: normalizeMysqlDateTime(r.end_at),
      googleProviderEventId: String(r.google_provider_event_id || '').trim() || null,
      googleProviderCalendarId: String(r.google_provider_calendar_id || '').trim() || null,
      googleRoomResourceEmail: String(r.google_room_resource_email || '').trim() || null,
      googleSyncStatus: String(r.google_sync_status || '').trim() || null,
      googleSyncError: String(r.google_sync_error || '').trim() || null
    }));

    res.json({
      location: { id: loc.id, name: loc.name, timezone: loc.timezone },
      weekStart,
      days,
      hours,
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        roomNumber: r.room_number ?? null,
        label: r.label ?? null
      })),
      slots,
      cancelledGoogleEvents
    });
  } catch (e) {
    next(e);
  }
};

export const getLocation = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { id } = req.params;
    const loc = await OfficeLocation.findById(parseInt(id));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    // Verify user belongs to an agency assigned to the office (unless super_admin)
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    res.json(loc);
  } catch (e) {
    next(e);
  }
};

export const listRooms = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { locationId } = req.params;
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));
    res.json(rooms);
  } catch (e) {
    next(e);
  }
};

export const getAvailability = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { locationId } = req.params;
    const { startAt, endAt } = req.query;

    if (!startAt || !endAt) {
      return res.status(400).json({ error: { message: 'startAt and endAt are required (ISO datetime)' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));
    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt,
      endAt
    });

    // pending requests = yellow (office-scoped; office may be shared across agencies)
    const pending = await OfficeRoomRequest.listPendingForLocation(parseInt(locationId));
    const pendingByRoom = new Map();
    for (const r of pending) {
      if (r.start_at < endAt && r.end_at > startAt) {
        pendingByRoom.set(r.room_id, true);
      }
    }

    const assignmentByRoom = new Map();
    for (const a of assignments) {
      // Only one display per room for now; pick first (any overlap implies occupied)
      if (!assignmentByRoom.has(a.room_id)) {
        assignmentByRoom.set(a.room_id, a);
      }
    }

    const status = rooms.map((room) => {
      const a = assignmentByRoom.get(room.id);
      if (a) {
        return {
          roomId: room.id,
          roomName: room.name,
          svgRoomId: room.svg_room_id,
          status: 'occupied', // red
          clinicianDisplayName: formatClinicianName(a.first_name, a.last_name)
        };
      }
      if (pendingByRoom.get(room.id)) {
        return {
          roomId: room.id,
          roomName: room.name,
          svgRoomId: room.svg_room_id,
          status: 'pending', // yellow
          clinicianDisplayName: null
        };
      }
      return {
        roomId: room.id,
        roomName: room.name,
        svgRoomId: room.svg_room_id,
        status: 'available', // green
        clinicianDisplayName: null
      };
    });

    res.json({
      location: {
        id: loc.id,
        name: loc.name,
        timezone: loc.timezone,
        svg_markup: loc.svg_markup
      },
      window: { startAt, endAt },
      rooms: status
    });
  } catch (e) {
    next(e);
  }
};

export const createBookingRequest = async (req, res, next) => {
  try {
    const { locationId, roomId, startAt, endAt, notes } = req.body;
    if (!locationId || !roomId || !startAt || !endAt) {
      return res.status(400).json({ error: { message: 'locationId, roomId, startAt, endAt are required' } });
    }

    // Compliance gate: blocking expired credential => cannot request
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    // Must belong to an agency assigned to the office (unless super_admin)
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const room = await OfficeRoom.findById(parseInt(roomId));
    if (!room || room.location_id !== loc.id) {
      return res.status(400).json({ error: { message: 'Invalid room for location' } });
    }

    const reqRow = await OfficeRoomRequest.create({
      userId: req.user.id,
      locationId: loc.id,
      roomId: room.id,
      requestType: 'ONE_TIME',
      startAt,
      endAt,
      notes: notes || null
    });

    res.status(201).json(reqRow);
  } catch (e) {
    next(e);
  }
};

export const listPendingRequests = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can view pending requests' } });
    }

    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = userAgencies.map((a) => a.id);
    if (req.user.role === 'super_admin' && agencyIds.length === 0) {
      // super_admin without explicit agencies: allow none (avoid global blast by default)
      return res.json([]);
    }

    const { locationId } = req.query;
    const rows = await OfficeRoomRequest.listPendingForAgencies(agencyIds, {
      locationId: locationId ? parseInt(locationId) : null
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const approveRequest = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can approve requests' } });
    }

    const { id } = req.params;
    const reqRow = await OfficeRoomRequest.findById(parseInt(id));
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (reqRow.status !== 'PENDING') {
      return res.status(400).json({ error: { message: 'Request is not pending' } });
    }

    // Verify approver has access to an agency assigned to the office (unless super_admin)
    const loc = await OfficeLocation.findById(reqRow.location_id);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Create assignment, then mark request approved
    const assignment = await OfficeRoomAssignment.create({
      roomId: reqRow.room_id,
      assignedUserId: reqRow.user_id,
      assignmentType: reqRow.request_type || 'ONE_TIME',
      startAt: reqRow.start_at,
      endAt: reqRow.end_at,
      sourceRequestId: reqRow.id,
      createdByUserId: req.user.id
    });

    // Create corresponding BOOKED office event (hourly source of truth for kiosk).
    // Note: current request model supports arbitrary windows; MVP assumes hourly blocks.
    try {
      const ev = await OfficeEvent.create({
        officeLocationId: reqRow.location_id,
        roomId: reqRow.room_id,
        startAt: reqRow.start_at,
        endAt: reqRow.end_at,
        status: 'BOOKED',
        assignedProviderId: reqRow.user_id,
        bookedProviderId: reqRow.user_id,
        source: 'PROVIDER_REQUEST',
        recurrenceGroupId: null,
        notes: reqRow.notes || null,
        createdByUserId: req.user.id,
        approvedByUserId: req.user.id
      });
      // Best-effort: mirror to Google Calendar (provider + room resource).
      try {
        await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: ev?.id });
      } catch {
        // ignore
      }
    } catch {
      // best-effort: do not block approval if events table isn't present yet
    }

    const updatedReq = await OfficeRoomRequest.markDecided({
      requestId: reqRow.id,
      status: 'APPROVED',
      decidedByUserId: req.user.id
    });

    res.json({ request: updatedReq, assignment });
  } catch (e) {
    next(e);
  }
};

export const denyRequest = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can deny requests' } });
    }

    const { id } = req.params;
    const reqRow = await OfficeRoomRequest.findById(parseInt(id));
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (reqRow.status !== 'PENDING') {
      return res.status(400).json({ error: { message: 'Request is not pending' } });
    }

    const loc = await OfficeLocation.findById(reqRow.location_id);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updatedReq = await OfficeRoomRequest.markDecided({
      requestId: reqRow.id,
      status: 'DENIED',
      decidedByUserId: req.user.id
    });

    res.json({ request: updatedReq });
  } catch (e) {
    next(e);
  }
};

export const createOfficeBookingRequest = async (req, res, next) => {
  try {
    const requestedProviderIdRaw = req.body?.requestedProviderId || req.body?.requested_provider_id || req.user.id;
    const requestedProviderId = Number(requestedProviderIdRaw || 0) || Number(req.user.id || 0);
    if (!requestedProviderId) {
      return res.status(400).json({ error: { message: 'requestedProviderId is required' } });
    }
    const actingAsOtherProvider = requestedProviderId !== Number(req.user.id);
    if (actingAsOtherProvider && !canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can book on behalf of another provider' } });
    }

    const blocked = await userHasBlockingExpiredCredential(requestedProviderId);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const officeLocationId = req.body?.officeLocationId ? parseInt(req.body.officeLocationId, 10) : null;
    const roomId = req.body?.roomId ? parseInt(req.body.roomId, 10) : null;
    const startAt = req.body?.startAt || null;
    const endAt = req.body?.endAt || null;
    const recurrence = String(req.body?.recurrence || 'ONCE').trim().toUpperCase();
    const openToAlternativeRoom = req.body?.openToAlternativeRoom === true || req.body?.open_to_alternative_room === true;
    const notes = String(req.body?.notes || req.body?.requesterNotes || '').trim().slice(0, 2000) || null;

    const allowedRecurrence = new Set(['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']);
    const normalizedRecurrence = allowedRecurrence.has(recurrence) ? recurrence : 'ONCE';

    if (!officeLocationId || !startAt || !endAt) {
      return res.status(400).json({ error: { message: 'officeLocationId, startAt, and endAt are required' } });
    }

    const loc = await OfficeLocation.findById(parseInt(officeLocationId));
    if (!loc) return res.status(404).json({ error: { message: 'Office location not found' } });

    // Must belong to an agency assigned to the office (unless super_admin)
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // When booking on behalf of another provider, ensure the target provider is affiliated
    // with at least one agency attached to this office.
    if (actingAsOtherProvider) {
      const providerAgencies = await User.getAgencies(requestedProviderId);
      const providerHasOfficeAccess = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: (providerAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0)
      });
      if (!providerHasOfficeAccess) {
        return res.status(403).json({ error: { message: 'Selected provider is not affiliated with this office organization' } });
      }
    }

    // Room is optional (open-to-alternative). If provided it must match location.
    let room = null;
    if (roomId) {
      room = await OfficeRoom.findById(roomId);
      if (!room || Number(room.location_id) !== Number(loc.id)) {
        return res.status(400).json({ error: { message: 'Invalid room for office location' } });
      }
    }

    // Same-day auto-book for ONCE requests on open rooms (kiosk intent).
    const tz = loc.timezone || 'America/New_York';
    const startYmd = localYmdInTz(startAt, tz);
    const todayYmd = localYmdInTz(new Date(), tz);
    const isSameDay = !!(startYmd && todayYmd && startYmd === todayYmd);

    if (normalizedRecurrence === 'ONCE' && isSameDay) {
      // Materialize the containing week so standing assignments appear as occupied.
      try {
        const ws = startOfWeekISO(startYmd);
        if (ws) {
          await OfficeScheduleMaterializer.materializeWeek({
            officeLocationId: loc.id,
            weekStartRaw: ws,
            createdByUserId: req.user.id
          });
        }
      } catch {
        // ignore
      }

      const rooms = await OfficeRoom.findByLocation(loc.id);
      const candidates = room && !openToAlternativeRoom ? [room] : rooms;
      let chosen = null;
      for (const r of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const open = await isRoomOpenAt({
          officeLocationId: loc.id,
          roomId: r.id,
          startAt,
          endAt,
          officeTimeZone: tz
        });
        if (open) {
          chosen = r;
          break;
        }
      }

      if (chosen) {
        const [eventRows] = await pool.execute(
          `SELECT 1
           FROM office_events
           WHERE room_id = ?
             AND start_at < ?
             AND end_at > ?
             AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
           LIMIT 1`,
          [chosen.id, endAt, startAt]
        );
        if (eventRows?.[0]) {
          return res.status(409).json({ error: { message: 'That office slot is no longer available.' } });
        }

        const ev = await OfficeEvent.create({
          officeLocationId: loc.id,
          roomId: chosen.id,
          startAt,
          endAt,
          status: 'BOOKED',
          assignedProviderId: null,
          bookedProviderId: requestedProviderId,
          source: 'PROVIDER_REQUEST',
          recurrenceGroupId: null,
          notes,
          createdByUserId: req.user.id,
          approvedByUserId: req.user.id
        });
        return res.status(201).json({ ok: true, kind: 'auto_booked', event: ev });
      }
    }

    const created = await OfficeBookingRequest.create({
      requestType: 'PROVIDER_REQUEST',
      officeLocationId: loc.id,
      roomId: room?.id || null,
      requestedProviderId,
      startAt,
      endAt,
      recurrence: normalizedRecurrence,
      openToAlternativeRoom: !!openToAlternativeRoom || !room?.id,
      requesterNotes: notes
    });

    res.status(201).json({ ok: true, kind: 'request', request: created });
  } catch (e) {
    next(e);
  }
};

export const listPendingOfficeBookingRequests = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can view pending booking requests' } });
    }

    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = userAgencies.map((a) => a.id);
    if (req.user.role === 'super_admin' && agencyIds.length === 0) {
      // super_admin without explicit agencies: return none by default
      return res.json([]);
    }

    const officeLocationId = req.query.officeLocationId ? parseInt(req.query.officeLocationId, 10) : null;
    const rows = await OfficeBookingRequest.listPendingForAgencies(agencyIds, { officeLocationId });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const approveOfficeBookingRequest = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can approve booking requests' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid request id' } });

    const reqRow = await OfficeBookingRequest.findById(id);
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (String(reqRow.status || '').toUpperCase() !== 'PENDING') {
      return res.status(409).json({ error: { message: 'Request is not pending' } });
    }

    const loc = await OfficeLocation.findById(reqRow.office_location_id);
    if (!loc) return res.status(404).json({ error: { message: 'Office location not found' } });
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const recurrence = String(reqRow.recurrence || 'ONCE').toUpperCase();
    const allowedRecurrence = new Set(['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']);
    const normalizedRecurrence = allowedRecurrence.has(recurrence) ? recurrence : 'ONCE';

    const requestedRoomId = reqRow.room_id ? Number(reqRow.room_id) : null;
    const rooms = await OfficeRoom.findByLocation(loc.id);
    const requestedRoom = requestedRoomId ? rooms.find((r) => Number(r.id) === requestedRoomId) : null;
    const allowAlt = !!reqRow.open_to_alternative_room;
    const candidates = requestedRoom && !allowAlt ? [requestedRoom] : rooms;

    // Ensure week events are materialized so standing assignments appear as occupied.
    try {
      const ymd = String(reqRow.start_at || '').slice(0, 10);
      const ws = startOfWeekISO(ymd);
      if (ws) {
        await OfficeScheduleMaterializer.materializeWeek({
          officeLocationId: loc.id,
          weekStartRaw: ws,
          createdByUserId: req.user.id
        });
      }
    } catch {
      // ignore
    }

    const tz = loc.timezone || 'America/New_York';
    let chosen = null;
    for (const r of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const open = await isRoomOpenAt({
        officeLocationId: loc.id,
        roomId: r.id,
        startAt: reqRow.start_at,
        endAt: reqRow.end_at,
        officeTimeZone: tz
      });
      if (open) {
        chosen = r;
        break;
      }
    }
    if (!chosen) {
      return res.status(409).json({ error: { message: 'No open room is available for that time.' } });
    }

    const wh = weekdayHourInTz(reqRow.start_at, tz);
    if (!wh) return res.status(400).json({ error: { message: 'Invalid start time' } });

    let createdEvent = null;
    let createdStandingAssignment = null;
    let createdBookingPlan = null;

    if (normalizedRecurrence === 'ONCE') {
      createdEvent = await OfficeEvent.create({
        officeLocationId: loc.id,
        roomId: chosen.id,
        startAt: reqRow.start_at,
        endAt: reqRow.end_at,
        status: 'BOOKED',
        assignedProviderId: null,
        bookedProviderId: reqRow.requested_provider_id,
        source: 'PROVIDER_REQUEST',
        recurrenceGroupId: null,
        notes: reqRow.requester_notes || null,
        createdByUserId: req.user.id,
        approvedByUserId: req.user.id
      });
    } else {
      const assignedFrequency = normalizedRecurrence === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY';
      createdStandingAssignment = await OfficeStandingAssignment.create({
        officeLocationId: loc.id,
        roomId: chosen.id,
        providerId: reqRow.requested_provider_id,
        weekday: wh.weekdayIndex,
        hour: wh.hour,
        assignedFrequency,
        createdByUserId: req.user.id
      });
      createdBookingPlan = await OfficeBookingPlan.upsertActive({
        standingAssignmentId: createdStandingAssignment.id,
        bookedFrequency: normalizedRecurrence,
        bookingStartDate: String(reqRow.start_at || '').slice(0, 10),
        createdByUserId: req.user.id
      });
    }

    const updatedReq = await OfficeBookingRequest.markDecided({
      requestId: reqRow.id,
      status: 'APPROVED',
      decidedByUserId: req.user.id,
      approverComment: req.body?.approverComment ? String(req.body.approverComment).slice(0, 2000) : null
    });

    try {
      if (createdEvent?.id) await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: createdEvent.id });
    } catch {
      // ignore
    }

    res.json({
      ok: true,
      request: updatedReq,
      event: createdEvent,
      standingAssignment: createdStandingAssignment,
      bookingPlan: createdBookingPlan
    });
  } catch (e) {
    next(e);
  }
};

export const denyOfficeBookingRequest = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can deny booking requests' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid request id' } });

    const reqRow = await OfficeBookingRequest.findById(id);
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (String(reqRow.status || '').toUpperCase() !== 'PENDING') {
      return res.status(409).json({ error: { message: 'Request is not pending' } });
    }

    const loc = await OfficeLocation.findById(reqRow.office_location_id);
    if (!loc) return res.status(404).json({ error: { message: 'Office location not found' } });
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updatedReq = await OfficeBookingRequest.markDecided({
      requestId: reqRow.id,
      status: 'DENIED',
      decidedByUserId: req.user.id,
      approverComment: req.body?.approverComment ? String(req.body.approverComment).slice(0, 2000) : null
    });
    res.json({ ok: true, request: updatedReq });
  } catch (e) {
    next(e);
  }
};

// Public read-only board (no login). Requires ?key=ACCESS_KEY.
export const publicBoard = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { key, startAt, endAt } = req.query;

    if (!key) {
      return res.status(403).json({ error: { message: 'Access key required' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) {
      return res.status(404).json({ error: { message: 'Location not found' } });
    }
    if (loc.access_key !== key) {
      return res.status(403).json({ error: { message: 'Invalid access key' } });
    }

    const windowStart = startAt || new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const windowEnd = endAt || new Date().toISOString().slice(0, 10) + 'T23:59:59.000Z';

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));
    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt: windowStart,
      endAt: windowEnd
    });

    const assignmentByRoom = new Map();
    for (const a of assignments) {
      if (!assignmentByRoom.has(a.room_id)) assignmentByRoom.set(a.room_id, a);
    }

    const pending = await OfficeRoomRequest.listPendingForLocation(parseInt(locationId));
    const pendingByRoom = new Map();
    for (const r of pending) {
      if (r.start_at < windowEnd && r.end_at > windowStart) pendingByRoom.set(r.room_id, true);
    }

    const status = rooms.map((room) => {
      const a = assignmentByRoom.get(room.id);
      if (a) {
        return {
          roomId: room.id,
          roomName: room.name,
          svgRoomId: room.svg_room_id,
          status: 'occupied',
          clinicianDisplayName: formatClinicianName(a.first_name, a.last_name)
        };
      }
      if (pendingByRoom.get(room.id)) {
        return { roomId: room.id, roomName: room.name, svgRoomId: room.svg_room_id, status: 'pending', clinicianDisplayName: null };
      }
      return { roomId: room.id, roomName: room.name, svgRoomId: room.svg_room_id, status: 'available', clinicianDisplayName: null };
    });

    res.json({
      location: { id: loc.id, name: loc.name, timezone: loc.timezone, svg_markup: loc.svg_markup },
      window: { startAt: windowStart, endAt: windowEnd },
      rooms: status
    });
  } catch (e) {
    next(e);
  }
};

// Admin utilities (create location/room + update svg)
export const createLocation = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can create locations' } });
    }

    const { agencyId, name, timezone, svgMarkup } = req.body;
    if (!agencyId || !name) return res.status(400).json({ error: { message: 'agencyId and name are required' } });

    // Must belong to agency unless super_admin
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = userAgencies.some((a) => a.id === parseInt(agencyId));
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const loc = await OfficeLocation.create({ agencyId: parseInt(agencyId), name, timezone, svgMarkup: svgMarkup || null });
    // Ensure join table contains the creating agency (best-effort; OfficeLocation.create also does this).
    try {
      await OfficeLocationAgency.add({ officeLocationId: loc.id, agencyId: parseInt(agencyId) });
    } catch {
      // ignore
    }
    res.status(201).json(loc);
  } catch (e) {
    next(e);
  }
};

export const updateLocation = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can update locations' } });
    }

    const { id } = req.params;
    const loc = await OfficeLocation.findById(parseInt(id));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updated = await OfficeLocation.update(loc.id, {
      name: req.body.name,
      timezone: req.body.timezone,
      svg_markup: req.body.svgMarkup,
      is_active: req.body.isActive,
      street_address: req.body.streetAddress,
      city: req.body.city,
      state: req.body.state,
      postal_code: req.body.postalCode
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const createRoom = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can create rooms' } });
    }

    const { locationId } = req.params;
    const { name, svgRoomId, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const room = await OfficeRoom.create({
      locationId: loc.id,
      name,
      svgRoomId: svgRoomId || null,
      sortOrder: Number.isFinite(parseInt(sortOrder)) ? parseInt(sortOrder) : 0
    });
    res.status(201).json(room);
  } catch (e) {
    next(e);
  }
};

