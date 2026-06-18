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
import { refreshLocationBookingsFromEhr, getEhrSyncHealth, auditIcsCoverageForLocation, auditIcsCoverageAllLocations } from '../services/officeScheduleEhrSync.service.js';
import { getSchedulingBookingMetadata, validateSchedulingSelection } from '../services/schedulingTaxonomy.service.js';
import { ensureAppointmentContext } from '../services/appointmentContext.service.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import { OfficeScheduleWatchdogService } from '../services/officeScheduleWatchdog.service.js';
import { validateOfficeSlotSeries, generateOccurrenceDates, recurrenceLabel as officeRecurrenceLabel } from '../services/officeSlotSeries.service.js';

const canManageSchedule = (role) =>
  role === 'clinical_practice_assistant' || role === 'provider_plus' || role === 'admin' || role === 'super_admin' || role === 'superadmin' || role === 'support' || role === 'staff';

const DELETE_EVENT_REQUEST_TYPE = 'DELETE_EVENT';
const DROP_ASSIGNMENT_REQUEST_TYPE = 'DROP_ASSIGNMENT';

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
  if (ss === 'ASSIGNED_TEMPORARY') return 'AVAILABLE';
  if (st === 'RELEASED' || ss === 'ASSIGNED_AVAILABLE') return 'AVAILABLE';
  if (st === 'CANCELLED') return 'CANCELED';
  return 'UNKNOWN';
}

function defaultAppointmentTypeForSlot({ status, slotState }) {
  const displayStatus = toDisplayStatus({ status, slotState });
  if (displayStatus === 'BOOKED') return 'SESSION';
  if (displayStatus === 'AVAILABLE') return 'AVAILABLE_SLOT';
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
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const m = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(String(value || '').trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
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
  // Block on BOOKED/ASSIGNED_BOOKED events and company holds. RELEASED and CANCELLED do not block.
  const [eventRows] = await pool.execute(
    `SELECT 1
     FROM office_events
     WHERE room_id = ?
       AND start_at < ?
       AND end_at > ?
       AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
       AND (
         UPPER(COALESCE(status, '')) = 'BOOKED'
         OR UPPER(COALESCE(slot_state, '')) IN ('ASSIGNED_BOOKED', 'COMPANY_HOLD')
       )
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
  const wh = weekdayHourFromSqlDateTime(startAt) || weekdayHourInTz(startAt, officeTimeZone || 'America/New_York');
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

function weekdayHourFromSqlDateTime(value) {
  const p = parseSlotDateHour(value);
  if (!p) return null;
  const ymd = String(p.date || '').slice(0, 10);
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const weekdayIndex = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return {
    date: ymd,
    weekdayIndex,
    weekdayName: WEEKDAY_NAMES[weekdayIndex] || String(weekdayIndex),
    hour: Number(p.hour)
  };
}

function addHoursToMysqlDateTime(value, hours) {
  const normalized = normalizeMysqlDateTime(value);
  if (!normalized) return '';
  const ms = timeMs(normalized);
  if (!Number.isFinite(ms)) return normalized;
  return new Date(ms + Number(hours || 0) * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function eventProviderSummary(e = {}) {
  const booked = formatFullName(e.booked_provider_first_name, e.booked_provider_last_name);
  const assigned = formatFullName(e.assigned_provider_first_name, e.assigned_provider_last_name);
  const standing = formatFullName(e.standing_provider_first_name, e.standing_provider_last_name);
  return booked || assigned || standing || null;
}

function eventContextRow(e = {}) {
  return {
    id: Number(e.id || 0) || null,
    officeLocationId: Number(e.office_location_id || 0) || null,
    roomId: Number(e.room_id || 0) || null,
    roomName: e.room_name || null,
    roomNumber: e.room_number || null,
    roomLabel: e.room_label || e.room_name || null,
    startAt: normalizeMysqlDateTime(e.start_at) || String(e.start_at || ''),
    endAt: normalizeMysqlDateTime(e.end_at) || String(e.end_at || ''),
    status: String(e.status || '').toUpperCase() || null,
    slotState: String(e.slot_state || '').toUpperCase() || null,
    standingAssignmentId: Number(e.standing_assignment_id || 0) || null,
    bookingPlanId: Number(e.booking_plan_id || 0) || null,
    assignedProviderId: Number(e.assigned_provider_id || e.standing_assignment_provider_id || 0) || null,
    bookedProviderId: Number(e.booked_provider_id || 0) || null,
    providerName: eventProviderSummary(e),
    appointmentType: String(e.appointment_type_code || '').toUpperCase() || null,
    appointmentSubtype: String(e.appointment_subtype_code || '').toUpperCase() || null,
    serviceCode: String(e.service_code || '').toUpperCase() || null,
    modality: String(e.modality || '').toUpperCase() || null,
    clientId: Number(e.client_id || 0) || null
  };
}

function recurrenceLabelForRequest(row = {}) {
  const recurrence = String(row.recurrence || 'ONCE').toUpperCase();
  if (recurrence === 'WEEKLY') return 'Weekly';
  if (recurrence === 'BIWEEKLY') return 'Biweekly';
  if (recurrence === 'MONTHLY') return 'Monthly';
  return 'Once';
}

function occurrencePreviewForRequest(row = {}) {
  const recurrence = String(row.recurrence || 'ONCE').toUpperCase();
  const startYmd = normalizeYmd(row.start_at);
  const count = Math.max(1, Math.min(12, Number(row.booked_occurrence_count || (recurrence === 'ONCE' ? 1 : 6))));
  if (!startYmd) return [];
  const step = recurrence === 'BIWEEKLY' ? 14 : recurrence === 'MONTHLY' ? 28 : recurrence === 'WEEKLY' ? 7 : 0;
  const dates = [];
  for (let i = 0; i < count; i += 1) {
    dates.push(addDays(startYmd, i * step) || startYmd);
    if (step === 0) break;
  }
  return dates;
}

async function buildRoomTimelineContext({ officeLocationId, roomId, startAt, endAt }) {
  if (!officeLocationId || !roomId || !startAt || !endAt) {
    return { events: [], sameSlotBlockers: [], previous: null, next: null };
  }
  const windowStart = addHoursToMysqlDateTime(startAt, -3);
  const windowEnd = addHoursToMysqlDateTime(endAt, 3);
  const events = await OfficeEvent.listForOfficeWindow({
    officeLocationId,
    startAt: windowStart,
    endAt: windowEnd
  });
  const sameRoom = (events || [])
    .filter((e) => Number(e.room_id) === Number(roomId))
    .map(eventContextRow)
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)) || Number(a.id || 0) - Number(b.id || 0));
  const requestStartMs = timeMs(startAt);
  const requestEndMs = timeMs(endAt);
  const sameSlotBlockers = sameRoom.filter((e) =>
    String(e.status || '').toUpperCase() !== 'CANCELLED'
    && intervalsOverlap(timeMs(e.startAt), timeMs(e.endAt), requestStartMs, requestEndMs)
  );
  const previous = [...sameRoom].reverse().find((e) => timeMs(e.endAt) <= requestStartMs) || null;
  const next = sameRoom.find((e) => timeMs(e.startAt) >= requestEndMs) || null;
  return { events: sameRoom, sameSlotBlockers, previous, next };
}

async function buildProviderBookingContext({ providerId, officeLocationId, startAt, endAt }) {
  const pid = Number(providerId || 0);
  if (!pid || !startAt || !endAt) return { sameTimeEvents: [], nearbyEvents: [], activeAssignments: [] };
  const windowStart = addHoursToMysqlDateTime(startAt, -3);
  const windowEnd = addHoursToMysqlDateTime(endAt, 3);
  const [events] = await pool.execute(
    `SELECT
       e.*,
       r.name AS room_name,
       r.room_number,
       r.label AS room_label,
       bu.first_name AS booked_provider_first_name,
       bu.last_name AS booked_provider_last_name,
       au.first_name AS assigned_provider_first_name,
       au.last_name AS assigned_provider_last_name,
       sa.provider_id AS standing_assignment_provider_id,
       su.first_name AS standing_provider_first_name,
       su.last_name AS standing_provider_last_name
     FROM office_events e
     JOIN office_rooms r ON r.id = e.room_id
     LEFT JOIN users bu ON bu.id = e.booked_provider_id
     LEFT JOIN users au ON au.id = e.assigned_provider_id
     LEFT JOIN office_standing_assignments sa ON sa.id = e.standing_assignment_id
     LEFT JOIN users su ON su.id = sa.provider_id
     WHERE e.start_at < ?
       AND e.end_at > ?
       AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
       AND (
         e.booked_provider_id = ?
         OR e.assigned_provider_id = ?
         OR sa.provider_id = ?
       )
     ORDER BY e.start_at ASC, r.sort_order ASC, r.name ASC`,
    [windowEnd, windowStart, pid, pid, pid]
  );
  const nearbyEvents = (events || []).map(eventContextRow);
  const requestStartMs = timeMs(startAt);
  const requestEndMs = timeMs(endAt);
  const sameTimeEvents = nearbyEvents.filter((e) =>
    intervalsOverlap(timeMs(e.startAt), timeMs(e.endAt), requestStartMs, requestEndMs)
  );
  const wh = weekdayHourFromSqlDateTime(startAt);
  let activeAssignments = [];
  if (wh) {
    const [rows] = await pool.execute(
      `SELECT
         a.id,
         a.office_location_id,
         a.room_id,
         a.weekday,
         a.hour,
         a.assigned_frequency,
         a.availability_mode,
         r.name AS room_name,
         r.room_number,
         r.label AS room_label,
         ol.name AS office_name
       FROM office_standing_assignments a
       JOIN office_rooms r ON r.id = a.room_id
       JOIN office_locations ol ON ol.id = a.office_location_id
       WHERE a.provider_id = ?
         AND a.is_active = TRUE
         AND a.weekday = ?
         AND a.hour = ?
       ORDER BY ol.name ASC, r.sort_order ASC, r.name ASC`,
      [pid, wh.weekdayIndex, wh.hour]
    );
    activeAssignments = rows || [];
  }
  return { sameTimeEvents, nearbyEvents, activeAssignments };
}

async function buildAlternativeRoomContext({ officeLocationId, requestedRoomId, startAt, endAt, officeTimeZone }) {
  if (!officeLocationId || !startAt || !endAt) return [];
  const rooms = await OfficeRoom.findByLocation(officeLocationId);
  const out = [];
  for (const room of rooms || []) {
    const roomId = Number(room.id || 0);
    if (!roomId) continue;
    // eslint-disable-next-line no-await-in-loop
    const open = await isRoomOpenAt({
      officeLocationId,
      roomId,
      startAt,
      endAt,
      officeTimeZone
    });
    out.push({
      roomId,
      roomName: room.name || null,
      roomNumber: room.room_number || null,
      roomLabel: room.label || room.name || null,
      requested: requestedRoomId ? Number(requestedRoomId) === roomId : false,
      open
    });
  }
  return out;
}

async function buildSpecialRequestContext(row = {}) {
  const type = String(row.request_type || '').toUpperCase();
  const meta = parseJsonSafely(row.requester_notes) || {};
  if (type === DELETE_EVENT_REQUEST_TYPE) {
    const eventId = Number(meta.eventId || 0) || 0;
    const event = eventId ? await OfficeEvent.findById(eventId) : null;
    return { type, meta, targetEvent: event ? eventContextRow(event) : null };
  }
  if (type === DROP_ASSIGNMENT_REQUEST_TYPE) {
    const assignmentId = Number(meta.standingAssignmentId || 0) || 0;
    if (!assignmentId) return { type, meta, assignment: null, bookingPlan: null };
    const assignment = await OfficeStandingAssignment.findById(assignmentId);
    const plan = assignment?.id ? await OfficeBookingPlan.findActiveByAssignmentId(assignment.id) : null;
    return { type, meta, assignment: assignment || null, bookingPlan: plan || null };
  }
  return { type, meta: null };
}

async function buildOfficeBookingRequestDecisionContext(row = {}) {
  const officeLocationId = Number(row.office_location_id || 0);
  const requestedRoomId = Number(row.room_id || 0) || null;
  const startAt = normalizeMysqlDateTime(row.start_at) || String(row.start_at || '');
  const endAt = normalizeMysqlDateTime(row.end_at) || String(row.end_at || '');
  const officeTimeZone = String(row.office_timezone || 'America/New_York');
  const wh = weekdayHourFromSqlDateTime(startAt);
  const selectedRoomIds = requestedRoomId
    ? [requestedRoomId]
    : (await OfficeRoom.findByLocation(officeLocationId)).map((r) => Number(r.id)).filter((n) => n > 0);
  const roomContexts = [];
  for (const roomId of selectedRoomIds.slice(0, 12)) {
    // eslint-disable-next-line no-await-in-loop
    const timeline = await buildRoomTimelineContext({
      officeLocationId,
      roomId,
      startAt,
      endAt
    });
    roomContexts.push({ roomId, ...timeline });
  }
  const primaryTimeline = requestedRoomId
    ? roomContexts.find((ctx) => Number(ctx.roomId) === Number(requestedRoomId)) || roomContexts[0] || null
    : roomContexts[0] || null;
  const provider = await buildProviderBookingContext({
    providerId: row.requested_provider_id,
    officeLocationId,
    startAt,
    endAt
  });
  const alternatives = await buildAlternativeRoomContext({
    officeLocationId,
    requestedRoomId,
    startAt,
    endAt,
    officeTimeZone
  });
  const blockers = roomContexts.flatMap((ctx) =>
    (ctx.sameSlotBlockers || []).map((b) => ({ ...b, roomId: ctx.roomId }))
  );
  const openAlternativeCount = alternatives.filter((a) => a.open).length;
  return {
    requested: {
      startAt,
      endAt,
      date: normalizeYmd(startAt),
      weekday: wh?.weekdayName || null,
      hour: wh?.hour ?? null,
      timeZone: officeTimeZone,
      recurrence: String(row.recurrence || 'ONCE').toUpperCase(),
      recurrenceLabel: recurrenceLabelForRequest(row),
      occurrenceCount: Number(row.booked_occurrence_count || 0) || null,
      occurrencePreview: occurrencePreviewForRequest(row),
      openToAlternativeRoom: Boolean(row.open_to_alternative_room)
    },
    client: {
      id: Number(row.client_id || 0) || null,
      name: String(row.client_full_name || row.client_initials || '').trim() || null
    },
    taxonomy: {
      appointmentTypeCode: String(row.appointment_type_code || '').trim().toUpperCase() || null,
      appointmentSubtypeCode: String(row.appointment_subtype_code || '').trim().toUpperCase() || null,
      serviceCode: String(row.service_code || '').trim().toUpperCase() || null,
      modality: String(row.modality || '').trim().toUpperCase() || null
    },
    roomTimeline: primaryTimeline,
    roomContexts,
    provider,
    alternatives,
    blockers,
    conflictCount: blockers.length + provider.sameTimeEvents.length,
    availabilityStatus: blockers.length === 0 && (requestedRoomId ? alternatives.find((a) => a.requested)?.open !== false : openAlternativeCount > 0)
      ? 'AVAILABLE'
      : 'CONFLICT',
    special: await buildSpecialRequestContext(row)
  };
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

function parseYmdPartsOfficeMandatory(dateStr) {
  const raw = String(dateStr || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function weekIndexFromAnchorOfficeMandatory(dateStr, anchorStr) {
  const ap = parseYmdPartsOfficeMandatory(anchorStr);
  const dp = parseYmdPartsOfficeMandatory(dateStr);
  if (!ap || !dp) return 0;
  const a = Date.UTC(ap.y, ap.mo - 1, ap.d);
  const d = Date.UTC(dp.y, dp.mo - 1, dp.d);
  const diffDays = Math.floor((d - a) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function weekdayIndexFromYmdOfficeMandatory(ymd) {
  const p = parseYmdPartsOfficeMandatory(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}

function computeSuggestedBookingStartDateMandatory(assignment) {
  const today = new Date().toISOString().slice(0, 10);
  const weekday = Number(assignment.weekday);
  const freq = String(assignment.assigned_frequency || 'WEEKLY').toUpperCase();
  const anchorRaw = assignment.available_since_date || assignment.created_at;
  const anchor = String(anchorRaw || '').slice(0, 10);
  const anchorUse = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : today;
  for (let i = 0; i < 56; i += 1) {
    const ymd = addDays(today, i);
    const wd = weekdayIndexFromYmdOfficeMandatory(ymd);
    if (wd !== weekday) continue;
    if (freq !== 'BIWEEKLY') return ymd;
    const wi = weekIndexFromAnchorOfficeMandatory(ymd, anchorUse);
    if (wi % 2 === 0) return ymd;
  }
  return today;
}

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
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING'))
           AND (
             u.role IN ('provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'staff')
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
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING'))
           AND (
             u.role IN ('provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'staff')
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
    const requestedWeekStart = normalizeYmd(weekStartRaw);
    if (!requestedWeekStart) {
      return res.status(400).json({ error: { message: 'weekStart must be YYYY-MM-DD' } });
    }
    // Treat weekStart as the exact visible window anchor from the client (Mon->Sun in UI).
    // Materialization can still normalize to Sunday internally.
    const weekStart = requestedWeekStart;

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
    // Wrapped in try/catch: a transient DB connection drop must not prevent the grid from loading
    // existing events — it just means this week might not have new events yet.
    try {
      await OfficeScheduleMaterializer.materializeWeek({
        officeLocationId: parseInt(locationId),
        weekStartRaw: weekStart,
        useExactWeekStart: true,
        createdByUserId: req.user.id
      });
    } catch (materializeErr) {
      console.warn('[getWeeklyGrid] materializeWeek failed (DB hiccup?); loading existing events:', materializeErr?.message || materializeErr);
    }

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
    const eventsBySlot = new Map();
    const conflictSlotsByKey = new Map();
    for (const e of events || []) {
      const slot = parseSlotDateHour(e.start_at);
      if (!slot) continue;
      const date = slot.date;
      const hour = slot.hour;
      const k = key(e.room_id, date, hour);
      if (!eventsBySlot.has(k)) eventsBySlot.set(k, []);
      eventsBySlot.get(k).push(e);
      // Precedence: assigned_booked over assigned_temporary over assigned_available
      const prev = eventBySlot.get(k);
      if (!prev) {
        eventBySlot.set(k, e);
      } else {
        const rank = (x) => {
          const st = x?.slot_state || null;
          if (st === 'ASSIGNED_BOOKED' || x?.status === 'BOOKED') return 3;
          if (st === 'COMPANY_HOLD') return 2;
          if (st === 'ASSIGNED_TEMPORARY') return 2;
          if (st === 'ASSIGNED_AVAILABLE' || x?.status === 'RELEASED') return 1;
          return 0;
        };
        if (rank(e) > rank(prev)) eventBySlot.set(k, e);
      }
    }
    for (const [slotKey, slotEvents] of eventsBySlot.entries()) {
      const active = (slotEvents || []).filter((e) => String(e.status || '').toUpperCase() !== 'CANCELLED');
      if (active.length <= 1) continue;
      conflictSlotsByKey.set(slotKey, active.map((e) => {
        const bookedName = formatFullName(e.booked_provider_first_name, e.booked_provider_last_name);
        const assignedName = formatFullName(e.assigned_provider_first_name, e.assigned_provider_last_name);
        const standingName = formatFullName(e.standing_provider_first_name, e.standing_provider_last_name);
        return {
          eventId: Number(e.id || 0) || null,
          status: String(e.status || '').toUpperCase() || null,
          slotState: String(e.slot_state || '').toUpperCase() || null,
          providerId: Number(e.booked_provider_id || e.assigned_provider_id || e.standing_assignment_provider_id || 0) || null,
          providerName: bookedName || assignedName || standingName || 'Unknown provider',
          standingAssignmentId: Number(e.standing_assignment_id || 0) || null,
          bookingPlanId: Number(e.booking_plan_id || 0) || null
        };
      }));
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
          const slotConflicts = conflictSlotsByKey.get(k) || [];
          if (slotConflicts.length > 1) {
            slots.push({
              roomId: room.id,
              date,
              hour,
              state: 'conflict',
              displayStatus: 'CONFLICT',
              eventId: slotConflicts[0]?.eventId || null,
              learningSessionId: null,
              learningLinked: false,
              standingAssignmentId: null,
              bookingPlanId: null,
              recurrenceGroupId: null,
              providerId: null,
              providerInitials: '!',
              assignedProviderId: null,
              bookedProviderId: null,
              assignedProviderName: null,
              assignedProviderFullName: null,
              bookedProviderName: null,
              bookedProviderFullName: null,
              conflictCount: slotConflicts.length,
              conflictEvents: slotConflicts,
              appointmentType: 'CONFLICT',
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
            continue;
          }
          const e = eventBySlot.get(k);
          if (e) {
            const statusUpper = String(e.status || '').toUpperCase();
            const slotStateUpper = String(e.slot_state || '').toUpperCase();
            if (slotStateUpper === 'COMPANY_HOLD') {
              const holdTitle = String(e.notes || '').trim() || 'Company hold';
              slots.push({
                roomId: room.id,
                date,
                hour,
                state: 'company_hold',
                displayStatus: 'COMPANY HOLD',
                holdTitle,
                eventId: e.id,
                learningSessionId: null,
                learningLinked: false,
                standingAssignmentId: null,
                bookingPlanId: null,
                recurrenceGroupId: e.recurrence_group_id || null,
                providerId: null,
                providerInitials: null,
                assignedProviderId: null,
                bookedProviderId: null,
                assignedProviderName: null,
                assignedProviderFullName: null,
                bookedProviderName: null,
                bookedProviderFullName: null,
                appointmentType: null,
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
              continue;
            }
            const st = statusUpper === 'BOOKED'
              ? 'ASSIGNED_BOOKED'
              : (slotStateUpper || 'ASSIGNED_AVAILABLE');
            const state =
              st === 'ASSIGNED_BOOKED'
                ? 'assigned_booked'
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

        const availableSinceDate = normalizeYmd(r.available_since_date);
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
          assignmentTemporaryUntilDate: normalizeYmd(r.temporary_until_date),
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

    const frequencyMeta = ({ assignedFrequency, bookedFrequency, state, assignmentMeta }) => {
      const normalize = (v) => String(v || '').trim().toUpperCase();
      const oneTimeByTemporaryWindow =
        String(assignmentMeta?.assignmentAvailableSinceDate || '').slice(0, 10)
        && String(assignmentMeta?.assignmentTemporaryUntilDate || '').slice(0, 10)
        && String(assignmentMeta?.assignmentAvailableSinceDate || '').slice(0, 10)
          === String(assignmentMeta?.assignmentTemporaryUntilDate || '').slice(0, 10)
        && normalize(assignedFrequency) === 'WEEKLY'
        && !normalize(bookedFrequency);
      if (oneTimeByTemporaryWindow) {
        return { frequency: 'ONCE', frequencyLabel: 'Once', frequencyBadge: '1x' };
      }
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
          const mondayFirstIdx = ((wd + 6) % 7); // 0=Sun..6=Sat -> Monday-first index
          const dateForWeekday = days[mondayFirstIdx];
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
      const meta = frequencyMeta({ assignedFrequency, bookedFrequency, state: s.state, assignmentMeta });
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

    // Auto-dismiss cancelled events that have no Google event ID — nothing to clean up in Google.
    // This prevents them from accumulating in the cleanup queue across weeks.
    try {
      await pool.execute(
        `UPDATE office_events
         SET google_sync_status = 'SYNCED',
             google_sync_error  = NULL,
             google_synced_at   = NOW()
         WHERE office_location_id = ?
           AND UPPER(COALESCE(status, '')) = 'CANCELLED'
           AND (google_provider_event_id IS NULL OR TRIM(google_provider_event_id) = '')
           AND UPPER(COALESCE(google_sync_status, '')) IN ('FAILED', 'PENDING')`,
        [officeLocationIdNum]
      );
    } catch (_e) { /* non-critical — best effort */ }

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
        duplicateRoomSlotConflictCount: conflictSlotsByKey.size,
        duplicateRoomSlotConflictSample: Array.from(conflictSlotsByKey.entries()).slice(0, 25).map(([slotKey, conflictEvents]) => ({
          slotKey,
          conflictEvents
        })),
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

    const result = await refreshLocationBookingsFromEhr({
      officeLocationId,
      actorUserId: req.user.id
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * Slots the provider must resolve in-app:
 *  - AVAILABLE without an active booking plan (needs_booking)
 *  - AVAILABLE with a pre-forfeit warning already sent (forfeit_warning — act within 14 days)
 *  - TEMPORARY assignment nearing end with extensions remaining (temporary_expiring)
 */
export const getMyMandatoryOfficeReview = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const blocked = await userHasBlockingExpiredCredential(uid);
    if (blocked) {
      return res.json({ blocking: false, items: [], reason: 'credential_blocked' });
    }

    let rows = [];
    try {
      const [r] = await pool.query(
        `SELECT osa.id AS standing_assignment_id,
                osa.office_location_id,
                osa.room_id,
                osa.weekday,
                osa.hour,
                osa.assigned_frequency,
                osa.availability_mode,
                osa.available_since_date,
                osa.created_at,
                osa.temporary_until_date,
                osa.temporary_extension_count,
                osa.last_forfeit_warning_at,
                ol.name AS office_name,
                ol.timezone AS office_timezone,
                r.name AS room_name,
                r.label AS room_label
         FROM office_standing_assignments osa
         JOIN office_locations ol ON ol.id = osa.office_location_id
         JOIN office_rooms r ON r.id = osa.room_id
         WHERE osa.provider_id = ?
           AND osa.is_active = TRUE
           AND EXISTS (
             SELECT 1 FROM office_location_agencies ola
             JOIN user_agencies ua ON ua.agency_id = ola.agency_id AND ua.user_id = ?
             WHERE ola.office_location_id = osa.office_location_id
           )
           AND (
             (osa.availability_mode = 'AVAILABLE' AND NOT EXISTS (
               SELECT 1 FROM office_booking_plans bp
               WHERE bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
                 AND (bp.active_until_date IS NULL OR bp.active_until_date >= CURDATE())
             ))
             OR
             (osa.availability_mode = 'TEMPORARY'
               AND osa.temporary_until_date IS NOT NULL
               AND osa.temporary_until_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
               AND (osa.temporary_extension_count IS NULL OR osa.temporary_extension_count < 2))
           )`,
        [uid, uid]
      );
      rows = r || [];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.json({ blocking: false, items: [], reason: 'tables_missing' });
      }
      throw e;
    }

    const items = (rows || []).map((row) => {
      const mode = String(row.availability_mode || '').toUpperCase();
      const warnedAt = row.last_forfeit_warning_at ? new Date(row.last_forfeit_warning_at) : null;
      const daysUntilForfeit = warnedAt
        ? Math.max(0, 14 - Math.floor((Date.now() - warnedAt.getTime()) / 86400000))
        : null;

      let reason;
      if (warnedAt && mode === 'AVAILABLE') {
        reason = 'forfeit_warning';
      } else if (mode === 'TEMPORARY' && row.temporary_until_date) {
        reason = 'temporary_expiring';
      } else {
        reason = 'needs_booking';
      }

      const suggestedBookingStartDate = computeSuggestedBookingStartDateMandatory({
        weekday: row.weekday,
        assigned_frequency: row.assigned_frequency,
        available_since_date: row.available_since_date,
        created_at: row.created_at
      });
      return {
        standingAssignmentId: Number(row.standing_assignment_id),
        officeLocationId: Number(row.office_location_id),
        roomId: Number(row.room_id),
        officeName: String(row.office_name || '').trim() || 'Office',
        roomLabel: String(row.room_label || row.room_name || '').trim() || 'Room',
        officeTimezone: String(row.office_timezone || 'America/New_York'),
        weekday: Number(row.weekday),
        hour: Number(row.hour),
        assignedFrequency: String(row.assigned_frequency || 'WEEKLY').toUpperCase(),
        availabilityMode: mode,
        reason,
        temporaryUntilDate: row.temporary_until_date ? String(row.temporary_until_date).slice(0, 10) : null,
        extensionsUsed: Number(row.temporary_extension_count || 0),
        suggestedBookingStartDate,
        daysUntilForfeit
      };
    });

    res.json({
      blocking: items.length > 0,
      items
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
      const ev = await OfficeEvent.createIfRoomOpen({
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
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        // best-effort: do not block approval if events table isn't present yet
      } else {
        throw e;
      }
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
        const ws = OfficeScheduleMaterializer.startOfWeekMonday(startYmd);
        if (ws) {
          await OfficeScheduleMaterializer.materializeWeek({
            officeLocationId: loc.id,
            weekStartRaw: ws,
            createdByUserId: req.user.id,
            useExactWeekStart: true
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

        const ev = await OfficeEvent.createIfRoomOpen({
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
    const includeContext = String(req.query.includeContext ?? '1') !== '0';
    if (!includeContext) return res.json(rows);
    const enriched = [];
    for (const row of rows || []) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const approvalContext = await buildOfficeBookingRequestDecisionContext(row);
        enriched.push({ ...row, approvalContext });
      } catch (err) {
        enriched.push({
          ...row,
          approvalContext: {
            error: true,
            message: err?.message || 'Unable to build approval context'
          }
        });
      }
    }
    res.json(enriched);
  } catch (e) {
    next(e);
  }
};

export const getOfficeBookingRequestContext = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can view booking request context' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid request id' } });
    const reqRow = await OfficeBookingRequest.findById(id);
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });

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

    const joinedRows = await OfficeBookingRequest.listPendingForAgencies(
      (await User.getAgencies(req.user.id)).map((a) => a.id),
      { officeLocationId: Number(reqRow.office_location_id) }
    );
    const displayRow = (joinedRows || []).find((r) => Number(r.id) === Number(id)) || {
      ...reqRow,
      office_location_name: loc.name,
      office_timezone: loc.timezone
    };
    const approvalContext = await buildOfficeBookingRequestDecisionContext(displayRow);
    return res.json({ request: displayRow, approvalContext });
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

    if (String(reqRow.request_type || '').toUpperCase() === DROP_ASSIGNMENT_REQUEST_TYPE) {
      const meta = parseJsonSafely(reqRow.requester_notes) || {};
      const targetAssignmentId = Number(meta?.standingAssignmentId || 0) || 0;
      if (!targetAssignmentId) {
        return res.status(400).json({ error: { message: 'Drop request payload is missing standingAssignmentId' } });
      }

      await pool.execute(
        `UPDATE office_standing_assignments
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [targetAssignmentId]
      );

      const updatedReq = await OfficeBookingRequest.markDecided({
        requestId: reqRow.id,
        status: 'APPROVED',
        decidedByUserId: req.user.id,
        approverComment: req.body?.approverComment ? String(req.body.approverComment).slice(0, 2000) : null
      });

      const providerId = Number(reqRow.requested_provider_id || 0);
      if (providerId) {
        const auditAgencyId = await resolveAuditAgencyIdForOffice(loc.id, req.user.id);
        const slotLabel = String(meta?.slotLabel || loc.name || 'office slot');
        try {
          await createNotificationAndDispatch({
            type: 'office_schedule_unbooked_forfeit',
            severity: 'warning',
            title: 'Office slot released by admin',
            message: `An admin has reviewed and released your unbooked office slot (${slotLabel}).`,
            userId: providerId,
            agencyId: auditAgencyId || 0,
            relatedEntityType: 'office_standing_assignment',
            relatedEntityId: targetAssignmentId,
            actorSource: 'Office Scheduling'
          });
        } catch {
          // best-effort notification
        }
        try {
          if (auditAgencyId) {
            await AdminAuditLog.logAction({
              actionType: 'OFFICE_ASSIGNMENT_DROP_APPROVED',
              actorUserId: Number(req.user?.id || 0) || null,
              targetUserId: providerId,
              agencyId: auditAgencyId,
              metadata: {
                requestId: Number(reqRow.id || 0) || null,
                standingAssignmentId: targetAssignmentId,
                officeLocationId: Number(loc.id || 0) || null
              }
            });
          }
        } catch {
          // best-effort audit logging
        }
      }

      return res.json({ ok: true, request: updatedReq });
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
      const ws = OfficeScheduleMaterializer.startOfWeekMonday(ymd);
      if (ws) {
        await OfficeScheduleMaterializer.materializeWeek({
          officeLocationId: loc.id,
          weekStartRaw: ws,
          createdByUserId: req.user.id,
          useExactWeekStart: true
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

    const wh = weekdayHourFromSqlDateTime(reqRow.start_at) || weekdayHourInTz(reqRow.start_at, tz);
    if (!wh) return res.status(400).json({ error: { message: 'Invalid start time' } });

    let createdEvent = null;
    let createdStandingAssignment = null;
    let createdBookingPlan = null;

    if (normalizedRecurrence === 'ONCE') {
      createdEvent = await OfficeEvent.createIfRoomOpen({
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
      try {
        await OfficeScheduleMaterializer.materializeWeek({
          officeLocationId: loc.id,
          weekStartRaw: OfficeScheduleMaterializer.startOfWeekMonday(String(reqRow.start_at || '').slice(0, 10)),
          createdByUserId: req.user.id,
          useExactWeekStart: true
        });
      } catch {
        // best-effort immediate materialization
      }
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

    if (String(reqRow.request_type || '').toUpperCase() === DROP_ASSIGNMENT_REQUEST_TYPE) {
      // Admin kept the slot — reset the forfeit warning clock so the 42-day window restarts.
      const meta = parseJsonSafely(reqRow.requester_notes) || {};
      const targetAssignmentId = Number(meta?.standingAssignmentId || 0) || 0;
      if (targetAssignmentId) {
        try {
          await pool.execute(
            `UPDATE office_standing_assignments
             SET last_forfeit_warning_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [targetAssignmentId]
          );
        } catch {
          // best-effort reset
        }
        const providerId = Number(reqRow.requested_provider_id || 0);
        const auditAgencyId = await resolveAuditAgencyIdForOffice(loc.id, req.user.id);
        const slotLabel = String(meta?.slotLabel || loc.name || 'office slot');
        if (providerId && auditAgencyId) {
          try {
            await createNotificationAndDispatch({
              type: 'office_schedule_drop_review_kept',
              severity: 'info',
              title: 'Office slot kept by admin',
              message: `An admin has reviewed your office slot (${slotLabel}) and decided to keep it active. Please remember to book it when you have sessions.`,
              userId: providerId,
              agencyId: auditAgencyId,
              relatedEntityType: 'office_standing_assignment',
              relatedEntityId: targetAssignmentId,
              actorSource: 'Office Scheduling'
            });
          } catch {
            // best-effort notification
          }
          try {
            await AdminAuditLog.logAction({
              actionType: 'OFFICE_ASSIGNMENT_DROP_DENIED',
              actorUserId: Number(req.user?.id || 0) || null,
              targetUserId: providerId,
              agencyId: auditAgencyId,
              metadata: {
                requestId: Number(reqRow.id || 0) || null,
                standingAssignmentId: targetAssignmentId,
                officeLocationId: Number(loc.id || 0) || null
              }
            });
          } catch {
            // best-effort audit logging
          }
        }
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

// ─── Slot-conflict resolver (booking reinstatement) ──────────────────────────

export const getOfficeScheduleIntegrityDiagnostics = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can view office schedule diagnostics' } });
    }
    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((n) => n > 0);
    if (!agencyIds.length) {
      return res.json({
        summary: { duplicateActiveEvents: 0, duplicateActiveStandingAssignments: 0, providerDoubleBookings: 0 },
        duplicateActiveEvents: [],
        duplicateActiveStandingAssignments: [],
        providerDoubleBookings: []
      });
    }
    const placeholders = agencyIds.map(() => '?').join(',');

    // Use IN subquery instead of JOIN to office_location_agencies so each event
    // row appears exactly once regardless of how many agencies own the location.
    // A direct JOIN multiplies rows (one per agency membership) and makes every
    // single-event slot appear as COUNT(*) > 1 — producing hundreds of false positives.

    // ── Duplicate active events ───────────────────────────────────────────────
    const [dupEventSlots] = await pool.execute(
      `SELECT e.room_id, e.start_at, e.end_at, COUNT(*) AS event_count
       FROM office_events e
       WHERE e.start_at >= NOW()
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         AND e.office_location_id IN (
           SELECT DISTINCT ola.office_location_id
           FROM office_location_agencies ola
           WHERE ola.agency_id IN (${placeholders})
         )
       GROUP BY e.room_id, e.start_at, e.end_at
       HAVING COUNT(*) > 1
       ORDER BY e.start_at ASC
       LIMIT 100`,
      agencyIds
    );

    let duplicateActiveEvents = [];
    if (dupEventSlots.length) {
      const slotCond = dupEventSlots.map(() => '(e.room_id = ? AND e.start_at = ? AND e.end_at = ?)').join(' OR ');
      const slotParams = dupEventSlots.flatMap((s) => [s.room_id, s.start_at, s.end_at]);
      const [evRows] = await pool.execute(
        `SELECT e.id, e.office_location_id, ol.name AS office_name,
                e.room_id, r.name AS room_name, r.room_number, r.label AS room_label,
                e.start_at, e.end_at, e.status,
                COALESCE(e.booked_provider_id, e.assigned_provider_id) AS provider_id,
                TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS provider_name,
                CASE
                  WHEN COALESCE(e.booked_provider_id, e.assigned_provider_id) IS NULL THEN 0
                  ELSE EXISTS (
                    SELECT 1 FROM office_events e2
                    WHERE COALESCE(e2.booked_provider_id, e2.assigned_provider_id)
                          = COALESCE(e.booked_provider_id, e.assigned_provider_id)
                      AND e2.start_at < e.end_at
                      AND e2.end_at > e.start_at
                      AND e2.id != e.id
                      AND (e2.status IS NULL OR UPPER(e2.status) <> 'CANCELLED')
                  )
                END AS has_other_booking
         FROM office_events e
         JOIN office_locations ol ON ol.id = e.office_location_id
         JOIN office_rooms r ON r.id = e.room_id
         LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
         WHERE (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND (${slotCond})
         ORDER BY e.start_at ASC, e.room_id ASC, e.id ASC`,
        slotParams
      );
      const slotMap = new Map();
      for (const row of evRows) {
        const key = `${row.room_id}|${row.start_at}|${row.end_at}`;
        if (!slotMap.has(key)) {
          slotMap.set(key, {
            office_location_id: row.office_location_id,
            office_name: row.office_name,
            room_id: row.room_id,
            room_name: row.room_name,
            room_number: row.room_number,
            room_label: row.room_label,
            start_at: row.start_at,
            end_at: row.end_at,
            events: []
          });
        }
        slotMap.get(key).events.push({
          id: row.id,
          status: row.status || null,
          provider_id: row.provider_id || null,
          provider_name: row.provider_name || null,
          has_other_booking: !!row.has_other_booking
        });
      }
      duplicateActiveEvents = [...slotMap.values()];

      // Auto-cancel same-provider duplicates: if every event in a group belongs
      // to the same provider (or all are unassigned), keep the best one and
      // cancel the rest immediately — no manual intervention needed.
      const stillNeedsReview = [];
      let autoResolvedEventCount = 0;
      for (const group of duplicateActiveEvents) {
        const providerIds = group.events.map((e) => e.provider_id);
        const uniqueProviders = new Set(providerIds.filter(Boolean));
        const allSameProvider = uniqueProviders.size <= 1;
        if (allSameProvider) {
          // Keep the BOOKED event if one exists, otherwise the one with the smallest id.
          const sorted = [...group.events].sort((a, b) => {
            const aBooked = (a.status || '').toUpperCase() === 'BOOKED' ? 0 : 1;
            const bBooked = (b.status || '').toUpperCase() === 'BOOKED' ? 0 : 1;
            if (aBooked !== bBooked) return aBooked - bBooked;
            return a.id - b.id;
          });
          const keepId = sorted[0].id;
          const cancelIds = sorted.slice(1).map((e) => e.id);
          if (cancelIds.length) {
            const cancelPlaceholders = cancelIds.map(() => '?').join(',');
            await pool.execute(
              `UPDATE office_events SET status = 'CANCELLED', updated_at = NOW()
               WHERE id IN (${cancelPlaceholders})
                 AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
              cancelIds
            );
            autoResolvedEventCount += cancelIds.length;
          }
          // Do not include this group in the response — it's resolved.
        } else {
          stillNeedsReview.push(group);
        }
      }
      duplicateActiveEvents = stillNeedsReview;
    }

    // ── Duplicate active standing assignments ─────────────────────────────────
    const [dupAssignSlots] = await pool.execute(
      `SELECT a.office_location_id, a.room_id, a.weekday, a.hour, COUNT(*) AS assignment_count
       FROM office_standing_assignments a
       WHERE a.is_active = TRUE
         AND a.office_location_id IN (
           SELECT DISTINCT ola.office_location_id
           FROM office_location_agencies ola
           WHERE ola.agency_id IN (${placeholders})
         )
       GROUP BY a.office_location_id, a.room_id, a.weekday, a.hour
       HAVING COUNT(*) > 1
       ORDER BY a.office_location_id ASC, a.room_id ASC, a.weekday ASC, a.hour ASC
       LIMIT 100`,
      agencyIds
    );

    let duplicateActiveStandingAssignments = [];
    if (dupAssignSlots.length) {
      const aCond = dupAssignSlots.map(() => '(a.office_location_id = ? AND a.room_id = ? AND a.weekday = ? AND a.hour = ?)').join(' OR ');
      const aParams = dupAssignSlots.flatMap((s) => [s.office_location_id, s.room_id, s.weekday, s.hour]);
      const [assignRows] = await pool.execute(
        `SELECT a.id, a.office_location_id, ol.name AS office_name,
                a.room_id, r.name AS room_name, r.room_number, r.label AS room_label,
                a.weekday, a.hour, a.assigned_frequency, a.created_at, a.provider_id,
                TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS provider_name
         FROM office_standing_assignments a
         JOIN office_locations ol ON ol.id = a.office_location_id
         JOIN office_rooms r ON r.id = a.room_id
         LEFT JOIN users u ON u.id = a.provider_id
         WHERE a.is_active = TRUE
           AND (${aCond})
         ORDER BY a.office_location_id ASC, a.room_id ASC, a.weekday ASC, a.hour ASC, a.id ASC`,
        aParams
      );
      const aSlotMap = new Map();
      for (const row of assignRows) {
        const key = `${row.office_location_id}|${row.room_id}|${row.weekday}|${row.hour}`;
        if (!aSlotMap.has(key)) {
          aSlotMap.set(key, {
            office_location_id: row.office_location_id,
            office_name: row.office_name,
            room_id: row.room_id,
            room_name: row.room_name,
            room_number: row.room_number,
            room_label: row.room_label,
            weekday: row.weekday,
            hour: row.hour,
            assignments: []
          });
        }
        aSlotMap.get(key).assignments.push({
          id: row.id,
          provider_id: row.provider_id || null,
          provider_name: row.provider_name || null,
          assigned_frequency: row.assigned_frequency || null,
          created_at: row.created_at || null
        });
      }
      duplicateActiveStandingAssignments = [...aSlotMap.values()];

      // Auto-deactivate same-provider duplicate standing assignments: keep the
      // oldest (lowest id) and deactivate + cancel future events for the rest.
      const assignNeedsReview = [];
      for (const group of duplicateActiveStandingAssignments) {
        const uniqueProviders = new Set(group.assignments.map((a) => a.provider_id).filter(Boolean));
        if (uniqueProviders.size <= 1) {
          const sorted = [...group.assignments].sort((a, b) => a.id - b.id);
          const deactivateIds = sorted.slice(1).map((a) => a.id);
          if (deactivateIds.length) {
            const dp = deactivateIds.map(() => '?').join(',');
            await pool.execute(
              `UPDATE office_standing_assignments SET is_active = FALSE, updated_at = NOW()
               WHERE id IN (${dp}) AND is_active = TRUE`,
              deactivateIds
            );
            await pool.execute(
              `UPDATE office_events SET status = 'CANCELLED', updated_at = NOW()
               WHERE standing_assignment_id IN (${dp})
                 AND start_at >= NOW()
                 AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
              deactivateIds
            );
          }
        } else {
          assignNeedsReview.push(group);
        }
      }
      duplicateActiveStandingAssignments = assignNeedsReview;
    }

    // ── Provider double-bookings ──────────────────────────────────────────────
    const [providerDoubleBookings] = await pool.execute(
      `SELECT provider_id, provider_name, start_at, end_at,
              COUNT(*) AS booking_count,
              GROUP_CONCAT(event_id ORDER BY event_id) AS event_ids,
              GROUP_CONCAT(room_label ORDER BY room_label SEPARATOR ', ') AS rooms
       FROM (
         SELECT e.id AS event_id,
                COALESCE(e.booked_provider_id, e.assigned_provider_id) AS provider_id,
                TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS provider_name,
                e.start_at, e.end_at,
                CONCAT(ol.name, ' / ', COALESCE(r.label, r.name)) AS room_label
         FROM office_events e
         JOIN office_locations ol ON ol.id = e.office_location_id
         JOIN office_rooms r ON r.id = e.room_id
         LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
         WHERE e.start_at >= NOW()
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND UPPER(COALESCE(e.status,'')) = 'BOOKED'
           AND COALESCE(e.booked_provider_id, e.assigned_provider_id) IS NOT NULL
           AND e.office_location_id IN (
             SELECT DISTINCT ola.office_location_id
             FROM office_location_agencies ola
             WHERE ola.agency_id IN (${placeholders})
           )
       ) booked
       GROUP BY provider_id, provider_name, start_at, end_at
       HAVING COUNT(*) > 1
       ORDER BY start_at ASC, provider_name ASC
       LIMIT 100`,
      agencyIds
    );

    return res.json({
      summary: {
        duplicateActiveEvents: duplicateActiveEvents.length,
        duplicateActiveStandingAssignments: duplicateActiveStandingAssignments.length,
        providerDoubleBookings: providerDoubleBookings.length
      },
      duplicateActiveEvents,
      duplicateActiveStandingAssignments,
      providerDoubleBookings
    });
  } catch (e) {
    next(e);
  }
};

export const resolveIntegrityConflict = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can resolve integrity conflicts' } });
    }

    const { action, eventId, assignmentId } = req.body;

    if (action === 'cancelEvent') {
      if (!eventId) return res.status(400).json({ error: { message: 'eventId required' } });
      const [result] = await pool.execute(
        `UPDATE office_events SET status = 'CANCELLED', updated_at = NOW()
         WHERE id = ? AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
        [Number(eventId)]
      );
      if (!result.affectedRows) {
        return res.status(404).json({ error: { message: 'Event not found or already cancelled' } });
      }
      return res.json({ ok: true });
    }

    if (action === 'deactivateAssignment') {
      if (!assignmentId) return res.status(400).json({ error: { message: 'assignmentId required' } });
      await pool.execute(
        `UPDATE office_standing_assignments SET is_active = FALSE, updated_at = NOW()
         WHERE id = ? AND is_active = TRUE`,
        [Number(assignmentId)]
      );
      // Also cancel all future materialized events for this assignment so the
      // grid clears immediately without waiting for the next materializer run.
      await pool.execute(
        `UPDATE office_events
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE standing_assignment_id = ?
           AND start_at >= NOW()
           AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
        [Number(assignmentId)]
      );
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: { message: `Unknown action: ${action}` } });
  } catch (e) {
    next(e);
  }
};

export const cleanupInactiveProviderBookings = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can run provider cleanup' } });
    }
    const result = await OfficeScheduleWatchdogService.cleanupInactiveProviderBookings();
    return res.json(result);
  } catch (e) {
    next(e);
  }
};

export const availableRoomsForSlot = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const { locationId, startAt, endAt, excludeRoomId } = req.query;
    if (!locationId || !startAt || !endAt) {
      return res.status(400).json({ error: { message: 'locationId, startAt and endAt are required' } });
    }
    const [rooms] = await pool.execute(
      `SELECT r.id, r.name, r.label, r.room_number, r.room_type
       FROM office_rooms r
       WHERE r.office_location_id = ?
         AND (r.is_active = TRUE OR r.is_active IS NULL)
         AND r.id != COALESCE(?, -1)
         AND r.id NOT IN (
           SELECT DISTINCT e.room_id
           FROM office_events e
           WHERE e.office_location_id = ?
             AND e.start_at < ?
             AND e.end_at > ?
             AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         )
       ORDER BY r.room_number + 0, r.name`,
      [Number(locationId), excludeRoomId ? Number(excludeRoomId) : null,
       Number(locationId), startAt, endAt]
    );
    return res.json({ rooms });
  } catch (e) {
    next(e);
  }
};

export const rebookEvent = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const { eventId, newRoomId } = req.body;
    if (!eventId || !newRoomId) {
      return res.status(400).json({ error: { message: 'eventId and newRoomId are required' } });
    }
    // Verify the target room is genuinely open (no active overlapping event).
    const [existingRows] = await pool.execute(
      `SELECT e2.id
       FROM office_events e
       JOIN office_events e2 ON e2.room_id = ?
         AND e2.start_at < e.end_at
         AND e2.end_at > e.start_at
         AND e2.id != e.id
         AND (e2.status IS NULL OR UPPER(e2.status) <> 'CANCELLED')
       WHERE e.id = ?
       LIMIT 1`,
      [Number(newRoomId), Number(eventId)]
    );
    if (existingRows.length) {
      return res.status(409).json({ error: { message: 'That room already has a booking in this time slot' } });
    }
    const [result] = await pool.execute(
      `UPDATE office_events SET room_id = ?, updated_at = NOW() WHERE id = ?`,
      [Number(newRoomId), Number(eventId)]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getSlotConflicts = async (req, res, next) => {
  try {
    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((n) => n > 0);
    if (!agencyIds.length) return res.json({ conflicts: [] });

    const placeholders = agencyIds.map(() => '?').join(',');

    // ── Type 1: restored slots (RELEASED) that now clash with an active booking ─
    const [restoredRows] = await pool.execute(
      `SELECT
         'released_vs_booked'                                  AS conflict_type,
         oe_rel.id                                             AS released_event_id,
         oe_con.id                                             AS conflict_event_id,
         oe_rel.room_id,
         r.name                                                AS room_name,
         r.label                                               AS room_label,
         r.room_number,
         ol.name                                               AS office_name,
         oe_rel.office_location_id,
         oe_rel.start_at,
         oe_rel.end_at,
         oe_rel.assigned_provider_id                          AS original_provider_id,
         CONCAT(u_orig.first_name, ' ', u_orig.last_name)     AS original_provider_name,
         oe_con.assigned_provider_id                          AS current_provider_id,
         CONCAT(u_cur.first_name, ' ', u_cur.last_name)       AS current_provider_name,
         oe_con.slot_state                                     AS current_slot_state,
         oe_rel.standing_assignment_id,
         osa.assigned_frequency
       FROM office_events oe_rel
       JOIN office_standing_assignments osa
         ON osa.id = oe_rel.standing_assignment_id AND osa.is_active = TRUE
       JOIN office_location_agencies ola
         ON ola.office_location_id = oe_rel.office_location_id AND ola.agency_id IN (${placeholders})
       JOIN office_rooms r   ON r.id  = oe_rel.room_id
       JOIN office_locations ol ON ol.id = oe_rel.office_location_id
       LEFT JOIN users u_orig ON u_orig.id = oe_rel.assigned_provider_id
       JOIN office_events oe_con
         ON oe_con.room_id   = oe_rel.room_id
         AND oe_con.start_at = oe_rel.start_at
         AND oe_con.id      <> oe_rel.id
         AND oe_con.slot_state IN ('ASSIGNED_BOOKED','ASSIGNED_AVAILABLE')
         AND (oe_con.status IS NULL OR UPPER(oe_con.status) NOT IN ('CANCELLED','RELEASED'))
       LEFT JOIN users u_cur ON u_cur.id = oe_con.assigned_provider_id
       WHERE oe_rel.slot_state      = 'ASSIGNED_AVAILABLE'
         AND oe_rel.status          = 'RELEASED'
         AND oe_rel.booking_plan_id IS NULL
         AND oe_rel.start_at       >= NOW()
       ORDER BY oe_rel.start_at ASC, ol.name ASC, r.label ASC`,
      agencyIds
    );

    // ── Type 3: orphaned released — future RELEASED slot with no one else there ─
    // Provider's booking was dropped; the slot is empty now (no conflict with another
    // booked provider) but still needs to be either restored or dismissed.
    const [orphanedRows] = await pool.execute(
      `SELECT
         'orphaned_released'                                       AS conflict_type,
         oe.id                                                     AS released_event_id,
         NULL                                                      AS conflict_event_id,
         oe.room_id,
         r.name                                                    AS room_name,
         r.label                                                   AS room_label,
         r.room_number,
         ol.name                                                   AS office_name,
         oe.office_location_id,
         oe.start_at,
         oe.end_at,
         oe.assigned_provider_id                                   AS original_provider_id,
         CONCAT(u_orig.first_name, ' ', u_orig.last_name)         AS original_provider_name,
         NULL                                                      AS current_provider_id,
         NULL                                                      AS current_provider_name,
         oe.updated_at                                             AS released_at,
         oe.standing_assignment_id,
         osa.assigned_frequency
       FROM office_events oe
       JOIN office_standing_assignments osa
         ON osa.id = oe.standing_assignment_id AND osa.is_active = TRUE
       JOIN office_location_agencies ola
         ON ola.office_location_id = oe.office_location_id AND ola.agency_id IN (${placeholders})
       JOIN office_rooms r   ON r.id  = oe.room_id
       JOIN office_locations ol ON ol.id = oe.office_location_id
       LEFT JOIN users u_orig ON u_orig.id = oe.assigned_provider_id
       WHERE oe.slot_state      = 'ASSIGNED_AVAILABLE'
         AND oe.status          = 'RELEASED'
         AND oe.booking_plan_id IS NULL
         AND oe.start_at       >= NOW()
         AND NOT EXISTS (
           SELECT 1 FROM office_events oe2
           WHERE oe2.room_id    = oe.room_id
             AND oe2.start_at   = oe.start_at
             AND oe2.id        <> oe.id
             AND oe2.slot_state = 'ASSIGNED_BOOKED'
             AND (oe2.status IS NULL OR UPPER(oe2.status) NOT IN ('CANCELLED','RELEASED'))
         )
       ORDER BY oe.start_at ASC, ol.name ASC, r.label ASC`,
      agencyIds
    );

    // ── Type 2: true double-bookings — two ASSIGNED_BOOKED events same room+time ─
    const [doubleRows] = await pool.execute(
      `SELECT
         'double_booked'                                        AS conflict_type,
         oe_a.id                                                AS event_a_id,
         oe_b.id                                                AS event_b_id,
         oe_a.room_id,
         r.name                                                 AS room_name,
         r.label                                                AS room_label,
         r.room_number,
         ol.name                                                AS office_name,
         oe_a.office_location_id,
         oe_a.start_at,
         oe_a.end_at,
         oe_a.booked_provider_id                               AS provider_a_id,
         CONCAT(ua.first_name, ' ', ua.last_name)              AS provider_a_name,
         oe_b.booked_provider_id                               AS provider_b_id,
         CONCAT(ub.first_name, ' ', ub.last_name)              AS provider_b_name,
         oe_a.booking_plan_id                                   AS plan_a_id,
         oe_b.booking_plan_id                                   AS plan_b_id
       FROM office_events oe_a
       JOIN office_events oe_b
         ON  oe_b.room_id    = oe_a.room_id
         AND oe_b.start_at   = oe_a.start_at
         AND oe_b.id         > oe_a.id
         AND oe_b.slot_state = 'ASSIGNED_BOOKED'
         AND (oe_b.status IS NULL OR UPPER(oe_b.status) NOT IN ('CANCELLED','RELEASED'))
         AND oe_b.booked_provider_id IS NOT NULL
         AND oe_b.booked_provider_id <> oe_a.booked_provider_id
       JOIN office_location_agencies ola
         ON ola.office_location_id = oe_a.office_location_id AND ola.agency_id IN (${placeholders})
       JOIN office_rooms r   ON r.id  = oe_a.room_id
       JOIN office_locations ol ON ol.id = oe_a.office_location_id
       JOIN users ua ON ua.id = oe_a.booked_provider_id
       JOIN users ub ON ub.id = oe_b.booked_provider_id
       WHERE oe_a.slot_state = 'ASSIGNED_BOOKED'
         AND (oe_a.status IS NULL OR UPPER(oe_a.status) NOT IN ('CANCELLED','RELEASED'))
         AND oe_a.booked_provider_id IS NOT NULL
         AND oe_a.start_at >= NOW()
       ORDER BY oe_a.start_at ASC, ol.name ASC, r.label ASC`,
      agencyIds
    );

    const conflicts = [
      ...(restoredRows || []),
      ...(orphanedRows || []),
      ...(doubleRows || [])
    ].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

    res.json({ conflicts });
  } catch (e) {
    next(e);
  }
};

export const resolveSlotConflict = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { conflictType = 'released_vs_booked', action } = req.body || {};

    // ── Agency access helper ──────────────────────────────────────────────────
    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((n) => n > 0);
    const checkAccess = async (officeLocationId) => {
      if (!agencyIds.length) return true;
      const ph = agencyIds.map(() => '?').join(',');
      const [[row]] = await conn.execute(
        `SELECT 1 FROM office_location_agencies WHERE office_location_id = ? AND agency_id IN (${ph}) LIMIT 1`,
        [officeLocationId, ...agencyIds]
      );
      return !!row;
    };

    await conn.beginTransaction();

    if (conflictType === 'orphaned_released') {
      // ── Restore or dismiss an orphaned RELEASED slot (no one else in the slot) ─
      const { releasedEventId } = req.body || {};
      if (!releasedEventId || !['restore', 'dismiss'].includes(action)) {
        await conn.rollback();
        return res.status(400).json({ error: { message: 'releasedEventId and action (restore|dismiss) are required for orphaned_released' } });
      }
      const relId = Number(releasedEventId);
      const [[relRow]] = await conn.execute(
        `SELECT oe.*, osa.provider_id AS assignment_provider_id
         FROM office_events oe
         JOIN office_standing_assignments osa ON osa.id = oe.standing_assignment_id AND osa.is_active = TRUE
         WHERE oe.id = ? AND oe.slot_state = 'ASSIGNED_AVAILABLE' AND oe.status = 'RELEASED'
         LIMIT 1`,
        [relId]
      );
      if (!relRow) { await conn.rollback(); return res.status(404).json({ error: { message: 'Released event not found or already resolved' } }); }
      if (!(await checkAccess(relRow.office_location_id))) { await conn.rollback(); return res.status(403).json({ error: { message: 'Access denied' } }); }

      if (action === 'restore') {
        // Find or create an active booking plan for this assignment
        let [[planRow]] = await conn.execute(
          `SELECT id FROM office_booking_plans WHERE standing_assignment_id = ? AND is_active = TRUE LIMIT 1`,
          [relRow.standing_assignment_id]
        );
        if (!planRow) {
          const [[latestPlan]] = await conn.execute(
            `SELECT id FROM office_booking_plans WHERE standing_assignment_id = ? ORDER BY id DESC LIMIT 1`,
            [relRow.standing_assignment_id]
          );
          if (latestPlan) {
            await conn.execute(`UPDATE office_booking_plans SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [latestPlan.id]);
            [[planRow]] = await conn.execute(`SELECT id FROM office_booking_plans WHERE id = ? LIMIT 1`, [latestPlan.id]);
          }
        }
        const planId = planRow?.id || null;
        const providerId = Number(relRow.assignment_provider_id || relRow.assigned_provider_id || 0);
        // Restore the ENTIRE recurring series — all future orphaned events for this assignment.
        // Skip any individual occurrence that already has a different active booking (those
        // would become an immediate double-booking; they'll appear in the conflict resolver
        // as released_vs_booked and must be resolved individually).
        const [bulkResult] = await conn.execute(
          `UPDATE office_events oe
           SET oe.status = 'BOOKED', oe.slot_state = 'ASSIGNED_BOOKED',
               oe.booked_provider_id = ?, oe.booking_plan_id = ?, oe.updated_at = CURRENT_TIMESTAMP
           WHERE oe.standing_assignment_id = ?
             AND oe.slot_state = 'ASSIGNED_AVAILABLE'
             AND oe.status = 'RELEASED'
             AND oe.booking_plan_id IS NULL
             AND oe.start_at >= NOW()
             AND NOT EXISTS (
               SELECT 1 FROM (SELECT id, room_id, start_at, booked_provider_id, assigned_provider_id, status
                              FROM office_events) oe2
               WHERE oe2.room_id  = oe.room_id
                 AND oe2.start_at = oe.start_at
                 AND oe2.id      <> oe.id
                 AND (oe2.status IS NULL OR UPPER(oe2.status) NOT IN ('CANCELLED','RELEASED'))
                 AND COALESCE(oe2.booked_provider_id, oe2.assigned_provider_id) IS NOT NULL
                 AND COALESCE(oe2.booked_provider_id, oe2.assigned_provider_id) <> ?
             )`,
          [providerId || null, planId, relRow.standing_assignment_id, providerId || 0]
        );
        // Count how many occurrences were skipped due to a conflicting booking already in the slot.
        const [[skipRow]] = await conn.execute(
          `SELECT COUNT(*) AS skipped
           FROM office_events oe
           WHERE oe.standing_assignment_id = ?
             AND oe.slot_state = 'ASSIGNED_AVAILABLE'
             AND oe.status = 'RELEASED'
             AND oe.booking_plan_id IS NULL
             AND oe.start_at >= NOW()
             AND EXISTS (
               SELECT 1 FROM (SELECT id, room_id, start_at, booked_provider_id, assigned_provider_id, status
                              FROM office_events) oe2
               WHERE oe2.room_id  = oe.room_id
                 AND oe2.start_at = oe.start_at
                 AND oe2.id      <> oe.id
                 AND (oe2.status IS NULL OR UPPER(oe2.status) NOT IN ('CANCELLED','RELEASED'))
                 AND COALESCE(oe2.booked_provider_id, oe2.assigned_provider_id) IS NOT NULL
                 AND COALESCE(oe2.booked_provider_id, oe2.assigned_provider_id) <> ?
             )`,
          [relRow.standing_assignment_id, providerId || 0]
        );
        const skippedCount = Number(skipRow?.skipped || 0);
        await conn.commit();
        return res.json({
          ok: true, conflictType, action,
          releasedEventId: relId,
          standingAssignmentId: relRow.standing_assignment_id,
          restoredCount: bulkResult?.affectedRows || 0,
          skippedCount,
          skippedMessage: skippedCount > 0
            ? `${skippedCount} occurrence(s) were skipped because another provider is already booked in that slot. They will appear in the conflict resolver as individual conflicts to resolve.`
            : null
        });
      } else {
        // dismiss: mark as cancelled — the slot becomes open (single slot only)
        await conn.execute(
          `UPDATE office_events SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [relId]
        );
      }
      await conn.commit();
      return res.json({ ok: true, conflictType, action, releasedEventId: relId, standingAssignmentId: relRow.standing_assignment_id });
    }

    if (conflictType === 'double_booked') {
      // ── Two ASSIGNED_BOOKED events in same room+time. Pick which one to keep. ─
      const { eventAId, eventBId } = req.body || {};
      if (!eventAId || !eventBId || !['keep_a', 'keep_b'].includes(action)) {
        await conn.rollback();
        return res.status(400).json({ error: { message: 'eventAId, eventBId, and action (keep_a|keep_b) are required for double_booked' } });
      }
      const idA = Number(eventAId);
      const idB = Number(eventBId);

      const [[evA]] = await conn.execute(`SELECT id, office_location_id FROM office_events WHERE id = ? LIMIT 1`, [idA]);
      if (!evA) { await conn.rollback(); return res.status(404).json({ error: { message: 'Event A not found' } }); }
      if (!(await checkAccess(evA.office_location_id))) { await conn.rollback(); return res.status(403).json({ error: { message: 'Access denied' } }); }

      const cancelId = action === 'keep_a' ? idB : idA;
      await conn.execute(
        `UPDATE office_events SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [cancelId]
      );

      await conn.commit();
      return res.json({ ok: true, conflictType, action, eventAId: idA, eventBId: idB });
    }

    // ── released_vs_booked: restored slot clashing with an active booking ─────
    const { releasedEventId, conflictEventId } = req.body || {};
    if (!releasedEventId || !conflictEventId || !['restore_original', 'keep_current'].includes(action)) {
      await conn.rollback();
      return res.status(400).json({ error: { message: 'releasedEventId, conflictEventId, and action (restore_original|keep_current) are required' } });
    }

    const relId = Number(releasedEventId);
    const conId = Number(conflictEventId);
    if (!relId || !conId) { await conn.rollback(); return res.status(400).json({ error: { message: 'Invalid event IDs' } }); }

    const [[relRows]] = await conn.execute(
      `SELECT oe.*, osa.provider_id AS assignment_provider_id
       FROM office_events oe
       JOIN office_standing_assignments osa ON osa.id = oe.standing_assignment_id AND osa.is_active = TRUE
       WHERE oe.id = ? AND oe.slot_state = 'ASSIGNED_AVAILABLE' AND oe.status = 'RELEASED' AND oe.booking_plan_id IS NULL
       LIMIT 1`,
      [relId]
    );
    if (!relRows) { await conn.rollback(); return res.status(404).json({ error: { message: 'Released event not found or already resolved' } }); }
    if (!(await checkAccess(relRows.office_location_id))) { await conn.rollback(); return res.status(403).json({ error: { message: 'Access denied' } }); }

    if (action === 'restore_original') {
      let [[planRow]] = await conn.execute(
        `SELECT id FROM office_booking_plans WHERE standing_assignment_id = ? AND is_active = TRUE LIMIT 1`,
        [relRows.standing_assignment_id]
      );
      if (!planRow) {
        const [[latestPlan]] = await conn.execute(
          `SELECT id FROM office_booking_plans WHERE standing_assignment_id = ? AND is_active = FALSE ORDER BY id DESC LIMIT 1`,
          [relRows.standing_assignment_id]
        );
        if (latestPlan) {
          await conn.execute(`UPDATE office_booking_plans SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [latestPlan.id]);
          [[planRow]] = await conn.execute(`SELECT id FROM office_booking_plans WHERE id = ? LIMIT 1`, [latestPlan.id]);
        }
      }
      const planId = planRow?.id || null;
      const providerId = Number(relRows.assignment_provider_id || relRows.assigned_provider_id || 0);
      await conn.execute(
        `UPDATE office_events SET status = 'BOOKED', slot_state = 'ASSIGNED_BOOKED',
         booked_provider_id = ?, booking_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerId || null, planId, relId]
      );
      await conn.execute(`UPDATE office_events SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [conId]);
    } else {
      await conn.execute(`UPDATE office_events SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [relId]);
    }

    await conn.commit();
    res.json({ ok: true, conflictType, action, releasedEventId: relId, conflictEventId: conId });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    next(e);
  } finally {
    conn.release();
  }
};

// ── Schedule audit: full dump of all office events + standing assignments ──────
// Returns every future event (and ASSIGNED_AVAILABLE) for the next `weeks` weeks
// so an admin can review/print the entire schedule state manually.
export const getScheduleAudit = async (req, res, next) => {
  try {
    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((n) => n > 0);
    if (!agencyIds.length) return res.json({ rows: [] });

    // fromDate defaults to 6 months ago; toDate defaults to 12 weeks ahead
    const fromDate = req.query.fromDate
      ? req.query.fromDate
      : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = req.query.toDate
      ? req.query.toDate
      : new Date(Date.now() + 84 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const placeholders = agencyIds.map(() => '?').join(',');

    const [eventRows] = await pool.execute(
      `SELECT
         oe.id                                                     AS event_id,
         ol.name                                                   AS office_name,
         r.name                                                    AS room_name,
         r.label                                                   AS room_label,
         r.room_number,
         oe.start_at,
         oe.end_at,
         oe.slot_state,
         oe.status,
         oe.updated_at                                             AS event_updated_at,
         oe.booking_plan_id,
         oe.standing_assignment_id,
         oe.assigned_provider_id,
         CONCAT(ua.first_name, ' ', ua.last_name)                 AS assigned_provider_name,
         oe.booked_provider_id,
         CONCAT(ub.first_name, ' ', ub.last_name)                 AS booked_provider_name,
         osa.assigned_frequency,
         osa.is_active                                             AS assignment_active,
         bp.is_active                                              AS plan_active
       FROM office_events oe
       JOIN office_rooms r    ON r.id  = oe.room_id
       JOIN office_locations ol ON ol.id = oe.office_location_id
       JOIN office_location_agencies ola
         ON ola.office_location_id = oe.office_location_id
         AND ola.agency_id IN (${placeholders})
       LEFT JOIN users ua ON ua.id = oe.assigned_provider_id
       LEFT JOIN users ub ON ub.id = oe.booked_provider_id
       LEFT JOIN office_standing_assignments osa ON osa.id = oe.standing_assignment_id
       LEFT JOIN office_booking_plans bp ON bp.id = oe.booking_plan_id
       WHERE oe.start_at >= ?
         AND oe.start_at <= ?
         AND (oe.status IS NULL OR UPPER(oe.status) NOT IN ('CANCELLED'))
       ORDER BY oe.start_at ASC, ol.name ASC, r.room_number ASC, r.name ASC`,
      [...agencyIds, fromDate, toDate]
    );

    res.json({ rows: eventRows || [], fromDate, toDate });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// ICS Coverage Flags
// ---------------------------------------------------------------------------

/**
 * GET /api/office-schedule/coverage-flags
 * Returns all past ASSIGNED_BOOKED events with a non-null ics_flag_type,
 * grouped by provider, for admin review.
 */
export const getCoverageFlags = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });

    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((n) => n > 0);
    if (!agencyIds.length) return res.json({ flags: [] });

    const ph = agencyIds.map(() => '?').join(',');

    const [rows] = await pool.execute(
      `SELECT
         e.id                AS event_id,
         e.start_at,
         e.end_at,
         e.slot_state,
         e.ics_flag_type,
         e.ics_flagged_at,
         e.ics_flag_cleared_at,
         e.ics_flag_cleared_by_user_id,
         e.last_ics_overlap_at,
         e.standing_assignment_id,
         e.assigned_provider_id,
         CONCAT(u.first_name, ' ', u.last_name) AS provider_name,
         ol.id               AS office_location_id,
         ol.name             AS office_name,
         r.id                AS room_id,
         r.name              AS room_name,
         r.label             AS room_label
       FROM office_events e
       JOIN office_rooms r    ON r.id  = e.room_id
       JOIN office_locations ol ON ol.id = e.office_location_id
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id IN (${ph})
       JOIN users u ON u.id = e.assigned_provider_id
       WHERE e.ics_flag_type IS NOT NULL
         AND e.ics_flag_cleared_at IS NULL
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
       ORDER BY e.assigned_provider_id ASC, e.start_at ASC`,
      agencyIds
    );

    res.json({ flags: rows || [] });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/office-schedule/coverage-flags/:eventId/keep
 * Admin clears the coverage flag (keeps the booking as-is).
 */
export const keepCoverageFlag = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: 'Invalid event ID' });

    await pool.execute(
      `UPDATE office_events
       SET ics_flag_type = NULL,
           ics_flag_cleared_by_user_id = ?,
           ics_flag_cleared_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, eventId]
    );

    res.json({ ok: true, eventId, action: 'kept' });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/office-schedule/coverage-flags/:eventId/release
 * Admin releases the flagged hours — sets event to RELEASED / ASSIGNED_AVAILABLE
 * so another provider can be assigned, and clears the flag.
 */
export const releaseCoverageFlag = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: 'Invalid event ID' });

    const [[event]] = await pool.execute(
      `SELECT id, office_location_id, standing_assignment_id, assigned_provider_id, booking_plan_id
       FROM office_events WHERE id = ? LIMIT 1`,
      [eventId]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    await pool.execute(
      `UPDATE office_events
       SET status = 'RELEASED',
           slot_state = 'ASSIGNED_AVAILABLE',
           booked_provider_id = NULL,
           booking_plan_id = NULL,
           ics_flag_type = NULL,
           ics_flag_cleared_by_user_id = ?,
           ics_flag_cleared_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, eventId]
    );

    try {
      await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId: eventId });
    } catch {
      // best-effort
    }

    res.json({ ok: true, eventId, action: 'released' });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/office-schedule/ehr-sync/health
 * Returns recent EHR sync run stats per location so admins can see if feeds are healthy.
 */
export const getEhrSyncHealthEndpoint = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });
    const officeLocationId = req.query.officeLocationId ? parseInt(req.query.officeLocationId, 10) : null;
    const result = await getEhrSyncHealth({ officeLocationId });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
/**
 * GET /office-schedule/locations/:locationId/debug-events?weekStart=YYYY-MM-DD
 * Super-admin-only raw DB dump: standing assignments + office_events for the requested week.
 * Diagnoses "I assigned a slot but it doesn't show" without needing direct DB access.
 */
export const debugEventsForWeek = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
    const locationId = parseInt(req.params.locationId, 10);
    if (!locationId) return res.status(400).json({ error: 'Invalid locationId' });
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = normalizeYmd(weekStartRaw);
    if (!weekStart) return res.status(400).json({ error: 'weekStart must be YYYY-MM-DD' });
    const weekEnd = addDays(weekStart, 7);
    const windowStart = `${weekStart} 00:00:00`;
    const windowEnd = `${weekEnd} 00:00:00`;

    const [assignments] = await pool.execute(
      `SELECT a.id, a.provider_id, a.room_id, a.weekday, a.hour,
              a.assigned_frequency, a.availability_mode, a.is_active,
              a.available_since_date, a.temporary_until_date,
              a.recurrence_group_id,
              u.first_name, u.last_name, u.role AS user_role,
              u.is_active AS user_is_active, u.is_archived AS user_is_archived
       FROM office_standing_assignments a
       JOIN users u ON u.id = a.provider_id
       WHERE a.office_location_id = ?`,
      [locationId]
    );
    const [events] = await pool.execute(
      `SELECT e.id, e.room_id, e.start_at, e.end_at, e.status, e.slot_state,
              e.standing_assignment_id, e.booking_plan_id,
              e.assigned_provider_id, e.booked_provider_id,
              e.created_at, e.updated_at
       FROM office_events e
       WHERE e.office_location_id = ?
         AND e.start_at < ?
         AND e.end_at > ?
       ORDER BY e.start_at, e.room_id`,
      [locationId, windowEnd, windowStart]
    );
    const [cancelledThisWeek] = await pool.execute(
      `SELECT e.id, e.room_id, e.start_at, e.status, e.slot_state, e.standing_assignment_id
       FROM office_events e
       WHERE e.office_location_id = ?
         AND e.start_at < ?
         AND e.end_at > ?
         AND UPPER(COALESCE(e.status,'')) = 'CANCELLED'
       ORDER BY e.start_at`,
      [locationId, windowEnd, windowStart]
    );
    return res.json({
      weekStart,
      weekEnd,
      locationId,
      activeAssignments: (assignments || []).filter((a) => a.is_active),
      inactiveAssignments: (assignments || []).filter((a) => !a.is_active),
      activeEvents: events || [],
      cancelledEventsThisWeek: cancelledThisWeek || []
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/office-schedule/locations/:locationId/run-coverage-audit
 * Manually trigger the ICS coverage audit for one location.
 */
export const runCoverageAudit = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });
    const officeLocationId = parseInt(req.params.locationId, 10);
    if (!officeLocationId) return res.status(400).json({ error: 'Invalid location ID' });
    const result = await auditIcsCoverageForLocation({ officeLocationId, actorUserId: req.user.id });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/office-schedule/watchdog/run-coverage-audit
 * Manually trigger the ICS coverage audit for all locations.
 */
export const runAllLocationsCoverageAudit = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });
    const result = await auditIcsCoverageAllLocations({ actorUserId: req.user.id });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /office-schedule/provider-schedule-list?userId=X
 * Returns all active standing office assignments for the given provider (list view).
 * Admins/staff can query any userId; regular users can only query themselves.
 */
export const getProviderScheduleList = async (req, res, next) => {
  try {
    const isManager = canManageSchedule(req.user?.role);
    let targetUserId = Number(req.query.userId || req.user.id);
    if (!isManager) targetUserId = Number(req.user.id);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid userId' });

    const [[userRow], [assignments]] = await Promise.all([
      pool.execute(`SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`, [targetUserId]),
      pool.execute(
        `SELECT
           a.id,
           a.office_location_id,
           a.room_id,
           a.weekday,
           a.hour,
           a.assigned_frequency,
           a.availability_mode,
           a.available_since_date,
           a.temporary_until_date,
           a.is_active,
           r.name  AS room_name,
           r.room_number,
           r.label AS room_label,
           ol.name AS office_name
         FROM office_standing_assignments a
         JOIN office_rooms r         ON r.id  = a.room_id
         JOIN office_locations ol    ON ol.id = a.office_location_id
         WHERE a.provider_id = ?
           AND a.is_active   = TRUE
         ORDER BY ol.name ASC, a.weekday ASC, a.hour ASC`,
        [targetUserId]
      )
    ]);

    const user = userRow[0] || null;
    const userName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '';

    const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const freqLabel = (f) => {
      if (f === 'WEEKLY') return 'Weekly';
      if (f === 'BIWEEKLY') return 'Biweekly';
      return f || '';
    };
    const hourToLabel = (h) => {
      const n = Number(h);
      if (!Number.isFinite(n)) return '';
      if (n === 0) return '12 AM';
      if (n < 12) return `${n} AM`;
      if (n === 12) return '12 PM';
      return `${n - 12} PM`;
    };

    return res.json({
      userId: targetUserId,
      userName,
      assignments: (assignments || []).map((a) => ({
        id: a.id,
        officeLocationId: a.office_location_id,
        officeName: a.office_name || '',
        roomId: a.room_id,
        roomName: a.room_name || '',
        roomNumber: a.room_number || null,
        roomLabel: a.room_label || a.room_name || '',
        weekday: Number(a.weekday),
        weekdayName: WEEKDAY_NAMES[Number(a.weekday)] || `Day ${a.weekday}`,
        hour: Number(a.hour),
        hourLabel: hourToLabel(a.hour),
        assignedFrequency: String(a.assigned_frequency || '').toUpperCase(),
        frequencyLabel: freqLabel(String(a.assigned_frequency || '').toUpperCase()),
        availabilityMode: String(a.availability_mode || '').toUpperCase(),
        availableSinceDate: a.available_since_date ? new Date(a.available_since_date).toISOString().slice(0, 10) : null,
        temporaryUntilDate: a.temporary_until_date ? new Date(a.temporary_until_date).toISOString().slice(0, 10) : null,
        isActive: Boolean(a.is_active)
      }))
    });
  } catch (e) {
    next(e);
  }
};
