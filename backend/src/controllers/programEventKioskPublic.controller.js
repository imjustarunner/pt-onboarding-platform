/**
 * Program-event kiosk (public) controller.
 *
 * Hosts the non–Skill Builders kiosk experience: roster + per-client
 * approved-pickup list + checkout-with-signature/photo flow. Uses the
 * same JWT issued by `unlockSkillBuildersEventKiosk` (kind=program_event)
 * so the PIN entry surface is shared and the staff doesn't need to
 * remember a different URL per event type.
 *
 * Why a separate controller from skillBuildersEventKioskPublic?
 * The Skill Builders endpoints are wired to skill-builders-specific
 * tables (`skills_groups`, `skill_builders_event_sessions`, etc.) that
 * do not exist for generic program events. Those events draw their
 * roster from `company_event_clients` and their session schedule from
 * `company_event_session_dates`. Trying to overload the same endpoints
 * with branching SQL for two completely different data shapes was
 * making the Skill Builders surface harder to read; keeping the program
 * variant in its own file lets each kiosk surface stay simple.
 */
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import KioskModel from '../models/Kiosk.model.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import {
  verifyKioskBearerForProgramEvent,
  assertKioskTokenMatchesSlugAndEvent
} from './skillBuildersEventKioskPublic.controller.js';
import {
  ageFromDateOfBirth,
  clientCheckoutBlocked,
  clientHasWalkHomeAuthorization,
  emptyKioskClientWaiverFields,
  finalizeKioskClientWaiverEntry,
  formatKioskClientDisplayName,
  mergeWaiverSectionsIntoKioskClient,
  parseWaiverSectionsJson
} from '../utils/kioskWaiverDisplay.util.js';
import {
  loadIntakeWaiverSectionsFallbackForClientIds,
  loadWaiverHistorySectionsFallbackForClientIds
} from '../services/guardianWaivers.service.js';
import {
  EVENT_DAY_KIOSK_ABSENCE_REASONS,
  loadClientConfirmationStatusByEvent,
  markEventDayClientAbsent
} from '../services/eventDayKioskAbsent.service.js';
import {
  loadLateContactsForEventDay,
  upsertEventDayLateContact
} from '../services/eventDayKioskLateContact.service.js';
import {
  loadCompanyEventDateStatusMap,
  recordKioskAttendanceIntent
} from '../services/companyEventClientDateStatus.service.js';
import {
  buildKioskClientWaiverEntry,
  getEventKioskClientCheckinSheet,
  saveEventKioskClientWaiverSection,
  saveKioskPickupsForClient
} from '../services/eventKioskClientCheckinWaiver.service.js';
import {
  loadCompanyEventRegistrationForKiosk
} from '../utils/eventKioskRegistration.util.js';
import {
  recordEventEmployeeClockIn,
  recordEventEmployeeClockOut
} from '../services/skillBuildersEventKioskPunch.service.js';
import {
  assertEmployeeCheckedInForEventDay,
  createObservationEntry,
  getObservationPresets,
  loadActivityOptionsForKioskObservation
} from '../services/skillBuildersSessionObservations.service.js';

const parsePositiveInt = (raw) => {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function safeJsonParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function parseColorPalette(raw) {
  return safeJsonParse(raw, null);
}

function normalizeStaffKioskPin(pin) {
  const p = String(pin || '').trim();
  return /^\d{4}$/.test(p) ? p : null;
}

function kioskIp(req) {
  return String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null;
}

/** Same rule as the event portal Participants tab — not still-in-queue registrants. */
const KIOSK_PARTICIPANT_ACTIVE_PREDICATE = `(cec.intake_outcome IS NULL OR cec.intake_outcome <> 'denied')`;
const KIOSK_PARTICIPANT_GRADUATED_PREDICATE =
  `(COALESCE(cec.treatment_plan_complete, 0) = 1 AND ${KIOSK_PARTICIPANT_ACTIVE_PREDICATE})`;

function isUnknownWorkflowColumnError(err) {
  const msg = String(err?.message || '');
  return msg.includes('Unknown column') &&
    (msg.includes('treatment_plan_complete') ||
      msg.includes('intake_outcome') ||
      msg.includes('intake_complete'));
}

async function loadKioskParticipantEnrollmentRows(eventId) {
  const baseSelectWithDob = `
    SELECT cec.client_id, c.full_name, c.initials, c.identifier_code, c.date_of_birth
    FROM company_event_clients cec
    INNER JOIN clients c ON c.id = cec.client_id`;
  const baseSelect = `
    SELECT cec.client_id, c.full_name, c.initials, c.identifier_code
    FROM company_event_clients cec
    INNER JOIN clients c ON c.id = cec.client_id`;

  const runQuery = async (selectSql) => {
    try {
      const [rows] = await pool.execute(
        `${selectSql}
         WHERE cec.company_event_id = ?
           AND (cec.is_active = TRUE OR cec.is_active IS NULL)
           AND ${KIOSK_PARTICIPANT_GRADUATED_PREDICATE}
         ORDER BY c.full_name ASC, c.id ASC`,
        [eventId]
      );
      return rows || [];
    } catch (err) {
      if (!isUnknownWorkflowColumnError(err)) throw err;
      const [rows] = await pool.execute(
        `${selectSql}
         WHERE cec.company_event_id = ?
           AND (cec.is_active = TRUE OR cec.is_active IS NULL)
         ORDER BY c.full_name ASC, c.id ASC`,
        [eventId]
      );
      return rows || [];
    }
  };

  try {
    return await runQuery(baseSelectWithDob);
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && !String(err?.message || '').includes('date_of_birth')) {
      throw err;
    }
    return runQuery(baseSelect);
  }
}

async function loadGuardiansForClientIds(clientIds) {
  const ids = [...new Set((clientIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT cg.client_id, cg.guardian_user_id,
              CONCAT(gu.first_name, ' ', gu.last_name) AS guardian_name,
              gu.email AS guardian_email,
              gu.phone_number AS guardian_phone
       FROM client_guardians cg
       INNER JOIN users gu ON gu.id = cg.guardian_user_id
       WHERE cg.client_id IN (${ph})
         AND (cg.access_enabled = 1 OR cg.access_enabled IS NULL)
       ORDER BY cg.client_id ASC, cg.id ASC`,
      ids
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function loadWaiverProfilesForClientIds(clientIds) {
  const ids = [...new Set((clientIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT client_id, guardian_user_id, sections_json, updated_at
       FROM guardian_client_waiver_profiles
       WHERE client_id IN (${ph})
       ORDER BY client_id ASC, updated_at ASC, id ASC`,
      ids
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

function pickupMatchesReleaseOption(entry, { releasedToName, releasedToPhone }) {
  const name = String(releasedToName || '').trim().toLowerCase();
  const phone = String(releasedToPhone || '').replace(/\D/g, '');
  if (!name) return false;
  return (entry.authorizedPickups || []).some((p) => {
    const pName = String(p?.name || '').trim().toLowerCase();
    const pPhone = String(p?.phone || '').replace(/\D/g, '');
    if (pName !== name) return false;
    if (phone && pPhone && phone !== pPhone) return false;
    return true;
  });
}

async function assertClientIsKioskParticipant(eventId, clientId) {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 AS ok
       FROM company_event_clients cec
       WHERE cec.company_event_id = ? AND cec.client_id = ?
         AND (cec.is_active = TRUE OR cec.is_active IS NULL)
         AND ${KIOSK_PARTICIPANT_GRADUATED_PREDICATE}
       LIMIT 1`,
      [eventId, clientId]
    );
    return !!rows?.[0]?.ok;
  } catch (err) {
    if (!isUnknownWorkflowColumnError(err)) throw err;
    const [rows] = await pool.execute(
      `SELECT 1 AS ok FROM company_event_clients
       WHERE company_event_id = ? AND client_id = ? LIMIT 1`,
      [eventId, clientId]
    );
    return !!rows?.[0]?.ok;
  }
}

/** Match agency roster queries — onboarded staff use ACTIVE_EMPLOYEE, not lowercase active. */
const KIOSK_STAFF_ACTIVE_USER_SQL =
  `(u.status = 'ACTIVE_EMPLOYEE' OR LOWER(COALESCE(u.status, '')) = 'active')`;

function buildProgramEventStaffRosterSubquery({ includeSkillsGroups = false } = {}) {
  const parts = [
    `SELECT cepa.provider_user_id AS uid
     FROM company_event_provider_assignments cepa
     WHERE cepa.company_event_id = ?`,
    `SELECT cesp.provider_user_id AS uid
     FROM company_event_session_providers cesp
     WHERE cesp.company_event_id = ?`
  ];
  if (includeSkillsGroups) {
    parts.push(
      `SELECT sgp.provider_user_id AS uid
       FROM skills_groups sg
       INNER JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?`
    );
  }
  return parts.join(' UNION ');
}

async function loadProgramEventStaff(eventId, agencyId) {
  const baseSelect = (includeSkillsGroups) =>
    `SELECT DISTINCT u.id, u.first_name, u.last_name
     FROM (${buildProgramEventStaffRosterSubquery({ includeSkillsGroups })}) roster
     INNER JOIN users u ON u.id = roster.uid
     WHERE ${KIOSK_STAFF_ACTIVE_USER_SQL}
     ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`;

  const paramsFor = (includeSkillsGroups) =>
    includeSkillsGroups ? [eventId, eventId, eventId, agencyId] : [eventId, eventId];

  try {
    const includeSkillsGroups = !!agencyId;
    const [rows] = await pool.execute(
      baseSelect(includeSkillsGroups),
      paramsFor(includeSkillsGroups)
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      try {
        const [rows] = await pool.execute(baseSelect(false), paramsFor(false));
        return rows || [];
      } catch (inner) {
        if (inner?.code === 'ER_NO_SUCH_TABLE') return [];
        throw inner;
      }
    }
    throw err;
  }
}

async function assertProgramEventStaff(eventId, agencyId, userId) {
  const staff = await loadProgramEventStaff(eventId, agencyId);
  return staff.some((s) => Number(s.id) === Number(userId));
}

async function insertEmployeeEventDayCheckin({ eventId, agencyId, userId, kioskDate, ip }) {
  await pool.execute(
    `INSERT INTO event_day_kiosk_checkins
       (company_event_id, agency_id, user_id, person_type, action, checked_in_at, kiosk_date, ip_address)
     VALUES (?, ?, ?, 'employee', 'check_in', NOW(), ?, ?)`,
    [eventId, agencyId, userId, kioskDate, ip]
  );
}

async function syncEmployeeStationCheckin({ agencyId, eventId, userId, kioskDate, ip }) {
  try {
    await insertEmployeeEventDayCheckin({ eventId, agencyId, userId, kioskDate, ip });
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { ok: false, tableMissing: true };
    }
    throw err;
  }

  const punch = await recordEventEmployeeClockIn(pool, {
    agencyId,
    eventId,
    userId,
    kioskDateYmd: kioskDate,
    source: 'event_station'
  });
  if (punch.error && punch.error.status !== 409) {
    return { ok: false, error: punch.error };
  }
  return {
    ok: true,
    punchId: punch.punchId || null,
    alreadyClockedIn: punch.error?.status === 409
  };
}

async function syncEmployeeStationCheckout({ agencyId, eventId, userId, kioskDate }) {
  await pool.execute(
    `UPDATE event_day_kiosk_checkins
     SET action = 'check_out', checked_out_at = NOW(), updated_at = NOW()
     WHERE company_event_id = ? AND user_id = ? AND kiosk_date = ? AND person_type = 'employee'`,
    [eventId, userId, kioskDate]
  ).catch(() => null);

  const punch = await recordEventEmployeeClockOut(pool, {
    agencyId,
    eventId,
    userId,
    source: 'event_station'
  });
  if (punch.error) {
    return { ok: false, error: punch.error };
  }
  return { ok: true, ...punch };
}

async function loadEventDayCheckins(eventId, today) {
  const baseCols = 'id, client_id, user_id, person_type, action, checked_in_at, checked_out_at, absence_reason';
  try {
    const [rows] = await pool.execute(
      `SELECT ${baseCols}, checked_in_by_name, checked_in_by_relationship
       FROM event_day_kiosk_checkins
       WHERE company_event_id = ? AND kiosk_date = ?`,
      [eventId, today]
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    // Migration 828 (attribution columns) not applied yet — read legacy columns.
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const [rows] = await pool.execute(
          `SELECT ${baseCols}
           FROM event_day_kiosk_checkins
           WHERE company_event_id = ? AND kiosk_date = ?`,
          [eventId, today]
        );
        return rows || [];
      } catch (inner) {
        if (inner?.code === 'ER_NO_SUCH_TABLE') return [];
        throw inner;
      }
    }
    throw err;
  }
}

function mapCheckinRows(rows) {
  return (rows || []).map((c) => ({
    id: Number(c.id),
    clientId: c.client_id ? Number(c.client_id) : null,
    userId: c.user_id ? Number(c.user_id) : null,
    personType: c.person_type,
    action: c.action,
    checkedInAt: c.checked_in_at,
    checkedOutAt: c.checked_out_at,
    absenceReason: c.absence_reason || null,
    checkedInByName: c.checked_in_by_name || null,
    checkedInByRelationship: c.checked_in_by_relationship || null
  }));
}

function normalizeDbDateToYmd(input) {
  if (!input) return '';
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return '';
    return input.toISOString().slice(0, 10);
  }
  const raw = String(input).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

/**
 * Decide whether the kiosk may record check-ins today and which calendar
 * date bucket to use (event timezone, not server UTC).
 */
async function resolveKioskDayContext(eventRow) {
  const tz = String(eventRow?.timezone || 'America/Denver').trim() || 'America/Denver';
  const todayYmd = utcDateToZonedYmd(new Date(), tz);

  let sessionDates = [];
  try {
    const [rows] = await pool.execute(
      `SELECT session_date
       FROM company_event_session_dates
       WHERE company_event_id = ?
       ORDER BY session_date ASC`,
      [eventRow.id]
    );
    sessionDates = (rows || [])
      .map((r) => normalizeDbDateToYmd(r.session_date))
      .filter(Boolean);
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  let isEventDay = false;
  if (sessionDates.length) {
    isEventDay = sessionDates.includes(todayYmd);
  } else if (eventRow.starts_at && eventRow.ends_at) {
    const startYmd = utcDateToZonedYmd(new Date(eventRow.starts_at), tz);
    const endYmd = utcDateToZonedYmd(new Date(eventRow.ends_at), tz);
    if (startYmd && endYmd) {
      isEventDay = todayYmd >= startYmd && todayYmd <= endYmd;
    }
  }

  const upcoming = sessionDates.filter((d) => d >= todayYmd);
  const nextEventDate = upcoming[0] || null;

  return {
    timezone: tz,
    todayYmd,
    isEventDay,
    kioskActive: isEventDay,
    sessionDates,
    nextEventDate
  };
}

function kioskInactiveResponse(res, kioskDay) {
  const next = kioskDay?.nextEventDate;
  const msg = next
    ? `Check-in is only available on scheduled event dates. Next session: ${next}.`
    : 'Check-in is only available on scheduled event dates.';
  return res.status(403).json({ error: { message: msg, code: 'KIOSK_NOT_EVENT_DAY' } });
}

async function assertKioskRecordingAllowed(agencyId, eventId, res) {
  const [evRows] = await pool.execute(
    `SELECT id, starts_at, ends_at, timezone FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
    [eventId, agencyId]
  );
  const ev = evRows?.[0];
  if (!ev) {
    res.status(404).json({ error: { message: 'Event not found' } });
    return null;
  }
  const kioskDay = await resolveKioskDayContext(ev);
  if (!kioskDay.kioskActive) {
    kioskInactiveResponse(res, kioskDay);
    return null;
  }
  return kioskDay;
}

/**
 * GET /api/public/program-event/agency/:slug/kiosk/events/:eventId/context
 *
 * Returns everything the program-event kiosk needs to render the
 * roster + checkout sheet for a single client tap:
 *   - event branding (agency + organization)
 *   - today's confirmed participants (graduated registrants on company_event_clients)
 *   - per-client approved-pickup list (from guardian_client_waiver_profiles)
 *   - per-client emergency contacts
 *   - per-client walk-home authorization (from the new waiver section)
 *   - existing release log entries for today (so already-released
 *     clients don't show up as still on-site)
 */
export const getProgramEventKioskContext = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });
    const { agencyId, eventId } = m;

    // Event + branding
    const [evRows] = await pool.execute(
      `SELECT ce.id, ce.title, ce.starts_at, ce.ends_at, ce.timezone, ce.event_type,
              ce.organization_id, ce.registration_form_url,
              a.name AS agency_name, a.logo_url AS agency_logo, a.color_palette AS agency_colors,
              org.name AS org_name, org.logo_url AS org_logo, org.color_palette AS org_colors
       FROM company_events ce
       JOIN agencies a ON a.id = ce.agency_id
       LEFT JOIN agencies org ON org.id = ce.organization_id
       WHERE ce.id = ? AND ce.agency_id = ? LIMIT 1`,
      [eventId, agencyId]
    );
    const ev = evRows?.[0];
    if (!ev) return res.status(404).json({ error: { message: 'Event not found' } });

    const kioskDay = await resolveKioskDayContext(ev);

    // Roster: participants only (same as event portal Participants tab — not
    // registrants still working through intake/treatment plan).
    let clientRows = [];
    try {
      clientRows = await loadKioskParticipantEnrollmentRows(eventId);
    } catch (err) {
      // company_event_clients may not exist on older databases; surface
      // a friendly "run the migration" message rather than 500ing.
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({
          error: { message: 'Program event tables not migrated. Run migrations 739/740/741.' }
        });
      }
      throw err;
    }

    const clientMap = new Map();
    for (const r of clientRows) {
      const cid = Number(r.client_id);
      if (!cid) continue;
      if (!clientMap.has(cid)) {
        clientMap.set(cid, {
          id: cid,
          fullName: r.full_name || r.initials || `Client ${cid}`,
          kioskDisplayName: formatKioskClientDisplayName(r.full_name || r.initials || `Client ${cid}`),
          initials: r.initials || '',
          identifierCode: r.identifier_code || '',
          dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null,
          ageYears: ageFromDateOfBirth(r.date_of_birth),
          guardians: [],
          ...emptyKioskClientWaiverFields()
        });
      }
    }

    const clientIds = [...clientMap.keys()];
    const confirmationByClient = await loadClientConfirmationStatusByEvent(eventId, clientIds);
    for (const [cid, entry] of clientMap) {
      const conf = confirmationByClient.get(Number(cid));
      entry.confirmationStatus = conf?.confirmationStatus || 'pending';
      entry.confirmationSetAt = conf?.confirmationSetAt || null;
      entry.confirmationSetMethod = conf?.confirmationSetMethod || null;
    }

    const [guardianRows, waiverRows, intakeWaiverFallback, historyWaiverFallback] = await Promise.all([
      loadGuardiansForClientIds(clientIds),
      loadWaiverProfilesForClientIds(clientIds),
      loadIntakeWaiverSectionsFallbackForClientIds(clientIds),
      loadWaiverHistorySectionsFallbackForClientIds(clientIds)
    ]);

    for (const g of guardianRows) {
      const entry = clientMap.get(Number(g.client_id));
      if (!entry || !g.guardian_user_id) continue;
      const userId = Number(g.guardian_user_id);
      if (entry.guardians.some((x) => x.userId === userId)) continue;
      entry.guardians.push({
        userId,
        name: g.guardian_name ? String(g.guardian_name).trim() : null,
        email: g.guardian_email || null,
        phone: g.guardian_phone || null
      });
    }

    for (const w of waiverRows) {
      const entry = clientMap.get(Number(w.client_id));
      if (!entry) continue;
      mergeWaiverSectionsIntoKioskClient(
        entry,
        parseWaiverSectionsJson(w.sections_json),
        w.updated_at
      );
    }

    for (const [clientId, { sections, updatedAt }] of intakeWaiverFallback) {
      const entry = clientMap.get(Number(clientId));
      if (!entry) continue;
      mergeWaiverSectionsIntoKioskClient(entry, sections, updatedAt, { fillMissingOnly: true });
    }

    for (const [clientId, { sections, updatedAt }] of historyWaiverFallback) {
      const entry = clientMap.get(Number(clientId));
      if (!entry) continue;
      mergeWaiverSectionsIntoKioskClient(entry, sections, updatedAt, { fillMissingOnly: true });
    }

    for (const c of clientMap.values()) {
      finalizeKioskClientWaiverEntry(c, c.guardians);
      c.checkoutBlocked = clientCheckoutBlocked(c);
      c.canSelfWalkHome = clientHasWalkHomeAuthorization(c) && Number(c.ageYears) >= 12;
    }

    const today = kioskDay.todayYmd;

    // Per-date attendance status set from the event portal (planned absence,
    // late arrival + time, removed-from-future) so the kiosk knows what to
    // expect for today.
    const dateStatusMap = await loadCompanyEventDateStatusMap({ companyEventId: eventId, sessionDate: today });
    for (const [cid, entry] of clientMap) {
      const st = dateStatusMap.get(Number(cid));
      entry.dateStatus = st
        ? {
            status: st.status,
            expectedArrivalTime: st.expectedArrivalTime || null,
            note: st.note || null
          }
        : null;
    }

    const staffRows = await loadProgramEventStaff(eventId, agencyId);
    const checkinRows = await loadEventDayCheckins(eventId, today);
    const lateContacts = await loadLateContactsForEventDay(eventId, today);
    const registration = await loadCompanyEventRegistrationForKiosk(pool, eventId, {
      registrationFormUrl: ev.registration_form_url
    });

    // Today's release log (so the kiosk can dim already-released kids).
    let releases = [];
    try {
      const [rows] = await pool.execute(
        `SELECT id, client_id, released_to_name, released_to_relationship,
                walk_home_alone, signed_at
         FROM company_event_releases
         WHERE company_event_id = ? AND DATE(signed_at) = ?
         ORDER BY signed_at DESC, id DESC
         LIMIT 500`,
        [eventId, today]
      );
      releases = rows || [];
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        // Migration 741 not applied yet — not a hard block, just no releases yet.
        releases = [];
      } else {
        throw err;
      }
    }

    res.json({
      ok: true,
      event: {
        id: Number(ev.id),
        title: ev.title || 'Program event',
        startsAt: ev.starts_at,
        endsAt: ev.ends_at,
        eventType: ev.event_type || null
      },
      branding: {
        agencyName: ev.agency_name || '',
        agencyLogo: ev.agency_logo || null,
        agencyColors: parseColorPalette(ev.agency_colors),
        orgName: ev.org_name || null,
        orgLogo: ev.org_logo || null,
        orgColors: parseColorPalette(ev.org_colors)
      },
      clients: Array.from(clientMap.values()),
      staff: staffRows.map((s) => ({
        id: Number(s.id),
        firstName: s.first_name || '',
        lastName: s.last_name || '',
        displayName: `${s.first_name || ''} ${s.last_name || ''}`.trim()
      })),
      checkins: mapCheckinRows(checkinRows),
      lateContacts,
      kioskDay: {
        timezone: kioskDay.timezone,
        todayYmd: kioskDay.todayYmd,
        isEventDay: kioskDay.isEventDay,
        kioskActive: kioskDay.kioskActive,
        sessionDates: kioskDay.sessionDates,
        nextEventDate: kioskDay.nextEventDate
      },
      releases: releases.map((r) => ({
        id: Number(r.id),
        clientId: Number(r.client_id),
        releasedToName: r.released_to_name,
        releasedToRelationship: r.released_to_relationship,
        walkHomeAlone: !!r.walk_home_alone,
        signedAt: r.signed_at
      })),
      registration,
      kioskDate: today,
      absenceReasons: EVENT_DAY_KIOSK_ABSENCE_REASONS
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/public/program-event/agency/:slug/kiosk/events/:eventId/checkin/client/absent
 * Record absent for today when family confirmed they are not attending.
 */
export const programEventClientAbsent = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const clientId = parsePositiveInt(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const result = await markEventDayClientAbsent({
      eventId: m.eventId,
      agencyId: m.agencyId,
      clientId,
      kioskDate: kioskDay.todayYmd,
      reasonCode: req.body?.reasonCode,
      reasonNotes: req.body?.reasonNotes,
      ipAddress: kioskIp(req)
    });
    if (result.error) {
      return res.status(result.error.status).json({
        error: { message: result.error.message, code: result.error.code || undefined }
      });
    }

    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

/** POST …/checkin/late-contact — log late-arrival family outreach */
export const programEventLateContact = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const clientId = parsePositiveInt(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const result = await upsertEventDayLateContact({
      eventId: m.eventId,
      agencyId: m.agencyId,
      clientId,
      kioskDate: kioskDay.todayYmd,
      staffUserId: parsePositiveInt(req.body?.staffUserId) || null,
      contactTarget: req.body?.contactTarget || null,
      contactMethod: req.body?.contactMethod || null,
      phoneOutcome: req.body?.phoneOutcome || null,
      replyStatus: req.body?.replyStatus || null,
      attendanceOutcome: req.body?.attendanceOutcome || null,
      absenceReason: req.body?.absenceReason || null,
      markContacted: req.body?.markContacted === true,
      reopenPending: req.body?.reopenPending === true,
      ipAddress: kioskIp(req)
    });
    if (result.error) {
      return res.status(result.error.status).json({
        error: { message: result.error.message, code: result.error.code || undefined }
      });
    }

    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/public/program-event/agency/:slug/kiosk/events/:eventId/checkout
 *
 * Logs a release event for one client. The body carries:
 *   - clientId: required
 *   - releasedToName: required (or "Walk home alone")
 *   - releasedToRelationship: optional
 *   - releasedToPhone: optional
 *   - walkHomeAlone: boolean
 *   - walkHomeSelfRelease: boolean (client age 12+ signs for walk-home)
 *   - signerSignatureData: required data URL (real e-signature)
 *   - signerSourceMethod: 'fresh_kiosk_signature' | 'walk_home_self' | 'reused_pickup_signature'
 *   - photoBase64: required release photo (data URL or base64-only)
 *   - photoContentType: e.g. 'image/jpeg'
 *   - notes: optional
 *
 * Signature audit fields (signed_at server-stamped, signed_ip, signed_user_agent)
 * are recorded automatically. The release photo is encrypted at rest in
 * GCS using the same KMS-wrapped AES-256-GCM scheme as insurance card
 * images, so only the storage key + wrapping metadata land in MySQL.
 */
export const submitProgramEventCheckout = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });
    const { agencyId, eventId } = m;

    const kioskDay = await assertKioskRecordingAllowed(agencyId, eventId, res);
    if (!kioskDay) return;

    const clientId = parsePositiveInt(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const signature = String(req.body?.signerSignatureData || '').trim();
    if (signature.length < 50) {
      return res.status(400).json({ error: { message: 'Signature is required to record this release' } });
    }

    const photoRaw = String(req.body?.photoBase64 || '').trim();
    if (!photoRaw) {
      return res.status(400).json({ error: { message: 'Release photo is required.' } });
    }

    const walkHomeAlone = req.body?.walkHomeAlone === true;
    const walkHomeSelfRelease = req.body?.walkHomeSelfRelease === true;
    const releasedToName = walkHomeAlone
      ? (walkHomeSelfRelease ? 'Walk home alone (client self-release)' : 'Walk home alone')
      : String(req.body?.releasedToName || '').trim();
    if (!releasedToName) {
      return res.status(400).json({ error: { message: 'Select who is picking up, or confirm walk-home authorization.' } });
    }
    const releasedToRelationship = String(req.body?.releasedToRelationship || '').trim() || null;
    const releasedToPhone = String(req.body?.releasedToPhone || '').trim() || null;
    const sourceMethod = walkHomeSelfRelease
      ? 'walk_home_self'
      : String(req.body?.signerSourceMethod || 'fresh_kiosk_signature');
    const notes = String(req.body?.notes || '').trim().slice(0, 500) || null;

    const isParticipant = await assertClientIsKioskParticipant(eventId, clientId);
    if (!isParticipant) {
      return res.status(403).json({ error: { message: 'Client is not a confirmed participant for this event' } });
    }

    const releaseEntry = await buildKioskClientWaiverEntry(clientId);
    if (!releaseEntry) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    if (clientCheckoutBlocked(releaseEntry)) {
      return res.status(409).json({
        error: {
          message: 'No authorized pickups or walk-home authorization on file. Update the guardian waiver before releasing this client.',
          code: 'RELEASE_NOT_AUTHORIZED'
        }
      });
    }

    if (walkHomeAlone) {
      if (!clientHasWalkHomeAuthorization(releaseEntry)) {
        return res.status(400).json({ error: { message: 'Walk-home authorization is not on file for this client.' } });
      }
      if (walkHomeSelfRelease && Number(releaseEntry.ageYears) < 12) {
        return res.status(400).json({ error: { message: 'Client self-release for walk-home requires age 12 or older.' } });
      }
    } else if (!pickupMatchesReleaseOption(releaseEntry, { releasedToName, releasedToPhone })) {
      return res.status(400).json({ error: { message: 'Selected pickup person is not on the approved list for this client.' } });
    }

    let photoFields = {
      photo_storage_key: null,
      photo_content_type: null,
      photo_encryption_key_id: null,
      photo_encryption_wrapped_key_b64: null,
      photo_encryption_iv_b64: null,
      photo_encryption_auth_tag_b64: null,
      photo_encryption_aad: null
    };
    try {
      const dataUrlMatch = photoRaw.match(/^data:([^;]+);base64,(.+)$/);
      const contentType = dataUrlMatch?.[1] || String(req.body?.photoContentType || 'image/jpeg');
      const base64 = dataUrlMatch?.[2] || photoRaw;
      const photoBuffer = Buffer.from(base64, 'base64');
      if (photoBuffer.length > 5 * 1024 * 1024) {
        return res.status(413).json({ error: { message: 'Release photo is too large (max 5 MB).' } });
      }
      const aad = `program-event-release/${agencyId}/${eventId}/${clientId}`;
      let enc;
      try {
        enc = await DocumentEncryptionService.encryptBuffer(photoBuffer, { aad });
      } catch (encErr) {
        console.warn('[program-event-kiosk] release photo encryption failed', encErr?.message);
        return res.status(503).json({ error: { message: 'Could not secure the release photo. Try again or contact support.' } });
      }
      const ext = contentType === 'image/png' ? 'png'
        : contentType === 'image/webp' ? 'webp'
        : 'jpg';
      const key = `program-event-releases/${agencyId}/${eventId}/${clientId}/${Date.now()}.${ext}`;
      const bucket = await StorageService.getGCSBucket();
      await bucket.file(key).save(enc.encryptedBuffer, {
        contentType,
        metadata: {
          metadata: {
            isEncrypted: '1',
            encryptionKeyId: enc.encryptionKeyId,
            encryptionWrappedKey: enc.encryptionWrappedKeyB64,
            encryptionIv: enc.encryptionIvB64,
            encryptionAuthTag: enc.encryptionAuthTagB64,
            encryptionAad: aad,
            agencyId: String(agencyId),
            eventId: String(eventId),
            clientId: String(clientId)
          }
        }
      });
      photoFields = {
        photo_storage_key: key,
        photo_content_type: contentType,
        photo_encryption_key_id: enc.encryptionKeyId,
        photo_encryption_wrapped_key_b64: enc.encryptionWrappedKeyB64,
        photo_encryption_iv_b64: enc.encryptionIvB64,
        photo_encryption_auth_tag_b64: enc.encryptionAuthTagB64,
        photo_encryption_aad: aad
      };
    } catch (photoErr) {
      console.warn('[program-event-kiosk] release photo upload failed', photoErr?.message);
      return res.status(503).json({ error: { message: 'Release photo upload failed. Please try again.' } });
    }

    if (!photoFields.photo_storage_key) {
      return res.status(503).json({ error: { message: 'Release photo could not be saved.' } });
    }

    // Server-stamp the audit trio.
    const ip = String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null;
    const ua = String(req.get?.('user-agent') || req.headers?.['user-agent'] || '').slice(0, 500) || null;

    let insertedId = null;
    try {
      const [result] = await pool.execute(
        `INSERT INTO company_event_releases
           (company_event_id, agency_id, client_id,
            released_to_name, released_to_relationship, released_to_phone, walk_home_alone,
            signer_signature_data, signer_signature_source_method,
            signed_at, signed_ip, signed_user_agent,
            photo_storage_key, photo_content_type,
            photo_encryption_key_id, photo_encryption_wrapped_key_b64,
            photo_encryption_iv_b64, photo_encryption_auth_tag_b64, photo_encryption_aad,
            notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId, agencyId, clientId,
          releasedToName, releasedToRelationship, releasedToPhone, walkHomeAlone ? 1 : 0,
          signature, sourceMethod,
          ip, ua,
          photoFields.photo_storage_key, photoFields.photo_content_type,
          photoFields.photo_encryption_key_id, photoFields.photo_encryption_wrapped_key_b64,
          photoFields.photo_encryption_iv_b64, photoFields.photo_encryption_auth_tag_b64, photoFields.photo_encryption_aad,
          notes
        ]
      );
      insertedId = Number(result?.insertId || 0) || null;
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Release log table not migrated. Run migration 741.' } });
      }
      throw err;
    }

    res.status(201).json({
      ok: true,
      releaseId: insertedId,
      clientId,
      releasedToName,
      releasedToRelationship,
      walkHomeAlone,
      photoCaptured: !!photoFields.photo_storage_key,
      signedAt: new Date().toISOString()
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST …/attendance-intent — record a family's upcoming-attendance answer at checkout.
 * Body: { clientId, entries: [{ sessionDate, attending }], reason }
 * Writes planned_absence rows for dates the family says they won't attend and
 * clears planned_absence for dates they confirm. Limited to this event's
 * materialized session dates that fall today or later.
 */
export const recordProgramEventAttendanceIntent = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const clientId = parsePositiveInt(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const isParticipant = await assertClientIsKioskParticipant(m.eventId, clientId);
    if (!isParticipant) {
      return res.status(403).json({ error: { message: 'Client is not a confirmed participant for this event' } });
    }

    // Constrain to this event's known session dates (today or later) so a bad
    // payload can't write arbitrary dates.
    const [dateRows] = await pool.execute(
      `SELECT session_date FROM company_event_session_dates WHERE company_event_id = ?`,
      [m.eventId]
    ).catch(() => [[]]);
    const validDates = new Set(
      (dateRows || []).map((r) => normalizeDbDateToYmd(r.session_date)).filter(Boolean)
    );

    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const entries = rawEntries
      .map((e) => ({
        sessionDate: String(e?.sessionDate || '').trim(),
        attending: e?.attending === true
      }))
      .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.sessionDate) && (!validDates.size || validDates.has(e.sessionDate)));

    if (!entries.length) {
      return res.status(400).json({ error: { message: 'No valid session dates provided' } });
    }

    try {
      await recordKioskAttendanceIntent({
        companyEventId: m.eventId,
        agencyId: m.agencyId,
        clientId,
        entries,
        reason: req.body?.reason ?? null
      });
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ error: { message: err.message } });
      throw err;
    }

    res.status(201).json({ ok: true, clientId });
  } catch (e) {
    next(e);
  }
};

/** GET …/checkin/client/:clientId/sheet — pickup list + waiver gate for guardian check-in */
export const getProgramEventClientCheckinSheet = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const clientId = parsePositiveInt(req.params.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const isParticipant = await assertClientIsKioskParticipant(m.eventId, clientId);
    if (!isParticipant) {
      return res.status(403).json({ error: { message: 'Client is not a confirmed participant for this event' } });
    }

    const guardianUserId = parsePositiveInt(req.query.guardianUserId) || null;
    const sheet = await getEventKioskClientCheckinSheet({
      companyEventId: m.eventId,
      clientId,
      guardianUserId
    });
    if (!sheet) return res.status(404).json({ error: { message: 'Client not found' } });

    res.json(sheet);
  } catch (e) {
    next(e);
  }
};

/** POST …/checkin/client/waiver-section — sign pickup (or esign) waiver at check-in */
export const postProgramEventClientWaiverSection = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const clientId = parsePositiveInt(req.body?.clientId);
    const guardianUserId = parsePositiveInt(req.body?.guardianUserId);
    const sectionKey = String(req.body?.sectionKey || '').trim();
    if (!clientId || !guardianUserId || !sectionKey) {
      return res.status(400).json({ error: { message: 'clientId, guardianUserId, and sectionKey are required' } });
    }

    const isParticipant = await assertClientIsKioskParticipant(m.eventId, clientId);
    if (!isParticipant) {
      return res.status(403).json({ error: { message: 'Client is not a confirmed participant for this event' } });
    }

    const act = String(req.body?.action || 'update').toLowerCase();
    if (act !== 'create' && act !== 'update') {
      return res.status(400).json({ error: { message: 'action must be create or update' } });
    }

    const result = await saveEventKioskClientWaiverSection({
      companyEventId: m.eventId,
      clientId,
      guardianUserId,
      sectionKey,
      payload: req.body?.payload,
      signatureData: req.body?.signatureData,
      consentAcknowledged: req.body?.consentAcknowledged,
      intentToSign: req.body?.intentToSign,
      action: act,
      ipAddress: kioskIp(req),
      userAgent: req.headers['user-agent'] || null
    });

    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    next(e);
  }
};

/** POST …/checkin/client — mark a client checked in for today */
export const programEventClientCheckin = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const clientId = parsePositiveInt(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const today = kioskDay.todayYmd;

    const isParticipant = await assertClientIsKioskParticipant(m.eventId, clientId);
    if (!isParticipant) {
      return res.status(403).json({ error: { message: 'Client is not a confirmed participant for this event' } });
    }

    const checkedInByName = String(req.body?.checkedInByName || '').trim().slice(0, 160) || null;
    const checkedInByRelationship = String(req.body?.checkedInByRelationship || '').trim().slice(0, 80) || null;
    const checkedInByUserId = parsePositiveInt(req.body?.checkedInByUserId) || null;
    const checkinSignature = String(req.body?.checkinSignatureData || '').trim() || null;

    const insertWithAttribution = () => pool.execute(
      `INSERT INTO event_day_kiosk_checkins
         (company_event_id, agency_id, client_id, person_type, action, checked_in_at, kiosk_date, ip_address,
          checked_in_by_name, checked_in_by_relationship, checked_in_by_user_id, checkin_signature_data)
       VALUES (?, ?, ?, 'client', 'check_in', NOW(), ?, ?, ?, ?, ?, ?)`,
      [
        m.eventId, m.agencyId, clientId, today, kioskIp(req),
        checkedInByName, checkedInByRelationship, checkedInByUserId, checkinSignature
      ]
    );
    const insertLegacy = () => pool.execute(
      `INSERT INTO event_day_kiosk_checkins
         (company_event_id, agency_id, client_id, person_type, action, checked_in_at, kiosk_date, ip_address)
       VALUES (?, ?, ?, 'client', 'check_in', NOW(), ?, ?)`,
      [m.eventId, m.agencyId, clientId, today, kioskIp(req)]
    );

    try {
      await insertWithAttribution();
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Run migration 615 for event-day check-ins' } });
      }
      // Migration 828 (attribution columns) not applied yet — fall back gracefully.
      if (err?.code === 'ER_BAD_FIELD_ERROR') {
        await insertLegacy();
      } else {
        throw err;
      }
    }

    res.status(201).json({
      ok: true,
      clientId,
      checkedInAt: new Date().toISOString(),
      checkedInByName,
      checkedInByRelationship
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/checkin/employee — check in staff by userId (tap name) */
export const programEventEmployeeCheckin = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const userId = parsePositiveInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });
    if (!(await assertProgramEventStaff(m.eventId, m.agencyId, userId))) {
      return res.status(403).json({ error: { message: 'Employee is not assigned to this event' } });
    }

    const today = kioskDay.todayYmd;
    const result = await syncEmployeeStationCheckin({
      agencyId: m.agencyId,
      eventId: m.eventId,
      userId,
      kioskDate: today,
      ip: kioskIp(req)
    });
    if (result.tableMissing) {
      return res.status(503).json({ error: { message: 'Run migration 615 for event-day check-ins' } });
    }
    if (!result.ok) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }

    res.status(201).json({
      ok: true,
      userId,
      checkedInAt: new Date().toISOString(),
      punchId: result.punchId,
      alreadyClockedIn: !!result.alreadyClockedIn
    });
  } catch (e) {
    next(e);
  }
};

async function findProgramEventStaffByPin(eventId, agencyId, pinHash) {
  const baseSql = (includeSkillsGroups) =>
    `SELECT DISTINCT u.id, u.first_name, u.last_name
     FROM users u
     JOIN user_preferences up ON up.user_id = u.id AND up.kiosk_pin_hash = ?
     JOIN (${buildProgramEventStaffRosterSubquery({ includeSkillsGroups })}) roster ON roster.uid = u.id
     WHERE ${KIOSK_STAFF_ACTIVE_USER_SQL}`;

  try {
    const [rows] = await pool.execute(
      baseSql(!!agencyId),
      agencyId ? [pinHash, eventId, eventId, eventId, agencyId] : [pinHash, eventId, eventId]
    );
    return rows || [];
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    const [rows] = await pool.execute(baseSql(false), [pinHash, eventId, eventId]).catch(() => [[]]);
    return rows || [];
  }
}

/** POST …/checkin/employee-pin — identify employee by 4-digit kiosk PIN */
export const programEventEmployeeCheckinByPin = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const pin = normalizeStaffKioskPin(req.body?.pin);
    if (!pin) return res.status(400).json({ error: { message: 'Enter your 4-digit personal kiosk PIN' } });
    const pinHash = KioskModel.hashPin(pin);

    const rows = await findProgramEventStaffByPin(m.eventId, m.agencyId, pinHash);

    if (!rows?.length) {
      return res.status(404).json({ error: { message: 'No employee on this event roster matches that PIN' } });
    }
    if (rows.length > 1) {
      return res.status(400).json({ error: { message: 'Multiple employees share this PIN. Tap your name instead.' } });
    }

    const user = rows[0];
    const today = kioskDay.todayYmd;
    const result = await syncEmployeeStationCheckin({
      agencyId: m.agencyId,
      eventId: m.eventId,
      userId: Number(user.id),
      kioskDate: today,
      ip: kioskIp(req)
    });
    if (result.tableMissing) {
      return res.status(503).json({ error: { message: 'Run migration 615 for event-day check-ins' } });
    }
    if (!result.ok) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }

    res.status(201).json({
      ok: true,
      userId: Number(user.id),
      displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      checkedInAt: new Date().toISOString(),
      punchId: result.punchId,
      alreadyClockedIn: !!result.alreadyClockedIn
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/checkout/employee — mark employee checked out */
export const programEventEmployeeCheckout = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const userId = parsePositiveInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });
    const today = kioskDay.todayYmd;

    const result = await syncEmployeeStationCheckout({
      agencyId: m.agencyId,
      eventId: m.eventId,
      userId,
      kioskDate: today
    });
    if (!result.ok) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }

    res.json({
      ok: true,
      userId,
      checkedOutAt: new Date().toISOString(),
      directHours: result.directHours,
      indirectHours: result.indirectHours,
      workedHours: result.workedHours,
      directClaimId: result.directClaimId,
      indirectClaimId: result.indirectClaimId
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST …/checkin/client/:clientId/pickups
 * Save kiosk-added authorized pickup contacts for a client.
 * No guardian e-signature required — operational kiosk-level data that
 * feeds directly into the client's pickup list and the event check-in sheet.
 */
export const programEventClientSaveKioskPickups = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const clientId = parsePositiveInt(req.params.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const isParticipant = await assertClientIsKioskParticipant(m.eventId, clientId);
    if (!isParticipant) {
      return res.status(403).json({ error: { message: 'Client is not a participant for this event' } });
    }

    const pickups = Array.isArray(req.body?.pickups) ? req.body.pickups : [];
    const addedByName = String(req.body?.addedByName || '').trim().slice(0, 255) || null;

    const saved = await saveKioskPickupsForClient({
      clientId,
      companyEventId: m.eventId,
      pickups,
      addedByName
    });

    // Return a refreshed sheet so the wizard can update its state
    const sheet = await getEventKioskClientCheckinSheet({
      companyEventId: m.eventId,
      clientId,
      guardianUserId: parsePositiveInt(req.body?.guardianUserId) || null
    });

    res.json({ ok: true, saved, sheet });
  } catch (e) {
    next(e);
  }
};

/** GET …/observation-config — presets + activity options only (no observation PHI). */
export const getProgramEventObservationConfig = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const [evRows] = await pool.execute(
      `SELECT ce.id, ce.timezone FROM company_events ce WHERE ce.id = ? AND ce.agency_id = ? LIMIT 1`,
      [m.eventId, m.agencyId]
    );
    const ev = evRows?.[0];
    if (!ev) return res.status(404).json({ error: { message: 'Event not found' } });

    const kioskDay = await resolveKioskDayContext(ev);
    const activityOptions = await loadActivityOptionsForKioskObservation({
      agencyId: m.agencyId,
      eventId: m.eventId,
      sessionDateYmd: kioskDay.todayYmd
    });

    res.json({
      ok: true,
      presets: getObservationPresets(),
      activityOptions,
      sessionDate: kioskDay.todayYmd
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/observations — write-only session observation log from kiosk Resources tab. */
export const postProgramEventObservation = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const kioskDay = await assertKioskRecordingAllowed(m.agencyId, m.eventId, res);
    if (!kioskDay) return;

    const clientId = parsePositiveInt(req.body?.clientId);
    const authorUserId = parsePositiveInt(req.body?.authorUserId);
    if (!clientId || !authorUserId) {
      return res.status(400).json({ error: { message: 'clientId and authorUserId are required' } });
    }

    const isParticipant = await assertClientIsKioskParticipant(m.eventId, clientId);
    if (!isParticipant) {
      return res.status(403).json({ error: { message: 'Client is not a participant for this event' } });
    }

    const onStaff = await assertProgramEventStaff(m.eventId, m.agencyId, authorUserId);
    if (!onStaff) {
      return res.status(403).json({ error: { message: 'Employee is not assigned to this event' } });
    }

    const checkedIn = await assertEmployeeCheckedInForEventDay({
      eventId: m.eventId,
      userId: authorUserId,
      kioskDateYmd: kioskDay.todayYmd
    });
    if (!checkedIn) {
      return res.status(403).json({ error: { message: 'Employee must be checked in before logging observations' } });
    }

    const sessionDate = normalizeDbDateToYmd(req.body?.sessionDate) || kioskDay.todayYmd;

    await createObservationEntry({
      agencyId: m.agencyId,
      companyEventId: m.eventId,
      clientId,
      authorUserId,
      sessionDateYmd: sessionDate,
      payload: req.body?.payload
    });

    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
};
