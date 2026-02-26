import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserExternalCalendar from '../models/UserExternalCalendar.model.js';
import ExternalBusyCalendarService from './externalBusyCalendar.service.js';
import GoogleCalendarService from './googleCalendar.service.js';
import ProviderVirtualWorkingHours from '../models/ProviderVirtualWorkingHours.model.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import { mergeIntervals, subtractInterval, subtractIntervals, slotizeIntervals } from '../utils/intervals.js';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function localYmd(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10));
}

function startOfWeekMondayYmd(dateStr) {
  const d = new Date(`${String(dateStr || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return localYmd(d);
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return localYmd(d);
}

function dayIndex(dayOfWeek) {
  return DAY_ORDER.indexOf(String(dayOfWeek || '').trim());
}

function parseMySqlDateTime(s) {
  if (s instanceof Date) {
    if (Number.isNaN(s.getTime())) return null;
    // DATETIME is stored as wall-clock; when driver returns Date, UTC parts preserve numeric wall components.
    return {
      year: s.getUTCFullYear(),
      month: s.getUTCMonth() + 1,
      day: s.getUTCDate(),
      hour: s.getUTCHours(),
      minute: s.getUTCMinutes(),
      second: s.getUTCSeconds()
    };
  }
  // "YYYY-MM-DD HH:MM:SS"
  const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10),
    second: parseInt(m[6] || '0', 10)
  };
}

function parseTimeHHMM(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10), second: 0 };
}

function tzPartsToUtcDate(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0));
}

function getTimeZoneOffsetMs(date, timeZone) {
  // Returns offset such that: utcMs = localWallClockMs + offset
  // We derive the offset by formatting the date in the target tz, then interpreting those parts as UTC.
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
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    parseInt(map.hour, 10),
    parseInt(map.minute, 10),
    parseInt(map.second, 10)
  ));
  return date.getTime() - asUtc.getTime();
}

function zonedWallTimeToUtc({ year, month, day, hour, minute, second = 0, timeZone }) {
  // Iterative conversion to handle DST transitions.
  const tz = String(timeZone || '').trim() || 'America/New_York';
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 2; i++) {
    const offset = getTimeZoneOffsetMs(guess, tz);
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second) + offset);
  }
  return guess;
}

function ymdDayTimeToUtc({ ymd, dayOfWeek, hhmm, timeZone }) {
  const idx = dayIndex(dayOfWeek);
  if (idx < 0) return null;
  const dateYmd = addDaysYmd(ymd, idx);
  const dp = parseMySqlDateTime(`${dateYmd} 00:00:00`);
  const tp = parseTimeHHMM(hhmm);
  if (!dp || !tp) return null;
  return zonedWallTimeToUtc({
    year: dp.year,
    month: dp.month,
    day: dp.day,
    hour: tp.hour,
    minute: tp.minute,
    second: 0,
    timeZone
  });
}

export class ProviderAvailabilityService {
  static async resolveAgencyTimeZone({ agencyId }) {
    // Best-effort: pick the first active office location timezone for this agency.
    try {
      const [rows] = await pool.execute(
        `SELECT ol.timezone
         FROM office_locations ol
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id
         WHERE ola.agency_id = ?
           AND ol.is_active = TRUE
         ORDER BY ol.id ASC
         LIMIT 1`,
        [Number(agencyId)]
      );
      const tz = String(rows?.[0]?.timezone || '').trim();
      if (tz) return tz;
    } catch {
      // ignore
    }
    return 'America/New_York';
  }

  static async computeWeekAvailability({
    agencyId,
    providerId,
    weekStartYmd,
    includeGoogleBusy = true,
    includeExternalBusy = true,
    externalCalendarIds = [],
    slotMinutes = 60,
    intakeOnly = false,
    materializeOfficeEvents = true
  }) {
    const aid = Number(agencyId || 0);
    const pid = Number(providerId || 0);
    const wsRaw = String(weekStartYmd || '').slice(0, 10);
    if (!aid || !pid) throw new Error('Invalid agencyId/providerId');
    if (!isValidYmd(wsRaw)) throw new Error('weekStartYmd must be YYYY-MM-DD');

    const weekStart = startOfWeekMondayYmd(wsRaw);
    if (!weekStart) throw new Error('weekStartYmd must be YYYY-MM-DD');
    const weekEnd = addDaysYmd(weekStart, 7);

    // Ensure office_events exist for assigned office slots before availability reads.
    // This keeps intake availability consistent for weeks not yet materialized by the schedule UI/watchdog.
    // NOTE: some callers aggregate many providers (e.g. intake-cards) and should materialize once at the controller layer.
    if (materializeOfficeEvents) {
      try {
        const [officeRows] = await pool.execute(
          `SELECT DISTINCT ola.office_location_id
           FROM office_location_agencies ola
           JOIN office_locations ol ON ol.id = ola.office_location_id
           WHERE ola.agency_id = ?
             AND ol.is_active = TRUE`,
          [aid]
        );
        const officeIds = (officeRows || [])
          .map((r) => Number(r.office_location_id))
          .filter((n) => Number.isInteger(n) && n > 0);
        const materializeWeekAnchors = [weekStart, addDaysYmd(weekStart, 6)];
        for (const officeLocationId of officeIds) {
          for (const anchor of materializeWeekAnchors) {
            // eslint-disable-next-line no-await-in-loop
            await OfficeScheduleMaterializer.materializeWeek({
              officeLocationId,
              weekStartRaw: anchor,
              createdByUserId: pid
            });
          }
        }
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    const tz = await this.resolveAgencyTimeZone({ agencyId: aid });

    // Window for external busy (absolute instants)
    const timeMinIso = `${weekStart}T00:00:00Z`;
    const timeMaxIso = `${weekEnd}T00:00:00Z`;

    const provider = await User.findById(pid);
    if (!provider) throw new Error('Provider not found');

    const intakeOnlyFlag =
      intakeOnly === true || intakeOnly === 1 || intakeOnly === '1' || String(intakeOnly || '').toLowerCase() === 'true';

    // 1) Virtual base from weekly template
    const virtualRows = await ProviderVirtualWorkingHours.listForProvider({ agencyId: aid, providerId: pid });
    const virtualBase = [];
    for (const r of virtualRows || []) {
      const s = ymdDayTimeToUtc({ ymd: weekStart, dayOfWeek: r.dayOfWeek, hhmm: r.startTime, timeZone: tz });
      const e = ymdDayTimeToUtc({ ymd: weekStart, dayOfWeek: r.dayOfWeek, hhmm: r.endTime, timeZone: tz });
      if (s && e && e > s) {
        const sessionType = String(r.sessionType || 'REGULAR').toUpperCase();
        if (intakeOnlyFlag && !['INTAKE', 'BOTH'].includes(sessionType)) continue;
        virtualBase.push({
          start: s,
          end: e,
          meta: {
            sessionType,
            frequency: String(r.frequency || 'WEEKLY').toUpperCase()
          }
        });
      }
    }

    // 2) School scheduled hours block both modalities
    let schoolAssignments = [];
    try {
      const [rows] = await pool.execute(
        `SELECT psa.day_of_week, psa.start_time, psa.end_time
         FROM provider_school_assignments psa
         JOIN organization_affiliations oa ON oa.organization_id = psa.school_organization_id AND oa.agency_id = ? AND oa.is_active = TRUE
         WHERE psa.provider_user_id = ?
           AND psa.is_active = TRUE`,
        [aid, pid]
      );
      schoolAssignments = (rows || []).map((r) => ({
        dayOfWeek: r.day_of_week,
        startTime: String(r.start_time || '').slice(0, 5),
        endTime: String(r.end_time || '').slice(0, 5)
      }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      schoolAssignments = [];
    }
    const schoolBusy = [];
    for (const r of schoolAssignments || []) {
      const s = ymdDayTimeToUtc({ ymd: weekStart, dayOfWeek: r.dayOfWeek, hhmm: r.startTime, timeZone: tz });
      const e = ymdDayTimeToUtc({ ymd: weekStart, dayOfWeek: r.dayOfWeek, hhmm: r.endTime, timeZone: tz });
      if (s && e && e > s) schoolBusy.push({ start: s, end: e });
    }

    // 3) Office events: base availability for in-person + reserved blocks to prevent virtual overlap
    const officeBase = [];
    const officeReservedBusy = [];
    const officeBookedBusy = [];
    const pushOfficeRows = (rows, legacyNoToggle = false) => {
      for (const r of rows || []) {
        const st = parseMySqlDateTime(r.start_at);
        const en = parseMySqlDateTime(r.end_at);
        const tzEvent = String(r.building_timezone || '').trim() || tz;
        if (!st || !en) continue;
        const s = zonedWallTimeToUtc({ ...st, timeZone: tzEvent });
        const e = zonedWallTimeToUtc({ ...en, timeZone: tzEvent });
        if (!(e > s)) continue;

        // Normalize office_event state across older/newer schemas.
        // Some records rely on status ('RELEASED' / 'BOOKED') without slot_state populated.
        let slotState = String(r.slot_state || '').toUpperCase();
        const status = String(r.status || '').toUpperCase();
        if (!slotState) {
          if (status === 'BOOKED') slotState = 'ASSIGNED_BOOKED';
          else if (status === 'RELEASED') slotState = 'ASSIGNED_AVAILABLE';
        }
        const meta = {
          officeEventId: Number(r.id),
          buildingId: Number(r.office_location_id),
          buildingName: String(r.building_name || '').trim() || null,
          roomId: Number(r.room_id),
          roomLabel: String(r.room_label || r.room_name || r.room_number || '').trim() || null,
          slotState: slotState || null,
          status: status || null,
          timeZone: tzEvent,
          inPersonIntakeEnabled
        };

        // Any office reservation means provider is not virtually available during that time.
        officeReservedBusy.push({ start: s, end: e });

        const inPersonIntakeEnabled = legacyNoToggle ? true : Number(r.in_person_intake_enabled || 0) === 1;
        const isOpenAssignmentState = slotState === 'ASSIGNED_AVAILABLE' || slotState === 'ASSIGNED_TEMPORARY';
        const isBookedState = slotState === 'ASSIGNED_BOOKED' || status === 'BOOKED';
        // For intake availability, only advertise open in-person slots (not booked).
        const includeInPersonForIntake = intakeOnlyFlag && inPersonIntakeEnabled && isOpenAssignmentState;
        if ((isOpenAssignmentState && !intakeOnlyFlag) || includeInPersonForIntake) {
          officeBase.push({ start: s, end: e, meta });
        }
        if (isBookedState) {
          officeBookedBusy.push({ start: s, end: e });
        }
      }
    };
    try {
      const [rows] = await pool.execute(
        `SELECT
           e.id,
           e.start_at,
           e.end_at,
           e.status,
           e.slot_state,
           EXISTS(
             SELECT 1
             FROM provider_in_person_slot_availability ip
             WHERE ip.agency_id = ?
               AND ip.provider_id = ?
               AND (
                 ip.source_event_id = e.id
                 OR (
                   ip.start_at = e.start_at
                   AND ip.end_at = e.end_at
                   AND (
                     ip.office_location_id IS NULL
                     OR ip.office_location_id = e.office_location_id
                   )
                 )
               )
               AND ip.is_active = TRUE
           ) AS in_person_intake_enabled,
           ol.timezone AS building_timezone,
           ol.name AS building_name,
           e.office_location_id,
           e.room_id,
           r.room_number,
           r.label AS room_label,
           r.name AS room_name
         FROM office_events e
         JOIN office_rooms r ON r.id = e.room_id
         JOIN office_locations ol ON ol.id = e.office_location_id
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id = ?
         WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
           AND e.start_at < ?
           AND e.end_at > ?
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         ORDER BY e.start_at ASC`,
        [aid, pid, aid, pid, pid, `${weekEnd} 00:00:00`, `${weekStart} 00:00:00`]
      );
      pushOfficeRows(rows, false);
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      const [fallbackRows] = await pool.execute(
        `SELECT
           e.id,
           e.start_at,
           e.end_at,
           e.status,
           e.slot_state,
           ol.timezone AS building_timezone,
           ol.name AS building_name,
           e.office_location_id,
           e.room_id,
           r.room_number,
           r.label AS room_label,
           r.name AS room_name
         FROM office_events e
         JOIN office_rooms r ON r.id = e.room_id
         JOIN office_locations ol ON ol.id = e.office_location_id
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id = ?
         WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
           AND e.start_at < ?
           AND e.end_at > ?
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         ORDER BY e.start_at ASC`,
        [aid, pid, pid, `${weekEnd} 00:00:00`, `${weekStart} 00:00:00`]
      );
      // Legacy fallback when intake-toggle table does not exist yet:
      // keep prior behavior by treating in-person intake as enabled for assigned-available slots.
      pushOfficeRows(fallbackRows, true);
    }

    // 3b) Slot-level virtual overrides (event-driven toggles from Building Schedule)
    const virtualSlotBase = [];
    const virtualSlotOverrideIntervals = [];
    try {
      const [rows] = await pool.execute(
        `SELECT
           v.start_at,
           v.end_at,
           v.session_type,
           v.office_location_id,
           v.room_id,
           ol.timezone AS building_timezone,
           ol.name AS building_name,
           r.room_number,
           r.label AS room_label,
           r.name AS room_name
         FROM provider_virtual_slot_availability v
         LEFT JOIN office_locations ol ON ol.id = v.office_location_id
         LEFT JOIN office_rooms r ON r.id = v.room_id
         WHERE v.agency_id = ?
           AND v.provider_id = ?
           AND v.is_active = TRUE
           AND v.start_at < ?
           AND v.end_at > ?
         ORDER BY v.start_at ASC`,
        [aid, pid, `${weekEnd} 00:00:00`, `${weekStart} 00:00:00`]
      );
      for (const r of rows || []) {
        const st = parseMySqlDateTime(r.start_at);
        const en = parseMySqlDateTime(r.end_at);
        const tzEvent = String(r.building_timezone || '').trim() || tz;
        if (!st || !en) continue;
        const s = zonedWallTimeToUtc({ ...st, timeZone: tzEvent });
        const e = zonedWallTimeToUtc({ ...en, timeZone: tzEvent });
        if (!(e > s)) continue;

        const sessionType = String(r.session_type || 'INTAKE').toUpperCase();
        if (intakeOnlyFlag && !['INTAKE', 'BOTH'].includes(sessionType)) continue;
        if (!intakeOnlyFlag && !['REGULAR', 'BOTH', 'INTAKE'].includes(sessionType)) continue;

        virtualSlotBase.push({
          start: s,
          end: e,
          meta: {
            sessionType,
            frequency: 'ONCE',
            buildingId: Number(r.office_location_id || 0) || null,
            buildingName: String(r.building_name || '').trim() || null,
            roomId: Number(r.room_id || 0) || null,
            roomLabel: String(r.room_label || r.room_name || r.room_number || '').trim() || null
          }
        });
        // Overrides explicitly allow virtual during office reservation windows for the same slot.
        virtualSlotOverrideIntervals.push({ start: s, end: e });
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 4) External Therapy Notes busy (ICS) blocks both modalities
    let externalBusy = [];
    if (includeExternalBusy) {
      try {
        let feeds = [];
        const ids = Array.isArray(externalCalendarIds)
          ? externalCalendarIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
          : [];
        if (ids.length > 0) {
          feeds = await UserExternalCalendar.listFeedsForCalendars({ userId: pid, calendarIds: ids, activeOnly: true });
        } else {
          const calendars = await UserExternalCalendar.listForUser({ userId: pid, includeFeeds: true, activeOnly: true });
          for (const c of calendars || []) {
            for (const f of c.feeds || []) {
              if (f?.isActive) feeds.push({ icsUrl: f.icsUrl });
            }
          }
        }
        // Legacy fallback
        if (feeds.length === 0) {
          const legacy = provider?.external_busy_ics_url || provider?.externalBusyIcsUrl || null;
          if (legacy) feeds = [{ icsUrl: legacy }];
        }
        const r = await ExternalBusyCalendarService.getBusyForFeeds({
          userId: pid,
          weekStart,
          feeds: feeds.map((f, idx) => ({ id: idx + 1, url: f.icsUrl || f.url || f.icsUrl })),
          timeMinIso,
          timeMaxIso
        });
        if (r?.ok) externalBusy = r.busy || [];
      } catch {
        externalBusy = [];
      }
    }
    const externalBusyIntervals = (externalBusy || [])
      .map((b) => ({ start: new Date(b.startAt), end: new Date(b.endAt) }))
      .filter((i) => i.start instanceof Date && i.end instanceof Date && i.end > i.start && !Number.isNaN(i.start.getTime()) && !Number.isNaN(i.end.getTime()));

    // 5) Google busy blocks both modalities (optional)
    let googleBusyIntervals = [];
    if (includeGoogleBusy) {
      try {
        const providerEmail = String(provider?.email || '').trim().toLowerCase();
        const r = await GoogleCalendarService.freeBusy({
          subjectEmail: providerEmail,
          timeMin: timeMinIso,
          timeMax: timeMaxIso,
          calendarId: 'primary'
        });
        const busy = r?.ok ? (r.busy || []) : [];
        googleBusyIntervals = (busy || [])
          .map((b) => ({ start: new Date(b.startAt), end: new Date(b.endAt) }))
          .filter((i) => i.start instanceof Date && i.end instanceof Date && i.end > i.start && !Number.isNaN(i.start.getTime()) && !Number.isNaN(i.end.getTime()));
      } catch {
        googleBusyIntervals = [];
      }
    }

    // Busy unions
    const busyAll = mergeIntervals([
      ...schoolBusy,
      ...externalBusyIntervals,
      ...googleBusyIntervals
    ]);
    const officeReservedBusyForVirtual = subtractIntervals(
      officeReservedBusy,
      mergeIntervals(virtualSlotOverrideIntervals)
    );
    // Intake mode: allow offering both in-person and virtual at the same time
    // (client chooses modality). Still block virtual when the office slot is booked.
    const busyVirtual = mergeIntervals([
      ...busyAll,
      ...(intakeOnlyFlag ? officeBookedBusy : officeReservedBusyForVirtual)
    ]);
    const busyInPerson = mergeIntervals(
      intakeOnlyFlag
        ? [...busyAll]
        : [
            ...busyAll,
            ...officeBookedBusy
          ]
    );

    // Virtual availability (preserve meta for each slot)
    const virtualSlots = [];
    const combinedVirtualBase = [...virtualBase, ...virtualSlotBase];
    for (const base of combinedVirtualBase) {
      const segs = subtractInterval(base, busyVirtual);
      for (const seg of segs) {
        const slots = slotizeIntervals([seg], slotMinutes);
        for (const sl of slots) {
          virtualSlots.push({
            startAt: sl.start.toISOString(),
            endAt: sl.end.toISOString(),
            sessionType: base?.meta?.sessionType || 'REGULAR',
            frequency: base?.meta?.frequency || 'WEEKLY'
          });
        }
      }
    }

    // In-person availability (preserve office metadata)
    const inPersonSlots = [];
    for (const base of officeBase) {
      const segs = subtractInterval(base, busyInPerson);
      const slots = slotizeIntervals(segs, slotMinutes);
      for (const sl of slots) {
        inPersonSlots.push({
          startAt: sl.start.toISOString(),
          endAt: sl.end.toISOString(),
          buildingId: base.meta?.buildingId ?? null,
          buildingName: base.meta?.buildingName ?? null,
          roomId: base.meta?.roomId ?? null,
          roomLabel: base.meta?.roomLabel ?? null,
          sessionType: base.meta?.inPersonIntakeEnabled ? 'INTAKE' : 'REGULAR',
          frequency: 'WEEKLY'
        });
      }
    }

    return {
      ok: true,
      agencyId: aid,
      providerId: pid,
      weekStart,
      weekEnd,
      timeZone: tz,
      slotMinutes,
      virtualSlots,
      inPersonSlots
    };
  }
}

export default ProviderAvailabilityService;

