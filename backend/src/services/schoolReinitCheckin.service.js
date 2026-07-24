/**
 * Fall Check-in pre-slots: host calendars, modality gaps, book-on-pick, finalize invites.
 */
import pool from '../config/database.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import GoogleCalendarService from './googleCalendar.service.js';

export const PRESLOT_KIND = 'FALL_CHECKIN_PRESLOT';
export const BOOKED_KIND = 'FALL_CHECKIN_BOOKED';
export const PRESLOT_TITLE = '(fills in Fall Check-in)';

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

function toMysqlDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function addMinutes(dateLike, minutes) {
  const dt = new Date(dateLike);
  dt.setMinutes(dt.getMinutes() + Number(minutes || 0));
  return dt;
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
      `SELECT name, address, city, state, zip, street_address, mailing_address
       FROM agencies WHERE id = ? LIMIT 1`,
      [schoolAgencyId]
    );
    const a = rows?.[0];
    if (!a) return null;
    const parts = [
      a.street_address || a.address || a.mailing_address,
      [a.city, a.state].filter(Boolean).join(', '),
      a.zip,
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
       AND school_year = ?
       AND modality = ?
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

async function mirrorPreslotToHosts({ slot, campaign, createdByUserId }) {
  const settings = serializeCampaignCheckin(campaign);
  const hostIds = settings.hostUserIds;
  if (!hostIds.length) {
    throw new Error('Set at least one tenant host before creating check-in pre-slots');
  }
  const hosts = await loadUsersByIds(hostIds);
  if (!hosts.length) throw new Error('Host users not found');

  const startsAt = toMysqlDateTime(slot.starts_at);
  const endsAt = toMysqlDateTime(slot.ends_at || addMinutes(slot.starts_at, settings.slotDurationMinutes));
  const modalityLabel = slot.modality === 'virtual' ? 'Virtual' : 'In person';
  const description = `Fall Check-in pre-slot (${modalityLabel}). This block fills when a school books.`;

  const hostEventRows = [];
  for (const host of hosts) {
    const email = String(host.email || '').trim().toLowerCase();
    let google = { ok: false };
    if (email && GoogleCalendarService.isConfigured()) {
      google = await GoogleCalendarService.createProviderScheduleEvent({
        subjectEmail: email,
        startAt: startsAt,
        endAt: endsAt,
        summary: PRESLOT_TITLE,
        description,
        kind: PRESLOT_KIND,
        createMeetLink: false,
        attendeeEmails: [],
      });
    }

    let pse = null;
    try {
      pse = await ProviderScheduleEvent.create({
        agencyId: slot.agency_id,
        providerId: host.id,
        kind: PRESLOT_KIND,
        title: PRESLOT_TITLE,
        description,
        startAt: startsAt,
        endAt: endsAt,
        googleEventId: google?.eventId || null,
        googleHtmlLink: google?.htmlLink || null,
        googleMeetLink: null,
        createdByUserId: createdByUserId || null,
      });
    } catch (e) {
      console.warn('[schoolReinitCheckin] PSE create failed', e?.message || e);
    }

    await pool.execute(
      `INSERT INTO school_reinit_checkin_slot_host_events
        (slot_id, host_user_id, provider_schedule_event_id, google_event_id, google_html_link, google_meet_link)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         provider_schedule_event_id = VALUES(provider_schedule_event_id),
         google_event_id = VALUES(google_event_id),
         google_html_link = VALUES(google_html_link),
         google_meet_link = VALUES(google_meet_link)`,
      [
        slot.id,
        host.id,
        pse?.id || null,
        google?.eventId || null,
        google?.htmlLink || null,
        null,
      ]
    );
    hostEventRows.push({
      hostUserId: host.id,
      providerScheduleEventId: pse?.id || null,
      googleEventId: google?.eventId || null,
    });
  }
  return hostEventRows;
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
  const start = new Date(String(startsAt).replace(' ', 'T'));
  if (Number.isNaN(start.getTime())) throw new Error('Invalid startsAt');
  const duration = settings.slotDurationMinutes;
  const end = addMinutes(start, duration);
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
      toMysqlDateTime(start),
      toMysqlDateTime(end),
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
    ...slot,
    hostEvents: hosts || [],
    booking,
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
       AND s.school_year = ?
       ${includeInactive ? '' : 'AND s.is_active = 1'}
     ORDER BY s.starts_at ASC, s.modality ASC`,
    [agencyId, schoolYear]
  );
  return rows || [];
}

export async function listBookableCheckinSlots(agencyId, schoolYear, modalityRaw) {
  const modality = normalizeModality(modalityRaw);
  const [rows] = await pool.execute(
    `SELECT *
     FROM school_reinit_checkin_slots
     WHERE agency_id = ?
       AND school_year = ?
       AND modality = ?
       AND status = 'open'
       AND is_active = 1
     ORDER BY starts_at ASC`,
    [agencyId, schoolYear, modality]
  );
  return rows || [];
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
  return rows?.[0] || null;
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

  const title =
    modality === 'virtual'
      ? `Virtual Fall Check-in — ${schoolLabel}`
      : `In person ${schoolLabel}`;
  const description =
    modality === 'virtual'
      ? `Collaborative Year Update Fall Check-in (virtual) for ${schoolLabel}.`
      : `Collaborative Year Update Fall Check-in (in person) for ${schoolLabel}.${locationText ? `\nLocation: ${locationText}` : ''}`;

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
        await pool.execute(
          `UPDATE provider_schedule_events
           SET kind = ?, title = ?, description = ?, google_meet_link = COALESCE(?, google_meet_link),
               google_event_id = COALESCE(?, google_event_id),
               google_html_link = COALESCE(?, google_html_link)
           WHERE id = ?`,
          [
            BOOKED_KIND,
            title,
            description,
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
  void schoolAgencyId;
  return { meetLink, title, description };
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

  await S.upsertSectionProgress({
    cycleId,
    sectionKey: 'fall_check_in',
    data: {
      fall_checkin_modality: modality,
      fall_checkin_slot_id: String(slotId),
      fall_checkin_booking_id: bookingId,
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
  const title =
    booking.modality === 'virtual'
      ? `Virtual Fall Check-in — ${schoolLabel}`
      : `In person ${schoolLabel}`;

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
      description:
        booking.modality === 'virtual'
          ? `Fall Check-in (virtual) for ${schoolLabel}. School staff invited on Year Update finalize.`
          : `Fall Check-in (in person) for ${schoolLabel}. School staff invited on Year Update finalize.`,
      location: booking.modality === 'in_person' ? booking.location_text || schoolLabel : null,
      attendeeEmails: attendees,
      createMeetLink: booking.modality === 'virtual' && !meetLink,
    });
    if (patched?.meetLink) meetLink = patched.meetLink;
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
