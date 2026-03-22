import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import {
  getSupervisorSuperviseeIds,
  isSupervisorActor,
  supervisorHasSuperviseeInSchool
} from '../utils/supervisorSchoolAccess.js';
import {
  resolveSkillBuildersProgramOrganizationId,
  buildSkillsGroupEventDescription,
  computeSkillsGroupEventWindow,
  insertSkillsGroupCompanyEvent,
  updateSkillsGroupCompanyEvent,
  deactivateSkillsGroupCompanyEvent
} from '../services/skillBuildersSkillsGroup.service.js';
import { replaceSkillsGroupMeetings } from '../services/skillsGroupMeetingsWrite.service.js';
import { materializeSkillBuildersEventSessions } from '../services/skillBuildersEventSessions.service.js';
import { ProviderAvailabilityService } from '../services/providerAvailability.service.js';

const allowedOrgTypes = ['school', 'program', 'learning'];
const allowedWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const normalizeWeekday = (d) => {
  const s = String(d || '').trim();
  return allowedWeekdays.includes(s) ? s : null;
};

const normalizeTime = (t) => {
  const s = String(t || '').trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
};

const parseYmd = (v) => {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
};

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

async function providerHasActiveSkillsGroupAccess({ providerUserId, organizationId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM skills_groups sg
       JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id
       WHERE sg.organization_id = ?
         AND sg.start_date <= CURDATE()
         AND sg.end_date >= CURDATE()
         AND sgp.provider_user_id = ?
       LIMIT 1`,
      [parseInt(organizationId, 10), parseInt(providerUserId, 10)]
    );
    return !!rows?.[0];
  } catch (e) {
    // If tables don't exist yet, treat as no access.
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (missing) return false;
    throw e;
  }
}

async function ensureSkillsGroupOrgAccess(req, organizationId) {
  const orgId = parseInt(organizationId, 10);
  if (!orgId) return { ok: false, status: 400, message: 'Invalid organizationId' };

  const org = await Agency.findById(orgId);
  if (!org) return { ok: false, status: 404, message: 'Organization not found' };
  const orgType = String(org.organization_type || 'agency').toLowerCase();
  if (!allowedOrgTypes.includes(orgType)) {
    return { ok: false, status: 400, message: `This endpoint is only available for organizations of type: ${allowedOrgTypes.join(', ')}` };
  }

  const roleNorm = String(req.user?.role || '').toLowerCase();
  if (roleNorm === 'super_admin') {
    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    return { ok: true, org, activeAgencyId: activeAgencyId ? parseInt(activeAgencyId, 10) : null };
  }

  const userId = req.user?.id;
  if (!userId) return { ok: false, status: 401, message: 'Not authenticated' };

  const orgs = await User.getAgencies(userId);
  const hasDirect = (orgs || []).some((o) => parseInt(o.id, 10) === orgId);
  const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
  const hasAgency = activeAgencyId
    ? (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(activeAgencyId, 10))
    : false;

  if (hasDirect) return { ok: true, org, activeAgencyId: activeAgencyId ? parseInt(activeAgencyId, 10) : null };

  // Staff/admin can access via agency affiliation.
  if (roleNorm === 'admin' || roleNorm === 'staff' || roleNorm === 'support' || roleNorm === 'clinical_practice_assistant' || roleNorm === 'provider_plus') {
    if (!activeAgencyId || !hasAgency) return { ok: false, status: 403, message: 'You do not have access to this organization' };
    return { ok: true, org, activeAgencyId: parseInt(activeAgencyId, 10) };
  }

  const hasSupervisorCapability = await isSupervisorActor({ userId, role: roleNorm, user: req.user });
  if (hasSupervisorCapability && (await supervisorHasSuperviseeInSchool(userId, orgId))) {
    return {
      ok: true,
      org,
      activeAgencyId: activeAgencyId ? parseInt(activeAgencyId, 10) : null,
      supervisorLimited: true
    };
  }

  // Providers: limited access only if assigned to an active Skills Group under this org.
  if (roleNorm === 'provider') {
    const ok = await providerHasActiveSkillsGroupAccess({ providerUserId: userId, organizationId: orgId });
    if (!ok) return { ok: false, status: 403, message: 'You do not have access to this organization' };
    return { ok: true, org, activeAgencyId: activeAgencyId ? parseInt(activeAgencyId, 10) : null, providerLimited: true };
  }

  // school_staff must be directly assigned to org (no agency-affiliation)
  if (roleNorm === 'school_staff') {
    return { ok: false, status: 403, message: 'You do not have access to this organization' };
  }

  return { ok: false, status: 403, message: 'Access denied' };
}

function canManageSkillsGroups(req) {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'staff' || r === 'support' || r === 'clinical_practice_assistant' || r === 'provider_plus';
}

async function loadGroupsWithDetails({ organizationId, providerUserId = null }) {
  const vals = [parseInt(organizationId, 10)];
  let where = 'sg.organization_id = ?';
  if (providerUserId) {
    where += ' AND sgp.provider_user_id = ?';
    vals.push(parseInt(providerUserId, 10));
  }

  const [groups] = await pool.execute(
    `SELECT DISTINCT sg.id, sg.organization_id, sg.agency_id, sg.name, sg.start_date, sg.end_date,
            sg.skill_builders_program_organization_id, sg.company_event_id, sg.created_at, sg.updated_at
     FROM skills_groups sg
     ${providerUserId ? 'JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id' : ''}
     WHERE ${where}
     ORDER BY sg.start_date DESC, sg.id DESC`,
    vals
  );

  const ids = (groups || []).map((g) => Number(g.id)).filter(Boolean);
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(',');

  const [meetings] = await pool.execute(
    `SELECT skills_group_id, weekday, start_time, end_time
     FROM skills_group_meetings
     WHERE skills_group_id IN (${placeholders})
     ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
    ids
  );

  const [providers] = await pool.execute(
    `SELECT sgp.skills_group_id, u.id AS provider_user_id, u.first_name, u.last_name, u.email,
            u.skill_builder_eligible
     FROM skills_group_providers sgp
     JOIN users u ON u.id = sgp.provider_user_id
     WHERE sgp.skills_group_id IN (${placeholders})
     ORDER BY u.last_name ASC, u.first_name ASC`,
    ids
  );

  const [clients] = await pool.execute(
    `SELECT sgc.skills_group_id, c.id AS client_id, c.identifier_code, c.initials
     FROM skills_group_clients sgc
     JOIN clients c ON c.id = sgc.client_id
     WHERE sgc.skills_group_id IN (${placeholders})
     ORDER BY c.identifier_code ASC, c.initials ASC`,
    ids
  );

  const byId = new Map();
  for (const g of groups || []) {
    byId.set(Number(g.id), { ...g, meetings: [], providers: [], clients: [] });
  }
  for (const m of meetings || []) {
    const g = byId.get(Number(m.skills_group_id));
    if (g) g.meetings.push({ weekday: m.weekday, start_time: m.start_time, end_time: m.end_time });
  }
  for (const p of providers || []) {
    const g = byId.get(Number(p.skills_group_id));
    if (g) {
      const elig = p.skill_builder_eligible;
      g.providers.push({
        provider_user_id: p.provider_user_id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        skill_builder_eligible: !!(elig === true || elig === 1 || elig === '1')
      });
    }
  }
  for (const c of clients || []) {
    const g = byId.get(Number(c.skills_group_id));
    if (g) g.clients.push({ client_id: c.client_id, identifier_code: c.identifier_code || null, initials: c.initials || null });
  }

  return Array.from(byId.values());
}

async function syncSkillsGroupIntegratedEvent(conn, { groupId, activeAgencyId, userId, schoolOrgId, groupName }) {
  const gid = Number(groupId);
  const [grows] = await conn.execute(
    `SELECT start_date, end_date, company_event_id, skill_builders_program_organization_id
     FROM skills_groups WHERE id = ? LIMIT 1`,
    [gid]
  );
  const g = grows?.[0];
  if (!g) return;

  const school = await Agency.findById(schoolOrgId);
  const schoolName = String(school?.name || 'School').trim();

  const [mrows] = await conn.execute(
    `SELECT weekday, start_time, end_time
     FROM skills_group_meetings
     WHERE skills_group_id = ?
     ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
    [gid]
  );

  const resolvedProgramId = await resolveSkillBuildersProgramOrganizationId(conn, activeAgencyId);
  const programOrgId =
    resolvedProgramId ||
    (g.skill_builders_program_organization_id ? Number(g.skill_builders_program_organization_id) : null);

  const agencyTz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId: activeAgencyId });
  const { startsAt, endsAt, timeZone: eventTz } = computeSkillsGroupEventWindow(
    g.start_date,
    g.end_date,
    agencyTz
  );
  const description = buildSkillsGroupEventDescription({
    schoolName,
    groupName: String(groupName || '').trim() || `Group ${gid}`,
    startDate: g.start_date,
    endDate: g.end_date,
    meetings: mrows || []
  });
  const title = `Skill Builders: ${String(groupName || '').trim() || `Group ${gid}`}`.slice(0, 255);

  if (g.company_event_id) {
    await updateSkillsGroupCompanyEvent(conn, Number(g.company_event_id), {
      title,
      description,
      startsAt,
      endsAt,
      programOrgId,
      userId,
      timeZone: eventTz
    });
    if (programOrgId) {
      await conn.execute(
        `UPDATE skills_groups SET skill_builders_program_organization_id = ? WHERE id = ?`,
        [programOrgId, gid]
      );
    }
    return;
  }

  if (!programOrgId) return;

  const eventId = await insertSkillsGroupCompanyEvent(conn, {
    agencyId: activeAgencyId,
    programOrgId,
    userId,
    title,
    description,
    startsAt,
    endsAt,
    timeZone: eventTz
  });
  await conn.execute(
    `UPDATE skills_groups SET skill_builders_program_organization_id = ?, company_event_id = ? WHERE id = ?`,
    [programOrgId, eventId, gid]
  );
}

/**
 * GET /api/school-portal/:orgId/skill-builders-program
 * Admin UI: whether the agency has a resolvable Skill Builders program org.
 */
export const getSkillBuildersProgramLink = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canManageSkillsGroups(req)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const aid = access.activeAgencyId;
    if (!aid) return res.json({ hasProgram: false, programOrganizationId: null, programName: null });

    const programOrgId = await resolveSkillBuildersProgramOrganizationId(pool, aid);
    if (!programOrgId) {
      return res.json({ hasProgram: false, programOrganizationId: null, programName: null });
    }
    const [rows] = await pool.execute(`SELECT id, name FROM agencies WHERE id = ? LIMIT 1`, [programOrgId]);
    const name = String(rows?.[0]?.name || '').trim() || 'Skill Builders';
    res.json({ hasProgram: true, programOrganizationId: programOrgId, programName: name });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/school-portal/:orgId/skills-groups
 */
export const listSkillsGroups = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const roleNorm = String(req.user?.role || '').toLowerCase();
    const providerUserId = roleNorm === 'provider' ? parseInt(req.user.id, 10) : null;
    const rows = await loadGroupsWithDetails({ organizationId: orgId, providerUserId });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/school-portal/:orgId/skills-groups
 * body: { name, start_date, end_date, meetings: [{weekday,start_time,end_time}] }
 */
export const createSkillsGroup = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canManageSkillsGroups(req)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const name = String(req.body?.name || '').trim();
    const rawStart = req.body?.start_date;
    const rawEnd = req.body?.end_date;
    const startStr = String(rawStart || '').trim();
    const endStr = String(rawEnd || '').trim();
    const startDate = startStr ? parseYmd(startStr) : null;
    const endDate = endStr ? parseYmd(endStr) : null;
    const meetings = Array.isArray(req.body?.meetings) ? req.body.meetings : [];
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });
    if ((startStr && !startDate) || (endStr && !endDate)) {
      return res.status(400).json({ error: { message: 'Invalid start_date or end_date (expected YYYY-MM-DD)' } });
    }
    // Dates are optional, but if either is set, require both.
    if ((!!startStr && !endStr) || (!startStr && !!endStr)) {
      return res.status(400).json({ error: { message: 'If you set a start date, an end date is also required (and vice versa)' } });
    }

    const activeAgencyId = access.activeAgencyId;
    if (!activeAgencyId) return res.status(400).json({ error: { message: 'Organization is missing an active affiliated agency' } });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, activeAgencyId);
      if (!programOrgId) {
        await conn.rollback();
        return res.status(400).json({
          error: {
            message:
              'No affiliated program named "Skill Builders" exists for this agency. Create or rename a program organization, then try again.'
          }
        });
      }

      const [result] = await conn.execute(
        `INSERT INTO skills_groups
          (organization_id, agency_id, name, start_date, end_date, created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [parseInt(orgId, 10), activeAgencyId, name, startDate, endDate, req.user.id, req.user.id]
      );
      const groupId = result.insertId;

      // Meetings are optional. Ignore fully-blank rows; otherwise require complete meeting.
      for (const raw of meetings) {
        const weekdayRaw = String(raw?.weekday || '').trim();
        const startRaw = String(raw?.start_time || '').trim();
        const endRaw = String(raw?.end_time || '').trim();
        const any = !!weekdayRaw || !!startRaw || !!endRaw;
        if (!any) continue;
        const weekday = normalizeWeekday(weekdayRaw);
        const startTime = normalizeTime(startRaw);
        const endTime = normalizeTime(endRaw);
        if (!weekday || !startTime || !endTime) {
          await conn.rollback();
          return res.status(400).json({ error: { message: 'Invalid meeting (weekday/start_time/end_time)' } });
        }
        // eslint-disable-next-line no-await-in-loop
        await conn.execute(
          `INSERT INTO skills_group_meetings (skills_group_id, weekday, start_time, end_time)
           VALUES (?, ?, ?, ?)`,
          [groupId, weekday, startTime, endTime]
        );
      }

      await syncSkillsGroupIntegratedEvent(conn, {
        groupId,
        activeAgencyId,
        userId: req.user.id,
        schoolOrgId: parseInt(orgId, 10),
        groupName: name
      });

      await materializeSkillBuildersEventSessions(conn, { skillsGroupId: groupId });

      await conn.commit();
      const rows = await loadGroupsWithDetails({ organizationId: orgId, providerUserId: null });
      const created = rows.find((g) => Number(g.id) === Number(groupId)) || null;
      res.status(201).json(created);
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/school-portal/:orgId/skills-groups/:groupId
 * body: { name, start_date, end_date, meetings: [...] }
 */
export const updateSkillsGroup = async (req, res, next) => {
  try {
    const { orgId, groupId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canManageSkillsGroups(req)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const gid = parseInt(groupId, 10);
    if (!gid) return res.status(400).json({ error: { message: 'Invalid groupId' } });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const rawStart = req.body?.start_date;
    const rawEnd = req.body?.end_date;
    const hasStart = rawStart !== undefined;
    const hasEnd = rawEnd !== undefined;
    const startStr = hasStart ? String(rawStart || '').trim() : '';
    const endStr = hasEnd ? String(rawEnd || '').trim() : '';
    const startDate = hasStart ? (startStr ? parseYmd(startStr) : null) : undefined;
    const endDate = hasEnd ? (endStr ? parseYmd(endStr) : null) : undefined;
    if ((startStr && !startDate) || (endStr && !endDate)) {
      return res.status(400).json({ error: { message: 'Invalid start_date or end_date (expected YYYY-MM-DD)' } });
    }
    // Dates are optional, but if either is provided in this request, require both.
    if ((hasStart && !hasEnd) || (!hasStart && hasEnd)) {
      return res.status(400).json({ error: { message: 'Provide both start_date and end_date together when updating dates' } });
    }
    if (hasStart && hasEnd && ((!!startStr && !endStr) || (!startStr && !!endStr))) {
      return res.status(400).json({ error: { message: 'If you set a start date, an end date is also required (and vice versa)' } });
    }

    const hasMeetingsField = req.body?.meetings !== undefined;
    const meetings = Array.isArray(req.body?.meetings) ? req.body.meetings : [];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [grows] = await conn.execute(
        `SELECT id FROM skills_groups WHERE id = ? AND organization_id = ? LIMIT 1 FOR UPDATE`,
        [gid, parseInt(orgId, 10)]
      );
      if (!grows?.[0]?.id) {
        await conn.rollback();
        return res.status(404).json({ error: { message: 'Skills group not found' } });
      }

      // Partial updates: dates/meetings optional in School Portal.
      const updates = ['name = ?', 'updated_by_user_id = ?'];
      const values = [name, req.user.id];
      if (hasStart && hasEnd) {
        updates.push('start_date = ?', 'end_date = ?');
        values.push(startDate, endDate);
      }
      values.push(gid);
      await conn.execute(`UPDATE skills_groups SET ${updates.join(', ')} WHERE id = ?`, values);

      if (hasMeetingsField) {
        try {
          await replaceSkillsGroupMeetings(conn, gid, meetings);
        } catch (e) {
          await conn.rollback();
          const code = Number(e?.statusCode);
          if (code === 400) {
            return res.status(400).json({ error: { message: e.message || 'Invalid meetings' } });
          }
          throw e;
        }
      }

      await syncSkillsGroupIntegratedEvent(conn, {
        groupId: gid,
        activeAgencyId: access.activeAgencyId,
        userId: req.user.id,
        schoolOrgId: parseInt(orgId, 10),
        groupName: name
      });

      await materializeSkillBuildersEventSessions(conn, { skillsGroupId: gid });

      await conn.commit();
      const rows = await loadGroupsWithDetails({ organizationId: orgId, providerUserId: null });
      const updated = rows.find((g) => Number(g.id) === Number(gid)) || null;
      res.json(updated);
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/school-portal/:orgId/skills-groups/:groupId
 */
export const deleteSkillsGroup = async (req, res, next) => {
  try {
    const { orgId, groupId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canManageSkillsGroups(req)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const gid = parseInt(groupId, 10);
    if (!gid) return res.status(400).json({ error: { message: 'Invalid groupId' } });

    const [ceRows] = await pool.execute(
      `SELECT company_event_id FROM skills_groups WHERE id = ? AND organization_id = ? LIMIT 1`,
      [gid, parseInt(orgId, 10)]
    );
    const ceid = ceRows?.[0]?.company_event_id ? Number(ceRows[0].company_event_id) : null;
    if (ceid) {
      await deactivateSkillsGroupCompanyEvent(pool, ceid, req.user.id);
    }

    await pool.execute(`DELETE FROM skills_groups WHERE id = ? AND organization_id = ?`, [gid, parseInt(orgId, 10)]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/school-portal/:orgId/skills-groups/:groupId/providers
 * body: { provider_user_id, action: 'add'|'remove' }
 */
export const updateSkillsGroupProvider = async (req, res, next) => {
  try {
    const { orgId, groupId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canManageSkillsGroups(req)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const gid = parseInt(groupId, 10);
    const providerUserId = parseInt(req.body?.provider_user_id, 10);
    const action = String(req.body?.action || '').toLowerCase();
    if (!gid || !providerUserId || !['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: { message: 'provider_user_id and action=add|remove are required' } });
    }

    // Ensure provider belongs to org's agency (best-effort; super_admin may bypass)
    const activeAgencyId = access.activeAgencyId;
    if (activeAgencyId && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      const [ua] = await pool.execute(
        `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
        [providerUserId, activeAgencyId]
      );
      if (!ua?.[0]) return res.status(400).json({ error: { message: 'Provider is not part of this agency' } });
    }

    if (action === 'add') {
      const [elig] = await pool.execute(
        `SELECT skill_builder_eligible FROM users WHERE id = ? LIMIT 1`,
        [providerUserId]
      );
      const eligible = elig?.[0]?.skill_builder_eligible;
      const isEligible = eligible === true || eligible === 1 || eligible === '1';
      if (!isEligible) {
        return res.status(400).json({
          error: { message: 'Only Skill Builder–eligible providers can be added to a Skill Builders skills group.' }
        });
      }
      await pool.execute(
        `INSERT IGNORE INTO skills_group_providers (skills_group_id, provider_user_id) VALUES (?, ?)`,
        [gid, providerUserId]
      );
    } else {
      await pool.execute(
        `DELETE FROM skills_group_providers WHERE skills_group_id = ? AND provider_user_id = ?`,
        [gid, providerUserId]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/school-portal/:orgId/skills-groups/:groupId/clients
 * body: { client_id, action: 'add'|'remove' }
 */
export const updateSkillsGroupClient = async (req, res, next) => {
  try {
    const { orgId, groupId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canManageSkillsGroups(req)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const gid = parseInt(groupId, 10);
    const clientId = parseInt(req.body?.client_id, 10);
    const action = String(req.body?.action || '').toLowerCase();
    if (!gid || !clientId || !['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: { message: 'client_id and action=add|remove are required' } });
    }

    // Ensure client is skills=true and affiliated to org (best-effort if multi-org tables exist).
    const [crows] = await pool.execute(`SELECT id, skills, organization_id FROM clients WHERE id = ? LIMIT 1`, [clientId]);
    const c = crows?.[0] || null;
    if (!c) return res.status(404).json({ error: { message: 'Client not found' } });
    if (!c.skills) return res.status(400).json({ error: { message: 'Client is not marked as a Skills client' } });

    let affiliated = false;
    try {
      const [arows] = await pool.execute(
        `SELECT 1
         FROM client_organization_assignments
         WHERE client_id = ? AND organization_id = ? AND is_active = TRUE
         LIMIT 1`,
        [clientId, parseInt(orgId, 10)]
      );
      affiliated = !!arows?.[0];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      affiliated = parseInt(c.organization_id, 10) === parseInt(orgId, 10);
    }
    if (!affiliated) return res.status(400).json({ error: { message: 'Client is not affiliated to this organization' } });

    if (action === 'add') {
      await pool.execute(
        `INSERT INTO skills_group_clients
          (skills_group_id, client_id, active_for_providers, ready_confirmed_by_user_id, ready_confirmed_at)
         VALUES (?, ?, 0, NULL, NULL)
         ON DUPLICATE KEY UPDATE skills_group_id = skills_group_id`,
        [gid, clientId]
      );
    } else {
      await pool.execute(
        `DELETE FROM skills_group_clients WHERE skills_group_id = ? AND client_id = ?`,
        [gid, clientId]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/school-portal/:orgId/skills-eligible-clients
 * Clients affiliated to org AND skills=true.
 */
export const listSkillsEligibleClients = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Providers get read-only access; this is used for admin assignment UI, so keep it restricted.
    if (!canManageSkillsGroups(req)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const unassignedOnly = ['1', 'true', 'yes'].includes(String(req.query?.unassigned || '').toLowerCase());

    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT c.id, c.identifier_code, c.initials
         FROM clients c
         JOIN client_organization_assignments coa
           ON coa.client_id = c.id AND coa.organization_id = ? AND coa.is_active = TRUE
         LEFT JOIN skills_group_clients sgc ON sgc.client_id = c.id
         LEFT JOIN skills_groups sg
           ON sg.id = sgc.skills_group_id AND sg.organization_id = coa.organization_id
         WHERE c.skills = TRUE
           AND UPPER(c.status) <> 'ARCHIVED'
           AND (? = 0 OR sg.id IS NULL)
         ORDER BY c.identifier_code ASC, c.initials ASC`,
        [parseInt(orgId, 10), unassignedOnly ? 1 : 0]
      );
      return res.json(rows || []);
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      const [rows] = await pool.execute(
        `SELECT DISTINCT c.id, c.identifier_code, c.initials
         FROM clients
         LEFT JOIN skills_group_clients sgc ON sgc.client_id = c.id
         LEFT JOIN skills_groups sg
           ON sg.id = sgc.skills_group_id AND sg.organization_id = c.organization_id
         WHERE organization_id = ?
           AND skills = TRUE
           AND UPPER(status) <> 'ARCHIVED'
           AND (? = 0 OR sg.id IS NULL)
         ORDER BY identifier_code ASC, initials ASC`,
        [parseInt(orgId, 10), unassignedOnly ? 1 : 0]
      );
      return res.json(rows || []);
    }
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/school-portal/:orgId/skills-eligible-providers
 * All agency providers (not limited to org affiliation).
 */
export const listSkillsEligibleProviders = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canManageSkillsGroups(req)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const agencyId = access.activeAgencyId;
    if (!agencyId) return res.json([]);

    const [rows] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              u.has_provider_access,
              u.is_active,
              u.is_archived,
              u.status
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.status IS NULL OR UPPER(u.status) <> 'ARCHIVED')
         AND (
           LOWER(u.role) IN ('provider','clinician')
           OR (u.has_provider_access = TRUE)
         )
         AND (u.skill_builder_eligible = TRUE OR u.skill_builder_eligible = 1)
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/school-portal/:orgId/skills-group-meetings
 * Meetings for skills groups a provider is assigned to.
 */
export const listProviderSkillsGroupMeetings = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const access = await ensureSkillsGroupOrgAccess(req, orgId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const roleNorm = String(req.user?.role || '').toLowerCase();
    const providerUserId = req.query?.providerUserId ? parseInt(req.query.providerUserId, 10) : parseInt(req.user?.id, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'providerUserId is required' } });
    if (roleNorm === 'provider' && parseInt(req.user?.id, 10) !== providerUserId) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (access.supervisorLimited) {
      const superviseeIds = await getSupervisorSuperviseeIds(req.user?.id, null);
      const allowed = (superviseeIds || []).some((id) => parseInt(id, 10) === parseInt(providerUserId, 10));
      if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const weekday = String(req.query?.weekday || '').trim();
    const hasWeekday = allowedWeekdays.includes(weekday);
    const params = [parseInt(orgId, 10), providerUserId];
    let weekdayClause = '';
    if (hasWeekday) {
      weekdayClause = ' AND sgm.weekday = ?';
      params.push(weekday);
    }

    const [rows] = await pool.execute(
      `SELECT sg.id AS skills_group_id,
              sg.name AS skills_group_name,
              sgm.weekday,
              sgm.start_time,
              sgm.end_time
       FROM skills_groups sg
       JOIN skills_group_providers sgp ON sgp.skills_group_id = sg.id
       JOIN skills_group_meetings sgm ON sgm.skills_group_id = sg.id
       WHERE sg.organization_id = ?
         AND sgp.provider_user_id = ?
         AND (sg.start_date IS NULL OR sg.start_date <= CURDATE())
         AND (sg.end_date IS NULL OR sg.end_date >= CURDATE())
         ${weekdayClause}
       ORDER BY FIELD(sgm.weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), sgm.start_time ASC`,
      params
    );
    res.json(rows || []);
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('ER_BAD_FIELD_ERROR');
    if (missing) return res.json([]);
    next(e);
  }
};

