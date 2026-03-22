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
    learningProgramClassId: row.learning_program_class_id ? Number(row.learning_program_class_id) : null
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

  const upParams = [providerUserId, agencyId];
  let upSql = `SELECT ce.id, ce.title, ce.starts_at, ce.ends_at, sg.name AS skills_group_name, school.name AS school_name
     FROM company_events ce
     INNER JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     INNER JOIN agencies school ON school.id = sg.organization_id
     LEFT JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id AND sgp.provider_user_id = ?
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
    schoolName: r.school_name
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
      `SELECT sg.*, school.name AS school_name, school.id AS school_id
       FROM skills_groups sg
       INNER JOIN agencies school ON school.id = sg.organization_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
       LIMIT 1`,
      [eventId, agencyId]
    );
    const sg = sgRows?.[0] || null;

    const [provRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM skills_group_providers sgp
       JOIN users u ON u.id = sgp.provider_user_id
       WHERE sgp.skills_group_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [sg?.id || 0]
    );
    const userId = parsePositiveInt(req.user?.id);
    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    const rosterRestrict = !staffLike && !coord;

    const clientSql = rosterRestrict
      ? `SELECT c.id, c.initials, c.identifier_code
         FROM skills_group_clients sgc
         JOIN clients c ON c.id = sgc.client_id
         WHERE sgc.skills_group_id = ?
           AND (sgc.active_for_providers = 1 OR sgc.active_for_providers IS TRUE)
         ORDER BY c.initials ASC
         LIMIT 200`
      : `SELECT c.id, c.initials, c.identifier_code
         FROM skills_group_clients sgc
         JOIN clients c ON c.id = sgc.client_id
         WHERE sgc.skills_group_id = ?
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
            schoolName: sg.school_name
          }
        : null,
      providers: (provRows || []).map((u) => ({
        id: Number(u.id),
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email
      })),
      clients: (clientRows || []).map((c) => ({
        id: Number(c.id),
        initials: c.initials,
        identifierCode: c.identifier_code
      }))
    });
  } catch (e) {
    next(e);
  }
};

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

    const sessions = (rows || []).map((r) => {
      const id = Number(r.id);
      return {
        id,
        sessionDate: r.session_date,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        timezone: r.timezone || 'UTC',
        weekday: r.weekday,
        startTime: String(r.start_time || '').slice(0, 8),
        endTime: String(r.end_time || '').slice(0, 8),
        assignedProviders: assignBySession.get(id) || []
      };
    });
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
      `SELECT s.id, s.skills_group_id
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
