import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import { fetchRegistrationCatalogItems } from '../services/registrationCatalog.service.js';
import {
  enrollClientsInCompanyEvent,
  validatePayerForEligibility
} from '../services/skillBuildersIntakeEnrollment.service.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function normOrgType(t) {
  const k = String(t || '').trim().toLowerCase();
  return k || null;
}

function isPortalOrgType(t) {
  const k = normOrgType(t);
  return k === 'school' || k === 'program' || k === 'learning' || k === 'clinical';
}

function getOrgSlug(org) {
  return String(org?.portal_url || org?.slug || '').trim() || null;
}

/**
 * GET /api/guardian-portal/overview
 *
 * Guardian dashboard bootstrap payload.
 * - children: linked client rows (guardian-safe)
 * - programs: union of explicit org memberships + derived orgs from children
 */
export const getGuardianPortalOverview = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const [linkedClients, explicitOrgsRaw] = await Promise.all([
      ClientGuardian.listClientsForGuardian({ guardianUserId: uid }),
      User.getAgencies(uid)
    ]);
    const me = (linkedClients || []).find((c) => String(c?.relationship_type || '').toLowerCase() === 'self') || null;
    const dependents = (linkedClients || []).filter((c) => String(c?.relationship_type || '').toLowerCase() !== 'self');

    // Explicit org memberships (via user_agencies). Keep only portal org types.
    const explicitOrgs = (explicitOrgsRaw || []).filter((o) => isPortalOrgType(o?.organization_type));

    // Union programs across explicit orgs + child orgs.
    const byOrgId = new Map();

    for (const o of explicitOrgs) {
      const id = Number(o?.id);
      if (!id) continue;
      byOrgId.set(id, {
        id,
        name: o?.name || null,
        slug: getOrgSlug(o),
        organization_type: normOrgType(o?.organization_type),
        children: []
      });
    }

    for (const c of linkedClients || []) {
      const orgId = Number(c?.organization_id);
      if (!orgId) continue;

      if (!byOrgId.has(orgId)) {
        byOrgId.set(orgId, {
          id: orgId,
          name: c?.organization_name || null,
          slug: String(c?.organization_slug || '').trim() || null,
          organization_type: normOrgType(c?.organization_type),
          children: []
        });
      }

      const target = byOrgId.get(orgId);
      target.children.push({
        client_id: Number(c?.client_id) || null,
        initials: c?.initials || null,
        full_name: c?.full_name ? String(c.full_name).trim() || null : null
      });
    }

    const programs = Array.from(byOrgId.values()).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

    res.json({
      refreshedAt: new Date().toISOString(),
      me,
      dependents,
      // Backward-compatible alias consumed by existing UI.
      children: dependents,
      programs
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Guardian is linked (client_guardians) to a client who is in skills_group_clients for this company_event.
 */
async function assertGuardianSkillBuilderEventAccess(guardianUserId, eventId) {
  const gid = Number(guardianUserId);
  const eid = Number(eventId);
  if (!gid || !eid) return { ok: false };
  const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: gid });
  const allowedClientIds = new Set((linked || []).map((c) => Number(c.client_id)).filter((n) => n > 0));
  if (!allowedClientIds.size) return { ok: false };

  const [rows] = await pool.execute(
    `SELECT ce.id AS company_event_id,
            ce.agency_id,
            ce.title,
            ce.description,
            ce.starts_at,
            ce.ends_at,
            sg.id AS skills_group_id,
            sg.name AS skills_group_name,
            sg.start_date AS group_start_date,
            sg.end_date AS group_end_date,
            sch.id AS school_organization_id,
            sch.name AS school_name,
            sch.slug AS school_slug
     FROM company_events ce
     INNER JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     INNER JOIN skills_group_clients sgc ON sgc.skills_group_id = sg.id
     INNER JOIN clients c ON c.id = sgc.client_id AND c.agency_id = ce.agency_id AND c.skills = TRUE
     LEFT JOIN agencies sch ON sch.id = sg.organization_id
     WHERE ce.id = ?
     LIMIT 1`,
    [eid]
  );
  const base = rows?.[0];
  if (!base) return { ok: false };

  const [kidRows] = await pool.execute(
    `SELECT DISTINCT c.id AS client_id, c.initials
     FROM skills_group_clients sgc
     JOIN clients c ON c.id = sgc.client_id AND c.skills = TRUE
     WHERE sgc.skills_group_id = ?
       AND c.id IN (${[...allowedClientIds].map(() => '?').join(',')})`,
    [base.skills_group_id, ...allowedClientIds]
  );
  const myChildren = (kidRows || []).map((r) => ({
    clientId: Number(r.client_id),
    initials: r.initials
  }));
  if (!myChildren.length) return { ok: false };

  return { ok: true, base, myChildren };
}

async function loadMeetingsAndProviders(skillsGroupId) {
  const sgid = Number(skillsGroupId);
  const [mrows] = await pool.execute(
    `SELECT weekday, start_time, end_time
     FROM skills_group_meetings
     WHERE skills_group_id = ?
     ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time`,
    [sgid]
  );
  const [prows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name
     FROM skills_group_providers sgp
     JOIN users u ON u.id = sgp.provider_user_id
     WHERE sgp.skills_group_id = ?
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [sgid]
  );
  return {
    meetings: (mrows || []).map((m) => ({
      weekday: m.weekday,
      startTime: String(m.start_time || '').slice(0, 8),
      endTime: String(m.end_time || '').slice(0, 8)
    })),
    providers: (prows || []).map((p) => ({
      id: Number(p.id),
      firstName: p.first_name,
      lastName: p.last_name
    }))
  };
}

/** GET /api/guardian-portal/skill-builders/events?agencyId= optional */
export const listGuardianSkillBuilderEvents = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const agencyId = parsePositiveInt(req.query.agencyId);

    const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: uid });
    const ids = (linked || []).map((c) => Number(c.client_id)).filter((n) => n > 0);
    if (!ids.length) return res.json({ ok: true, events: [] });

    const ph = ids.map(() => '?').join(',');
    const params = [...ids];
    let agencyClause = '';
    if (agencyId) {
      agencyClause = ' AND ce.agency_id = ? ';
      params.push(agencyId);
    }

    const [rows] = await pool.execute(
      `SELECT ce.id AS company_event_id,
              ce.agency_id,
              ce.title,
              ce.starts_at,
              ce.ends_at,
              sg.id AS skills_group_id,
              c.id AS client_id,
              c.initials AS client_initials,
              sch.name AS school_name,
              sch.slug AS school_slug
       FROM clients c
       INNER JOIN skills_group_clients sgc ON sgc.client_id = c.id
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = c.agency_id
       INNER JOIN company_events ce ON ce.id = sg.company_event_id AND ce.agency_id = c.agency_id
       LEFT JOIN agencies sch ON sch.id = sg.organization_id
       WHERE c.id IN (${ph})
         AND c.skills = TRUE
         ${agencyClause}
       ORDER BY ce.ends_at DESC, ce.starts_at DESC`,
      params
    );

    const events = (rows || []).map((r) => ({
      companyEventId: Number(r.company_event_id),
      agencyId: Number(r.agency_id),
      title: r.title,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      skillsGroupId: Number(r.skills_group_id),
      clientId: Number(r.client_id),
      clientInitials: r.client_initials,
      schoolName: r.school_name,
      schoolSlug: r.school_slug
    }));

    res.json({ ok: true, events });
  } catch (e) {
    next(e);
  }
};

/** GET /api/guardian-portal/skill-builders/events/:eventId/detail */
export const getGuardianSkillBuilderEventDetail = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const eventId = parsePositiveInt(req.params.eventId);
    if (!uid || !eventId) return res.status(400).json({ error: { message: 'Invalid event' } });

    const access = await assertGuardianSkillBuilderEventAccess(uid, eventId);
    if (!access.ok) return res.status(403).json({ error: { message: 'Event not available for this account' } });

    const { base, myChildren } = access;
    const { meetings, providers } = await loadMeetingsAndProviders(base.skills_group_id);

    const childDetails = [];
    for (const ch of myChildren) {
      try {
        const [crow] = await pool.execute(
          `SELECT id, initials, full_name, grade, document_status, paperwork_status_id
           FROM clients WHERE id = ? LIMIT 1`,
          [ch.clientId]
        );
        const c = crow?.[0];
        let paperworkLabel = null;
        if (c?.paperwork_status_id) {
          const [pw] = await pool.execute(
            `SELECT label, status_key FROM paperwork_statuses WHERE id = ? LIMIT 1`,
            [c.paperwork_status_id]
          );
          paperworkLabel = pw?.[0]?.label || null;
        }
        childDetails.push({
          clientId: ch.clientId,
          initials: c?.initials || ch.initials,
          fullName: c?.full_name ? String(c.full_name).trim() || null : null,
          grade: c?.grade || null,
          documentStatus: c?.document_status || null,
          paperworkStatusLabel: paperworkLabel
        });
      } catch {
        childDetails.push(ch);
      }
    }

    res.json({
      ok: true,
      event: {
        id: Number(base.company_event_id),
        agencyId: Number(base.agency_id),
        title: base.title,
        description: base.description || '',
        startsAt: base.starts_at,
        endsAt: base.ends_at
      },
      skillsGroup: {
        id: Number(base.skills_group_id),
        name: base.skills_group_name,
        startDate: base.group_start_date,
        endDate: base.group_end_date,
        schoolName: base.school_name,
        schoolSlug: base.school_slug,
        schoolOrganizationId: base.school_organization_id ? Number(base.school_organization_id) : null
      },
      myChildren: childDetails,
      meetings,
      providers
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/guardian-portal/skill-builders/events/:eventId/posts */
export const listGuardianSkillBuilderEventPosts = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const eventId = parsePositiveInt(req.params.eventId);
    if (!uid || !eventId) return res.status(400).json({ error: { message: 'Invalid event' } });

    const access = await assertGuardianSkillBuilderEventAccess(uid, eventId);
    if (!access.ok) return res.status(403).json({ error: { message: 'Not available' } });

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

/** GET /api/guardian-portal/skill-builders/events/:eventId/chat-thread */
export const ensureGuardianSkillBuilderEventChatThread = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const eventId = parsePositiveInt(req.params.eventId);
    if (!uid || !eventId) return res.status(400).json({ error: { message: 'Invalid event' } });

    const access = await assertGuardianSkillBuilderEventAccess(uid, eventId);
    if (!access.ok) return res.status(403).json({ error: { message: 'Not available' } });

    const agencyId = Number(access.base.agency_id);

    const [existing] = await pool.execute(`SELECT id FROM chat_threads WHERE company_event_id = ? LIMIT 1`, [eventId]);
    let threadId = existing?.[0]?.id ? Number(existing[0].id) : null;
    if (!threadId) {
      const [ins] = await pool.execute(
        `INSERT INTO chat_threads (agency_id, organization_id, thread_type, company_event_id)
         VALUES (?, NULL, 'skill_builders_event', ?)`,
        [agencyId, eventId]
      );
      threadId = ins.insertId;
    }

    await pool.execute(`INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?)`, [
      threadId,
      uid
    ]);
    try {
      await pool.execute('DELETE FROM chat_thread_deletes WHERE thread_id = ? AND user_id = ?', [threadId, uid]);
    } catch {
      // ignore
    }

    res.json({ ok: true, threadId, agencyId });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('company_event_id') || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({ error: { message: 'Chat migration not applied' } });
    }
    next(e);
  }
};

async function assertGuardianHasAgencyAccess(guardianUserId, agencyId) {
  const gid = Number(guardianUserId);
  const aid = Number(agencyId);
  if (!gid || !aid) return false;
  const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: gid });
  return (linked || []).some((c) => Number(c.agency_id) === aid);
}

/** GET /api/guardian-portal/dependents?agencyId= */
export const listGuardianDependentsForAgency = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const agencyId = parsePositiveInt(req.query.agencyId);
    if (!uid || !agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertGuardianHasAgencyAccess(uid, agencyId))) {
      return res.status(403).json({ error: { message: 'No linked dependents for this agency' } });
    }
    const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: uid });
    const dependents = (linked || [])
      .filter((c) => Number(c.agency_id) === agencyId)
      .filter((c) => String(c?.relationship_type || '').toLowerCase() !== 'self')
      .map((c) => ({
        clientId: Number(c.client_id),
        initials: c.initials || null,
        fullName: c.full_name ? String(c.full_name).trim() || null : null,
        grade: c.grade ?? null,
        organizationId: Number(c.organization_id) || null,
        organizationName: c.organization_name || null,
        relationshipTitle: c.relationship_title || null
      }));
    res.json({ ok: true, dependents });
  } catch (e) {
    next(e);
  }
};

/** GET /api/guardian-portal/registration/catalog?agencyId= */
export const listGuardianRegistrationCatalog = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const agencyId = parsePositiveInt(req.query.agencyId);
    if (!uid || !agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertGuardianHasAgencyAccess(uid, agencyId))) {
      return res.status(403).json({ error: { message: 'No linked dependents for this agency' } });
    }

    const items = await fetchRegistrationCatalogItems(agencyId);

    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
};

async function assertGuardianLinkedToClients(guardianUserId, clientIds) {
  const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId });
  const allowed = new Set((linked || []).map((c) => Number(c.client_id)));
  for (const id of clientIds) {
    if (!allowed.has(Number(id))) return false;
  }
  return true;
}

/** POST /api/guardian-portal/registration/company-events/:eventId/enroll */
export const guardianEnrollCompanyEvent = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds.map((x) => Number(x)).filter((n) => n > 0) : [];
    const payerType = req.body?.payerType ?? req.body?.payer_type;
    if (!uid || !eventId || !agencyId || !clientIds.length) {
      return res.status(400).json({ error: { message: 'agencyId and clientIds are required' } });
    }
    if (!(await assertGuardianHasAgencyAccess(uid, agencyId))) {
      return res.status(403).json({ error: { message: 'Not allowed for this agency' } });
    }
    if (!(await assertGuardianLinkedToClients(uid, clientIds))) {
      return res.status(403).json({ error: { message: 'One or more clients are not linked to your account' } });
    }

    const enrollment = await enrollClientsInCompanyEvent({
      agencyId,
      eventId,
      clientIds,
      payerType
    });
    if (!enrollment.ok && enrollment.error) {
      const msg = enrollment.error;
      if (msg === 'Event not found') return res.status(404).json({ error: { message: msg } });
      return res.status(400).json({ error: { message: msg } });
    }

    res.json({ ok: true, results: enrollment.results });
  } catch (e) {
    next(e);
  }
};

/** POST /api/guardian-portal/registration/learning-classes/:classId/enroll */
export const guardianEnrollLearningClass = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const classId = parsePositiveInt(req.params.classId);
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds.map((x) => Number(x)).filter((n) => n > 0) : [];
    const payerType = req.body?.payerType ?? req.body?.payer_type;
    if (!uid || !classId || !agencyId || !clientIds.length) {
      return res.status(400).json({ error: { message: 'agencyId and clientIds are required' } });
    }
    if (!(await assertGuardianHasAgencyAccess(uid, agencyId))) {
      return res.status(403).json({ error: { message: 'Not allowed for this agency' } });
    }
    if (!(await assertGuardianLinkedToClients(uid, clientIds))) {
      return res.status(403).json({ error: { message: 'One or more clients are not linked to your account' } });
    }

    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });

    const allowedOrgIds = new Set(await learningClassOrgIdsForAgency(agencyId));
    if (!allowedOrgIds.has(Number(klass.organization_id))) {
      return res.status(403).json({ error: { message: 'Class is not available under this agency' } });
    }
    if (!(klass.registration_eligible === 1 || klass.registration_eligible === true)) {
      return res.status(400).json({ error: { message: 'This class is not open for registration' } });
    }
    const payerCheck = validatePayerForEligibility(payerType, klass);
    if (!payerCheck.ok) return res.status(400).json({ error: { message: payerCheck.message } });

    const now = Date.now();
    const opens = klass.enrollment_opens_at ? new Date(klass.enrollment_opens_at).getTime() : null;
    const closes = klass.enrollment_closes_at ? new Date(klass.enrollment_closes_at).getTime() : null;
    if (opens && Number.isFinite(opens) && now < opens) {
      return res.status(400).json({ error: { message: 'Enrollment is not open yet' } });
    }
    if (closes && Number.isFinite(closes) && now > closes) {
      return res.status(400).json({ error: { message: 'Enrollment is closed' } });
    }

    const results = [];
    for (const clientId of clientIds) {
      const [cur] = await pool.execute(`SELECT id, agency_id FROM clients WHERE id = ? LIMIT 1`, [clientId]);
      const cl = cur?.[0];
      if (!cl || Number(cl.agency_id) !== agencyId) {
        results.push({ clientId, ok: false, error: 'Client not in this agency' });
        continue;
      }
      try {
        await LearningProgramClass.addClientMember({
          classId,
          clientId,
          membershipStatus: 'active',
          actorUserId: uid
        });
        results.push({ clientId, ok: true });
      } catch (err) {
        results.push({ clientId, ok: false, error: err?.message || 'Enroll failed' });
      }
    }

    res.json({ ok: true, results });
  } catch (e) {
    next(e);
  }
};

