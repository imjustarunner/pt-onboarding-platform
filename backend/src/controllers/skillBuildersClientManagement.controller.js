import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import { isSkillsClientFlag } from '../utils/skillsClientFlag.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function ageFromDateOfBirth(dob) {
  if (!dob) return null;
  const s = String(dob).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const birth = new Date(`${s}T12:00:00Z`);
  if (!Number.isFinite(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

async function userHasAgencyAccess(req, agencyId) {
  if (!agencyId) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user?.id);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

async function isAgencyStaffLikeForSkillBuilders(req, agencyId) {
  if (!(await userHasAgencyAccess(req, agencyId))) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  return role === 'admin' || role === 'staff' || role === 'support';
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

async function assertSkillBuildersCoordinationAccess(req, agencyId) {
  const uid = parsePositiveInt(req.user?.id);
  if (!uid) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin' && (await userHasAgencyAccess(req, agencyId))) {
    return true;
  }
  if (await isAgencyStaffLikeForSkillBuilders(req, agencyId)) return true;
  if (await getSkillBuilderCoordinatorAccess(uid)) return true;
  return false;
}

async function assertEventAccessForUser({ req, agencyId, eventId }) {
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

function clientAffiliatedToSchool(clientId, schoolOrgId) {
  return pool
    .execute(
      `SELECT 1 FROM client_organization_assignments
       WHERE client_id = ? AND organization_id = ? AND is_active = TRUE LIMIT 1`,
      [clientId, schoolOrgId]
    )
    .then(([r]) => !!r?.[0]);
}

/** GET /api/skill-builders/coordinator/company-events-search?agencyId=&q= */
export const listCoordinatorSkillBuilderCompanyEvents = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const q = String(req.query.q || '').trim();
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertSkillBuildersCoordinationAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }
    const params = [agencyId];
    let searchSql = '';
    if (q) {
      if (/^\d+$/.test(q)) {
        searchSql = ' AND (ce.id = ? OR ce.title LIKE ?) ';
        params.push(Number(q), `%${q}%`);
      } else {
        searchSql = ' AND ce.title LIKE ? ';
        params.push(`%${q}%`);
      }
    }
    const [rows] = await pool.execute(
      `SELECT DISTINCT ce.id, ce.title, ce.starts_at, ce.ends_at,
              sg.name AS skills_group_name, sch.name AS school_name,
              LOWER(TRIM(prog.slug)) AS program_portal_slug
       FROM company_events ce
       LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
       LEFT JOIN agencies sch ON sch.id = sg.organization_id
       LEFT JOIN agencies prog ON prog.id = ce.organization_id
       WHERE ce.agency_id = ?
       ${searchSql}
       ORDER BY ce.starts_at DESC
       LIMIT 40`,
      params
    );
    res.json({
      ok: true,
      events: (rows || []).map((r) => ({
        companyEventId: Number(r.id),
        title: r.title,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        skillsGroupName: r.skills_group_name || '',
        schoolName: r.school_name || '',
        programPortalSlug:
          r.program_portal_slug != null && String(r.program_portal_slug).trim()
            ? String(r.program_portal_slug).trim().toLowerCase()
            : null
      }))
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/skill-builders/coordinator/master-clients?agencyId=&schoolOrganizationId= */
export const listMasterSkillBuilderClients = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const schoolFilter = parsePositiveInt(req.query.schoolOrganizationId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertSkillBuildersCoordinationAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }

    const params = [agencyId, agencyId];
    let schoolClause = '';
    if (schoolFilter) {
      schoolClause = ' AND sch.id = ? ';
      params.push(schoolFilter);
    }

    const [rows] = await pool.execute(
      `SELECT
         c.id AS client_id,
         c.initials,
         c.identifier_code,
         c.grade,
         c.date_of_birth,
         c.skill_builders_intake_complete,
         c.skill_builders_treatment_plan_complete,
         sch.id AS school_organization_id,
         sch.name AS school_name,
         GROUP_CONCAT(
           DISTINCT CONCAT(
             IFNULL(sgc.skills_group_id, ''),
             '|',
             IFNULL(sg.company_event_id, ''),
             '|',
             IFNULL(sg.name, ''),
             '|',
             IFNULL(sgc.active_for_providers, 0)
           )
           ORDER BY sg.name SEPARATOR ';;'
         ) AS memberships_blob
       FROM clients c
       INNER JOIN client_organization_assignments coa
         ON coa.client_id = c.id AND coa.is_active = TRUE
       INNER JOIN agencies sch ON sch.id = coa.organization_id
       INNER JOIN organization_affiliations oa
         ON oa.organization_id = sch.id AND oa.agency_id = ? AND oa.is_active = TRUE
       LEFT JOIN skills_group_clients sgc ON sgc.client_id = c.id
       LEFT JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = c.agency_id
       WHERE c.agency_id = ?
         AND c.skills = TRUE
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
         ${schoolClause}
       GROUP BY c.id, sch.id
       ORDER BY sch.name ASC, c.initials ASC
       LIMIT 800`,
      params
    );

    const clients = (rows || []).map((r) => {
      const events = [];
      const raw = String(r.memberships_blob || '');
      if (raw) {
        for (const part of raw.split(';;')) {
          const [sgId, evId, name, active] = String(part || '').split('|');
          const sgNum = Number(sgId);
          const evNum = Number(evId);
          if (Number.isFinite(sgNum) && sgNum > 0 && Number.isFinite(evNum) && evNum > 0) {
            events.push({
              skillsGroupId: sgNum,
              companyEventId: evNum,
              skillsGroupName: name || '',
              activeForProviders: String(active) === '1'
            });
          }
        }
      }
      return {
        clientId: Number(r.client_id),
        initials: r.initials,
        identifierCode: r.identifier_code,
        grade: r.grade,
        dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null,
        ageYears: ageFromDateOfBirth(r.date_of_birth),
        schoolOrganizationId: Number(r.school_organization_id),
        schoolName: r.school_name,
        intakeComplete: !!(r.skill_builders_intake_complete === 1 || r.skill_builders_intake_complete === true),
        treatmentPlanComplete: !!(
          r.skill_builders_treatment_plan_complete === 1 || r.skill_builders_treatment_plan_complete === true
        ),
        events
      };
    });

    res.json({ ok: true, clients });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes("Unknown column 'date_of_birth'")) {
      return res.status(503).json({ error: { message: 'Run database migration 582_clients_date_of_birth.sql' } });
    }
    if (msg.includes("Unknown column 'skill_builders") || msg.includes('skill_builders_intake_complete')) {
      return res.status(503).json({ error: { message: 'Run database migration 581_skill_builders_client_coordination.sql' } });
    }
    if (msg.includes("doesn't exist") && msg.includes('organization_affiliations')) {
      return res.status(503).json({ error: { message: 'organization_affiliations missing; cannot scope schools' } });
    }
    next(e);
  }
};

/** PATCH /api/skill-builders/coordinator/clients/:clientId */
export const patchCoordinatorSkillBuilderClient = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    if (!(await assertSkillBuildersCoordinationAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }

    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Client not found for this agency' } });
    }
    if (!isSkillsClientFlag(cur.skills)) {
      return res.status(400).json({ error: { message: 'Client is not a Skill Builders (skills) client' } });
    }

    const intake =
      req.body?.skillBuildersIntakeComplete === undefined
        ? undefined
        : !!req.body.skillBuildersIntakeComplete;
    const tp =
      req.body?.skillBuildersTreatmentPlanComplete === undefined
        ? undefined
        : !!req.body.skillBuildersTreatmentPlanComplete;

    const curIntake = !!(cur.skill_builders_intake_complete === 1 || cur.skill_builders_intake_complete === true);
    const curTp = !!(cur.skill_builders_treatment_plan_complete === 1 || cur.skill_builders_treatment_plan_complete === true);

    if (intake === false && curTp) {
      return res.status(400).json({
        error: {
          message: 'Mark treatment plan as not complete before marking intake incomplete'
        }
      });
    }
    if (tp === true) {
      const intakeAfter = intake !== undefined ? intake : curIntake;
      if (!intakeAfter) {
        return res.status(400).json({
          error: { message: 'Intake must be complete before treatment plan can be marked complete' }
        });
      }
    }

    const payload = {};
    if (intake !== undefined) payload.skill_builders_intake_complete = intake;
    if (tp !== undefined) payload.skill_builders_treatment_plan_complete = tp;

    if (Object.keys(payload).length) {
      await Client.update(clientId, payload, userId);
    }

    const updated = await Client.findById(clientId);
    res.json({
      ok: true,
      client: updated,
      shouldPromptMarkReady: false,
      promptMessage: null
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/skill-builders/coordinator/clients/:clientId/confirm-ready */
export const confirmClientReadyForGroups = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    const userId = parsePositiveInt(req.user?.id);
    const companyEventIds = Array.isArray(req.body?.companyEventIds) ? req.body.companyEventIds : null;
    const allGroups = req.body?.all === true || String(req.body?.all || '').toLowerCase() === 'true';
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!(await assertSkillBuildersCoordinationAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }

    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Client not found for this agency' } });
    }

    if (allGroups) {
      await pool.execute(
        `UPDATE skills_group_clients sgc
         INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
         SET sgc.active_for_providers = 1,
             sgc.ready_confirmed_by_user_id = ?,
             sgc.ready_confirmed_at = NOW()
         WHERE sgc.client_id = ?`,
        [agencyId, userId, clientId]
      );
    } else {
      const ids = (companyEventIds || [])
        .map((x) => parsePositiveInt(x))
        .filter(Boolean);
      if (!ids.length) {
        return res.status(400).json({ error: { message: 'companyEventIds or all=true is required' } });
      }
      const ph = ids.map(() => '?').join(',');
      await pool.execute(
        `UPDATE skills_group_clients sgc
         INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
         INNER JOIN company_events ce ON ce.id = sg.company_event_id
         SET sgc.active_for_providers = 1,
             sgc.ready_confirmed_by_user_id = ?,
             sgc.ready_confirmed_at = NOW()
         WHERE sgc.client_id = ?
           AND ce.id IN (${ph})`,
        [agencyId, userId, clientId, ...ids]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/** POST /api/skill-builders/coordinator/clients/:clientId/assign-event */
export const coordinatorAssignClientToEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    const eventId = parsePositiveInt(req.body?.companyEventId);
    const schoolOrganizationId = parsePositiveInt(req.body?.schoolOrganizationId);
    if (!agencyId || !clientId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId, companyEventId required' } });
    }
    if (!(await assertSkillBuildersCoordinationAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }

    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId || !isSkillsClientFlag(cur.skills)) {
      return res.status(400).json({ error: { message: 'Client not found or not a skills client' } });
    }

    const [sgRows] = await pool.execute(
      `SELECT sg.id, sg.organization_id FROM skills_groups sg
       WHERE sg.company_event_id = ? AND sg.agency_id = ? LIMIT 1`,
      [eventId, agencyId]
    );
    const sg = sgRows?.[0];
    if (!sg) return res.status(404).json({ error: { message: 'Skills group not linked to event' } });

    const schoolOrg = Number(sg.organization_id);
    if (schoolOrganizationId && schoolOrg !== schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'School mismatch for this client row' } });
    }
    if (!(await clientAffiliatedToSchool(clientId, schoolOrg))) {
      return res.status(400).json({ error: { message: 'Client is not affiliated with this event school' } });
    }

    await pool.execute(
      `INSERT INTO skills_group_clients
        (skills_group_id, client_id, active_for_providers, ready_confirmed_by_user_id, ready_confirmed_at)
       VALUES (?, ?, 0, NULL, NULL)
       ON DUPLICATE KEY UPDATE skills_group_id = skills_group_id`,
      [sg.id, clientId]
    );

    res.json({ ok: true, skillsGroupId: Number(sg.id) });
  } catch (e) {
    next(e);
  }
};

/** POST /api/skill-builders/coordinator/clients/:clientId/unassign-event */
export const coordinatorUnassignClientFromEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    const eventId = parsePositiveInt(req.body?.companyEventId);
    if (!agencyId || !clientId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId and companyEventId are required' } });
    }
    if (!(await assertSkillBuildersCoordinationAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }

    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId || !isSkillsClientFlag(cur.skills)) {
      return res.status(400).json({ error: { message: 'Client not found or not a skills client' } });
    }

    const [r] = await pool.execute(
      `DELETE sgc FROM skills_group_clients sgc
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
       WHERE sgc.client_id = ? AND sg.company_event_id = ?`,
      [agencyId, clientId, eventId]
    );

    const affected = Number(r?.affectedRows ?? 0);
    if (!affected) {
      return res.status(404).json({ error: { message: 'Client is not assigned to this event' } });
    }

    res.json({ ok: true, removed: affected });
  } catch (e) {
    next(e);
  }
};

async function loadMeetingsAndProvidersForSkillsGroups(skillsGroupIds) {
  const ids = [...new Set((skillsGroupIds || []).map((x) => Number(x)).filter((n) => n > 0))];
  const meetingsBy = new Map();
  const providersBy = new Map();
  if (!ids.length) return { meetingsBy, providersBy };
  const ph = ids.map(() => '?').join(',');
  const [mrows] = await pool.execute(
    `SELECT skills_group_id, weekday, start_time, end_time
     FROM skills_group_meetings
     WHERE skills_group_id IN (${ph})
     ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time`,
    ids
  );
  for (const m of mrows || []) {
    const id = Number(m.skills_group_id);
    if (!meetingsBy.has(id)) meetingsBy.set(id, []);
    meetingsBy.get(id).push({
      weekday: m.weekday,
      startTime: String(m.start_time || '').slice(0, 8),
      endTime: String(m.end_time || '').slice(0, 8)
    });
  }
  const [prows] = await pool.execute(
    `SELECT sgp.skills_group_id, u.id, u.first_name, u.last_name
     FROM skills_group_providers sgp
     JOIN users u ON u.id = sgp.provider_user_id
     WHERE sgp.skills_group_id IN (${ph})
     ORDER BY u.last_name ASC, u.first_name ASC`,
    ids
  );
  for (const p of prows || []) {
    const id = Number(p.skills_group_id);
    if (!providersBy.has(id)) providersBy.set(id, []);
    providersBy.get(id).push({
      id: Number(p.id),
      firstName: p.first_name,
      lastName: p.last_name
    });
  }
  return { meetingsBy, providersBy };
}

/** GET /api/skill-builders/clients/:clientId/builder-detail?agencyId=&schoolOrganizationId= */
export const getClientSkillBuilderDetail = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    const schoolOrganizationId = parsePositiveInt(req.query.schoolOrganizationId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }
    if (!isSkillsClientFlag(cur.skills)) {
      return res.status(403).json({ error: { message: 'Skill Builders tab only for skills clients' } });
    }

    const staffLike = await isAgencyStaffLikeForSkillBuilders(req, agencyId);
    const coord = await getSkillBuilderCoordinatorAccess(userId);
    const [sgpRows] = await pool.execute(
      `SELECT 1 FROM skills_group_providers sgp
       INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
       INNER JOIN skills_group_clients sgc ON sgc.skills_group_id = sg.id AND sgc.client_id = ?
       WHERE sgp.provider_user_id = ?
       LIMIT 1`,
      [agencyId, clientId, userId]
    );
    const isAssignedProvider = !!sgpRows?.[0];
    if (!staffLike && !coord && !isAssignedProvider) {
      return res.status(403).json({ error: { message: 'Not authorized for this Skill Builders client' } });
    }

    const showAllMemberships = staffLike || coord;
    const activeClause = showAllMemberships ? '' : ' AND sgc.active_for_providers = 1 ';

    const [evRows] = await pool.execute(
      `SELECT sgc.skills_group_id,
              sgc.active_for_providers,
              sg.name AS skills_group_name,
              sg.start_date AS group_start_date,
              sg.end_date AS group_end_date,
              sg.company_event_id,
              ce.title AS event_title,
              ce.starts_at AS event_starts_at,
              ce.ends_at AS event_ends_at,
              ce.description AS event_description,
              sch.name AS school_name,
              sch.slug AS school_slug
       FROM skills_group_clients sgc
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
       LEFT JOIN company_events ce ON ce.id = sg.company_event_id
       LEFT JOIN agencies sch ON sch.id = sg.organization_id
       WHERE sgc.client_id = ?
         ${activeClause}
         ${schoolOrganizationId ? ' AND sg.organization_id = ? ' : ''}
       ORDER BY ce.starts_at ASC
       LIMIT 50`,
      schoolOrganizationId ? [agencyId, clientId, schoolOrganizationId] : [agencyId, clientId]
    );

    const sgIdsForEnrich = (evRows || []).map((r) => r.skills_group_id).filter(Boolean);
    const { meetingsBy, providersBy } = await loadMeetingsAndProvidersForSkillsGroups(sgIdsForEnrich);

    const [pickups] = await pool.execute(
      `SELECT id, display_name, relationship, phone, notes, created_at
       FROM skill_builders_transport_pickups
       WHERE agency_id = ? AND client_id = ?
       ORDER BY id DESC
       LIMIT 50`,
      [agencyId, clientId]
    );

    res.json({
      ok: true,
      clientId,
      agencyId,
      intakeComplete: !!(cur.skill_builders_intake_complete === 1 || cur.skill_builders_intake_complete === true),
      treatmentPlanComplete: !!(
        cur.skill_builders_treatment_plan_complete === 1 || cur.skill_builders_treatment_plan_complete === true
      ),
      clientSummary: {
        initials: cur.initials || null,
        identifierCode: cur.identifier_code || null,
        grade: cur.grade || null,
        dateOfBirth: cur.date_of_birth ? String(cur.date_of_birth).slice(0, 10) : null,
        ageYears: ageFromDateOfBirth(cur.date_of_birth),
        documentStatus: cur.document_status || null,
        paperworkStatusLabel: cur.paperwork_status_label || null,
        paperworkStatusKey: cur.paperwork_status_key || null,
        clientStatusLabel: cur.client_status_label || null
      },
      events: (evRows || []).map((r) => {
        const sgid = Number(r.skills_group_id);
        return {
          skillsGroupId: sgid,
          companyEventId: r.company_event_id ? Number(r.company_event_id) : null,
          skillsGroupName: r.skills_group_name,
          eventTitle: r.event_title,
          eventDescription: r.event_description || '',
          eventStartsAt: r.event_starts_at || null,
          eventEndsAt: r.event_ends_at || null,
          groupStartDate: r.group_start_date || null,
          groupEndDate: r.group_end_date || null,
          schoolName: r.school_name,
          schoolSlug: r.school_slug || null,
          activeForProviders: !!(r.active_for_providers === 1 || r.active_for_providers === true),
          meetings: meetingsBy.get(sgid) || [],
          providers: providersBy.get(sgid) || []
        };
      }),
      transportPickups: pickups || []
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' && String(e?.sqlMessage || '').includes('skill_builders_transport')) {
      return res.json({ ok: true, clientId, events: [], transportPickups: [] });
    }
    next(e);
  }
};

/** GET /api/skill-builders/clients/:clientId/builder-notes?agencyId= */
export const listSkillBuilderClientNotes = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized' } });
    }
    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId || !isSkillsClientFlag(cur.skills)) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    const [rows] = await pool.execute(
      `SELECT n.id, n.message, n.created_at, n.author_id,
              u.first_name, u.last_name
       FROM client_notes n
       JOIN users u ON u.id = n.author_id
       WHERE n.client_id = ?
         AND n.category = 'skill_builders'
         AND n.is_internal_only = FALSE
       ORDER BY n.id ASC
       LIMIT 200`,
      [clientId]
    );
    res.json({
      ok: true,
      notes: (rows || []).map((r) => ({
        id: Number(r.id),
        message: r.message,
        createdAt: r.created_at,
        authorId: Number(r.author_id),
        authorName: `${r.first_name || ''} ${r.last_name || ''}`.trim()
      }))
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/skill-builders/clients/:clientId/builder-notes */
export const createSkillBuilderClientNote = async (req, res, next) => {
  try {
    if (String(req.user?.role || '').toLowerCase() === 'school_staff') {
      return res.status(403).json({
        error: { message: 'Skill Builders notes are available in the Event portal for program staff.' }
      });
    }
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    const userId = parsePositiveInt(req.user?.id);
    const message = String(req.body?.message || '').trim();
    if (!agencyId || !clientId || !message) {
      return res.status(400).json({ error: { message: 'agencyId and message are required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized' } });
    }

    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId || !isSkillsClientFlag(cur.skills)) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    const [ins] = await pool.execute(
      `INSERT INTO client_notes (client_id, author_id, category, urgency, message, is_internal_only)
       VALUES (?, ?, 'skill_builders', 'low', ?, FALSE)`,
      [clientId, userId, message.slice(0, 8000)]
    );
    res.status(201).json({ ok: true, id: ins.insertId });
  } catch (e) {
    next(e);
  }
};

/** POST /api/skill-builders/clients/:clientId/transport-pickups */
export const addSkillBuilderTransportPickup = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientId = parsePositiveInt(req.params.clientId);
    const userId = parsePositiveInt(req.user?.id);
    const displayName = String(req.body?.displayName || '').trim();
    if (!agencyId || !clientId || !displayName) {
      return res.status(400).json({ error: { message: 'agencyId and displayName are required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized' } });
    }
    const cur = await Client.findById(clientId);
    if (!cur || Number(cur.agency_id) !== agencyId || !isSkillsClientFlag(cur.skills)) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    await pool.execute(
      `INSERT INTO skill_builders_transport_pickups
        (agency_id, client_id, display_name, relationship, phone, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        displayName.slice(0, 255),
        String(req.body?.relationship || '').trim().slice(0, 128) || null,
        String(req.body?.phone || '').trim().slice(0, 64) || null,
        String(req.body?.notes || '').trim().slice(0, 500) || null,
        userId
      ]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Transport table not migrated' } });
    }
    next(e);
  }
};

/** POST /api/skill-builders/events/:eventId/clients/:clientId/confirm-active */
export const confirmClientActiveForSkillBuilderEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const clientId = parsePositiveInt(req.params.clientId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !eventId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, event id, and client id required' } });
    }
    const access = await assertEventAccessForUser({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });
    if (!(await assertSkillBuildersCoordinationAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Coordinator or agency staff access required' } });
    }

    const [r] = await pool.execute(
      `UPDATE skills_group_clients sgc
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
       SET sgc.active_for_providers = 1,
           sgc.ready_confirmed_by_user_id = ?,
           sgc.ready_confirmed_at = NOW()
       WHERE sgc.client_id = ? AND sg.company_event_id = ?`,
      [agencyId, userId, clientId, eventId]
    );
    const affected = Number(r?.affectedRows ?? r?.changedRows ?? 0);
    if (!affected) {
      return res.status(404).json({ error: { message: 'Client is not enrolled in this event skills group' } });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/** GET /api/skill-builders/events/:eventId/chat-thread?agencyId= */
export const ensureSkillBuilderEventChatThread = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const eventId = parsePositiveInt(req.params.eventId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !eventId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const access = await assertEventAccessForUser({ req, agencyId, eventId });
    if (access.error) return res.status(access.error.status).json({ error: { message: access.error.message } });

    const [existing] = await pool.execute(
      `SELECT id FROM chat_threads WHERE company_event_id = ? LIMIT 1`,
      [eventId]
    );
    let threadId = existing?.[0]?.id ? Number(existing[0].id) : null;
    if (!threadId) {
      const [ins] = await pool.execute(
        `INSERT INTO chat_threads (agency_id, organization_id, thread_type, company_event_id)
         VALUES (?, NULL, 'skill_builders_event', ?)`,
        [agencyId, eventId]
      );
      threadId = ins.insertId;
    }

    await pool.execute(
      `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?)`,
      [threadId, userId]
    );
    try {
      await pool.execute('DELETE FROM chat_thread_deletes WHERE thread_id = ? AND user_id = ?', [threadId, userId]);
    } catch {
      // ignore
    }

    res.json({ ok: true, threadId });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('company_event_id') || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Chat thread migration not applied (581)' } });
    }
    next(e);
  }
};
