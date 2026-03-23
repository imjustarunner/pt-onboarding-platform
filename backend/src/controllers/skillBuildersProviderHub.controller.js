import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import {
  resolveSkillBuildersProgramOrganizationId,
  buildSkillsGroupEventDescription,
  computeSkillsGroupEventWindow,
  updateSkillsGroupCompanyEvent
} from '../services/skillBuildersSkillsGroup.service.js';
import { parseJsonMaybe, makeGoogleCalendarUrl, computeNextOccurrence } from '../services/companyEvents.service.js';
import { replaceSkillsGroupMeetings } from '../services/skillsGroupMeetingsWrite.service.js';
import { materializeSkillBuildersEventSessions } from '../services/skillBuildersEventSessions.service.js';
import {
  normalizeSkillBuilderBlocks,
  totalMinutesForSkillBuilderBlocks,
  SKILL_BUILDER_MINUTES_PER_WEEK,
  replaceProviderSkillBuilderAvailabilityBlocks,
  upsertBiweeklySkillBuilderConfirmations
} from '../services/skillBuilderAvailabilityBlocks.service.js';
import {
  fetchCompanyEventDetailForEdit,
  persistCompanyEventUpdate
} from './companyEvents.controller.js';
import { ProviderAvailabilityService } from '../services/providerAvailability.service.js';
import {
  recordSkillBuilderEventClockIn,
  recordSkillBuilderEventClockOut
} from '../services/skillBuildersEventKioskPunch.service.js';
import { fetchSkillBuildersGroupProvidersForPortal } from '../services/skillBuildersEventProviders.service.js';
import multer from 'multer';
import StorageService from '../services/storage.service.js';
import {
  curriculumStorageKey,
  deleteCurriculumForSession,
  deleteClinicalNotesForSession,
  decryptClinicalNoteRow,
  generateH2014SessionClinicalNote,
  getClinicalNoteBySessionClient,
  getDecryptedCurriculumTextForSession,
  listClinicalNotesForSession,
  loadProgramDocumentRow,
  loadSessionCurriculumRow,
  processPdfUploadBuffer,
  programLibraryStorageKey,
  requireNoteAidEnabledForAgency,
  upsertClinicalNote,
  upsertCurriculumRecord
} from '../services/skillBuildersSessionClinical.service.js';

const curriculumUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (String(file.mimetype || '').toLowerCase() === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  }
});

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Before zoned windows, integrated skills_group events used starts_at = date T12:00:00.000Z. */
function looksLikeLegacySkillsGroupUtcNoonStart(startsAt) {
  const s = new Date(startsAt);
  if (!Number.isFinite(s.getTime())) return true;
  return (
    s.getUTCHours() === 12 &&
    s.getUTCMinutes() === 0 &&
    s.getUTCSeconds() === 0 &&
    s.getUTCMilliseconds() === 0
  );
}

/**
 * If company_events still uses legacy UTC-noon anchors (or UTC timezone) but a skills_group is linked,
 * return canonical window from skills group dates + agency office TZ. Otherwise null.
 */
async function getCanonicalSkillsGroupWindowIfLegacy(agencyId, eventId, { eventType, timezone, startsAt }) {
  if (String(eventType || '').toLowerCase() !== 'skills_group') return null;
  const tzRaw = String(timezone || '').trim();
  const legacyTz = !tzRaw || tzRaw.toUpperCase() === 'UTC';
  const legacyStart = looksLikeLegacySkillsGroupUtcNoonStart(startsAt);
  if (!legacyTz && !legacyStart) return null;

  const [sgRows] = await pool.execute(
    `SELECT start_date, end_date FROM skills_groups WHERE company_event_id = ? AND agency_id = ? LIMIT 1`,
    [eventId, agencyId]
  );
  const sg = sgRows?.[0];
  if (!sg) return null;

  const agencyTz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });
  return computeSkillsGroupEventWindow(sg.start_date, sg.end_date, agencyTz);
}

async function mergeCanonicalSkillsGroupWindowForEditFetch(agencyId, eventId, bundle) {
  if (!bundle) return bundle;
  const win = await getCanonicalSkillsGroupWindowIfLegacy(agencyId, eventId, {
    eventType: bundle.eventType,
    timezone: bundle.timezone,
    startsAt: bundle.startsAt
  });
  if (!win) return bundle;
  return { ...bundle, startsAt: win.startsAt, endsAt: win.endsAt, timezone: win.timeZone };
}

async function userHasAgencyAccess(req, agencyId) {
  if (!agencyId) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user?.id);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

/** Admin / staff / support with membership in this agency (plus super_admin). */
async function isAgencyStaffLikeForSkillBuilders(req, agencyId) {
  if (!(await userHasAgencyAccess(req, agencyId))) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  return role === 'admin' || role === 'staff' || role === 'support';
}

/** Staff/support/admin/super_admin or Skill Builder coordinator flag. */
async function canManageTeamSchedulesForAgency(req, agencyId) {
  if (!(await userHasAgencyAccess(req, agencyId))) return false;
  if (await isAgencyStaffLikeForSkillBuilders(req, agencyId)) return true;
  const uid = parsePositiveInt(req.user?.id);
  return await getSkillBuilderCoordinatorAccess(uid);
}

async function providerOnEventRoster(eventId, agencyId, providerUserId) {
  const pid = parsePositiveInt(providerUserId);
  if (!pid) return false;
  const [r] = await pool.execute(
    `SELECT 1 AS ok FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
     WHERE sg.company_event_id = ? AND sg.agency_id = ? AND sgp.provider_user_id = ?
     LIMIT 1`,
    [eventId, agencyId, pid]
  );
  return !!r?.[0]?.ok;
}

async function getSkillBuilderCoordinatorAccess(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const v = rows?.[0]?.has_skill_builder_coordinator_access;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function getSkillBuilderEligibility(userId) {
  try {
    const [rows] = await pool.execute(`SELECT skill_builder_eligible FROM users WHERE id = ? LIMIT 1`, [userId]);
    const v = rows?.[0]?.skill_builder_eligible;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

/** Google + ICS paths for portal (matches company event calendar semantics; ICS is full DB window from agency endpoint). */
function buildSkillBuilderPortalCalendar(evRow) {
  const recurrence = parseJsonMaybe(evRow.recurrence_json) || { frequency: 'none' };
  const base = {
    id: Number(evRow.id),
    agencyId: Number(evRow.agency_id),
    title: evRow.title,
    description: evRow.description || '',
    splashContent: evRow.splash_content || '',
    startsAt: evRow.starts_at,
    endsAt: evRow.ends_at,
    timezone: evRow.timezone || 'UTC',
    recurrence
  };
  const nextOccurrence = computeNextOccurrence(base);
  const calendarSource = nextOccurrence || { startsAt: base.startsAt, endsAt: base.endsAt };
  const googleCalendarUrl = makeGoogleCalendarUrl({
    ...base,
    startsAt: calendarSource.startsAt,
    endsAt: calendarSource.endsAt
  });
  const icsUrl = `/api/agencies/${base.agencyId}/company-events/${base.id}/ics`;
  const freq = String(recurrence.frequency || 'none').toLowerCase();
  const hasRecurrence = freq === 'weekly' || freq === 'monthly';
  return {
    googleCalendarUrl,
    icsUrl,
    hasRecurrence,
    note: hasRecurrence
      ? 'Recurrence is included where Google supports it; download ICS for other apps.'
      : 'One calendar block covers the full program window (start through end dates).'
  };
}

async function resolveProgramOrg(conn, agencyId) {
  const pid = await resolveSkillBuildersProgramOrganizationId(conn, agencyId);
  if (!pid) return null;
  const [rows] = await conn.execute(`SELECT id, name FROM agencies WHERE id = ? LIMIT 1`, [pid]);
  const r = rows?.[0];
  return r ? { id: Number(r.id), name: String(r.name || '').trim() || 'Skill Builders' } : null;
}

function formatEventRow(row) {
  const t = (v) => (v != null && v !== '' ? String(v).slice(0, 8) : null);
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    organizationId: row.organization_id != null ? Number(row.organization_id) : null,
    title: row.title,
    description: row.description || '',
    eventType: row.event_type || 'company_event',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone || 'UTC',
    isActive: !!(row.is_active === true || row.is_active === 1),
    skillBuilderDirectHours:
      row.skill_builder_direct_hours != null && row.skill_builder_direct_hours !== ''
        ? Number(row.skill_builder_direct_hours)
        : null,
    learningProgramClassId: row.learning_program_class_id ? Number(row.learning_program_class_id) : null,
    clientCheckInDisplayTime: t(row.client_check_in_display_time),
    clientCheckOutDisplayTime: t(row.client_check_out_display_time),
    employeeReportTime: t(row.employee_report_time),
    employeeDepartureTime: t(row.employee_departure_time),
    registrationEligible: !!(row.registration_eligible === 1 || row.registration_eligible === true),
    medicaidEligible: !!(row.medicaid_eligible === 1 || row.medicaid_eligible === true),
    cashEligible: !!(row.cash_eligible === 1 || row.cash_eligible === true),
    virtualSessionsEnabled:
      row.virtual_sessions_enabled === undefined || row.virtual_sessions_enabled === null
        ? true
        : !!(row.virtual_sessions_enabled === 1 || row.virtual_sessions_enabled === true)
  };
}

/** GET /api/skill-builders/me/program?agencyId= */
export const getMySkillBuildersProgram = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const uid = parsePositiveInt(req.user?.id);
    const coord = await getSkillBuilderCoordinatorAccess(uid);
    const elig = await getSkillBuilderEligibility(uid);
    if (!coord && !elig) {
      return res.status(403).json({ error: { message: 'Skill Builders access required' } });
    }
    const conn = await pool.getConnection();
    try {
      const program = await resolveProgramOrg(conn, agencyId);
      if (!program) {
        return res.status(404).json({ error: { message: 'Skill Builders program organization not found for this agency' } });
      }
      res.json({ ok: true, agencyId, organizationId: program.id, organizationName: program.name });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/** GET /api/skill-builders/me/assigned-events?agencyId= */
export const listMyAssignedSkillBuilderEvents = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    const elig = await getSkillBuilderEligibility(userId);
    if (!coord && !elig) return res.status(403).json({ error: { message: 'Skill Builders access required' } });

    const [rows] = await pool.execute(
      `SELECT ce.*,
              sg.id AS skills_group_id,
              sg.name AS skills_group_name,
              school.id AS school_organization_id,
              school.name AS school_name
       FROM skills_group_providers sgp
       INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
       INNER JOIN company_events ce ON ce.id = sg.company_event_id AND ce.agency_id = sg.agency_id
       INNER JOIN agencies school ON school.id = sg.organization_id
       WHERE sgp.provider_user_id = ?
         AND (ce.is_active = TRUE OR ce.is_active IS NULL)
       ORDER BY ce.starts_at DESC, ce.id DESC
       LIMIT 200`,
      [agencyId, userId]
    );
    const events = (rows || []).map((r) => ({
      ...formatEventRow(r),
      skillsGroupId: Number(r.skills_group_id),
      skillsGroupName: r.skills_group_name || '',
      schoolOrganizationId: Number(r.school_organization_id),
      schoolName: r.school_name || ''
    }));
    res.json({ ok: true, events });
  } catch (e) {
    next(e);
  }
};

/** GET /api/skill-builders/me/upcoming-events?agencyId= — events user may apply to */
export const listUpcomingSkillBuilderEventsForApply = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const elig = await getSkillBuilderEligibility(userId);
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    if (!coord && !elig) return res.status(403).json({ error: { message: 'Skill Builders access required' } });

    const conn = await pool.getConnection();
    try {
      const program = await resolveProgramOrg(conn, agencyId);
      if (!program) return res.json({ ok: true, events: [] });

      const [rows] = await pool.execute(
        `SELECT ce.*,
                sg.id AS skills_group_id,
                sg.name AS skills_group_name,
                school.id AS school_organization_id,
                school.name AS school_name,
                sgp.provider_user_id AS already_assigned,
                app.status AS application_status
         FROM company_events ce
         INNER JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
         INNER JOIN agencies school ON school.id = sg.organization_id
         LEFT JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id AND sgp.provider_user_id = ?
         LEFT JOIN company_event_provider_applications app
           ON app.company_event_id = ce.id AND app.user_id = ? AND app.status IN ('pending','approved')
         WHERE ce.agency_id = ?
           AND ce.organization_id = ?
           AND (ce.is_active = TRUE OR ce.is_active IS NULL)
           AND ce.ends_at >= NOW()
           AND sgp.provider_user_id IS NULL
         ORDER BY ce.starts_at ASC, ce.id ASC
         LIMIT 200`,
        [userId, userId, agencyId, program.id]
      );
      const events = (rows || []).map((r) => ({
        ...formatEventRow(r),
        skillsGroupId: Number(r.skills_group_id),
        skillsGroupName: r.skills_group_name || '',
        schoolOrganizationId: Number(r.school_organization_id),
        schoolName: r.school_name || '',
        applicationStatus: r.application_status || null
      }));
      res.json({ ok: true, events });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/** POST /api/skill-builders/me/applications { agencyId, companyEventId } */
export const applyToSkillBuilderEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const companyEventId = parsePositiveInt(req.body?.companyEventId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !companyEventId || !userId) {
      return res.status(400).json({ error: { message: 'agencyId and companyEventId are required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    const elig = await getSkillBuilderEligibility(userId);
    if (!coord && !elig) {
      return res.status(403).json({ error: { message: 'Skill Builder eligibility or coordinator access required' } });
    }

    const [evRows] = await pool.execute(
      `SELECT ce.id, ce.agency_id, sg.id AS skills_group_id
       FROM company_events ce
       INNER JOIN skills_groups sg ON sg.company_event_id = ce.id
       WHERE ce.id = ? AND ce.agency_id = ? LIMIT 1`,
      [companyEventId, agencyId]
    );
    if (!evRows?.[0]) return res.status(404).json({ error: { message: 'Event not found' } });

    await pool.execute(
      `INSERT INTO company_event_provider_applications (company_event_id, user_id, status, note)
       VALUES (?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE status = IF(status = 'withdrawn', 'pending', status), updated_at = CURRENT_TIMESTAMP`,
      [companyEventId, userId, String(req.body?.note || '').slice(0, 2000) || null]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Applications table not migrated' } });
    }
    next(e);
  }
};

/** GET /api/skill-builders/me/clients?agencyId= */
export const listMySkillBuilderEventClients = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    const elig = await getSkillBuilderEligibility(userId);
    if (!coord && !elig) return res.status(403).json({ error: { message: 'Skill Builders access required' } });

    const [rows] = await pool.execute(
      `SELECT DISTINCT c.id,
              c.initials,
              c.identifier_code,
              c.status,
              sg.id AS skills_group_id,
              sg.name AS skills_group_name,
              school.name AS school_name
       FROM skills_group_clients sgc
       INNER JOIN skills_group_providers sgp ON sgp.skills_group_id = sgc.skills_group_id AND sgp.provider_user_id = ?
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
       INNER JOIN clients c ON c.id = sgc.client_id AND c.agency_id = sg.agency_id
       LEFT JOIN agencies school ON school.id = sg.organization_id
       WHERE (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
         AND (sgc.active_for_providers = 1 OR sgc.active_for_providers IS TRUE)
         AND COALESCE(c.skill_builders_intake_complete, 0) = 1
         AND COALESCE(c.skill_builders_treatment_plan_complete, 0) = 1
       ORDER BY school.name ASC, sg.name ASC, c.initials ASC
       LIMIT 500`,
      [userId, agencyId]
    );
    res.json({ ok: true, clients: rows || [] });
  } catch (e) {
    next(e);
  }
};

async function fetchSkillBuilderWorkScheduleData(agencyId, providerUserId, weekStartRaw) {
  const ws = String(weekStartRaw || '').trim();
  const weekStart =
    ws && /^\d{4}-\d{2}-\d{2}$/.test(ws)
      ? ws
      : (() => {
          const d = new Date();
          const day = d.getUTCDay();
          const diff = (day + 6) % 7;
          const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
          return mon.toISOString().slice(0, 10);
        })();

  const [blockRows] = await pool.execute(
    `SELECT day_of_week, block_type, start_time, end_time, depart_from, depart_time, is_booked
     FROM provider_skill_builder_availability
     WHERE agency_id = ? AND provider_id = ?
     ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
    [agencyId, providerUserId]
  );
  const skillBuilderBlocks = (blockRows || []).map((b) => ({
    dayOfWeek: b.day_of_week,
    blockType: b.block_type,
    startTime: String(b.start_time || '').slice(0, 5),
    endTime: String(b.end_time || '').slice(0, 5),
    departFrom: String(b.depart_from || '').trim(),
    departTime: b.depart_time ? String(b.depart_time).slice(0, 5) : '',
    isBooked: b.is_booked === true || b.is_booked === 1
  }));

  const [meetingRows] = await pool.execute(
    `SELECT sg.id AS skills_group_id,
            sg.name AS skills_group_name,
            m.weekday,
            m.start_time,
            m.end_time,
            school.name AS school_name
     FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
     INNER JOIN skills_group_meetings m ON m.skills_group_id = sg.id
     LEFT JOIN agencies school ON school.id = sg.organization_id
     WHERE sgp.provider_user_id = ?
     ORDER BY FIELD(m.weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), m.start_time ASC`,
    [agencyId, providerUserId]
  );
  const meetings = (meetingRows || []).map((m) => ({
    skillsGroupId: Number(m.skills_group_id),
    skillsGroupName: m.skills_group_name,
    schoolName: m.school_name,
    weekday: m.weekday,
    startTime: String(m.start_time || '').slice(0, 8),
    endTime: String(m.end_time || '').slice(0, 8)
  }));

  const [eventRows] = await pool.execute(
    `SELECT ce.id, ce.title, ce.starts_at, ce.ends_at, sg.name AS skills_group_name, school.name AS school_name
     FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
     INNER JOIN company_events ce ON ce.id = sg.company_event_id
     LEFT JOIN agencies school ON school.id = sg.organization_id
     WHERE sgp.provider_user_id = ?
       AND (ce.is_active = TRUE OR ce.is_active IS NULL)
     ORDER BY ce.starts_at ASC
     LIMIT 100`,
    [agencyId, providerUserId]
  );
  const events = (eventRows || []).map((r) => ({
    id: Number(r.id),
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    skillsGroupName: r.skills_group_name,
    schoolName: r.school_name
  }));

  const conn = await pool.getConnection();
  let programOrgId = null;
  try {
    const program = await resolveProgramOrg(conn, agencyId);
    programOrgId = program?.id || null;
  } finally {
    conn.release();
  }

  const upParams = [providerUserId, providerUserId, agencyId];
  let upSql = `SELECT ce.id, ce.title, ce.starts_at, ce.ends_at, sg.name AS skills_group_name, school.name AS school_name,
       app.status AS application_status
     FROM company_events ce
     INNER JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     INNER JOIN agencies school ON school.id = sg.organization_id
     LEFT JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id AND sgp.provider_user_id = ?
     LEFT JOIN company_event_provider_applications app
       ON app.company_event_id = ce.id AND app.user_id = ? AND app.status IN ('pending','approved')
     WHERE ce.agency_id = ?
       AND (ce.is_active = TRUE OR ce.is_active IS NULL)
       AND ce.ends_at >= NOW()
       AND sgp.provider_user_id IS NULL`;
  if (programOrgId) {
    upSql += ` AND ce.organization_id = ?`;
    upParams.push(programOrgId);
  }
  upSql += ` ORDER BY ce.starts_at ASC LIMIT 50`;
  const [upRows] = await pool.execute(upSql, upParams);
  const upcomingOpen = (upRows || []).map((r) => ({
    id: Number(r.id),
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    skillsGroupName: r.skills_group_name,
    schoolName: r.school_name,
    applicationStatus: r.application_status != null ? String(r.application_status) : null
  }));

  return {
    weekStart,
    skillBuilderBlocks,
    meetings,
    assignedEvents: events,
    upcomingOpenEvents: upcomingOpen
  };
}

/** GET /api/skill-builders/me/work-schedule?agencyId=&weekStart=YYYY-MM-DD */
export const getMySkillBuilderWorkSchedule = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    const elig = await getSkillBuilderEligibility(userId);
    if (!coord && !elig) return res.status(403).json({ error: { message: 'Skill Builders access required' } });

    const bundle = await fetchSkillBuilderWorkScheduleData(agencyId, userId, req.query.weekStart);
    res.json({
      ok: true,
      agencyId,
      ...bundle
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/providers/:providerUserId/work-schedule?agencyId=&weekStart= */
export const getSkillBuilderEventProviderWorkSchedule = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const providerUserId = parsePositiveInt(req.params.providerUserId);
    if (!agencyId || !eventId || !providerUserId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and provider user id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await canManageTeamSchedulesForAgency(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }
    const onRoster = await providerOnEventRoster(eventId, agencyId, providerUserId);
    if (!onRoster) {
      return res.status(400).json({ error: { message: 'Provider is not on this event roster' } });
    }
    const bundle = await fetchSkillBuilderWorkScheduleData(agencyId, providerUserId, req.query.weekStart);
    res.json({ ok: true, agencyId, eventId, providerUserId, ...bundle });
  } catch (e) {
    next(e);
  }
};

/** PUT /api/skill-builders/events/:eventId/providers/:providerUserId/work-schedule */
export const putSkillBuilderEventProviderWorkSchedule = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const providerUserId = parsePositiveInt(req.params.providerUserId);
    if (!agencyId || !eventId || !providerUserId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and provider user id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await canManageTeamSchedulesForAgency(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }
    const onRoster = await providerOnEventRoster(eventId, agencyId, providerUserId);
    if (!onRoster) {
      return res.status(400).json({ error: { message: 'Provider is not on this event roster' } });
    }
    const elig = await getSkillBuilderEligibility(providerUserId);
    if (!elig) {
      return res.status(400).json({
        error: { message: 'This provider is not marked Skill Builder eligible; enable eligibility before setting availability.' }
      });
    }

    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const normalizedBlocks = normalizeSkillBuilderBlocks(blocks);
    if (normalizedBlocks.length === 0) {
      return res.status(400).json({ error: { message: 'At least one availability block is required.' } });
    }
    const totalMinutes = totalMinutesForSkillBuilderBlocks(normalizedBlocks);
    if (totalMinutes < SKILL_BUILDER_MINUTES_PER_WEEK) {
      return res.status(400).json({ error: { message: 'Skill Builder availability must total at least 6 hours per week.' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await replaceProviderSkillBuilderAvailabilityBlocks(conn, {
      agencyId,
      providerId: providerUserId,
      normalizedBlocks
    });
    await upsertBiweeklySkillBuilderConfirmations(conn, { agencyId, providerId: providerUserId });
    await conn.commit();

    const bundle = await fetchSkillBuilderWorkScheduleData(agencyId, providerUserId, req.body?.weekStart);
    res.json({
      ok: true,
      agencyId,
      eventId,
      providerUserId,
      totalHoursPerWeek: Math.round((totalMinutes / 60) * 100) / 100,
      ...bundle
    });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

async function assertEventDiscussionAccess({ req, agencyId, eventId }) {
  if (String(req.user?.role || '').toLowerCase() === 'school_staff') {
    return {
      error: {
        status: 403,
        message: 'Event discussion is for program staff. Open the Event portal from your agency program tools when you have access.'
      }
    };
  }
  return assertEventAccess({ req, agencyId, eventId });
}

async function assertEventAccess({ req, agencyId, eventId }) {
  const userId = parsePositiveInt(req.user?.id);
  const [evRows] = await pool.execute(
    `SELECT ce.*, sg.id AS skills_group_id
     FROM company_events ce
     LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     WHERE ce.id = ? AND ce.agency_id = ?
     LIMIT 1`,
    [eventId, agencyId]
  );
  const ev = evRows?.[0];
  if (!ev) return { error: { status: 404, message: 'Event not found' } };
  if (!(await userHasAgencyAccess(req, agencyId))) {
    return { error: { status: 403, message: 'Not authorized for this agency' } };
  }
  if (ev.skills_group_id && (await isAgencyStaffLikeForSkillBuilders(req, agencyId))) {
    return { ok: true, row: ev };
  }
  const coord = await getSkillBuilderCoordinatorAccess(userId);
  if (coord && Number(ev.agency_id) === agencyId) return { ok: true, row: ev };

  const [sgp] = await pool.execute(
    `SELECT 1 FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
     WHERE sg.company_event_id = ? AND sgp.provider_user_id = ?
     LIMIT 1`,
    [eventId, userId]
  );
  if (sgp?.[0]) return { ok: true, row: ev };
  return { error: { status: 403, message: 'Not assigned to this event' } };
}

async function assertClinicalSkillBuildersAccess(req, agencyId, eventId) {
  if (String(req.user?.role || '').toLowerCase() === 'school_staff') {
    return {
      error: { status: 403, message: 'Clinical notes are not available for school staff accounts.' }
    };
  }
  return assertEventAccess({ req, agencyId, eventId });
}

async function canManageSessionCurriculum(req, agencyId, eventId) {
  const access = await assertEventAccess({ req, agencyId, eventId });
  if (access.error) return access;
  if (await isAgencyStaffLikeForSkillBuilders(req, agencyId)) return { ok: true };
  const uid = parsePositiveInt(req.user?.id);
  if (await getSkillBuilderCoordinatorAccess(uid)) return { ok: true };
  const [r] = await pool.execute(
    `SELECT 1 FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
     WHERE sg.company_event_id = ? AND sgp.provider_user_id = ?
     LIMIT 1`,
    [eventId, uid]
  );
  if (r?.[0]) return { ok: true };
  return { error: { status: 403, message: 'Not authorized to manage session curriculum' } };
}

/** Library is scoped to overarching program org (nested events share the same PDF pool). */
async function assertProgramDocumentsAccess(req, agencyId, programOrganizationId) {
  const progId = parsePositiveInt(programOrganizationId);
  const aid = parsePositiveInt(agencyId);
  if (!progId || !aid) return { error: { status: 400, message: 'agencyId and program organization id required' } };
  if (!(await userHasAgencyAccess(req, aid))) {
    return { error: { status: 403, message: 'Not authorized for this agency' } };
  }
  if (await isAgencyStaffLikeForSkillBuilders(req, aid)) return { ok: true };
  const uid = parsePositiveInt(req.user?.id);
  if (await getSkillBuilderCoordinatorAccess(uid)) return { ok: true };
  const [r] = await pool.execute(
    `SELECT 1 FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
     INNER JOIN company_events ce ON ce.id = sg.company_event_id AND ce.agency_id = sg.agency_id
     WHERE sgp.provider_user_id = ? AND ce.agency_id = ? AND ce.organization_id = ?
     LIMIT 1`,
    [uid, aid, progId]
  );
  if (r?.[0]) return { ok: true };
  return { error: { status: 403, message: 'Not authorized for this program document library' } };
}

async function fetchProgramOrganizationIdForCompanyEvent(agencyId, eventId) {
  const [rows] = await pool.execute(
    `SELECT ce.organization_id AS ce_org, sg.skill_builders_program_organization_id AS sg_prog
     FROM company_events ce
     LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     WHERE ce.id = ? AND ce.agency_id = ?
     LIMIT 1`,
    [eventId, agencyId]
  );
  const ceOrg = rows?.[0]?.ce_org != null ? Number(rows[0].ce_org) : null;
  const sgProg = rows?.[0]?.sg_prog != null ? Number(rows[0].sg_prog) : null;
  if (Number.isFinite(ceOrg) && ceOrg > 0) return ceOrg;
  if (Number.isFinite(sgProg) && sgProg > 0) return sgProg;
  return null;
}

function mapProgramDocumentRowsToApi(rows) {
  return (rows || []).map((r) => {
    const fn = String(r.original_filename || '').trim() || 'document.pdf';
    const title =
      r.display_title != null && String(r.display_title).trim() ? String(r.display_title).trim().slice(0, 255) : null;
    return {
      id: Number(r.id),
      originalFilename: fn,
      displayTitle: title,
      displayLabel: title || fn,
      fileSizeBytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
      createdAt: r.created_at,
      mimeType: r.mime_type
    };
  });
}

async function clientOnEventRoster(clientId, eventId, agencyId) {
  const [r] = await pool.execute(
    `SELECT 1 FROM skills_group_clients sgc
     INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id
     WHERE sg.company_event_id = ? AND sg.agency_id = ? AND sgc.client_id = ?
     LIMIT 1`,
    [eventId, agencyId, clientId]
  );
  return !!r?.[0];
}

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_ABBR = {
  Monday: 'M',
  Tuesday: 'Tu',
  Wednesday: 'W',
  Thursday: 'Th',
  Friday: 'F',
  Saturday: 'Sa',
  Sunday: 'Su'
};

function formatWeekdaysShort(weekdaySet) {
  const parts = WEEKDAY_ORDER.filter((d) => weekdaySet.has(d)).map((d) => WEEKDAY_ABBR[d] || d.slice(0, 2));
  return parts.length ? parts.join(', ') : '—';
}

/** GET /api/skill-builders/events/directory?agencyId= — provider (assigned) or agency staff / SB coordinator (all program events) */
export const listSkillBuildersEventsDirectory = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const sbCoord = await getSkillBuilderCoordinatorAccess(userId);
    const eligible = await getSkillBuilderEligibility(userId);

    const conn = await pool.getConnection();
    let programOrgId = null;
    try {
      const program = await resolveProgramOrg(conn, agencyId);
      programOrgId = program?.id || null;
    } finally {
      conn.release();
    }
    if (!programOrgId) {
      return res.json({ ok: true, scope: 'none', events: [] });
    }

    let scope = 'provider';
    let rows = [];
    if (staffLike || sbCoord) {
      scope = 'agency';
      const [r] = await pool.execute(
        `SELECT ce.id,
                ce.title,
                ce.starts_at,
                ce.ends_at,
                ce.is_active,
                sg.id AS skills_group_id,
                sg.name AS skills_group_name,
                sg.organization_id AS school_organization_id,
                sch.name AS school_name,
                sch.logo_url AS school_logo_url,
                sch.logo_path AS school_logo_path
         FROM company_events ce
         INNER JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
         INNER JOIN agencies sch ON sch.id = sg.organization_id
         WHERE ce.agency_id = ?
           AND ce.organization_id = ?
         ORDER BY (ce.ends_at < NOW()) ASC, ce.ends_at DESC, ce.id DESC
         LIMIT 400`,
        [agencyId, programOrgId]
      );
      rows = r || [];
    } else if (eligible) {
      const [r] = await pool.execute(
        `SELECT ce.id,
                ce.title,
                ce.starts_at,
                ce.ends_at,
                ce.is_active,
                sg.id AS skills_group_id,
                sg.name AS skills_group_name,
                sg.organization_id AS school_organization_id,
                sch.name AS school_name,
                sch.logo_url AS school_logo_url,
                sch.logo_path AS school_logo_path
         FROM skills_group_providers sgp
         INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
         INNER JOIN company_events ce ON ce.id = sg.company_event_id AND ce.agency_id = sg.agency_id
         INNER JOIN agencies sch ON sch.id = sg.organization_id
         WHERE sgp.provider_user_id = ?
           AND ce.organization_id = ?
         ORDER BY (ce.ends_at < NOW()) ASC, ce.ends_at DESC, ce.id DESC
         LIMIT 300`,
        [agencyId, userId, programOrgId]
      );
      rows = r || [];
    } else {
      return res.status(403).json({ error: { message: 'Skill Builders access required' } });
    }

    const sgIds = [...new Set((rows || []).map((row) => Number(row.skills_group_id)).filter((n) => n > 0))];
    const weekMap = new Map();
    const provMap = new Map();
    if (sgIds.length) {
      const ph = sgIds.map(() => '?').join(',');
      const [mrows] = await pool.execute(
        `SELECT skills_group_id, weekday
         FROM skills_group_meetings
         WHERE skills_group_id IN (${ph})
         ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')`,
        sgIds
      );
      for (const m of mrows || []) {
        const id = Number(m.skills_group_id);
        if (!weekMap.has(id)) weekMap.set(id, new Set());
        weekMap.get(id).add(String(m.weekday || '').trim());
      }
      const [prows] = await pool.execute(
        `SELECT sgp.skills_group_id, u.id AS user_id, u.first_name, u.last_name
         FROM skills_group_providers sgp
         INNER JOIN users u ON u.id = sgp.provider_user_id
         WHERE sgp.skills_group_id IN (${ph})
         ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
        sgIds
      );
      for (const p of prows || []) {
        const id = Number(p.skills_group_id);
        if (!provMap.has(id)) provMap.set(id, []);
        provMap.get(id).push({
          id: Number(p.user_id),
          firstName: String(p.first_name || '').trim(),
          lastName: String(p.last_name || '').trim()
        });
      }
    }

    const nowMs = Date.now();
    const events = (rows || []).map((row) => {
      const sgId = Number(row.skills_group_id);
      const endsMs = new Date(row.ends_at || 0).getTime();
      const isPast = Number.isFinite(endsMs) && endsMs < nowMs;
      const wset = weekMap.get(sgId) || new Set();
      return {
        companyEventId: Number(row.id),
        title: row.title,
        skillsGroupId: sgId,
        skillsGroupName: row.skills_group_name || '',
        schoolOrganizationId: Number(row.school_organization_id),
        schoolName: row.school_name || '',
        schoolLogoUrl: row.school_logo_url || null,
        schoolLogoPath: row.school_logo_path || null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isActive: !!(row.is_active === true || row.is_active === 1),
        isPast,
        weekdaysShort: formatWeekdaysShort(wset),
        providers: provMap.get(sgId) || []
      };
    });

    res.json({ ok: true, scope, events });
  } catch (e) {
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/detail?agencyId= */
export const getSkillBuilderEventDetail = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const [sgRows] = await pool.execute(
      `SELECT sg.*, school.name AS school_name, school.id AS school_id, school.slug AS school_slug
       FROM skills_groups sg
       INNER JOIN agencies school ON school.id = sg.organization_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
       LIMIT 1`,
      [eventId, agencyId]
    );
    const sg = sgRows?.[0] || null;

    const providers = sg?.id ? await fetchSkillBuildersGroupProvidersForPortal(sg.id) : [];
    const userId = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    const rosterRestrict = !staffLike && !coord;

    const docCompleteClause = `
         AND COALESCE(c.skill_builders_intake_complete, 0) = 1
         AND COALESCE(c.skill_builders_treatment_plan_complete, 0) = 1`;
    const clientSql = rosterRestrict
      ? `SELECT c.id, c.initials, c.identifier_code
         FROM skills_group_clients sgc
         JOIN clients c ON c.id = sgc.client_id
         WHERE sgc.skills_group_id = ?
           AND (sgc.active_for_providers = 1 OR sgc.active_for_providers IS TRUE)
           ${docCompleteClause}
         ORDER BY c.initials ASC
         LIMIT 200`
      : `SELECT c.id, c.initials, c.identifier_code, c.document_status, c.paperwork_status_id,
                ps.label AS paperwork_status_label
         FROM skills_group_clients sgc
         JOIN clients c ON c.id = sgc.client_id
         LEFT JOIN paperwork_statuses ps ON ps.id = c.paperwork_status_id
         WHERE sgc.skills_group_id = ?
           ${docCompleteClause}
         ORDER BY c.initials ASC
         LIMIT 200`;
    const [clientRows] = await pool.execute(clientSql, [sg?.id || 0]);

    const evRow = access.row;

    let agencyPortalSlug = null;
    const [agSlugRows] = await pool.execute(`SELECT slug FROM agencies WHERE id = ? LIMIT 1`, [evRow.agency_id]);
    if (agSlugRows?.[0]?.slug) {
      agencyPortalSlug = String(agSlugRows[0].slug).trim().toLowerCase() || null;
    }

    let programPortal = null;
    const progOrgId = evRow.organization_id != null ? Number(evRow.organization_id) : null;
    if (progOrgId) {
      const [prRows] = await pool.execute(
        `SELECT id, name, slug FROM agencies WHERE id = ? LIMIT 1`,
        [progOrgId]
      );
      const pr = prRows?.[0];
      if (pr) {
        programPortal = {
          organizationId: Number(pr.id),
          name: String(pr.name || '').trim(),
          slug: String(pr.slug || '').trim().toLowerCase() || null
        };
      }
    }

    let showKioskClockActions = false;
    let isAssignedProvider = false;
    if (sg?.id && userId) {
      const [sgp] = await pool.execute(
        `SELECT 1 AS ok FROM skills_group_providers WHERE skills_group_id = ? AND provider_user_id = ? LIMIT 1`,
        [Number(sg.id), userId]
      );
      showKioskClockActions = !!sgp?.[0]?.ok;
      isAssignedProvider = showKioskClockActions;
    }

    let meetings = [];
    if (sg?.id) {
      const [mrows] = await pool.execute(
        `SELECT weekday, start_time, end_time
         FROM skills_group_meetings
         WHERE skills_group_id = ?
         ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
        [Number(sg.id)]
      );
      meetings = (mrows || []).map((m) => ({
        weekday: m.weekday,
        startTime: String(m.start_time || '').slice(0, 8),
        endTime: String(m.end_time || '').slice(0, 8)
      }));
    }

    const canonWin = await getCanonicalSkillsGroupWindowIfLegacy(agencyId, eventId, {
      eventType: evRow.event_type,
      timezone: evRow.timezone,
      startsAt: evRow.starts_at
    });
    const evRowForDisplay = canonWin
      ? {
          ...evRow,
          starts_at: canonWin.startsAt,
          ends_at: canonWin.endsAt,
          timezone: canonWin.timeZone
        }
      : evRow;

    const calendar = buildSkillBuilderPortalCalendar(evRowForDisplay);
    const canManageCompanyEvent = staffLike || coord;
    const canManageTeamSchedules = await canManageTeamSchedulesForAgency(req, agencyId);
    const roleLower = String(req.user?.role || '').toLowerCase();
    const canPostEventDiscussion = roleLower !== 'school_staff';

    res.json({
      ok: true,
      agencyPortalSlug,
      programPortal,
      showKioskClockActions,
      canManageCompanyEvent,
      meetings,
      viewerCapabilities: {
        isAssignedProvider,
        canManageTeamSchedules,
        canManageCompanyEvent,
        showKioskClockActions,
        canPostEventDiscussion
      },
      calendar,
      event: formatEventRow(evRowForDisplay),
      skillsGroup: sg
        ? {
            id: Number(sg.id),
            name: sg.name,
            startDate: sg.start_date,
            endDate: sg.end_date,
            schoolOrganizationId: Number(sg.organization_id),
            schoolName: sg.school_name,
            schoolSlug: sg.school_slug != null && String(sg.school_slug).trim()
              ? String(sg.school_slug).trim().toLowerCase()
              : null
          }
        : null,
      providers,
      clients: (clientRows || []).map((c) => ({
        id: Number(c.id),
        initials: c.initials,
        identifierCode: c.identifier_code,
        documentStatus: c.document_status != null ? String(c.document_status) : null,
        paperworkStatusLabel: c.paperwork_status_label != null ? String(c.paperwork_status_label).trim() || null : null
      }))
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Labels each occurrence in the loaded range: "Session 1" when one slot that calendar day,
 * or "Session 1.1", "Session 1.2" when the same day is split into multiple meeting times.
 */
function assignSkillBuilderSessionLabels(sessions) {
  if (!Array.isArray(sessions) || !sessions.length) return;
  const byDate = new Map();
  for (const s of sessions) {
    const d = String(s.sessionDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(s);
  }
  const uniqueDates = [...byDate.keys()].sort();
  const dateToIndex = new Map(uniqueDates.map((d, i) => [d, i + 1]));
  for (const d of uniqueDates) {
    const list = byDate.get(d).slice().sort((a, b) => {
      const ta = String(a.startTime || '');
      const tb = String(b.startTime || '');
      if (ta !== tb) return ta.localeCompare(tb);
      return Number(a.id) - Number(b.id);
    });
    const di = dateToIndex.get(d);
    if (!di) continue;
    if (list.length === 1) {
      list[0].sessionLabel = `Session ${di}`;
    } else {
      list.forEach((s, i) => {
        s.sessionLabel = `Session ${di}.${i + 1}`;
      });
    }
  }
}

/** GET /api/skill-builders/events/:eventId/sessions?agencyId=&from=YYYY-MM-DD&to=YYYY-MM-DD */
export const listSkillBuilderEventSessions = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const fromY = String(req.query.from || '').trim().slice(0, 10);
    const toY = String(req.query.to || '').trim().slice(0, 10);
    let sql = `
      SELECT s.id, s.session_date, s.starts_at, s.ends_at, s.timezone,
             s.location_label, s.location_address, s.modality, s.join_url,
             m.weekday, m.start_time, m.end_time
      FROM skill_builders_event_sessions s
      INNER JOIN skills_group_meetings m ON m.id = s.skills_group_meeting_id
      WHERE s.company_event_id = ?`;
    const params = [eventId];
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromY)) {
      sql += ' AND s.session_date >= ?';
      params.push(fromY);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(toY)) {
      sql += ' AND s.session_date <= ?';
      params.push(toY);
    }
    sql += ' ORDER BY s.session_date ASC, m.start_time ASC, s.id ASC LIMIT 500';

    let rows;
    try {
      const [cRows] = await pool.execute(
        `SELECT COUNT(*) AS n FROM skill_builders_event_sessions WHERE company_event_id = ?`,
        [eventId]
      );
      const n = Number(cRows?.[0]?.n);
      if (n === 0) {
        const [sgR] = await pool.execute(
          `SELECT id FROM skills_groups WHERE company_event_id = ? AND agency_id = ? LIMIT 1`,
          [eventId, agencyId]
        );
        const gid = sgR?.[0]?.id != null ? Number(sgR[0].id) : null;
        if (gid) {
          const [mc] = await pool.execute(
            `SELECT COUNT(*) AS cnt FROM skills_group_meetings WHERE skills_group_id = ?`,
            [gid]
          );
          if (Number(mc?.[0]?.cnt) > 0) {
            let conn = null;
            try {
              conn = await pool.getConnection();
              await conn.beginTransaction();
              await materializeSkillBuildersEventSessions(conn, { skillsGroupId: gid });
              await conn.commit();
            } catch (matErr) {
              if (conn) {
                try {
                  await conn.rollback();
                } catch {
                  /* ignore */
                }
              }
              if (matErr?.code === 'ER_NO_SUCH_TABLE') {
                return res.status(503).json({ error: { message: 'Sessions table not migrated (584)' } });
              }
              throw matErr;
            } finally {
              if (conn) conn.release();
            }
          }
        }
      }
      const [r2] = await pool.execute(sql, params);
      rows = r2;
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Sessions table not migrated (584)' } });
      }
      throw e;
    }

    const sessionIds = (rows || []).map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);

    /** @type {Map<number, { id: number, firstName: string, lastName: string }[]>} */
    const assignBySession = new Map();
    if (sessionIds.length) {
      try {
        const ph = sessionIds.map(() => '?').join(',');
        const [aRows] = await pool.execute(
          `SELECT p.session_id, u.id AS user_id, u.first_name, u.last_name
           FROM skill_builders_event_session_providers p
           INNER JOIN users u ON u.id = p.provider_user_id
           WHERE p.session_id IN (${ph})
           ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
          sessionIds
        );
        for (const ar of aRows || []) {
          const sid = Number(ar.session_id);
          if (!assignBySession.has(sid)) assignBySession.set(sid, []);
          assignBySession.get(sid).push({
            id: Number(ar.user_id),
            firstName: ar.first_name,
            lastName: ar.last_name
          });
        }
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        /* migration 585 not applied — sessions still list without assignments */
      }
    }

    /** @type {Map<number, { fileName: string, extractStatus: string }>} */
    const curriculumBySession = new Map();
    /** @type {Map<number, number>} */
    const clinicalNoteCountBySession = new Map();
    if (sessionIds.length) {
      try {
        const ph = sessionIds.map(() => '?').join(',');
        const [cuRows] = await pool.execute(
          `SELECT session_id, original_filename, extract_status
           FROM skill_builders_event_session_curriculum WHERE session_id IN (${ph})`,
          sessionIds
        );
        for (const c of cuRows || []) {
          curriculumBySession.set(Number(c.session_id), {
            fileName: String(c.original_filename || ''),
            extractStatus: String(c.extract_status || '')
          });
        }
        const [cnRows] = await pool.execute(
          `SELECT session_id, COUNT(*) AS n FROM skill_builders_session_clinical_notes WHERE session_id IN (${ph}) GROUP BY session_id`,
          sessionIds
        );
        for (const n of cnRows || []) {
          clinicalNoteCountBySession.set(Number(n.session_id), Number(n.n || 0));
        }
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    const sessions = (rows || []).map((r) => {
      const id = Number(r.id);
      const cur = curriculumBySession.get(id);
      return {
        id,
        sessionDate: r.session_date,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        timezone: r.timezone || 'UTC',
        weekday: r.weekday,
        startTime: String(r.start_time || '').slice(0, 8),
        endTime: String(r.end_time || '').slice(0, 8),
        locationLabel: r.location_label != null ? String(r.location_label).trim() || null : null,
        locationAddress: r.location_address != null ? String(r.location_address).trim() || null : null,
        modality: r.modality != null ? String(r.modality).trim().toLowerCase() || null : null,
        joinUrl: r.join_url != null ? String(r.join_url).trim().slice(0, 1024) || null : null,
        assignedProviders: assignBySession.get(id) || [],
        hasCurriculum: !!cur,
        curriculumFileName: cur?.fileName || null,
        curriculumExtractStatus: cur?.extractStatus || null,
        clinicalNoteCount: clinicalNoteCountBySession.get(id) || 0
      };
    });
    assignSkillBuilderSessionLabels(sessions);
    res.json({ ok: true, sessions });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Sessions table not migrated (584)' } });
    }
    next(e);
  }
};

/** PUT /api/skill-builders/events/:eventId/sessions/:sessionId/providers — replace assigned staff for one occurrence */
export const putSkillBuilderEventSessionProviders = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const rawIds = req.body?.providerUserIds;
    if (!agencyId || !eventId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and session id required' } });
    }
    if (!Array.isArray(rawIds)) {
      return res.status(400).json({ error: { message: 'providerUserIds array is required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await canManageTeamSchedulesForAgency(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }

    const normalized = [...new Set(rawIds.map((x) => parsePositiveInt(x)).filter(Boolean))];

    const [sRows] = await pool.execute(
      `SELECT s.id, s.skills_group_id, s.session_date
       FROM skill_builders_event_sessions s
       INNER JOIN skills_groups sg ON sg.id = s.skills_group_id AND sg.agency_id = ?
       WHERE s.id = ? AND s.company_event_id = ?
       LIMIT 1`,
      [agencyId, sessionId, eventId]
    );
    const sess = sRows?.[0];
    if (!sess) {
      return res.status(404).json({ error: { message: 'Session not found for this event' } });
    }
    const sessionDateYmd = sess.session_date ? String(sess.session_date).slice(0, 10) : '';
    const todayLocal = new Date();
    const todayYmd = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
    if (sessionDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(sessionDateYmd) && sessionDateYmd < todayYmd) {
      if (!(await isAgencyStaffLikeForSkillBuilders(req, agencyId))) {
        return res.status(403).json({
          error: { message: 'Past sessions are read-only. Ask an agency admin to override.' }
        });
      }
    }
    const gid = Number(sess.skills_group_id);

    if (normalized.length) {
      const ph = normalized.map(() => '?').join(',');
      const [provRows] = await pool.execute(
        `SELECT provider_user_id FROM skills_group_providers
         WHERE skills_group_id = ? AND provider_user_id IN (${ph})`,
        [gid, ...normalized]
      );
      const okSet = new Set((provRows || []).map((r) => Number(r.provider_user_id)));
      const missing = normalized.filter((id) => !okSet.has(id));
      if (missing.length) {
        return res.status(400).json({
          error: { message: 'Each assigned provider must be on the event group roster' }
        });
      }
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM skill_builders_event_session_providers WHERE session_id = ?`, [sessionId]);
    for (const pid of normalized) {
      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        `INSERT INTO skill_builders_event_session_providers (session_id, provider_user_id) VALUES (?, ?)`,
        [sessionId, pid]
      );
    }
    await conn.commit();

    const [outRows] = await pool.execute(
      `SELECT u.id AS user_id, u.first_name, u.last_name
       FROM skill_builders_event_session_providers p
       INNER JOIN users u ON u.id = p.provider_user_id
       WHERE p.session_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [sessionId]
    );
    res.json({
      ok: true,
      providerUserIds: normalized,
      assignedProviders: (outRows || []).map((r) => ({
        id: Number(r.user_id),
        firstName: r.first_name,
        lastName: r.last_name
      }))
    });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Run migration 585 for per-session staff assignments' } });
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

/** PATCH /api/skill-builders/events/:eventId/sessions/:sessionId — location, modality, join URL */
export const patchSkillBuilderEventSession = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    if (!agencyId || !eventId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and session id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await canManageTeamSchedulesForAgency(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }
    const [sRows] = await pool.execute(
      `SELECT s.id, s.session_date
       FROM skill_builders_event_sessions s
       INNER JOIN skills_groups sg ON sg.id = s.skills_group_id AND sg.agency_id = ?
       WHERE s.id = ? AND s.company_event_id = ?
       LIMIT 1`,
      [agencyId, sessionId, eventId]
    );
    if (!sRows?.[0]) return res.status(404).json({ error: { message: 'Session not found' } });
    const sessionDateYmd = String(sRows[0].session_date || '').slice(0, 10);
    const todayLocal = new Date();
    const todayYmd = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
    if (sessionDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(sessionDateYmd) && sessionDateYmd < todayYmd) {
      if (!(await isAgencyStaffLikeForSkillBuilders(req, agencyId))) {
        return res.status(403).json({ error: { message: 'Past sessions are read-only' } });
      }
    }
    const b = req.body || {};
    const locationLabel =
      b.locationLabel !== undefined ? String(b.locationLabel || '').trim().slice(0, 512) || null : undefined;
    const locationAddress =
      b.locationAddress !== undefined
        ? b.locationAddress
          ? String(b.locationAddress).trim().slice(0, 4000)
          : null
        : undefined;
    const modality =
      b.modality !== undefined ? String(b.modality || '').trim().toLowerCase().slice(0, 32) || null : undefined;
    const joinUrl =
      b.joinUrl !== undefined ? (b.joinUrl ? String(b.joinUrl).trim().slice(0, 1024) : null) : undefined;
    const sets = [];
    const params = [];
    if (locationLabel !== undefined) {
      sets.push('location_label = ?');
      params.push(locationLabel);
    }
    if (locationAddress !== undefined) {
      sets.push('location_address = ?');
      params.push(locationAddress);
    }
    if (modality !== undefined) {
      sets.push('modality = ?');
      params.push(modality);
    }
    if (joinUrl !== undefined) {
      sets.push('join_url = ?');
      params.push(joinUrl);
    }
    if (!sets.length) return res.status(400).json({ error: { message: 'No updatable fields' } });
    params.push(sessionId, eventId);
    await pool.execute(
      `UPDATE skill_builders_event_sessions SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_event_id = ?`,
      params
    );
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Run migration 586 for session location/modality' } });
    }
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/attendance/providers?agencyId=&userId= optional */
export const listSkillBuilderEventProviderAttendance = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const uid = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(uid);
    let filterUserId = parsePositiveInt(req.query.userId);
    if (!staffLike && !coord) {
      filterUserId = uid;
    }
    const [rows] = await pool.execute(
      `SELECT id, user_id, punch_type, punched_at, session_id, client_id, payroll_time_claim_id
       FROM skill_builders_event_kiosk_punches
       WHERE company_event_id = ?
       ${filterUserId ? 'AND user_id = ?' : ''}
       ORDER BY punched_at ASC, id ASC`,
      filterUserId ? [eventId, filterUserId] : [eventId]
    );
    const punches = (rows || []).map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      punchType: r.punch_type,
      punchedAt: r.punched_at,
      sessionId: r.session_id != null ? Number(r.session_id) : null,
      clientId: r.client_id != null ? Number(r.client_id) : null,
      payrollTimeClaimId: r.payroll_time_claim_id != null ? Number(r.payroll_time_claim_id) : null
    }));
    res.json({ ok: true, punches });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ ok: true, punches: [] });
    }
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/attendance/clients?agencyId= */
export const listSkillBuilderEventClientAttendance = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const [rows] = await pool.execute(
      `SELECT a.id, a.session_id, a.client_id, a.check_in_at, a.check_out_at, a.checked_out_by_user_id,
              a.signature_text, a.manual_entry, a.created_by_user_id, a.updated_by_user_id,
              s.session_date, s.starts_at, s.ends_at
       FROM skill_builders_client_session_attendance a
       INNER JOIN skill_builders_event_sessions s ON s.id = a.session_id
       WHERE s.company_event_id = ?
       ORDER BY s.session_date ASC, a.client_id ASC`,
      [eventId]
    );
    const attendance = (rows || []).map((r) => ({
      id: Number(r.id),
      sessionId: Number(r.session_id),
      clientId: Number(r.client_id),
      checkInAt: r.check_in_at,
      checkOutAt: r.check_out_at,
      checkedOutByUserId: r.checked_out_by_user_id != null ? Number(r.checked_out_by_user_id) : null,
      signatureText: r.signature_text || null,
      manualEntry: !!(r.manual_entry === 1 || r.manual_entry === true),
      sessionDate: r.session_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at
    }));
    res.json({ ok: true, attendance });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ ok: true, attendance: [] });
    }
    next(e);
  }
};

/** PUT /api/skill-builders/events/:eventId/sessions/:sessionId/client-attendance — upsert one client row */
export const putSkillBuilderClientSessionAttendance = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const clientId = parsePositiveInt(req.body?.clientId);
    if (!agencyId || !eventId || !sessionId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, session id, and clientId required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const uid = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(uid);
    const onProviderRoster = await providerOnEventRoster(eventId, agencyId, uid);
    if (!staffLike && !coord && !onProviderRoster) {
      return res.status(403).json({ error: { message: 'Not authorized' } });
    }
    const [sRows] = await pool.execute(
      `SELECT s.id FROM skill_builders_event_sessions s
       INNER JOIN skills_groups sg ON sg.id = s.skills_group_id AND sg.agency_id = ?
       WHERE s.id = ? AND s.company_event_id = ?
       LIMIT 1`,
      [agencyId, sessionId, eventId]
    );
    if (!sRows?.[0]) return res.status(404).json({ error: { message: 'Session not found' } });
    const [cRows] = await pool.execute(
      `SELECT 1 AS ok FROM skills_group_clients sgc
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ? AND sgc.client_id = ?
       LIMIT 1`,
      [eventId, agencyId, clientId]
    );
    if (!cRows?.[0]) {
      return res.status(400).json({ error: { message: 'Client is not on this program roster' } });
    }
    const checkInAt = req.body?.checkInAt ? new Date(req.body.checkInAt) : null;
    const checkOutAt = req.body?.checkOutAt ? new Date(req.body.checkOutAt) : null;
    const signatureText = req.body?.signatureText != null ? String(req.body.signatureText).slice(0, 512) : null;
    const manualEntry = !!(req.body?.manualEntry === true || req.body?.manualEntry === 1);
    const checkedOutByUserId = parsePositiveInt(req.body?.checkedOutByUserId) || uid;

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO skill_builders_client_session_attendance
        (session_id, client_id, check_in_at, check_out_at, checked_out_by_user_id, signature_text, manual_entry, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        check_in_at = VALUES(check_in_at),
        check_out_at = VALUES(check_out_at),
        checked_out_by_user_id = VALUES(checked_out_by_user_id),
        signature_text = VALUES(signature_text),
        manual_entry = VALUES(manual_entry),
        updated_by_user_id = VALUES(updated_by_user_id)`,
      [
        sessionId,
        clientId,
        checkInAt && Number.isFinite(checkInAt.getTime()) ? checkInAt : null,
        checkOutAt && Number.isFinite(checkOutAt.getTime()) ? checkOutAt : null,
        checkedOutByUserId,
        signatureText,
        manualEntry ? 1 : 0,
        uid,
        uid
      ]
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Run migration 586 for client attendance' } });
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

/** PATCH /api/skill-builders/events/:eventId/group-meetings */
export const patchSkillBuilderEventGroupMeetings = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await canManageTeamSchedulesForAgency(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }
    const meetingsBody = req.body?.meetings;
    if (!Array.isArray(meetingsBody)) {
      return res.status(400).json({ error: { message: 'meetings array is required' } });
    }

    const [sgRows] = await pool.execute(
      `SELECT sg.* FROM skills_groups sg WHERE sg.company_event_id = ? AND sg.agency_id = ? LIMIT 1`,
      [eventId, agencyId]
    );
    const sg = sgRows?.[0];
    if (!sg) return res.status(404).json({ error: { message: 'Skills group not linked to this event' } });

    const actorUserId = parsePositiveInt(req.user?.id);
    const gid = Number(sg.id);

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await replaceSkillsGroupMeetings(conn, gid, meetingsBody);

    const [mrows] = await conn.execute(
      `SELECT weekday, start_time, end_time
       FROM skills_group_meetings
       WHERE skills_group_id = ?
       ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
      [gid]
    );

    const schoolOrgId = Number(sg.organization_id);
    const school = await Agency.findById(schoolOrgId);
    const schoolName = String(school?.name || 'School').trim();
    const agencyTz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });
    const { startsAt, endsAt, timeZone: eventTz } = computeSkillsGroupEventWindow(
      sg.start_date,
      sg.end_date,
      agencyTz
    );
    const description = buildSkillsGroupEventDescription({
      schoolName,
      groupName: String(sg.name || '').trim() || `Group ${gid}`,
      startDate: sg.start_date,
      endDate: sg.end_date,
      meetings: mrows || []
    });
    const title = `Skill Builders: ${String(sg.name || '').trim() || `Group ${gid}`}`.slice(0, 255);
    let programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, agencyId);
    if (!programOrgId && sg.skill_builders_program_organization_id) {
      programOrgId = Number(sg.skill_builders_program_organization_id);
    }
    const ceid = sg.company_event_id ? Number(sg.company_event_id) : null;
    if (ceid) {
      await updateSkillsGroupCompanyEvent(conn, ceid, {
        title,
        description,
        startsAt,
        endsAt,
        programOrgId,
        userId: actorUserId,
        timeZone: eventTz
      });
      if (programOrgId) {
        await conn.execute(
          `UPDATE skills_groups SET skill_builders_program_organization_id = ? WHERE id = ?`,
          [programOrgId, gid]
        );
      }
    }

    await materializeSkillBuildersEventSessions(conn, { skillsGroupId: gid });

    await conn.commit();

    const meetingsOut = (mrows || []).map((m) => ({
      weekday: m.weekday,
      startTime: String(m.start_time || '').slice(0, 8),
      endTime: String(m.end_time || '').slice(0, 8)
    }));

    res.json({ ok: true, meetings: meetingsOut });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    const code = Number(e?.statusCode);
    if (code === 400) {
      return res.status(400).json({ error: { message: e.message || 'Invalid meetings' } });
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

/** GET /api/skill-builders/events/:eventId/posts?agencyId= */
export const listSkillBuilderEventPosts = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const [rows] = await pool.execute(
      `SELECT p.id, p.company_event_id, p.user_id, p.parent_post_id, p.body, p.created_at,
              u.first_name, u.last_name
       FROM skill_builders_event_portal_posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.company_event_id = ?
       ORDER BY p.created_at ASC
       LIMIT 500`,
      [eventId]
    );
    res.json({
      ok: true,
      posts: (rows || []).map((r) => ({
        id: Number(r.id),
        companyEventId: Number(r.company_event_id),
        userId: Number(r.user_id),
        parentPostId: r.parent_post_id ? Number(r.parent_post_id) : null,
        body: r.body,
        createdAt: r.created_at,
        authorFirstName: r.first_name,
        authorLastName: r.last_name
      }))
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ ok: true, posts: [] });
    }
    next(e);
  }
};

/** POST /api/skill-builders/events/:eventId/posts */
export const createSkillBuilderEventPost = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const userId = parsePositiveInt(req.user?.id);
    const body = String(req.body?.body || '').trim();
    const parentPostId = parsePositiveInt(req.body?.parentPostId) || null;
    if (!agencyId || !eventId || !userId || !body) {
      return res.status(400).json({ error: { message: 'agencyId and body are required' } });
    }
    const access = await assertEventDiscussionAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const [ins] = await pool.execute(
      `INSERT INTO skill_builders_event_portal_posts (company_event_id, user_id, parent_post_id, body)
       VALUES (?, ?, ?, ?)`,
      [eventId, userId, parentPostId, body.slice(0, 8000)]
    );
    res.status(201).json({ ok: true, id: ins.insertId });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Portal posts table not migrated' } });
    }
    next(e);
  }
};

/** POST /api/skill-builders/events/:eventId/kiosk/clock-in */
export const skillBuilderEventClockIn = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const userId = parsePositiveInt(req.user?.id);
    const officeLocationId = parsePositiveInt(req.body?.officeLocationId) || null;
    const sessionId = parsePositiveInt(req.body?.sessionId);
    const clientId = parsePositiveInt(req.body?.clientId);
    if (!agencyId || !eventId || !userId) {
      return res.status(400).json({ error: { message: 'agencyId required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const result = await recordSkillBuilderEventClockIn(pool, {
      agencyId,
      eventId,
      userId,
      sessionId,
      clientId,
      officeLocationId
    });
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.status(201).json({ ok: true, punchId: result.punchId });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.sqlMessage || '').includes('session_id')) {
      return res.status(503).json({ error: { message: 'Run migration 584 for session-scoped kiosk punches' } });
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Kiosk punches table not migrated' } });
    }
    next(e);
  }
};

/** POST /api/skill-builders/events/:eventId/kiosk/clock-out */
export const skillBuilderEventClockOut = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !eventId || !userId) {
      return res.status(400).json({ error: { message: 'agencyId required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const result = await recordSkillBuilderEventClockOut(pool, { agencyId, eventId, userId });
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.status(201).json({
      ok: true,
      punchOutId: result.punchOutId,
      payrollTimeClaimId: result.payrollTimeClaimId,
      directHours: result.directHours,
      indirectHours: result.indirectHours,
      workedHours: result.workedHours
    });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.sqlMessage || '').includes('session_id')) {
      return res.status(503).json({ error: { message: 'Run migration 584 for session-scoped kiosk punches' } });
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Kiosk or payroll tables not migrated' } });
    }
    next(e);
  }
};

/** POST /api/skill-builders/events/:eventId/quick-enroll-client */
export const quickEnrollClientToSkillBuilderEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const clientId = parsePositiveInt(req.body?.clientId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !eventId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const [sgRows] = await pool.execute(
      `SELECT sg.id, sg.organization_id FROM skills_groups sg
       WHERE sg.company_event_id = ? AND sg.agency_id = ? LIMIT 1`,
      [eventId, agencyId]
    );
    const sg = sgRows?.[0];
    if (!sg) return res.status(404).json({ error: { message: 'Skills group not linked' } });

    const schoolOrgId = Number(sg.organization_id);
    const [coa] = await pool.execute(
      `SELECT 1 FROM client_organization_assignments
       WHERE client_id = ? AND organization_id = ? AND is_active = TRUE LIMIT 1`,
      [clientId, schoolOrgId]
    );
    if (!coa?.[0]) {
      return res.status(400).json({
        error: { message: 'Client must be actively affiliated with this event school organization' }
      });
    }

    await pool.execute(
      `INSERT INTO skills_group_clients
        (skills_group_id, client_id, active_for_providers, ready_confirmed_by_user_id, ready_confirmed_at)
       VALUES (?, ?, 0, NULL, NULL)
       ON DUPLICATE KEY UPDATE skills_group_id = skills_group_id`,
      [sg.id, clientId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/** Staff/coordinator: integrated group roster for kiosk + program (skills_group_providers). */
export const getSkillBuilderEventSkillsGroupRoster = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const userId = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    if (!staffLike && !coord) {
      return res.status(403).json({ error: { message: 'You do not have permission to manage this roster' } });
    }

    const [sgRows] = await pool.execute(
      `SELECT sg.id, sg.organization_id, LOWER(COALESCE(ce.event_type, '')) AS event_type
       FROM skills_groups sg
       INNER JOIN company_events ce ON ce.id = sg.company_event_id AND ce.agency_id = sg.agency_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
       LIMIT 1`,
      [eventId, agencyId]
    );
    const sg = sgRows?.[0];
    if (!sg || String(sg.event_type || '') !== 'skills_group') {
      return res.json({
        ok: true,
        skillsGroupId: null,
        organizationId: null,
        assignedProviders: [],
        eligibleProviders: [],
        allAgencyProviders: []
      });
    }

    const skillsGroupId = Number(sg.id);
    const organizationId = Number(sg.organization_id);

    const [assigned] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name
       FROM skills_group_providers sgp
       INNER JOIN users u ON u.id = sgp.provider_user_id
       WHERE sgp.skills_group_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [skillsGroupId]
    );

    const providerScopeSql = `
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.status IS NULL OR UPPER(u.status) <> 'ARCHIVED')
         AND (
           LOWER(u.role) IN ('provider', 'clinician', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant')
           OR (u.has_provider_access = TRUE)
         )`;

    const [eligible] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email
       ${providerScopeSql}
         AND (u.skill_builder_eligible = TRUE OR u.skill_builder_eligible = 1)
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [agencyId]
    );

    const [allAgency] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.skill_builder_eligible
       ${providerScopeSql}
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [agencyId]
    );

    const mapSdp = (r) => ({
      id: Number(r.id),
      firstName: r.first_name || '',
      lastName: r.last_name || '',
      email: r.email || '',
      skillDevelopmentProgramEligible: !!(r.skill_builder_eligible === true || r.skill_builder_eligible === 1 || r.skill_builder_eligible === '1')
    });

    res.json({
      ok: true,
      skillsGroupId,
      organizationId,
      assignedProviders: (assigned || []).map((r) => ({
        id: Number(r.id),
        firstName: r.first_name || '',
        lastName: r.last_name || ''
      })),
      eligibleProviders: (eligible || []).map(mapSdp),
      allAgencyProviders: (allAgency || []).map(mapSdp)
    });
  } catch (e) {
    next(e);
  }
};

export const postSkillBuilderEventSkillsGroupRoster = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const providerUserId = parsePositiveInt(req.body?.providerUserId ?? req.body?.provider_user_id);
    const action = String(req.body?.action || '').toLowerCase();
    if (!agencyId || !eventId || !providerUserId || !['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: { message: 'agencyId, providerUserId, and action add|remove are required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const uid = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(uid);
    if (!staffLike && !coord) {
      return res.status(403).json({ error: { message: 'You do not have permission to manage this roster' } });
    }

    const [sgRows] = await pool.execute(
      `SELECT sg.id
       FROM skills_groups sg
       INNER JOIN company_events ce ON ce.id = sg.company_event_id AND ce.agency_id = sg.agency_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ? AND LOWER(COALESCE(ce.event_type, '')) = 'skills_group'
       LIMIT 1`,
      [eventId, agencyId]
    );
    const gid = sgRows?.[0]?.id ? Number(sgRows[0].id) : null;
    if (!gid) {
      return res.status(404).json({ error: { message: 'No integrated Skill Builders group for this event' } });
    }

    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      const [ua] = await pool.execute(
        `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
        [providerUserId, agencyId]
      );
      if (!ua?.[0]) {
        return res.status(400).json({ error: { message: 'Provider is not part of this agency' } });
      }
    }

    let skillDevelopmentProgramEligibleUpdated = false;
    if (action === 'add') {
      const [elig] = await pool.execute(
        `SELECT skill_builder_eligible FROM users WHERE id = ? LIMIT 1`,
        [providerUserId]
      );
      const eligible = elig?.[0]?.skill_builder_eligible;
      const isEligible = eligible === true || eligible === 1 || eligible === '1';
      if (!isEligible) {
        await pool.execute(`UPDATE users SET skill_builder_eligible = 1 WHERE id = ?`, [providerUserId]);
        skillDevelopmentProgramEligibleUpdated = true;
      }
      await pool.execute(
        `INSERT IGNORE INTO skills_group_providers (skills_group_id, provider_user_id) VALUES (?, ?)`,
        [gid, providerUserId]
      );
    } else {
      await pool.execute(`DELETE FROM skills_group_providers WHERE skills_group_id = ? AND provider_user_id = ?`, [
        gid,
        providerUserId
      ]);
    }

    const [assigned] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name
       FROM skills_group_providers sgp
       INNER JOIN users u ON u.id = sgp.provider_user_id
       WHERE sgp.skills_group_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [gid]
    );

    res.json({
      ok: true,
      assignedProviders: (assigned || []).map((r) => ({
        id: Number(r.id),
        firstName: r.first_name || '',
        lastName: r.last_name || ''
      })),
      skillDevelopmentProgramEligibleUpdated: action === 'add' ? skillDevelopmentProgramEligibleUpdated : false
    });
  } catch (e) {
    next(e);
  }
};

async function listSkillsGroupMeetingsForCompanyEvent(agencyId, eventId) {
  const [sgRows] = await pool.execute(
    `SELECT id FROM skills_groups WHERE company_event_id = ? AND agency_id = ? LIMIT 1`,
    [eventId, agencyId]
  );
  const sid = sgRows?.[0]?.id;
  if (!sid) return [];
  const [mrows] = await pool.execute(
    `SELECT weekday, start_time, end_time
     FROM skills_group_meetings
     WHERE skills_group_id = ?
     ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
    [Number(sid)]
  );
  return (mrows || []).map((m) => ({
    weekday: m.weekday,
    startTime: String(m.start_time || '').slice(0, 8),
    endTime: String(m.end_time || '').slice(0, 8)
  }));
}

/** GET /api/skill-builders/events/:eventId/company-event-edit?agencyId= — staff/coordinator with event access */
export const getSkillBuilderPortalCompanyEventForEdit = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const userId = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    if (!staffLike && !coord) {
      return res.status(403).json({ error: { message: 'You do not have permission to edit this event' } });
    }
    let bundle = await fetchCompanyEventDetailForEdit(req, agencyId, eventId);
    if (!bundle) return res.status(404).json({ error: { message: 'Company event not found' } });
    bundle = await mergeCanonicalSkillsGroupWindowForEditFetch(agencyId, eventId, bundle);
    const skillsGroupMeetings = await listSkillsGroupMeetingsForCompanyEvent(agencyId, eventId);
    res.json({ ok: true, event: bundle, skillsGroupMeetings });
  } catch (e) {
    next(e);
  }
};

/** PUT /api/skill-builders/events/:eventId/company-event-edit — body includes agencyId + company event fields */
export const putSkillBuilderPortalCompanyEventForEdit = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const userId = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    if (!staffLike && !coord) {
      return res.status(403).json({ error: { message: 'You do not have permission to edit this event' } });
    }
    const { agencyId: _a, ...rest } = req.body || {};
    const result = await persistCompanyEventUpdate(req, agencyId, eventId, rest);
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.json({ ok: true, event: result.data });
  } catch (e) {
    next(e);
  }
};

/** POST multipart /api/skill-builders/events/:eventId/sessions/:sessionId/curriculum */
export const postSkillBuilderSessionCurriculum = [
  curriculumUpload.single('file'),
  async (req, res, next) => {
    try {
      const agencyId = parsePositiveInt(req.body?.agencyId);
      const eventId = parsePositiveInt(req.params.eventId);
      const sessionId = parsePositiveInt(req.params.sessionId);
      if (!agencyId || !eventId || !sessionId) {
        return res.status(400).json({ error: { message: 'agencyId, event id, and session id required' } });
      }
      const cm = await canManageSessionCurriculum(req, agencyId, eventId);
      if (cm.error) return res.status(cm.error.status).json({ error: { message: cm.error.message } });
      if (!req.file?.buffer) return res.status(400).json({ error: { message: 'file is required' } });

      const [sRows] = await pool.execute(
        `SELECT s.id, s.company_event_id, s.skills_group_id
         FROM skill_builders_event_sessions s
         INNER JOIN skills_groups sg ON sg.id = s.skills_group_id AND sg.agency_id = ?
         WHERE s.id = ? AND s.company_event_id = ?
         LIMIT 1`,
        [agencyId, sessionId, eventId]
      );
      if (!sRows?.[0]) return res.status(404).json({ error: { message: 'Session not found' } });
      const sgId = Number(sRows[0].skills_group_id);
      const key = curriculumStorageKey(agencyId, eventId, sessionId, req.file.originalname);
      await StorageService.writeObject(key, req.file.buffer, 'application/pdf', {
        uploadedBy: String(req.user?.id || ''),
        kind: 'skill_builders_session_curriculum'
      });
      const { extractStatus, extractedTextEnc } = await processPdfUploadBuffer({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype
      });
      await upsertCurriculumRecord({
        sessionId,
        companyEventId: eventId,
        agencyId,
        skillsGroupId: sgId,
        storagePath: key,
        originalFilename: String(req.file.originalname || 'curriculum.pdf').slice(0, 255),
        mimeType: 'application/pdf',
        fileSizeBytes: req.file.size,
        uploadedByUserId: req.user.id,
        extractedTextEnc,
        extractStatus,
        sourceProgramDocumentId: null
      });
      res.json({ ok: true, extractStatus, hasExtractedText: !!extractedTextEnc });
    } catch (e) {
      if (e?.message === 'Only PDF files are allowed') {
        return res.status(400).json({ error: { message: e.message } });
      }
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Run migration 589 for session curriculum' } });
      }
      next(e);
    }
  }
];

/** GET /api/skill-builders/events/:eventId/sessions/:sessionId/curriculum — download PDF */
export const getSkillBuilderSessionCurriculumFile = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    if (!agencyId || !eventId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and session id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const row = await loadSessionCurriculumRow(sessionId);
    if (!row || Number(row.company_event_id) !== eventId) {
      return res.status(404).json({ error: { message: 'Curriculum not found' } });
    }
    const buf = await StorageService.readObject(row.storage_path);
    res.setHeader('Content-Type', row.mime_type || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(row.original_filename || 'curriculum.pdf')}"`
    );
    res.send(buf);
  } catch (e) {
    if (e?.message?.includes('not found') || e?.code === 404) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Run migration 589' } });
    }
    next(e);
  }
};

/** DELETE /api/skill-builders/events/:eventId/sessions/:sessionId/curriculum */
export const deleteSkillBuilderSessionCurriculum = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    if (!agencyId || !eventId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and session id required' } });
    }
    const cm = await canManageSessionCurriculum(req, agencyId, eventId);
    if (cm.error) return res.status(cm.error.status).json({ error: { message: cm.error.message } });
    await deleteCurriculumForSession(sessionId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/program-documents — library for the event’s overarching program org */
export const listSkillBuilderEventProgramDocuments = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId and event id required' } });
    }
    const access = await assertEventAccess({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const progOrgId = await fetchProgramOrganizationIdForCompanyEvent(agencyId, eventId);
    if (!progOrgId) {
      return res.status(400).json({ error: { message: 'Event is not linked to a program organization' } });
    }
    const [rows] = await pool.execute(
      `SELECT id, original_filename, display_title, file_size_bytes, created_at, mime_type
       FROM skill_builders_event_program_documents
       WHERE agency_id = ? AND program_organization_id = ?
       ORDER BY created_at DESC`,
      [agencyId, progOrgId]
    );
    res.json({ ok: true, documents: mapProgramDocumentRowsToApi(rows) });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
    }
    next(e);
  }
};

/** GET /api/skill-builders/program-organizations/:programOrganizationId/program-documents */
export const listSkillBuilderProgramOrganizationDocuments = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const programOrganizationId = parsePositiveInt(req.params.programOrganizationId);
    if (!agencyId || !programOrganizationId) {
      return res.status(400).json({ error: { message: 'agencyId and program organization id required' } });
    }
    const gate = await assertProgramDocumentsAccess(req, agencyId, programOrganizationId);
    if (gate.error) return res.status(gate.error.status).json({ error: { message: gate.error.message } });
    const [rows] = await pool.execute(
      `SELECT id, original_filename, display_title, file_size_bytes, created_at, mime_type
       FROM skill_builders_event_program_documents
       WHERE agency_id = ? AND program_organization_id = ?
       ORDER BY created_at DESC`,
      [agencyId, programOrganizationId]
    );
    res.json({ ok: true, documents: mapProgramDocumentRowsToApi(rows) });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
    }
    next(e);
  }
};

/** POST multipart /api/skill-builders/events/:eventId/program-documents — upload into the event’s program library */
export const postSkillBuilderEventProgramDocument = [
  curriculumUpload.single('file'),
  async (req, res, next) => {
    try {
      const agencyId = parsePositiveInt(req.body?.agencyId);
      const eventId = parsePositiveInt(req.params.eventId);
      if (!agencyId || !eventId) {
        return res.status(400).json({ error: { message: 'agencyId and event id required' } });
      }
      const cm = await canManageSessionCurriculum(req, agencyId, eventId);
      if (cm.error) return res.status(cm.error.status).json({ error: { message: cm.error.message } });
      if (!req.file?.buffer) return res.status(400).json({ error: { message: 'file is required' } });

      const progOrgId = await fetchProgramOrganizationIdForCompanyEvent(agencyId, eventId);
      if (!progOrgId) {
        return res.status(400).json({ error: { message: 'Event is not linked to a program organization' } });
      }

      const rawTitle = String(req.body?.title ?? req.body?.displayTitle ?? '').trim().slice(0, 255);
      const displayTitle = rawTitle || null;

      const key = programLibraryStorageKey(agencyId, progOrgId, req.file.originalname);
      await StorageService.writeObject(key, req.file.buffer, 'application/pdf', {
        uploadedBy: String(req.user?.id || ''),
        kind: 'skill_builders_program_document'
      });

      const origFn = String(req.file.originalname || 'document.pdf').slice(0, 255);
      const [ins] = await pool.execute(
        `INSERT INTO skill_builders_event_program_documents
         (agency_id, program_organization_id, company_event_id, skills_group_id, storage_path, original_filename, display_title, mime_type, file_size_bytes, uploaded_by_user_id)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
        [agencyId, progOrgId, key, origFn, displayTitle, 'application/pdf', req.file.size, req.user.id]
      );
      res.json({
        ok: true,
        document: {
          id: Number(ins.insertId),
          originalFilename: origFn,
          displayTitle,
          displayLabel: displayTitle || origFn,
          fileSizeBytes: req.file.size
        }
      });
    } catch (e) {
      if (e?.message === 'Only PDF files are allowed') {
        return res.status(400).json({ error: { message: e.message } });
      }
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
      }
      next(e);
    }
  }
];

/** POST multipart /api/skill-builders/program-organizations/:programOrganizationId/program-documents */
export const postSkillBuilderProgramOrganizationProgramDocument = [
  curriculumUpload.single('file'),
  async (req, res, next) => {
    try {
      const agencyId = parsePositiveInt(req.body?.agencyId);
      const programOrganizationId = parsePositiveInt(req.params.programOrganizationId);
      if (!agencyId || !programOrganizationId) {
        return res.status(400).json({ error: { message: 'agencyId and program organization id required' } });
      }
      const gate = await assertProgramDocumentsAccess(req, agencyId, programOrganizationId);
      if (gate.error) return res.status(gate.error.status).json({ error: { message: gate.error.message } });
      if (!req.file?.buffer) return res.status(400).json({ error: { message: 'file is required' } });

      const rawTitle = String(req.body?.title ?? req.body?.displayTitle ?? '').trim().slice(0, 255);
      const displayTitle = rawTitle || null;

      const key = programLibraryStorageKey(agencyId, programOrganizationId, req.file.originalname);
      await StorageService.writeObject(key, req.file.buffer, 'application/pdf', {
        uploadedBy: String(req.user?.id || ''),
        kind: 'skill_builders_program_document'
      });

      const origFn = String(req.file.originalname || 'document.pdf').slice(0, 255);
      const [ins] = await pool.execute(
        `INSERT INTO skill_builders_event_program_documents
         (agency_id, program_organization_id, company_event_id, skills_group_id, storage_path, original_filename, display_title, mime_type, file_size_bytes, uploaded_by_user_id)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
        [agencyId, programOrganizationId, key, origFn, displayTitle, 'application/pdf', req.file.size, req.user.id]
      );
      res.json({
        ok: true,
        document: {
          id: Number(ins.insertId),
          originalFilename: origFn,
          displayTitle,
          displayLabel: displayTitle || origFn,
          fileSizeBytes: req.file.size
        }
      });
    } catch (e) {
      if (e?.message === 'Only PDF files are allowed') {
        return res.status(400).json({ error: { message: e.message } });
      }
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
      }
      next(e);
    }
  }
];

/** DELETE /api/skill-builders/events/:eventId/program-documents/:documentId */
export const deleteSkillBuilderEventProgramDocument = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const documentId = parsePositiveInt(req.params.documentId);
    if (!agencyId || !eventId || !documentId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and document id required' } });
    }
    const cm = await canManageSessionCurriculum(req, agencyId, eventId);
    if (cm.error) return res.status(cm.error.status).json({ error: { message: cm.error.message } });

    const progOrgId = await fetchProgramOrganizationIdForCompanyEvent(agencyId, eventId);
    if (!progOrgId) {
      return res.status(400).json({ error: { message: 'Event is not linked to a program organization' } });
    }

    const row = await loadProgramDocumentRow(documentId);
    if (!row || Number(row.agency_id) !== agencyId || Number(row.program_organization_id) !== progOrgId) {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    if (row.storage_path) {
      try {
        await StorageService.deleteObject(row.storage_path);
      } catch {
        /* ignore */
      }
    }
    await pool.execute(
      `DELETE FROM skill_builders_event_program_documents WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
      [documentId, agencyId, progOrgId]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
    }
    next(e);
  }
};

/** DELETE /api/skill-builders/program-organizations/:programOrganizationId/program-documents/:documentId */
export const deleteSkillBuilderProgramOrganizationProgramDocument = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query.agencyId);
    const programOrganizationId = parsePositiveInt(req.params.programOrganizationId);
    const documentId = parsePositiveInt(req.params.documentId);
    if (!agencyId || !programOrganizationId || !documentId) {
      return res.status(400).json({ error: { message: 'agencyId, program organization id, and document id required' } });
    }
    const gate = await assertProgramDocumentsAccess(req, agencyId, programOrganizationId);
    if (gate.error) return res.status(gate.error.status).json({ error: { message: gate.error.message } });

    const row = await loadProgramDocumentRow(documentId);
    if (!row || Number(row.agency_id) !== agencyId || Number(row.program_organization_id) !== programOrganizationId) {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    if (row.storage_path) {
      try {
        await StorageService.deleteObject(row.storage_path);
      } catch {
        /* ignore */
      }
    }
    await pool.execute(
      `DELETE FROM skill_builders_event_program_documents WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
      [documentId, agencyId, programOrganizationId]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
    }
    next(e);
  }
};

/** PATCH /api/skill-builders/events/:eventId/program-documents/:documentId — set display title for attach lists */
export const patchSkillBuilderEventProgramDocument = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const documentId = parsePositiveInt(req.params.documentId);
    if (!agencyId || !eventId || !documentId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and document id required' } });
    }
    if (req.body?.title === undefined && req.body?.displayTitle === undefined) {
      return res.status(400).json({ error: { message: 'title or displayTitle is required' } });
    }
    const raw = String(req.body?.title ?? req.body?.displayTitle ?? '').trim().slice(0, 255);
    const displayTitle = raw || null;

    const cm = await canManageSessionCurriculum(req, agencyId, eventId);
    if (cm.error) return res.status(cm.error.status).json({ error: { message: cm.error.message } });

    const progOrgId = await fetchProgramOrganizationIdForCompanyEvent(agencyId, eventId);
    if (!progOrgId) {
      return res.status(400).json({ error: { message: 'Event is not linked to a program organization' } });
    }

    const row = await loadProgramDocumentRow(documentId);
    if (!row || Number(row.agency_id) !== agencyId || Number(row.program_organization_id) !== progOrgId) {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    await pool.execute(
      `UPDATE skill_builders_event_program_documents SET display_title = ? WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
      [displayTitle, documentId, agencyId, progOrgId]
    );
    const fn = String(row.original_filename || '').trim() || 'document.pdf';
    res.json({
      ok: true,
      document: {
        id: documentId,
        originalFilename: fn,
        displayTitle,
        displayLabel: displayTitle || fn
      }
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
    }
    next(e);
  }
};

/** PATCH /api/skill-builders/program-organizations/:programOrganizationId/program-documents/:documentId */
export const patchSkillBuilderProgramOrganizationProgramDocument = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const programOrganizationId = parsePositiveInt(req.params.programOrganizationId);
    const documentId = parsePositiveInt(req.params.documentId);
    if (!agencyId || !programOrganizationId || !documentId) {
      return res.status(400).json({ error: { message: 'agencyId, program organization id, and document id required' } });
    }
    if (req.body?.title === undefined && req.body?.displayTitle === undefined) {
      return res.status(400).json({ error: { message: 'title or displayTitle is required' } });
    }
    const raw = String(req.body?.title ?? req.body?.displayTitle ?? '').trim().slice(0, 255);
    const displayTitle = raw || null;

    const gate = await assertProgramDocumentsAccess(req, agencyId, programOrganizationId);
    if (gate.error) return res.status(gate.error.status).json({ error: { message: gate.error.message } });

    const row = await loadProgramDocumentRow(documentId);
    if (!row || Number(row.agency_id) !== agencyId || Number(row.program_organization_id) !== programOrganizationId) {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    await pool.execute(
      `UPDATE skill_builders_event_program_documents SET display_title = ? WHERE id = ? AND agency_id = ? AND program_organization_id = ?`,
      [displayTitle, documentId, agencyId, programOrganizationId]
    );
    const fn = String(row.original_filename || '').trim() || 'document.pdf';
    res.json({
      ok: true,
      document: {
        id: documentId,
        originalFilename: fn,
        displayTitle,
        displayLabel: displayTitle || fn
      }
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Run migrations 591–593 for program documents' } });
    }
    next(e);
  }
};

/** POST /api/skill-builders/events/:eventId/sessions/:sessionId/curriculum-from-library */
export const postSkillBuilderSessionCurriculumFromLibrary = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const libraryDocumentId = parsePositiveInt(req.body?.libraryDocumentId);
    if (!agencyId || !eventId || !sessionId || !libraryDocumentId) {
      return res
        .status(400)
        .json({ error: { message: 'agencyId, event id, session id, and libraryDocumentId required' } });
    }
    const cm = await canManageSessionCurriculum(req, agencyId, eventId);
    if (cm.error) return res.status(cm.error.status).json({ error: { message: cm.error.message } });

    const progOrgId = await fetchProgramOrganizationIdForCompanyEvent(agencyId, eventId);
    if (!progOrgId) {
      return res.status(400).json({ error: { message: 'Event is not linked to a program organization' } });
    }
    const lib = await loadProgramDocumentRow(libraryDocumentId);
    if (!lib || Number(lib.agency_id) !== agencyId || Number(lib.program_organization_id) !== progOrgId) {
      return res.status(404).json({ error: { message: 'Library document not found for this program' } });
    }

    const [sRows] = await pool.execute(
      `SELECT s.id, s.company_event_id, s.skills_group_id
       FROM skill_builders_event_sessions s
       INNER JOIN skills_groups sg ON sg.id = s.skills_group_id AND sg.agency_id = ?
       WHERE s.id = ? AND s.company_event_id = ?
       LIMIT 1`,
      [agencyId, sessionId, eventId]
    );
    if (!sRows?.[0]) return res.status(404).json({ error: { message: 'Session not found' } });
    const sgId = Number(sRows[0].skills_group_id);

    const buf = await StorageService.readObject(lib.storage_path);
    const key = curriculumStorageKey(agencyId, eventId, sessionId, lib.original_filename);
    await StorageService.writeObject(key, buf, lib.mime_type || 'application/pdf', {
      uploadedBy: String(req.user?.id || ''),
      kind: 'skill_builders_session_curriculum'
    });
    const { extractStatus, extractedTextEnc } = await processPdfUploadBuffer({
      buffer: buf,
      mimeType: lib.mime_type || 'application/pdf'
    });
    await upsertCurriculumRecord({
      sessionId,
      companyEventId: eventId,
      agencyId,
      skillsGroupId: sgId,
      storagePath: key,
      originalFilename: String(lib.original_filename || 'curriculum.pdf').slice(0, 255),
      mimeType: lib.mime_type || 'application/pdf',
      fileSizeBytes: buf?.length ?? lib.file_size_bytes,
      uploadedByUserId: req.user.id,
      extractedTextEnc,
      extractStatus,
      sourceProgramDocumentId: libraryDocumentId
    });
    res.json({ ok: true, extractStatus, hasExtractedText: !!extractedTextEnc });
  } catch (e) {
    if (e?.message?.includes('not found') || e?.code === 404) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Run migrations 589 and 591' } });
    }
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/sessions/:sessionId/clinical-notes */
export const listSkillBuilderSessionClinicalNotes = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    if (!agencyId || !eventId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and session id required' } });
    }
    const access = await assertClinicalSkillBuildersAccess(req, agencyId, eventId);
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const rows = await listClinicalNotesForSession({ sessionId, companyEventId: eventId });
    res.json({
      ok: true,
      notes: (rows || []).map((r) => ({
        id: Number(r.id),
        clientId: Number(r.client_id),
        authorUserId: Number(r.author_user_id),
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Run migration 589' } });
    }
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/sessions/:sessionId/clinical-notes/clients/:clientId */
export const getSkillBuilderSessionClinicalNote = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const clientId = parsePositiveInt(req.params.clientId);
    if (!agencyId || !eventId || !sessionId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, session id, and client id required' } });
    }
    const access = await assertClinicalSkillBuildersAccess(req, agencyId, eventId);
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const row = await getClinicalNoteBySessionClient({ sessionId, clientId, companyEventId: eventId });
    if (!row) return res.status(404).json({ error: { message: 'Note not found' } });
    const note = decryptClinicalNoteRow(row);
    res.json({ ok: true, note });
  } catch (e) {
    next(e);
  }
};

/** PUT /api/skill-builders/events/:eventId/sessions/:sessionId/clinical-notes/clients/:clientId — save manual text */
export const putSkillBuilderSessionClinicalNoteManual = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const clientId = parsePositiveInt(req.params.clientId);
    if (!agencyId || !eventId || !sessionId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, session id, and client id required' } });
    }
    const access = await assertClinicalSkillBuildersAccess(req, agencyId, eventId);
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await clientOnEventRoster(clientId, eventId, agencyId))) {
      return res.status(400).json({ error: { message: 'Client is not on this event roster' } });
    }
    const text = String(req.body?.plainText || '').trim();
    if (!text) return res.status(400).json({ error: { message: 'plainText is required' } });
    const out = { sections: { Output: text }, meta: { manual: true } };
    const id = await upsertClinicalNote({
      agencyId,
      companyEventId: eventId,
      sessionId,
      clientId,
      authorUserId: req.user.id,
      outputObj: out,
      plainText: text
    });
    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
};

/** POST /api/skill-builders/events/:eventId/sessions/:sessionId/clinical-notes/clients/:clientId/generate */
export const postSkillBuilderSessionClinicalNoteGenerate = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const clientId = parsePositiveInt(req.params.clientId);
    if (!agencyId || !eventId || !sessionId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, session id, and client id required' } });
    }
    const access = await assertClinicalSkillBuildersAccess(req, agencyId, eventId);
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    const na = await requireNoteAidEnabledForAgency(agencyId);
    if (!na.ok) return res.status(403).json({ error: { message: na.error } });

    if (!(await clientOnEventRoster(clientId, eventId, agencyId))) {
      return res.status(400).json({ error: { message: 'Client is not on this event roster' } });
    }

    const [sgRow] = await pool.execute(
      `SELECT sg.name, sg.organization_id FROM skills_groups sg WHERE sg.company_event_id = ? AND sg.agency_id = ? LIMIT 1`,
      [eventId, agencyId]
    );
    const programLabel = sgRow?.[0]?.name ? String(sgRow[0].name).trim().slice(0, 120) : null;

    let curriculumText = await getDecryptedCurriculumTextForSession(sessionId);
    const paste = req.body?.curriculumPaste != null ? String(req.body.curriculumPaste).trim().slice(0, 50000) : '';
    if (paste) curriculumText = paste;

    const clinicianSummaryText = String(req.body?.clinicianSummaryText || '').trim();
    if (!clinicianSummaryText) {
      return res.status(400).json({ error: { message: 'clinicianSummaryText is required' } });
    }
    const revisionInstruction = req.body?.revisionInstruction
      ? String(req.body.revisionInstruction).trim().slice(0, 1500)
      : '';

    const { outputObj, plainText } = await generateH2014SessionClinicalNote({
      agencyId,
      curriculumText,
      clinicianSummaryText,
      programLabel,
      revisionInstruction
    });

    const id = await upsertClinicalNote({
      agencyId,
      companyEventId: eventId,
      sessionId,
      clientId,
      authorUserId: req.user.id,
      outputObj,
      plainText
    });

    res.json({ ok: true, id, note: decryptClinicalNoteRow(await getClinicalNoteBySessionClient({ sessionId, clientId, companyEventId: eventId })) });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** DELETE /api/skill-builders/events/:eventId/sessions/:sessionId/clinical-notes */
export const deleteSkillBuilderSessionClinicalNotes = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const confirm = String(req.body?.confirm || '').trim();
    if (!agencyId || !eventId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and session id required' } });
    }
    if (confirm !== 'DELETE_ALL_CLINICAL_NOTES') {
      return res.status(400).json({ error: { message: 'Confirmation phrase mismatch' } });
    }
    const access = await assertClinicalSkillBuildersAccess(req, agencyId, eventId);
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await canManageTeamSchedulesForAgency(req, agencyId)) && !(await isAgencyStaffLikeForSkillBuilders(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff required' } });
    }
    const n = await deleteClinicalNotesForSession({ sessionId, companyEventId: eventId });
    res.json({ ok: true, deletedCount: n });
  } catch (e) {
    next(e);
  }
};
