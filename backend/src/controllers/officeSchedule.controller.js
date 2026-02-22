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
import ProviderVirtualSlotAvailability from '../models/ProviderVirtualSlotAvailability.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import User from '../models/User.model.js';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import OfficeScheduleMaterializer, { shouldBookOnDate } from '../services/officeScheduleMaterializer.service.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import ExternalBusyCalendarService from '../services/externalBusyCalendar.service.js';
import { getSchedulingBookingMetadata, validateSchedulingSelection } from '../services/schedulingTaxonomy.service.js';
import { ensureAppointmentContext } from '../services/appointmentContext.service.js';

const canManageSchedule = (role) =>
  role === 'clinical_practice_assistant' || role === 'provider_plus' || role === 'admin' || role === 'super_admin' || role === 'superadmin' || role === 'support' || role === 'staff';

const DELETE_EVENT_REQUEST_TYPE = 'DELETE_EVENT';

function parseJsonSafely(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

async function resolveAuditAgencyIdForOffice(officeLocationId, actorUserId) {
  const officeAgencies = await OfficeLocationAgency.listAgenciesForOffice(officeLocationId);
  const officeAgencyId = Number(officeAgencies?.[0]?.id || 0) || null;
  if (officeAgencyId) return officeAgencyId;
  const actorAgencies = await User.getAgencies(actorUserId);
  return Number(actorAgencies?.[0]?.id || 0) || null;
}

function bookingSelectionFromBody(body = {}) {
  return {
    appointmentTypeCode: body?.appointmentTypeCode || body?.appointment_type_code || null,
    appointmentSubtypeCode: body?.appointmentSubtypeCode || body?.appointment_subtype_code || null,
    serviceCode: body?.serviceCode || body?.service_code || null,
    modality: body?.modality || null
  };
}

async function resolvePolicyAgencyForProvider({ providerId, fallbackActorUserId = null }) {
  const agencies = await User.getAgencies(providerId);
  const primary = Number(agencies?.[0]?.id || 0) || null;
  if (primary) return primary;
  if (fallbackActorUserId) {
    const actorAgencies = await User.getAgencies(fallbackActorUserId);
    return Number(actorAgencies?.[0]?.id || 0) || null;
  }
  return null;
}

async function resolveProviderTimeZone({ providerId, fallbackTimeZone }) {
  const fallback = isValidTimeZone(fallbackTimeZone) ? String(fallbackTimeZone) : 'America/New_York';
  const pid = Number(providerId || 0);
  if (!pid) return fallback;
  try {
    const [cols] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('timezone', 'time_zone', 'preferred_timezone', 'availability_timezone')`
    );
    const candidates = (cols || []).map((r) => String(r.COLUMN_NAME || '').trim()).filter(Boolean);
    if (!candidates.length) return fallback;
    const selectExpr = candidates.map((c) => `\`${c}\``).join(', ');
    const [rows] = await pool.execute(`SELECT ${selectExpr} FROM users WHERE id = ? LIMIT 1`, [pid]);
    const row = rows?.[0] || null;
    if (!row) return fallback;
    for (const c of candidates) {
      const v = String(row[c] || '').trim();
      if (isValidTimeZone(v)) return v;
    }
  } catch {
    // fallback below
  }
  return fallback;
}

function formatClinicianName(firstName, lastName) {
  const li = (lastName || '').trim().slice(0, 1);
  const ln = li ? `${li}.` : '';
  return `${firstName || ''} ${ln}`.trim();
}

function formatFullName(firstName, lastName) {
  const f = String(firstName || '').trim();
  const l = String(lastName || '').trim();
  return `${f} ${l}`.trim();
}

function toDisplayStatus({ status, slotState }) {
  const st = String(status || '').trim().toUpperCase();
  const ss = String(slotState || '').trim().toUpperCase();
  if (st === 'BOOKED' || ss === 'ASSIGNED_BOOKED') return 'BOOKED';
  if (ss === 'ASSIGNED_TEMPORARY') return 'TEMPORARY';
  if (st === 'RELEASED' || ss === 'ASSIGNED_AVAILABLE') return 'AVAILABLE';
  if (st === 'CANCELLED') return 'CANCELED';
  return 'UNKNOWN';
}

function defaultAppointmentTypeForSlot({ status, slotState }) {
  const displayStatus = toDisplayStatus({ status, slotState });
  if (displayStatus === 'BOOKED') return 'SESSION';
  if (displayStatus === 'AVAILABLE') return 'AVAILABLE_SLOT';
  if (displayStatus === 'TEMPORARY') return 'SCHEDULE_BLOCK';
  return 'EVENT';
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

function isValidTimeZone(tz) {
  const s = String(tz || '').trim();
  if (!s) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseMySqlDateTimeParts(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] || 0)
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const asUtc = new Date(Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  ));
  return date.getTime() - asUtc.getTime();
}

function zonedWallTimeToUtc({ year, month, day, hour, minute, second = 0, timeZone }) {
  const tz = isValidTimeZone(timeZone) ? String(timeZone) : 'America/New_York';
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(guess, tz);
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second) + offset);
  }
  return guess;
}

function utcMsForWallMySqlDateTime(value, timeZone) {
  const p = parseMySqlDateTimeParts(value);
  if (!p) return NaN;
  return zonedWallTimeToUtc({ ...p, timeZone }).getTime();
}

function intervalsOverlap(startA, endA, startB, endB) {
  return Number.isFinite(startA) && Number.isFinite(endA) && Number.isFinite(startB) && Number.isFinite(endB) &&
    endA > startB && startA < endB;
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

function normalizeYmd(value) {
  const m = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function dayDiffYmd(startYmd, endYmd) {
  const s = normalizeYmd(startYmd);
  const e = normalizeYmd(endYmd);
  if (!s || !e) return NaN;
  const sm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const em = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!sm || !em) return NaN;
  const sMs = Date.UTC(Number(sm[1]), Number(sm[2]) - 1, Number(sm[3]));
  const eMs = Date.UTC(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  return Math.floor((eMs - sMs) / 86400000);
}

function recurrenceMatchesDate({ recurrence, occurrenceCount, startDateYmd, targetDateYmd }) {
  const freq = String(recurrence || 'ONCE').trim().toUpperCase();
  const count = Math.max(1, Number(occurrenceCount || 1));
  const diffDays = dayDiffYmd(startDateYmd, targetDateYmd);
  if (!Number.isFinite(diffDays) || diffDays < 0) return false;
  if (freq === 'ONCE') return diffDays === 0;
  if (freq === 'WEEKLY') return diffDays % 7 === 0 && (diffDays / 7) < count;
  if (freq === 'BIWEEKLY') return diffDays % 14 === 0 && (diffDays / 14) < count;
  if (freq === 'MONTHLY') return diffDays % 28 === 0 && (diffDays / 28) < count;
  return false;
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
  // Block only on BOOKED/ASSIGNED_BOOKED events. RELEASED and CANCELLED do not block.
  const [eventRows] = await pool.execute(
    `SELECT 1
     FROM office_events
     WHERE room_id = ?
       AND start_at < ?
       AND end_at > ?
       AND (UPPER(COALESCE(status, '')) = 'BOOKED' OR UPPER(COALESCE(slot_state, '')) = 'ASSIGNED_BOOKED')
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

  // Standing assignment: block only if the slot is actually booked for this date.
  // When assignment is weekly + booking is biweekly, off-weeks are released for others.
  const tz = officeTimeZone || 'America/New_York';
  const wh = weekdayHourInTz(startAt, tz);
  if (wh) {
    const st = await OfficeStandingAssignment.findActiveBySlot({
      officeLocationId,
      roomId,
      weekday: wh.weekdayIndex,
      hour: wh.hour
    });
    if (st?.id) {
      const plan = await OfficeBookingPlan.findActiveByAssignmentId(st.id);
      const dateStr = String(startAt || '').slice(0, 10);
      if (plan && dateStr) {
        if (!shouldBookOnDate(plan, st, dateStr)) return true; // Off-week: slot is open
      }
      return false; // No plan or should book: block
    }
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
    const learningByOfficeEventId = new Map();
    try {
      const eventIds = (events || []).map((e) => Number(e.id)).filter((n) => Number.isInteger(n) && n > 0);
      if (eventIds.length) {
        const [rows] = await pool.execute(
          `SELECT id, office_event_id
           FROM learning_program_sessions
           WHERE office_event_id IN (${eventIds.map(() => '?').join(',')})`,
          eventIds
        );
        for (const r of rows || []) {
          const eid = Number(r.office_event_id || 0);
          if (!eid) continue;
          learningByOfficeEventId.set(eid, Number(r.id || 0) || null);
        }
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    // Legacy assignments (office_room_assignments) are treated as assigned_available for now.
    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt: windowStart,
      endAt: windowEnd
    });
    const cancelledLegacyBySlotProvider = new Set();
    const cancelledLegacyBySlotAnyProvider = new Set();
    try {
      const [cancelledRows] = await pool.execute(
        `SELECT
           e.room_id,
           e.start_at,
           e.assigned_provider_id,
           e.booked_provider_id,
           sa.provider_id AS standing_provider_id
         FROM office_events e
         LEFT JOIN office_standing_assignments sa ON sa.id = e.standing_assignment_id
         WHERE e.office_location_id = ?
           AND e.start_at < ?
           AND e.end_at > ?
           AND UPPER(COALESCE(e.status, '')) = 'CANCELLED'`,
        [officeLocationIdNum, windowEnd, windowStart]
      );
      for (const row of cancelledRows || []) {
        const slot = parseSlotDateHour(row.start_at);
        if (!slot) continue;
        const roomId = Number(row.room_id || 0);
        if (!roomId) continue;
        cancelledLegacyBySlotAnyProvider.add(`${roomId}:${slot.date}:${slot.hour}`);
        const providerId = Number(row.assigned_provider_id || row.booked_provider_id || row.standing_provider_id || 0);
        if (providerId) cancelledLegacyBySlotProvider.add(`${roomId}:${slot.date}:${slot.hour}:${providerId}`);
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
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
    const reconciliationConflicts = [];
    for (const a of assignments || []) {
      const assignmentStartMs = timeMs(a.start_at);
      let assignmentEndMs = a.end_at ? timeMs(a.end_at) : null;
      const assignmentType = String(a.assignment_type || '').trim().toUpperCase();
      // Legacy guardrail: ONE_TIME rows with NULL end_at should never fan out forever.
      // Treat them as one-hour windows anchored at start_at.
      if (assignmentType === 'ONE_TIME' && !Number.isFinite(assignmentEndMs) && Number.isFinite(assignmentStartMs)) {
        assignmentEndMs = assignmentStartMs + (60 * 60 * 1000);
      }
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
          const cancelledLegacyAnyKey = `${Number(a.room_id || 0)}:${date}:${hour}`;
          if (cancelledLegacyBySlotAnyProvider.has(cancelledLegacyAnyKey)) continue;
          const cancelledLegacyKey = `${Number(a.room_id || 0)}:${date}:${hour}:${Number(a.assigned_user_id || 0)}`;
          if (cancelledLegacyBySlotProvider.has(cancelledLegacyKey)) continue;
          const k = key(a.room_id, date, hour);
          const existingEvent = eventBySlot.get(k);
          if (existingEvent) {
            const eventProviderId = Number(
              existingEvent.assigned_provider_id
              || existingEvent.booked_provider_id
              || existingEvent.standing_assignment_provider_id
              || 0
            ) || null;
            const assignmentProviderId = Number(a.assigned_user_id || 0) || null;
            if (assignmentProviderId && eventProviderId && assignmentProviderId !== eventProviderId) {
              reconciliationConflicts.push({
                roomId: Number(a.room_id || 0) || null,
                date,
                hour,
                eventId: Number(existingEvent.id || 0) || null,
                eventProviderId,
                assignmentProviderId
              });
            }
          }
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
            const statusUpper = String(e.status || '').toUpperCase();
            const slotStateUpper = String(e.slot_state || '').toUpperCase();
            const st = statusUpper === 'BOOKED'
              ? 'ASSIGNED_BOOKED'
              : (slotStateUpper || 'ASSIGNED_AVAILABLE');
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
            const standingFirst = String(e.standing_provider_first_name || '').trim();
            const standingLast = String(e.standing_provider_last_name || '').trim();
            const standingLi = standingLast.slice(0, 1);
            const standingInitials = `${standingFirst.slice(0, 1)}${standingLi}`.toUpperCase();
            const effectiveProviderId =
              Number(e.assigned_provider_id || e.booked_provider_id || e.standing_assignment_provider_id || 0) || null;

            const assignedProviderName = assignedFirst || assignedLast
              ? formatClinicianName(assignedFirst, assignedLast)
              : (standingFirst || standingLast ? formatClinicianName(standingFirst, standingLast) : '');
            const assignedProviderFullName = assignedFirst || assignedLast
              ? formatFullName(assignedFirst, assignedLast)
              : (standingFirst || standingLast ? formatFullName(standingFirst, standingLast) : '');
            const bookedProviderName = bookedFirst || bookedLast ? formatClinicianName(bookedFirst, bookedLast) : '';
            const bookedProviderFullName = bookedFirst || bookedLast ? formatFullName(bookedFirst, bookedLast) : '';
            const displayInitials = bookedInitials || assignedInitials || standingInitials || null;
            const slotStartAt = mysqlDateTimeForDateHour(date, hour);
            const slotEndAt = mysqlDateTimeForDateHour(date, Number(hour) + 1);
            const virtualIntakeEnabled =
              Boolean(effectiveProviderId) &&
              Boolean(slotStartAt) &&
              Boolean(slotEndAt) &&
              virtualIntakeSlotKeys.has(
                `${Number(effectiveProviderId)}:${slotStartAt}:${slotEndAt}`
              );
            const inPersonIntakeEnabled =
              Boolean(effectiveProviderId) &&
              Boolean(slotStartAt) &&
              Boolean(slotEndAt) &&
              inPersonIntakeSlotKeys.has(
                `${Number(effectiveProviderId)}:${slotStartAt}:${slotEndAt}`
              );
            slots.push({
              roomId: room.id,
              date,
              hour,
              state,
              displayStatus: toDisplayStatus({ status: e.status, slotState: st }),
              eventId: e.id,
              learningSessionId: learningByOfficeEventId.get(Number(e.id)) || null,
              learningLinked: learningByOfficeEventId.has(Number(e.id)),
              standingAssignmentId: e.standing_assignment_id || null,
              bookingPlanId: e.booking_plan_id || null,
              recurrenceGroupId: e.recurrence_group_id || null,
              providerId: effectiveProviderId,
              providerInitials: displayInitials,
              assignedProviderId: e.assigned_provider_id || e.standing_assignment_provider_id || null,
              bookedProviderId: e.booked_provider_id || null,
              assignedProviderName: assignedProviderName || null,
              assignedProviderFullName: assignedProviderFullName || null,
              bookedProviderName: bookedProviderName || null,
              bookedProviderFullName: bookedProviderFullName || null,
              appointmentType: String(e.appointment_type_code || '').trim().toUpperCase() || defaultAppointmentTypeForSlot({ status: e.status, slotState: st }),
              appointmentSubtype: String(e.appointment_subtype_code || '').trim().toUpperCase() || null,
              serviceCode: String(e.service_code || '').trim().toUpperCase() || null,
              modality: String(e.modality || '').trim().toUpperCase() || null,
              statusOutcome: String(e.status_outcome || '').trim().toUpperCase() || null,
              cancellationReason: String(e.cancellation_reason || '').trim() || null,
              clientId: Number(e.client_id || 0) || null,
              clinicalSessionId: Number(e.clinical_session_id || 0) || null,
              noteContextId: Number(e.note_context_id || 0) || null,
              billingContextId: Number(e.billing_context_id || 0) || null,
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
              displayStatus: 'AVAILABLE',
              eventId: assignmentEventId,
              learningSessionId: null,
              learningLinked: false,
              recurrenceGroupId: null,
              providerId: a.assigned_user_id,
              providerInitials: initials || null,
              assignedProviderId: a.assigned_user_id,
              bookedProviderId: null,
              assignedProviderName: formatClinicianName(a.first_name, a.last_name) || null,
              assignedProviderFullName: formatFullName(a.first_name, a.last_name) || null,
              bookedProviderName: null,
              bookedProviderFullName: null,
              appointmentType: 'AVAILABLE_SLOT',
              appointmentSubtype: null,
              serviceCode: null,
              modality: null,
              statusOutcome: null,
              cancellationReason: null,
              clientId: null,
              clinicalSessionId: null,
              noteContextId: null,
              billingContextId: null,
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
            displayStatus: 'OPEN',
            eventId: null,
            learningSessionId: null,
            learningLinked: false,
            recurrenceGroupId: null,
            providerId: null,
            providerInitials: null,
            assignedProviderId: null,
            bookedProviderId: null,
            assignedProviderName: null,
            assignedProviderFullName: null,
            bookedProviderName: null,
            bookedProviderFullName: null,
            appointmentType: 'AVAILABLE_SLOT',
            appointmentSubtype: null,
            serviceCode: null,
            modality: null,
            statusOutcome: null,
            cancellationReason: null,
            clientId: null,
            clinicalSessionId: null,
            noteContextId: null,
            billingContextId: null,
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

    const assignedFrequencyByStandingId = new Map();
    const assignmentMetaByStandingId = new Map();
    if (standingIds.length) {
      const placeholders = standingIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT
           a.id,
           a.assigned_frequency,
           a.availability_mode,
           a.temporary_until_date,
           a.temporary_extension_count,
           a.available_since_date,
           a.last_two_week_confirmed_at,
           a.last_six_week_checked_at,
           a.created_by_user_id,
           a.created_at,
           cb.first_name AS created_by_first_name,
           cb.last_name AS created_by_last_name
         FROM office_standing_assignments a
         LEFT JOIN users cb ON cb.id = a.created_by_user_id
         WHERE a.id IN (${placeholders})`,
        standingIds
      );
      const todayYmd = new Date().toISOString().slice(0, 10);
      const dayMs = 24 * 60 * 60 * 1000;
      for (const r of rows || []) {
        const sid = Number(r.id);
        const assignedFrequency = String(r.assigned_frequency || '').toUpperCase();
        assignedFrequencyByStandingId.set(sid, assignedFrequency);

        const availableSinceDate = r.available_since_date ? String(r.available_since_date).slice(0, 10) : null;
        const lastTwoWeekConfirmedAt = normalizeMysqlDateTime(r.last_two_week_confirmed_at) || null;
        const lastSixWeekCheckedAt = normalizeMysqlDateTime(r.last_six_week_checked_at) || null;
        const assignmentCreatedAt = normalizeMysqlDateTime(r.created_at) || null;
        const createdByUserId = Number(r.created_by_user_id || 0) || null;
        const createdByName = formatFullName(r.created_by_first_name, r.created_by_last_name) || null;

        const confirmAnchorYmd = String(lastTwoWeekConfirmedAt || availableSinceDate || assignmentCreatedAt || '').slice(0, 10) || null;
        const confirmationExpiresAt = confirmAnchorYmd ? addDays(confirmAnchorYmd, 42) : null;
        const expiresMs = confirmationExpiresAt ? Date.parse(`${confirmationExpiresAt}T00:00:00Z`) : NaN;
        const todayMs = Date.parse(`${todayYmd}T00:00:00Z`);
        const remainingDays = Number.isFinite(expiresMs) ? Math.max(0, Math.floor((expiresMs - todayMs) / dayMs)) : null;
        const twoWeekWindowsRemaining = Number.isInteger(remainingDays)
          ? Math.max(0, Math.min(3, Math.ceil(remainingDays / 14)))
          : null;

        assignmentMetaByStandingId.set(sid, {
          assignmentCreatedAt,
          assignmentCreatedByUserId: createdByUserId,
          assignmentCreatedByName: createdByName,
          assignmentAvailabilityMode: String(r.availability_mode || '').toUpperCase() || null,
          assignmentTemporaryUntilDate: r.temporary_until_date ? String(r.temporary_until_date).slice(0, 10) : null,
          assignmentTemporaryExtensionCount: Number(r.temporary_extension_count || 0),
          assignmentAvailableSinceDate: availableSinceDate,
          assignmentLastTwoWeekConfirmedAt: lastTwoWeekConfirmedAt,
          assignmentLastSixWeekCheckedAt: lastSixWeekCheckedAt,
          assignmentConfirmationExpiresAt: confirmationExpiresAt,
          assignmentTwoWeekWindowsRemaining: twoWeekWindowsRemaining
        });
      }
    }

    const bookingMetaByPlanId = new Map();
    if (planIds.length) {
      const placeholders = planIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT
           p.id,
           p.booked_frequency,
           p.booking_start_date,
           p.active_until_date,
           p.booked_occurrence_count,
           p.last_confirmed_at,
           p.created_at,
           p.created_by_user_id,
           cb.first_name AS created_by_first_name,
           cb.last_name AS created_by_last_name
         FROM office_booking_plans p
         LEFT JOIN users cb ON cb.id = p.created_by_user_id
         WHERE p.id IN (${placeholders})`,
        planIds
      );
      for (const r of rows || []) {
        const pid = Number(r.id);
        bookingMetaByPlanId.set(pid, {
          bookedFrequency: String(r.booked_frequency || '').toUpperCase() || null,
          bookingStartDate: r.booking_start_date ? String(r.booking_start_date).slice(0, 10) : null,
          bookingActiveUntilDate: r.active_until_date ? String(r.active_until_date).slice(0, 10) : null,
          bookingOccurrenceCount: Number.isInteger(Number(r.booked_occurrence_count)) ? Number(r.booked_occurrence_count) : null,
          bookingLastConfirmedAt: normalizeMysqlDateTime(r.last_confirmed_at) || null,
          bookingCreatedAt: normalizeMysqlDateTime(r.created_at) || null,
          bookingCreatedByUserId: Number(r.created_by_user_id || 0) || null,
          bookingCreatedByName: formatFullName(r.created_by_first_name, r.created_by_last_name) || null
        });
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

    // Pending office availability requests: show "Requested" so others don't duplicate
    const officeAgencies = await OfficeLocationAgency.listAgenciesForOffice(officeLocationIdNum);
    const officeAgencyIds = (officeAgencies || []).map((a) => Number(a.id)).filter((n) => n > 0);
    const pendingBySlot = new Map(); // key: `${date}:${hour}` or `${date}:${hour}:${roomId}` -> [{ providerName }]
    if (officeAgencyIds.length > 0) {
      const [reqRows] = await pool.execute(
        `SELECT r.id, r.provider_id, r.preferred_office_ids_json,
                r.requested_frequency, r.requested_occurrence_count, r.requested_start_date, r.created_at,
                u.first_name, u.last_name
         FROM provider_office_availability_requests r
         JOIN users u ON u.id = r.provider_id
         WHERE r.agency_id IN (${officeAgencyIds.map(() => '?').join(',')})
           AND r.status = 'PENDING'`,
        officeAgencyIds
      );
      for (const req of reqRows || []) {
        const prefIds = parseJsonSafely(req.preferred_office_ids_json);
        const includesOffice =
          !prefIds || !Array.isArray(prefIds) || prefIds.length === 0
            ? true
            : prefIds.some((id) => Number(id) === officeLocationIdNum);
        if (!includesOffice) continue;
        const requestedFrequency = String(req.requested_frequency || 'ONCE').trim().toUpperCase();
        const requestedOccurrenceCount = Math.max(1, Number(req.requested_occurrence_count || 1));
        const requestedStartDate = normalizeYmd(req.requested_start_date || req.created_at);
        const providerName = `${String(req.first_name || '').trim()} ${String(req.last_name || '').trim()}`.trim() || `Provider #${req.provider_id}`;
        const [slotRows] = await pool.execute(
          `SELECT weekday, start_hour, end_hour, room_id
           FROM provider_office_availability_request_slots
           WHERE request_id = ?
           ORDER BY weekday, start_hour`,
          [req.id]
        );
        for (const row of slotRows || []) {
          const wd = Number(row.weekday);
          const sh = Number(row.start_hour);
          const eh = Number(row.end_hour);
          const roomId = Number(row.room_id || 0) || null;
          if (!(wd >= 0 && wd <= 6) || !Number.isFinite(sh) || !Number.isFinite(eh) || eh <= sh) continue;
          const dateForWeekday = days[wd];
          if (!dateForWeekday) continue;
          if (!recurrenceMatchesDate({
            recurrence: requestedFrequency,
            occurrenceCount: requestedOccurrenceCount,
            startDateYmd: requestedStartDate,
            targetDateYmd: dateForWeekday
          })) {
            continue;
          }
          for (let h = sh; h < eh; h++) {
            const baseKey = `${dateForWeekday}:${h}`;
            const keys = roomId ? [`${baseKey}:${roomId}`] : [baseKey];
            for (const k of keys) {
              if (!pendingBySlot.has(k)) pendingBySlot.set(k, []);
              pendingBySlot.get(k).push({ providerName });
            }
          }
        }
      }
    }
    for (const s of slots) {
      const roomId = Number(s.roomId || 0) || null;
      const pkSpecific = `${s.date}:${s.hour}:${roomId}`;
      const pkAny = `${s.date}:${s.hour}`;
      const pending = pendingBySlot.get(pkSpecific) || pendingBySlot.get(pkAny) || [];
      const uniqueNames = [...new Set(pending.map((p) => p.providerName))];
      s.pendingRequestCount = uniqueNames.length;
      s.pendingRequestNames = uniqueNames.length > 0 ? uniqueNames : null;
    }

    for (const s of slots) {
      const standingId = Number(s.standingAssignmentId || 0) || null;
      const planId = Number(s.bookingPlanId || 0) || null;
      const assignedFrequency = standingId ? assignedFrequencyByStandingId.get(standingId) || null : null;
      const assignmentMeta = standingId ? assignmentMetaByStandingId.get(standingId) || null : null;
      const bookingMeta = planId ? bookingMetaByPlanId.get(planId) || null : null;
      const bookedFrequency = bookingMeta?.bookedFrequency || null;
      const bookingStartDate = bookingMeta?.bookingStartDate || null;
      const bookingActiveUntilDate = bookingMeta?.bookingActiveUntilDate || null;
      const bookingOccurrenceCount = bookingMeta?.bookingOccurrenceCount || null;
      const meta = frequencyMeta({ assignedFrequency, bookedFrequency, state: s.state });
      s.assignedFrequency = assignedFrequency;
      s.bookedFrequency = bookedFrequency;
      s.bookingStartDate = bookingStartDate;
      s.bookingActiveUntilDate = bookingActiveUntilDate;
      s.bookingOccurrenceCount = bookingOccurrenceCount;
      s.bookingLastConfirmedAt = bookingMeta?.bookingLastConfirmedAt || null;
      s.bookingCreatedAt = bookingMeta?.bookingCreatedAt || null;
      s.bookingCreatedByUserId = bookingMeta?.bookingCreatedByUserId || null;
      s.bookingCreatedByName = bookingMeta?.bookingCreatedByName || null;
      s.assignmentCreatedAt = assignmentMeta?.assignmentCreatedAt || null;
      s.assignmentCreatedByUserId = assignmentMeta?.assignmentCreatedByUserId || null;
      s.assignmentCreatedByName = assignmentMeta?.assignmentCreatedByName || null;
      s.assignmentAvailabilityMode = assignmentMeta?.assignmentAvailabilityMode || null;
      s.assignmentTemporaryUntilDate = assignmentMeta?.assignmentTemporaryUntilDate || null;
      s.assignmentTemporaryExtensionCount = assignmentMeta?.assignmentTemporaryExtensionCount ?? 0;
      s.assignmentAvailableSinceDate = assignmentMeta?.assignmentAvailableSinceDate || null;
      s.assignmentLastTwoWeekConfirmedAt = assignmentMeta?.assignmentLastTwoWeekConfirmedAt || null;
      s.assignmentLastSixWeekCheckedAt = assignmentMeta?.assignmentLastSixWeekCheckedAt || null;
      s.assignmentConfirmationExpiresAt = assignmentMeta?.assignmentConfirmationExpiresAt || null;
      s.assignmentTwoWeekWindowsRemaining = assignmentMeta?.assignmentTwoWeekWindowsRemaining ?? null;
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
      cancelledGoogleEvents,
      diagnostics: {
        reconciliationConflictCount: reconciliationConflicts.length,
        reconciliationConflictSample: reconciliationConflicts.slice(0, 25)
      }
    });
  } catch (e) {
    next(e);
  }
};

export const refreshEhrAssignedRoomBookings = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can refresh Therapy Notes-linked room bookings' } });
    }

    const officeLocationId = parseInt(req.params.locationId, 10);
    if (!officeLocationId) return res.status(400).json({ error: { message: 'Invalid location id' } });
    const loc = await OfficeLocation.findById(officeLocationId);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const officeTimeZone = isValidTimeZone(loc?.timezone) ? String(loc.timezone) : 'America/New_York';
    const todayYmdProviderTz = localYmdInTz(new Date(), officeTimeZone);
    const windowStartYmd = String(todayYmdProviderTz || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const windowEndYmdExclusive = addDays(windowStartYmd, 43); // 6 weeks + buffer to cover end boundary
    const windowStartWall = `${windowStartYmd} 00:00:00`;
    const windowEndWall = `${windowEndYmdExclusive} 00:00:00`;

    // Materialize upcoming weeks first so recurring assignments have event rows to evaluate.
    for (let i = 0; i <= 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await OfficeScheduleMaterializer.materializeWeek({
        officeLocationId,
        weekStartRaw: addDays(windowStartYmd, i * 7),
        createdByUserId: req.user.id
      });
    }

    const [assignedRows] = await pool.execute(
      `SELECT
         e.id,
         e.start_at,
         e.end_at,
         e.room_id,
         e.standing_assignment_id,
         e.assigned_provider_id,
         e.booked_provider_id,
         e.slot_state,
         e.status
       FROM office_events e
       WHERE e.office_location_id = ?
         AND e.start_at >= ?
         AND e.start_at < ?
         AND UPPER(COALESCE(e.slot_state, '')) IN ('ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY')
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
       ORDER BY e.start_at ASC`,
      [officeLocationId, windowStartWall, windowEndWall]
    );

    const events = (assignedRows || []).filter((r) => Number(r.assigned_provider_id || r.booked_provider_id || 0) > 0);
    if (!events.length) {
      return res.json({ ok: true, scannedAssigned: 0, bookedFromEhr: 0, touchedProviders: 0, bookingPlansReset: 0 });
    }

    const providerIds = Array.from(new Set(events.map((e) => Number(e.assigned_provider_id || e.booked_provider_id || 0)).filter((n) => Number.isInteger(n) && n > 0)));
    const providerTimeZoneById = new Map();
    const busyByProviderId = new Map();

    for (const providerId of providerIds) {
      // eslint-disable-next-line no-await-in-loop
      const providerTimeZone = await resolveProviderTimeZone({ providerId, fallbackTimeZone: officeTimeZone });
      providerTimeZoneById.set(providerId, providerTimeZone);

      const startParts = parseMySqlDateTimeParts(windowStartWall);
      const endParts = parseMySqlDateTimeParts(windowEndWall);
      const timeMinIso = startParts
        ? zonedWallTimeToUtc({ ...startParts, timeZone: providerTimeZone }).toISOString()
        : `${windowStartYmd}T00:00:00Z`;
      const timeMaxIso = endParts
        ? zonedWallTimeToUtc({ ...endParts, timeZone: providerTimeZone }).toISOString()
        : `${windowEndYmdExclusive}T00:00:00Z`;

      // eslint-disable-next-line no-await-in-loop
      const calendars = await UserExternalCalendar.listForUser({ userId: providerId, includeFeeds: true, activeOnly: true });
      const feeds = [];
      for (const c of calendars || []) {
        for (const f of c?.feeds || []) {
          const url = String(f?.icsUrl || '').trim();
          if (url) feeds.push({ id: f.id, url });
        }
      }

      let busy = [];
      if (feeds.length) {
        // eslint-disable-next-line no-await-in-loop
        const r = await ExternalBusyCalendarService.getBusyForFeeds({
          userId: providerId,
          weekStart: windowStartYmd,
          feeds,
          timeMinIso,
          timeMaxIso
        });
        if (r?.ok) busy.push(...(r.busy || []));
      }

      const provider = await User.findById(providerId);
      const legacyIcsUrl = String(provider?.external_busy_ics_url || provider?.externalBusyIcsUrl || '').trim();
      if (legacyIcsUrl) {
        // eslint-disable-next-line no-await-in-loop
        const r = await ExternalBusyCalendarService.getBusyForWeek({
          userId: providerId,
          weekStart: windowStartYmd,
          icsUrl: legacyIcsUrl,
          timeMinIso,
          timeMaxIso
        });
        if (r?.ok) busy.push(...(r.busy || []));
      }
      busyByProviderId.set(providerId, busy);
    }

    const eventsToBook = [];
    const planSeedByAssignmentId = new Map();
    for (const e of events) {
      const providerId = Number(e.assigned_provider_id || e.booked_provider_id || 0);
      const providerTimeZone = providerTimeZoneById.get(providerId) || officeTimeZone;
      const eventStartMs = utcMsForWallMySqlDateTime(e.start_at, providerTimeZone);
      const eventEndMs = utcMsForWallMySqlDateTime(e.end_at, providerTimeZone);
      if (!Number.isFinite(eventStartMs) || !Number.isFinite(eventEndMs)) continue;

      const busy = busyByProviderId.get(providerId) || [];
      const hasMatch = busy.some((b) => {
        const bs = new Date(b.startAt).getTime();
        const be = new Date(b.endAt).getTime();
        return intervalsOverlap(eventStartMs, eventEndMs, bs, be);
      });
      if (!hasMatch) continue;
      eventsToBook.push({ eventId: Number(e.id), providerId, standingAssignmentId: Number(e.standing_assignment_id || 0) || null, startAt: String(e.start_at || '').slice(0, 19) });
      if (Number(e.standing_assignment_id || 0) > 0) {
        const sid = Number(e.standing_assignment_id);
        const existing = planSeedByAssignmentId.get(sid);
        if (!existing || String(e.start_at) < String(existing.startAt)) {
          planSeedByAssignmentId.set(sid, { startAt: String(e.start_at || '').slice(0, 10) });
        }
      }
    }

    let bookedFromEhr = 0;
    for (const b of eventsToBook) {
      // eslint-disable-next-line no-await-in-loop
      await OfficeEvent.markBooked({ eventId: b.eventId, bookedProviderId: b.providerId });
      bookedFromEhr += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: b.eventId });
      } catch {
        // best-effort mirror
      }
    }

    let bookingPlansReset = 0;
    const assignmentIds = Array.from(planSeedByAssignmentId.keys());
    if (assignmentIds.length) {
      const placeholders = assignmentIds.map(() => '?').join(',');
      const [assignmentRows] = await pool.execute(
        `SELECT id, assigned_frequency
         FROM office_standing_assignments
         WHERE id IN (${placeholders})`,
        assignmentIds
      );
      const freqById = new Map((assignmentRows || []).map((r) => [Number(r.id), String(r.assigned_frequency || '').toUpperCase()]));
      for (const sid of assignmentIds) {
        const seed = planSeedByAssignmentId.get(sid);
        if (!seed?.startAt) continue;
        const bookedFrequency = freqById.get(sid) === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY';
        const activeUntilDate = addDays(seed.startAt, 42);
        // eslint-disable-next-line no-await-in-loop
        await OfficeBookingPlan.upsertActive({
          standingAssignmentId: sid,
          bookedFrequency,
          bookingStartDate: seed.startAt,
          activeUntilDate,
          bookedOccurrenceCount: null,
          createdByUserId: req.user.id
        });
        bookingPlansReset += 1;
      }
    }

    return res.json({
      ok: true,
      officeLocationId,
      scannedAssigned: events.length,
      bookedFromEhr,
      touchedProviders: providerIds.length,
      bookingPlansReset,
      windowStart: windowStartWall,
      windowEnd: windowEndWall
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
    const clientId = req.body?.clientId ? parseInt(req.body.clientId, 10) : null;
    const startAt = req.body?.startAt || null;
    const endAt = req.body?.endAt || null;
    const recurrence = String(req.body?.recurrence || 'ONCE').trim().toUpperCase();
    const openToAlternativeRoom = req.body?.openToAlternativeRoom === true || req.body?.open_to_alternative_room === true;
    const notes = String(req.body?.notes || req.body?.requesterNotes || '').trim().slice(0, 2000) || null;
    const rawSelection = bookingSelectionFromBody(req.body);

    const allowedRecurrence = new Set(['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']);
    const normalizedRecurrence = allowedRecurrence.has(recurrence) ? recurrence : 'ONCE';
    const recurringRecurrences = new Set(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);
    const rawOccurrenceCount = req.body?.bookedOccurrenceCount ?? req.body?.booked_occurrence_count;
    const bookedOccurrenceCount = recurringRecurrences.has(normalizedRecurrence)
      ? (Number.isInteger(Number(rawOccurrenceCount)) && Number(rawOccurrenceCount) > 0 ? Number(rawOccurrenceCount) : 6)
      : null;

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

    const requestedProvider = await User.findById(requestedProviderId);
    if (!requestedProvider) {
      return res.status(404).json({ error: { message: 'Requested provider not found' } });
    }

    const policyAgencyId = await resolveAuditAgencyIdForOffice(loc.id, req.user.id);
    const validatedSelection = await validateSchedulingSelection({
      agencyId: policyAgencyId,
      userRole: requestedProvider.role,
      providerCredentialText: requestedProvider.credential,
      appointmentTypeCode: rawSelection.appointmentTypeCode,
      appointmentSubtypeCode: rawSelection.appointmentSubtypeCode,
      serviceCode: rawSelection.serviceCode,
      modality: rawSelection.modality,
      scheduledStartAt: startAt,
      scheduledEndAt: endAt
    });

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
          clientId,
          source: 'PROVIDER_REQUEST',
          recurrenceGroupId: null,
          notes,
          appointmentTypeCode: validatedSelection.appointmentTypeCode,
          appointmentSubtypeCode: validatedSelection.appointmentSubtypeCode,
          serviceCode: validatedSelection.serviceCode,
          modality: validatedSelection.modality,
          createdByUserId: req.user.id,
          approvedByUserId: req.user.id
        });
        if (clientId) {
          try {
            await ensureAppointmentContext({
              officeEventId: ev?.id,
              clientId,
              sourceTimezone: tz,
              actorUserId: req.user.id
            });
          } catch {
            // best-effort context ensure on booking
          }
        }
        return res.status(201).json({ ok: true, kind: 'auto_booked', event: ev });
      }
    }

    const created = await OfficeBookingRequest.create({
      requestType: 'PROVIDER_REQUEST',
      officeLocationId: loc.id,
      roomId: room?.id || null,
      requestedProviderId,
      clientId,
      startAt,
      endAt,
      recurrence: normalizedRecurrence,
      bookedOccurrenceCount,
      appointmentTypeCode: validatedSelection.appointmentTypeCode,
      appointmentSubtypeCode: validatedSelection.appointmentSubtypeCode,
      serviceCode: validatedSelection.serviceCode,
      modality: validatedSelection.modality,
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

    if (String(reqRow.request_type || '').toUpperCase() === DELETE_EVENT_REQUEST_TYPE) {
      const meta = parseJsonSafely(reqRow.requester_notes) || {};
      const targetEventId = Number(meta?.eventId || 0) || 0;
      if (!targetEventId) {
        return res.status(400).json({ error: { message: 'Delete request payload is missing eventId' } });
      }
      const targetEvent = await OfficeEvent.findById(targetEventId);
      if (!targetEvent || Number(targetEvent.office_location_id) !== Number(loc.id)) {
        return res.status(404).json({ error: { message: 'Target event not found for delete request' } });
      }

      const updatedEvent = await OfficeEvent.cancelOccurrence({ eventId: targetEventId });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(targetEventId);
      try {
        await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId: targetEventId });
      } catch {
        // best-effort external sync
      }

      const updatedReq = await OfficeBookingRequest.markDecided({
        requestId: reqRow.id,
        status: 'APPROVED',
        decidedByUserId: req.user.id,
        approverComment: req.body?.approverComment ? String(req.body.approverComment).slice(0, 2000) : null
      });

      try {
        const auditAgencyId = await resolveAuditAgencyIdForOffice(loc.id, req.user.id);
        if (auditAgencyId) {
          await AdminAuditLog.logAction({
            actionType: 'OFFICE_EVENT_DELETE_APPROVED',
            actorUserId: Number(req.user?.id || 0) || null,
            targetUserId: Number(reqRow.requested_provider_id || targetEvent.booked_provider_id || targetEvent.assigned_provider_id || 0) || null,
            agencyId: auditAgencyId,
            metadata: {
              requestId: Number(reqRow.id || 0) || null,
              officeEventId: targetEventId,
              officeLocationId: Number(loc.id || 0) || null
            }
          });
        }
      } catch {
        // best-effort audit logging
      }

      return res.json({
        ok: true,
        request: updatedReq,
        event: updatedEvent
      });
    }

    const recurrence = String(reqRow.recurrence || 'ONCE').toUpperCase();
    const allowedRecurrence = new Set(['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']);
    const normalizedRecurrence = allowedRecurrence.has(recurrence) ? recurrence : 'ONCE';
    const requestedProvider = await User.findById(reqRow.requested_provider_id);
    if (!requestedProvider) {
      return res.status(404).json({ error: { message: 'Requested provider not found' } });
    }
    const policyAgencyId = await resolveAuditAgencyIdForOffice(loc.id, req.user.id);
    const validatedSelection = await validateSchedulingSelection({
      agencyId: policyAgencyId,
      userRole: requestedProvider.role,
      providerCredentialText: requestedProvider.credential,
      appointmentTypeCode: reqRow.appointment_type_code,
      appointmentSubtypeCode: reqRow.appointment_subtype_code,
      serviceCode: reqRow.service_code,
      modality: reqRow.modality,
      scheduledStartAt: reqRow.start_at,
      scheduledEndAt: reqRow.end_at
    });

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
        clientId: Number(reqRow.client_id || 0) || null,
        source: 'PROVIDER_REQUEST',
        recurrenceGroupId: null,
        notes: reqRow.requester_notes || null,
        appointmentTypeCode: validatedSelection.appointmentTypeCode,
        appointmentSubtypeCode: validatedSelection.appointmentSubtypeCode,
        serviceCode: validatedSelection.serviceCode,
        modality: validatedSelection.modality,
        createdByUserId: req.user.id,
        approvedByUserId: req.user.id
      });
      if (Number(reqRow.client_id || 0) > 0) {
        try {
          await ensureAppointmentContext({
            officeEventId: createdEvent?.id,
            clientId: Number(reqRow.client_id),
            sourceTimezone: String(loc.timezone || 'America/New_York'),
            actorUserId: req.user.id
          });
        } catch {
          // best-effort context ensure on booking request approval
        }
      }
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
      const reqOccurrenceCount = Number.isInteger(Number(reqRow.booked_occurrence_count)) && Number(reqRow.booked_occurrence_count) > 0
        ? Number(reqRow.booked_occurrence_count)
        : null;
      createdBookingPlan = await OfficeBookingPlan.upsertActive({
        standingAssignmentId: createdStandingAssignment.id,
        bookedFrequency: normalizedRecurrence,
        bookingStartDate: String(reqRow.start_at || '').slice(0, 10),
        bookedOccurrenceCount: reqOccurrenceCount,
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

export const getBookingMetadata = async (req, res, next) => {
  try {
    const requestedProviderIdRaw = req.query?.providerId || req.query?.requestedProviderId || req.user.id;
    const requestedProviderId = Number(requestedProviderIdRaw || 0) || Number(req.user.id || 0);
    const requestedProvider = await User.findById(requestedProviderId);
    if (!requestedProvider) {
      return res.status(404).json({ error: { message: 'Provider not found' } });
    }
    if (requestedProviderId !== Number(req.user.id) && !canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can request metadata for another provider' } });
    }

    const policyAgencyId = await resolvePolicyAgencyForProvider({
      providerId: requestedProviderId,
      fallbackActorUserId: req.user.id
    });
    const metadata = await getSchedulingBookingMetadata({
      agencyId: policyAgencyId,
      userRole: requestedProvider.role,
      providerCredentialText: requestedProvider.credential
    });

    return res.json({
      providerId: requestedProviderId,
      credentialTier: metadata.credentialTier,
      appointmentTypes: metadata.appointmentTypes,
      appointmentSubtypes: metadata.appointmentSubtypes,
      serviceCodes: metadata.eligibleServiceCodes
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
    if (String(reqRow.request_type || '').toUpperCase() === DELETE_EVENT_REQUEST_TYPE) {
      try {
        const meta = parseJsonSafely(reqRow.requester_notes) || {};
        const auditAgencyId = await resolveAuditAgencyIdForOffice(loc.id, req.user.id);
        if (auditAgencyId) {
          await AdminAuditLog.logAction({
            actionType: 'OFFICE_EVENT_DELETE_DENIED',
            actorUserId: Number(req.user?.id || 0) || null,
            targetUserId: Number(reqRow.requested_provider_id || 0) || null,
            agencyId: auditAgencyId,
            metadata: {
              requestId: Number(reqRow.id || 0) || null,
              officeEventId: Number(meta?.eventId || 0) || null,
              officeLocationId: Number(loc.id || 0) || null
            }
          });
        }
      } catch {
        // best-effort audit logging
      }
    }
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

