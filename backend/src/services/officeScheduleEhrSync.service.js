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

async function alreadyNotifiedCoverageToday({ agencyId, officeLocationId, recipientUserId }) {
  const agency = Number(agencyId || 0);
  const locationId = Number(officeLocationId || 0);
  const userId = Number(recipientUserId || 0);
  if (!agency || !locationId || !userId) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM notifications
       WHERE user_id = ?
         AND agency_id = ?
         AND type = 'office_schedule_coverage_flag'
         AND related_entity_type = 'office_location'
         AND related_entity_id = ?
         AND created_at >= CURDATE()
       LIMIT 1`,
      [userId, agency, locationId]
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

// Clinical session keywords — used as a strong signal when present.
// Therapy Notes titles are often "3pm TaRo - 437 Windchime Place" (no keyword).
const CLINICAL_KEYWORDS = [
  'therapy', 'counseling', 'session', 'consultation', 'intake',
  'tutoring', 'evaluation', 'assessment', 'treatment', 'supervision',
  'telehealth', 'windchime', 'appt', 'appointment', 'client'
];

function hasClinicalKeyword(summary) {
  const s = String(summary || '').toLowerCase();
  if (!s) return false;
  if (CLINICAL_KEYWORDS.some((kw) => s.includes(kw))) return true;
  // Therapy Notes client-code style: "3pm TaRo - 437 Windchime Place" / "11:30am IND - …"
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(s) && /\b[A-Z]{2,4}\b/.test(String(summary || ''))) {
    return true;
  }
  return false;
}

/** ICS coverage audit only loads Therapy Notes / external busy feeds — any overlap counts. */
function busyCountsAsCoverage(busyItem) {
  if (!busyItem) return false;
  if (hasClinicalKeyword(busyItem.summary)) return true;
  // Untitled busy still proves the EHR/calendar marks them occupied during the office hour.
  return true;
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
  // mysql2 returns DATETIME as Date with wall digits stored in the UTC fields.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds()
    };
  }
  const raw = String(value || '').trim()
    .replace(/\.000Z$/i, '')
    .replace(/Z$/i, '')
    .replace('T', ' ');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
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

/** Fetch ICS busy items WITH their summary fields preserved (use events, not merged busy). */
async function loadBusyWithSummaryForProvider({ providerId, weekStartYmd, timeMinIso, timeMaxIso }) {
  const calendars = await UserExternalCalendar.listForUser({ userId: providerId, includeFeeds: true, activeOnly: true });
  const feeds = [];
  for (const c of calendars || []) {
    for (const f of c?.feeds || []) {
      const url = String(f?.icsUrl || '').trim();
      if (url) feeds.push({ id: f.id, url });
    }
  }

  let busy = [];
  let feedsOk = 0;
  let feedsFailed = 0;
  const errors = [];

  if (feeds.length) {
    const r = await ExternalBusyCalendarService.getBusyForFeeds({
      userId: providerId,
      weekStart: String(weekStartYmd || new Date().toISOString().slice(0, 10)).slice(0, 10),
      feeds,
      timeMinIso,
      timeMaxIso
    });
    if (!r?.ok && r?.reason === 'all_feeds_failed') {
      feedsFailed += feeds.length;
      errors.push(String(r?.error || 'all_feeds_failed'));
    } else if (r?.ok) {
      // Use r.events (unmerged, has summaries) instead of r.busy (merged, loses summaries)
      busy.push(...(r.events || r.busy || []));
      feedsOk += feeds.length;
    }
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
    if (r?.ok) {
      busy.push(...(r.events || r.busy || []));
      feedsOk += 1;
    } else {
      feedsFailed += 1;
      errors.push(String(r?.error || r?.reason || 'legacy_feed_failed'));
    }
  }

  return {
    ok: feedsFailed === 0 || busy.length > 0,
    busy,
    events: busy,
    feedsOk,
    feedsFailed,
    errors
  };
}

async function writeSyncLog({ officeLocationId, eventsScanned, eventsBooked, eventsOverlapUpdated, feedsOk, feedsFailed, errorSummary }) {
  try {
    await pool.execute(
      `INSERT INTO office_ehr_sync_log
         (office_location_id, run_at, events_scanned, events_booked, events_overlap_updated, feeds_ok, feeds_failed, error_summary)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, ?)`,
      [
        Number(officeLocationId),
        Number(eventsScanned || 0),
        Number(eventsBooked || 0),
        Number(eventsOverlapUpdated || 0),
        Number(feedsOk || 0),
        Number(feedsFailed || 0),
        errorSummary ? String(errorSummary).slice(0, 500) : null
      ]
    );
  } catch {
    // Table may not exist yet — never block sync on log write
  }
}

/**
 * For each ASSIGNED_AVAILABLE / ASSIGNED_TEMPORARY / ASSIGNED_BOOKED office occurrence in the
 * forward window:
 * - ASSIGNED_AVAILABLE / ASSIGNED_TEMPORARY: if ICS overlap found → markBooked + upsert booking plan
 * - ASSIGNED_BOOKED: if ICS overlap found → update last_ics_overlap_at only (no state change)
 *
 * Writes a row to office_ehr_sync_log with feed health stats.
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

  // Scan both ASSIGNED_AVAILABLE/TEMPORARY (to promote to BOOKED) and
  // ASSIGNED_BOOKED (to refresh last_ics_overlap_at for coverage verification).
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
       AND UPPER(COALESCE(e.slot_state, '')) IN ('ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY', 'ASSIGNED_BOOKED')
       AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
     ORDER BY e.start_at ASC`,
    [officeId, windowStartWall, windowEndWall]
  );

  const events = (assignedRows || []).filter((r) => Number(r.assigned_provider_id || r.booked_provider_id || 0) > 0);
  if (!events.length) {
    await writeSyncLog({ officeLocationId: officeId, eventsScanned: 0, eventsBooked: 0, eventsOverlapUpdated: 0, feedsOk: 0, feedsFailed: 0 });
    return { ok: true, officeLocationId: officeId, scannedAssigned: 0, bookedFromEhr: 0, touchedProviders: 0, bookingPlansReset: 0 };
  }

  const providerIds = Array.from(new Set(
    events.map((e) => Number(e.assigned_provider_id || e.booked_provider_id || 0)).filter((n) => Number.isInteger(n) && n > 0)
  ));
  const providerTimeZoneById = new Map();
  const busyByProviderId = new Map();
  let totalFeedsOk = 0;
  let totalFeedsFailed = 0;
  const allErrors = [];

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
    const result = await loadBusyWithSummaryForProvider({
      providerId,
      weekStartYmd: windowStartYmd,
      timeMinIso,
      timeMaxIso
    });

    if (!result.ok && result.feedsFailed > 0) {
      console.warn(`[ehr-sync] provider=${providerId} location=${officeId} feeds_failed=${result.feedsFailed} errors=${result.errors.join('; ')}`);
      allErrors.push(...result.errors);
    } else {
      console.info(`[ehr-sync] provider=${providerId} location=${officeId} status=ok busy_items=${result.busy.length}`);
    }

    totalFeedsOk += result.feedsOk;
    totalFeedsFailed += result.feedsFailed;
    busyByProviderId.set(providerId, result.busy);
  }

  const eventsToBook = [];
  const bookedEventsToUpdateOverlap = [];
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

    const slotState = String(e.slot_state || '').toUpperCase();

    if (slotState === 'ASSIGNED_BOOKED') {
      // Already booked — just refresh overlap timestamp for coverage verification
      if (hasMatch) bookedEventsToUpdateOverlap.push(Number(e.id));
    } else {
      // ASSIGNED_AVAILABLE / ASSIGNED_TEMPORARY — promote to booked if TN overlap found
      if (!hasMatch) continue;
      eventsToBook.push({
        eventId: Number(e.id),
        providerId,
        standingAssignmentId: Number(e.standing_assignment_id || 0) || null,
        startAt: String(e.start_at || '').slice(0, 19)
      });
      if (Number(e.standing_assignment_id || 0) > 0) {
        const sid = Number(e.standing_assignment_id);
        const existing = planSeedByAssignmentId.get(sid);
        if (!existing || String(e.start_at) < String(existing.startAt)) {
          planSeedByAssignmentId.set(sid, { startAt: String(e.start_at || '').slice(0, 10) });
        }
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

  // Refresh last_ics_overlap_at on already-booked events that had ICS overlap
  if (bookedEventsToUpdateOverlap.length) {
    const ph = bookedEventsToUpdateOverlap.map(() => '?').join(',');
    try {
      await pool.execute(
        `UPDATE office_events
         SET last_ics_overlap_at = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${ph})`,
        bookedEventsToUpdateOverlap
      );
    } catch {
      // Column may not exist yet if migration 864 hasn't run
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

  await writeSyncLog({
    officeLocationId: officeId,
    eventsScanned: events.length,
    eventsBooked: bookedFromEhr,
    eventsOverlapUpdated: bookedEventsToUpdateOverlap.length,
    feedsOk: totalFeedsOk,
    feedsFailed: totalFeedsFailed,
    errorSummary: allErrors.length ? allErrors.slice(0, 3).join('; ') : null
  });

  return {
    ok: true,
    officeLocationId: officeId,
    scannedAssigned: events.length,
    bookedFromEhr,
    overlapUpdated: bookedEventsToUpdateOverlap.length,
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

// ---------------------------------------------------------------------------
// ICS Coverage Audit (replaces auto-drop)
// ---------------------------------------------------------------------------
// Runs at the 6-week cadence. For each ASSIGNED_BOOKED event in the past window:
//  1. Check ICS overlap + clinical keyword → covered / non_clinical_busy / no_coverage
//  2. Apply bookend rule: if first & last hour of a contiguous block are clinically covered,
//     all middle hours are marked covered (no flag).
//  3. Set ics_flag_type on uncovered/partial events. Notify scheduling admin roles.
//  4. DOES NOT auto-cancel or deactivate anything — admin decides.
// ---------------------------------------------------------------------------

function calendarDateYmd(wallDateTime) {
  return String(wallDateTime || '').slice(0, 10);
}

/**
 * Group a list of office_event rows (sorted by start_at ASC) into contiguous blocks.
 * Two events are contiguous when the gap between end_at and the next start_at is ≤ 5 min.
 */
function groupIntoContiguousBlocks(events) {
  if (!events.length) return [];
  const blocks = [];
  let current = [events[0]];
  for (let i = 1; i < events.length; i++) {
    const prev = current[current.length - 1];
    const prevEndStr = String(prev.end_at || '').trim();
    const curStartStr = String(events[i].start_at || '').trim();
    const prevEndMs = prevEndStr ? new Date(prevEndStr.replace(' ', 'T') + 'Z').getTime() : NaN;
    const curStartMs = curStartStr ? new Date(curStartStr.replace(' ', 'T') + 'Z').getTime() : NaN;
    const gapMs = Number.isFinite(prevEndMs) && Number.isFinite(curStartMs)
      ? curStartMs - prevEndMs
      : Infinity;
    if (gapMs <= 5 * 60 * 1000) {
      current.push(events[i]);
    } else {
      blocks.push(current);
      current = [events[i]];
    }
  }
  blocks.push(current);
  return blocks;
}

/**
 * For one contiguous block, determine per-event coverage status.
 * Returns array of { eventId, flagType: null|'no_coverage'|'non_clinical_busy'|'partial_coverage', hasClinicalOverlap }
 *
 * Tries primary office TZ first, then optional fallback (provider TZ) so a mis-set
 * office timezone does not false-flag when ICS times are correct.
 */
function analyzeBlock(block, busyItems, eventTimeZone, fallbackTimeZone = null) {
  const zones = [...new Set(
    [eventTimeZone, fallbackTimeZone]
      .map((z) => (isValidTimeZone(z) ? String(z) : ''))
      .filter(Boolean)
  )];
  if (!zones.length) zones.push('America/Denver');

  const results = block.map((ev) => {
    let hasCoverageOverlap = false;
    let hasNonClinicalOverlap = false;

    for (const tz of zones) {
      const eventStartMs = utcMsForWallMySqlDateTime(ev.start_at, tz);
      const eventEndMs = utcMsForWallMySqlDateTime(ev.end_at, tz);
      if (!Number.isFinite(eventStartMs) || !Number.isFinite(eventEndMs)) continue;

      for (const b of busyItems) {
        const bs = new Date(b.startAt || b.start).getTime();
        const be = new Date(b.endAt || b.end).getTime();
        if (!intervalsOverlap(eventStartMs, eventEndMs, bs, be)) continue;
        // Audit busy feed is Therapy Notes / external ICS only — any overlap = covered.
        if (busyCountsAsCoverage(b)) {
          hasCoverageOverlap = true;
        } else {
          hasNonClinicalOverlap = true;
        }
      }
      if (hasCoverageOverlap) break;
    }
    return { eventId: Number(ev.id), hasClinicalOverlap: hasCoverageOverlap, hasNonClinicalOverlap };
  });

  // Bookend rule: if the first and last event in the block are covered,
  // treat all middle events as covered too (provider is present the whole block).
  const firstCovered = results[0]?.hasClinicalOverlap;
  const lastCovered = results[results.length - 1]?.hasClinicalOverlap;
  if (firstCovered && lastCovered) {
    return results.map((r) => ({ eventId: r.eventId, flagType: null }));
  }

  return results.map((r) => {
    if (r.hasClinicalOverlap) return { eventId: r.eventId, flagType: null };
    if (r.hasNonClinicalOverlap) return { eventId: r.eventId, flagType: 'non_clinical_busy' };
    // Check if this is the tail of a partially covered block
    const isTail = firstCovered && !lastCovered;
    return { eventId: r.eventId, flagType: isTail ? 'partial_coverage' : 'no_coverage' };
  });
}

/** Forward audit / Keep window: today through +4 weeks. */
export const ICS_COVERAGE_WINDOW_DAYS = 28;

/**
 * Run the ICS coverage audit for one office location.
 * Only recurring (weekly/biweekly/monthly) booked slots from today through +4 weeks.
 * Keep windows suppress re-flagging until ics_coverage_keep_until. Never auto-cancels.
 */

export async function auditIcsCoverageForLocation({
  officeLocationId,
  actorUserId = 1,
  windowDays = ICS_COVERAGE_WINDOW_DAYS
} = {}) {
  const officeId = parseInt(officeLocationId, 10);
  if (!officeId) return { ok: false, reason: 'invalid_location' };

  const loc = await OfficeLocation.findById(officeId);
  if (!loc) return { ok: false, reason: 'location_not_found' };

  const officeTimeZone = isValidTimeZone(loc?.timezone) ? String(loc.timezone) : 'America/New_York';
  const todayYmd = localYmdInTz(new Date(), officeTimeZone) || new Date().toISOString().slice(0, 10);
  // Exclusive end: today + N days inclusive ⇒ cutoff at start of (today + N + 1).
  // Also extend by 1 day so UTC CURDATE vs office-local midnight skew cannot leave
  // a "1 upcoming" weekly miss stranded outside the audit window but inside the list.
  const windowDaysN = Number(windowDays || ICS_COVERAGE_WINDOW_DAYS) || ICS_COVERAGE_WINDOW_DAYS;
  const windowEndYmd = OfficeScheduleMaterializer.addDays(todayYmd, windowDaysN + 1);

  // Expire series-level Keep windows that have passed.
  try {
    await pool.execute(
      `UPDATE office_standing_assignments
       SET ics_coverage_keep_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE office_location_id = ?
         AND ics_coverage_keep_until IS NOT NULL
         AND ics_coverage_keep_until < ?`,
      [officeId, todayYmd]
    );
  } catch {
    // column may not exist yet
  }

  // Expire old event-level Keep markers (legacy sticky keep → 4-week window).
  try {
    await pool.execute(
      `UPDATE office_events
       SET ics_flag_cleared_at = NULL,
           ics_flag_cleared_by_user_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE office_location_id = ?
         AND ics_flag_cleared_at IS NOT NULL
         AND ics_flag_cleared_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [officeId, ICS_COVERAGE_WINDOW_DAYS]
    );
  } catch {
    // columns may not exist yet
  }

  // Drop past coverage flags outside the actionable window.
  try {
    await pool.execute(
      `UPDATE office_events
       SET ics_flag_type = NULL,
           ics_flagged_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE office_location_id = ?
         AND ics_flag_type IS NOT NULL
         AND ics_flag_cleared_at IS NULL
         AND start_at < ?`,
      [officeId, `${todayYmd} 00:00:00`]
    );
  } catch {
    // columns may not exist yet
  }

  // Also clear flags on one-time / non-recurring bookings (standing freq ONCE or no standing).
  try {
    await pool.execute(
      `UPDATE office_events e
       LEFT JOIN office_standing_assignments osa ON osa.id = e.standing_assignment_id
       SET e.ics_flag_type = NULL,
           e.ics_flagged_at = NULL,
           e.updated_at = CURRENT_TIMESTAMP
       WHERE e.office_location_id = ?
         AND e.ics_flag_type IS NOT NULL
         AND e.ics_flag_cleared_at IS NULL
         AND (
           e.standing_assignment_id IS NULL
           OR UPPER(COALESCE(osa.assigned_frequency, 'ONCE')) NOT IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY')
         )`,
      [officeId]
    );
  } catch {
    // best-effort
  }

  let rows = [];
  try {
    const [r] = await pool.execute(
      `SELECT
         e.id,
         e.start_at,
         e.end_at,
         e.assigned_provider_id,
         e.standing_assignment_id,
         e.office_location_id,
         e.ics_flag_type,
         e.ics_flag_cleared_at,
         osa.ics_coverage_keep_until,
         osa.assigned_frequency,
         ol.name AS office_name,
         r.name AS room_name,
         r.label AS room_label
       FROM office_events e
       JOIN office_locations ol ON ol.id = e.office_location_id
       JOIN office_rooms r ON r.id = e.room_id
       JOIN office_standing_assignments osa ON osa.id = e.standing_assignment_id
       WHERE e.office_location_id = ?
         AND e.slot_state = 'ASSIGNED_BOOKED'
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         AND osa.is_active = TRUE
         AND UPPER(COALESCE(osa.assigned_frequency, '')) IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY')
         AND e.start_at >= ?
         AND e.start_at < ?
         AND (osa.ics_coverage_keep_until IS NULL OR osa.ics_coverage_keep_until < ?)
       ORDER BY e.assigned_provider_id ASC, e.standing_assignment_id ASC, e.start_at ASC`,
      [officeId, `${todayYmd} 00:00:00`, `${windowEndYmd} 00:00:00`, todayYmd]
    );
    rows = r || [];
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      // Retry without keep_until column if migration not applied yet.
      if (String(e?.sqlMessage || e?.message || '').includes('ics_coverage_keep_until')) {
        const [r2] = await pool.execute(
          `SELECT
             e.id, e.start_at, e.end_at, e.assigned_provider_id, e.standing_assignment_id,
             e.office_location_id, e.ics_flag_type, e.ics_flag_cleared_at,
             NULL AS ics_coverage_keep_until,
             osa.assigned_frequency,
             ol.name AS office_name, r.name AS room_name, r.label AS room_label
           FROM office_events e
           JOIN office_locations ol ON ol.id = e.office_location_id
           JOIN office_rooms r ON r.id = e.room_id
           JOIN office_standing_assignments osa ON osa.id = e.standing_assignment_id
           WHERE e.office_location_id = ?
             AND e.slot_state = 'ASSIGNED_BOOKED'
             AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
             AND osa.is_active = TRUE
             AND UPPER(COALESCE(osa.assigned_frequency, '')) IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY')
             AND e.start_at >= ?
             AND e.start_at < ?
           ORDER BY e.assigned_provider_id ASC, e.standing_assignment_id ASC, e.start_at ASC`,
          [officeId, `${todayYmd} 00:00:00`, `${windowEndYmd} 00:00:00`]
        );
        rows = r2 || [];
      } else {
        return { ok: false, reason: 'tables_or_columns_missing' };
      }
    } else {
      throw e;
    }
  }

  if (!rows.length) return { ok: true, flagged: 0, covered: 0, checked: 0, newlyFlagged: 0, clearedRecovered: 0 };

  // Keep window: series keep_until still active, or event cleared within last 4 weeks.
  const keepMs = ICS_COVERAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const keptIds = new Set(
    rows.filter((row) => {
      const keepUntil = row.ics_coverage_keep_until
        ? String(row.ics_coverage_keep_until).slice(0, 10)
        : '';
      if (keepUntil && keepUntil >= todayYmd) return true;
      if (!row.ics_flag_cleared_at) return false;
      const cleared = new Date(row.ics_flag_cleared_at);
      return Number.isFinite(cleared.getTime()) && (Date.now() - cleared.getTime()) < keepMs;
    }).map((row) => Number(row.id)).filter(Boolean)
  );
  const priorFlagTypeById = new Map(
    rows.map((row) => [Number(row.id), row.ics_flag_type || null])
  );

  // Group rows by provider (skip sticky-kept — they are not re-audited for flagging)
  const byProvider = new Map();
  for (const row of rows) {
    if (keptIds.has(Number(row.id))) continue;
    const pid = Number(row.assigned_provider_id || 0);
    if (!pid) continue;
    if (!byProvider.has(pid)) byProvider.set(pid, []);
    byProvider.get(pid).push(row);
  }

  let flagged = 0;
  let covered = 0;
  let newlyFlagged = 0;
  let clearedRecovered = 0;
  let flaggedDayBlocks = 0;
  const flagsByProvider = new Map();
  const recoveredEventIds = [];

  for (const [providerId, providerEvents] of byProvider.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const feedCheck = await providerHasExternalBusyFeeds(providerId);
    if (!feedCheck.hasFeeds) continue;

    // Office event DATETIMEs are wall-clock in the office timezone (not the provider profile TZ).
    const eventTimeZone = officeTimeZone;
    // eslint-disable-next-line no-await-in-loop
    const providerTimeZone = await resolveProviderTimeZone({
      providerId,
      fallbackTimeZone: officeTimeZone
    });

    // Expand ICS fetch a bit wider than the office window so RRULE occurrences that
    // start just before today still clamp into the audit range.
    const fetchStartYmd = OfficeScheduleMaterializer.addDays(todayYmd, -1);
    const fetchEndYmd = OfficeScheduleMaterializer.addDays(windowEndYmd, 1);
    const windowStartWall = `${fetchStartYmd} 00:00:00`;
    const windowEndWall = `${fetchEndYmd} 00:00:00`;
    const startParts = parseMySqlDateTimeParts(windowStartWall);
    const endParts = parseMySqlDateTimeParts(windowEndWall);
    const timeMinIso = startParts
      ? zonedWallTimeToUtc({ ...startParts, timeZone: eventTimeZone }).toISOString()
      : `${fetchStartYmd}T00:00:00Z`;
    const timeMaxIso = endParts
      ? zonedWallTimeToUtc({ ...endParts, timeZone: eventTimeZone }).toISOString()
      : `${fetchEndYmd}T00:00:00Z`;

    // eslint-disable-next-line no-await-in-loop
    const busyResult = await loadBusyWithSummaryForProvider({
      providerId,
      weekStartYmd: todayYmd,
      timeMinIso,
      timeMaxIso
    });

    if (!busyResult.ok && busyResult.busy.length === 0) {
      console.warn(`[ehr-audit] provider=${providerId} all_feeds_failed — skipping audit for this provider`);
      continue;
    }

    console.info(
      `[ehr-audit] provider=${providerId} ics_busy=${(busyResult.busy || []).length} ` +
      `office_hours=${providerEvents.length} tz=${eventTimeZone}`
    );

    // Empty busy in the upcoming window is NOT a skip — that is the no_coverage case.
    // (Feeds that fail entirely are skipped above so we don't mass-flag on outages.)

    // Group events by (standing_assignment_id, calendar_date) → find contiguous blocks
    const groupKey = (row) => {
      const wall = parseMySqlDateTimeParts(row.start_at);
      const ymd = wall
        ? `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
        : calendarDateYmd(row.start_at);
      return `${row.standing_assignment_id || 'X'}:${ymd}`;
    };
    const groups = new Map();
    for (const row of providerEvents) {
      const k = groupKey(row);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(row);
    }

    const flagsForProvider = [];
    for (const [, groupEvents] of groups.entries()) {
      groupEvents.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
      const blocks = groupIntoContiguousBlocks(groupEvents);
      for (const block of blocks) {
        // Prefer unmerged events (keep SUMMARY); fall back to merged busy intervals.
        const busyItems = (busyResult.events && busyResult.events.length)
          ? busyResult.events
          : (busyResult.busy || []);
        const analysis = analyzeBlock(block, busyItems, eventTimeZone, providerTimeZone);
        let blockHasFlag = false;
        for (const item of analysis) {
          if (item.flagType) {
            flagsForProvider.push({ ...item, providerId });
            flagged += 1;
            blockHasFlag = true;
            if (!priorFlagTypeById.get(Number(item.eventId))) newlyFlagged += 1;
          } else {
            covered += 1;
            const eid = Number(item.eventId);
            if (priorFlagTypeById.get(eid)) recoveredEventIds.push(eid);
          }
        }
        if (blockHasFlag) flaggedDayBlocks += 1;
      }
    }

    if (flagsForProvider.length) flagsByProvider.set(providerId, flagsForProvider);
  }

  // Write flags to database and clear flags on covered events
  let allFlaggedIds = [];
  for (const [, flags] of flagsByProvider.entries()) {
    for (const f of flags) allFlaggedIds.push(f);
  }

  // Weekly series: a single missed date in the 4-week window = one-off cancellation.
  // Drop those from the write set up front (final SQL cleanup below is the backstop).
  const rowByEventId = new Map(rows.map((row) => [Number(row.id), row]));
  const eventYmd = (row) => {
    const wall = parseMySqlDateTimeParts(row?.start_at);
    if (wall) {
      return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
    }
    const m = String(row?.start_at || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  };
  const pendingDaysByStanding = new Map();
  for (const f of allFlaggedIds) {
    const row = rowByEventId.get(Number(f.eventId));
    const sid = Number(row?.standing_assignment_id || 0);
    if (!sid) continue;
    if (!pendingDaysByStanding.has(sid)) {
      pendingDaysByStanding.set(sid, {
        freq: String(row?.assigned_frequency || '').toUpperCase(),
        days: new Set(),
        eventIds: new Set()
      });
    }
    const bucket = pendingDaysByStanding.get(sid);
    const ymd = eventYmd(row);
    if (ymd) bucket.days.add(ymd);
    bucket.eventIds.add(Number(f.eventId));
  }
  const suppressedEventIds = new Set();
  for (const [, bucket] of pendingDaysByStanding.entries()) {
    if (bucket.freq !== 'WEEKLY' || bucket.days.size > 1) continue;
    for (const eid of bucket.eventIds) {
      suppressedEventIds.add(eid);
      recoveredEventIds.push(eid);
    }
  }
  if (suppressedEventIds.size) {
    allFlaggedIds = allFlaggedIds.filter((f) => !suppressedEventIds.has(Number(f.eventId)));
    flagged = Math.max(0, flagged - suppressedEventIds.size);
    newlyFlagged = Math.max(0, newlyFlagged - suppressedEventIds.size);
    for (const [pid, flags] of [...flagsByProvider.entries()]) {
      const next = flags.filter((f) => !suppressedEventIds.has(Number(f.eventId)));
      if (next.length) flagsByProvider.set(pid, next);
      else flagsByProvider.delete(pid);
    }
  }

  // Update flagged events (do not wipe sticky Keep — those were skipped above)
  for (const f of allFlaggedIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `UPDATE office_events
         SET ics_flag_type = ?,
             ics_flagged_at = NOW(),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND ics_flag_cleared_at IS NULL`,
        [f.flagType, f.eventId]
      );
    } catch {
      // Column may not exist yet
    }
  }

  // Clear flags when coverage recovers (keep sticky Keep rows untouched)
  for (const eventId of recoveredEventIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const [result] = await pool.execute(
        `UPDATE office_events
         SET ics_flag_type = NULL,
             ics_flagged_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND ics_flag_type IS NOT NULL
           AND ics_flag_cleared_at IS NULL`,
        [eventId]
      );
      clearedRecovered += Number(result?.affectedRows || 0);
    } catch {
      // Column may not exist yet
    }
  }

  // Backstop: weekly series with only one conflict date in the list window
  // (MySQL CURDATE → +4 weeks, same as the coverage-flags API) are one-off
  // cancellations — clear them even when office-local today disagrees with UTC.
  try {
    const [clearResult] = await pool.execute(
      `UPDATE office_events e
       JOIN office_standing_assignments osa ON osa.id = e.standing_assignment_id
       JOIN (
         SELECT e2.standing_assignment_id
         FROM office_events e2
         JOIN office_standing_assignments osa2 ON osa2.id = e2.standing_assignment_id
         WHERE e2.office_location_id = ?
           AND e2.ics_flag_type IS NOT NULL
           AND e2.ics_flag_cleared_at IS NULL
           AND (e2.status IS NULL OR UPPER(e2.status) <> 'CANCELLED')
           AND UPPER(COALESCE(osa2.assigned_frequency, '')) = 'WEEKLY'
           AND e2.start_at >= CURDATE()
           AND e2.start_at < DATE_ADD(CURDATE(), INTERVAL ? DAY)
         GROUP BY e2.standing_assignment_id
         HAVING COUNT(DISTINCT DATE(e2.start_at)) <= 1
       ) single_miss ON single_miss.standing_assignment_id = e.standing_assignment_id
       SET e.ics_flag_type = NULL,
           e.ics_flagged_at = NULL,
           e.updated_at = CURRENT_TIMESTAMP
       WHERE e.office_location_id = ?
         AND e.ics_flag_type IS NOT NULL
         AND e.ics_flag_cleared_at IS NULL
         AND e.start_at >= CURDATE()
         AND e.start_at < DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
      [officeId, windowDaysN, officeId, windowDaysN]
    );
    const weeklySingleMissCleared = Number(clearResult?.affectedRows || 0);
    if (weeklySingleMissCleared > 0) {
      clearedRecovered += weeklySingleMissCleared;
      console.info(
        `[ehr-audit] location=${officeId} weekly_single_miss_cleared=${weeklySingleMissCleared}`
      );
    }
  } catch (e) {
    console.warn('[ehr-audit] weekly single-miss cleanup failed:', e?.message || e);
  }

  // Notify only when there are newly flagged hours, and at most once per admin/location/day.
  if (newlyFlagged > 0 && flagsByProvider.size > 0) {
    let adminUserIds = [];
    try {
      const [adminRows] = await pool.execute(
        `SELECT DISTINCT ua.user_id
         FROM user_agencies ua
         JOIN office_location_agencies ola ON ola.agency_id = ua.agency_id
         JOIN users u ON u.id = ua.user_id
         WHERE ola.office_location_id = ?
           AND u.role IN ('clinical_practice_assistant','provider_plus','admin','super_admin','superadmin','support','staff')
           AND u.is_active = TRUE`,
        [officeId]
      );
      adminUserIds = (adminRows || []).map((r) => Number(r.user_id)).filter(Boolean);
    } catch {
      // fallback: skip notification
    }

    const [locationAgencyRows] = await pool.execute(
      `SELECT agency_id FROM office_location_agencies WHERE office_location_id = ? LIMIT 1`,
      [officeId]
    ).catch(() => [[]]);
    const agencyId = Number(locationAgencyRows?.[0]?.agency_id || 0);

    const hourCount = allFlaggedIds.length;
    const providerCount = flagsByProvider.size;
    const blockLabel = flaggedDayBlocks === 1 ? 'day-block' : 'day-blocks';
    const hourLabel = hourCount === 1 ? 'hour' : 'hours';
    const providerLabel = providerCount === 1 ? 'provider' : 'providers';
    const message =
      `${newlyFlagged} new flagged ${newlyFlagged === 1 ? 'hour' : 'hours'} ` +
      `(${flaggedDayBlocks} ${blockLabel} / ${hourCount} ${hourLabel} open) ` +
      `across ${providerCount} ${providerLabel} at ${loc?.name || 'your office'}. ` +
      `Open Office Schedule → Coverage Flags to review, keep, or release.`;

    for (const adminId of adminUserIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const already = await alreadyNotifiedCoverageToday({
          agencyId,
          officeLocationId: officeId,
          recipientUserId: adminId
        });
        if (already) continue;

        // eslint-disable-next-line no-await-in-loop
        await createNotificationAndDispatch({
          type: 'office_schedule_coverage_flag',
          severity: 'warning',
          title: 'Office coverage flags need review',
          message,
          userId: adminId,
          agencyId: agencyId || undefined,
          relatedEntityType: 'office_location',
          relatedEntityId: officeId,
          actorUserId: parseInt(actorUserId, 10) || 1,
          actorSource: 'Office Scheduling'
        });
      } catch {
        // ignore per-admin notification errors
      }
    }
  }

  return {
    ok: true,
    flagged,
    covered,
    checked: rows.length,
    newlyFlagged,
    clearedRecovered,
    flaggedDayBlocks,
    stickyKept: keptIds.size,
    flagsByProvider: flagsByProvider.size
  };
}

/**
 * Run the ICS coverage audit for every active office location (4-week forward window).
 */
export async function auditIcsCoverageAllLocations({ actorUserId = 1 } = {}) {
  let locations = [];
  try {
    locations = await OfficeLocation.listAll({ includeInactive: false });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: false, reason: 'office_tables_missing' };
    throw e;
  }

  const results = [];
  for (const loc of locations || []) {
    const id = Number(loc?.id || 0);
    if (!id) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await auditIcsCoverageForLocation({ officeLocationId: id, actorUserId });
      results.push({ officeLocationId: id, ...r });
    } catch (e) {
      results.push({ officeLocationId: id, ok: false, error: String(e?.message || e) });
    }
  }

  const totalFlagged = results.reduce((s, r) => s + (Number(r.flagged) || 0), 0);
  return { ok: true, locations: results.length, totalFlagged, results };
}

/**
 * Returns EHR sync health summary per provider for an office location.
 */
export async function getEhrSyncHealth({ officeLocationId } = {}) {
  const officeId = parseInt(officeLocationId, 10) || null;
  try {
    // Show the latest run per office (not a 7-day SUM). Summing inflated "scanned"
    // when the job was accidentally re-triggered many times in a day.
    const locationFilter = officeId ? 'AND osl.office_location_id = ?' : '';
    const params = officeId ? [officeId] : [];
    const [logs] = await pool.execute(
      `SELECT
         osl.office_location_id,
         ol.name AS office_name,
         osl.run_at AS last_run_at,
         osl.events_scanned AS total_scanned,
         osl.events_booked AS total_booked,
         osl.feeds_failed AS total_feeds_failed,
         osl.error_summary AS last_error
       FROM office_ehr_sync_log osl
       JOIN office_locations ol ON ol.id = osl.office_location_id
       INNER JOIN (
         SELECT office_location_id, MAX(id) AS max_id
         FROM office_ehr_sync_log
         GROUP BY office_location_id
       ) latest ON latest.max_id = osl.id
       WHERE 1=1
         ${locationFilter}
       ORDER BY ol.name ASC, osl.office_location_id ASC`,
      params
    );

    // Soft-dedupe identical office names (e.g. two "Denver" location rows) —
    // keep the newest log so the health card doesn't show duplicate rows.
    const byName = new Map();
    for (const row of logs || []) {
      const key = String(row.office_name || '').trim().toLowerCase() || `id:${row.office_location_id}`;
      const prev = byName.get(key);
      if (!prev || String(row.last_run_at || '') >= String(prev.last_run_at || '')) {
        byName.set(key, row);
      }
    }
    return { ok: true, cadence: 'once_daily', locations: [...byName.values()] };
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: false, reason: 'sync_log_table_missing', locations: [] };
    return { ok: false, reason: String(e?.message || e), locations: [] };
  }
}

/**
 * Returns true if EHR sync already completed a full (or near-full) pass today (UTC).
 * A single manual office refresh must not block the daily job; we require that
 * today's logs cover all active office locations.
 */
export async function ehrSyncAlreadyRanToday() {
  try {
    const [[active]] = await pool.execute(
      `SELECT COUNT(*) AS n FROM office_locations WHERE is_active = TRUE`
    );
    const activeCount = Number(active?.n || 0);
    if (activeCount <= 0) return false;
    const [[row]] = await pool.execute(
      `SELECT COUNT(DISTINCT office_location_id) AS locs
       FROM office_ehr_sync_log
       WHERE run_at >= UTC_DATE()`
    );
    return Number(row?.locs || 0) >= activeCount;
  } catch {
    return false;
  }
}

/**
 * Auto-drop is DISABLED — replaced by auditIcsCoverageAllLocations.
 * Kept as a no-op export so existing imports don't break.
 */
export async function downgradeBookedWithoutExternalOverlap() {
  // No-op: this function previously auto-cancelled future bookings when ICS
  // showed no overlap for the last 2 occurrences. That behavior has been
  // replaced by auditIcsCoverageForLocation, which flags slots for admin review
  // instead of silently canceling them.
  return { ok: true, downgraded: 0, skipped: 'replaced_by_coverage_audit' };
}

export default {
  refreshLocationBookingsFromEhr,
  refreshAllLocationsFromEhr,
  auditIcsCoverageForLocation,
  auditIcsCoverageAllLocations,
  getEhrSyncHealth,
  ehrSyncAlreadyRanToday,
  downgradeBookedWithoutExternalOverlap
};
