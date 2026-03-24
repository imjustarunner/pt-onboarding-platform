import pool from '../config/database.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import User from '../models/User.model.js';
import UserExternalCalendar from '../models/UserExternalCalendar.model.js';
import ExternalBusyCalendarService from './externalBusyCalendar.service.js';
import GoogleCalendarService from './googleCalendar.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

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

function localYmdInTz(dateLike, timeZone) {
  try {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return '';
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

/**
 * For each ASSIGNED_AVAILABLE / ASSIGNED_TEMPORARY office occurrence in the window, if the
 * provider's Therapy Notes / external ICS busy blocks overlap that slot, mark the occurrence
 * booked and ensure an active booking plan exists (same behavior as the admin "Refresh
 * Therapy Notes-linked room bookings" action).
 */
export async function refreshLocationBookingsFromEhr({ officeLocationId, actorUserId }) {
  const officeId = parseInt(officeLocationId, 10);
  const actorId = parseInt(actorUserId, 10) || 1;
  if (!officeId) return { ok: false, reason: 'invalid_location' };

  const loc = await OfficeLocation.findById(officeId);
  if (!loc) return { ok: false, reason: 'location_not_found' };

  const officeTimeZone = isValidTimeZone(loc?.timezone) ? String(loc.timezone) : 'America/New_York';
  const todayYmdProviderTz = localYmdInTz(new Date(), officeTimeZone);
  const windowStartYmd = String(todayYmdProviderTz || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const windowEndYmdExclusive = OfficeScheduleMaterializer.addDays(windowStartYmd, 43);
  const windowStartWall = `${windowStartYmd} 00:00:00`;
  const windowEndWall = `${windowEndYmdExclusive} 00:00:00`;

  for (let i = 0; i <= 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await OfficeScheduleMaterializer.materializeWeek({
      officeLocationId: officeId,
      weekStartRaw: OfficeScheduleMaterializer.addDays(windowStartYmd, i * 7),
      createdByUserId: actorId
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
    [officeId, windowStartWall, windowEndWall]
  );

  const events = (assignedRows || []).filter((r) => Number(r.assigned_provider_id || r.booked_provider_id || 0) > 0);
  if (!events.length) {
    return { ok: true, officeLocationId: officeId, scannedAssigned: 0, bookedFromEhr: 0, touchedProviders: 0, bookingPlansReset: 0 };
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
      const activeUntilDate = OfficeScheduleMaterializer.addDays(seed.startAt, 42);
      // eslint-disable-next-line no-await-in-loop
      await OfficeBookingPlan.upsertActive({
        standingAssignmentId: sid,
        bookedFrequency,
        bookingStartDate: seed.startAt,
        activeUntilDate,
        bookedOccurrenceCount: null,
        createdByUserId: actorId,
        bookingOrigin: 'ehr_sync'
      });
      bookingPlansReset += 1;
    }
  }

  return {
    ok: true,
    officeLocationId: officeId,
    scannedAssigned: events.length,
    bookedFromEhr,
    touchedProviders: providerIds.length,
    bookingPlansReset,
    windowStart: windowStartWall,
    windowEnd: windowEndWall
  };
}

/**
 * Run Therapy Notes overlap booking for every active office location (daily watchdog).
 */
export async function refreshAllLocationsFromEhr({ actorUserId = 1 } = {}) {
  const actorId = parseInt(actorUserId, 10) || 1;
  let locations = [];
  try {
    locations = await OfficeLocation.listAll({ includeInactive: false });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: false, reason: 'office_tables_missing', locations: 0, results: [] };
    throw e;
  }

  const results = [];
  for (const loc of locations || []) {
    const id = Number(loc?.id || 0);
    if (!id) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await refreshLocationBookingsFromEhr({ officeLocationId: id, actorUserId: actorId });
      results.push({ officeLocationId: id, ...r });
    } catch (e) {
      results.push({ officeLocationId: id, ok: false, error: String(e?.message || e) });
    }
  }

  const bookedFromEhr = results.reduce((s, r) => s + (Number(r.bookedFromEhr) || 0), 0);
  return { ok: true, locations: results.length, bookedFromEhr, results };
}

async function providerHasExternalBusyFeeds(providerId) {
  const pid = Number(providerId || 0);
  if (!pid) return { ok: false, hasFeeds: false };
  const calendars = await UserExternalCalendar.listForUser({ userId: pid, includeFeeds: true, activeOnly: true });
  for (const c of calendars || []) {
    for (const f of c?.feeds || []) {
      if (String(f?.icsUrl || '').trim() && f?.isActive !== false) return { ok: true, hasFeeds: true };
    }
  }
  const provider = await User.findById(pid);
  const legacy = String(provider?.external_busy_ics_url || provider?.externalBusyIcsUrl || '').trim();
  if (legacy) return { ok: true, hasFeeds: true };
  return { ok: true, hasFeeds: false };
}

async function loadBusyForProviderWindow({ providerId, weekStartYmd, timeMinIso, timeMaxIso }) {
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
    const r = await ExternalBusyCalendarService.getBusyForFeeds({
      userId: providerId,
      weekStart: String(weekStartYmd || new Date().toISOString().slice(0, 10)).slice(0, 10),
      feeds,
      timeMinIso,
      timeMaxIso
    });
    if (!r?.ok && r?.reason === 'all_feeds_failed') {
      return { ok: false, reason: 'all_feeds_failed', busy: [] };
    }
    if (r?.ok) busy.push(...(r.busy || []));
  }

  const provider = await User.findById(providerId);
  const legacyIcsUrl = String(provider?.external_busy_ics_url || provider?.externalBusyIcsUrl || '').trim();
  if (legacyIcsUrl) {
    const r = await ExternalBusyCalendarService.getBusyForWeek({
      userId: providerId,
      weekStart: String(weekStartYmd || new Date().toISOString().slice(0, 10)).slice(0, 10),
      icsUrl: legacyIcsUrl,
      timeMinIso,
      timeMaxIso
    });
    if (r?.ok) busy.push(...(r.busy || []));
  }

  return { ok: true, busy };
}

function userBookingGraceStillActive(userBookingConfirmedAt) {
  const raw = userBookingConfirmedAt;
  if (raw === null || raw === undefined) return false;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return false;
  const graceMs = 42 * 24 * 60 * 60 * 1000;
  return Date.now() < t + graceMs;
}

/**
 * When the last two past booked occurrences have no overlap with Therapy Notes / external ICS
 * busy time: deactivate the booking plan and set occurrences to ASSIGNED_AVAILABLE.
 * — ehr_sync plans: apply as soon as both checks fail (same cadence as the prior 2-occurrence warning).
 * — user plans: only after user_booking_confirmed_at + 6 weeks (42 days), so provider-marked
 *   bookings bypass TN checks for that window.
 * Requires at least one ICS feed (same as overlap refresh); otherwise we cannot verify TN and skip.
 */
export async function downgradeBookedWithoutExternalOverlap({ actorUserId = 1 } = {}) {
  const actorId = parseInt(actorUserId, 10) || 1;
  let rows = [];
  try {
    const [r] = await pool.execute(
      `SELECT
         e.id,
         e.standing_assignment_id,
         e.start_at,
         e.end_at,
         e.assigned_provider_id,
         e.office_location_id,
         bp.booking_origin,
         bp.user_booking_confirmed_at,
         ol.name AS office_name,
         r.name AS room_name,
         r.label AS room_label
       FROM office_events e
       JOIN office_booking_plans bp ON bp.id = e.booking_plan_id AND bp.is_active = TRUE
       JOIN office_standing_assignments osa ON osa.id = e.standing_assignment_id AND osa.is_active = TRUE
       JOIN office_locations ol ON ol.id = e.office_location_id
       JOIN office_rooms r ON r.id = e.room_id
       WHERE e.slot_state = 'ASSIGNED_BOOKED'
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         AND e.start_at >= DATE_SUB(NOW(), INTERVAL 120 DAY)
         AND e.start_at < NOW()
       ORDER BY e.standing_assignment_id ASC, e.start_at DESC`
    );
    rows = r || [];
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return { ok: false, reason: 'office_tables_missing', downgraded: 0 };
    }
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return { ok: false, reason: 'booking_origin_columns_missing', downgraded: 0 };
    }
    throw e;
  }

  const byAssignment = new Map();
  for (const row of rows) {
    const sid = Number(row.standing_assignment_id || 0);
    if (!sid) continue;
    if (!byAssignment.has(sid)) byAssignment.set(sid, []);
    const list = byAssignment.get(sid);
    if (list.length < 2) list.push(row);
  }

  let downgraded = 0;
  for (const [standingAssignmentId, lastTwo] of byAssignment.entries()) {
    if (lastTwo.length < 2) continue;

    const providerId = Number(lastTwo[0]?.assigned_provider_id || 0);
    if (!providerId) continue;

    const feedCheck = await providerHasExternalBusyFeeds(providerId);
    if (!feedCheck.hasFeeds) continue;

    const origin = String(lastTwo[0]?.booking_origin || 'ehr_sync').toLowerCase();
    const ubc = lastTwo[0]?.user_booking_confirmed_at;
    if (origin === 'user' && userBookingGraceStillActive(ubc)) {
      continue;
    }

    const assignment = await OfficeStandingAssignment.findById(standingAssignmentId);
    if (!assignment || !assignment.is_active) continue;

    const loc = await OfficeLocation.findById(Number(assignment.office_location_id || 0));
    const officeTz = isValidTimeZone(loc?.timezone) ? String(loc.timezone) : 'America/New_York';
    const providerTimeZone = await resolveProviderTimeZone({ providerId, fallbackTimeZone: officeTz });

    const todayYmd = new Date().toISOString().slice(0, 10);
    const windowStartYmd = OfficeScheduleMaterializer.addDays(todayYmd, -120);
    const windowStartWall = `${windowStartYmd} 00:00:00`;
    const startParts = parseMySqlDateTimeParts(windowStartWall);
    const timeMinIso = startParts
      ? zonedWallTimeToUtc({ ...startParts, timeZone: providerTimeZone }).toISOString()
      : `${windowStartYmd}T00:00:00Z`;
    const timeMaxIso = new Date().toISOString();

    const busyPack = await loadBusyForProviderWindow({
      providerId,
      weekStartYmd: windowStartYmd,
      timeMinIso,
      timeMaxIso
    });
    if (!busyPack.ok) continue;

    const busy = busyPack.busy || [];
    let bothMissing = true;
    for (const ev of lastTwo) {
      const eventStartMs = utcMsForWallMySqlDateTime(ev.start_at, providerTimeZone);
      const eventEndMs = utcMsForWallMySqlDateTime(ev.end_at, providerTimeZone);
      if (!Number.isFinite(eventStartMs) || !Number.isFinite(eventEndMs)) {
        bothMissing = false;
        break;
      }
      const hasMatch = busy.some((b) => {
        const bs = new Date(b.startAt).getTime();
        const be = new Date(b.endAt).getTime();
        return intervalsOverlap(eventStartMs, eventEndMs, bs, be);
      });
      if (hasMatch) {
        bothMissing = false;
        break;
      }
    }

    if (!bothMissing) continue;

    const agencies = await User.getAgencies(providerId);
    const agencyId = Number(agencies?.[0]?.id || 0);
    if (!agencyId) continue;

    const officeName = String(lastTwo[0]?.office_name || '').trim() || 'Office';
    const roomLabel = String(lastTwo[0]?.room_label || lastTwo[0]?.room_name || '').trim() || 'Room';

    const [evRows] = await pool.execute(
      `SELECT id
       FROM office_events
       WHERE standing_assignment_id = ?
         AND slot_state = 'ASSIGNED_BOOKED'
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
      [standingAssignmentId]
    );
    const eventIds = (evRows || []).map((x) => Number(x.id)).filter((n) => Number.isInteger(n) && n > 0);

    for (const eid of eventIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId: eid });
      } catch {
        // best-effort
      }
    }

    await OfficeBookingPlan.deactivateByAssignmentId(standingAssignmentId);

    if (eventIds.length) {
      await pool.execute(
        `UPDATE office_events
         SET status = 'RELEASED',
             slot_state = 'ASSIGNED_AVAILABLE',
             booked_provider_id = NULL,
             booking_plan_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE standing_assignment_id = ?
           AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
           AND id IN (${eventIds.map(() => '?').join(',')})`,
        [standingAssignmentId, ...eventIds]
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      await OfficeStandingAssignment.update(standingAssignmentId, {
        available_since_date: todayStr,
        last_two_week_confirmed_at: new Date()
      });
    } catch {
      // ignore
    }

    try {
      await createNotificationAndDispatch({
        type: 'office_schedule_booked_reverted_no_tn',
        severity: 'warning',
        title: 'Office slot set back to available',
        message: `Your recurring office slot (${officeName} • ${roomLabel}) was marked booked, but Therapy Notes did not show overlapping appointments for the last two occurrences. It has been set to assigned available. Open My Schedule → Office to mark it booked again if it should stay reserved.`,
        userId: providerId,
        agencyId,
        relatedEntityType: 'office_standing_assignment',
        relatedEntityId: standingAssignmentId,
        actorUserId: actorId,
        actorSource: 'Office Scheduling'
      });
    } catch {
      // ignore
    }

    downgraded += 1;
  }

  return { ok: true, downgraded, assignmentsChecked: byAssignment.size };
}

export default {
  refreshLocationBookingsFromEhr,
  refreshAllLocationsFromEhr,
  downgradeBookedWithoutExternalOverlap
};
