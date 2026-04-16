import pool from '../config/database.js';
import { fetchSkillBuildersGroupProvidersForPortal } from '../services/skillBuildersEventProviders.service.js';
import Agency from '../models/Agency.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import { fetchRegistrationCatalogItems } from '../services/registrationCatalog.service.js';
import {
  enrollClientsInCompanyEvent,
  validatePayerForEligibility
} from '../services/skillBuildersIntakeEnrollment.service.js';
import StorageService from '../services/storage.service.js';
import { loadSessionCurriculumRow } from '../services/skillBuildersSessionClinical.service.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import { isDobAdultLocked } from '../utils/guardianWaivers.utils.js';
import { isClientAdultLockedForGuardian } from '../services/guardianWaivers.service.js';

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

function enrichGuardianClientRow(c) {
  if (!c || typeof c !== 'object') return c;
  return {
    ...c,
    guardian_portal_locked: isDobAdultLocked(c.date_of_birth)
  };
}

function isSuperadminGuardianPreview(req) {
  return req.guardianPreviewMode === true && String(req.user?.role || '').trim().toLowerCase() === 'super_admin';
}

function resolvePreviewAgencyId(req) {
  return parsePositiveInt(req.query?.previewAgencyId || req.headers['x-agency-id']);
}

async function buildGuardianPreviewPrograms(agencyId) {
  const parsedAgencyId = Number(agencyId || 0);
  if (!parsedAgencyId) return [];
  const agency = await Agency.findById(parsedAgencyId);
  if (!agency) return [];
  const logoUrl = agency.logo_url || agency.logoUrl || null;
  return [{
    id: parsedAgencyId,
    name: agency.name || null,
    slug: getOrgSlug(agency),
    organization_type: normOrgType(agency.organization_type),
    logo_url: logoUrl,
    billing_agency_id: parsedAgencyId,
    billing_agency_name: agency.name || null,
    billing_agency_logo_url: logoUrl,
    children: []
  }];
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
    if (isSuperadminGuardianPreview(req)) {
      const previewAgencyId = resolvePreviewAgencyId(req);
      const programs = await buildGuardianPreviewPrograms(previewAgencyId);
      return res.json({
        refreshedAt: new Date().toISOString(),
        previewMode: 'superadmin',
        me: null,
        dependents: [],
        children: [],
        programs,
        enrollments: {
          skillBuilderEvents: [],
          programEvents: []
        }
      });
    }

    const [linkedClients, explicitOrgsRaw] = await Promise.all([
      ClientGuardian.listClientsForGuardian({ guardianUserId: uid }),
      User.getAgencies(uid)
    ]);
    const meRaw = (linkedClients || []).find((c) => String(c?.relationship_type || '').toLowerCase() === 'self') || null;
    const me = meRaw ? enrichGuardianClientRow(meRaw) : null;
    const dependents = (linkedClients || [])
      .filter((c) => String(c?.relationship_type || '').toLowerCase() !== 'self')
      .map(enrichGuardianClientRow);
    const linkedClientIds = (linkedClients || [])
      .map((c) => Number(c?.client_id))
      .filter((n) => n > 0);

    const clientMetaById = new Map(
      (linkedClients || []).map((row) => [Number(row?.client_id), row])
    );

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
        logo_url: o?.logo_url || o?.logoUrl || null,
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
          logo_url: c?.organization_logo_url || null,
          billing_agency_id: null,
          billing_agency_name: null,
          billing_agency_logo_url: null,
          children: []
        });
      }

      const target = byOrgId.get(orgId);
      const orgLogo = c?.organization_logo_url || null;
      if (orgLogo && !target.logo_url) target.logo_url = orgLogo;
      const bid = Number(c?.agency_id);
      if (bid && !target.billing_agency_id) {
        target.billing_agency_id = bid;
        target.billing_agency_name = c?.agency_name || null;
        target.billing_agency_logo_url = c?.agency_logo_url || null;
      }
      const meta = clientMetaById.get(Number(c?.client_id));
      target.children.push({
        client_id: Number(c?.client_id) || null,
        initials: c?.initials || null,
        full_name: c?.full_name ? String(c.full_name).trim() || null : null,
        guardian_portal_locked: isDobAdultLocked(meta?.date_of_birth)
      });
    }

    const programs = Array.from(byOrgId.values()).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    let skillBuilderEvents = [];
    let programEvents = [];
    if (linkedClientIds.length) {
      const ph = linkedClientIds.map(() => '?').join(',');

      const [sbRows] = await pool.execute(
        `SELECT ce.id AS company_event_id,
                ce.agency_id,
                ce.title,
                ce.starts_at,
                ce.ends_at,
                sg.id AS skills_group_id,
                c.id AS client_id,
                c.initials AS client_initials,
                sch.name AS school_name,
                sch.slug AS school_slug,
                sgc.created_at AS enrolled_at
         FROM clients c
         INNER JOIN skills_group_clients sgc ON sgc.client_id = c.id
         INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = c.agency_id
         INNER JOIN company_events ce ON ce.id = sg.company_event_id AND ce.agency_id = c.agency_id
         LEFT JOIN agencies sch ON sch.id = sg.organization_id
         WHERE c.id IN (${ph})
           AND c.skills = TRUE
         ORDER BY ce.ends_at DESC, ce.starts_at DESC`,
        linkedClientIds
      );

      const bySkillBuilderEvent = new Map();
      for (const row of sbRows || []) {
        const eventId = Number(row.company_event_id);
        if (!bySkillBuilderEvent.has(eventId)) {
          bySkillBuilderEvent.set(eventId, {
            companyEventId: eventId,
            agencyId: Number(row.agency_id),
            title: row.title || `Event ${eventId}`,
            startsAt: row.starts_at || null,
            endsAt: row.ends_at || null,
            skillsGroupId: Number(row.skills_group_id) || null,
            schoolName: row.school_name || null,
            schoolSlug: row.school_slug || null,
            enrolledAt: row.enrolled_at || null,
            myChildren: []
          });
        }
        bySkillBuilderEvent.get(eventId).myChildren.push({
          clientId: Number(row.client_id),
          initials: row.client_initials || null,
          enrolledAt: row.enrolled_at || null
        });
      }
      skillBuilderEvents = [...bySkillBuilderEvent.values()];

      const [programRows] = await pool.execute(
        `SELECT ce.id AS company_event_id,
                ce.agency_id,
                ce.title,
                ce.description,
                ce.starts_at,
                ce.ends_at,
                ce.event_type,
                ce.virtual_sessions_enabled,
                ag.name AS agency_name,
                ag.slug AS agency_slug,
                prog.name AS program_name,
                prog.slug AS program_slug,
                c.id AS client_id,
                c.initials,
                c.full_name,
                cec.enrolled_at
         FROM company_event_clients cec
         INNER JOIN company_events ce ON ce.id = cec.company_event_id
         LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
         INNER JOIN agencies ag ON ag.id = ce.agency_id
         LEFT JOIN agencies prog ON prog.id = ce.organization_id
         INNER JOIN clients c ON c.id = cec.client_id
         WHERE cec.client_id IN (${ph})
           AND cec.is_active = 1
           AND sg.id IS NULL
         ORDER BY ce.starts_at ASC`,
        linkedClientIds
      );

      const byProgramEvent = new Map();
      for (const row of programRows || []) {
        const eventId = Number(row.company_event_id);
        if (!byProgramEvent.has(eventId)) {
          byProgramEvent.set(eventId, {
            companyEventId: eventId,
            agencyId: Number(row.agency_id),
            agencyName: row.agency_name || null,
            agencySlug: row.agency_slug || null,
            programName: row.program_name || null,
            programSlug: row.program_slug || null,
            title: row.title || `Event ${eventId}`,
            description: row.description || null,
            startsAt: row.starts_at || null,
            endsAt: row.ends_at || null,
            eventType: row.event_type || null,
            virtualSessionsEnabled: !!(row.virtual_sessions_enabled === 1 || row.virtual_sessions_enabled === true),
            enrolledAt: row.enrolled_at || null,
            myChildren: []
          });
        }
        byProgramEvent.get(eventId).myChildren.push({
          clientId: Number(row.client_id),
          initials: row.initials || null,
          fullName: row.full_name ? String(row.full_name).trim() || null : null,
          enrolledAt: row.enrolled_at || null
        });
      }
      programEvents = [...byProgramEvent.values()];
    }

    res.json({
      refreshedAt: new Date().toISOString(),
      me,
      dependents,
      // Backward-compatible alias consumed by existing UI.
      children: dependents,
      programs,
      enrollments: {
        skillBuilderEvents,
        programEvents
      }
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
            ce.registration_eligible,
            ce.medicaid_eligible,
            ce.cash_eligible,
            ce.client_check_in_display_time,
            ce.client_check_out_display_time,
            ce.virtual_sessions_enabled,
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
  const providers = await fetchSkillBuildersGroupProvidersForPortal(sgid);
  return {
    meetings: (mrows || []).map((m) => ({
      weekday: m.weekday,
      startTime: String(m.start_time || '').slice(0, 8),
      endTime: String(m.end_time || '').slice(0, 8)
    })),
    providers
  };
}

/** GET /api/guardian-portal/skill-builders/events?agencyId= optional */
export const listGuardianSkillBuilderEvents = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (isSuperadminGuardianPreview(req)) {
      return res.json({ ok: true, previewMode: 'superadmin', events: [] });
    }
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
              sch.slug AS school_slug,
              sgc.created_at AS enrolled_at
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
      schoolSlug: r.school_slug,
      enrolledAt: r.enrolled_at || null
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

    const ymdTodayG = () => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const ymdAddDaysG = (ymd, delta) => {
      const [y, mo, da] = String(ymd || '').split('-').map(Number);
      const dt = new Date(Date.UTC(y, mo - 1, da));
      if (!Number.isFinite(dt.getTime())) return ymdTodayG();
      dt.setUTCDate(dt.getUTCDate() + delta);
      return dt.toISOString().slice(0, 10);
    };

    let sessions = [];
    let clientAttendance = [];
    try {
      const eidNum = Number(base.company_event_id);
      let from = ymdAddDaysG(ymdTodayG(), -7);
      let to = ymdAddDaysG(ymdTodayG(), 365);
      const sd = base.group_start_date != null ? String(base.group_start_date).slice(0, 10) : '';
      const ed = base.group_end_date != null ? String(base.group_end_date).slice(0, 10) : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < from) from = sd;
      if (/^\d{4}-\d{2}-\d{2}$/.test(ed) && ed > to) to = ed;
      const [sessRows] = await pool.execute(
        `SELECT s.id, s.session_date, s.starts_at, s.ends_at, s.timezone,
                s.location_label, s.location_address, s.modality, s.join_url,
                m.weekday, m.start_time, m.end_time
         FROM skill_builders_event_sessions s
         INNER JOIN skills_group_meetings m ON m.id = s.skills_group_meeting_id
         WHERE s.company_event_id = ? AND s.session_date >= ? AND s.session_date <= ?
         ORDER BY s.session_date ASC, m.start_time ASC, s.id ASC
         LIMIT 500`,
        [eidNum, from, to]
      );
      const sessList = (sessRows || []).map((r) => ({
        id: Number(r.id),
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
        joinUrl: r.join_url != null ? String(r.join_url).trim().slice(0, 1024) || null : null
      }));
      const sids = sessList.map((s) => s.id).filter((n) => n > 0);
      const hasCurr = new Set();
      if (sids.length) {
        try {
          const ph = sids.map(() => '?').join(',');
          const [cuRows] = await pool.execute(
            `SELECT session_id FROM skill_builders_event_session_curriculum WHERE session_id IN (${ph})`,
            sids
          );
          for (const c of cuRows || []) hasCurr.add(Number(c.session_id));
        } catch (e) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }
      sessions = sessList.map((s) => ({ ...s, hasCurriculum: hasCurr.has(s.id) }));

      const childIds = myChildren.map((x) => Number(x.clientId)).filter((n) => n > 0);
      if (childIds.length) {
        const ph = childIds.map(() => '?').join(',');
        let attRows = [];
        try {
          const [ar] = await pool.execute(
            `SELECT a.client_id, a.session_id, a.check_in_at, a.check_out_at, a.signature_text,
                    a.missed_at, a.check_out_auto, a.auto_checkout_at, s.session_date
             FROM skill_builders_client_session_attendance a
             INNER JOIN skill_builders_event_sessions s ON s.id = a.session_id
             WHERE s.company_event_id = ? AND a.client_id IN (${ph})
             ORDER BY s.session_date DESC, a.client_id ASC`,
            [eidNum, ...childIds]
          );
          attRows = ar || [];
        } catch (ae) {
          if (ae?.code !== 'ER_BAD_FIELD_ERROR') throw ae;
          const [ar] = await pool.execute(
            `SELECT a.client_id, a.session_id, a.check_in_at, a.check_out_at, a.signature_text, s.session_date
             FROM skill_builders_client_session_attendance a
             INNER JOIN skill_builders_event_sessions s ON s.id = a.session_id
             WHERE s.company_event_id = ? AND a.client_id IN (${ph})
             ORDER BY s.session_date DESC, a.client_id ASC`,
            [eidNum, ...childIds]
          );
          attRows = ar || [];
        }
        clientAttendance = (attRows || []).map((r) => ({
          clientId: Number(r.client_id),
          sessionId: Number(r.session_id),
          sessionDate: r.session_date,
          checkInAt: r.check_in_at,
          checkOutAt: r.check_out_at,
          signatureText: r.signature_text || null,
          missedAt: r.missed_at ?? null,
          checkOutAuto: !!(r.check_out_auto === 1 || r.check_out_auto === true),
          autoCheckoutAt: r.auto_checkout_at ?? null
        }));
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    res.json({
      ok: true,
      event: {
        id: Number(base.company_event_id),
        agencyId: Number(base.agency_id),
        title: base.title,
        description: base.description || '',
        startsAt: base.starts_at,
        endsAt: base.ends_at,
        clientCheckInDisplayTime:
          base.client_check_in_display_time != null ? String(base.client_check_in_display_time).slice(0, 8) : null,
        clientCheckOutDisplayTime:
          base.client_check_out_display_time != null ? String(base.client_check_out_display_time).slice(0, 8) : null,
        registrationEligible: !!(base.registration_eligible === 1 || base.registration_eligible === true),
        medicaidEligible: !!(base.medicaid_eligible === 1 || base.medicaid_eligible === true),
        cashEligible: !!(base.cash_eligible === 1 || base.cash_eligible === true),
        virtualSessionsEnabled:
          base.virtual_sessions_enabled === undefined || base.virtual_sessions_enabled === null
            ? true
            : !!(base.virtual_sessions_enabled === 1 || base.virtual_sessions_enabled === true)
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
      providers,
      sessions,
      clientAttendance
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/guardian-portal/skill-builders/events/:eventId/sessions/:sessionId/curriculum — PDF for families */
export const getGuardianSkillBuilderSessionCurriculum = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const eventId = parsePositiveInt(req.params.eventId);
    const sessionId = parsePositiveInt(req.params.sessionId);
    if (!uid || !eventId || !sessionId) return res.status(400).json({ error: { message: 'Invalid request' } });
    const access = await assertGuardianSkillBuilderEventAccess(uid, eventId);
    if (!access.ok) return res.status(403).json({ error: { message: 'Not available' } });
    const [sRows] = await pool.execute(
      `SELECT id FROM skill_builders_event_sessions WHERE id = ? AND company_event_id = ? LIMIT 1`,
      [sessionId, eventId]
    );
    if (!sRows?.[0]) return res.status(404).json({ error: { message: 'Session not found' } });
    const row = await loadSessionCurriculumRow(sessionId);
    if (!row) return res.status(404).json({ error: { message: 'Curriculum not available' } });
    const buf = await StorageService.readObject(row.storage_path);
    res.setHeader('Content-Type', row.mime_type || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(row.original_filename || 'curriculum.pdf')}"`
    );
    res.send(buf);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Curriculum feature not migrated' } });
    }
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
    if (isSuperadminGuardianPreview(req)) {
      return res.json({ ok: true, previewMode: 'superadmin', dependents: [] });
    }
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
    if (!uid) return res.status(400).json({ error: { message: 'Unauthorized' } });
    if (isSuperadminGuardianPreview(req)) {
      const previewAgencyId = agencyId || resolvePreviewAgencyId(req);
      if (!previewAgencyId) return res.json({ ok: true, previewMode: 'superadmin', items: [] });
      const rows = await fetchRegistrationCatalogItems(previewAgencyId);
      const items = (rows || []).map((row) => ({ ...row, agencyId: previewAgencyId }));
      return res.json({ ok: true, previewMode: 'superadmin', items });
    }

    let agencyIds = [];
    if (agencyId) {
      if (!(await assertGuardianHasAgencyAccess(uid, agencyId))) {
        return res.status(403).json({ error: { message: 'No linked dependents for this agency' } });
      }
      agencyIds = [agencyId];
    } else {
      const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: uid });
      agencyIds = [...new Set((linked || []).map((c) => Number(c?.agency_id)).filter((n) => n > 0))];
      if (!agencyIds.length) return res.json({ ok: true, items: [] });
    }

    const combined = [];
    for (const aid of agencyIds) {
      const rows = await fetchRegistrationCatalogItems(aid);
      for (const row of rows || []) {
        combined.push({
          ...row,
          agencyId: aid
        });
      }
    }

    const deduped = [];
    const seen = new Set();
    for (const item of combined) {
      const key = `${String(item?.kind || '')}:${Number(item?.id || 0)}:${Number(item?.agencyId || 0)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    res.json({ ok: true, items: deduped });
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

/**
 * GET /api/guardian-portal/clients/:clientId/intake-documents
 * Signed PDFs from intake submissions for this child (guardian must match submission).
 */
export const listMyClientIntakeSignedDocuments = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const clientId = parsePositiveInt(req.params.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    if (await isClientAdultLockedForGuardian(clientId)) {
      return res.status(403).json({
        error: { message: 'Not available for this client.', code: 'GUARDIAN_ADULT_CLIENT' }
      });
    }
    const rows = await IntakeSubmissionDocument.listSignedForGuardianClient({
      guardianUserId: uid,
      clientId
    });
    res.json({ documents: rows || [] });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/guardian-portal/clients/:clientId/intake-documents/:documentId/download-url
 */
export const getMyClientIntakeSignedDocumentDownloadUrl = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const clientId = parsePositiveInt(req.params.clientId);
    const documentId = parsePositiveInt(req.params.documentId);
    if (!clientId || !documentId) {
      return res.status(400).json({ error: { message: 'clientId and documentId are required' } });
    }
    if (await isClientAdultLockedForGuardian(clientId)) {
      return res.status(403).json({
        error: { message: 'Not available for this client.', code: 'GUARDIAN_ADULT_CLIENT' }
      });
    }

    const doc = await IntakeSubmissionDocument.findById(documentId);
    if (!doc || Number(doc.client_id) !== clientId || !doc.signed_pdf_path) {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }

    const [srows] = await pool.execute(
      'SELECT guardian_user_id FROM intake_submissions WHERE id = ? LIMIT 1',
      [doc.intake_submission_id]
    );
    if (Number(srows?.[0]?.guardian_user_id) !== Number(uid)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const url = await StorageService.getSignedUrl(doc.signed_pdf_path, 60 * 30);
    const safeName = String(doc.signed_pdf_path || '').split('/').pop() || `intake-doc-${documentId}.pdf`;
    res.json({ url, filename: safeName });
  } catch (e) {
    next(e);
  }
};

// ─── General (non-Skill-Builders) Program Event access ─────────────────────

/**
 * Guardian is linked to a client enrolled in company_event_clients for this event.
 * Returns { ok, base, myClients } where myClients are the guardian's dependents enrolled.
 */
async function assertGuardianCompanyEventAccess(guardianUserId, eventId) {
  const gid = Number(guardianUserId);
  const eid = Number(eventId);
  if (!gid || !eid) return { ok: false };

  const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: gid });
  const allowedClientIds = new Set((linked || []).map((c) => Number(c.client_id)).filter((n) => n > 0));
  if (!allowedClientIds.size) return { ok: false };

  const ph = [...allowedClientIds].map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT ce.id AS company_event_id,
            ce.agency_id,
            ce.title,
            ce.description,
            ce.starts_at,
            ce.ends_at,
            ce.event_type,
            ce.organization_id,
            ce.virtual_sessions_enabled,
            ce.registration_eligible,
            ag.name AS agency_name,
            ag.slug AS agency_slug
     FROM company_event_clients cec
     INNER JOIN company_events ce ON ce.id = cec.company_event_id
     INNER JOIN agencies ag ON ag.id = ce.agency_id
     WHERE cec.company_event_id = ?
       AND cec.client_id IN (${ph})
       AND cec.is_active = 1
     LIMIT 1`,
    [eid, ...allowedClientIds]
  );
  const base = rows?.[0];
  if (!base) return { ok: false };

  const [kidRows] = await pool.execute(
    `SELECT DISTINCT c.id AS client_id, c.initials, c.full_name, c.date_of_birth
     FROM company_event_clients cec
     JOIN clients c ON c.id = cec.client_id
     WHERE cec.company_event_id = ?
       AND cec.is_active = 1
       AND c.id IN (${ph})`,
    [eid, ...allowedClientIds]
  );
  const myClients = (kidRows || []).map((r) => ({
    clientId: Number(r.client_id),
    initials: r.initials || null,
    fullName: r.full_name ? String(r.full_name).trim() || null : null,
    dateOfBirth: r.date_of_birth || null
  }));
  if (!myClients.length) return { ok: false };

  return { ok: true, base, myClients };
}

/** GET /api/guardian-portal/company-events — lists non-SB events the guardian's clients are enrolled in */
export const listGuardianCompanyEvents = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (isSuperadminGuardianPreview(req)) {
      return res.json({ ok: true, previewMode: 'superadmin', events: [] });
    }

    const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: uid });
    const ids = (linked || []).map((c) => Number(c.client_id)).filter((n) => n > 0);
    if (!ids.length) return res.json({ ok: true, events: [] });

    const ph = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT ce.id AS company_event_id,
              ce.agency_id,
              ce.title,
              ce.description,
              ce.starts_at,
              ce.ends_at,
              ce.event_type,
              ce.virtual_sessions_enabled,
              ag.name AS agency_name,
              ag.slug AS agency_slug,
              prog.name AS program_name,
              prog.slug AS program_slug,
              c.id AS client_id,
              c.initials,
              c.full_name,
              cec.enrolled_at
       FROM company_event_clients cec
       INNER JOIN company_events ce ON ce.id = cec.company_event_id
       LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
       INNER JOIN agencies ag ON ag.id = ce.agency_id
       LEFT JOIN agencies prog ON prog.id = ce.organization_id
       INNER JOIN clients c ON c.id = cec.client_id
       WHERE cec.client_id IN (${ph})
         AND cec.is_active = 1
         AND sg.id IS NULL
       ORDER BY ce.starts_at ASC`,
      ids
    );

    // Group by event, listing all the guardian's enrolled clients per event
    const byEvent = new Map();
    for (const r of rows || []) {
      const eid = Number(r.company_event_id);
      if (!byEvent.has(eid)) {
        byEvent.set(eid, {
          companyEventId: eid,
          agencyId: Number(r.agency_id),
          agencyName: r.agency_name || null,
          agencySlug: r.agency_slug || null,
          programName: r.program_name || null,
          programSlug: r.program_slug || null,
          title: r.title || `Event ${eid}`,
          description: r.description || null,
          startsAt: r.starts_at || null,
          endsAt: r.ends_at || null,
          eventType: r.event_type || null,
          virtualSessionsEnabled: !!(r.virtual_sessions_enabled === 1 || r.virtual_sessions_enabled === true),
          enrolledAt: r.enrolled_at || null,
          myClients: []
        });
      }
      byEvent.get(eid).myClients.push({
        clientId: Number(r.client_id),
        initials: r.initials || null,
        fullName: r.full_name ? String(r.full_name).trim() || null : null,
        enrolledAt: r.enrolled_at || null
      });
    }

    res.json({ ok: true, events: [...byEvent.values()] });
  } catch (e) {
    next(e);
  }
};

/** GET /api/guardian-portal/company-events/:eventId/detail — non-SB event detail for guardian */
export const getGuardianCompanyEventDetail = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const eventId = parsePositiveInt(req.params.eventId);
    if (!uid || !eventId) return res.status(400).json({ error: { message: 'Invalid event' } });

    const access = await assertGuardianCompanyEventAccess(uid, eventId);
    if (!access.ok) return res.status(403).json({ error: { message: 'Event not available for this account' } });

    const { base, myClients } = access;

    // Expand client detail
    const myClientsDetail = [];
    for (const cl of myClients) {
      try {
        const [crow] = await pool.execute(
          `SELECT id, initials, full_name, date_of_birth, document_status, paperwork_status_id
           FROM clients WHERE id = ? LIMIT 1`,
          [cl.clientId]
        );
        const c = crow?.[0];
        let paperworkLabel = null;
        if (c?.paperwork_status_id) {
          const [pw] = await pool.execute(
            `SELECT label FROM paperwork_statuses WHERE id = ? LIMIT 1`,
            [c.paperwork_status_id]
          );
          paperworkLabel = pw?.[0]?.label || null;
        }
        myClientsDetail.push({
          clientId: cl.clientId,
          initials: c?.initials || cl.initials,
          fullName: c?.full_name ? String(c.full_name).trim() || null : null,
          dateOfBirth: c?.date_of_birth || cl.dateOfBirth || null,
          documentStatus: c?.document_status || null,
          paperworkStatusLabel: paperworkLabel
        });
      } catch {
        myClientsDetail.push(cl);
      }
    }

    // Sessions for this event (if any were created)
    let sessions = [];
    try {
      const [sessRows] = await pool.execute(
        `SELECT s.id, s.session_date, s.starts_at, s.ends_at, s.timezone,
                s.location_label, s.location_address, s.modality, s.join_url
         FROM skill_builders_event_sessions s
         WHERE s.company_event_id = ?
         ORDER BY s.session_date ASC, s.starts_at ASC
         LIMIT 200`,
        [eventId]
      );
      sessions = (sessRows || []).map((r) => ({
        id: Number(r.id),
        sessionDate: r.session_date,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        timezone: r.timezone || 'UTC',
        locationLabel: r.location_label != null ? String(r.location_label).trim() || null : null,
        locationAddress: r.location_address != null ? String(r.location_address).trim() || null : null,
        modality: r.modality != null ? String(r.modality).trim().toLowerCase() || null : null,
        joinUrl: r.join_url != null ? String(r.join_url).trim().slice(0, 1024) || null : null
      }));
    } catch { /* no sessions table or no rows */ }

    // Program info
    let programPortal = null;
    if (base.organization_id) {
      try {
        const [pr] = await pool.execute(
          `SELECT id, name, slug FROM agencies WHERE id = ? LIMIT 1`,
          [Number(base.organization_id)]
        );
        if (pr?.[0]) {
          programPortal = {
            organizationId: Number(pr[0].id),
            name: String(pr[0].name || '').trim(),
            slug: String(pr[0].slug || '').trim().toLowerCase() || null
          };
        }
      } catch { /* no program org */ }
    }

    res.json({
      ok: true,
      event: {
        id: Number(base.company_event_id),
        title: base.title || `Event ${base.company_event_id}`,
        description: base.description || null,
        startsAt: base.starts_at || null,
        endsAt: base.ends_at || null,
        eventType: base.event_type || null,
        virtualSessionsEnabled: !!(base.virtual_sessions_enabled === 1 || base.virtual_sessions_enabled === true),
        agencyId: Number(base.agency_id),
        agencyName: base.agency_name || null,
        agencySlug: base.agency_slug || null
      },
      skillsGroup: null,
      meetings: [],
      providers: [],
      myChildren: myClientsDetail,
      sessions,
      clientAttendance: [],
      programPortal
    });
  } catch (e) {
    next(e);
  }
};
