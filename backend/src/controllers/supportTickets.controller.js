import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import Notification from '../models/Notification.model.js';
import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import { callGeminiText } from '../services/geminiText.service.js';
import { sendNotificationEmail } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import { isCategoryEnabledForUser } from '../services/notificationDispatcher.service.js';
import {
  isSupervisorActor,
  supervisorHasSuperviseeInSchool,
  supervisorCanAccessClientInOrg
} from '../utils/supervisorSchoolAccess.js';
import { supportTicketSourceLabel } from '../constants/supportTicketSources.js';
import {
  decryptTicketMessageRow,
  decryptTicketRow,
  prepareEncryptedTicketText,
  ticketDisplayStatus
} from '../utils/supportTicketCrypto.js';
import { allowedTopicsForCreatorRole, normalizeTicketTopic } from '../utils/ticketTopics.js';

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

async function hasSupportTicketEncryptionColumns() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages' AND COLUMN_NAME = 'body_ciphertext'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketPriorityColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'priority'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketTargetScopeColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'target_scope'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketTopicColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'topic'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketPlatformHelpColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'requests_platform_help'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Specialized topics are visible to admins + users with the matching responsibility flag
 * for that ticket's agency. General is visible to all queue collaborators in scope.
 */
async function applyTopicAudienceVisibility({ req, where, params, topicFilter = null }) {
  if (!(await hasSupportTicketTopicColumn())) return;

  const filter = topicFilter ? normalizeTicketTopic(topicFilter) : null;
  if (filter) {
    where.push(`LOWER(COALESCE(t.topic, 'general')) = ?`);
    params.push(filter);
  }

  const role = String(req.user?.role || '').toLowerCase();
  // Admin / super_admin see every topic in their agency/platform scope.
  if (role === 'super_admin' || role === 'admin') return;

  const uid = Number(req.user?.id || 0);
  if (!uid) {
    where.push(`LOWER(COALESCE(t.topic, 'general')) = 'general'`);
    return;
  }

  const [billingIds, payrollIds, credIds] = await Promise.all([
    User.listBillingAgencyIds(uid),
    User.listPayrollAgencyIds(uid),
    User.listCredentialingAgencyIds(uid)
  ]);

  // Creators/claimants always see their own tickets; specialized topics need flags.
  const parts = [
    `LOWER(COALESCE(t.topic, 'general')) = 'general'`,
    `t.created_by_user_id = ?`,
    `t.claimed_by_user_id = ?`
  ];
  params.push(uid, uid);
  if ((billingIds || []).length) {
    parts.push(
      `(LOWER(COALESCE(t.topic, '')) = 'billing' AND t.agency_id IN (${billingIds.map(() => '?').join(',')}))`
    );
    params.push(...billingIds.map((n) => Number(n)));
  }
  if ((payrollIds || []).length) {
    parts.push(
      `(LOWER(COALESCE(t.topic, '')) = 'payroll' AND t.agency_id IN (${payrollIds.map(() => '?').join(',')}))`
    );
    params.push(...payrollIds.map((n) => Number(n)));
  }
  if ((credIds || []).length) {
    parts.push(
      `(LOWER(COALESCE(t.topic, '')) = 'credentialing' AND t.agency_id IN (${credIds.map(() => '?').join(',')}))`
    );
    params.push(...credIds.map((n) => Number(n)));
  }
  where.push(`(${parts.join(' OR ')})`);
}

/** Specialized topics: admin always; others need matching responsibility flag (or be creator/claimant). */
async function actorCanAccessTicketTopic(req, ticket) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'admin') return true;
  const uid = Number(req.user?.id || 0);
  if (!uid) return false;
  if (Number(ticket?.created_by_user_id || 0) === uid) return true;
  if (Number(ticket?.claimed_by_user_id || 0) === uid) return true;
  if (!(await hasSupportTicketTopicColumn())) return true;

  const topic = normalizeTicketTopic(ticket?.topic);
  if (topic === 'general') return true;

  const aid = Number(ticket?.agency_id || 0);
  if (!aid) return false;

  if (topic === 'billing') {
    const ids = await User.listBillingAgencyIds(uid);
    return (ids || []).map(Number).includes(aid);
  }
  if (topic === 'payroll') {
    const ids = await User.listPayrollAgencyIds(uid);
    return (ids || []).map(Number).includes(aid);
  }
  if (topic === 'credentialing') {
    const ids = await User.listCredentialingAgencyIds(uid);
    return (ids || []).map(Number).includes(aid);
  }
  return true;
}

async function userHasPlatformSupport(userId) {
  const uid = Number(userId || 0);
  if (!uid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT has_platform_support FROM users WHERE id = ? LIMIT 1`,
      [uid]
    );
    const v = rows?.[0]?.has_platform_support;
    return v === 1 || v === true || v === '1';
  } catch {
    return false;
  }
}

async function actorCanAccessPlatformSupportQueue(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  return userHasPlatformSupport(req.user?.id);
}

async function hasSupportTicketMessageInternalColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages' AND COLUMN_NAME = 'is_internal'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

function enrichTicketForClient(ticket) {
  const decrypted = decryptTicketRow(ticket);
  return {
    ...decrypted,
    display_status: ticketDisplayStatus(decrypted),
    priority: decrypted.priority || 'medium'
  };
}

async function insertTicketMessageRow({
  ticketId,
  parentId,
  authorUserId,
  authorRole,
  body,
  isInternal = false
}) {
  const hasEnc = await hasSupportTicketEncryptionColumns();
  const hasInternal = await hasSupportTicketMessageInternalColumn();
  const enc = hasEnc ? prepareEncryptedTicketText(body) : { plain: body, ciphertext: null, iv: null, authTag: null, keyId: null };

  if (hasEnc && hasInternal) {
    await pool.execute(
      `INSERT INTO support_ticket_messages
         (ticket_id, parent_message_id, author_user_id, author_role, body, is_internal,
          body_ciphertext, body_iv, body_auth_tag, encryption_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketId,
        parentId,
        authorUserId,
        authorRole,
        enc.plain,
        isInternal ? 1 : 0,
        enc.ciphertext,
        enc.iv,
        enc.authTag,
        enc.keyId
      ]
    );
    return;
  }
  if (hasEnc) {
    await pool.execute(
      `INSERT INTO support_ticket_messages
         (ticket_id, parent_message_id, author_user_id, author_role, body,
          body_ciphertext, body_iv, body_auth_tag, encryption_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, parentId, authorUserId, authorRole, enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId]
    );
    return;
  }
  if (hasInternal) {
    await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body, is_internal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ticketId, parentId, authorUserId, authorRole, body, isInternal ? 1 : 0]
    );
    return;
  }
  await pool.execute(
    `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
     VALUES (?, ?, ?, ?, ?)`,
    [ticketId, parentId, authorUserId, authorRole, body]
  );
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
    // Platform support team may work tickets filed from any tenant.
    if (await userHasPlatformSupport(req.user?.id)) {
      return { ok: true, org, schoolOrganizationId: sid, platformSupport: true };
    }
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

async function listAgencySupportRecipients({ agencyId, topic = 'general' }) {
  const aid = parseInt(agencyId, 10);
  if (!aid) return [];
  const t = normalizeTicketTopic(topic);
  // Always include admins. For specialized topics, also include flagged responsibility holders.
  let flagSql = '';
  if (t === 'billing') flagSql = ' OR COALESCE(ua.has_billing_access, 0) = 1';
  else if (t === 'payroll') flagSql = ' OR COALESCE(ua.has_payroll_access, 0) = 1';
  else if (t === 'credentialing') flagSql = ' OR COALESCE(ua.can_manage_credentialing, 0) = 1';

  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.work_email, u.first_name, u.last_name, u.role,
            COALESCE(ua.has_billing_access, 0) AS has_billing_access,
            COALESCE(ua.has_payroll_access, 0) AS has_payroll_access,
            COALESCE(ua.can_manage_credentialing, 0) AS can_manage_credentialing
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
       AND (
         LOWER(COALESCE(u.role, '')) = 'admin'
         OR LOWER(COALESCE(u.role, '')) = 'super_admin'
         ${
           t === 'general'
             ? `OR LOWER(COALESCE(u.role, '')) IN ('support','staff','clinical_practice_assistant','provider_plus')`
             : flagSql
         }
       )`,
    [aid]
  );
  return rows || [];
}

const isAgencyAdminUser = (req) => {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

const isTicketQueueCollaboratorRole = (role) => {
  const r = String(role || '').toLowerCase().trim();
  return r === 'school_staff' || r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

const normalizeEmail = (value) => {
  const out = String(value || '').trim().toLowerCase();
  return out.includes('@') ? out : '';
};

async function isSchedulerForSchool({ userId, schoolOrganizationId, userEmail = null }) {
  const sid = Number(schoolOrganizationId || 0);
  if (!userId || !sid) return false;
  const user = await User.findById(userId);
  const emails = new Set([
    normalizeEmail(userEmail),
    normalizeEmail(user?.email),
    normalizeEmail(user?.work_email),
    normalizeEmail(user?.username),
    normalizeEmail(user?.personal_email)
  ].filter(Boolean));
  if (!emails.size) return false;
  const placeholders = Array.from(emails).map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM school_contacts
       WHERE school_organization_id = ?
         AND LOWER(TRIM(email)) IN (${placeholders})
         AND is_scheduler = 1
       LIMIT 1`,
      [sid, ...Array.from(emails)]
    );
    return !!rows?.[0];
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

async function isSchedulerForAnySchool({ userId, userEmail = null }) {
  if (!userId) return false;
  const user = await User.findById(userId);
  const emails = new Set([
    normalizeEmail(userEmail),
    normalizeEmail(user?.email),
    normalizeEmail(user?.work_email),
    normalizeEmail(user?.username),
    normalizeEmail(user?.personal_email)
  ].filter(Boolean));
  if (!emails.size) return false;
  const placeholders = Array.from(emails).map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM school_contacts
       WHERE LOWER(TRIM(email)) IN (${placeholders})
         AND is_scheduler = 1
       LIMIT 1`,
      [...Array.from(emails)]
    );
    return !!rows?.[0];
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

const canManageTicketAssignments = (req) => isTicketQueueCollaboratorRole(req.user?.role);

const formatUserDisplayName = (user, fallback = 'Someone') => {
  const first = String(user?.first_name || '').trim();
  const last = String(user?.last_name || '').trim();
  const full = [first, last].filter(Boolean).join(' ').trim();
  if (full) return full;
  const email = String(user?.email || user?.work_email || '').trim();
  if (email) return email;
  return fallback;
};

async function userCanAccessTicketOrgScope({ userId, role, schoolOrganizationId, agencyId }) {
  if (!userId) return false;
  const roleNorm = String(role || '').toLowerCase().trim();
  if (roleNorm === 'super_admin') return true;
  if (await userHasPlatformSupport(userId)) return true;

  const orgs = await User.getAgencies(userId);
  const orgIds = (orgs || [])
    .map((o) => parseInt(o?.id, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (orgIds.length === 0) return false;

  const schoolOrgIdNum = parseInt(schoolOrganizationId, 10);
  if (schoolOrgIdNum && orgIds.includes(schoolOrgIdNum)) return true;

  const ticketAgencyId = agencyId ? parseInt(agencyId, 10) : null;
  if (ticketAgencyId && orgIds.includes(ticketAgencyId)) return true;

  if (schoolOrgIdNum) {
    const parentAgencyId = await resolveActiveAgencyIdForOrg(schoolOrgIdNum);
    if (parentAgencyId && orgIds.includes(parseInt(parentAgencyId, 10))) return true;
  }

  return false;
}

async function createSupportTicketAssignmentNotification({ ticket, assigneeUser, assignedByUserId, assignedByUser }) {
  try {
    const assigneeId = Number(assigneeUser?.id || 0);
    const actorId = Number(assignedByUserId || 0);
    if (!assigneeId || !actorId) return;
    if (assigneeId === actorId) return;

    let actor = assignedByUser || null;
    if (!actor || !actor.first_name) {
      try {
        actor = await User.findById(actorId);
      } catch {
        actor = assignedByUser || null;
      }
    }
    const actorName = formatUserDisplayName(actor, `User #${actorId}`);
    const subject = String(ticket?.subject || '').trim();
    const subjectPart = subject ? ` (${subject.slice(0, 120)})` : '';
    const ticketLabel = `#${ticket?.id || '—'}${subjectPart}`;
    const agencyId = ticket?.agency_id
      ? parseInt(ticket.agency_id, 10)
      : await resolveActiveAgencyIdForOrg(ticket?.school_organization_id);

    await Notification.create({
      type: 'support_ticket_created',
      severity: 'info',
      title: 'Ticket assigned to you',
      message: `You've been assigned ticket ${ticketLabel} by ${actorName}.`,
      userId: assigneeId,
      agencyId: agencyId || null,
      relatedEntityType: 'support_ticket',
      relatedEntityId: ticket?.id || null,
      actorUserId: actorId
    });
  } catch {
    // best-effort only; assignment should still complete
  }
}

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
  if (role === 'super_admin' || isAgencyAdminUser(req)) return true;
  if (role === 'school_staff') {
    return await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({
      clientId,
      schoolOrganizationId,
      schoolStaffUserId: req.user?.id
    });
  }
  if (role === 'provider') {
    return await providerAssignedToClientInOrg({ providerUserId: req.user?.id, clientId, orgId: schoolOrganizationId });
  }
  return await canSupervisorAccessClientScope({ req, schoolOrganizationId, clientId });
}

async function getSchoolStaffTicketAccessState({ req, schoolOrganizationId, clientId }) {
  if (String(req.user?.role || '').toLowerCase() !== 'school_staff') return 'none';
  const scheduler = await isSchedulerForSchool({
    userId: req.user?.id,
    schoolOrganizationId,
    userEmail: req.user?.email || req.user?.username || null
  });
  if (scheduler) return 'limited';
  return ClientSchoolStaffRoiAccess.resolveSchoolStaffClientAccessState({
    clientId,
    schoolOrganizationId,
    schoolStaffUserId: req.user?.id
  });
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
    `- Created by: ${truncateText(
      ticket?.created_by_name ||
      ticket?.created_by_email ||
      (ticket?.created_by_source_key ? `${supportTicketSourceLabel(ticket.created_by_source_key)} (external request)` : null) ||
      `User #${ticket?.created_by_user_id || '—'}`,
      160
    )}`,
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
    res.json((rows || []).map((t) => enrichTicketForClient(t)));
  } catch (e) {
    next(e);
  }
};

async function getAccessibleTicketScopeForUser(userId, role, req) {
  const r = String(role || '').toLowerCase();
  const platform = r === 'super_admin' ? true : await userHasPlatformSupport(userId);

  // Super admin: no filter, sees all tickets platform-wide
  if (r === 'super_admin') return { agencyIds: null, schoolOrgIds: null, platform: true };

  // Middleware sets tenantAgencyIds when it resolves the tenant tree.
  // This is the primary scoping mechanism — always prefer it over any fallback.
  if (req && req.tenantAgencyIds && Array.isArray(req.tenantAgencyIds) && req.tenantAgencyIds.length > 0) {
    return { agencyIds: req.tenantAgencyIds, schoolOrgIds: [], platform };
  }

  // tenantAgencyIds was not set — resolve from the user's own agency memberships.
  // NOTE: we intentionally do NOT return null here for admin/support — that was the
  // original bug causing cross-tenant ticket leakage.
  const agencies = await User.getAgencies(userId);
  const ids = (agencies || []).map((a) => parseInt(a?.id, 10)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return { agencyIds: [], schoolOrgIds: [], platform };

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

  return { agencyIds, schoolOrgIds, platform };
}

/**
 * Apply tenant/platform visibility. Platform support agents see platform tickets
 * even with no tenant memberships; tenant admins see their own platform filings.
 */
async function applyTicketVisibilityScope({ req, role, where, params, targetScopeFilter = null, agencyIdFilter = null }) {
  const scope = await getAccessibleTicketScopeForUser(req.user.id, role, req);
  const hasTargetScope = await hasSupportTicketTargetScopeColumn();
  const wantsPlatform = String(targetScopeFilter || '').toLowerCase() === 'platform';

  if (wantsPlatform) {
    if (!hasTargetScope) {
      where.push('1 = 0');
      return scope;
    }
    const canPlatformQueue = await actorCanAccessPlatformSupportQueue(req);
    if (canPlatformQueue) {
      where.push(`LOWER(COALESCE(t.target_scope, 'tenant')) = 'platform'`);
    } else if (scope.agencyIds === null) {
      where.push(`LOWER(COALESCE(t.target_scope, 'tenant')) = 'platform'`);
    } else if ((scope.agencyIds || []).length > 0) {
      // Tenant staff: only platform tickets they filed from their agencies
      where.push(`LOWER(COALESCE(t.target_scope, 'tenant')) = 'platform'`);
      where.push(`t.agency_id IN (${scope.agencyIds.map(() => '?').join(',')})`);
      params.push(...scope.agencyIds);
    } else {
      where.push('1 = 0');
    }
    return scope;
  }

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
    if (scope.platform && hasTargetScope) {
      conditions.push(`LOWER(COALESCE(t.target_scope, 'tenant')) = 'platform'`);
    }
    if (conditions.length > 0) where.push(`(${conditions.join(' OR ')})`);
    else where.push('1 = 0');
  }

  if (agencyIdFilter && Number.isFinite(agencyIdFilter)) {
    const access = await ensureAgencyAccess(req, agencyIdFilter);
    if (!access.ok) return { ...scope, accessError: access };
    where.push('t.agency_id = ?');
    params.push(agencyIdFilter);
    if (hasTargetScope) {
      // Tenant chip: normal tenant tickets for that agency (not the platform inbox)
      where.push(`LOWER(COALESCE(t.target_scope, 'tenant')) <> 'platform'`);
    }
  } else if (hasTargetScope && !wantsPlatform && String(targetScopeFilter || '').toLowerCase() === 'tenant') {
    where.push(`LOWER(COALESCE(t.target_scope, 'tenant')) <> 'platform'`);
  }

  return scope;
}

export const listSupportTicketsQueue = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canPlatform = await actorCanAccessPlatformSupportQueue(req);
    const canView = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin' || canPlatform;
    if (!canView) {
      return res.status(403).json({ error: { message: 'Only staff/admin/support can view the support ticket queue' } });
    }

    const agencyIdFilter = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const targetScopeFilter = req.query?.targetScope ? String(req.query.targetScope).trim().toLowerCase() : null;
    const topicFilter = req.query?.topic ? String(req.query.topic).trim().toLowerCase() : null;
    const schoolOrganizationId = req.query?.schoolOrganizationId ? parseInt(req.query.schoolOrganizationId, 10) : null;
    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : null;
    const sourceChannel = req.query?.sourceChannel ? String(req.query.sourceChannel).trim().toLowerCase() : null;
    const draftState = req.query?.draftState ? String(req.query.draftState).trim().toLowerCase() : null;
    const sentState = req.query?.sentState ? String(req.query.sentState).trim().toLowerCase() : null;
    const mine = parseBool(req.query?.mine);
    const qRaw = req.query?.q ? String(req.query.q) : '';
    const q = qRaw.trim().slice(0, 120);
    const limitRaw = req.query?.limit ? parseInt(req.query.limit, 10) : 200;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 200;

    const where = [];
    const params = [];
    const schedulerOwnOnly = role === 'school_staff'
      ? await isSchedulerForAnySchool({ userId: req.user?.id, userEmail: req.user?.email || req.user?.username || null })
      : false;

    const scope = await applyTicketVisibilityScope({
      req,
      role,
      where,
      params,
      targetScopeFilter,
      agencyIdFilter: Number.isFinite(agencyIdFilter) ? agencyIdFilter : null
    });
    if (scope?.accessError) {
      return res.status(scope.accessError.status).json({ error: { message: scope.accessError.message } });
    }

    // Org escalations have their own desk — keep them out of the general ticket queue
    // unless explicitly requested via ticketKind=escalation|all.
    const ticketKindFilter = req.query?.ticketKind ? String(req.query.ticketKind).trim().toLowerCase() : 'support';
    try {
      const [kindCols] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'ticket_kind'`
      );
      if (Number(kindCols?.[0]?.cnt || 0) > 0) {
        if (ticketKindFilter === 'escalation') {
          where.push(`COALESCE(t.ticket_kind, 'support') = 'escalation'`);
        } else if (ticketKindFilter !== 'all') {
          where.push(`COALESCE(t.ticket_kind, 'support') <> 'escalation'`);
        }
      }
    } catch {
      /* ignore */
    }

    await applyTopicAudienceVisibility({ req, where, params, topicFilter });

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
    if (schedulerOwnOnly) {
      where.push('t.created_by_user_id = ?');
      params.push(req.user.id);
    }

    // Search subject + school only (question may be encrypted at rest)
    if (q) {
      where.push('(t.subject LIKE ? OR s.name LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like);
    }

    const priorityFilter = req.query?.priority ? String(req.query.priority).trim().toLowerCase() : '';
    if (priorityFilter && ['low', 'medium', 'high'].includes(priorityFilter) && (await hasSupportTicketPriorityColumn())) {
      where.push('LOWER(COALESCE(t.priority, \'medium\')) = ?');
      params.push(priorityFilter);
    }

    const creatorRole = req.query?.creatorRole ? String(req.query.creatorRole).trim().toLowerCase() : '';
    if (creatorRole === 'client_guardian' || creatorRole === 'guardian') {
      where.push("LOWER(COALESCE(cb.role, '')) = 'client_guardian'");
    } else if (creatorRole === 'school_staff') {
      where.push("LOWER(COALESCE(cb.role, '')) = 'school_staff'");
    }

    const displayStatus = req.query?.displayStatus ? String(req.query.displayStatus).trim().toLowerCase() : '';
    if (displayStatus === 'open') {
      where.push("LOWER(t.status) = 'open' AND t.claimed_by_user_id IS NULL");
    } else if (displayStatus === 'in_progress') {
      where.push("LOWER(t.status) = 'open' AND t.claimed_by_user_id IS NOT NULL");
    } else if (displayStatus === 'waiting') {
      where.push("LOWER(t.status) = 'answered'");
    } else if (displayStatus === 'closed') {
      where.push("LOWER(t.status) = 'closed'");
    }

    const sql = `
      SELECT t.*,
             cb.first_name AS created_by_first_name,
             cb.last_name AS created_by_last_name,
             cb.email AS created_by_email,
             cb.role AS created_by_role,
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
      LIMIT ${limit}
    `;

    const [rows] = await pool.execute(sql, params);
    const tickets = Array.isArray(rows) ? rows : [];
    const createdByScope = new Map();
    await Promise.all(
      tickets.map(async (ticket) => {
        const clientId = Number(ticket?.client_id || 0);
        const schoolOrgId = Number(ticket?.school_organization_id || 0);
        const creatorId = Number(ticket?.created_by_user_id || 0);
        const creatorRole = String(ticket?.created_by_role || '').toLowerCase();
        if (!clientId || !schoolOrgId || !creatorId || creatorRole !== 'school_staff') {
          createdByScope.set(Number(ticket?.id || 0), 'n/a');
          return;
        }
        const key = `${clientId}:${schoolOrgId}:${creatorId}`;
        if (!createdByScope.has(key)) {
          const state = await ClientSchoolStaffRoiAccess.resolveSchoolStaffClientAccessState({
            clientId,
            schoolOrganizationId: schoolOrgId,
            schoolStaffUserId: creatorId
          });
          createdByScope.set(key, state);
        }
        createdByScope.set(Number(ticket?.id || 0), createdByScope.get(key));
      })
    );
    res.json(tickets.map((ticket) => {
      const senderRoiAccessState = createdByScope.get(Number(ticket?.id || 0)) || 'n/a';
      const enriched = enrichTicketForClient(ticket);
      return {
        ...enriched,
        sender_roi_access_state: senderRoiAccessState,
        sender_is_limited: senderRoiAccessState === 'limited'
      };
    }));
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
    const schedulerOwnOnly = role === 'school_staff'
      ? await isSchedulerForAnySchool({ userId: req.user?.id, userEmail: req.user?.email || req.user?.username || null })
      : false;

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
    if (schedulerOwnOnly) {
      where.push('t.created_by_user_id = ?');
      params.push(req.user.id);
    }

    await applyTopicAudienceVisibility({ req, where, params });

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

/**
 * Desk metric cards: open / in_progress / waiting / closed_today
 * GET /api/support-tickets/metrics?agencyId=
 */
export const getSupportTicketsMetrics = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canPlatform = await actorCanAccessPlatformSupportQueue(req);
    const canView = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin' || canPlatform;
    if (!canView) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencyIdFilter = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const targetScopeFilter = req.query?.targetScope ? String(req.query.targetScope).trim().toLowerCase() : null;
    const where = [];
    const params = [];
    const scope = await applyTicketVisibilityScope({
      req,
      role,
      where,
      params,
      targetScopeFilter,
      agencyIdFilter: Number.isFinite(agencyIdFilter) ? agencyIdFilter : null
    });
    if (scope?.accessError) {
      return res.status(scope.accessError.status).json({ error: { message: scope.accessError.message } });
    }

    await applyTopicAudienceVisibility({ req, where, params });

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT
         SUM(CASE WHEN LOWER(t.status) = 'open' AND t.claimed_by_user_id IS NULL THEN 1 ELSE 0 END) AS open_cnt,
         SUM(CASE WHEN LOWER(t.status) = 'open' AND t.claimed_by_user_id IS NOT NULL THEN 1 ELSE 0 END) AS in_progress_cnt,
         SUM(CASE WHEN LOWER(t.status) = 'answered' THEN 1 ELSE 0 END) AS waiting_cnt,
         SUM(CASE WHEN LOWER(t.status) = 'closed' AND DATE(t.updated_at) = CURDATE() THEN 1 ELSE 0 END) AS closed_today_cnt
       FROM support_tickets t
       ${whereSql}`,
      params
    );
    const r = rows?.[0] || {};
    res.json({
      open: Number(r.open_cnt || 0),
      in_progress: Number(r.in_progress_cnt || 0),
      waiting: Number(r.waiting_cnt || 0),
      closed_today: Number(r.closed_today_cnt || 0)
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Per-tenant open + mine counts for the ticket desk tenant switcher.
 * GET /api/support-tickets/counts-by-agency
 * → { agencies: [{ agencyId, open, mine }], totals: { open, mine } }
 *
 * open = status open (queue workload)
 * mine = claimed by current user and not closed
 */
export const getSupportTicketsCountsByAgency = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const canPlatform = await actorCanAccessPlatformSupportQueue(req);
    const canView = role === 'school_staff' || isAgencyAdminUser(req) || role === 'super_admin' || canPlatform;
    if (!canView) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const where = [];
    const params = [];
    const schedulerOwnOnly = role === 'school_staff'
      ? await isSchedulerForAnySchool({ userId: req.user?.id, userEmail: req.user?.email || req.user?.username || null })
      : false;
    const hasTargetScope = await hasSupportTicketTargetScopeColumn();

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
      if (conditions.length > 0) where.push(`(${conditions.join(' OR ')})`);
      else where.push('1 = 0');
    }

    if (schedulerOwnOnly) {
      where.push('t.created_by_user_id = ?');
      params.push(req.user.id);
    }

    // Per-tenant chips count tenant-queue tickets only (platform has its own chip).
    if (hasTargetScope) {
      where.push(`LOWER(COALESCE(t.target_scope, 'tenant')) <> 'platform'`);
    }

    await applyTopicAudienceVisibility({ req, where, params });

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const uid = Number(req.user.id);
    const [rows] = await pool.execute(
      `SELECT
         t.agency_id AS agencyId,
         SUM(CASE WHEN LOWER(t.status) = 'open' THEN 1 ELSE 0 END) AS open_cnt,
         SUM(
           CASE
             WHEN t.claimed_by_user_id = ? AND LOWER(COALESCE(t.status, '')) <> 'closed'
             THEN 1 ELSE 0
           END
         ) AS mine_cnt
       FROM support_tickets t
       ${whereSql}
       GROUP BY t.agency_id`,
      [uid, ...params]
    );

    const agencies = (rows || [])
      .map((r) => ({
        agencyId: Number(r.agencyId || 0),
        open: Number(r.open_cnt || 0),
        mine: Number(r.mine_cnt || 0)
      }))
      .filter((r) => r.agencyId > 0);

    const totals = agencies.reduce(
      (acc, row) => {
        acc.open += row.open;
        acc.mine += row.mine;
        return acc;
      },
      { open: 0, mine: 0 }
    );

    let platform = { open: 0, mine: 0 };
    if (hasTargetScope && (canPlatform || role === 'super_admin' || isAgencyAdminUser(req))) {
      const pWhere = [`LOWER(COALESCE(t.target_scope, 'tenant')) = 'platform'`];
      const pParams = [];
      if (!canPlatform && role !== 'super_admin' && scope.agencyIds !== null) {
        if ((scope.agencyIds || []).length) {
          pWhere.push(`t.agency_id IN (${scope.agencyIds.map(() => '?').join(',')})`);
          pParams.push(...scope.agencyIds);
        } else {
          pWhere.push('1 = 0');
        }
      }
      const [pRows] = await pool.execute(
        `SELECT
           SUM(CASE WHEN LOWER(t.status) = 'open' THEN 1 ELSE 0 END) AS open_cnt,
           SUM(
             CASE
               WHEN t.claimed_by_user_id = ? AND LOWER(COALESCE(t.status, '')) <> 'closed'
               THEN 1 ELSE 0
             END
           ) AS mine_cnt
         FROM support_tickets t
         WHERE ${pWhere.join(' AND ')}`,
        [uid, ...pParams]
      );
      platform = {
        open: Number(pRows?.[0]?.open_cnt || 0),
        mine: Number(pRows?.[0]?.mine_cnt || 0)
      };
    }

    res.json({ agencies, totals, platform });
  } catch (e) {
    next(e);
  }
};

export const updateSupportTicketPriority = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req) && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only admin/support can update priority' } });
    }
    if (!(await hasSupportTicketPriorityColumn())) {
      return res.status(409).json({ error: { message: 'Priority not enabled (run migration 1002)' } });
    }
    const ticketId = parseInt(req.params.id, 10);
    const priority = String(req.body?.priority || '').trim().toLowerCase();
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });
    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: { message: 'priority must be low, medium, or high' } });
    }
    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });
    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    await pool.execute(`UPDATE support_tickets SET priority = ? WHERE id = ?`, [priority, ticketId]);
    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(enrichTicketForClient(out?.[0] || ticket));
  } catch (e) {
    next(e);
  }
};

/**
 * Tenant admin/support → Plot Twist HQ platform support team (direct).
 * Providers/staff must use tenant tickets with requestsPlatformHelp; admins escalate.
 * POST /api/support-tickets/platform
 * Body: { agencyId, subject?, question, priority? }
 */
export const createPlatformSupportTicket = async (req, res, next) => {
  try {
    if (!(await hasSupportTicketTargetScopeColumn())) {
      return res.status(409).json({ error: { message: 'Platform tickets require migration 1005' } });
    }
    const role = String(req.user?.role || '').toLowerCase();
    // Only tenant admin/support (or superadmin) may file directly to HQ.
    // has_platform_support works the queue; it does not grant filing from a tenant.
    const canFile = role === 'super_admin' || role === 'admin' || role === 'support';
    if (!canFile) {
      return res.status(403).json({
        error: {
          message:
            'Only organization admin/support can contact platform support directly. Providers: submit a product-help request to your admin team.'
        }
      });
    }

    const agencyId = parseInt(req.body?.agencyId ?? req.body?.agency_id, 10);
    const subject = req.body?.subject ? String(req.body.subject).trim().slice(0, 255) : 'Platform support request';
    const question = String(req.body?.question || '').trim();
    if (!agencyId || !question) {
      return res.status(400).json({ error: { message: 'agencyId and question are required' } });
    }
    if (role !== 'super_admin') {
      const access = await ensureAgencyAccess(req, agencyId);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    }

    const hasEnc = await hasSupportTicketEncryptionColumns();
    const hasPriority = await hasSupportTicketPriorityColumn();
    const qEnc = hasEnc ? prepareEncryptedTicketText(question) : { plain: question, ciphertext: null, iv: null, authTag: null, keyId: null };
    const priorityRaw = String(req.body?.priority || 'medium').trim().toLowerCase();
    const priority = ['low', 'medium', 'high'].includes(priorityRaw) ? priorityRaw : 'medium';

    // Root tenant id doubles as school_organization_id (agencies table holds all org types).
    let result;
    if (hasEnc && hasPriority) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority, target_scope,
           question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id, source_channel)
         VALUES (?, NULL, ?, ?, ?, ?, 'open', ?, 'platform', ?, ?, ?, ?, 'portal')`,
        [
          agencyId,
          req.user.id,
          agencyId,
          subject,
          qEnc.plain,
          priority,
          qEnc.ciphertext,
          qEnc.iv,
          qEnc.authTag,
          qEnc.keyId
        ]
      );
    } else if (hasPriority) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority, target_scope, source_channel)
         VALUES (?, NULL, ?, ?, ?, ?, 'open', ?, 'platform', 'portal')`,
        [agencyId, req.user.id, agencyId, subject, question, priority]
      );
    } else {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, target_scope, source_channel)
         VALUES (?, NULL, ?, ?, ?, ?, 'open', 'platform', 'portal')`,
        [agencyId, req.user.id, agencyId, subject, question]
      );
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [result.insertId]);
    const created = enrichTicketForClient(rows?.[0] || null);

    try {
      if (created?.id && (await hasSupportTicketMessagesTable())) {
        await insertTicketMessageRow({
          ticketId: created.id,
          parentId: null,
          authorUserId: req.user.id,
          authorRole: String(req.user?.role || ''),
          body: question,
          isInternal: false
        });
      }
    } catch {
      /* ignore */
    }

    // Notify platform support team + super_admins (best-effort)
    try {
      const [recipients] = await pool.execute(
        `SELECT id FROM users
         WHERE (is_archived = FALSE OR is_archived IS NULL)
           AND (
             LOWER(role) = 'super_admin'
             OR has_platform_support = 1
           )`
      );
      for (const r of recipients || []) {
        const uid = Number(r.id);
        if (!uid || uid === Number(req.user.id)) continue;
        try {
          await Notification.create({
            type: 'support_ticket_created',
            severity: 'info',
            title: 'New platform support ticket',
            message: subject || 'Platform support request',
            userId: uid,
            agencyId: agencyId || null,
            relatedEntityType: 'support_ticket',
            relatedEntityId: created.id,
            actorUserId: req.user.id
          });
        } catch {
          /* ignore per-recipient */
        }
      }
    } catch {
      /* ignore */
    }

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

/**
 * Tenant admin/support escalates an existing tenant ticket to Plot Twist HQ.
 * POST /api/support-tickets/:id/escalate-to-platform
 * Body: { note? }
 */
export const escalateSupportTicketToPlatform = async (req, res, next) => {
  try {
    if (!(await hasSupportTicketTargetScopeColumn())) {
      return res.status(409).json({ error: { message: 'Platform tickets require migration 1005' } });
    }
    const role = String(req.user?.role || '').toLowerCase();
    if (!['super_admin', 'admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Only organization admin/support can escalate to platform' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const currentScope = String(ticket.target_scope || 'tenant').toLowerCase();
    if (currentScope === 'platform') {
      return res.status(409).json({ error: { message: 'Ticket is already in the platform queue' } });
    }

    const note = req.body?.note ? String(req.body.note).trim().slice(0, 2000) : '';
    const hasHelpCols = await hasSupportTicketPlatformHelpColumn();

    if (hasHelpCols) {
      await pool.execute(
        `UPDATE support_tickets
         SET target_scope = 'platform',
             escalated_to_platform_at = CURRENT_TIMESTAMP,
             escalated_to_platform_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [req.user.id, ticketId]
      );
    } else {
      await pool.execute(
        `UPDATE support_tickets
         SET target_scope = 'platform',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [ticketId]
      );
    }

    try {
      if (await hasSupportTicketMessagesTable()) {
        const actorName =
          [req.user?.first_name, req.user?.last_name].filter(Boolean).join(' ').trim() ||
          req.user?.email ||
          'Admin';
        const body = note
          ? `Escalated to Plot Twist HQ platform support by ${actorName}.\n\nNote: ${note}`
          : `Escalated to Plot Twist HQ platform support by ${actorName}.`;
        await insertTicketMessageRow({
          ticketId,
          parentId: null,
          authorUserId: req.user.id,
          authorRole: role,
          body,
          isInternal: true
        });
      }
    } catch {
      /* best-effort */
    }

    try {
      const [recipients] = await pool.execute(
        `SELECT id FROM users
         WHERE (is_archived = FALSE OR is_archived IS NULL)
           AND (
             LOWER(role) = 'super_admin'
             OR has_platform_support = 1
           )`
      );
      const title = 'Ticket escalated to platform';
      const message = ticket.subject || `Ticket #${ticketId}`;
      for (const r of recipients || []) {
        const uid = Number(r.id);
        if (!uid || uid === Number(req.user.id)) continue;
        try {
          await Notification.create({
            type: 'support_ticket_created',
            severity: 'info',
            title,
            message,
            userId: uid,
            agencyId: ticket.agency_id || null,
            relatedEntityType: 'support_ticket',
            relatedEntityId: ticketId,
            actorUserId: req.user.id
          });
        } catch {
          /* per-recipient */
        }
      }
    } catch {
      /* ignore */
    }

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(enrichTicketForClient(out?.[0] || null));
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
        const hasRoiAccess = await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({
          clientId,
          schoolOrganizationId,
          schoolStaffUserId: req.user?.id
        });
        if (!hasRoiAccess) {
          return res.status(403).json({ error: { message: 'ROI access required for this client' } });
        }
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
    } else if (
      !['school_staff', 'provider', 'provider_plus', 'staff', 'clinical_practice_assistant', 'admin', 'support', 'super_admin'].includes(
        role
      )
    ) {
      return res.status(403).json({
        error: { message: 'Only school staff, providers, or agency staff can submit support tickets here' }
      });
    }

    const agencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
    const hasEnc = await hasSupportTicketEncryptionColumns();
    const hasPriority = await hasSupportTicketPriorityColumn();
    const qEnc = hasEnc ? prepareEncryptedTicketText(question) : { plain: question, ciphertext: null, iv: null, authTag: null, keyId: null };
    const priorityRaw = String(req.body?.priority || 'medium').trim().toLowerCase();
    const priority = ['low', 'medium', 'high'].includes(priorityRaw) ? priorityRaw : 'medium';
    const topic = normalizeTicketTopic(req.body?.topic, {
      allowed: allowedTopicsForCreatorRole(role)
    });
    // Providers/staff may request platform/product help — stays tenant-scoped until admin escalates.
    const requestsPlatformHelp =
      req.body?.requestsPlatformHelp === true ||
      req.body?.requestsPlatformHelp === 1 ||
      req.body?.requestsPlatformHelp === '1' ||
      req.body?.requests_platform_help === true ||
      req.body?.requests_platform_help === 1;

    let result;
    if (hasEnc && hasPriority) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority,
           question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
        [
          schoolOrganizationId,
          clientId || null,
          req.user.id,
          agencyId ? parseInt(agencyId, 10) : null,
          subject,
          qEnc.plain,
          priority,
          qEnc.ciphertext,
          qEnc.iv,
          qEnc.authTag,
          qEnc.keyId
        ]
      );
    } else if (hasEnc) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status,
           question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
        [
          schoolOrganizationId,
          clientId || null,
          req.user.id,
          agencyId ? parseInt(agencyId, 10) : null,
          subject,
          qEnc.plain,
          qEnc.ciphertext,
          qEnc.iv,
          qEnc.authTag,
          qEnc.keyId
        ]
      );
    } else if (hasPriority) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        [schoolOrganizationId, clientId || null, req.user.id, agencyId ? parseInt(agencyId, 10) : null, subject, question, priority]
      );
    } else {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status)
         VALUES (?, ?, ?, ?, ?, ?, 'open')`,
        [schoolOrganizationId, clientId || null, req.user.id, agencyId ? parseInt(agencyId, 10) : null, subject, question]
      );
    }

    if (result?.insertId && (await hasSupportTicketTopicColumn())) {
      try {
        await pool.execute(`UPDATE support_tickets SET topic = ? WHERE id = ?`, [topic, result.insertId]);
      } catch {
        /* ignore */
      }
    }
    if (result?.insertId && requestsPlatformHelp && (await hasSupportTicketPlatformHelpColumn())) {
      try {
        await pool.execute(`UPDATE support_tickets SET requests_platform_help = 1 WHERE id = ?`, [
          result.insertId
        ]);
      } catch {
        /* ignore */
      }
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [result.insertId]);
    const created = enrichTicketForClient(rows?.[0] || null);

    // Best-effort: persist the initial question as a message row when the table exists.
    try {
      if (created?.id && (await hasSupportTicketMessagesTable())) {
        await insertTicketMessageRow({
          ticketId: created.id,
          parentId: null,
          authorUserId: req.user.id,
          authorRole: String(req.user?.role || ''),
          body: question,
          isInternal: false
        });
      }
    } catch {
      // best-effort; do not block creation
    }

    // Notify admins + responsibility-flagged recipients for the ticket topic.
    // Product-help requests always notify tenant admins (not platform) until escalated.
    try {
      const aid = agencyId ? parseInt(agencyId, 10) : null;
      if (aid && created?.id) {
        const schoolName = access?.org?.name || `Org #${schoolOrganizationId}`;
        const topicLabel = topic === 'general' ? 'Support' : topic.charAt(0).toUpperCase() + topic.slice(1);
        const title = requestsPlatformHelp
          ? 'Product help request (for admin review)'
          : `New ${topicLabel.toLowerCase()} ticket`;
        const msg =
          `${schoolName}: ${subject || 'Support ticket'}${question ? ` — ${question.slice(0, 220)}${question.length > 220 ? '…' : ''}` : ''}`;
        const notifyTopic = requestsPlatformHelp ? 'general' : topic;
        const recipients = await listAgencySupportRecipients({ agencyId: aid, topic: notifyTopic });
        for (const r of recipients) {
          if (Number(r.id) === Number(req.user?.id)) continue;
          try {
            await Notification.create({
              type: 'support_ticket_created',
              severity: 'info',
              title,
              message: msg,
              userId: r.id,
              agencyId: aid,
              relatedEntityType: 'support_ticket',
              relatedEntityId: created.id,
              actorUserId: req.user.id
            });
          } catch {
            /* per-recipient */
          }
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

    const accessState = await getSchoolStaffTicketAccessState({ req, schoolOrganizationId, clientId });
    const limitToOwnTickets = accessState === 'limited';
    const ticketParams = [schoolOrganizationId, clientId];
    const ownTicketClause = limitToOwnTickets ? ' AND created_by_user_id = ?' : '';
    if (limitToOwnTickets) ticketParams.push(req.user.id);
    const [rows] = await pool.execute(
      `SELECT *
       FROM support_tickets
       WHERE school_organization_id = ?
         AND client_id = ?
         ${ownTicketClause}
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      ticketParams
    );
    const ticket = rows?.[0] || null;

    let messages = [];
    if (ticket?.id && (await hasSupportTicketMessagesTable())) {
      const messageParams = [ticket.id];
      const ownMessageClause = limitToOwnTickets ? ' AND m.author_user_id = ?' : '';
      if (limitToOwnTickets) messageParams.push(req.user.id);
      const hasInternal = await hasSupportTicketMessageInternalColumn();
      const role = String(req.user?.role || '').toLowerCase();
      const internalClause = role === 'school_staff' && hasInternal ? ' AND COALESCE(m.is_internal, 0) = 0' : '';
      const [mRows] = await pool.execute(
        `SELECT m.*,
                u.first_name AS author_first_name,
                u.last_name AS author_last_name
         FROM support_ticket_messages m
         LEFT JOIN users u ON u.id = m.author_user_id
         WHERE m.ticket_id = ?
           ${ownMessageClause}
           ${internalClause}
         ORDER BY m.created_at ASC, m.id ASC`,
        messageParams
      );
      messages = (Array.isArray(mRows) ? mRows : []).map((m) => decryptTicketMessageRow(m));
    }

    res.json({ ticket: ticket ? enrichTicketForClient(ticket) : null, messages });
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

    const accessState = await getSchoolStaffTicketAccessState({ req, schoolOrganizationId, clientId });
    const limitToOwnTickets = accessState === 'limited';
    const limitRaw = req.query?.limit ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
    const queryParams = [schoolOrganizationId, clientId];
    const ownTicketClause = limitToOwnTickets ? ' AND created_by_user_id = ?' : '';
    if (limitToOwnTickets) queryParams.push(req.user.id);

    const [rows] = await pool.execute(
      `SELECT *
       FROM support_tickets
       WHERE school_organization_id = ?
         AND client_id = ?
         ${ownTicketClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit}`,
      queryParams
    );

    res.json({ tickets: (rows || []).map((t) => enrichTicketForClient(t)) });
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

    const role = String(req.user?.role || '').toLowerCase();
    const isTicketCreatorEarly = Number(ticket?.created_by_user_id || 0) === Number(req.user?.id || 0);
    if (!(role === 'client_guardian' && isTicketCreatorEarly)) {
      const access = await ensureOrgAccess(req, ticket.school_organization_id);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    }

    const schedulerOwnOnly = role === 'school_staff'
      ? await isSchedulerForSchool({
          userId: req.user?.id,
          schoolOrganizationId: ticket.school_organization_id,
          userEmail: req.user?.email || req.user?.username || null
        })
      : false;
    const limitedStaffOwnTicketOnly =
      role === 'school_staff' &&
      Number(ticket?.client_id || 0) > 0 &&
      (
        await getSchoolStaffTicketAccessState({
          req,
          schoolOrganizationId: ticket.school_organization_id,
          clientId: ticket.client_id
        })
      ) === 'limited';
    const restrictToOwnTicket = limitedStaffOwnTicketOnly || schedulerOwnOnly;
    if (restrictToOwnTicket && Number(ticket?.created_by_user_id || 0) !== Number(req.user?.id || 0)) {
      return res.status(403).json({ error: { message: 'Limited ticket access only allows your own tickets' } });
    }
    const isTicketCreator = Number(ticket?.created_by_user_id || 0) === Number(req.user?.id || 0);
    let canView = isAgencyAdminUser(req) || role === 'super_admin' || (role === 'client_guardian' && isTicketCreator);
    if (!canView && role === 'school_staff' && ticket.client_id) {
      canView = await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({
        clientId: ticket.client_id,
        schoolOrganizationId: ticket.school_organization_id,
        schoolStaffUserId: req.user?.id
      });
    }
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
    if (!(await actorCanAccessTicketTopic(req, ticket))) {
      return res.status(403).json({ error: { message: 'This ticket is routed to a different audience' } });
    }

    if (!(await hasSupportTicketMessagesTable())) {
      return res.json({ ticket: enrichTicketForClient(ticket), messages: [] });
    }

    const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
    const hasInternal = await hasSupportTicketMessageInternalColumn();
    const hideInternal = role === 'school_staff' || role === 'client_guardian';
    const messageParams = [ticketId];
    const ownMessageClause = restrictToOwnTicket ? ' AND m.author_user_id = ?' : '';
    if (restrictToOwnTicket) messageParams.push(req.user.id);
    const internalClause = hideInternal && hasInternal ? ' AND COALESCE(m.is_internal, 0) = 0' : '';
    const [mRows] = await pool.execute(
      `SELECT m.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
       WHERE m.ticket_id = ?
         ${ownMessageClause}
         ${internalClause}
       ORDER BY m.created_at ASC, m.id ASC`,
      messageParams
    );
    const list = Array.isArray(mRows) ? mRows : [];
    const normalized = list.map((m) => {
      const decrypted = decryptTicketMessageRow(m);
      if (hasSoftDelete && (m?.is_deleted === 1 || m?.is_deleted === true)) {
        return { ...decrypted, body: '', is_deleted: 1 };
      }
      return decrypted;
    });
    res.json({ ticket: enrichTicketForClient(ticket), messages: normalized });
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

    const wantInternal =
      req.body?.isInternal === true || req.body?.isInternal === 1 || req.body?.isInternal === '1';
    const role = String(req.user?.role || '').toLowerCase();
    if (wantInternal && (role === 'school_staff' || role === 'client_guardian')) {
      return res.status(403).json({ error: { message: 'Cannot post internal notes' } });
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const isTicketCreator = Number(ticket?.created_by_user_id || 0) === Number(req.user?.id || 0);
    if (role === 'client_guardian') {
      if (!isTicketCreator) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else {
      const access = await ensureOrgAccess(req, ticket.school_organization_id);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
      if (!(await actorCanAccessTicketTopic(req, ticket))) {
        return res.status(403).json({ error: { message: 'This ticket is routed to a different audience' } });
      }
    }

    if (!(await hasSupportTicketMessagesTable())) {
      return res.status(409).json({ error: { message: 'Ticket messages are not enabled (missing migration)' } });
    }

    const schedulerOwnOnly = role === 'school_staff'
      ? await isSchedulerForSchool({
          userId: req.user?.id,
          schoolOrganizationId: ticket.school_organization_id,
          userEmail: req.user?.email || req.user?.username || null
        })
      : false;

    // Client-scoped tickets: allow school_staff, agency admin/support/staff, and assigned providers to post.
    if (ticket.client_id && role !== 'client_guardian') {
      const limitedStaffOwnTicketOnly =
        role === 'school_staff' &&
        (
          await getSchoolStaffTicketAccessState({
            req,
            schoolOrganizationId: ticket.school_organization_id,
            clientId: ticket.client_id
          })
        ) === 'limited';
      if ((limitedStaffOwnTicketOnly || schedulerOwnOnly) && Number(ticket?.created_by_user_id || 0) !== Number(req.user?.id || 0)) {
        return res.status(403).json({ error: { message: 'Limited ticket access only allows replying to your own tickets' } });
      }
      let canPost = isAgencyAdminUser(req) || role === 'super_admin';
      if (!canPost && role === 'school_staff') {
        canPost = await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({
          clientId: ticket.client_id,
          schoolOrganizationId: ticket.school_organization_id,
          schoolStaffUserId: req.user?.id
        });
      }
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

    await insertTicketMessageRow({
      ticketId,
      parentId,
      authorUserId: req.user.id,
      authorRole: String(req.user?.role || ''),
      body,
      isInternal: wantInternal && (isAgencyAdminUser(req) || role === 'super_admin' || role === 'staff' || role === 'clinical_practice_assistant')
    });

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
        ? await listAgencySupportRecipients({ agencyId, topic: ticket.topic || 'general' })
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
      return res.status(409).json({
        error: {
          message:
            'Message deletion is not available. Please contact your administrator to run the support ticket messages migration.'
        }
      });
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
    const isMessageAuthor = Number(msg.author_user_id) === Number(req.user.id);
    const isTicketCreator = Number(ticket.created_by_user_id) === Number(req.user.id);
    const canDelete =
      (isAdminLike && authorRole === 'school_staff') ||
      (isSchoolStaff && (isMessageAuthor || (authorRole === 'school_staff' && isTicketCreator)));
    if (!canDelete) return res.status(403).json({ error: { message: 'You can only delete your own messages.' } });

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
      created_by_name:
        createdByName ||
        ticket?.created_by_email ||
        (ticket?.created_by_source_key ? `${supportTicketSourceLabel(ticket.created_by_source_key)} (external request)` : '')
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
    const hasEnc = await hasSupportTicketEncryptionColumns();
    const aEnc = hasEnc ? prepareEncryptedTicketText(answer) : { plain: answer, ciphertext: null, iv: null, authTag: null, keyId: null };

    if (hasEnc && hasCloseOnRead) {
      await pool.execute(
        `UPDATE support_tickets
         SET answer = ?, status = ?, answered_by_user_id = ?, answered_at = CURRENT_TIMESTAMP, close_on_read = ?,
             answer_ciphertext = ?, answer_iv = ?, answer_auth_tag = ?, answer_encryption_key_id = ?
         WHERE id = ?`,
        [aEnc.plain, status, req.user.id, closeOnRead ? 1 : 0, aEnc.ciphertext, aEnc.iv, aEnc.authTag, aEnc.keyId, ticketId]
      );
    } else if (hasEnc) {
      await pool.execute(
        `UPDATE support_tickets
         SET answer = ?, status = ?, answered_by_user_id = ?, answered_at = CURRENT_TIMESTAMP,
             answer_ciphertext = ?, answer_iv = ?, answer_auth_tag = ?, answer_encryption_key_id = ?
         WHERE id = ?`,
        [aEnc.plain, status, req.user.id, aEnc.ciphertext, aEnc.iv, aEnc.authTag, aEnc.keyId, ticketId]
      );
    } else if (hasCloseOnRead) {
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
        const decryptedTicket = decryptTicketRow(ticket);
        const summary = await maybeGenerateGeminiSummary({ question: decryptedTicket?.question || '', answer });
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
        await insertTicketMessageRow({
          ticketId,
          parentId: null,
          authorUserId: req.user.id,
          authorRole: String(req.user?.role || ''),
          body: answer,
          isInternal: false
        });
      }
    } catch {
      // best-effort only
    }

    const [rows2] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json(enrichTicketForClient(rows2?.[0] || null));
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
    if (!(await actorCanAccessTicketTopic(req, ticket))) {
      return res.status(403).json({ error: { message: 'This ticket is routed to a different audience' } });
    }

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
    const scopeOrgId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!scopeOrgId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const role = String(req.user?.role || '').toLowerCase();
    const canView = canManageTicketAssignments(req) || role === 'super_admin';
    if (!canView) return res.status(403).json({ error: { message: 'Access denied' } });

    const org = await Agency.findById(scopeOrgId);
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } });

    const orgType = String(org.organization_type || '').toLowerCase().trim();
    let targetAgencyId = null;
    if (!orgType || orgType === 'agency' || orgType === 'parent' || orgType === 'organization') {
      const access = await ensureAgencyAccess(req, scopeOrgId);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
      targetAgencyId = scopeOrgId;
    } else {
      const access = await ensureOrgAccess(req, scopeOrgId);
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
      targetAgencyId = await resolveActiveAgencyIdForOrg(scopeOrgId);
      if (!targetAgencyId) {
        return res.status(403).json({ error: { message: 'No active parent agency found for this organization' } });
      }
    }

    let rows = [];
    try {
      const [queryRows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.role,
                MAX(CASE WHEN ua.agency_id = ? THEN COALESCE(ua.has_billing_access, 0) ELSE 0 END) AS has_billing_access,
                MAX(CASE WHEN ua.agency_id = ? THEN COALESCE(ua.has_payroll_access, 0) ELSE 0 END) AS has_payroll_access,
                MAX(CASE WHEN ua.agency_id = ? THEN COALESCE(ua.can_manage_credentialing, 0) ELSE 0 END) AS can_manage_credentialing
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE (
           (ua.agency_id = ? AND LOWER(COALESCE(u.role, '')) IN ('admin','support','staff','super_admin','clinical_practice_assistant','provider_plus'))
           OR
           (
             LOWER(COALESCE(u.role, '')) = 'school_staff'
             AND ua.agency_id IN (
               SELECT oa.organization_id
               FROM organization_affiliations oa
               WHERE oa.agency_id = ? AND oa.is_active = TRUE
               UNION
               SELECT s.school_organization_id
               FROM agency_schools s
               WHERE s.agency_id = ? AND s.is_active = TRUE
             )
           )
         )
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
         GROUP BY u.id, u.first_name, u.last_name, u.role
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [targetAgencyId, targetAgencyId, targetAgencyId, targetAgencyId, targetAgencyId, targetAgencyId]
      );
      rows = queryRows || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR');
      if (!missing) throw e;
      const [fallbackRows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE (
           (ua.agency_id = ? AND LOWER(COALESCE(u.role, '')) IN ('admin','support','staff','super_admin','clinical_practice_assistant','provider_plus'))
           OR
           (
             LOWER(COALESCE(u.role, '')) = 'school_staff'
             AND ua.agency_id IN (
               SELECT oa.organization_id
               FROM organization_affiliations oa
               WHERE oa.agency_id = ? AND oa.is_active = TRUE
             )
           )
         )
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [targetAgencyId, targetAgencyId]
      );
      rows = fallbackRows || [];
    }

    res.json({
      users: (rows || []).map((u) => ({
        ...u,
        has_billing_access: !!(u.has_billing_access === 1 || u.has_billing_access === true),
        has_payroll_access: !!(u.has_payroll_access === 1 || u.has_payroll_access === true),
        can_manage_credentialing: !!(u.can_manage_credentialing === 1 || u.can_manage_credentialing === true)
      })),
      agencyId: Number(targetAgencyId) || null
    });
  } catch (e) {
    next(e);
  }
};

export const assignSupportTicket = async (req, res, next) => {
  try {
    const canAssign = canManageTicketAssignments(req);
    if (!canAssign) return res.status(403).json({ error: { message: 'Only ticket collaborators can assign tickets' } });

    const ticketId = parseInt(req.params.id, 10);
    const assigneeId = req.body?.assigneeUserId ? parseInt(req.body.assigneeUserId, 10) : null;
    if (!ticketId || !assigneeId) return res.status(400).json({ error: { message: 'ticket id and assigneeUserId are required' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [aRows] = await pool.execute(
      `SELECT id, first_name, last_name, email, work_email, role, is_archived, status
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [assigneeId]
    );
    const assignee = aRows?.[0] || null;
    if (!assignee) return res.status(404).json({ error: { message: 'Assignee not found' } });
    if (assignee.is_archived === 1 || String(assignee.status || '').toUpperCase() === 'ARCHIVED') {
      return res.status(409).json({ error: { message: 'Assignee is archived' } });
    }

    if (!isTicketQueueCollaboratorRole(assignee.role)) {
      return res.status(400).json({ error: { message: 'Assignee must be a ticket collaborator (school staff, admin, support, staff, CPA, or provider plus)' } });
    }

    const assigneeCanAccess = await userCanAccessTicketOrgScope({
      userId: assignee.id,
      role: assignee.role,
      schoolOrganizationId: ticket.school_organization_id,
      agencyId: ticket.agency_id
    });
    if (!assigneeCanAccess) {
      return res.status(400).json({ error: { message: 'Assignee does not have access to this ticket scope' } });
    }

    const currentlyAssignedUserId = ticket.claimed_by_user_id ? Number(ticket.claimed_by_user_id) : null;
    if (currentlyAssignedUserId === Number(assigneeId)) {
      const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
      return res.json(out?.[0] || null);
    }

    await pool.execute(
      `UPDATE support_tickets
       SET claimed_by_user_id = ?, claimed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assigneeId, ticketId]
    );

    await createSupportTicketAssignmentNotification({
      ticket,
      assigneeUser: assignee,
      assignedByUserId: req.user?.id,
      assignedByUser: req.user
    });

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

async function listProvidersAssignedToClientInSchool({ clientId, schoolOrganizationId }) {
  const cid = parseInt(String(clientId), 10);
  const sid = parseInt(String(schoolOrganizationId), 10);
  if (!cid || !sid) return [];
  const byId = new Map();
  try {
    const [cpaRows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role
       FROM client_provider_assignments cpa
       JOIN users u ON u.id = cpa.provider_user_id
       WHERE cpa.client_id = ?
         AND cpa.organization_id = ?
         AND cpa.is_active = TRUE
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
      [cid, sid]
    );
    for (const r of cpaRows || []) {
      if (r?.id) byId.set(Number(r.id), r);
    }
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
    const [cRows] = await pool.execute(
      `SELECT id, provider_id, organization_id FROM clients WHERE id = ? LIMIT 1`,
      [cid]
    );
    const crow = cRows?.[0] || null;
    const pid = crow?.provider_id ? Number(crow.provider_id) : null;
    if (pid && Number(crow.organization_id) === sid && !byId.has(pid)) {
      const [uRows] = await pool.execute(
        `SELECT id, first_name, last_name, email, role FROM users WHERE id = ? LIMIT 1`,
        [pid]
      );
      const u = uRows?.[0];
      if (u?.id) byId.set(Number(u.id), u);
    }
  } catch {
    // ignore legacy lookup failures
  }
  return Array.from(byId.values()).sort((a, b) => {
    const an = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
    const bn = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
    return an.localeCompare(bn);
  });
}

export const listClientAssignedProvidersForSupportTicket = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req) && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });
    if (!ticket.client_id) {
      return res.status(400).json({ error: { message: 'Ticket has no linked client' } });
    }

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const providers = await listProvidersAssignedToClientInSchool({
      clientId: ticket.client_id,
      schoolOrganizationId: ticket.school_organization_id
    });
    res.json({ providers });
  } catch (e) {
    next(e);
  }
};

export const forwardSupportTicketToProviders = async (req, res, next) => {
  try {
    if (!isAgencyAdminUser(req) && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only admin/support/staff can forward tickets' } });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });

    const rawIds = req.body?.providerUserIds ?? req.body?.provider_user_ids;
    const ids = Array.isArray(rawIds) ? rawIds : [];
    const providerUserIds = [...new Set(ids.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    const adminNote = String(req.body?.message || '').trim();
    const customCloseAnswer = String(req.body?.closeAnswer || '').trim();

    if (!providerUserIds.length) {
      return res.status(400).json({ error: { message: 'Select at least one provider' } });
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
    const ticket = rows?.[0] || null;
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });
    if (!ticket.client_id) {
      return res.status(400).json({ error: { message: 'Forwarding is only available for client-linked tickets' } });
    }

    const access = await ensureOrgAccess(req, ticket.school_organization_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

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
          const [r2] = await pool.execute(`SELECT claimed_by_user_id FROM support_tickets WHERE id = ?`, [ticketId]);
          const nowClaimed = r2?.[0]?.claimed_by_user_id ? Number(r2[0].claimed_by_user_id) : null;
          if (nowClaimed && nowClaimed !== Number(req.user.id)) {
            return res.status(409).json({ error: { message: 'Ticket was just claimed by another team member' } });
          }
        }
      } catch {
        // best-effort
      }
    }

    if (!(await hasSupportTicketMessagesTable())) {
      return res.status(409).json({ error: { message: 'Ticket messages are not enabled' } });
    }

    for (const pid of providerUserIds) {
      const ok = await providerAssignedToClientInOrg({
        providerUserId: pid,
        clientId: ticket.client_id,
        orgId: ticket.school_organization_id
      });
      if (!ok) {
        return res.status(400).json({
          error: { message: `User #${pid} is not an assigned provider for this client at this school` }
        });
      }
    }

    const [latestRows] = await pool.execute(
      `SELECT id FROM support_tickets
       WHERE school_organization_id = ? AND client_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [ticket.school_organization_id, ticket.client_id]
    );
    const targetTicketId = latestRows?.[0]?.id ? Number(latestRows[0].id) : ticketId;

    const providerNames = [];
    for (const pid of providerUserIds) {
      const u = await User.findById(pid);
      const nm = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
      providerNames.push(nm || u?.email || `User #${pid}`);
    }

    const subjectLine = ticket.subject ? String(ticket.subject).trim() : '';
    const q = String(ticket.question || '').trim();
    const forwardParts = ['📩 Support forwarded this school ticket to you as a client message.', ''];
    if (adminNote) forwardParts.push(`Note from support:\n${adminNote}`, '');
    forwardParts.push(
      `Original ticket #${ticketId}${subjectLine ? `: ${subjectLine}` : ''}`,
      '',
      '---',
      q || '(No question text)'
    );
    const forwardBody = forwardParts.join('\n');

    await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
       VALUES (?, NULL, ?, ?, ?)`,
      [targetTicketId, req.user.id, String(req.user?.role || ''), forwardBody]
    );

    const defaultClose = `Forwarded to provider(s): ${providerNames.join(', ')}. They can read and reply under this student’s Messages (ticketed) in the school portal.`;
    const closeAnswer = customCloseAnswer || defaultClose;

    const hasCloseOnRead = await hasSupportTicketsCloseOnReadColumn();
    if (hasCloseOnRead) {
      await pool.execute(
        `UPDATE support_tickets
         SET answer = ?, status = 'closed', answered_by_user_id = ?, answered_at = CURRENT_TIMESTAMP, close_on_read = 0
         WHERE id = ?`,
        [closeAnswer, req.user.id, ticketId]
      );
    } else {
      await pool.execute(
        `UPDATE support_tickets
         SET answer = ?, status = 'closed', answered_by_user_id = ?, answered_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [closeAnswer, req.user.id, ticketId]
      );
    }

    try {
      const summary = await maybeGenerateGeminiSummary({ question: ticket?.question || '', answer: closeAnswer });
      if (summary) {
        await pool.execute(`UPDATE support_tickets SET ai_summary = ? WHERE id = ?`, [summary, ticketId]);
      }
    } catch {
      // ignore
    }

    const agencyIdNum = ticket.agency_id
      ? Number(ticket.agency_id)
      : await resolveActiveAgencyIdForOrg(ticket.school_organization_id);

    for (const pid of providerUserIds) {
      try {
        await Notification.create({
          type: 'support_ticket_forwarded_to_provider',
          severity: 'info',
          title: 'Client message from support',
          message: `Support forwarded ticket #${ticketId} for you to address in the school portal (student Messages).`,
          userId: pid,
          agencyId: agencyIdNum || null,
          relatedEntityType: 'client',
          relatedEntityId: ticket.client_id,
          actorUserId: req.user.id
        });
      } catch {
        // best-effort
      }
    }

    const [out] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    res.json({
      ticket: out?.[0] || null,
      targetTicketId,
      forwardedToProviderIds: providerUserIds
    });
  } catch (e) {
    next(e);
  }
};
