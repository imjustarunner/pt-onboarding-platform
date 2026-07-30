/**
 * Fall Check-in pre-slots: host calendars, modality gaps, book-on-pick, finalize invites.
 */
import pool from '../config/database.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import {
  wallMysqlToUtcMysql,
  utcMysqlToIso,
  dateToMysqlUtcDateTime,
  normalizeWallMysqlDatetime,
  DEFAULT_SCHEDULE_TZ,
  isValidTimeZone
} from '../utils/zonedWallTime.util.js';

export const PRESLOT_KIND = 'FALL_CHECKIN_PRESLOT';
export const BOOKED_KIND = 'FALL_CHECKIN_BOOKED';
export const PRESLOT_TITLE = '(fills in school visit)';

function bookedSchoolVisitTitle(modality, schoolLabel) {
  const name = String(schoolLabel || 'School').trim() || 'School';
  return modality === 'virtual'
    ? `Virtual school visit — ${name}`
    : `In person school visit — ${name}`;
}

function bookedSchoolVisitDescription(modality, schoolLabel, { locationText = null, meetLink = null } = {}) {
  const name = String(schoolLabel || 'School').trim() || 'School';
  const lines = [
    modality === 'virtual'
      ? `Virtual school visit (Fall School Check-in) for ${name}.`
      : `In person school visit (Fall School Check-in) for ${name}.`,
    'Booked via Collaborative Year Update.',
  ];
  if (modality === 'in_person' && locationText) lines.push(`Location: ${locationText}`);
  if (modality === 'virtual' && meetLink) lines.push(`Meet: ${meetLink}`);
  return lines.join('\n');
}

function parseJsonField(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function reinit() {
  return import('./schoolReinit.service.js');
}

function asIntArray(raw) {
  const parsed = parseJsonField(raw);
  if (!Array.isArray(parsed)) return [];
  return Array.from(new Set(parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)));
}

/**
 * Check-in slots are stored as UTC DATETIME (migration 1098).
 * Writers convert agency/school wall clock → UTC; API emits ISO with Z.
 */
const agencyTzCache = new Map();

async function resolveAgencyTimezone(agencyId) {
  const aid = Number(agencyId || 0);
  if (agencyTzCache.has(aid)) return agencyTzCache.get(aid);
  let tz = DEFAULT_SCHEDULE_TZ;
  if (aid > 0) {
    try {
      const [rows] = await pool.execute(
        `SELECT timezone FROM agencies WHERE id = ? LIMIT 1`,
        [aid]
      );
      const raw = String(rows?.[0]?.timezone || '').trim();
      if (isValidTimeZone(raw)) tz = raw;
    } catch {
      /* keep default */
    }
  }
  agencyTzCache.set(aid, tz);
  return tz;
}

/** Wall digits or Date → UTC MySQL DATETIME in agency TZ. */
function toMysqlDateTime(d, timeZone = DEFAULT_SCHEDULE_TZ) {
  if (d == null || d === '') return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    // Already an absolute instant (e.g. from addMinutes).
    return dateToMysqlUtcDateTime(d);
  }
  const raw = String(d).trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return dateToMysqlUtcDateTime(new Date(raw));
  }
  const wall = normalizeWallMysqlDatetime(raw);
  return wallMysqlToUtcMysql(wall, timeZone);
}

function addMinutes(dateLike, minutes) {
  const iso = utcMysqlToIso(dateLike) || (dateLike instanceof Date ? dateLike.toISOString() : null);
  const base = iso ? new Date(iso) : new Date(dateLike);
  if (!base || Number.isNaN(base.getTime())) return new Date(NaN);
  return new Date(base.getTime() + Number(minutes || 0) * 60_000);
}

function serializeSlotRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of ['starts_at', 'ends_at']) {
    if (out[key] != null) {
      const iso = utcMysqlToIso(out[key]);
      if (iso) out[key] = iso;
    }
  }
  return out;
}

function normalizeModality(raw) {
  const m = String(raw || '').trim().toLowerCase();
  if (m === 'virtual') return 'virtual';
  return 'in_person';
}

export function serializeCampaignCheckin(campaign) {
  if (!campaign) {
    return {
      hostUserIds: [],
      extraAttendeeUserIds: [],
      slotDurationMinutes: 30,
      inPersonGapMinutes: 30,
      virtualGapMinutes: 0,
      defaultLocationMode: 'school',
    };
  }
  return {
    hostUserIds: asIntArray(campaign.host_user_ids),
    extraAttendeeUserIds: asIntArray(campaign.extra_attendee_user_ids),
    slotDurationMinutes: Math.max(5, Number(campaign.slot_duration_minutes) || 30),
    inPersonGapMinutes: Math.max(0, Number(campaign.in_person_gap_minutes) || 0),
    virtualGapMinutes: Math.max(0, Number(campaign.virtual_gap_minutes) || 0),
    defaultLocationMode: String(campaign.default_location_mode || 'school'),
  };
}

export async function updateCampaignCheckinSettings({
  agencyId,
  schoolYear,
  hostUserIds,
  extraAttendeeUserIds,
  slotDurationMinutes,
  inPersonGapMinutes,
  virtualGapMinutes,
  defaultLocationMode,
}) {
  const S = await reinit();
  const campaign = await S.getOrCreateCampaign(agencyId, schoolYear);
  const hosts = Array.isArray(hostUserIds)
    ? Array.from(new Set(hostUserIds.map((v) => Number(v)).filter((n) => n > 0)))
    : asIntArray(campaign.host_user_ids);
  const extras = Array.isArray(extraAttendeeUserIds)
    ? Array.from(new Set(extraAttendeeUserIds.map((v) => Number(v)).filter((n) => n > 0)))
    : asIntArray(campaign.extra_attendee_user_ids);

  if (hosts.length) {
    const placeholders = hosts.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT u.id
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.id IN (${placeholders})`,
      [agencyId, ...hosts]
    );
    const found = new Set((rows || []).map((r) => Number(r.id)));
    const missing = hosts.filter((id) => !found.has(id));
    if (missing.length) {
      throw new Error(`Host user(s) not in agency: ${missing.join(', ')}`);
    }
  }

  await pool.execute(
    `UPDATE school_reinit_campaigns
     SET host_user_ids = ?,
         extra_attendee_user_ids = ?,
         slot_duration_minutes = ?,
         in_person_gap_minutes = ?,
         virtual_gap_minutes = ?,
         default_location_mode = ?
     WHERE id = ?`,
    [
      JSON.stringify(hosts),
      JSON.stringify(extras),
      Math.max(5, Number(slotDurationMinutes) || 30),
      Math.max(0, Number(inPersonGapMinutes) ?? 30),
      Math.max(0, Number(virtualGapMinutes) ?? 0),
      String(defaultLocationMode || 'school').slice(0, 32),
      campaign.id,
    ]
  );
  return S.getCampaign(agencyId, schoolYear);
}

async function loadUsersByIds(userIds) {
  const ids = Array.from(new Set((userIds || []).map((v) => Number(v)).filter((n) => n > 0)));
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, email, first_name, last_name, role
     FROM users
     WHERE id IN (${placeholders})`,
    ids
  );
  return rows || [];
}

async function schoolAddressText(schoolAgencyId) {
  try {
    const [rows] = await pool.execute(
      `SELECT name, street_address, city, state, postal_code
       FROM agencies WHERE id = ? LIMIT 1`,
      [schoolAgencyId]
    );
    const a = rows?.[0];
    if (!a) return null;
    const parts = [
      a.street_address,
      [a.city, a.state].filter(Boolean).join(', '),
      a.postal_code,
    ].filter(Boolean);
    return parts.length ? parts.join(' ').trim() : a.name || null;
  } catch {
    const [rows] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [schoolAgencyId]);
    return rows?.[0]?.name || null;
  }
}

async function schoolName(schoolAgencyId) {
  const [rows] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [schoolAgencyId]);
  return rows?.[0]?.name || `School #${schoolAgencyId}`;
}

/**
 * Existing open/booked slots that overlap a window expanded by modality gap.
 */
async function findConflictingSlots({
  agencyId,
  schoolYear,
  modality,
  startsAt,
  endsAt,
  gapMinutes,
  excludeSlotId = null,
}) {
  const windowStart = addMinutes(startsAt, -Number(gapMinutes || 0));
  const windowEnd = addMinutes(endsAt, Number(gapMinutes || 0));
  const params = [
    agencyId,
    schoolYear,
    modality,
    toMysqlDateTime(windowEnd),
    toMysqlDateTime(windowStart),
  ];
  let excludeSql = '';
  if (excludeSlotId) {
    excludeSql = ' AND id <> ?';
    params.push(Number(excludeSlotId));
  }
  const [rows] = await pool.execute(
    `SELECT id, starts_at, ends_at, modality, status, label
     FROM school_reinit_checkin_slots
     WHERE agency_id = ?
       AND school_year COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND modality COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND status IN ('open', 'booked')
       AND is_active = 1
       AND starts_at < ?
       AND COALESCE(ends_at, starts_at) > ?
       ${excludeSql}
     ORDER BY starts_at ASC`,
    params
  );
  return rows || [];
}

async function ensureHostCalendarForSlot({
  host,
  slot,
  campaign,
  createdByUserId,
  booked = false,
  schoolLabel = null,
  modality = null,
  locationText = null,
}) {
  const settings = serializeCampaignCheckin(campaign);
  const startsAt = toMysqlDateTime(slot.starts_at);
  const endsAt = toMysqlDateTime(
    slot.ends_at || addMinutes(slot.starts_at, slot.duration_minutes || settings.slotDurationMinutes)
  );
  const slotModality = normalizeModality(modality || slot.modality);
  const modalityLabel = slotModality === 'virtual' ? 'Virtual' : 'In person';
  const title = booked
    ? bookedSchoolVisitTitle(slotModality, schoolLabel || 'School')
    : PRESLOT_TITLE;
  const description = booked
    ? bookedSchoolVisitDescription(slotModality, schoolLabel || 'School', { locationText })
    : `School visit pre-slot (${modalityLabel}). This block fills when a school books their Fall School Check-in.`;
  const pseAgencyId = booked && slot.booked_school_agency_id
    ? Number(slot.booked_school_agency_id)
    : Number(slot.agency_id);
  const pseKind = booked ? BOOKED_KIND : PRESLOT_KIND;

  const [heRows] = await pool.execute(
    `SELECT * FROM school_reinit_checkin_slot_host_events
     WHERE slot_id = ? AND host_user_id = ?
     LIMIT 1`,
    [slot.id, host.id]
  );
  const existing = heRows?.[0] || null;

  const email = String(host.email || '').trim().toLowerCase();
  let googleEventId = existing?.google_event_id || null;
  let googleHtmlLink = existing?.google_html_link || null;
  let googleMeetLink = existing?.google_meet_link || null;

  if (email && GoogleCalendarService.isConfigured()) {
    if (googleEventId) {
      const patched = await GoogleCalendarService.patchEventDetails({
        subjectEmail: email,
        eventId: googleEventId,
        summary: title,
        description,
        location: slotModality === 'in_person' ? locationText || schoolLabel || null : null,
      });
      if (patched?.htmlLink) googleHtmlLink = patched.htmlLink;
      if (patched?.meetLink) googleMeetLink = patched.meetLink;
    } else {
      const google = await GoogleCalendarService.createProviderScheduleEvent({
        subjectEmail: email,
        startAt: startsAt,
        endAt: endsAt,
        summary: title,
        description,
        kind: pseKind,
        createMeetLink: booked && slotModality === 'virtual',
        attendeeEmails: [],
      });
      if (google?.ok) {
        googleEventId = google.eventId || null;
        googleHtmlLink = google.htmlLink || null;
        googleMeetLink = google.meetLink || null;
      }
    }
  }

  let pseId = existing?.provider_schedule_event_id || null;
  if (pseId) {
    const pse = await ProviderScheduleEvent.findById(pseId);
    if (!pse) pseId = null;
  }

  if (pseId) {
    try {
      await pool.execute(
        `UPDATE provider_schedule_events
         SET kind = ?, title = ?, description = ?, start_at = ?, end_at = ?,
             agency_id = ?, google_event_id = COALESCE(?, google_event_id),
             google_html_link = COALESCE(?, google_html_link),
             google_meet_link = COALESCE(?, google_meet_link),
             status = 'ACTIVE'
         WHERE id = ?`,
        [
          pseKind,
          title,
          description,
          startsAt,
          endsAt,
          pseAgencyId,
          googleEventId,
          googleHtmlLink,
          googleMeetLink,
          pseId,
        ]
      );
    } catch (e) {
      console.warn('[schoolReinitCheckin] PSE update failed', e?.message || e);
      pseId = null;
    }
  }

  if (!pseId) {
    try {
      const pse = await ProviderScheduleEvent.create({
        agencyId: pseAgencyId,
        providerId: host.id,
        kind: pseKind,
        title,
        description,
        startAt: startsAt,
        endAt: endsAt,
        googleEventId,
        googleHtmlLink,
        googleMeetLink,
        createdByUserId: createdByUserId || null,
      });
      pseId = pse?.id || null;
    } catch (e) {
      console.warn('[schoolReinitCheckin] PSE create failed', e?.message || e);
    }
  }

  await pool.execute(
    `INSERT INTO school_reinit_checkin_slot_host_events
      (slot_id, host_user_id, provider_schedule_event_id, google_event_id, google_html_link, google_meet_link)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       provider_schedule_event_id = COALESCE(VALUES(provider_schedule_event_id), provider_schedule_event_id),
       google_event_id = COALESCE(VALUES(google_event_id), google_event_id),
       google_html_link = COALESCE(VALUES(google_html_link), google_html_link),
       google_meet_link = COALESCE(VALUES(google_meet_link), google_meet_link)`,
    [slot.id, host.id, pseId, googleEventId, googleHtmlLink, googleMeetLink]
  );

  return {
    hostUserId: host.id,
    providerScheduleEventId: pseId,
    googleEventId,
  };
}

async function mirrorPreslotToHosts({ slot, campaign, createdByUserId }) {
  const settings = serializeCampaignCheckin(campaign);
  const hostIds = settings.hostUserIds;
  if (!hostIds.length) {
    throw new Error('Set at least one agency host before creating check-in pre-slots');
  }
  const hosts = await loadUsersByIds(hostIds);
  if (!hosts.length) throw new Error('Host users not found');

  const hostEventRows = [];
  for (const host of hosts) {
    hostEventRows.push(
      await ensureHostCalendarForSlot({
        host,
        slot,
        campaign,
        createdByUserId,
        booked: false,
      })
    );
  }
  return hostEventRows;
}

/** Backfill missing in-app calendar rows for a host's check-in slots in a date window. */
export async function repairHostScheduleEventsInWindow({ providerId, windowStart, windowEnd }) {
  const pId = Number(providerId || 0);
  if (!pId || !windowStart || !windowEnd) return { repaired: 0 };

  const [rows] = await pool.execute(
    `SELECT s.*, h.host_user_id,
            b.modality AS booking_modality,
            b.location_text AS booking_location_text,
            sch.name AS booked_school_name
     FROM school_reinit_checkin_slot_host_events h
     INNER JOIN school_reinit_checkin_slots s ON s.id = h.slot_id
     LEFT JOIN school_reinit_checkin_bookings b
       ON b.slot_id = s.id AND b.status = 'booked'
     LEFT JOIN agencies sch ON sch.id = s.booked_school_agency_id
     WHERE h.host_user_id = ?
       AND s.is_active = 1
       AND s.status IN ('open', 'booked')
       AND s.starts_at < ?
       AND COALESCE(s.ends_at, s.starts_at) > ?
       AND (
         h.provider_schedule_event_id IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM provider_schedule_events pse
           WHERE pse.id = h.provider_schedule_event_id AND pse.status = 'ACTIVE'
         )
       )`,
    [pId, windowEnd, windowStart]
  );

  let repaired = 0;
  const campaignCache = new Map();
  for (const row of rows || []) {
    const cacheKey = `${row.agency_id}:${row.school_year}`;
    let campaign = campaignCache.get(cacheKey);
    if (!campaign) {
      const S = await reinit();
      campaign = await S.getCampaign(row.agency_id, row.school_year);
      campaignCache.set(cacheKey, campaign);
    }
    const [userRows] = await pool.execute(`SELECT id, email FROM users WHERE id = ? LIMIT 1`, [pId]);
    const hostUser = userRows?.[0];
    if (!hostUser) continue;
    const booked = String(row.status || '') === 'booked';
    await ensureHostCalendarForSlot({
      host: hostUser,
      slot: row,
      campaign,
      createdByUserId: null,
      booked,
      schoolLabel: row.booked_school_name || null,
      modality: row.booking_modality || row.modality,
      locationText: row.booking_location_text || null,
    });
    repaired += 1;
  }
  return { repaired };
}

/** Repair all open/booked check-in slots for an agency year (admin panel load). */
export async function repairAgencyCheckinHostCalendars(agencyId, schoolYear) {
  const aId = Number(agencyId || 0);
  if (!aId) return { repaired: 0 };
  const [rows] = await pool.execute(
    `SELECT DISTINCT h.host_user_id
     FROM school_reinit_checkin_slot_host_events h
     INNER JOIN school_reinit_checkin_slots s ON s.id = h.slot_id
     WHERE s.agency_id = ?
       AND s.school_year COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND s.is_active = 1
       AND s.status IN ('open', 'booked')`,
    [aId, schoolYear]
  );
  let repaired = 0;
  for (const row of rows || []) {
    const res = await repairHostScheduleEventsInWindow({
      providerId: row.host_user_id,
      windowStart: '1970-01-01 00:00:00',
      windowEnd: '2099-12-31 23:59:59',
    });
    repaired += res.repaired || 0;
  }
  return { repaired };
}

export async function createCheckinPreslot({
  agencyId,
  schoolYear,
  startsAt,
  modality: modalityRaw,
  label = null,
  createdByUserId = null,
  skipGapCheck = false,
}) {
  const S = await reinit();
  const campaign = await S.getOrCreateCampaign(agencyId, schoolYear);
  const settings = serializeCampaignCheckin(campaign);
  if (!settings.hostUserIds.length) {
    throw new Error('Set tenant hosts (typically two) before adding check-in pre-slots');
  }

  const modality = normalizeModality(modalityRaw);
  const tz = await resolveAgencyTimezone(agencyId);
  // Admin UI sends wall clock; store as UTC.
  const startMysql = toMysqlDateTime(startsAt, tz);
  if (!startMysql) throw new Error('Invalid startsAt');
  const start = new Date(`${startMysql.replace(' ', 'T')}Z`);
  const duration = settings.slotDurationMinutes;
  const end = addMinutes(start, duration);
  const endMysql = dateToMysqlUtcDateTime(end);
  const gap = modality === 'virtual' ? settings.virtualGapMinutes : settings.inPersonGapMinutes;

  if (!skipGapCheck) {
    const conflicts = await findConflictingSlots({
      agencyId,
      schoolYear,
      modality,
      startsAt: start,
      endsAt: end,
      gapMinutes: gap,
    });
    if (conflicts.length) {
      throw new Error(
        `Too close to an existing ${modality === 'virtual' ? 'virtual' : 'in-person'} slot. Next allowed start is meeting duration (${duration} min) + gap (${gap} min) after the previous start.`
      );
    }
  }

  const [result] = await pool.execute(
    `INSERT INTO school_reinit_checkin_slots
      (agency_id, school_year, starts_at, ends_at, label, capacity, booked_count, is_active,
       modality, duration_minutes, status, location_mode)
     VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?, ?, 'open', ?)`,
    [
      agencyId,
      schoolYear,
      startMysql,
      endMysql,
      label || null,
      modality,
      duration,
      settings.defaultLocationMode || 'school',
    ]
  );

  const [rows] = await pool.execute(`SELECT * FROM school_reinit_checkin_slots WHERE id = ?`, [
    result.insertId,
  ]);
  const slot = rows[0];
  await mirrorPreslotToHosts({ slot, campaign, createdByUserId });
  return getCheckinSlotDetail(slot.id);
}

export async function getCheckinSlotDetail(slotId) {
  const [rows] = await pool.execute(`SELECT * FROM school_reinit_checkin_slots WHERE id = ? LIMIT 1`, [
    slotId,
  ]);
  const slot = rows?.[0];
  if (!slot) return null;
  const [hosts] = await pool.execute(
    `SELECT h.*, u.email, u.first_name, u.last_name
     FROM school_reinit_checkin_slot_host_events h
     INNER JOIN users u ON u.id = h.host_user_id
     WHERE h.slot_id = ?`,
    [slotId]
  );
  let booking = null;
  if (slot.status === 'booked') {
    const [bRows] = await pool.execute(
      `SELECT b.*, a.name AS school_name
       FROM school_reinit_checkin_bookings b
       LEFT JOIN agencies a ON a.id = b.school_agency_id
       WHERE b.slot_id = ? AND b.status = 'booked'
       LIMIT 1`,
      [slotId]
    );
    booking = bRows?.[0] || null;
  }
  return {
    ...serializeSlotRow(slot),
    hostEvents: hosts || [],
    booking: booking ? serializeSlotRow(booking) : null,
  };
}

export async function listCheckinSlotsDetailed(agencyId, schoolYear, { includeInactive = false } = {}) {
  const [rows] = await pool.execute(
    `SELECT s.*,
            a.name AS booked_school_name,
            b.id AS booking_id,
            b.meet_link AS booking_meet_link,
            b.invited_at AS booking_invited_at,
            b.modality AS booking_modality
     FROM school_reinit_checkin_slots s
     LEFT JOIN agencies a ON a.id = s.booked_school_agency_id
     LEFT JOIN school_reinit_checkin_bookings b
       ON b.slot_id = s.id AND b.status = 'booked'
     WHERE s.agency_id = ?
       AND s.school_year COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       ${includeInactive ? '' : 'AND s.is_active = 1'}
     ORDER BY s.starts_at ASC, s.modality ASC`,
    [agencyId, schoolYear]
  );
  return (rows || []).map(serializeSlotRow);
}

export async function listBookableCheckinSlots(agencyId, schoolYear, modalityRaw) {
  const modality = normalizeModality(modalityRaw);
  const [rows] = await pool.execute(
    `SELECT *
     FROM school_reinit_checkin_slots
     WHERE agency_id = ?
       AND school_year COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND modality COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND status = 'open'
       AND is_active = 1
     ORDER BY starts_at ASC`,
    [agencyId, schoolYear, modality]
  );
  return (rows || []).map(serializeSlotRow);
}

export async function getBookingForCycle(cycleId) {
  const [rows] = await pool.execute(
    `SELECT b.*, s.label AS slot_label, a.name AS school_name
     FROM school_reinit_checkin_bookings b
     INNER JOIN school_reinit_checkin_slots s ON s.id = b.slot_id
     LEFT JOIN agencies a ON a.id = b.school_agency_id
     WHERE b.cycle_id = ? AND b.status = 'booked'
     LIMIT 1`,
    [cycleId]
  );
  return rows?.[0] ? serializeSlotRow(rows[0]) : null;
}

async function convertHostCalendarsOnBook({
  slot,
  schoolAgencyId,
  schoolLabel,
  modality,
  locationText,
  hostUserIds,
  extraAttendeeEmails,
}) {
  const [hostEvents] = await pool.execute(
    `SELECT h.*, u.email
     FROM school_reinit_checkin_slot_host_events h
     INNER JOIN users u ON u.id = h.host_user_id
     WHERE h.slot_id = ?`,
    [slot.id]
  );

  const title = bookedSchoolVisitTitle(modality, schoolLabel);
  let description = bookedSchoolVisitDescription(modality, schoolLabel, { locationText });

  let meetLink = null;
  const primaryHostEmail = String(hostEvents?.[0]?.email || '').trim().toLowerCase();
  const otherHostEmails = (hostEvents || [])
    .map((h) => String(h.email || '').trim().toLowerCase())
    .filter((e) => e && e !== primaryHostEmail);
  const attendeeBase = Array.from(new Set([...otherHostEmails, ...(extraAttendeeEmails || [])]));

  for (const he of hostEvents || []) {
    const email = String(he.email || '').trim().toLowerCase();
    const createMeet = modality === 'virtual' && !meetLink;
    let patched = null;
    description = bookedSchoolVisitDescription(modality, schoolLabel, {
      locationText,
      meetLink,
    });

    if (email && he.google_event_id && GoogleCalendarService.isConfigured()) {
      patched = await GoogleCalendarService.patchEventDetails({
        subjectEmail: email,
        eventId: he.google_event_id,
        summary: title,
        description,
        location: modality === 'in_person' ? locationText || schoolLabel : null,
        attendeeEmails: attendeeBase.filter((e) => e !== email),
        createMeetLink: createMeet,
      });
      if (patched?.meetLink) meetLink = patched.meetLink;
    } else if (email && GoogleCalendarService.isConfigured()) {
      // No prior Google event — create booked event
      const created = await GoogleCalendarService.createProviderScheduleEvent({
        subjectEmail: email,
        startAt: toMysqlDateTime(slot.starts_at),
        endAt: toMysqlDateTime(slot.ends_at),
        summary: title,
        description,
        kind: BOOKED_KIND,
        createMeetLink: createMeet,
        attendeeEmails: attendeeBase.filter((e) => e !== email),
      });
      if (created?.ok) {
        patched = created;
        if (created.meetLink) meetLink = created.meetLink;
        await pool.execute(
          `UPDATE school_reinit_checkin_slot_host_events
           SET google_event_id = ?, google_html_link = ?, google_meet_link = ?
           WHERE id = ?`,
          [created.eventId || null, created.htmlLink || null, created.meetLink || null, he.id]
        );
      }
    }

    if (he.provider_schedule_event_id) {
      try {
        // agency_id → school org so the school logo shows on the host calendar
        await pool.execute(
          `UPDATE provider_schedule_events
           SET kind = ?, title = ?, description = ?,
               agency_id = COALESCE(?, agency_id),
               google_meet_link = COALESCE(?, google_meet_link),
               google_event_id = COALESCE(?, google_event_id),
               google_html_link = COALESCE(?, google_html_link)
           WHERE id = ?`,
          [
            BOOKED_KIND,
            title,
            bookedSchoolVisitDescription(modality, schoolLabel, {
              locationText,
              meetLink: patched?.meetLink || meetLink || null,
            }),
            schoolAgencyId ? Number(schoolAgencyId) : null,
            patched?.meetLink || meetLink || null,
            patched?.eventId || null,
            patched?.htmlLink || null,
            he.provider_schedule_event_id,
          ]
        );
      } catch (e) {
        console.warn('[schoolReinitCheckin] PSE update failed', e?.message || e);
      }
    }

    if (patched?.meetLink || meetLink) {
      await pool.execute(
        `UPDATE school_reinit_checkin_slot_host_events
         SET google_meet_link = COALESCE(?, google_meet_link)
         WHERE id = ?`,
        [patched?.meetLink || meetLink, he.id]
      );
    }
  }

  // Ensure Meet exists: if virtual and still missing, create on primary host
  if (modality === 'virtual' && !meetLink && primaryHostEmail && GoogleCalendarService.isConfigured()) {
    const primary = (hostEvents || []).find(
      (h) => String(h.email || '').trim().toLowerCase() === primaryHostEmail
    );
    if (primary?.google_event_id) {
      const retry = await GoogleCalendarService.patchEventDetails({
        subjectEmail: primaryHostEmail,
        eventId: primary.google_event_id,
        summary: title,
        description,
        createMeetLink: true,
        attendeeEmails: attendeeBase,
      });
      if (retry?.meetLink) meetLink = retry.meetLink;
    }
  }

  void hostUserIds;
  return { meetLink, title, description };
}

/**
 * Create or update the school's yearly Fall School Check-in company_event
 * so the booking appears on school / caseload calendars.
 */
async function syncFallSchoolVisitCompanyEvent({
  agencyId,
  schoolOrganizationId,
  schoolYear,
  schoolLabel,
  modality,
  startsAt,
  endsAt,
  locationText,
  meetLink,
  actorUserId = null,
  hostUserIds = [],
}) {
  const Events = await import('./schoolPortalEvents.service.js');
  const title = bookedSchoolVisitTitle(modality, schoolLabel);
  const description = bookedSchoolVisitDescription(modality, schoolLabel, {
    locationText,
    meetLink,
  });
  const start = startsAt instanceof Date ? startsAt : new Date(String(startsAt).replace(' ', 'T'));
  const end = endsAt instanceof Date ? endsAt : new Date(String(endsAt).replace(' ', 'T'));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid booking times for school visit event');
  }

  const existing = await Events.findExistingSchoolEventForYear({
    organizationId: schoolOrganizationId,
    eventType: 'school_fall_check_in',
    schoolYear,
  });

  const userId =
    Number(actorUserId) ||
    Number(hostUserIds?.[0]) ||
    null;
  if (!userId) {
    console.warn('[schoolReinitCheckin] Skipping school visit company_event sync — no actor/host user id');
    return null;
  }

  if (existing?.id) {
    const updated = await Events.updateSchoolPortalEvent({
      eventId: existing.id,
      organizationId: schoolOrganizationId,
      agencyId,
      userId,
      title,
      description,
      category: 'fall_check_in',
      startsAt: start,
      endsAt: end,
      schoolEventStatus: 'scheduled',
    });
    return Number(updated?.id || existing.id);
  }

  const created = await Events.createSchoolPortalEvent({
    agencyId,
    organizationId: schoolOrganizationId,
    userId,
    title,
    description,
    category: 'fall_check_in',
    startsAt: start,
    endsAt: end,
    schoolEventStatus: 'scheduled',
    outreachTableInvited: false,
  });
  return Number(created?.id || 0) || null;
}

export async function bookCheckinSlot({ cycleId, slotId, modality: modalityRaw, actor }) {
  const S = await reinit();
  const cycle = await S.getCycleById(cycleId);
  if (!cycle) throw new Error('Cycle not found');
  if (cycle.status === 'finalized') throw new Error('Cycle is finalized');

  const existing = await getBookingForCycle(cycleId);
  if (existing) throw new Error('This school already has a fall check-in booking');

  const modality = normalizeModality(modalityRaw);
  const [slotRows] = await pool.execute(
    `SELECT * FROM school_reinit_checkin_slots WHERE id = ? LIMIT 1`,
    [slotId]
  );
  const slot = slotRows?.[0];
  if (!slot) throw new Error('Slot not found');
  if (Number(slot.agency_id) !== Number(cycle.agency_id)) throw new Error('Slot agency mismatch');
  if (String(slot.school_year) !== String(cycle.school_year)) throw new Error('Slot year mismatch');
  if (slot.status !== 'open' || !slot.is_active) throw new Error('Slot is not available');
  if (normalizeModality(slot.modality) !== modality) {
    throw new Error('Selected slot modality does not match your preference');
  }

  const campaign = await S.getCampaign(cycle.agency_id, cycle.school_year);
  const settings = serializeCampaignCheckin(campaign);
  const schoolLabel = await schoolName(cycle.school_organization_id);
  const locationText =
    modality === 'in_person'
      ? (await schoolAddressText(cycle.school_organization_id)) || schoolLabel
      : null;

  const extraUsers = await loadUsersByIds(settings.extraAttendeeUserIds);
  const extraEmails = extraUsers.map((u) => String(u.email || '').trim().toLowerCase()).filter(Boolean);

  const conn = await pool.getConnection();
  let bookingId = null;
  try {
    await conn.beginTransaction();
    const [lockRows] = await conn.execute(
      `SELECT * FROM school_reinit_checkin_slots WHERE id = ? FOR UPDATE`,
      [slotId]
    );
    const locked = lockRows?.[0];
    if (!locked || locked.status !== 'open') {
      throw new Error('Slot was just booked by another school');
    }

    const startsAt = toMysqlDateTime(locked.starts_at);
    const endsAt = toMysqlDateTime(
      locked.ends_at || addMinutes(locked.starts_at, locked.duration_minutes || settings.slotDurationMinutes)
    );

    const [ins] = await conn.execute(
      `INSERT INTO school_reinit_checkin_bookings
        (cycle_id, slot_id, agency_id, school_agency_id, modality, starts_at, ends_at,
         location_mode, location_text, status,
         booked_by_actor_type, booked_by_user_id, booked_by_display_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?)`,
      [
        cycleId,
        slotId,
        cycle.agency_id,
        cycle.school_organization_id,
        modality,
        startsAt,
        endsAt,
        modality === 'in_person' ? 'school' : 'virtual',
        locationText,
        actor?.actorType || null,
        actor?.userId || null,
        actor?.displayName || null,
      ]
    );
    bookingId = ins.insertId;

    await conn.execute(
      `UPDATE school_reinit_checkin_slots
       SET status = 'booked',
           booked_cycle_id = ?,
           booked_school_agency_id = ?,
           booked_at = NOW(),
           booked_count = 1
       WHERE id = ?`,
      [cycleId, cycle.school_organization_id, slotId]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const [refreshedRows] = await pool.execute(
    `SELECT * FROM school_reinit_checkin_slots WHERE id = ? LIMIT 1`,
    [slotId]
  );
  const refreshedSlot = refreshedRows?.[0] || slot;
  const calendarResult = await convertHostCalendarsOnBook({
    slot: refreshedSlot,
    schoolAgencyId: cycle.school_organization_id,
    schoolLabel,
    modality,
    locationText,
    hostUserIds: settings.hostUserIds,
    extraAttendeeEmails: extraEmails,
  });

  if (calendarResult.meetLink) {
    await pool.execute(
      `UPDATE school_reinit_checkin_bookings SET meet_link = ? WHERE id = ?`,
      [calendarResult.meetLink, bookingId]
    );
    await pool.execute(
      `UPDATE school_reinit_checkin_slots SET google_meet_link = ? WHERE id = ?`,
      [calendarResult.meetLink, slotId]
    );
  }

  let companyEventId = null;
  try {
    companyEventId = await syncFallSchoolVisitCompanyEvent({
      agencyId: cycle.agency_id,
      schoolOrganizationId: cycle.school_organization_id,
      schoolYear: cycle.school_year,
      schoolLabel,
      modality,
      startsAt: refreshedSlot?.starts_at || slot.starts_at,
      endsAt:
        refreshedSlot?.ends_at ||
        slot.ends_at ||
        addMinutes(slot.starts_at, slot.duration_minutes || settings.slotDurationMinutes),
      locationText,
      meetLink: calendarResult.meetLink || null,
      actorUserId: actor?.userId || null,
      hostUserIds: settings.hostUserIds,
    });
    if (companyEventId) {
      try {
        await pool.execute(
          `UPDATE school_reinit_checkin_bookings SET company_event_id = ? WHERE id = ?`,
          [companyEventId, bookingId]
        );
      } catch (e) {
        // Column may not exist until migration 1038 runs
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
    }
  } catch (e) {
    console.warn('[schoolReinitCheckin] Fall school visit company_event sync failed', e?.message || e);
  }

  await S.upsertSectionProgress({
    cycleId,
    sectionKey: 'fall_check_in',
    data: {
      fall_checkin_modality: modality,
      fall_checkin_slot_id: String(slotId),
      fall_checkin_booking_id: bookingId,
      fall_checkin_company_event_id: companyEventId,
      fall_checkin_starts_at: toMysqlDateTime(refreshedSlot?.starts_at || slot.starts_at),
      fall_checkin_ends_at: toMysqlDateTime(refreshedSlot?.ends_at || slot.ends_at),
      fall_checkin_meet_link: calendarResult.meetLink || null,
      fall_checkin_location: locationText,
    },
    reviewed: true,
    completed: true,
    actor,
  });

  return getBookingForCycle(cycleId);
}

export async function listSchoolStaffUserEmails(schoolOrganizationId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.first_name, u.last_name
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE u.role = 'school_staff'
       AND (u.status IS NULL OR UPPER(u.status) <> 'ARCHIVED')
     ORDER BY u.last_name, u.first_name`,
    [schoolOrganizationId]
  );
  return (rows || [])
    .map((r) => ({
      id: Number(r.id),
      email: String(r.email || '').trim().toLowerCase(),
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
    }))
    .filter((r) => r.email);
}

export async function inviteSchoolStaffOnFinalize(cycleId) {
  const S = await reinit();
  const cycle = await S.getCycleById(cycleId);
  if (!cycle) throw new Error('Cycle not found');

  const booking = await getBookingForCycle(cycleId);
  if (!booking) {
    throw new Error('Book a Fall Check-in slot before finalizing');
  }

  const staff = await listSchoolStaffUserEmails(cycle.school_organization_id);
  const staffEmails = staff.map((s) => s.email);

  const [hostEvents] = await pool.execute(
    `SELECT h.*, u.email
     FROM school_reinit_checkin_slot_host_events h
     INNER JOIN users u ON u.id = h.host_user_id
     WHERE h.slot_id = ?`,
    [booking.slot_id]
  );

  const campaign = await S.getCampaign(cycle.agency_id, cycle.school_year);
  const settings = serializeCampaignCheckin(campaign);
  const extras = await loadUsersByIds(settings.extraAttendeeUserIds);
  const extraEmails = extras.map((u) => String(u.email || '').trim().toLowerCase()).filter(Boolean);

  let meetLink = booking.meet_link || null;
  const schoolLabel = booking.school_name || (await schoolName(cycle.school_organization_id));
  const title = bookedSchoolVisitTitle(booking.modality, schoolLabel);
  const description =
    bookedSchoolVisitDescription(booking.modality, schoolLabel, {
      locationText: booking.location_text,
      meetLink,
    }) + '\nSchool staff invited on Year Update finalize.';

  for (const he of hostEvents || []) {
    const email = String(he.email || '').trim().toLowerCase();
    if (!email || !he.google_event_id || !GoogleCalendarService.isConfigured()) continue;
    const attendees = Array.from(
      new Set(
        [
          ...staffEmails,
          ...extraEmails,
          ...(hostEvents || []).map((h) => String(h.email || '').trim().toLowerCase()),
        ].filter((e) => e && e !== email)
      )
    );
    const patched = await GoogleCalendarService.patchEventDetails({
      subjectEmail: email,
      eventId: he.google_event_id,
      summary: title,
      description,
      location: booking.modality === 'in_person' ? booking.location_text || schoolLabel : null,
      attendeeEmails: attendees,
      createMeetLink: booking.modality === 'virtual' && !meetLink,
    });
    if (patched?.meetLink) meetLink = patched.meetLink;

    if (he.provider_schedule_event_id) {
      try {
        await pool.execute(
          `UPDATE provider_schedule_events
           SET kind = ?, title = ?, description = ?,
               agency_id = COALESCE(?, agency_id),
               google_meet_link = COALESCE(?, google_meet_link)
           WHERE id = ?`,
          [
            BOOKED_KIND,
            title,
            description,
            cycle.school_organization_id ? Number(cycle.school_organization_id) : null,
            patched?.meetLink || meetLink || null,
            he.provider_schedule_event_id,
          ]
        );
      } catch (e) {
        console.warn('[schoolReinitCheckin] Finalize PSE update failed', e?.message || e);
      }
    }
  }

  // Keep linked Fall School Check-in company event title/description in sync
  try {
    const companyEventId = await syncFallSchoolVisitCompanyEvent({
      agencyId: cycle.agency_id,
      schoolOrganizationId: cycle.school_organization_id,
      schoolYear: cycle.school_year,
      schoolLabel,
      modality: booking.modality,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      locationText: booking.location_text,
      meetLink,
      actorUserId: booking.booked_by_user_id || settings.hostUserIds?.[0] || null,
      hostUserIds: settings.hostUserIds,
    });
    if (companyEventId) {
      try {
        await pool.execute(
          `UPDATE school_reinit_checkin_bookings SET company_event_id = COALESCE(company_event_id, ?) WHERE id = ?`,
          [companyEventId, booking.id]
        );
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
    }
  } catch (e) {
    console.warn('[schoolReinitCheckin] Finalize school visit event sync failed', e?.message || e);
  }

  await pool.execute(
    `UPDATE school_reinit_checkin_bookings
     SET invited_school_staff_json = ?,
         invited_at = NOW(),
         meet_link = COALESCE(?, meet_link)
     WHERE id = ?`,
    [JSON.stringify(staff), meetLink, booking.id]
  );

  if (meetLink) {
    await pool.execute(
      `UPDATE school_reinit_checkin_slots SET google_meet_link = ? WHERE id = ?`,
      [meetLink, booking.slot_id]
    );
  }

  return getBookingForCycle(cycleId);
}

export async function deactivateCheckinSlot(slotId, agencyId) {
  const detail = await getCheckinSlotDetail(slotId);
  if (!detail) throw new Error('Slot not found');
  if (Number(detail.agency_id) !== Number(agencyId)) throw new Error('Forbidden');
  if (detail.status === 'booked') throw new Error('Cannot deactivate a booked slot');

  await pool.execute(
    `UPDATE school_reinit_checkin_slots
     SET is_active = 0, status = 'cancelled'
     WHERE id = ?`,
    [slotId]
  );

  for (const he of detail.hostEvents || []) {
    if (he.google_event_id && he.email && GoogleCalendarService.isConfigured()) {
      await GoogleCalendarService.deleteEvent({
        subjectEmail: String(he.email).toLowerCase(),
        eventId: he.google_event_id,
      }).catch(() => {});
    }
    if (he.provider_schedule_event_id) {
      await pool.execute(
        `UPDATE provider_schedule_events SET status = 'CANCELLED' WHERE id = ?`,
        [he.provider_schedule_event_id]
      ).catch(() => {});
    }
  }
  return { ok: true };
}
