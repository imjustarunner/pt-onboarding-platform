import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import Notification from '../models/Notification.model.js';
import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import { callGeminiText } from '../services/geminiText.service.js';
import { sendNotificationEmail } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import { isCategoryEnabledForUser } from '../services/notificationDispatcher.service.js';
import {
  isSupervisorActor,
  supervisorHasSuperviseeInSchool,
  supervisorCanAccessClientInOrg
} from '../utils/supervisorSchoolAccess.js';

async function hasSupportTicketMessagesTable() {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages'"
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketMessagesSoftDeleteColumns() {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages' AND COLUMN_NAME = 'is_deleted'"
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketsCloseOnReadColumn() {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'close_on_read'"
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function maybeGenerateGeminiSummary({ question, answer }) {
  const prompt = [
    'Summarize this question and answer in 1-3 sentences.',
    'Do NOT include any client identifiers, initials, or PHI.',
    '',
    'Question:',
    String(question || '').trim(),
    '',
    'Answer:',
    String(answer || '').trim()
  ].join('\n');
  try {
    const { text } = await callGeminiText({ prompt, temperature: 0.2, maxOutputTokens: 400 });
    const cleaned = String(text || '').trim();
    return cleaned ? cleaned.slice(0, 900) : null;
  } catch {
    return null;
  }
}

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

async function ensureOrgAccess(req, schoolOrganizationId) {
  const sid = parseInt(schoolOrganizationId, 10);
  if (!sid) return { ok: false, status: 400, message: 'Invalid schoolOrganizationId' };

  const org = await Agency.findById(sid);
  if (!org) return { ok: false, status: 404, message: 'Organization not found' };

  if (req.user?.role !== 'super_admin') {
    const orgs = await User.getAgencies(req.user.id);
    const hasDirect = (orgs || []).some((o) => parseInt(o.id, 10) === sid);
    if (!hasDirect) {
      const role = String(req.user?.role || '').toLowerCase();
      const hasSupervisorCapability = await isSupervisorActor({ userId: req.user?.id, role, user: req.user });
      if (hasSupervisorCapability) {
        const canSupervisorAccess = await supervisorHasSuperviseeInSchool(req.user?.id, sid);
        if (canSupervisorAccess) return { ok: true, org, schoolOrganizationId: sid, supervisorLimited: true };
      }
      const canUseAgencyAffiliation = role === 'admin' || role === 'support' || role === 'staff' || role === 'supervisor' || role === 'clinical_practice_assistant' || role === 'provider_plus' || role === 'provider';
      if (!canUseAgencyAffiliation) return { ok: false, status: 403, message: 'Access denied' };
      const activeAgencyId = await resolveActiveAgencyIdForOrg(sid);
      const hasAgency = activeAgencyId
        ? (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(activeAgencyId, 10))
        : false;
      if (!hasAgency) return { ok: false, status: 403, message: 'Access denied' };
    }
  }

  return { ok: true, org, schoolOrganizationId: sid };
}

async function ensureAgencyAccess(req, agencyId) {
  const aid = parseInt(agencyId, 10);
  if (!aid) return { ok: false, status: 400, message: 'Invalid agencyId' };

  const agency = await Agency.findById(aid);
  if (!agency) return { ok: false, status: 404, message: 'Agency not found' };

  if (req.user?.role !== 'super_admin') {
    const agencies = await User.getAgencies(req.user.id);
    const hasAccess = (agencies || []).some((a) => parseInt(a.id, 10) === aid);
    if (!hasAccess) return { ok: false, status: 403, message: 'Access denied' };
  }

  return { ok: true, agency, agencyId: aid };
}

async function ensureClientInOrg({ clientId, schoolOrganizationId }) {
  const cid = parseInt(clientId, 10);
  const sid = parseInt(schoolOrganizationId, 10);
  if (!cid) return { ok: false, status: 400, message: 'Invalid clientId' };
  if (!sid) return { ok: false, status: 400, message: 'Invalid schoolOrganizationId' };

  const [cRows] = await pool.execute(
    `SELECT id, organization_id, status
     FROM clients
     WHERE id = ?
     LIMIT 1`,
    [cid]
  );
  const c = cRows?.[0] || null;
  if (!c) return { ok: false, status: 404, message: 'Client not found' };
  if (String(c.status || '').toUpperCase() === 'ARCHIVED') {
    return { ok: false, status: 409, message: 'Client is archived' };
  }

  // Prefer multi-org assignment table if present; fall back to legacy clients.organization_id.
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_organization_assignments
       WHERE client_id = ?
         AND organization_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [cid, sid]
    );
    if (rows?.[0]) return { ok: true, clientId: cid };
    return { ok: false, status: 403, message: 'Client is not assigned to this organization' };
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
    // Legacy fallback
    if (parseInt(c.organization_id, 10) === sid) return { ok: true, clientId: cid };
    return { ok: false, status: 403, message: 'Client is not assigned to this organization' };
  }
}

async function listSchoolStaffRecipients({ schoolOrganizationId }) {
  const sid = parseInt(schoolOrganizationId, 10);
  if (!sid) return [];
  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.work_email, u.first_name, u.last_name, u.role
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND LOWER(COALESCE(u.role, '')) = 'school_staff'
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
    [sid]
  );
  return rows || [];
}

async function listAgencySupportRecipients({ agencyId }) {
  const aid = parseInt(agencyId, 10);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.work_email, u.first_name, u.last_name, u.role
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
      AND LOWER(COALESCE(u.role, '')) IN ('admin','support','staff','super_admin','clinical_practice_assistant','provider_plus')
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
    [aid]
  );
  return rows || [];
}

const isAgencyAdminUser = (req) => {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

async function providerAssignedToClientInOrg({ providerUserId, clientId, orgId }) {
  const pid = parseInt(String(providerUserId), 10);
  const cid = parseInt(String(clientId), 10);
  const oid = parseInt(String(orgId), 10);
  if (!pid || !cid || !oid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments cpa
       WHERE cpa.client_id = ?
         AND cpa.organization_id = ?
         AND cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
       LIMIT 1`,
      [cid, oid, pid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM clients c
       WHERE c.id = ?
         AND c.provider_id = ?
         AND c.organization_id = ?
       LIMIT 1`,
      [cid, pid, oid]
    );
    return !!rows?.[0];
  } catch {
    return false;
  }
}

async function canSupervisorAccessClientScope({ req, schoolOrganizationId, clientId }) {
  const userId = Number(req.user?.id || 0);
  const sid = Number(schoolOrganizationId || 0);
  const cid = Number(clientId || 0);
  if (!userId || !sid || !cid) return false;
  const role = String(req.user?.role || '').toLowerCase();
  const isSupervisor = await isSupervisorActor({ userId, role, user: req.user });
  if (!isSupervisor) return false;
  const inSchool = await supervisorHasSuperviseeInSchool(userId, sid);
  if (!inSchool) return false;
  return await supervisorCanAccessClientInOrg({ supervisorUserId: userId, clientId: cid, orgId: sid });
}

async function canViewClientTicketScope({ req, schoolOrganizationId, clientId }) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'school_staff' || isAgencyAdminUser(req)) return true;
  if (role === 'provider') {
    return await providerAssignedToClientInOrg({ providerUserId: req.user?.id, clientId, orgId: schoolOrganizationId });
  }
  return await canSupervisorAccessClientScope({ req, schoolOrganizationId, clientId });
}

const isSuperAdmin = (req) => String(req.user?.role || '').toLowerCase() === 'super_admin';

function parseBool(v) {
  if (v === true || v === false) return v;
  if (v === 1 || v === 0) return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

function truncateText(value, limit = 600) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

function formatPromptDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString();
}

function buildSupportTicketResponsePrompt({
  ticket,
  client,
  messages,
  notes,
  recentTickets
}) {
  const lines = [
    'You are a support agent writing a reply to a help ticket.',
    'Use only the information provided below.',
    'If key details are missing, ask a short clarifying question.',
    'Do not invent facts. Do not include PHI beyond what is already shown here.',
    '',
    'Ticket:',
    `- Subject: ${truncateText(ticket?.subject || 'Support ticket', 240)}`,
    `- Question: ${truncateText(ticket?.question, 1800)}`,
    `- Status: ${String(ticket?.status || '').toLowerCase() || 'open'}`,
    `- Created by: ${truncateText(ticket?.created_by_name || ticket?.created_by_email || `User #${ticket?.created_by_user_id || '—'}`, 160)}`,
    `- School: ${truncateText(ticket?.school_name || `Org #${ticket?.school_organization_id || '—'}`, 160)}`,
    `- Created at: ${formatPromptDate(ticket?.created_at)}`
  ];

  if (client) {
    lines.push(
      '',
      'Client context:',
      `- Client: ${truncateText(client.initials || client.identifier_code || '—', 80)} (${truncateText(client.identifier_code || client.initials || '—', 80)})`,
      `- Client status: ${truncateText(client.client_status_label || client.status || '—', 120)}`,
      `- Paperwork status: ${truncateText(client.paperwork_status_label || client.document_status || '—', 120)}`,
      `- Assigned provider: ${truncateText(client.provider_name || '—', 120)}`,
      `- Organization: ${truncateText(client.organization_name || '—', 160)}`
    );
  }

  if (Array.isArray(messages) && messages.length) {
    lines.push('', 'Recent ticket messages:');
    for (const msg of messages) {
      const author =
        truncateText(msg?.author_name || `${msg?.author_first_name || ''} ${msg?.author_last_name || ''}`, 120) ||
        `User #${msg?.author_user_id || '—'}`;
      lines.push(
        `- ${author} (${formatPromptDate(msg?.created_at)}): ${truncateText(msg?.body, 600)}`
      );
    }
  }

  if (Array.isArray(notes) && notes.length) {
    lines.push('', 'Recent client notes:');
    for (const note of notes) {
      const author = truncateText(note?.author_name || `User #${note?.author_id || '—'}`, 120);
      const category = truncateText(note?.category || 'general', 40);
      lines.push(
        `- [${category}] ${author} (${formatPromptDate(note?.created_at)}): ${truncateText(note?.message, 600)}`
      );
    }
  }

  if (Array.isArray(recentTickets) && recentTickets.length) {
    lines.push('', 'Recent tickets for this client:');
    for (const rt of recentTickets) {
      lines.push(
        `- #${rt.id}: ${truncateText(rt.subject || 'Support ticket', 180)} (${String(rt.status || '').toLowerCase() || 'open'}, ${formatPromptDate(rt.created_at)})`
      );
    }
  }

  lines.push(
    '',
    'Write a helpful, concise response. Keep it professional and actionable.'
  );

  return lines.join('\n');
}

export const listMySupportTickets = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.*,
              u.first_name AS answered_by_first_name,
              u.last_name AS answered_by_last_name,
              s.name AS school_name
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.answered_by_user_id
       LEFT JOIN agencies s ON s.id = t.school_organization_id
       WHERE t.created_by_user_id = ?
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

async function getAccessibleTicketScopeForUser(userId, role, req) {
  // Anyone who can view the queue (admin/support/staff/CPA/provider_plus) sees same as super_admin
  if (req && isAgencyAdminUser(req)) {
    return { agencyIds: null, schoolOrgIds: null };
  }
  const r = String(role || '').toLowerCase();
  if (r === 'super_admin') return { agencyIds: null, schoolOrgIds: null };
  const agencies = await User.getAgencies(userId);
  const ids = (agencies || []).map((a) => parseInt(a?.id, 10)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return { agencyIds: [], schoolOrgIds: [] };

  const [orgRows] = await pool.execute(
    `SELECT id, organization_type FROM agencies WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  // Include any org that is a parent agency (not a school/program/learning child).
  // Some setups use organization_type = 'organization', 'parent', or empty for the main agency.
  const childOrgTypes = new Set(['school', 'program', 'learning']);
  let agencyIds = (orgRows || []).filter((r) => {
    const t = String(r?.organization_type || '').toLowerCase().trim();
    return !t || !childOrgTypes.has(t);
  }).map((r) => r.id);
  const directSchoolIds = (orgRows || []).filter((r) => String(r?.organization_type || '').toLowerCase() === 'school').map((r) => r.id);

  // If user is only in schools (no direct agency), resolve parent agencies from those schools
  if (agencyIds.length === 0 && directSchoolIds.length > 0) {
    const parentAgencyIds = new Set();
    for (const sid of directSchoolIds) {
      const aid = await OrganizationAffiliation.getActiveAgencyIdForOrganization(sid) || await AgencySchool.getActiveAgencyIdForSchool(sid);
      if (aid) parentAgencyIds.add(parseInt(aid, 10));
    }
    agencyIds = [...parentAgencyIds].filter((n) => Number.isFinite(n) && n > 0);
  }

  let schoolOrgIds = [...directSchoolIds];
  if (agencyIds.length > 0) {
    // organization_affiliations (primary) - schools/programs linked to agency
    const [affRows] = await pool.execute(
      `SELECT organization_id FROM organization_affiliations WHERE agency_id IN (${agencyIds.map(() => '?').join(',')}) AND is_active = TRUE`,
      agencyIds
    );
    const affSchoolIds = (affRows || []).map((r) => parseInt(r.organization_id, 10)).filter((n) => Number.isFinite(n));
    schoolOrgIds = [...new Set([...schoolOrgIds, ...affSchoolIds])];

    // agency_schools (legacy) - some platforms use this for school-agency links
    try {
      const [legacyRows] = await pool.execute(
        `SELECT school_organization_id FROM agency_schools WHERE agency_id IN (${agencyIds.map(() => '?').join(',')}) AND is_active = TRUE`,
        agencyIds
      );
      const legacySchoolIds = (legacyRows || []).map((r) => parseInt(r.school_organization_id, 10)).filter((n) => Number.isFinite(n));
      schoolOrgIds = [...new Set([...schoolOrgIds, ...legacySchoolIds])];
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
    }
  }

  return { agencyIds, schoolOrgIds };
}

export const listSupportTicketsQueue = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canView = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
    if (!canView) {
      return res.status(403).json({ error: { message: 'Only staff/admin/support can view the support ticket queue' } });
    }

    const agencyIdFilter = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const schoolOrganizationId = req.query?.schoolOrganizationId ? parseInt(req.query.schoolOrganizationId, 10) : null;
    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : null;
    const sourceChannel = req.query?.sourceChannel ? String(req.query.sourceChannel).trim().toLowerCase() : null;
    const draftState = req.query?.draftState ? String(req.query.draftState).trim().toLowerCase() : null;
    const sentState = req.query?.sentState ? String(req.query.sentState).trim().toLowerCase() : null;
    const mine = parseBool(req.query?.mine);
    const qRaw = req.query?.q ? String(req.query.q) : '';
    const q = qRaw.trim().slice(0, 120);

    const where = [];
    const params = [];

    // Scope to user's agencies/schools for non-super_admin (so agency admins see all tickets from their agency's schools)
    const scope = await getAccessibleTicketScopeForUser(req.user.id, role, req);
    if (scope.agencyIds !== null) {
      const conditions = [];
      if (scope.agencyIds.length > 0) {
        conditions.push(`t.agency_id IN (${scope.agencyIds.map(() => '?').join(',')})`);
        params.push(...scope.agencyIds);
      }
      if (scope.schoolOrgIds.length > 0) {
        conditions.push(`t.school_organization_id IN (${scope.schoolOrgIds.map(() => '?').join(',')})`);
        params.push(...scope.schoolOrgIds);
      }
      if (conditions.length > 0) {
        where.push(`(${conditions.join(' OR ')})`);
      } else {
        where.push('1 = 0');
      }
    }

    if (agencyIdFilter && Number.isFinite(agencyIdFilter)) {
      const access = await ensureAgencyAccess(req, agencyIdFilter);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
      where.push('t.agency_id = ?');
      params.push(agencyIdFilter);
    }

    if (schoolOrganizationId) {
      const access = await ensureOrgAccess(req, schoolOrganizationId);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
      where.push('t.school_organization_id = ?');
      params.push(schoolOrganizationId);
    }

    if (status) {
      where.push('LOWER(t.status) = ?');
      params.push(status);
    }

    if (sourceChannel) {
      where.push('LOWER(COALESCE(t.source_channel, ?)) = ?');
      params.push('portal', sourceChannel);
    }

    if (draftState) {
      if (draftState === 'none') {
        where.push('(t.ai_draft_review_state IS NULL OR t.ai_draft_review_state = \'\')');
      } else {
        where.push('LOWER(COALESCE(t.ai_draft_review_state, \'\')) = ?');
        params.push(draftState);
      }
    }

    if (sentState === 'sent') {
      where.push('t.sent_at IS NOT NULL');
    } else if (sentState === 'unsent') {
      where.push('t.sent_at IS NULL');
    }

    // "My tickets" = claimed by current user.
    if (mine === true) {
      where.push('t.claimed_by_user_id = ?');
      params.push(req.user.id);
    }

    // Basic search across subject/question + school name
    if (q) {
      where.push('(t.subject LIKE ? OR t.question LIKE ? OR s.name LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const sql = `
      SELECT t.*,
             cb.first_name AS created_by_first_name,
             cb.last_name AS created_by_last_name,
             cb.email AS created_by_email,
             ab.first_name AS answered_by_first_name,
             ab.last_name AS answered_by_last_name,
             ap.first_name AS approved_by_first_name,
             ap.last_name AS approved_by_last_name,
             cl.first_name AS claimed_by_first_name,
             cl.last_name AS claimed_by_last_name,
             s.name AS school_name,
             a.name AS agency_name,
             c.initials AS client_initials,
             c.identifier_code AS client_identifier_code
      FROM support_tickets t
      LEFT JOIN users cb ON cb.id = t.created_by_user_id
      LEFT JOIN users ab ON ab.id = t.answered_by_user_id
      LEFT JOIN users ap ON ap.id = t.approved_by_user_id
      LEFT JOIN users cl ON cl.id = t.claimed_by_user_id
      LEFT JOIN agencies s ON s.id = t.school_organization_id
      LEFT JOIN agencies a ON a.id = t.agency_id
      LEFT JOIN clients c ON c.id = t.client_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE WHEN LOWER(t.status) = 'open' THEN 0 ELSE 1 END,
        t.created_at DESC
    `;

    const [rows] = await pool.execute(sql, params);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

/**
 * Get open tickets count for nav badge.
 * GET /api/support-tickets/count?status=open
 */
export const getSupportTicketsCount = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canView = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
    if (!canView) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : 'open';
    const mine = parseBool(req.query?.mine);

    const where = [];
    const params = [];

    const scope = await getAccessibleTicketScopeForUser(req.user.id, role, req);
    if (scope.agencyIds !== null) {
      const conditions = [];
      if (scope.agencyIds.length > 0) {
        conditions.push(`t.agency_id IN (${scope.agencyIds.map(() => '?').join(',')})`);
        params.push(...scope.agencyIds);
      }
      if (scope.schoolOrgIds.length > 0) {
        conditions.push(`t.school_organization_id IN (${scope.schoolOrgIds.map(() => '?').join(',')})`);
        params.push(...scope.schoolOrgIds);
      }
      if (conditions.length > 0) {
        where.push(`(${conditions.join(' OR ')})`);
      } else {
        where.push('1 = 0');
      }
    }

    where.push('LOWER(t.status) = ?');
    params.push(status);

    if (mine === true) {
      where.push('t.claimed_by_user_id = ?');
      params.push(req.user.id);
    }

    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM support_tickets t
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
      params
    );
    const count = Number(rows?.[0]?.cnt || 0);
    res.json({ count });
  } catch (e) {
    next(e);
  }
};

export const createSupportTicket = async (req, res, next) => {
  try {
    const schoolOrganizationId = parseInt(req.body?.schoolOrganizationId, 10);
    const subject = req.body?.subject ? String(req.body.subject).trim().slice(0, 255) : null;
    const clientIdRaw = req.body?.clientId ?? null;
    const clientId = clientIdRaw !== null && clientIdRaw !== undefined ? parseInt(clientIdRaw, 10) : null;
    const question = String(req.body?.question || '').trim();
    if (!schoolOrganizationId || !question) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId and question are required' } });
    }

    const access = await ensureOrgAccess(req, schoolOrganizationId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // School Portal: allow school_staff and providers (for their assigned clients) to create tickets.
    const role = String(req.user?.role || '').toLowerCase();
    if (clientId) {
      // Client-scoped tickets: school staff or providers assigned to the client.
      if (role === 'school_staff') {
        const okClient = await ensureClientInOrg({ clientId, schoolOrganizationId });
        if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });
      } else if (role === 'provider') {
        const assigned = await providerAssignedToClientInOrg({
          providerUserId: req.user?.id,
          clientId,
          orgId: schoolOrganizationId
        });
        if (!assigned) return res.status(403).json({ error: { message: 'Access denied. You can only create tickets for clients assigned to you.' } });
      } else {
        return res.status(403).json({ error: { message: 'Only school staff and assigned providers can submit client tickets' } });
      }
    } else if (role !== 'school_staff' && role !== 'provider') {
      return res.status(403).json({ error: { message: 'Only school staff and providers can submit support tickets here' } });
    }

    const agencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);

    const [result] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [schoolOrganizationId, clientId || null, req.user.id, agencyId ? parseInt(agencyId, 10) : null, subject, question]
    );

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [result.insertId]);
    const created = rows?.[0] || null;

    // Best-effort: persist the initial question as a message row when the table exists.
    try {
      if (created?.id && (await hasSupportTicketMessagesTable())) {
        await pool.execute(
          `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
           VALUES (?, NULL, ?, ?, ?)`,
          [created.id, req.user.id, String(req.user?.role || ''), question]
        );
      }
    } catch {
      // best-effort; do not block creation
    }

    // Create an in-app notification for agency admins/staff/CPAs if configured.
    // This powers the ticketing notifications card in the admin notifications UI.
    try {
      const aid = agencyId ? parseInt(agencyId, 10) : null;
      if (aid) {
        // Determine which org-type this ticket came from (school/program/learning).
        const orgType = String(access?.org?.organization_type || '').trim().toLowerCase();

        // Resolve per-agency scope (defaults to all supported child org types if unset).
        let allowedTypes = ['school', 'program', 'learning'];
        try {
          const a = await Agency.findById(aid);
          const raw = a?.ticketing_notification_org_types_json ?? null;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed) && parsed.length) {
            allowedTypes = parsed.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
          }
        } catch {
          // best-effort; keep defaults
        }

        const shouldNotify =
          orgType && allowedTypes.includes(orgType);

        if (shouldNotify && created?.id) {
          // Prefer a concise message, but keep enough context to be useful in the feed.
          const schoolName = access?.org?.name || `Org #${schoolOrganizationId}`;
          const title = 'New support ticket';
          const msg =
            `${schoolName}: ${subject || 'Support ticket'}${question ? ` — ${question.slice(0, 220)}${question.length > 220 ? '…' : ''}` : ''}`;

          await Notification.create({
            type: 'support_ticket_created',
            severity: 'info',
            title,
            message: msg,
            // Visible to admin-like roles; staff maps to 'admin' audience.
            audienceJson: {
              admin: true,
              clinicalPracticeAssistant: true,
              supervisor: false,
              provider: false
            },
            userId: null,
            agencyId: aid,
            relatedEntityType: 'support_ticket',
            relatedEntityId: created.id,
            actorUserId: req.user.id
          });
        }
      }
    } catch {
      // Never block ticket creation on notification side-effects.
    }

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const getClientSupportTicketThread = async (req, res, next) => {
  try {
    const schoolOrganizationId = parseInt(req.query?.schoolOrganizationId, 10);
    const clientId = parseInt(req.query?.clientId, 10);
    if (!schoolOrganizationId || !clientId) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId and clientId are required' } });
    }

    const access = await ensureOrgAccess(req, schoolOrganizationId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Only allow school staff + agency admin/support/staff to view client threads.
    const canView = await canViewClientTicketScope({ req, schoolOrganizationId, clientId });
    if (!canView) return res.status(403).json({ error: { message: 'Access denied' } });

    const okClient = await ensureClientInOrg({ clientId, schoolOrganizationId });
    if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });

    const [rows] = await pool.execute(
      `SELECT *
       FROM support_tickets
       WHERE school_organization_id = ?
         AND client_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [schoolOrganizationId, clientId]
    );
    const ticket = rows?.[0] || null;

    let messages = [];
    if (ticket?.id && (await hasSupportTicketMessagesTable())) {
      const [mRows] = await pool.execute(
        `SELECT m.*,
                u.first_name AS author_first_name,
                u.last_name AS author_last_name
         FROM support_ticket_messages m
         LEFT JOIN users u ON u.id = m.author_user_id
         WHERE m.ticket_id = ?
         ORDER BY m.created_at ASC, m.id ASC`,
        [ticket.id]
      );
      messages = Array.isArray(mRows) ? mRows : [];
    }

    res.json({ ticket, messages });
  } catch (e) {
    next(e);
  }
};

/**
 * Mark a client-scoped support ticket thread as read (viewed) for the current user.
 * POST /api/support-tickets/client-thread/read
 * body: { schoolOrganizationId, clientId }
 */
export const markClientSupportTicketThreadRead = async (req, res, next) => {
  try {
    const schoolOrganizationId = parseInt(req.body?.schoolOrganizationId, 10);
    const clientId = parseInt(req.body?.clientId, 10);
    if (!schoolOrganizationId || !clientId) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId and clientId are required' } });
    }

    const access = await ensureOrgAccess(req, schoolOrganizationId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Only allow school staff + agency admin/support/staff + super_admin (same as thread view)
    const canView = await canViewClientTicketScope({ req, schoolOrganizationId, clientId });
    if (!canView) return res.status(403).json({ error: { message: 'Access denied' } });

    const okClient = await ensureClientInOrg({ clientId, schoolOrganizationId });
    if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });

    // Best-effort insert/update; table may not exist yet in older environments.
    try {
      await pool.execute(
        `INSERT INTO support_ticket_thread_reads (school_organization_id, client_id, user_id, last_read_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE last_read_at = CURRENT_TIMESTAMP`,
        [schoolOrganizationId, clientId, req.user.id]
      );
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
    }

    // If any answered tickets should close on read, close them now.
    if (await hasSupportTicketsCloseOnReadColumn()) {
      try {
        await pool.execute(
          `UPDATE support_tickets
           SET status = 'closed', close_on_read = 0
           WHERE school_organization_id = ?
             AND client_id = ?
             AND close_on_read = 1
             AND LOWER(status) = 'answered'`,
          [schoolOrganizationId, clientId]
        );
      } catch {
        // best-effort
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listClientSupportTickets = async (req, res, next) => {
  try {
    const schoolOrganizationId = parseInt(req.query?.schoolOrganizationId, 10);
    const clientId = parseInt(req.query?.clientId, 10);
    if (!schoolOrganizationId || !clientId) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId and clientId are required' } });
    }

    const access = await ensureOrgAccess(req, schoolOrganizationId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Only allow school staff + agency admin/support/staff to view client tickets.
    const canView = await canViewClientTicketScope({ req, schoolOrganizationId, clientId });
    if (!canView) return res.status(403).json({ error: { message: 'Access denied' } });

    const okClient = await ensureClientInOrg({ clientId, schoolOrganizationId });
    if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });

    const limitRaw = req.query?.limit ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;

    const [rows] = await pool.execute(
      `SELECT *
       FROM support_tickets
       WHERE school_organization_id = ?
         AND client_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit}`,
      [schoolOrganizationId, clientId]
    );

    res.json({ tickets: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const listSupportTicketMessages = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const role = String(req.user?.role || '').toLowerCase();
    let canView = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
    if (!canView && ticket.client_id) {
      canView =
        (await canSupervisorAccessClientScope({
          req,
          schoolOrganizationId: ticket.school_organization_id,
          clientId: ticket.client_id
        })) ||
        (role === 'provider' &&
          (await providerAssignedToClientInOrg({
            providerUserId: req.user?.id,
            clientId: ticket.client_id,
            orgId: ticket.school_organization_id
          })));
    }
    if (!canView) return res.status(403).json({ error: { message: 'Access denied' } });

    if (!(await hasSupportTicketMessagesTable())) {
      return res.json({ ticket, messages: [] });
    }

    const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
    const [mRows] = await pool.execute(
      `SELECT m.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
       WHERE m.ticket_id = ?
       ORDER BY m.created_at ASC, m.id ASC`,
      [ticketId]
    );
    const list = Array.isArray(mRows) ? mRows : [];
    // Normalize deleted messages when the column exists
    const normalized = hasSoftDelete
      ? list.map((m) => {
        const isDeleted = m?.is_deleted === 1 || m?.is_deleted === true;
        if (!isDeleted) return m;
        return {
          ...m,
          body: '',
          is_deleted: 1
        };
      })
      : list;
    res.json({ ticket, messages: normalized });
  } catch (e) {
    next(e);
  }
};

export const createSupportTicketMessage = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const body = String(req.body?.body || '').trim();
    const parentMessageIdRaw = req.body?.parentMessageId ?? null;
    const parentMessageId =
      parentMessageIdRaw === null || parentMessageIdRaw === undefined || String(parentMessageIdRaw).trim() === ''
        ? null
        : parseInt(parentMessageIdRaw, 10);
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!(await hasSupportTicketMessagesTable())) {
      return res.status(409).json({ error: { message: 'Ticket messages are not enabled (missing migration)' } });
    }

    const role = String(req.user?.role || '').toLowerCase();

    // Client-scoped tickets: allow school_staff, agency admin/support/staff, and assigned providers to post.
    if (ticket.client_id) {
      let canPost = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
      if (!canPost) {
        canPost =
          (await canSupervisorAccessClientScope({
            req,
            schoolOrganizationId: ticket.school_organization_id,
            clientId: ticket.client_id
          })) ||
          (role === 'provider' &&
            (await providerAssignedToClientInOrg({
              providerUserId: req.user?.id,
              clientId: ticket.client_id,
              orgId: ticket.school_organization_id
            })));
      }
      if (!canPost) return res.status(403).json({ error: { message: 'Access denied' } });
      // Validate client still belongs to org (avoids cross-org leakage)
      const okClient = await ensureClientInOrg({ clientId: ticket.client_id, schoolOrganizationId: ticket.school_organization_id });
      if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });
    }

    const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();

    // Parent pointer is best-effort; if invalid, treat as top-level.
    let parentId = null;
    if (parentMessageId && Number.isFinite(parentMessageId) && parentMessageId > 0) {
      try {
        const [pRows] = await pool.execute(
          `SELECT id${hasSoftDelete ? ', is_deleted' : ''} FROM support_ticket_messages WHERE id = ? AND ticket_id = ? LIMIT 1`,
          [parentMessageId, ticketId]
        );
        const p = pRows?.[0] || null;
        const isDeleted = hasSoftDelete ? (p?.is_deleted === 1 || p?.is_deleted === true) : false;
        if (p?.id && !isDeleted) parentId = parentMessageId;
      } catch {
        parentId = null;
      }
    }

    await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
       VALUES (?, ?, ?, ?, ?)`,
      [ticketId, parentId, req.user.id, String(req.user?.role || ''), body]
    );

    // If a school staff member responds on a closed ticket, reopen it.
    if (role === 'school_staff' && String(ticket.status || '').toLowerCase() === 'closed') {
      try {
        await pool.execute(`UPDATE support_tickets SET status = 'open' WHERE id = ?`, [ticketId]);
      } catch {
        // ignore
      }
    }

    // Best-effort: email other side of the thread (school staff <-> agency team).
    try {
      const agencyId = ticket.agency_id ? Number(ticket.agency_id) : null;
      const orgName = access?.org?.name || `Org #${ticket.school_organization_id}`;
      let clientLabel = '';
      if (ticket.client_id) {
        try {
          const client = await Client.findById(ticket.client_id);
          const name = [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim();
          clientLabel = name || client?.full_name || '';
        } catch {
          clientLabel = '';
        }
      }
      const subjectParts = ['School portal message', ticket.subject || 'Support ticket'];
      if (clientLabel) subjectParts.push(clientLabel);
      const subject = subjectParts.filter(Boolean).join(' — ');
      const text = [
        orgName,
        clientLabel ? `Client: ${clientLabel}` : null,
        '',
        body,
        '',
        'Reply in the school portal.'
      ].filter(Boolean).join('\n');

      const categoryKey = 'school_portal_client_messages';
      const recipients = role === 'school_staff'
        ? await listAgencySupportRecipients({ agencyId })
        : await listSchoolStaffRecipients({ schoolOrganizationId: ticket.school_organization_id });

      for (const r of recipients) {
        if (Number(r.id) === Number(req.user?.id)) continue;
        const to = r.email || r.work_email || null;
        if (!to) continue;
        const categoryOk = await isCategoryEnabledForUser({
          userId: r.id,
          agencyId: agencyId || null,
          categoryKey
        });
        if (!categoryOk) continue;
        const decision = await NotificationGatekeeperService.decideChannels({
          userId: r.id,
          context: { severity: 'info' }
        });
        if (!decision?.email) continue;
        await sendNotificationEmail({
          agencyId: agencyId || null,
          triggerKey: categoryKey,
          to,
          subject,
          text,
          html: null,
          source: 'auto',
          userId: r.id,
          templateType: 'school_portal_message',
          templateId: null
        });
      }
    } catch {
      // ignore email failures
    }

    // Return updated thread
    return await listSupportTicketMessages(req, res, next);
  } catch (e) {
    next(e);
  }
};

export const deleteSupportTicketMessage = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });
    if (!messageId) return res.status(400).json({ error: { message: 'Invalid message id' } });

    const [tRows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = tRows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!(await hasSupportTicketMessagesTable())) {
      return res.status(409).json({ error: { message: 'Ticket messages are not enabled (missing migration)' } });
    }
    if (!(await hasSupportTicketMessagesSoftDeleteColumns())) {
      return res.status(409).json({ error: { message: 'Message delete is not enabled (missing migration)' } });
    }

    const [mRows] = await pool.execute(
      `SELECT id, ticket_id, author_user_id, author_role, is_deleted
       FROM support_ticket_messages
       WHERE id = ? AND ticket_id = ?
       LIMIT 1`,
      [messageId, ticketId]
    );
    const msg = mRows?.[0] || null;
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    if (msg.is_deleted === 1 || msg.is_deleted === true) {
      return res.json({ ok: true });
    }

    const role = String(req.user?.role || '').toLowerCase();
    const authorRole = String(msg.author_role || '').toLowerCase();
    const isAdminLike = role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff';
    const isSchoolStaff = role === 'school_staff';
    const canDelete =
      (isAdminLike && authorRole === 'school_staff') ||
      (isSchoolStaff && Number(msg.author_user_id) === Number(req.user.id));
    if (!canDelete) return res.status(403).json({ error: { message: 'Access denied' } });

    await pool.execute(
      `UPDATE support_ticket_messages
       SET is_deleted = 1,
           deleted_at = CURRENT_TIMESTAMP,
           deleted_by_user_id = ?
       WHERE id = ? AND ticket_id = ?`,
      [req.user.id, messageId, ticketId]
    );

    // Best-effort: remove any related notification history entries.
    try {
      await pool.execute(
        `DELETE FROM notifications
         WHERE related_entity_type = 'support_ticket_message'
           AND related_entity_id = ?`,
        [messageId]
      );
    } catch {
      // ignore notification cleanup failures
    }

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const generateSupportTicketResponse = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can generate ticket responses' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(
      `SELECT t.*,
              cb.first_name AS created_by_first_name,
              cb.last_name AS created_by_last_name,
              cb.email AS created_by_email,
              s.name AS school_name
       FROM support_tickets t
       LEFT JOIN users cb ON cb.id = t.created_by_user_id
       LEFT JOIN agencies s ON s.id = t.school_organization_id
       WHERE t.id = ?
       LIMIT 1`,
      [ticketId]
    );
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (ticket.client_id) {
      const okClient = await ensureClientInOrg({
        clientId: ticket.client_id,
        schoolOrganizationId: ticket.school_organization_id
      });
      if (!okClient.ok) return res.status(okClient.status).json({ error: { message: okClient.message } });
    }

    const createdByName = [ticket.created_by_first_name, ticket.created_by_last_name].filter(Boolean).join(' ').trim();
    const ticketContext = {
      ...ticket,
      created_by_name: createdByName
    };

    let client = null;
    if (ticket.client_id) {
      try {
        client = await Client.findById(ticket.client_id, { includeSensitive: true });
      } catch {
        client = null;
      }
    }

    let messages = [];
    if (await hasSupportTicketMessagesTable()) {
      const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
      const [mRows] = await pool.execute(
        `SELECT m.*,
                u.first_name AS author_first_name,
                u.last_name AS author_last_name
         FROM support_ticket_messages m
         LEFT JOIN users u ON u.id = m.author_user_id
         WHERE m.ticket_id = ?
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 8`,
        [ticketId]
      );
      const raw = Array.isArray(mRows) ? mRows : [];
      const filtered = hasSoftDelete
        ? raw.filter((m) => !(m?.is_deleted === 1 || m?.is_deleted === true))
        : raw;
      messages = filtered.reverse().map((m) => ({
        ...m,
        author_name: [m.author_first_name, m.author_last_name].filter(Boolean).join(' ').trim()
      }));
    }

    let notes = [];
    if (ticket.client_id) {
      try {
        const roleNorm = String(req.user?.role || '').toLowerCase();
        const canViewInternalNotes = ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm);
        const list = await ClientNotes.findByClientId(ticket.client_id, {
          hasAgencyAccess: true,
          canViewInternalNotes
        });
        notes = Array.isArray(list) ? list.slice(0, 5) : [];
      } catch {
        notes = [];
      }
    }

    let recentTickets = [];
    if (ticket.client_id) {
      try {
        const [tRows] = await pool.execute(
          `SELECT id, subject, status, created_at
           FROM support_tickets
           WHERE client_id = ?
             AND id <> ?
           ORDER BY created_at DESC
           LIMIT 5`,
          [ticket.client_id, ticketId]
        );
        recentTickets = Array.isArray(tRows) ? tRows : [];
      } catch {
        recentTickets = [];
      }
    }

    const prompt = buildSupportTicketResponsePrompt({
      ticket: ticketContext,
      client,
      messages,
      notes,
      recentTickets
    });

    const { text, modelName, provider, latencyMs } = await callGeminiText({
      prompt,
      temperature: 0.2,
      maxOutputTokens: 800
    });

    res.json({
      suggestedAnswer: String(text || '').trim(),
      modelName,
      provider,
      latencyMs
    });
  } catch (e) {
    next(e);
  }
};

export const reviewSupportTicketDraft = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can review ticket drafts' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const state = String(req.body?.state || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim();
    if (!['accepted', 'edited', 'rejected', 'needs_review'].includes(state)) {
      return res.status(400).json({ error: { message: 'state must be accepted, edited, rejected, or needs_review' } });
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    await pool.execute(
      `UPDATE support_tickets
       SET ai_draft_review_state = ?,
           ai_draft_review_note = ?,
           ai_draft_reviewed_by_user_id = ?,
           ai_draft_reviewed_at = CURRENT_TIMESTAMP,
           approved_by_user_id = CASE
             WHEN ? IN ('accepted', 'edited') THEN ?
             ELSE approved_by_user_id
           END
       WHERE id = ?`,
      [state, note || null, req.user.id, state, req.user.id, ticketId]
    );

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const markSupportTicketDraftSent = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can mark draft tickets sent' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const note = String(req.body?.note || '').trim();
    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    await pool.execute(
      `UPDATE support_tickets
       SET sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
           approved_by_user_id = COALESCE(approved_by_user_id, ?),
           ai_draft_review_state = CASE
             WHEN COALESCE(ai_draft_review_state, '') = '' THEN 'accepted'
             ELSE ai_draft_review_state
           END,
           ai_draft_review_note = CASE
             WHEN ? <> '' THEN ?
             ELSE ai_draft_review_note
           END,
           ai_draft_reviewed_by_user_id = COALESCE(ai_draft_reviewed_by_user_id, ?),
           ai_draft_reviewed_at = COALESCE(ai_draft_reviewed_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [req.user.id, note, note, req.user.id, ticketId]
    );

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const answerSupportTicket = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req)) {
      return res.status(403).json({ error: { message: 'Only admin/support can answer support tickets' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const answer = String(req.body?.answer || '').trim();
    const status = req.body?.status ? String(req.body.status).trim().toLowerCase() : 'answered';
    const closeOnRead = req.body?.closeOnRead === true || req.body?.closeOnRead === 1 || req.body?.closeOnRead === '1';
    const aiDraftDecisionRaw = String(req.body?.aiDraftDecision || '').trim().toLowerCase();
    const aiDraftDecision = ['accepted', 'edited', 'rejected', 'needs_review'].includes(aiDraftDecisionRaw)
      ? aiDraftDecisionRaw
      : null;
    const aiDraftReviewNote = String(req.body?.aiDraftReviewNote || '').trim();
    if (!answer) return res.status(400).json({ error: { message: 'answer is required' } });
    if (!['answered', 'closed', 'open'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be open, answered, or closed' } });
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Enforce ownership:
    // - If already claimed by another user, block answering.
    // - If unclaimed, auto-claim to the current user.
    const claimedBy = ticket.claimed_by_user_id ? Number(ticket.claimed_by_user_id) : null;
    if (claimedBy && claimedBy !== Number(req.user.id)) {
      return res.status(409).json({ error: { message: 'Ticket is already claimed by another team member' } });
    }

    if (!claimedBy) {
      try {
        const [claimResult] = await pool.execute(
          `UPDATE support_tickets
           SET claimed_by_user_id = ?, claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP)
           WHERE id = ? AND claimed_by_user_id IS NULL`,
          [req.user.id, ticketId]
        );
        if ((claimResult?.affectedRows || 0) === 0) {
          // Someone else claimed in between; re-check
          const [r2] = await pool.execute(`SELECT claimed_by_user_id FROM support_tickets WHERE id = ?`, [ticketId]);
          const nowClaimed = r2?.[0]?.claimed_by_user_id ? Number(r2[0].claimed_by_user_id) : null;
          if (nowClaimed && nowClaimed !== Number(req.user.id)) {
            return res.status(409).json({ error: { message: 'Ticket was just claimed by another team member' } });
          }
        }
      } catch {
        // Best-effort; continue
      }
    }

    const hasCloseOnRead = await hasSupportTicketsCloseOnReadColumn();
    if (hasCloseOnRead) {
      await pool.execute(
        `UPDATE support_tickets
         SET answer = ?, status = ?, answered_by_user_id = ?, answered_at = CURRENT_TIMESTAMP, close_on_read = ?
         WHERE id = ?`,
        [answer, status, req.user.id, closeOnRead ? 1 : 0, ticketId]
      );
    } else {
      await pool.execute(
        `UPDATE support_tickets
         SET answer = ?, status = ?, answered_by_user_id = ?, answered_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [answer, status, req.user.id, ticketId]
      );
    }

    // Record AI draft review state when this ticket has a draft.
    if (ticket?.ai_draft_response) {
      const normalizedDraft = String(ticket.ai_draft_response || '').trim();
      const normalizedAnswer = String(answer || '').trim();
      const inferredDecision = normalizedDraft && normalizedDraft === normalizedAnswer ? 'accepted' : 'edited';
      const finalDecision = aiDraftDecision || inferredDecision;
      await pool.execute(
        `UPDATE support_tickets
         SET ai_draft_review_state = ?,
             ai_draft_review_note = ?,
             ai_draft_reviewed_by_user_id = ?,
             ai_draft_reviewed_at = CURRENT_TIMESTAMP,
             approved_by_user_id = CASE
               WHEN ? IN ('accepted', 'edited') THEN ?
               ELSE approved_by_user_id
             END
         WHERE id = ?`,
        [finalDecision, aiDraftReviewNote || null, req.user.id, finalDecision, req.user.id, ticketId]
      );
    }

    // Best-effort: store an AI summary when closing.
    if (status === 'closed') {
      try {
        const summary = await maybeGenerateGeminiSummary({ question: ticket?.question || '', answer });
        if (summary) {
          await pool.execute(`UPDATE support_tickets SET ai_summary = ? WHERE id = ?`, [summary, ticketId]);
        }
      } catch {
        // ignore; best-effort only
      }
    }

    // Best-effort: also append the answer as a message in the thread (when enabled).
    try {
      if (await hasSupportTicketMessagesTable()) {
        await pool.execute(
          `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
           VALUES (?, NULL, ?, ?, ?)`,
          [ticketId, req.user.id, String(req.user?.role || ''), answer]
        );
      }
    } catch {
      // best-effort only
    }

    const [rows2] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(rows2?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const claimSupportTicket = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canClaim = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
    if (!canClaim) {
      return res.status(403).json({ error: { message: 'Only staff/admin/support can claim support tickets' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const claimedBy = ticket.claimed_by_user_id ? Number(ticket.claimed_by_user_id) : null;
    if (claimedBy && claimedBy !== Number(req.user.id)) {
      return res.status(409).json({ error: { message: 'Ticket is already claimed by another team member' } });
    }
    if (claimedBy === Number(req.user.id)) {
      const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
      return res.json(out?.[0] || null);
    }

    const [result] = await pool.execute(
      `UPDATE support_tickets
       SET claimed_by_user_id = ?, claimed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND claimed_by_user_id IS NULL`,
      [req.user.id, ticketId]
    );

    if ((result?.affectedRows || 0) === 0) {
      return res.status(409).json({ error: { message: 'Ticket was just claimed by another team member' } });
    }

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const unclaimSupportTicket = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canUnclaim = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
    if (!canUnclaim) {
      return res.status(403).json({ error: { message: 'Only staff/admin/support can unclaim support tickets' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const claimedBy = ticket.claimed_by_user_id ? Number(ticket.claimed_by_user_id) : null;
    if (!claimedBy) {
      const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
      return res.json(out?.[0] || null);
    }

    // Only the current claimant can unclaim, except super_admin who can unassign for ops.
    if (claimedBy !== Number(req.user.id) && !isSuperAdmin(req)) {
      return res.status(403).json({ error: { message: 'Only the current claimant can unclaim this ticket' } });
    }

    await pool.execute(
      `UPDATE support_tickets
       SET claimed_by_user_id = NULL,
           claimed_at = NULL
       WHERE id = ?`,
      [ticketId]
    );

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const listSupportTicketAssignees = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const role = String(req.user?.role || '').toLowerCase();
    const canView = isAgencyAdminUser(req) || role === 'super_admin';
    if (!canView) return res.status(403).json({ error: { message: 'Access denied' } });

    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.role
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role, '')) IN ('admin','support','staff')
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );
    res.json({ users: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const assignSupportTicket = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canAssign = isAgencyAdminUser(req) || role === 'super_admin';
    if (!canAssign) return res.status(403).json({ error: { message: 'Only admin/support can assign tickets' } });

    const ticketId = parseInt(req.params.id, 10);
    const assigneeId = req.body?.assigneeUserId ? parseInt(req.body.assigneeUserId, 10) : null;
    if (!ticketId || !assigneeId) return res.status(400).json({ error: { message: 'ticket id and assigneeUserId are required' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    await pool.execute(
      `UPDATE support_tickets
       SET claimed_by_user_id = ?, claimed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assigneeId, ticketId]
    );

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const closeSupportTicket = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canClose = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin';
    if (!canClose) return res.status(403).json({ error: { message: 'Only staff/admin/support can close tickets' } });

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    await pool.execute(
      `UPDATE support_tickets
       SET status = 'closed',
           answered_by_user_id = ?,
           answered_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, ticketId]
    );

    // Best-effort: append closure note to thread.
    try {
      if (await hasSupportTicketMessagesTable()) {
        await pool.execute(
          `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
           VALUES (?, NULL, ?, ?, ?)`,
          [ticketId, req.user.id, String(req.user?.role || ''), 'Ticket closed']
        );
      }
    } catch {
      // ignore
    }

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(out?.[0] || null);
  } catch (e) {
    next(e);
  }
};

