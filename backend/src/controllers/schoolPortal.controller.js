/**
 * School Portal Controller
 * Handles restricted school portal views and client list access
 */

import crypto from 'crypto';
import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import ClientSchoolStaffRoiAccess, {
  getEffectiveSchoolStaffRoiState,
  schoolStaffCanOpenClient,
  schoolStaffCanViewClientDocuments
} from '../models/ClientSchoolStaffRoiAccess.model.js';
import User from '../models/User.model.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import Agency from '../models/Agency.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import StorageService from '../services/storage.service.js';
import { callGeminiText } from '../services/geminiText.service.js';
import { ensureIssuedRoiSigningLinkForClient } from './clientSchoolRoiAccess.controller.js';
import { assertSchoolPortalAccess } from './schoolPortalIntakeLinks.controller.js';
import { buildIntakeAnswersText, buildClinicalSummaryText } from './publicIntake.controller.js';
import {
  getSupervisorSuperviseeIds,
  isAdminLikeRole,
  isSupervisorActor,
  isSupervisorOnlyActor,
  supervisorHasSuperviseeInSchool,
  supervisorCanAccessClientInOrg
} from '../utils/supervisorSchoolAccess.js';
import {
  resolveSchoolStaffWaiverStatus,
  resetSchoolStaffWaiverForTesting
} from '../services/schoolStaffWaiver.service.js';

const SCHOOL_PORTAL_VALID_AUDIENCES = ['everyone', 'school_staff_only', 'providers_only'];
const parseSchoolPortalAudience = (raw) => {
  const value = String(raw || 'everyone').trim().toLowerCase();
  return SCHOOL_PORTAL_VALID_AUDIENCES.includes(value) ? value : 'everyone';
};
const parseSchoolPortalDisplayType = (raw) => {
  const value = String(raw || 'announcement').trim().toLowerCase();
  return value === 'splash' ? 'splash' : 'announcement';
};
const schoolPortalAudienceMatchesRole = (audience, role) => {
  const r = String(role || '').toLowerCase();
  if (audience === 'everyone') return true;
  if (audience === 'school_staff_only') return r === 'school_staff';
  if (audience === 'providers_only') return r === 'provider';
  return true;
};

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

async function getAgencyAdminStaffUserIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN user_agencies ua ON ua.user_id = u.id
     WHERE (
       (ua.agency_id = ? AND LOWER(COALESCE(u.role, '')) IN ('admin', 'staff', 'support'))
       OR LOWER(COALESCE(u.role, '')) = 'super_admin'
     )
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
    [agencyId]
  );
  return (rows || []).map((r) => Number(r.id)).filter(Boolean);
}

async function getAgencyAdminOnlyUserIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN user_agencies ua ON ua.user_id = u.id
     WHERE (
       (ua.agency_id = ? AND LOWER(COALESCE(u.role, '')) = 'admin')
       OR LOWER(COALESCE(u.role, '')) = 'super_admin'
     )
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
    [agencyId]
  );
  return (rows || []).map((r) => Number(r.id)).filter(Boolean);
}

async function notifyAgencyAdmins({
  agencyId,
  title,
  message,
  actorUserId = null,
  relatedEntityType = null,
  relatedEntityId = null
}) {
  if (!agencyId || !title || !message) return 0;
  const Notification = (await import('../models/Notification.model.js')).default;
  const adminIds = await getAgencyAdminOnlyUserIds(agencyId);
  const uniqueAdminIds = Array.from(new Set(adminIds));
  await Promise.all(uniqueAdminIds.map(async (adminUserId) => {
    await Notification.create({
      type: 'program_reminder',
      severity: 'info',
      title,
      message,
      userId: adminUserId,
      agencyId,
      relatedEntityType: relatedEntityType || undefined,
      relatedEntityId: relatedEntityId || undefined,
      actorUserId: actorUserId || undefined,
      actorSource: 'School Portal'
    });
  }));
  return uniqueAdminIds.length;
}

async function canSchoolStaffUseWaiverFallbackAccess({ userId, orgId }) {
  const uid = Number(userId || 0);
  const sid = Number(orgId || 0);
  if (!uid || !sid) return false;
  const userOrgs = await User.getAgencies(uid);
  const hasDirect = (userOrgs || []).some((org) => Number(org?.id || 0) === sid);
  if (hasDirect) return true;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(sid);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => Number(org?.id || 0) === Number(activeAgencyId));
}

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

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function safeJsonFromText(text) {
  if (!text) return null;
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function parseComplianceQuery(query) {
  const q = String(query || '').trim();
  if (!q) return { limit: 10 };
  try {
    const prompt = [
      'You are a compliance audit query parser.',
      'Return JSON ONLY with these keys:',
      'limit (number), providerName, providerEmail, providerId, clientName, clientId,',
      'since, until (ISO-8601), actionContains, userRole.',
      'Use null for unknown values.',
      `Query: ${q}`
    ].join('\n');
    const resp = await callGeminiText({ prompt, temperature: 0.1, maxOutputTokens: 220 });
    const parsed = safeJsonFromText(resp?.text || '');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore - fallback below
  }
  return { limit: 10, actionContains: q };
}

function normalizeNotificationsProgress(raw) {
  const parsed = parseJsonMaybe(raw) || raw;
  if (parsed && typeof parsed === 'object' && parsed.by_org) {
    return {
      ...parsed,
      dismissed_by_org: parsed.dismissed_by_org && typeof parsed.dismissed_by_org === 'object' ? parsed.dismissed_by_org : {}
    };
  }
  const legacy = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    by_org: legacy,
    by_org_kind: {},
    by_org_client_kind: {},
    dismissed_by_org: {}
  };
}

function getLastSeenByOrg(progress, orgId) {
  const key = String(orgId);
  return progress?.by_org?.[key] || null;
}

function getLastSeenByOrgKind(progress, orgId, kind) {
  const key = String(orgId);
  const k = String(kind || '');
  return progress?.by_org_kind?.[key]?.[k] || null;
}

function getLastSeenByOrgClientKind(progress, orgId, clientId, kind) {
  const key = String(orgId);
  const cid = String(clientId || '');
  const k = String(kind || '');
  return progress?.by_org_client_kind?.[key]?.[cid]?.[k] || null;
}

function setLastSeenByOrg(progress, orgId, iso) {
  const key = String(orgId);
  const next = { ...progress, by_org: { ...(progress?.by_org || {}) } };
  next.by_org[key] = iso;
  return next;
}

function setLastSeenByOrgKind(progress, orgId, kind, iso) {
  const key = String(orgId);
  const k = String(kind || '');
  const byOrg = { ...(progress?.by_org_kind || {}) };
  const byKind = { ...(byOrg[key] || {}) };
  byKind[k] = iso;
  byOrg[key] = byKind;
  return { ...progress, by_org_kind: byOrg };
}

function setLastSeenByOrgClientKind(progress, orgId, clientId, kind, iso) {
  const key = String(orgId);
  const cid = String(clientId || '');
  const k = String(kind || '');
  const byOrg = { ...(progress?.by_org_client_kind || {}) };
  const byClient = { ...(byOrg[key] || {}) };
  const byKind = { ...(byClient[cid] || {}) };
  byKind[k] = iso;
  byClient[cid] = byKind;
  byOrg[key] = byClient;
  return { ...progress, by_org_client_kind: byOrg };
}

async function getUnreadClientUpdateCounts({ userId, orgId, clientIds }) {
  if (!userId || !orgId || !Array.isArray(clientIds) || clientIds.length === 0) return new Map();
  const progress = await getUserNotificationsProgress(userId);
  const orgKey = String(orgId);
  const byClient = progress?.by_org_client_kind?.[orgKey] || {};
  const byKind = progress?.by_org_kind?.[orgKey] || {};
  const orgLastSeen = progress?.by_org?.[orgKey] || null;
  const toMs = (v) => {
    try {
      const t = v ? new Date(v).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  };
  const getLastSeenMs = (clientId, kind) => {
    const cid = String(clientId);
    const raw = byClient?.[cid]?.[kind] || byKind?.[kind] || orgLastSeen;
    return toMs(raw);
  };

  const placeholders = clientIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, client_id, field_changed, changed_at
     FROM client_status_history
     WHERE client_id IN (${placeholders})
       AND field_changed IN ('compliance_checklist', 'client_status_id', 'status', 'provider_id', 'provider_user_id')
     ORDER BY changed_at DESC
     LIMIT 2000`,
    clientIds
  );

  const counts = new Map();
  for (const r of rows || []) {
    const cid = Number(r.client_id);
    if (!cid) continue;
    const field = String(r.field_changed || '').trim();
    const kind =
      field === 'compliance_checklist'
        ? 'checklist'
        : (field === 'client_status_id' || field === 'status')
          ? 'status'
          : (field === 'provider_id' || field === 'provider_user_id')
            ? 'assignment'
            : 'status';
    const changedMs = toMs(r.changed_at);
    const lastSeenMs = getLastSeenMs(cid, kind);
    if (!Number.isFinite(changedMs) || changedMs <= lastSeenMs) continue;
    counts.set(cid, (counts.get(cid) || 0) + 1);
  }
  return counts;
}

async function getUserNotificationCategories(userId) {
  const uid = parseInt(userId, 10);
  if (!uid) return {};
  try {
    const [rows] = await pool.execute(
      `SELECT notification_categories
       FROM user_preferences
       WHERE user_id = ?
       LIMIT 1`,
      [uid]
    );
    const raw = rows?.[0]?.notification_categories ?? null;
    const parsed = parseJsonMaybe(raw) || raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function getUserNotificationsProgress(userId) {
  const uid = parseInt(userId, 10);
  if (!uid) return normalizeNotificationsProgress({});
  try {
    const [rows] = await pool.execute(
      `SELECT school_portal_notifications_progress
       FROM user_preferences
       WHERE user_id = ?
       LIMIT 1`,
      [uid]
    );
    const raw = rows?.[0]?.school_portal_notifications_progress ?? null;
    return normalizeNotificationsProgress(raw);
  } catch {
    return normalizeNotificationsProgress({});
  }
}

function roleCanUseAgencyAffiliation(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'staff' || r === 'supervisor' || r === 'clinical_practice_assistant' || r === 'provider_plus';
}

async function providerHasSchoolAccess({ providerUserId, schoolOrganizationId }) {
  const uid = parseInt(providerUserId, 10);
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!uid || !orgId) return false;

  // Prefer provider/day assignment table (future-proof), fall back to active client-provider assignments.
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ?
         AND psa.provider_user_id = ?
         AND psa.is_active = TRUE
       LIMIT 1`,
      [orgId, uid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments cpa
       WHERE cpa.organization_id = ?
         AND cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
       LIMIT 1`,
      [orgId, uid]
    );
    return !!rows?.[0];
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
    if (missing) return false;
    throw e;
  }
}

async function getProviderAssignedClientIds({ providerUserId, schoolOrganizationId }) {
  const uid = parseInt(providerUserId, 10);
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!uid || !orgId) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT cpa.client_id
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       WHERE cpa.organization_id = ?
         AND cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')`,
      [orgId, uid]
    );
    return (rows || []).map((r) => Number(r.client_id)).filter(Boolean);
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT c.id AS client_id
       FROM clients c
       WHERE c.organization_id = ?
         AND c.provider_id = ?
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')`,
      [orgId, uid]
    );
    return (rows || []).map((r) => Number(r.client_id)).filter(Boolean);
  } catch {
    return [];
  }
}

async function listSupervisorClientIdsForOrg({ supervisorUserId, orgId }) {
  const sid = parseInt(supervisorUserId, 10);
  const oid = parseInt(orgId, 10);
  if (!sid || !oid) return [];

  const superviseeIds = await getSupervisorSuperviseeIds(sid, null);
  if (!superviseeIds.length) return [];
  const placeholders = superviseeIds.map(() => '?').join(',');

  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT cpa.client_id
       FROM client_provider_assignments cpa
       WHERE cpa.organization_id = ?
         AND cpa.provider_user_id IN (${placeholders})
         AND cpa.is_active = TRUE`,
      [oid, ...superviseeIds]
    );
    return (rows || []).map((r) => Number(r.client_id)).filter(Boolean);
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT c.id AS client_id
       FROM clients c
       WHERE c.organization_id = ?
         AND c.provider_id IN (${placeholders})
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')`,
      [oid, ...superviseeIds]
    );
    return (rows || []).map((r) => Number(r.client_id)).filter(Boolean);
  } catch {
    return [];
  }
}

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, user = null, schoolOrganizationId }) {
  if (!userId) return false;
  const roleNorm = String(role || '').toLowerCase();
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;

  const hasSupervisorCapability = await isSupervisorActor({ userId, role, user });

  // Providers should be allowed if they have active assignment(s) under this school.
  // They still only receive their own assigned clients from the roster endpoint.
  if (roleNorm === 'provider') {
    const hasProviderAccess = await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId });
    if (hasProviderAccess) return true;
    if (!hasSupervisorCapability) return false;
  }

  if (hasSupervisorCapability) {
    const hasSuperviseeSchoolAccess = await supervisorHasSuperviseeInSchool(userId, schoolOrganizationId);
    if (hasSuperviseeSchoolAccess) return true;
  }

  if (!roleCanUseAgencyAffiliation(role)) return false;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(activeAgencyId, 10));
}

async function listSchoolStaffAccessByClient({ userId, role, schoolOrganizationId, clientIds }) {
  if (String(role || '').toLowerCase() !== 'school_staff') return new Map();
  return ClientSchoolStaffRoiAccess.listAccessRecordsForSchoolStaff({
    schoolStaffUserId: userId,
    schoolOrganizationId,
    clientIds
  });
}

function getSchoolStaffPortalAccessMeta(client, accessMap, resolvedStateMap = new Map()) {
  const clientId = Number(client?.id || 0);
  const record = clientId ? accessMap.get(clientId) : null;
  const resolvedState = clientId ? String(resolvedStateMap.get(clientId) || '').trim().toLowerCase() : '';
  const effectiveState = resolvedState || getEffectiveSchoolStaffRoiState(record, client?.roi_expires_at || null);
  const canOpenClient = resolvedState
    ? ['limited', 'roi', 'roi_docs'].includes(effectiveState)
    : schoolStaffCanOpenClient(record, client?.roi_expires_at || null);
  const canViewDocuments = resolvedState
    ? effectiveState === 'roi_docs'
    : schoolStaffCanViewClientDocuments(record, client?.roi_expires_at || null);
  const accessLevel = resolvedState
    ? (effectiveState === 'expired' ? 'none' : effectiveState)
    : (record?.is_active ? String(record.access_level || 'packet').toLowerCase() : 'none');
  return {
    school_staff_access_level: accessLevel,
    school_staff_effective_access_state: effectiveState,
    school_staff_can_view_documents: canViewDocuments,
    school_portal_can_open: canOpenClient,
    school_portal_force_code: !canOpenClient,
    school_portal_gray: !canOpenClient
  };
}

async function ensureSchoolStaffClientRoiAccess({ userId, role, schoolOrganizationId, clientId }) {
  if (String(role || '').toLowerCase() !== 'school_staff') {
    return { ok: true };
  }
  const allowed = await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({
    clientId,
    schoolOrganizationId,
    schoolStaffUserId: userId
  });
  if (!allowed) {
    return { ok: false, status: 403, message: 'ROI access required for this client' };
  }
  return { ok: true };
}

/**
 * Get clients for school portal (restricted view)
 * GET /api/school-portal/:organizationId/clients
 * 
 * Returns only non-sensitive client data:
 * - Student Status
 * - Assigned Provider Name
 * - Admin Notes (non-clinical, shared notes only)
 * - Submission Date
 * 
 * Hidden fields (FERPA/HIPAA compliance):
 * - Billing information
 * - SSNs
 * - Clinical notes
 * - Internal notes
 */
export const getSchoolClients = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const skillsOnly = String(req.query?.skillsOnly || '').toLowerCase() === 'true';
    const clientIdFilter = req.query?.clientId ? parseInt(req.query.clientId, 10) : null;
    const orgId = parseInt(organizationId, 10);

    // Providers ARE allowed to view the roster, but only for clients assigned to them
    // (restricted fields, no sensitive data).
    // Supervisor-only (not admin/super_admin/support) gets restricted to supervisees' clients.
    // Admin/super_admin with supervisor privileges get full access; supervisor is additive (My Schedule).
    const isSupervisor = await isSupervisorActor({ userId, role: userRole, user: req.user });
    const isSupervisorOnly = isSupervisor && !isAdminLikeRole(userRole);
    const isProvider = String(userRole || '').toLowerCase() === 'provider' && !isSupervisor;
    const supervisorProviderIds = isSupervisorOnly ? await getSupervisorSuperviseeIds(userId, null) : [];

    // Verify organization exists (school/program/learning)
    const organization = await Agency.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ 
        error: { message: 'Organization not found' } 
      });
    }

    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    const allowedTypes = ['school', 'program', 'learning'];
    if (!allowedTypes.includes(orgType)) {
      return res.status(400).json({
        error: { message: `This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}` }
      });
    }

    // Access rules:
    // - school_staff/providers still rely on direct school membership
    // - agency staff/admin/support may access via the school’s active affiliated agency
    if (userRole !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: userRole, schoolOrganizationId: organizationId });
      if (!ok) {
        return res.status(403).json({
          error: { message: 'You do not have access to this school organization' }
        });
      }
    }

    // Get clients for this organization (restricted view - no sensitive data).
    // Prefer multi-org assignment tables, fall back to legacy clients.organization_id.
    let clients = [];
    try {
      const orgId = parseInt(organizationId, 10);
      const providerUserId = isProvider ? parseInt(req.user?.id || 0, 10) : null;
      const [rows] = await pool.execute(
        `SELECT
           c.id,
           c.initials,
           c.identifier_code,
           c.client_status_id,
           cs.label AS client_status_label,
           cs.status_key AS client_status_key,
           c.termination_reason,
           c.waitlist_started_at,
           c.grade,
           c.school_year,
           GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ', ') AS provider_name,
           GROUP_CONCAT(DISTINCT cpa.provider_user_id ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ',') AS provider_ids,
           GROUP_CONCAT(DISTINCT cpa.service_day ORDER BY FIELD(cpa.service_day,'Monday','Tuesday','Wednesday','Thursday','Friday') SEPARATOR ', ') AS service_day,
           MAX(CASE WHEN ? IS NOT NULL AND cpa.provider_user_id = ? THEN 1 ELSE 0 END) AS user_is_assigned_provider,
           c.submission_date,
           c.source,
           c.document_status,
           c.paperwork_status_id,
           ps.label AS paperwork_status_label,
           ps.status_key AS paperwork_status_key,
           c.paperwork_delivery_method_id,
           pdm.label AS paperwork_delivery_method_label,
           c.doc_date,
           c.parents_contacted_at,
           c.parents_contacted_successful,
           c.intake_at,
           c.first_service_at,
           c.roi_expires_at,
           c.skills,
           c.status,
           MIN(cpa.created_at) AS provider_assigned_at
         FROM clients c
         JOIN client_organization_assignments coa
           ON coa.client_id = c.id
          AND coa.organization_id = ?
          AND coa.is_active = TRUE
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         LEFT JOIN paperwork_statuses ps ON ps.id = c.paperwork_status_id
         LEFT JOIN paperwork_delivery_methods pdm ON pdm.id = c.paperwork_delivery_method_id
         LEFT JOIN client_provider_assignments cpa
           ON cpa.client_id = c.id
          AND cpa.organization_id = coa.organization_id
          AND cpa.is_active = TRUE
         LEFT JOIN users u ON u.id = cpa.provider_user_id
         WHERE (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
           AND (cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')
           AND (? = 0 OR c.skills = TRUE)
           AND (? IS NULL OR c.id = ?)
           AND (? IS NULL OR cpa.provider_user_id = ?)
         GROUP BY c.id
         ORDER BY c.submission_date DESC, c.id DESC`,
        [providerUserId, providerUserId, orgId, skillsOnly ? 1 : 0, clientIdFilter, clientIdFilter, providerUserId, providerUserId]
      );
      clients = rows || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR');
      if (!missing) throw e;

      // Legacy fallback
      const all = await Client.findByOrganizationId(parseInt(organizationId, 10), isProvider ? { provider_id: userId } : {});
      clients = (all || []).filter((c) => {
        const workflow = String(c?.status || '').toUpperCase();
        const key = String(c?.client_status_key || '').toLowerCase();
        const label = String(c?.client_status_label || '').toLowerCase();
        return workflow !== 'ARCHIVED' && key !== 'archived' && label !== 'archived';
      });
      if (clientIdFilter) clients = (clients || []).filter((c) => Number(c?.id) === Number(clientIdFilter));
      if (skillsOnly) clients = (clients || []).filter((c) => !!c?.skills);
    }

    if (isSupervisorOnly) {
      const allowedProviderIds = new Set((supervisorProviderIds || []).map((id) => Number(id)).filter(Boolean));
      clients = (clients || []).filter((client) => {
        const rawProviderIds = String(client?.provider_ids || '').trim();
        if (rawProviderIds) {
          const rowProviderIds = rawProviderIds
            .split(',')
            .map((v) => parseInt(v, 10))
            .filter((n) => Number.isFinite(n) && n > 0);
          return rowProviderIds.some((pid) => allowedProviderIds.has(pid));
        }
        const legacyProviderId = parseInt(client?.provider_id, 10);
        return Number.isFinite(legacyProviderId) && allowedProviderIds.has(legacyProviderId);
      });
    }

    // Total comment counts (per client).
    const totalNotesByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT n.client_id, COUNT(*) AS total_count
           FROM client_notes n
           WHERE n.client_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND (n.category IS NULL OR n.category = 'comment')
           GROUP BY n.client_id`,
          clientIds
        );
        for (const r of rows || []) {
          totalNotesByClientId.set(Number(r.client_id), Number(r.total_count || 0));
        }
      }
    } catch {
      // ignore
    }

    // Unread note counts (per user) - best effort if table exists.
    const unreadCountsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT n.client_id, COUNT(*) AS unread_count
           FROM client_notes n
           LEFT JOIN client_note_reads r
             ON r.client_id = n.client_id AND r.user_id = ?
           WHERE n.client_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND n.created_at > COALESCE(r.last_read_at, '1970-01-01')
           GROUP BY n.client_id`,
          [userId, ...clientIds]
        );
        for (const r of rows || []) {
          unreadCountsByClientId.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      }
    } catch {
      // table may not exist yet; ignore
    }

    // Unread ticket message counts (per user) - best effort when tables exist.
    const unreadTicketMsgsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId && orgId && (await hasSupportTicketMessagesTable())) {
        const placeholders = clientIds.map(() => '?').join(',');
        const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
        const [rows] = await pool.execute(
          `SELECT t.client_id, COUNT(*) AS unread_count
           FROM support_tickets t
           JOIN support_ticket_messages m ON m.ticket_id = t.id
           LEFT JOIN support_ticket_thread_reads r
             ON r.school_organization_id = t.school_organization_id
            AND r.client_id = t.client_id
            AND r.user_id = ?
           WHERE t.school_organization_id = ?
             AND t.client_id IN (${placeholders})
             ${hasSoftDelete ? 'AND (m.is_deleted IS NULL OR m.is_deleted = 0)' : ''}
             AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')
           GROUP BY t.client_id`,
          [userId, orgId, ...clientIds]
        );
        for (const r of rows || []) {
          unreadTicketMsgsByClientId.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      }
    } catch {
      // ignore (tables may not exist yet)
    }

    // Ticket status counts (per client).
    const openTicketsByClientId = new Map();
    const answeredTicketsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && orgId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT t.client_id,
                  SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('answered', 'closed') THEN 0 ELSE 1 END) AS open_count,
                  SUM(CASE WHEN LOWER(t.status) = 'answered' THEN 1 ELSE 0 END) AS answered_count
           FROM support_tickets t
           WHERE t.school_organization_id = ?
             AND t.client_id IN (${placeholders})
           GROUP BY t.client_id`,
          [orgId, ...clientIds]
        );
        for (const r of rows || []) {
          openTicketsByClientId.set(Number(r.client_id), Number(r.open_count || 0));
          answeredTicketsByClientId.set(Number(r.client_id), Number(r.answered_count || 0));
        }
      }
    } catch {
      // ignore (tables may not exist yet)
    }

    // Total ticket message counts (per client).
    const totalTicketMsgsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && orgId && (await hasSupportTicketMessagesTable())) {
        const placeholders = clientIds.map(() => '?').join(',');
        const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
        const [rows] = await pool.execute(
          `SELECT t.client_id, COUNT(*) AS total_count
           FROM support_tickets t
           JOIN support_ticket_messages m ON m.ticket_id = t.id
           WHERE t.school_organization_id = ?
             AND t.client_id IN (${placeholders})
             ${hasSoftDelete ? 'AND (m.is_deleted IS NULL OR m.is_deleted = 0)' : ''}
           GROUP BY t.client_id`,
          [orgId, ...clientIds]
        );
        for (const r of rows || []) {
          totalTicketMsgsByClientId.set(Number(r.client_id), Number(r.total_count || 0));
        }
      }
    } catch {
      // ignore
    }

    const unreadUpdatesByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId && orgId) {
        const counts = await getUnreadClientUpdateCounts({ userId, orgId, clientIds });
        for (const [cid, cnt] of counts.entries()) {
          unreadUpdatesByClientId.set(Number(cid), Number(cnt || 0));
        }
      }
    } catch {
      // ignore
    }

    const schoolStaffAccessByClientId = await listSchoolStaffAccessByClient({
      userId,
      role: userRole,
      schoolOrganizationId: orgId,
      clientIds: (clients || []).map((c) => Number(c?.id)).filter(Boolean)
    });
    const schoolStaffResolvedStateByClientId = new Map();
    const schedulerOwnOnly = await isSchedulerSchoolStaff({
      userId,
      role: userRole,
      actorEmail: req.user?.email || req.user?.username || null,
      orgId
    });
    if (String(userRole || '').toLowerCase() === 'school_staff') {
      await Promise.all(
        (clients || []).map(async (client) => {
          const cid = Number(client?.id || 0);
          if (!cid) return;
          const state = schedulerOwnOnly
            ? 'limited'
            : await ClientSchoolStaffRoiAccess.resolveSchoolStaffClientAccessState({
                clientId: cid,
                schoolOrganizationId: orgId,
                schoolStaffUserId: userId
              });
          schoolStaffResolvedStateByClientId.set(cid, state);
        })
      );
    }
    const limitedOwnOpenTicketsByClientId = new Map();
    const limitedOwnAnsweredTicketsByClientId = new Map();
    const limitedOwnTicketMessagesByClientId = new Map();
    if (String(userRole || '').toLowerCase() === 'school_staff') {
      const limitedClientIds = (clients || [])
        .map((c) => Number(c?.id || 0))
        .filter((cid) => cid > 0 && String(schoolStaffResolvedStateByClientId.get(cid) || '').toLowerCase() === 'limited');
      if (limitedClientIds.length > 0) {
        const placeholders = limitedClientIds.map(() => '?').join(',');
        try {
          const [rows] = await pool.execute(
            `SELECT t.client_id,
                    SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('answered', 'closed') THEN 0 ELSE 1 END) AS open_count,
                    SUM(CASE WHEN LOWER(t.status) = 'answered' THEN 1 ELSE 0 END) AS answered_count
             FROM support_tickets t
             WHERE t.school_organization_id = ?
               AND t.created_by_user_id = ?
               AND t.client_id IN (${placeholders})
             GROUP BY t.client_id`,
            [orgId, userId, ...limitedClientIds]
          );
          for (const row of rows || []) {
            limitedOwnOpenTicketsByClientId.set(Number(row.client_id), Number(row.open_count || 0));
            limitedOwnAnsweredTicketsByClientId.set(Number(row.client_id), Number(row.answered_count || 0));
          }
        } catch {
          // ignore
        }
        try {
          if (await hasSupportTicketMessagesTable()) {
            const [rows] = await pool.execute(
              `SELECT t.client_id, COUNT(*) AS total_count
               FROM support_tickets t
               JOIN support_ticket_messages m ON m.ticket_id = t.id
               WHERE t.school_organization_id = ?
                 AND t.created_by_user_id = ?
                 AND m.author_user_id = ?
                 AND t.client_id IN (${placeholders})
               GROUP BY t.client_id`,
              [orgId, userId, userId, ...limitedClientIds]
            );
            for (const row of rows || []) {
              limitedOwnTicketMessagesByClientId.set(Number(row.client_id), Number(row.total_count || 0));
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // Format response: Only include non-sensitive fields
    const restrictedClients = clients.map(client => {
      const clientId = Number(client.id);
      const schoolStaffAccessMeta = String(userRole || '').toLowerCase() === 'school_staff'
        ? getSchoolStaffPortalAccessMeta(client, schoolStaffAccessByClientId, schoolStaffResolvedStateByClientId)
        : {
            school_staff_access_level: null,
            school_staff_effective_access_state: null,
            school_portal_can_open: true,
            school_portal_force_code: false,
            school_portal_gray: false
          };
      const isLimitedSchoolStaff = String(schoolStaffAccessMeta.school_staff_effective_access_state || '').toLowerCase() === 'limited';
      const openTicketCount = isLimitedSchoolStaff
        ? (limitedOwnOpenTicketsByClientId.get(clientId) || 0)
        : (openTicketsByClientId.get(clientId) || 0);
      const answeredTicketCount = isLimitedSchoolStaff
        ? (limitedOwnAnsweredTicketsByClientId.get(clientId) || 0)
        : (answeredTicketsByClientId.get(clientId) || 0);
      const unreadTicketMessagesCount = isLimitedSchoolStaff
        ? 0
        : (unreadTicketMsgsByClientId.get(clientId) || 0);
      const ticketMessagesCount = isLimitedSchoolStaff
        ? (limitedOwnTicketMessagesByClientId.get(clientId) || 0)
        : (totalTicketMsgsByClientId.get(clientId) || 0);
      return {
        id: client.id,
        initials: client.initials,
        identifier_code: client.identifier_code || null,
        // "status" (workflow) is treated as an internal archive flag; schools should see the configured client status.
        client_status_id: client.client_status_id || null,
        client_status_label: client.client_status_label || null,
        client_status_key: client.client_status_key || null,
        termination_reason: client.termination_reason || null,
        waitlist_started_at: client.waitlist_started_at || null,
        grade: client.grade || null,
        school_year: client.school_year || null,
        provider_id: null,
        provider_name: client.provider_name || null,
        service_day: client.service_day || null,
        user_is_assigned_provider: client.user_is_assigned_provider === 1 || client.user_is_assigned_provider === true,
        submission_date: client.submission_date,
        source: client.source || null,
        // For the portal, "Doc Status" should reflect paperwork status/delivery (new model),
        // while still exposing legacy document_status for backward compatibility.
        document_status: client.document_status,
        paperwork_status_id: client.paperwork_status_id || null,
        paperwork_status_label: client.paperwork_status_label || null,
        paperwork_status_key: client.paperwork_status_key || null,
        paperwork_delivery_method_id: client.paperwork_delivery_method_id || null,
        paperwork_delivery_method_label: client.paperwork_delivery_method_label || null,
        doc_date: client.doc_date || null,
        roi_expires_at: client.roi_expires_at || null,
        skills: client.skills === 1 || client.skills === true,
        unread_notes_count: unreadCountsByClientId.get(clientId) || 0,
        notes_count: totalNotesByClientId.get(clientId) || 0,
        unread_ticket_messages_count: unreadTicketMessagesCount,
        ticket_messages_count: ticketMessagesCount,
        unread_updates_count: unreadUpdatesByClientId.get(clientId) || 0,
        open_ticket_count: openTicketCount,
        answered_ticket_count: answeredTicketCount,
        has_open_ticket: openTicketCount > 0,
        has_answered_ticket: answeredTicketCount > 0,
        ...schoolStaffAccessMeta
      };
    });

    // Waitlist UI helpers: compute days waitlisted + rank within this org.
    try {
      const now = Date.now();
      const MS_DAY = 24 * 60 * 60 * 1000;
      const waitlisted = restrictedClients
        .filter((c) => String(c?.client_status_key || '').toLowerCase() === 'waitlist')
        .map((c) => ({
          id: Number(c.id),
          startedAt: c.waitlist_started_at || c.submission_date || null
        }))
        .filter((x) => Number.isFinite(x.id));

      waitlisted.sort((a, b) => {
        const at = a.startedAt ? new Date(a.startedAt).getTime() : Number.POSITIVE_INFINITY;
        const bt = b.startedAt ? new Date(b.startedAt).getTime() : Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        return a.id - b.id;
      });

      const rankById = new Map();
      waitlisted.forEach((w, idx) => rankById.set(w.id, idx + 1));

      for (const c of restrictedClients) {
        if (String(c?.client_status_key || '').toLowerCase() !== 'waitlist') {
          c.waitlist_days = null;
          c.waitlist_rank = null;
          continue;
        }
        const startedAt = c.waitlist_started_at || c.submission_date || null;
        const startedMs = startedAt ? new Date(startedAt).getTime() : NaN;
        const days = Number.isFinite(startedMs) ? Math.max(0, Math.floor((now - startedMs) / MS_DAY)) : 0;
        c.waitlist_days = days;
        c.waitlist_rank = rankById.get(Number(c.id)) || null;
      }
    } catch {
      // ignore
    }

    const agencyId = await resolveActiveAgencyIdForOrg(orgId);
    logAuditEvent(req, { actionType: 'school_portal_roster_viewed', agencyId: agencyId || undefined }).catch(() => {});

    res.json(restrictedClients);
  } catch (error) {
    console.error('School portal clients error:', error);
    next(error);
  }
};

/**
 * Provider-only roster view.
 * GET /api/school-portal/:organizationId/my-roster
 *
 * This endpoint intentionally does NOT reuse the broader org-access gate.
 * If the provider has no assigned clients for this org, it returns [] (200) instead of 403.
 */
export const getProviderMyRoster = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.id;
    const userRole = String(req.user?.role || '').toLowerCase();

    const providerRoles = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'];
    if (!providerRoles.includes(userRole)) {
      return res.status(403).json({ error: { message: 'Provider access required' } });
    }
    const providerUserId = parseInt(userId, 10);
    if (!providerUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    // First principles: the provider roster is defined by assignments, not by org metadata.
    // We intentionally avoid hard-failing (404) if the org record can’t be resolved.
    // NOTE: Callers may pass a slug instead of numeric id.
    let orgId = parseInt(String(organizationId), 10);
    if (!Number.isFinite(orgId) || orgId < 1) {
      try {
        const org = await Agency.findBySlug(String(organizationId || '').trim().toLowerCase());
        orgId = org?.id ? parseInt(String(org.id), 10) : NaN;
      } catch {
        orgId = NaN;
      }
    }
    if (!Number.isFinite(orgId) || orgId < 1) {
      // No org key resolved → treat as empty roster rather than 404 (prevents broken UX).
      return res.json([]);
    }

    const skillsOnly = false;

    // Use the same restricted roster query but force provider filtering.
    let clients = [];
    try {
      const [rows] = await pool.execute(
        `SELECT
           c.id,
           coa.organization_id AS organization_id,
           c.initials,
           c.identifier_code,
           c.client_status_id,
           cs.label AS client_status_label,
           cs.status_key AS client_status_key,
           c.termination_reason,
           c.waitlist_started_at,
           c.grade,
           c.school_year,
           GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ', ') AS provider_name,
           GROUP_CONCAT(DISTINCT cpa.provider_user_id ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ',') AS provider_ids,
           GROUP_CONCAT(DISTINCT cpa.service_day ORDER BY FIELD(cpa.service_day,'Monday','Tuesday','Wednesday','Thursday','Friday') SEPARATOR ', ') AS service_day,
           1 AS user_is_assigned_provider,
           c.submission_date,
           c.source,
           c.document_status,
           c.paperwork_status_id,
           ps.label AS paperwork_status_label,
           ps.status_key AS paperwork_status_key,
           c.paperwork_delivery_method_id,
           pdm.label AS paperwork_delivery_method_label,
           c.doc_date,
           c.parents_contacted_at,
           c.parents_contacted_successful,
           c.intake_at,
           c.first_service_at,
           c.roi_expires_at,
           c.skills,
           c.status,
           MIN(cpa.created_at) AS provider_assigned_at
         FROM clients c
         JOIN client_organization_assignments coa
           ON coa.client_id = c.id
          AND coa.organization_id = ?
          AND coa.is_active = TRUE
         JOIN client_provider_assignments cpa
           ON cpa.client_id = c.id
          AND cpa.organization_id = coa.organization_id
          AND cpa.is_active = TRUE
          AND cpa.provider_user_id = ?
         LEFT JOIN users u ON u.id = cpa.provider_user_id
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         LEFT JOIN paperwork_statuses ps ON ps.id = c.paperwork_status_id
         LEFT JOIN paperwork_delivery_methods pdm ON pdm.id = c.paperwork_delivery_method_id
         WHERE (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
           AND (cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')
           AND (? = 0 OR c.skills = TRUE)
         GROUP BY c.id, coa.organization_id
         ORDER BY c.submission_date DESC, c.id DESC`,
        [orgId, providerUserId, skillsOnly ? 1 : 0]
      );
      clients = rows || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR');
      if (!missing) throw e;

      // Legacy fallback: clients.organization_id + clients.provider_id
      const all = await Client.findByOrganizationId(parseInt(orgId, 10), { provider_id: providerUserId });
      clients = (all || []).filter((c) => {
        const workflow = String(c?.status || '').toUpperCase();
        const key = String(c?.client_status_key || '').toLowerCase();
        const label = String(c?.client_status_label || '').toLowerCase();
        return workflow !== 'ARCHIVED' && key !== 'archived' && label !== 'archived';
      });
    }

    // Total comment counts (per client).
    const totalNotesByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT n.client_id, COUNT(*) AS total_count
           FROM client_notes n
           WHERE n.client_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND (n.category IS NULL OR n.category = 'comment')
           GROUP BY n.client_id`,
          clientIds
        );
        for (const r of rows || []) {
          totalNotesByClientId.set(Number(r.client_id), Number(r.total_count || 0));
        }
      }
    } catch {
      // ignore
    }

    // Unread note counts (per user) - best effort if table exists.
    const unreadCountsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT n.client_id, COUNT(*) AS unread_count
           FROM client_notes n
           LEFT JOIN client_note_reads r
             ON r.client_id = n.client_id AND r.user_id = ?
           WHERE n.client_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND n.created_at > COALESCE(r.last_read_at, '1970-01-01')
           GROUP BY n.client_id`,
          [userId, ...clientIds]
        );
        for (const r of rows || []) {
          unreadCountsByClientId.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      }
    } catch {
      // ignore
    }

    // Unread ticket message counts (per user) - best effort when tables exist.
    const unreadTicketMsgsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId && orgId && (await hasSupportTicketMessagesTable())) {
        const placeholders = clientIds.map(() => '?').join(',');
        const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
        const [rows] = await pool.execute(
          `SELECT t.client_id, COUNT(*) AS unread_count
           FROM support_tickets t
           JOIN support_ticket_messages m ON m.ticket_id = t.id
           LEFT JOIN support_ticket_thread_reads r
             ON r.school_organization_id = t.school_organization_id
            AND r.client_id = t.client_id
            AND r.user_id = ?
           WHERE t.school_organization_id = ?
             AND t.client_id IN (${placeholders})
             ${hasSoftDelete ? 'AND (m.is_deleted IS NULL OR m.is_deleted = 0)' : ''}
             AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')
           GROUP BY t.client_id`,
          [userId, orgId, ...clientIds]
        );
        for (const r of rows || []) {
          unreadTicketMsgsByClientId.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      }
    } catch {
      // ignore (tables may not exist yet)
    }

    // Ticket status counts (per client).
    const openTicketsByClientId = new Map();
    const answeredTicketsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && orgId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT t.client_id,
                  SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('answered', 'closed') THEN 0 ELSE 1 END) AS open_count,
                  SUM(CASE WHEN LOWER(t.status) = 'answered' THEN 1 ELSE 0 END) AS answered_count
           FROM support_tickets t
           WHERE t.school_organization_id = ?
             AND t.client_id IN (${placeholders})
           GROUP BY t.client_id`,
          [orgId, ...clientIds]
        );
        for (const r of rows || []) {
          openTicketsByClientId.set(Number(r.client_id), Number(r.open_count || 0));
          answeredTicketsByClientId.set(Number(r.client_id), Number(r.answered_count || 0));
        }
      }
    } catch {
      // ignore (tables may not exist yet)
    }

    // Total ticket message counts (per client).
    const totalTicketMsgsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && orgId && (await hasSupportTicketMessagesTable())) {
        const placeholders = clientIds.map(() => '?').join(',');
        const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
        const [rows] = await pool.execute(
          `SELECT t.client_id, COUNT(*) AS total_count
           FROM support_tickets t
           JOIN support_ticket_messages m ON m.ticket_id = t.id
           WHERE t.school_organization_id = ?
             AND t.client_id IN (${placeholders})
             ${hasSoftDelete ? 'AND (m.is_deleted IS NULL OR m.is_deleted = 0)' : ''}
           GROUP BY t.client_id`,
          [orgId, ...clientIds]
        );
        for (const r of rows || []) {
          totalTicketMsgsByClientId.set(Number(r.client_id), Number(r.total_count || 0));
        }
      }
    } catch {
      // ignore
    }

    const unreadUpdatesByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId && orgId) {
        const counts = await getUnreadClientUpdateCounts({ userId, orgId, clientIds });
        for (const [cid, cnt] of counts.entries()) {
          unreadUpdatesByClientId.set(Number(cid), Number(cnt || 0));
        }
      }
    } catch {
      // ignore
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const restrictedClients = clients.map((client) => {
      const firstServiceAt = client.first_service_at ? new Date(client.first_service_at) : null;
      const firstServicePassed = firstServiceAt && firstServiceAt.getTime() <= today.getTime();
      const statusKey = String(client?.client_status_key || '').toLowerCase();
      const workflow = String(client?.status || '').toUpperCase();
      const isPendingStatus = statusKey === 'pending' || workflow === 'PENDING_REVIEW';
      const isCurrentByDates = firstServicePassed;
      const compliancePending = isPendingStatus && !isCurrentByDates;
      const assignedAt = client.provider_assigned_at ? new Date(client.provider_assigned_at) : null;
      const daysSinceAssigned = assignedAt
        ? Math.max(0, Math.floor((today.getTime() - assignedAt.getTime()) / (24 * 60 * 60 * 1000)))
        : 0;
      const missingChecklist = [];
      const parentsContactedAt = client.parents_contacted_at ? new Date(client.parents_contacted_at) : null;
      const parentsContactedOk =
        client.parents_contacted_successful === 1 || client.parents_contacted_successful === true;
      if (!parentsContactedAt || !parentsContactedOk) missingChecklist.push('Parents contacted');
      if (!firstServicePassed) missingChecklist.push('First session');
      return {
        id: client.id,
        initials: client.initials,
        identifier_code: client.identifier_code || null,
        client_status_id: client.client_status_id || null,
        client_status_label: client.client_status_label || null,
        client_status_key: client.client_status_key || null,
        termination_reason: client.termination_reason || null,
        waitlist_started_at: client.waitlist_started_at || null,
        grade: client.grade || null,
        school_year: client.school_year || null,
        provider_id: providerUserId,
        provider_name: client.provider_name || null,
        service_day: client.service_day || null,
        user_is_assigned_provider: true,
        submission_date: client.submission_date,
        source: client.source || null,
        document_status: client.document_status,
        paperwork_status_id: client.paperwork_status_id || null,
        paperwork_status_label: client.paperwork_status_label || null,
        paperwork_status_key: client.paperwork_status_key || null,
        paperwork_delivery_method_id: client.paperwork_delivery_method_id || null,
        paperwork_delivery_method_label: client.paperwork_delivery_method_label || null,
        doc_date: client.doc_date || null,
        roi_expires_at: client.roi_expires_at || null,
        skills: client.skills === 1 || client.skills === true,
        unread_notes_count: unreadCountsByClientId.get(Number(client.id)) || 0,
        notes_count: totalNotesByClientId.get(Number(client.id)) || 0,
        unread_ticket_messages_count: unreadTicketMsgsByClientId.get(Number(client.id)) || 0,
        ticket_messages_count: totalTicketMsgsByClientId.get(Number(client.id)) || 0,
        unread_updates_count: unreadUpdatesByClientId.get(Number(client.id)) || 0,
        open_ticket_count: openTicketsByClientId.get(Number(client.id)) || 0,
        answered_ticket_count: answeredTicketsByClientId.get(Number(client.id)) || 0,
        has_open_ticket: (openTicketsByClientId.get(Number(client.id)) || 0) > 0,
        has_answered_ticket: (answeredTicketsByClientId.get(Number(client.id)) || 0) > 0,
        compliance_pending: compliancePending,
        compliance_days_since_assigned: daysSinceAssigned,
        compliance_missing: missingChecklist,
        provider_assigned_at: client.provider_assigned_at || null
      };
    });

    // Waitlist helpers within this org for providers too.
    try {
      const now = Date.now();
      const MS_DAY = 24 * 60 * 60 * 1000;
      const waitlisted = restrictedClients
        .filter((c) => String(c?.client_status_key || '').toLowerCase() === 'waitlist')
        .map((c) => ({
          id: Number(c.id),
          startedAt: c.waitlist_started_at || c.submission_date || null
        }))
        .filter((x) => Number.isFinite(x.id));

      waitlisted.sort((a, b) => {
        const at = a.startedAt ? new Date(a.startedAt).getTime() : Number.POSITIVE_INFINITY;
        const bt = b.startedAt ? new Date(b.startedAt).getTime() : Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        return a.id - b.id;
      });

      const rankById = new Map();
      waitlisted.forEach((w, idx) => rankById.set(w.id, idx + 1));

      for (const c of restrictedClients) {
        if (String(c?.client_status_key || '').toLowerCase() !== 'waitlist') {
          c.waitlist_days = null;
          c.waitlist_rank = null;
          continue;
        }
        const startedAt = c.waitlist_started_at || c.submission_date || null;
        const startedMs = startedAt ? new Date(startedAt).getTime() : NaN;
        const days = Number.isFinite(startedMs) ? Math.max(0, Math.floor((now - startedMs) / MS_DAY)) : 0;
        c.waitlist_days = days;
        c.waitlist_rank = rankById.get(Number(c.id)) || null;
      }
    } catch {
      // ignore
    }

    const agencyId = await resolveActiveAgencyIdForOrg(orgId);
    logAuditEvent(req, { actionType: 'school_portal_roster_viewed', agencyId: agencyId || undefined }).catch(() => {});

    res.json(restrictedClients);
  } catch (e) {
    next(e);
  }
};

/**
 * Provider confirms current school-day availability (weekly splash action).
 * POST /api/school-portal/:organizationId/provider-availability/confirm
 */
export const confirmProviderSchoolAvailability = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(String(organizationId), 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = Number(req.user?.id || 0);
    const role = String(req.user?.role || '').toLowerCase();
    const providerRoles = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'];
    if (!providerRoles.includes(role)) {
      return res.status(403).json({ error: { message: 'Provider access required' } });
    }
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const [providerRows] = await pool.execute(
      `SELECT DISTINCT psa.provider_user_id
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ? AND psa.provider_user_id = ? AND psa.is_active = TRUE
       LIMIT 1`,
      [orgId, userId]
    );
    if (!providerRows?.[0]) {
      return res.status(403).json({ error: { message: 'You are not assigned to this school schedule' } });
    }

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    if (!activeAgencyId) {
      return res.status(400).json({ error: { message: 'No active agency affiliation found for this school' } });
    }

    const [dayRows] = await pool.execute(
      `SELECT day_of_week, slots_total, slots_available, start_time, end_time
       FROM provider_school_assignments
       WHERE school_organization_id = ? AND provider_user_id = ? AND is_active = TRUE
       ORDER BY FIELD(day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday')`,
      [orgId, userId]
    );

    const [clientRows] = await pool.execute(
      `SELECT c.id, cpa.service_day
       FROM clients c
       JOIN client_organization_assignments coa
         ON coa.client_id = c.id
        AND coa.organization_id = ?
        AND coa.is_active = TRUE
       JOIN client_provider_assignments cpa
         ON cpa.client_id = c.id
        AND cpa.organization_id = coa.organization_id
        AND cpa.provider_user_id = ?
        AND cpa.is_active = TRUE
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
         AND (cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')`,
      [orgId, userId]
    );

    const assignedTotal = Number((clientRows || []).length || 0);
    const clientsByDay = new Map();
    for (const r of (clientRows || [])) {
      const days = String(r?.service_day || '')
        .split(',')
        .map((d) => d.trim())
        .filter((d) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(d));
      for (const d of Array.from(new Set(days))) {
        clientsByDay.set(d, Number(clientsByDay.get(d) || 0) + 1);
      }
    }

    const lines = (dayRows || []).map((d) => {
      const day = String(d?.day_of_week || '').trim();
      const assigned = Number(clientsByDay.get(day) || 0);
      const slots = Number(d?.slots_total || 0);
      const available = Number(d?.slots_available ?? (slots - assigned));
      const st = String(d?.start_time || '').slice(0, 5) || '—';
      const et = String(d?.end_time || '').slice(0, 5) || '—';
      return `${day}: ${assigned} assigned, ${available} available slots, hours ${st}-${et}`;
    });

    const actor = await User.findById(userId);
    const actorName =
      `${actor?.first_name || ''} ${actor?.last_name || ''}`.trim() ||
      actor?.email ||
      `Provider #${userId}`;
    const school = await Agency.findById(orgId);
    const schoolName = school?.name || school?.official_name || `School #${orgId}`;

    const Notification = (await import('../models/Notification.model.js')).default;
    const recipients = await getAgencyAdminOnlyUserIds(activeAgencyId);
    const uniqueRecipients = Array.from(new Set(recipients));
    await Promise.all(uniqueRecipients.map(async (adminUserId) => {
      await Notification.create({
        type: 'school_provider_availability_confirmed',
        severity: 'info',
        title: 'Provider weekly availability confirmed',
        message: `${actorName} confirmed school availability for ${schoolName}. Assigned clients: ${assignedTotal}.${lines.length ? ` ${lines.join(' | ')}` : ''}`,
        userId: adminUserId,
        agencyId: activeAgencyId,
        relatedEntityType: 'school_organization',
        relatedEntityId: orgId,
        actorUserId: userId,
        actorSource: 'School Portal'
      });
    }));

    res.json({ ok: true, notifiedCount: uniqueRecipients.length });
  } catch (e) {
    next(e);
  }
};

/**
 * Provider applies an availability update directly to provider_school_assignments
 * for a single existing school day assignment.
 * POST /api/school-portal/:organizationId/provider-availability/apply
 */
export const applyProviderSchoolAvailability = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(String(organizationId), 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = Number(req.user?.id || 0);
    const role = String(req.user?.role || '').toLowerCase();
    const providerRoles = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'];
    if (!providerRoles.includes(role)) {
      return res.status(403).json({ error: { message: 'Provider access required' } });
    }
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const dayOfWeek = String(req.body?.dayOfWeek || '').trim();
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (!validDays.includes(dayOfWeek)) {
      return res.status(400).json({ error: { message: 'A valid weekday is required' } });
    }

    const slotsTotal = Number(req.body?.slotsTotal);
    if (!Number.isInteger(slotsTotal) || slotsTotal < 0) {
      return res.status(400).json({ error: { message: 'slotsTotal must be a non-negative integer' } });
    }

    const fromSlotsTotal = Number(req.body?.fromSlotsTotal);
    const fromStartTime = String(req.body?.fromStartTime || '').trim().slice(0, 5);
    const fromEndTime = String(req.body?.fromEndTime || '').trim().slice(0, 5);
    if (!Number.isInteger(fromSlotsTotal) || !fromStartTime || !fromEndTime) {
      return res.status(400).json({
        error: { message: 'fromSlotsTotal, fromStartTime, and fromEndTime are required for confirm/apply' }
      });
    }

    const requestedStartTime = String(req.body?.startTime || '').trim().slice(0, 5);
    const requestedEndTime = String(req.body?.endTime || '').trim().slice(0, 5);
    if (!requestedStartTime || !requestedEndTime || requestedEndTime <= requestedStartTime) {
      return res.status(400).json({ error: { message: 'Valid startTime and endTime are required' } });
    }

    const allowOverAssigned = req.body?.allowOverAssigned === true;

    const [providerRows] = await pool.execute(
      `SELECT DISTINCT psa.provider_user_id
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ? AND psa.provider_user_id = ? AND psa.is_active = TRUE
       LIMIT 1`,
      [orgId, userId]
    );
    if (!providerRows?.[0]) {
      return res.status(403).json({ error: { message: 'You are not assigned to this school schedule' } });
    }

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    if (!activeAgencyId) {
      return res.status(400).json({ error: { message: 'No active agency affiliation found for this school' } });
    }

    const [assignmentRows] = await pool.execute(
      `SELECT id, slots_total, slots_available, start_time, end_time
       FROM provider_school_assignments
       WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ?
       LIMIT 1`,
      [orgId, userId, dayOfWeek]
    );
    const assignment = assignmentRows?.[0] || null;
    if (!assignment) {
      return res.status(404).json({ error: { message: 'No existing assignment found for this day' } });
    }

    const currentSlots = Number(assignment.slots_total || 0);
    const currentStart = String(assignment.start_time || '').slice(0, 5);
    const currentEnd = String(assignment.end_time || '').slice(0, 5);
    if (fromSlotsTotal !== currentSlots || fromStartTime !== currentStart || fromEndTime !== currentEnd) {
      return res.status(409).json({
        error: { message: 'Availability changed since you opened this form. Please review current values and try again.' },
        current: {
          dayOfWeek,
          slotsTotal: currentSlots,
          startTime: currentStart,
          endTime: currentEnd
        }
      });
    }

    const [assignedRows] = await pool.execute(
      `SELECT COUNT(DISTINCT c.id) AS assigned_count
       FROM clients c
       JOIN client_organization_assignments coa
         ON coa.client_id = c.id
        AND coa.organization_id = ?
        AND coa.is_active = TRUE
       JOIN client_provider_assignments cpa
         ON cpa.client_id = c.id
        AND cpa.organization_id = coa.organization_id
        AND cpa.provider_user_id = ?
        AND cpa.is_active = TRUE
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
         AND (cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')
         AND FIND_IN_SET(?, REPLACE(COALESCE(cpa.service_day, ''), ' ', '')) > 0`,
      [orgId, userId, dayOfWeek]
    );
    const assignedCount = Number(assignedRows?.[0]?.assigned_count || 0);

    if (slotsTotal < assignedCount && !allowOverAssigned) {
      return res.status(409).json({
        error: {
          message: `Requested slots (${slotsTotal}) are below assigned clients (${assignedCount}) for ${dayOfWeek}. Confirm override if you still want to apply.`
        },
        requiresOverride: true,
        assignedClients: assignedCount,
        requestedSlots: slotsTotal
      });
    }

    const nextSlotsAvailable = Math.max(0, slotsTotal - assignedCount);
    await pool.execute(
      `UPDATE provider_school_assignments
       SET slots_total = ?,
           slots_available = ?,
           start_time = ?,
           end_time = ?,
           is_active = TRUE
       WHERE id = ?`,
      [slotsTotal, nextSlotsAvailable, `${requestedStartTime}:00`, `${requestedEndTime}:00`, Number(assignment.id)]
    );

    const actor = await User.findById(userId);
    const actorName =
      `${actor?.first_name || ''} ${actor?.last_name || ''}`.trim() ||
      actor?.email ||
      `Provider #${userId}`;
    const school = await Agency.findById(orgId);
    const schoolName = school?.name || school?.official_name || `School #${orgId}`;

    logAuditEvent(req, {
      actionType: 'school_provider_availability_updated_by_provider',
      agencyId: activeAgencyId || undefined,
      metadata: {
        schoolOrganizationId: orgId,
        dayOfWeek,
        before: { slotsTotal: currentSlots, startTime: currentStart, endTime: currentEnd },
        after: { slotsTotal, startTime: requestedStartTime, endTime: requestedEndTime },
        assignedClients: assignedCount,
        allowOverAssigned
      }
    }).catch(() => {});

    const Notification = (await import('../models/Notification.model.js')).default;
    const recipients = await getAgencyAdminOnlyUserIds(activeAgencyId);
    const uniqueRecipients = Array.from(new Set(recipients));
    await Promise.all(uniqueRecipients.map(async (adminUserId) => {
      await Notification.create({
        type: 'school_provider_availability_updated',
        severity: slotsTotal < assignedCount ? 'warning' : 'info',
        title: 'Provider school availability updated',
        message: `${actorName} updated ${schoolName} (${dayOfWeek}) availability: slots ${currentSlots} -> ${slotsTotal}, hours ${currentStart}-${currentEnd} -> ${requestedStartTime}-${requestedEndTime}. Assigned clients: ${assignedCount}.`,
        userId: adminUserId,
        agencyId: activeAgencyId,
        relatedEntityType: 'school_organization',
        relatedEntityId: orgId,
        actorUserId: userId,
        actorSource: 'School Portal'
      });
    }));

    res.json({
      ok: true,
      notifiedCount: uniqueRecipients.length,
      warning: slotsTotal < assignedCount
        ? {
            overAssigned: true,
            dayOfWeek,
            assignedClients: assignedCount,
            slotsTotal
          }
        : null,
      assignment: {
        dayOfWeek,
        slotsTotal,
        slotsAvailable: nextSlotsAvailable,
        startTime: requestedStartTime,
        endTime: requestedEndTime,
        assignedClients: assignedCount
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Get school -> agency affiliation context for UI gating.
 * GET /api/school-portal/:schoolId/affiliation
 */
export const getSchoolPortalAffiliation = async (req, res, next) => {
  try {
    const { schoolId } = req.params;
    const sid = parseInt(schoolId, 10);
    if (!sid) return res.status(400).json({ error: { message: 'Invalid schoolId' } });

    const org = await Agency.findById(sid);
    if (!org) return res.status(404).json({ error: { message: 'School organization not found' } });
    const orgType = String(org.organization_type || 'agency').toLowerCase();
    if (orgType !== 'school') return res.status(400).json({ error: { message: 'This endpoint is only available for school organizations' } });

    const activeAgencyId = await resolveActiveAgencyIdForOrg(sid);
    const userId = req.user?.id;
    const role = req.user?.role;
    const roleNorm = String(role || '').toLowerCase();

    let userHasAgencyAccess = false;
    let userHasSchoolAccess = false;
    if (userId) {
      const orgs = await User.getAgencies(userId);
      userHasSchoolAccess = (orgs || []).some((o) => parseInt(o.id, 10) === sid);
      userHasAgencyAccess = activeAgencyId
        ? (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(activeAgencyId, 10))
        : false;
    }

    // UI gating:
    // - Never allow edit from school_staff
    // - super_admin always allowed
    // - admin/staff/support allowed when they have agency access via active affiliation
    // - provider allowed when they have agency access (to adjust checklist items for assigned clients)
    const canEditClients =
      roleNorm === 'super_admin'
        ? true
        : roleNorm === 'provider'
          ? !!activeAgencyId && userHasAgencyAccess
          : (roleCanUseAgencyAffiliation(role) &&
            !!activeAgencyId &&
            userHasAgencyAccess &&
            roleNorm !== 'school_staff' &&
            roleNorm !== 'supervisor');

    res.json({
      school_organization_id: sid,
      active_agency_id: activeAgencyId ? parseInt(activeAgencyId, 10) : null,
      user_has_school_access: !!userHasSchoolAccess,
      user_has_agency_access: !!userHasAgencyAccess,
      can_edit_clients: !!canEditClients
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Get lightweight School Portal stats for the home "At a glance".
 * GET /api/school-portal/:organizationId/stats
 *
 * No PHI returned — counts only.
 */
export const getSchoolPortalStats = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Verify organization exists (school/program/learning)
    const organization = await Agency.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: { message: 'Organization not found' } });
    }
    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    const allowedTypes = ['school', 'program', 'learning'];
    if (!allowedTypes.includes(orgType)) {
      return res.status(400).json({
        error: { message: `This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}` }
      });
    }

    // Access rules:
    // - direct org users allowed
    // - agency staff/admin/support may access via active affiliated agency
    if (userRole !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: userRole, schoolOrganizationId: orgId });
      if (!ok) {
        return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
      }
    }

    // 1) Weekday count where at least one provider is assigned (Mon–Fri day bar semantics).
    // Uses school_day_provider_assignments + user_agencies to ensure provider is still affiliated.
    let assignedWeekdaysCount = 0;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(DISTINCT a.weekday) AS cnt
         FROM school_day_provider_assignments a
         JOIN user_agencies ua
           ON ua.user_id = a.provider_user_id
          AND ua.agency_id = a.school_organization_id
         WHERE a.school_organization_id = ?
           AND a.is_active = TRUE`,
        [orgId]
      );
      assignedWeekdaysCount = Number(rows?.[0]?.cnt || 0);
    } catch {
      assignedWeekdaysCount = 0;
    }

    // 2) Slot capacity + assigned slots.
    // Capacity = sum of provider_school_assignments.slots_total across Mon–Fri (active).
    // Assigned = count of active provider/day assignments for this org (client_provider_assignments),
    // so "available" always matches (total - assigned). If assigned > total, available becomes negative (over-capacity).
    let slotsTotal = 0;
    try {
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(COALESCE(psa.slots_total, 0)), 0) AS slots_total
         FROM provider_school_assignments psa
         WHERE psa.school_organization_id = ?
           AND psa.is_active = TRUE
           AND psa.day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday')`,
        [orgId]
      );
      slotsTotal = Number(rows?.[0]?.slots_total || 0);
    } catch {
      slotsTotal = 0;
    }

    let slotsUsed = 0;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM client_provider_assignments cpa
         JOIN clients c ON c.id = cpa.client_id
         WHERE cpa.organization_id = ?
           AND cpa.is_active = TRUE
           AND UPPER(c.status) <> 'ARCHIVED'
           AND cpa.service_day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')`,
        [orgId]
      );
      slotsUsed = Number(rows?.[0]?.cnt || 0);
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR');
      if (!missing) throw e;
      // Legacy fallback: count clients assigned to any provider within this org.
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM clients
         WHERE organization_id = ?
           AND provider_id IS NOT NULL
           AND UPPER(status) <> 'ARCHIVED'`,
        [orgId]
      );
      slotsUsed = Number(rows?.[0]?.cnt || 0);
    }

    const slotsAvailable = slotsTotal - slotsUsed;

    // 3) Client counts (non-archived) + key status counts.
    // Prefer multi-org + multi-provider assignment tables; fallback to legacy clients.organization_id/provider_id.
    let clientsTotal = 0;
    let clientsAssigned = 0;
    let clientsPending = 0;
    let clientsWaitlist = 0;
    try {
      const [rows] = await pool.execute(
        `SELECT
           COUNT(DISTINCT c.id) AS clients_total,
           COUNT(DISTINCT CASE WHEN cpa.provider_user_id IS NOT NULL THEN c.id END) AS clients_assigned,
           COUNT(DISTINCT CASE WHEN LOWER(COALESCE(cs.status_key,'')) = 'pending' THEN c.id END) AS clients_pending,
           COUNT(DISTINCT CASE WHEN LOWER(COALESCE(cs.status_key,'')) = 'waitlist' THEN c.id END) AS clients_waitlist
         FROM clients c
         JOIN client_organization_assignments coa
           ON coa.client_id = c.id
          AND coa.organization_id = ?
          AND coa.is_active = TRUE
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         LEFT JOIN client_provider_assignments cpa
           ON cpa.client_id = c.id
          AND cpa.organization_id = coa.organization_id
          AND cpa.is_active = TRUE
         WHERE UPPER(c.status) <> 'ARCHIVED'`,
        [orgId]
      );
      clientsTotal = Number(rows?.[0]?.clients_total || 0);
      clientsAssigned = Number(rows?.[0]?.clients_assigned || 0);
      clientsPending = Number(rows?.[0]?.clients_pending || 0);
      clientsWaitlist = Number(rows?.[0]?.clients_waitlist || 0);
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR');
      if (!missing) throw e;

      const [rows] = await pool.execute(
        `SELECT
           COUNT(*) AS clients_total,
           COUNT(CASE WHEN provider_id IS NOT NULL THEN 1 END) AS clients_assigned,
           COUNT(CASE WHEN LOWER(COALESCE(cs.status_key,'')) = 'pending' THEN 1 END) AS clients_pending,
           COUNT(CASE WHEN LOWER(COALESCE(cs.status_key,'')) = 'waitlist' THEN 1 END) AS clients_waitlist
         FROM clients c
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         WHERE organization_id = ?
           AND UPPER(status) <> 'ARCHIVED'`,
        [orgId]
      );
      clientsTotal = Number(rows?.[0]?.clients_total || 0);
      clientsAssigned = Number(rows?.[0]?.clients_assigned || 0);
      clientsPending = Number(rows?.[0]?.clients_pending || 0);
      clientsWaitlist = Number(rows?.[0]?.clients_waitlist || 0);
    }

    // 4) School staff count (direct membership to this school org).
    let schoolStaffCount = 0;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(DISTINCT u.id) AS cnt
         FROM user_agencies ua
         JOIN users u ON u.id = ua.user_id
         WHERE ua.agency_id = ?
           AND LOWER(COALESCE(u.role,'')) = 'school_staff'
           AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'`,
        [orgId]
      );
      schoolStaffCount = Number(rows?.[0]?.cnt || 0);
    } catch {
      schoolStaffCount = 0;
    }

    res.json({
      organization_id: orgId,
      assigned_weekdays_count: assignedWeekdaysCount,
      clients_total: clientsTotal,
      clients_assigned: clientsAssigned,
      clients_pending: clientsPending,
      clients_waitlist: clientsWaitlist,
      slots_total: slotsTotal,
      slots_used: slotsUsed,
      slots_available: slotsAvailable,
      school_staff_count: schoolStaffCount
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Get or initialize school-staff waiver task status for the current user.
 * GET /api/school-portal/:organizationId/school-staff-waiver/status
 */
export const getSchoolStaffWaiverStatus = async (req, res, next) => {
  try {
    const isLocalRequest = (() => {
      const host = String(req.get('host') || '').toLowerCase();
      const origin = String(req.get('origin') || '').toLowerCase();
      const referer = String(req.get('referer') || '').toLowerCase();
      const joined = `${host} ${origin} ${referer}`;
      return joined.includes('localhost') || joined.includes('127.0.0.1');
    })();
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    let org = null;
    try {
      const access = await assertSchoolPortalAccess(req, orgId);
      org = access?.org || null;
    } catch (accessError) {
      const roleNorm = String(req.user?.role || '').toLowerCase();
      const waiverFallbackAccess =
        roleNorm === 'school_staff' &&
        await canSchoolStaffUseWaiverFallbackAccess({
          userId: req.user?.id,
          orgId
        });
      if (!(waiverFallbackAccess || (isLocalRequest && roleNorm === 'school_staff'))) {
        throw accessError;
      }
      org = await Agency.findById(orgId);
      if (!org) {
        return res.status(404).json({ error: { message: 'Organization not found' } });
      }
    }
    const status = await resolveSchoolStaffWaiverStatus({
      user: req.user,
      organization: org
    });

    res.json({
      organization_id: Number(orgId),
      ...status
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Reset current user's pilot waiver completion for local testing.
 * POST /api/school-portal/:organizationId/school-staff-waiver/reset
 */
export const resetSchoolStaffWaiverStatusForTesting = async (req, res, next) => {
  try {
    const isLocalRequest = (() => {
      const host = String(req.get('host') || '').toLowerCase();
      const origin = String(req.get('origin') || '').toLowerCase();
      const referer = String(req.get('referer') || '').toLowerCase();
      const joined = `${host} ${origin} ${referer}`;
      return joined.includes('localhost') || joined.includes('127.0.0.1');
    })();
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const { org } = await assertSchoolPortalAccess(req, orgId);
    const result = await resetSchoolStaffWaiverForTesting({
      user: req.user,
      organization: org,
      allowLocalBypass: isLocalRequest
    });

    res.json({
      organization_id: Number(orgId),
      ...result
    });
  } catch (e) {
    const status = Number(e?.statusCode || 0) || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: { message: e.message || 'Unable to reset waiver status' } });
    }
    next(e);
  }
};

/**
 * Super admin maintenance tool:
 * Rebuild missing intake response + clinical summary text docs
 * from stored intake submission payloads for one school portal org.
 *
 * POST /api/school-portal/:organizationId/admin-tools/restore-intake-artifacts
 */
export const restoreSchoolPortalIntakeArtifacts = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required.' } });
    }

    const org = await Agency.findById(orgId);
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } });
    const orgType = String(org.organization_type || '').toLowerCase();
    if (!['school', 'program', 'learning'].includes(orgType)) {
      return res.status(400).json({ error: { message: 'Admin tools restore only supports school/program/learning organizations.' } });
    }

    const [submissionRows] = await pool.execute(
      `SELECT
         s.id,
         s.intake_link_id,
         s.client_id,
         s.ip_address,
         s.intake_data,
         s.retention_expires_at,
         l.organization_id,
         l.scope_type,
         l.title,
         l.form_type,
         l.intake_fields
       FROM intake_submissions s
       JOIN intake_links l ON l.id = s.intake_link_id
       WHERE l.organization_id = ?
         AND s.intake_data IS NOT NULL
       ORDER BY s.id DESC
       LIMIT 500`,
      [orgId]
    );

    const fallbackAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    const counters = {
      scannedSubmissions: 0,
      skippedNoPayload: 0,
      skippedNoClient: 0,
      createdIntakeResponses: 0,
      createdClinicalSummaries: 0
    };

    const parseJsonField = (raw) => {
      if (!raw) return null;
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const isIntakeResponsesDoc = (doc = {}) => {
      const title = String(doc.document_title || '').toLowerCase();
      const type = String(doc.document_type || '').toLowerCase();
      return title.includes('intake response') || type.includes('intake response');
    };
    const isClinicalSummaryDoc = (doc = {}) => {
      const title = String(doc.document_title || '').toLowerCase();
      const type = String(doc.document_type || '').toLowerCase();
      return title.includes('clinical') || type.includes('clinical');
    };

    const createTextDoc = async ({
      text,
      submissionId,
      clientId,
      agencyId,
      schoolOrganizationId,
      filename,
      documentTitle,
      documentType,
      ipAddress,
      expiresAt,
      auditKind
    }) => {
      if (!text) return null;
      const storageResult = await StorageService.saveIntakeTextDocument({
        submissionId,
        clientId,
        fileBuffer: Buffer.from(text, 'utf8'),
        filename
      });
      const phiDoc = await ClientPhiDocument.create({
        clientId,
        agencyId,
        schoolOrganizationId: schoolOrganizationId || agencyId,
        intakeSubmissionId: submissionId,
        storagePath: storageResult.relativePath,
        originalName: filename,
        documentTitle,
        documentType,
        mimeType: 'text/plain',
        uploadedByUserId: null,
        scanStatus: 'clean',
        expiresAt: expiresAt || null
      });
      await PhiDocumentAuditLog.create({
        documentId: phiDoc.id,
        clientId,
        action: 'uploaded',
        actorUserId: req.user?.id || null,
        actorLabel: 'admin_tools_restore',
        ipAddress: ipAddress || null,
        metadata: { submissionId, kind: auditKind }
      });
      return phiDoc;
    };

    for (const submission of submissionRows || []) {
      counters.scannedSubmissions += 1;
      const submissionId = Number(submission?.id || 0);
      if (!submissionId) continue;

      const intakeData = parseJsonField(submission.intake_data);
      if (!intakeData || typeof intakeData !== 'object') {
        counters.skippedNoPayload += 1;
        continue;
      }

      const link = {
        intake_fields: parseJsonField(submission.intake_fields) || [],
        scope_type: submission.scope_type || null,
        organization_id: submission.organization_id || null,
        title: submission.title || null,
        form_type: submission.form_type || null
      };

      let submissionClients = [];
      try {
        submissionClients = await IntakeSubmissionClient.listBySubmissionId(submissionId);
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        submissionClients = [];
      }

      let clientTargets = (submissionClients || [])
        .map((row, idx) => ({
          clientId: Number(row?.client_id || 0) || null,
          clientIndex: idx
        }))
        .filter((row) => Number.isFinite(row.clientId) && row.clientId > 0);

      if (!clientTargets.length) {
        const fallbackClientId = Number(submission?.client_id || 0) || null;
        if (fallbackClientId) {
          clientTargets = [{ clientId: fallbackClientId, clientIndex: 0 }];
        }
      }
      if (!clientTargets.length) {
        counters.skippedNoClient += 1;
        continue;
      }

      const clientIds = Array.from(new Set(clientTargets.map((row) => row.clientId))).filter(Boolean);
      const placeholders = clientIds.map(() => '?').join(', ');
      let existingDocs = [];
      if (placeholders) {
        const [rows] = await pool.execute(
          `SELECT id, client_id, document_title, document_type, mime_type
           FROM client_phi_documents
           WHERE intake_submission_id = ?
             AND client_id IN (${placeholders})
             AND removed_at IS NULL
             AND LOWER(COALESCE(mime_type, '')) LIKE 'text/plain%'`,
          [submissionId, ...clientIds]
        );
        existingDocs = rows || [];
      }

      const existingByClient = new Map();
      for (const doc of existingDocs) {
        const cid = Number(doc?.client_id || 0);
        if (!cid) continue;
        if (!existingByClient.has(cid)) {
          existingByClient.set(cid, { hasResponses: false, hasClinical: false });
        }
        const state = existingByClient.get(cid);
        if (isIntakeResponsesDoc(doc)) state.hasResponses = true;
        if (isClinicalSummaryDoc(doc)) state.hasClinical = true;
      }

      for (const target of clientTargets) {
        const cid = Number(target.clientId || 0);
        if (!cid) continue;
        const existing = existingByClient.get(cid) || { hasResponses: false, hasClinical: false };
        if (existing.hasResponses && existing.hasClinical) continue;

        const clientRow = await Client.findById(cid, { includeSensitive: true });
        if (!clientRow?.id) continue;
        const agencyId = clientRow.agency_id || fallbackAgencyId || null;
        const schoolOrganizationId =
          clientRow.organization_id ||
          clientRow.school_organization_id ||
          orgId ||
          agencyId;

        if (!existing.hasResponses) {
          const answersText = buildIntakeAnswersText({
            link,
            intakeData,
            clientIndex: Number(target.clientIndex || 0)
          });
          await createTextDoc({
            text: answersText,
            submissionId,
            clientId: cid,
            agencyId,
            schoolOrganizationId,
            filename: `intake-answers-client-${cid}.txt`,
            documentTitle: 'Intake Responses',
            documentType: 'Intake Responses',
            ipAddress: submission?.ip_address || null,
            expiresAt: submission?.retention_expires_at || null,
            auditKind: 'intake_answers_restore'
          });
          counters.createdIntakeResponses += 1;
        }

        if (!existing.hasClinical) {
          const clinicalSummaryText = buildClinicalSummaryText({
            link,
            intakeData,
            clientIndex: Number(target.clientIndex || 0)
          });
          await createTextDoc({
            text: clinicalSummaryText,
            submissionId,
            clientId: cid,
            agencyId,
            schoolOrganizationId,
            filename: `intake-clinical-summary-client-${cid}.txt`,
            documentTitle: 'Clinical Intake Summary',
            documentType: 'Clinical Summary',
            ipAddress: submission?.ip_address || null,
            expiresAt: submission?.retention_expires_at || null,
            auditKind: 'clinical_summary_restore'
          });
          counters.createdClinicalSummaries += 1;
        }
      }
    }

    res.json({
      success: true,
      organizationId: Number(orgId),
      counters
    });
  } catch (e) {
    next(e);
  }
};

const normalizeEmail = (value) => {
  const out = String(value || '').trim().toLowerCase();
  return out.includes('@') ? out : '';
};

async function getSchoolContactRowsByOrg(orgId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, email, is_primary, is_school_admin, is_scheduler
       FROM school_contacts
       WHERE school_organization_id = ?`,
      [orgId]
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    try {
      const [rows] = await pool.execute(
        `SELECT id, email, is_primary, 0 AS is_school_admin, 0 AS is_scheduler
         FROM school_contacts
         WHERE school_organization_id = ?`,
        [orgId]
      );
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}

async function getSchoolStaffRoleFlagsForOrg(orgId) {
  const rows = await getSchoolContactRowsByOrg(orgId);
  const byEmail = new Map();
  for (const r of rows) {
    const email = normalizeEmail(r?.email);
    if (!email) continue;
    byEmail.set(email, {
      contactId: Number(r?.id || 0) || null,
      isPrimary: Number(r?.is_primary || 0) === 1,
      isSchoolAdmin: Number(r?.is_school_admin || 0) === 1 || Number(r?.is_primary || 0) === 1,
      isScheduler: Number(r?.is_scheduler || 0) === 1
    });
  }
  return byEmail;
}

async function getUserEmailCandidates(userId, actorEmail = null) {
  const emails = new Set();
  if (actorEmail) emails.add(normalizeEmail(actorEmail));
  const u = userId ? await User.findById(userId) : null;
  for (const e of [u?.email, u?.work_email, u?.username, u?.personal_email]) {
    const n = normalizeEmail(e);
    if (n) emails.add(n);
  }
  return Array.from(emails);
}

async function getActorSchoolRoleFlags({ actorUserId, actorEmail, orgId }) {
  const candidates = await getUserEmailCandidates(actorUserId, actorEmail);
  const map = await getSchoolStaffRoleFlagsForOrg(orgId);
  const roleFlags = { isSchoolAdmin: false, isPrimary: false, isScheduler: false, matchedEmail: null };
  for (const email of candidates) {
    const row = map.get(email);
    if (!row) continue;
    roleFlags.isSchoolAdmin = roleFlags.isSchoolAdmin || !!row.isSchoolAdmin;
    roleFlags.isPrimary = roleFlags.isPrimary || !!row.isPrimary;
    roleFlags.isScheduler = roleFlags.isScheduler || !!row.isScheduler;
    roleFlags.matchedEmail = roleFlags.matchedEmail || email;
  }
  return roleFlags;
}

async function isSchedulerSchoolStaff({ userId, role, actorEmail, orgId }) {
  if (String(role || '').toLowerCase() !== 'school_staff') return false;
  const flags = await getActorSchoolRoleFlags({ actorUserId: userId, actorEmail, orgId });
  return flags.isScheduler === true;
}

async function upsertSchoolContactRoleFlags({ orgId, email, fullName = null, isSchoolAdmin, isScheduler }) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existingRows] = await conn.execute(
      `SELECT id, is_primary, is_school_admin, is_scheduler
       FROM school_contacts
       WHERE school_organization_id = ? AND LOWER(TRIM(email)) = ?
       LIMIT 1`,
      [orgId, normalized]
    );
    if (existingRows?.length) {
      const row = existingRows[0];
      const updates = [];
      const values = [];
      if (fullName !== null) {
        updates.push('full_name = ?');
        values.push(fullName || null);
      }
      if (typeof isSchoolAdmin === 'boolean') {
        updates.push('is_school_admin = ?');
        values.push(isSchoolAdmin ? 1 : 0);
      }
      if (typeof isScheduler === 'boolean') {
        updates.push('is_scheduler = ?');
        values.push(isScheduler ? 1 : 0);
      }
      if (updates.length) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(row.id, orgId);
        await conn.execute(
          `UPDATE school_contacts SET ${updates.join(', ')} WHERE id = ? AND school_organization_id = ?`,
          values
        );
      }
    } else {
      await conn.execute(
        `INSERT INTO school_contacts
          (school_organization_id, full_name, email, role_title, notes, is_primary, is_school_admin, is_scheduler)
         VALUES (?, ?, ?, NULL, NULL, 0, ?, ?)`,
        [orgId, fullName || null, normalized, isSchoolAdmin ? 1 : 0, isScheduler ? 1 : 0]
      );
    }
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch {}
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  } finally {
    conn.release();
  }
}

/**
 * List school staff users linked to this school organization.
 * GET /api/school-portal/:organizationId/school-staff
 * Includes last_login, password reset expiry, and isPrimary for each staff member.
 */
export const listSchoolStaff = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const userRole = req.user?.role;

    const organization = await Agency.findById(orgId);
    if (!organization) return res.status(404).json({ error: { message: 'Organization not found' } });
    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    const allowedTypes = ['school', 'program', 'learning'];
    if (!allowedTypes.includes(orgType)) {
      return res.status(400).json({
        error: { message: `This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}` }
      });
    }

    if (userRole !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: userRole, schoolOrganizationId: orgId });
      if (!ok) {
        return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
      }
    }

    const roleFlagsByEmail = await getSchoolStaffRoleFlagsForOrg(orgId);

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.status,
         u.created_at,
         u.passwordless_token_expires_at,
         u.passwordless_token_purpose
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role,'')) = 'school_staff'
         AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'
       ORDER BY u.last_name ASC, u.first_name ASC, u.email ASC`,
      [orgId]
    );

    const staffIds = (rows || []).map((r) => r.id).filter(Boolean);
    let lastLoginByUser = {};
    if (staffIds.length) {
      const placeholders = staffIds.map(() => '?').join(',');
      const [loginRows] = await pool.execute(
        `SELECT user_id, MAX(created_at) AS last_login
         FROM user_activity_log
         WHERE user_id IN (${placeholders}) AND action_type = 'login'
         GROUP BY user_id`,
        staffIds
      );
      for (const r of loginRows || []) {
        lastLoginByUser[r.user_id] = r.last_login;
      }
    }

    const result = (rows || []).map((r) => {
      const emailNorm = normalizeEmail(r.email);
      const flags = roleFlagsByEmail.get(emailNorm) || {
        contactId: null,
        isPrimary: false,
        isSchoolAdmin: false,
        isScheduler: false
      };
      const purpose = String(r.passwordless_token_purpose || '').toLowerCase();
      const hasResetToken = purpose === 'reset' && r.passwordless_token_expires_at;
      const now = new Date();
      const resetExpiresAt = hasResetToken ? new Date(r.passwordless_token_expires_at) : null;
      const resetExpired = resetExpiresAt ? resetExpiresAt.getTime() <= now.getTime() : true;

      return {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        status: r.status,
        created_at: r.created_at,
        last_login: lastLoginByUser[r.id] || null,
        password_reset_expires_at: hasResetToken && !resetExpired ? r.passwordless_token_expires_at : null,
        is_primary: flags.isPrimary,
        is_school_admin: flags.isSchoolAdmin,
        is_scheduler: flags.isScheduler,
        school_contact_id: flags.contactId || null
      };
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * Remove a school_staff user from this school organization.
 * DELETE /api/school-portal/:organizationId/school-staff/:userId
 * Only primary school contact or agency admin/staff can remove. Removal revokes access and removes from school_contacts.
 * Notifies agency admin to remove from school group email.
 */
export const removeSchoolStaff = async (req, res, next) => {
  try {
    const { organizationId, userId: targetUserIdParam } = req.params;
    const orgId = parseInt(organizationId, 10);
    const targetUserId = parseInt(targetUserIdParam, 10);
    if (!orgId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid organizationId or userId' } });

    const actorId = req.user?.id;
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorEmail = req.user?.email || req.user?.username || null;

    const isAgencyAdmin =
      actorRole === 'super_admin' ||
      actorRole === 'admin' ||
      actorRole === 'staff' ||
      actorRole === 'support' ||
      actorRole === 'clinical_practice_assistant' ||
      actorRole === 'provider_plus';
    const actorFlags = actorRole === 'school_staff'
      ? await getActorSchoolRoleFlags({ actorUserId: actorId, actorEmail, orgId })
      : { isSchoolAdmin: false };
    const isSchoolAdmin = actorRole === 'school_staff' && actorFlags.isSchoolAdmin === true;

    if (!isAgencyAdmin && !isSchoolAdmin) {
      return res.status(403).json({
        error: { message: 'Only a school admin or agency admin/staff can remove school staff users' }
      });
    }

    if (!isAgencyAdmin) {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({
        userId: actorId,
        role: actorRole,
        schoolOrganizationId: orgId
      });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const u = await User.findById(targetUserId);
    if (!u) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(u.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can be removed from a school via this endpoint' } });
    }

    const targetEmail = (u.email || u.work_email || '').trim().toLowerCase();

    await ClientSchoolStaffRoiAccess.revokeForSchoolStaff({
      schoolStaffUserId: targetUserId,
      schoolOrganizationId: orgId,
      actorUserId: actorId
    });
    await User.removeFromAgency(targetUserId, orgId);
    const stillHasSchoolAccess = await User.hasAnySchoolAgencyMembership(targetUserId);
    if (!stillHasSchoolAccess) {
      await User.disableSchoolStaffLogin(targetUserId, actorId);
    }

    if (targetEmail) {
      try {
        await pool.execute(
          `DELETE FROM school_contacts WHERE school_organization_id = ? AND LOWER(TRIM(email)) = ?`,
          [orgId, targetEmail]
        );
      } catch {
        // best-effort; school_contacts table may not exist
      }
    }

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    const org = await Agency.findById(orgId);
    const schoolName = org?.name || org?.display_name || `School #${orgId}`;
    logAuditEvent(req, {
      actionType: 'school_portal_school_staff_removed',
      agencyId: activeAgencyId || undefined,
      targetType: 'user',
      targetId: targetUserId,
      metadata: {
        schoolOrganizationId: orgId,
        actorRole,
        actorIsSchoolAdmin: isSchoolAdmin,
        removedEmail: u.email || targetEmail || null
      }
    }).catch(() => {});
    if (activeAgencyId) {
      await notifyAgencyAdmins({
        agencyId: activeAgencyId,
        title: 'School staff removed from school',
        message: `${u.first_name || ''} ${u.last_name || ''} (${u.email || targetEmail}) was removed from ${schoolName} by ${isSchoolAdmin ? 'a School Admin' : 'agency staff'}.`,
        actorUserId: actorId,
        relatedEntityType: 'user',
        relatedEntityId: u.id
      });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * Send password reset link for a school staff member.

 * POST /api/school-portal/:organizationId/school-staff/:userId/send-reset-password
 * Only the primary school contact can send reset links via the portal.
 * Uses full reset password flow (48h expiry, etc.) and notifies agency admin.
 */
export const sendSchoolStaffResetPassword = async (req, res, next) => {
  try {
    const { organizationId, userId: targetUserIdParam } = req.params;
    const orgId = parseInt(organizationId, 10);
    const targetUserId = parseInt(targetUserIdParam, 10);
    if (!orgId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid organizationId or userId' } });

    const actorId = req.user?.id;
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorEmail = req.user?.email || req.user?.username || null;

    const isAgencyAdmin =
      actorRole === 'super_admin' ||
      actorRole === 'admin' ||
      actorRole === 'staff' ||
      actorRole === 'support' ||
      actorRole === 'clinical_practice_assistant' ||
      actorRole === 'provider_plus';
    const actorFlags = actorRole === 'school_staff'
      ? await getActorSchoolRoleFlags({ actorUserId: actorId, actorEmail, orgId })
      : { isSchoolAdmin: false };
    const isSchoolAdmin = actorRole === 'school_staff' && actorFlags.isSchoolAdmin === true;
    if (!isAgencyAdmin && !isSchoolAdmin) {
      return res.status(403).json({
        error: { message: 'Only a School Admin or agency admin/staff can send password reset links from the portal' }
      });
    }

    if (!isAgencyAdmin) {
        const ok = await userHasOrgOrAffiliatedAgencyAccess({
        userId: actorId,
        role: actorRole,
        schoolOrganizationId: orgId
      });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(user.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can receive reset links via this endpoint' } });
    }

    const membership = await User.getAgencyMembership(targetUserId, orgId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this school' } });
    }

    const statusLower = String(user.status || '').toLowerCase();
    if (statusLower === 'pending' || statusLower === 'pending_setup') {
      return res.status(400).json({
        error: {
          message: 'Use the setup link for pending users. Password reset links are for users who already have an account.'
        }
      });
    }

    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(targetUserId);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const buildResetLink = (token) =>
      portalSlug ? `${frontendBase}/${portalSlug}/reset-password/${token}` : `${frontendBase}/reset-password/${token}`;

    const purpose = String(user.passwordless_token_purpose || '').toLowerCase();
    const expiresAt = user.passwordless_token_expires_at ? new Date(user.passwordless_token_expires_at) : null;
    const now = new Date();
    const hasValidExistingReset =
      user.passwordless_token &&
      purpose === 'reset' &&
      expiresAt &&
      expiresAt.getTime() > now.getTime();

    let tokenResult;
    if (hasValidExistingReset) {
      tokenResult = {
        token: user.passwordless_token,
        expiresAt: user.passwordless_token_expires_at
      };
      const hoursUntil = expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)) : 48;
      tokenResult.expiresInHours = hoursUntil;
    } else {
      tokenResult = await User.generatePasswordlessToken(targetUserId, 48, 'reset');
      tokenResult.expiresInHours = 48;
    }

    const resetLink = buildResetLink(tokenResult.token);

    const ActivityLogService = (await import('../services/activityLog.service.js')).default;
    ActivityLogService.logActivity(
      {
        actionType: 'password_reset_link_sent',
        userId: targetUserId,
        metadata: {
          performedByUserId: actorId,
          performedByEmail: actorEmail,
          source: isSchoolAdmin ? 'school_portal_school_admin' : 'school_portal_agency_admin',
          expiresAt: tokenResult.expiresAt,
          expiresInHours: tokenResult.expiresInHours
        }
      },
      req
    );

    let emailSent = false;
    const to = [user.email, user.username, user.work_email, user.personal_email]
      .filter(Boolean)
      .map((e) => String(e).trim().toLowerCase())
      .find((e) => e.includes('@'));
    if (to) {
      const agencyId = userAgencies?.[0]?.id || null;
      const agency = agencyId ? await Agency.findById(agencyId) : null;
      const subject = 'Reset your password';
      let body = `Reset your password using this link (expires in ${tokenResult.expiresInHours} hours):\n${resetLink}\n\nIf you did not request this, you can ignore this email.`;
      try {
        const EmailTemplateService = (await import('../services/emailTemplate.service.js')).default;
        const template =
          (await EmailTemplateService.getTemplateForAgency(agencyId, 'admin_initiated_password_reset')) ||
          (await EmailTemplateService.getTemplateForAgency(agencyId, 'password_reset'));
        if (template?.body) {
          const params = await EmailTemplateService.collectParameters(user, agency, {
            passwordlessToken: tokenResult.token,
            senderName: req.user.first_name || req.user.email || 'Primary Contact'
          });
          const rendered = EmailTemplateService.renderTemplate(template, params);
          body = rendered.body || body;
        }
      } catch {
        // keep default
      }
      try {
        const { sendEmailFromIdentity } = await import('../services/unifiedEmail/unifiedEmailSender.service.js');
        const { resolvePreferredSenderIdentityForAgency } = await import('../services/emailSenderIdentityResolver.service.js');
        const EmailService = (await import('../services/email.service.js')).default;
        const CommunicationLoggingService = (await import('../services/communicationLogging.service.js')).default;

        const identity = await resolvePreferredSenderIdentityForAgency({
          agencyId: agencyId || null,
          preferredKeys: ['login_recovery', 'system', 'default', 'notifications']
        });
        const sendResult = identity?.id
          ? await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to,
              subject,
              text: body,
              html: null,
              source: 'auto'
            })
          : await EmailService.sendEmail({
              to,
              subject,
              text: body,
              html: null,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              source: 'auto',
              agencyId: agencyId || null
            });
        emailSent = !!sendResult;
      } catch (err) {
        console.error('[sendSchoolStaffResetPassword] Failed to send email:', err);
      }
    }

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    const org = await Agency.findById(orgId);
    const schoolName = org?.name || org?.display_name || `School #${orgId}`;
    logAuditEvent(req, {
      actionType: 'school_portal_school_staff_password_reset_sent',
      agencyId: activeAgencyId || undefined,
      targetType: 'user',
      targetId: targetUserId,
      metadata: {
        schoolOrganizationId: orgId,
        actorRole,
        actorIsSchoolAdmin: isSchoolAdmin,
        emailSent
      }
    }).catch(() => {});
    if (activeAgencyId) {
      await notifyAgencyAdmins({
        agencyId: activeAgencyId,
        title: 'School staff password reset sent',
        message: `${isSchoolAdmin ? 'A School Admin' : 'Agency staff'} sent a password reset link for ${user.first_name || ''} ${user.last_name || ''} (${user.email || to}) in ${schoolName}.` +
          (emailSent ? ' Email delivery succeeded.' : ' Email delivery failed; manual sharing may be needed.'),
        actorUserId: actorId,
        relatedEntityType: 'user',
        relatedEntityId: user.id
      });
    }

    res.json({
      ok: true,
      tokenLink: resetLink,
      expiresAt: tokenResult.expiresAt,
      expiresInHours: tokenResult.expiresInHours,
      emailSent,
      message: 'Password reset link generated and sent'
    });
  } catch (e) {
    next(e);
  }
};

export const addSchoolStaff = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const actorId = req.user?.id;
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorEmail = req.user?.email || req.user?.username || null;

    const isAgencyAdmin =
      actorRole === 'super_admin' ||
      actorRole === 'admin' ||
      actorRole === 'staff' ||
      actorRole === 'support' ||
      actorRole === 'clinical_practice_assistant' ||
      actorRole === 'provider_plus';
    const actorFlags = actorRole === 'school_staff'
      ? await getActorSchoolRoleFlags({ actorUserId: actorId, actorEmail, orgId })
      : { isSchoolAdmin: false };
    const isSchoolAdmin = actorRole === 'school_staff' && actorFlags.isSchoolAdmin === true;
    if (!isAgencyAdmin && !isSchoolAdmin) {
      return res.status(403).json({
        error: { message: 'Only a School Admin or agency admin/staff can add school staff from the portal' }
      });
    }

    if (!isAgencyAdmin) {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({
        userId: actorId,
        role: actorRole,
        schoolOrganizationId: orgId
      });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const emailRaw = req.body?.email;
    const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : null;
    const email = emailRaw ? String(emailRaw).trim().toLowerCase() : '';
    const assignSchoolAdmin = req.body?.isSchoolAdmin === true;
    const assignScheduler = req.body?.isScheduler === true;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: { message: 'Invalid email address' } });
    }

    const org = await Agency.findById(orgId);
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } });
    const orgType = String(org.organization_type || '').toLowerCase();
    if (orgType !== 'school') {
      return res.status(400).json({ error: { message: 'This endpoint is only for school organizations' } });
    }

    const parseName = (fn) => {
      const s = String(fn || '').trim();
      if (!s) return { firstName: 'School', lastName: 'Staff' };
      const parts = s.split(/\s+/g).filter(Boolean);
      if (parts.length === 1) return { firstName: parts[0], lastName: 'Staff' };
      return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
    };

    let user = await User.findByEmail(email);
    if (user?.id) {
      if (String(user.role || '').toLowerCase() !== 'school_staff') {
        return res.status(409).json({
          error: { message: `A user already exists with this email (role: ${user.role}). Cannot add as school staff.` }
        });
      }
      user = await User.findById(user.id);
    } else {
      const { firstName, lastName } = parseName(fullName);
      user = await User.create({
        email,
        passwordHash: null,
        firstName,
        lastName,
        role: 'school_staff',
        status: 'ACTIVE_EMPLOYEE'
      });
      try {
        await User.setWorkEmail(user.id, email);
      } catch {
        // ignore
      }
      try {
        await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [email, email, user.id]);
      } catch {
        // ignore
      }
    }

    try {
      await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE', actorId);
    } catch {
      // ignore
    }
    try {
      await User.update(user.id, { isActive: true });
    } catch {
      // ignore
    }

    await User.assignToAgency(user.id, orgId);
    await ClientSchoolStaffRoiAccess.revokeForSchoolStaff({
      schoolStaffUserId: user.id,
      schoolOrganizationId: orgId,
      actorUserId: actorId
    });

    await upsertSchoolContactRoleFlags({
      orgId,
      email,
      fullName: fullName || `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
      isSchoolAdmin: assignSchoolAdmin,
      isScheduler: assignScheduler
    });

    const setupLink = await User.generatePasswordlessToken(user.id, 24 * 7, 'setup');
    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(user.id);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const setupUrl = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${setupLink.token}`
      : `${frontendBase}/passwordless-login/${setupLink.token}`;

    let emailSent = false;
    const to = [user.email, user.username, user.work_email].filter(Boolean).map((e) => String(e).trim().toLowerCase()).find((e) => e.includes('@'));
    if (to) {
      try {
        const EmailTemplateService = (await import('../services/emailTemplate.service.js')).default;
        const agencyId = userAgencies?.[0]?.id || null;
        const agency = agencyId ? await Agency.findById(agencyId) : null;
        const template = await EmailTemplateService.getTemplateForAgency(agencyId, 'invitation');
        let subject = 'Set up your school portal account';
        let body = `You have been added to the school portal. Set up your account using this link (expires in 7 days):\n${setupUrl}`;
        if (template?.body) {
          const params = await EmailTemplateService.collectParameters(user, agency, {
            passwordlessToken: setupLink.token,
            senderName: req.user?.first_name || req.user?.email || 'Primary Contact'
          });
          const rendered = EmailTemplateService.renderTemplate(template, params);
          subject = rendered.subject || subject;
          body = rendered.body || body;
        }
        const { sendEmailFromIdentity } = await import('../services/unifiedEmail/unifiedEmailSender.service.js');
        const { resolvePreferredSenderIdentityForAgency } = await import('../services/emailSenderIdentityResolver.service.js');
        const EmailService = (await import('../services/email.service.js')).default;
        const identity = await resolvePreferredSenderIdentityForAgency({
          agencyId: agencyId || null,
          preferredKeys: ['login_recovery', 'system', 'default', 'notifications']
        });
        if (identity?.id) {
          await sendEmailFromIdentity({
            senderIdentityId: identity.id,
            to,
            subject,
            text: body,
            html: null,
            source: 'auto'
          });
          emailSent = true;
        } else {
          await EmailService.sendEmail({
            to,
            subject,
            text: body,
            html: null,
            fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
            fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
            replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
            source: 'auto',
            agencyId: agencyId || null
          });
          emailSent = true;
        }
      } catch (err) {
        console.error('[addSchoolStaff] Failed to send setup email:', err);
      }
    }

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    logAuditEvent(req, {
      actionType: 'school_portal_school_staff_added',
      agencyId: activeAgencyId || undefined,
      targetType: 'user',
      targetId: user.id,
      metadata: {
        schoolOrganizationId: orgId,
        actorRole,
        actorIsSchoolAdmin: isSchoolAdmin,
        assignedRoles: { isSchoolAdmin: assignSchoolAdmin, isScheduler: assignScheduler }
      }
    }).catch(() => {});
    if (activeAgencyId) {
      const orgName = org?.name || org?.official_name || `School #${orgId}`;
      await notifyAgencyAdmins({
        agencyId: activeAgencyId,
        title: 'School staff account added',
        message: `${user.first_name || ''} ${user.last_name || ''} (${user.email || email}) was added to ${orgName}` +
          `${assignSchoolAdmin ? ' as School Admin' : ''}${assignScheduler ? `${assignSchoolAdmin ? ' and ' : ' as '}Scheduler` : ''}.`,
        actorUserId: actorId,
        relatedEntityType: 'user',
        relatedEntityId: user.id
      });
    }

    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email || email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status,
        is_school_admin: assignSchoolAdmin,
        is_scheduler: assignScheduler
      },
      setupLink: setupUrl,
      setupExpiresAt: setupLink.expiresAt,
      emailSent,
      message: emailSent ? 'School staff added and setup email sent' : 'School staff added; share the setup link manually'
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Update a school staff member (admin/super_admin only).
 * PUT /api/school-portal/:organizationId/school-staff/:userId
 * Body: { firstName?, lastName?, email? }
 */
export const updateSchoolStaff = async (req, res, next) => {
  try {
    const { organizationId, userId: targetUserIdParam } = req.params;
    const orgId = parseInt(organizationId, 10);
    const targetUserId = parseInt(targetUserIdParam, 10);
    if (!orgId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid organizationId or userId' } });

    const actorId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorEmail = req.user?.email || req.user?.username || null;
    const isAgencyAdmin =
      actorRole === 'super_admin' ||
      actorRole === 'admin' ||
      actorRole === 'staff' ||
      actorRole === 'support' ||
      actorRole === 'clinical_practice_assistant' ||
      actorRole === 'provider_plus';
    const actorFlags = actorRole === 'school_staff'
      ? await getActorSchoolRoleFlags({ actorUserId: actorId, actorEmail, orgId })
      : { isSchoolAdmin: false };
    const isSchoolAdmin = actorRole === 'school_staff' && actorFlags.isSchoolAdmin === true;
    if (!isAgencyAdmin && !isSchoolAdmin) {
      return res.status(403).json({ error: { message: 'Only a School Admin or agency admin/staff can edit school staff from the portal' } });
    }

    const ok = await userHasOrgOrAffiliatedAgencyAccess({
      userId: actorId,
      role: actorRole,
      schoolOrganizationId: orgId
    });
    if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(user.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can be edited via this endpoint' } });
    }

    const membership = await User.getAgencyMembership(targetUserId, orgId);
    if (!membership) return res.status(400).json({ error: { message: 'User is not assigned to this school' } });

    const firstName = req.body?.firstName !== undefined ? String(req.body.firstName || '').trim() : undefined;
    const lastName = req.body?.lastName !== undefined ? String(req.body.lastName || '').trim() : undefined;
    const email = req.body?.email !== undefined ? String(req.body.email || '').trim().toLowerCase() : undefined;
    if (email !== undefined && (!email || !email.includes('@'))) {
      return res.status(400).json({ error: { message: 'Invalid email address' } });
    }

    const updates = {};
    if (firstName !== undefined) updates.firstName = firstName || 'School';
    if (lastName !== undefined) updates.lastName = lastName || 'Staff';
    if (email !== undefined) updates.email = email;

    if (Object.keys(updates).length) {
      await User.update(targetUserId, updates);
    }

    const nextIsSchoolAdmin = req.body?.isSchoolAdmin;
    const nextIsScheduler = req.body?.isScheduler;
    const hasRoleFlagUpdate = typeof nextIsSchoolAdmin === 'boolean' || typeof nextIsScheduler === 'boolean';

    const oldEmail = user.email ? String(user.email).trim().toLowerCase() : '';
    const newEmail = email || oldEmail;
    if (newEmail && (updates.email !== undefined || updates.firstName !== undefined || updates.lastName !== undefined || hasRoleFlagUpdate)) {
      try {
        const fullName =
          updates.firstName !== undefined || updates.lastName !== undefined
            ? `${updates.firstName ?? user.first_name ?? ''} ${updates.lastName ?? user.last_name ?? ''}`.trim()
            : `${user.first_name || ''} ${user.last_name || ''}`.trim();
        const roleMap = await getSchoolStaffRoleFlagsForOrg(orgId);
        const currentFlags = roleMap.get(oldEmail) || roleMap.get(newEmail) || {
          isSchoolAdmin: false,
          isScheduler: false
        };
        await upsertSchoolContactRoleFlags({
          orgId,
          email: newEmail,
          fullName: fullName || `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
          isSchoolAdmin: typeof nextIsSchoolAdmin === 'boolean' ? nextIsSchoolAdmin : currentFlags.isSchoolAdmin,
          isScheduler: typeof nextIsScheduler === 'boolean' ? nextIsScheduler : currentFlags.isScheduler
        });
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    const updated = await User.findById(targetUserId);
    const updatedFlagsMap = await getSchoolStaffRoleFlagsForOrg(orgId);
    const updatedFlags = updatedFlagsMap.get(normalizeEmail(updated?.email || updated?.work_email || updated?.username || '')) || {
      isSchoolAdmin: false,
      isScheduler: false
    };
    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    logAuditEvent(req, {
      actionType: 'school_portal_school_staff_updated',
      agencyId: activeAgencyId || undefined,
      targetType: 'user',
      targetId: targetUserId,
      metadata: {
        schoolOrganizationId: orgId,
        actorRole,
        actorIsSchoolAdmin: isSchoolAdmin,
        updatedProfileFields: Object.keys(updates),
        updatedRoleFlags: hasRoleFlagUpdate ? {
          isSchoolAdmin: typeof nextIsSchoolAdmin === 'boolean' ? nextIsSchoolAdmin : null,
          isScheduler: typeof nextIsScheduler === 'boolean' ? nextIsScheduler : null
        } : null
      }
    }).catch(() => {});
    if (activeAgencyId) {
      const org = await Agency.findById(orgId);
      const schoolName = org?.name || org?.official_name || `School #${orgId}`;
      await notifyAgencyAdmins({
        agencyId: activeAgencyId,
        title: 'School staff account updated',
        message: `${updated.first_name || ''} ${updated.last_name || ''} (${updated.email || ''}) was updated for ${schoolName}.`,
        actorUserId: actorId,
        relatedEntityType: 'user',
        relatedEntityId: updated.id
      });
    }
    res.json({
      ok: true,
      user: {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        email: updated.email,
        is_school_admin: updatedFlags.isSchoolAdmin,
        is_scheduler: updatedFlags.isScheduler
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Legacy route kept for backward compatibility.
 * Sets a school staff member as School Admin for this school.
 * POST /api/school-portal/:organizationId/school-staff/:userId/set-primary
 */
export const setPrimarySchoolStaff = async (req, res, next) => {
  try {
    const { organizationId, userId: targetUserIdParam } = req.params;
    const orgId = parseInt(organizationId, 10);
    const targetUserId = parseInt(targetUserIdParam, 10);
    if (!orgId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid organizationId or userId' } });

    const actorId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorEmail = req.user?.email || req.user?.username || null;
    const isAgencyAdmin =
      actorRole === 'super_admin' ||
      actorRole === 'admin' ||
      actorRole === 'staff' ||
      actorRole === 'support' ||
      actorRole === 'clinical_practice_assistant' ||
      actorRole === 'provider_plus';
    const actorFlags = actorRole === 'school_staff'
      ? await getActorSchoolRoleFlags({ actorUserId: actorId, actorEmail, orgId })
      : { isSchoolAdmin: false };
    const isSchoolAdmin = actorRole === 'school_staff' && actorFlags.isSchoolAdmin === true;
    if (!isAgencyAdmin && !isSchoolAdmin) {
      return res.status(403).json({ error: { message: 'Only a School Admin or agency admin/staff can assign School Admin' } });
    }

    const ok = await userHasOrgOrAffiliatedAgencyAccess({
      userId: actorId,
      role: actorRole,
      schoolOrganizationId: orgId
    });
    if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(user.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can be set as primary' } });
    }

    const membership = await User.getAgencyMembership(targetUserId, orgId);
    if (!membership) return res.status(400).json({ error: { message: 'User is not assigned to this school' } });

    const email = (user.email || user.username || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: { message: 'User must have an email to be set as primary contact' } });
    }

    await upsertSchoolContactRoleFlags({
      orgId,
      email,
      fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
      isSchoolAdmin: true,
      isScheduler: (await getSchoolStaffRoleFlagsForOrg(orgId)).get(email)?.isScheduler || false
    });

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    logAuditEvent(req, {
      actionType: 'school_portal_school_admin_assigned',
      agencyId: activeAgencyId || undefined,
      targetType: 'user',
      targetId: targetUserId,
      metadata: { schoolOrganizationId: orgId, actorRole, actorIsSchoolAdmin: isSchoolAdmin }
    }).catch(() => {});
    if (activeAgencyId) {
      const org = await Agency.findById(orgId);
      const schoolName = org?.name || org?.official_name || `School #${orgId}`;
      await notifyAgencyAdmins({
        agencyId: activeAgencyId,
        title: 'School Admin assigned',
        message: `${user.first_name || ''} ${user.last_name || ''} (${email}) was granted School Admin access for ${schoolName}.`,
        actorUserId: actorId,
        relatedEntityType: 'user',
        relatedEntityId: targetUserId
      });
    }

    res.json({ ok: true, message: 'School Admin assigned' });
  } catch (e) {
    next(e);
  }
};

/**
 * Update school-scoped role flags for a school_staff user.
 * PATCH /api/school-portal/:organizationId/school-staff/:userId/roles
 * Body: { isSchoolAdmin?: boolean, isScheduler?: boolean }
 */
export const updateSchoolStaffRoleFlags = async (req, res, next) => {
  try {
    const { organizationId, userId: targetUserIdParam } = req.params;
    const orgId = parseInt(String(organizationId), 10);
    const targetUserId = parseInt(String(targetUserIdParam), 10);
    if (!orgId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid organizationId or userId' } });

    const actorId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorEmail = req.user?.email || req.user?.username || null;
    const isAgencyAdmin =
      actorRole === 'super_admin' ||
      actorRole === 'admin' ||
      actorRole === 'staff' ||
      actorRole === 'support' ||
      actorRole === 'clinical_practice_assistant' ||
      actorRole === 'provider_plus';
    const actorFlags = actorRole === 'school_staff'
      ? await getActorSchoolRoleFlags({ actorUserId: actorId, actorEmail, orgId })
      : { isSchoolAdmin: false };
    const isSchoolAdmin = actorRole === 'school_staff' && actorFlags.isSchoolAdmin === true;
    if (!isAgencyAdmin && !isSchoolAdmin) {
      return res.status(403).json({ error: { message: 'Only a School Admin or agency admin/staff can change school role flags' } });
    }

    const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId: actorId, role: actorRole, schoolOrganizationId: orgId });
    if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(user.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can have school role flags' } });
    }
    const membership = await User.getAgencyMembership(targetUserId, orgId);
    if (!membership) return res.status(400).json({ error: { message: 'User is not assigned to this school' } });

    const hasAdminPatch = typeof req.body?.isSchoolAdmin === 'boolean';
    const hasSchedulerPatch = typeof req.body?.isScheduler === 'boolean';
    if (!hasAdminPatch && !hasSchedulerPatch) {
      return res.status(400).json({ error: { message: 'Provide isSchoolAdmin and/or isScheduler as boolean values' } });
    }

    const email = normalizeEmail(user.email || user.work_email || user.username || '');
    if (!email) return res.status(400).json({ error: { message: 'Target user must have a valid email address' } });

    const roleMap = await getSchoolStaffRoleFlagsForOrg(orgId);
    const before = roleMap.get(email) || { isSchoolAdmin: false, isScheduler: false };
    const nextIsSchoolAdmin = hasAdminPatch ? !!req.body.isSchoolAdmin : !!before.isSchoolAdmin;
    const nextIsScheduler = hasSchedulerPatch ? !!req.body.isScheduler : !!before.isScheduler;

    await upsertSchoolContactRoleFlags({
      orgId,
      email,
      fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
      isSchoolAdmin: nextIsSchoolAdmin,
      isScheduler: nextIsScheduler
    });

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    logAuditEvent(req, {
      actionType: 'school_portal_school_staff_role_flags_updated',
      agencyId: activeAgencyId || undefined,
      targetType: 'user',
      targetId: targetUserId,
      metadata: {
        schoolOrganizationId: orgId,
        actorRole,
        actorIsSchoolAdmin: isSchoolAdmin,
        before,
        after: { isSchoolAdmin: nextIsSchoolAdmin, isScheduler: nextIsScheduler }
      }
    }).catch(() => {});
    if (activeAgencyId) {
      const org = await Agency.findById(orgId);
      const schoolName = org?.name || org?.official_name || `School #${orgId}`;
      await notifyAgencyAdmins({
        agencyId: activeAgencyId,
        title: 'School staff role flags updated',
        message: `${user.first_name || ''} ${user.last_name || ''} (${email}) role flags were updated for ${schoolName}. School Admin: ${nextIsSchoolAdmin ? 'Yes' : 'No'}, Scheduler: ${nextIsScheduler ? 'Yes' : 'No'}.`,
        actorUserId: actorId,
        relatedEntityType: 'user',
        relatedEntityId: targetUserId
      });
    }

    return res.json({
      ok: true,
      userId: targetUserId,
      roleFlags: {
        is_school_admin: nextIsSchoolAdmin,
        is_scheduler: nextIsScheduler
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Forfeit School Admin permission for current user in current school.
 * POST /api/school-portal/:organizationId/school-staff/forfeit-school-admin
 */
export const forfeitSchoolAdmin = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(String(organizationId), 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });
    const actorId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorEmail = req.user?.email || req.user?.username || null;
    if (actorRole !== 'school_staff') {
      return res.status(403).json({ error: { message: 'Only school staff can forfeit School Admin' } });
    }
    const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId: actorId, role: actorRole, schoolOrganizationId: orgId });
    if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });

    const flags = await getActorSchoolRoleFlags({ actorUserId: actorId, actorEmail, orgId });
    if (!flags.isSchoolAdmin) {
      return res.status(400).json({ error: { message: 'You are not currently a School Admin for this school' } });
    }
    const actor = await User.findById(actorId);
    const email = normalizeEmail(actor?.email || actor?.work_email || actor?.username || actorEmail || '');
    if (!email) return res.status(400).json({ error: { message: 'Could not resolve your account email' } });

    await upsertSchoolContactRoleFlags({
      orgId,
      email,
      fullName: `${actor?.first_name || ''} ${actor?.last_name || ''}`.trim() || null,
      isSchoolAdmin: false,
      isScheduler: !!flags.isScheduler
    });

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    logAuditEvent(req, {
      actionType: 'school_portal_school_admin_forfeited',
      agencyId: activeAgencyId || undefined,
      targetType: 'user',
      targetId: actorId,
      metadata: { schoolOrganizationId: orgId }
    }).catch(() => {});
    if (activeAgencyId) {
      const org = await Agency.findById(orgId);
      const schoolName = org?.name || org?.official_name || `School #${orgId}`;
      await notifyAgencyAdmins({
        agencyId: activeAgencyId,
        title: 'School Admin forfeited',
        message: `${actor?.first_name || ''} ${actor?.last_name || ''} (${email}) forfeited School Admin access for ${schoolName}.`,
        actorUserId: actorId,
        relatedEntityType: 'user',
        relatedEntityId: actorId
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * School Portal FAQ (non-client-specific).
 * GET /api/school-portal/:organizationId/faq
 *
 * Returns published FAQs for the affiliated agency of this school/program/learning org.
 */
export const listSchoolPortalFaq = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const userRole = req.user?.role;

    const organization = await Agency.findById(orgId);
    if (!organization) return res.status(404).json({ error: { message: 'Organization not found' } });
    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    const allowedTypes = ['school', 'program', 'learning'];
    if (!allowedTypes.includes(orgType)) {
      return res.status(400).json({
        error: { message: `This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}` }
      });
    }

    // Access rules match other school portal read endpoints.
    if (userRole !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: userRole, schoolOrganizationId: orgId });
      if (!ok) {
        return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
      }
    }

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    if (!activeAgencyId) return res.json([]);

    // Best-effort: if the FAQ table is not migrated yet, return empty list.
    try {
      const [tables] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_portal_faqs'"
      );
      const has = Number(tables?.[0]?.cnt || 0) > 0;
      if (!has) return res.json([]);
    } catch {
      return res.json([]);
    }

    const [rows] = await pool.execute(
      `SELECT id, subject, question, answer, ai_summary
       FROM school_portal_faqs
       WHERE agency_id = ?
         AND LOWER(status) = 'published'
       ORDER BY COALESCE(subject, '') ASC, id DESC`,
      [parseInt(activeAgencyId, 10)]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

function roleCanManageSchoolPortalFaq(userRole) {
  const role = String(userRole || '').toLowerCase();
  return (
    role === 'provider' ||
    role === 'admin' ||
    role === 'staff' ||
    role === 'support' ||
    role === 'super_admin' ||
    role === 'clinical_practice_assistant' ||
    role === 'provider_plus'
  );
}

async function hasSchoolPortalFaqTable() {
  try {
    const [tables] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_portal_faqs'"
    );
    return Number(tables?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function maybeGenerateFaqSummary({ question, answer }) {
  const prompt = [
    'Summarize the following FAQ into a short paragraph (1-3 sentences).',
    'Do NOT include any client identifiers, initials, or PHI.',
    '',
    'Question:',
    String(question || '').trim(),
    '',
    'Answer:',
    String(answer || '').trim()
  ].join('\n');
  try {
    const { text } = await callGeminiText({ prompt, temperature: 0.2, maxOutputTokens: 320 });
    const out = String(text || '').trim();
    return out ? out.slice(0, 900) : null;
  } catch {
    return null;
  }
}

/**
 * School Portal FAQ create (non-client-specific).
 * POST /api/school-portal/:organizationId/faq
 */
export const createSchoolPortalFaq = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!roleCanManageSchoolPortalFaq(userRole)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const organization = await Agency.findById(orgId);
    if (!organization) return res.status(404).json({ error: { message: 'Organization not found' } });
    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    const allowedTypes = ['school', 'program', 'learning'];
    if (!allowedTypes.includes(orgType)) {
      return res.status(400).json({
        error: { message: `This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}` }
      });
    }

    if (userRole !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: userRole, schoolOrganizationId: orgId });
      if (!ok) {
        return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
      }
    }

    if (!(await hasSchoolPortalFaqTable())) {
      return res.status(409).json({ error: { message: 'FAQ is not enabled (missing migration)' } });
    }

    const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    if (!activeAgencyId) {
      return res.status(409).json({ error: { message: 'No active affiliated agency configured for this organization' } });
    }

    const subject = req.body?.subject ? String(req.body.subject).trim().slice(0, 120) : null;
    const question = String(req.body?.question || '').trim();
    const answer = String(req.body?.answer || '').trim();
    if (!question || !answer) {
      return res.status(400).json({ error: { message: 'question and answer are required' } });
    }
    const aiSummary = await maybeGenerateFaqSummary({ question, answer });

    const [result] = await pool.execute(
      `INSERT INTO school_portal_faqs
        (agency_id, subject, question, answer, status, ai_summary, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, 'published', ?, ?, ?)`,
      [parseInt(activeAgencyId, 10), subject || 'General', question, answer, aiSummary, userId, userId]
    );

    const [rows] = await pool.execute(
      `SELECT id, subject, question, answer, ai_summary
       FROM school_portal_faqs
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );
    res.status(201).json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

async function resolveOrgIdFromParam(rawOrgIdOrSlug) {
  const raw = String(rawOrgIdOrSlug || '').trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  try {
    const org = await Agency.findBySlug(raw.toLowerCase());
    const id = org?.id ? parseInt(String(org.id), 10) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

async function clientBelongsToOrg({ clientId, orgId }) {
  const cid = parseInt(String(clientId), 10);
  const oid = parseInt(String(orgId), 10);
  if (!cid || !oid) return false;

  // Prefer multi-org assignment table; fall back to legacy clients.organization_id.
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_organization_assignments coa
       WHERE coa.client_id = ?
         AND coa.organization_id = ?
         AND coa.is_active = TRUE
       LIMIT 1`,
      [cid, oid]
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
         AND c.organization_id = ?
       LIMIT 1`,
      [cid, oid]
    );
    return !!rows?.[0];
  } catch {
    return false;
  }
}

async function providerAssignedToClientInOrg({ providerUserId, clientId, orgId }) {
  const pid = parseInt(String(providerUserId), 10);
  const cid = parseInt(String(clientId), 10);
  const oid = parseInt(String(orgId), 10);
  if (!pid || !cid || !oid) return false;

  // Prefer assignment table; fall back to legacy clients.provider_id.
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

/**
 * Get singleton waitlist note (shared, collaborative).
 * GET /api/school-portal/:organizationId/clients/:clientId/waitlist-note
 */
export const getClientWaitlistNote = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    const clientId = parseInt(req.params.clientId, 10);
    if (!orgId || !clientId) return res.status(400).json({ error: { message: 'Invalid organizationId or clientId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const requesterEmail = req.user?.email || req.user?.username || null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    // Ensure client is actually part of this org (prevents cross-org note disclosure).
    const inOrg = await clientBelongsToOrg({ clientId, orgId });
    if (!inOrg) return res.status(404).json({ error: { message: 'Client not found in this organization' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const roiAccess = await ensureSchoolStaffClientRoiAccess({
      userId,
      role: roleNorm,
      schoolOrganizationId: orgId,
      clientId
    });
    if (!roiAccess.ok) return res.status(roiAccess.status).json({ error: { message: roiAccess.message } });
    const schedulerOwnOnly = await isSchedulerSchoolStaff({
      userId,
      role: roleNorm,
      actorEmail: requesterEmail,
      orgId
    });

    const providerUserId = roleNorm === 'provider' ? Number(userId) : null;
    const providerClientIds = providerUserId ? await getProviderAssignedClientIds({ providerUserId, schoolOrganizationId: orgId }) : [];
    const providerClientPlaceholders = providerClientIds.map(() => '?').join(',');

    const isSupervisorOnly = await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user });
    // Providers can only read waitlist notes for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // Supervisor-only (not admin/super_admin) are scoped to clients assigned to their supervisees.
    if (isSupervisorOnly) {
      const assigned = await supervisorCanAccessClientInOrg({ supervisorUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const note = await ClientNotes.findLatestSharedByClientAndCategory(clientId, 'waitlist');
    if (!note) return res.json({ note: null });

    logClientAccess(req, clientId, 'school_portal_waitlist_viewed').catch(() => {});

    res.json({
      note: {
        id: note.id,
        message: note.message || '',
        created_at: note.created_at || null,
        author_id: note.author_id || null,
        author_name: note.author_name || null,
        category: note.category || 'waitlist'
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Upsert singleton waitlist note (shared, collaborative overwrite).
 * PUT /api/school-portal/:organizationId/clients/:clientId/waitlist-note
 * body: { message }
 */
export const upsertClientWaitlistNote = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    const clientId = parseInt(req.params.clientId, 10);
    if (!orgId || !clientId) return res.status(400).json({ error: { message: 'Invalid organizationId or clientId' } });

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const schedulerOwnOnly = await isSchedulerSchoolStaff({
      userId,
      role: roleNorm,
      actorEmail: req.user?.email || req.user?.username || null,
      orgId
    });
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const inOrg = await clientBelongsToOrg({ clientId, orgId });
    if (!inOrg) return res.status(404).json({ error: { message: 'Client not found in this organization' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const roiAccess = await ensureSchoolStaffClientRoiAccess({
      userId,
      role: roleNorm,
      schoolOrganizationId: orgId,
      clientId
    });
    if (!roiAccess.ok) return res.status(roiAccess.status).json({ error: { message: roiAccess.message } });

    const isSupervisorOnly = await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user });
    // Providers can only edit waitlist notes for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // Supervisor-only (not admin/super_admin) are scoped to clients assigned to their supervisees.
    if (isSupervisorOnly) {
      const assigned = await supervisorCanAccessClientInOrg({ supervisorUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const saved = await ClientNotes.upsertSharedSingletonByClientAndCategory({
      clientId,
      category: 'waitlist',
      message,
      actorUserId: userId
    });

    logClientAccess(req, clientId, 'school_portal_waitlist_updated').catch(() => {});

    res.status(201).json({
      note: saved
        ? {
            id: saved.id,
            message: saved.message || '',
            created_at: saved.created_at || null,
            author_id: saved.author_id || null,
            author_name: saved.author_name || null,
            category: saved.category || 'waitlist'
          }
        : null
    });
  } catch (e) {
    next(e);
  }
};

/**
 * List shared client comments (non-ticket notes) for School Portal.
 * GET /api/school-portal/:organizationId/clients/:clientId/comments
 */
export const listClientComments = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    const clientId = parseInt(req.params.clientId, 10);
    if (!orgId || !clientId) return res.status(400).json({ error: { message: 'Invalid organizationId or clientId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const inOrg = await clientBelongsToOrg({ clientId, orgId });
    if (!inOrg) return res.status(404).json({ error: { message: 'Client not found in this organization' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const roiAccess = await ensureSchoolStaffClientRoiAccess({
      userId,
      role: roleNorm,
      schoolOrganizationId: orgId,
      clientId
    });
    if (!roiAccess.ok) return res.status(roiAccess.status).json({ error: { message: roiAccess.message } });

    const isSupervisorOnly = await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user });
    // Providers may only view comments for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // Supervisor-only (not admin/super_admin) are scoped to clients assigned to their supervisees.
    if (isSupervisorOnly) {
      const assigned = await supervisorCanAccessClientInOrg({ supervisorUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Shared notes only (internal notes are filtered by the model when canViewInternalNotes=false).
    const notes = await ClientNotes.findByClientId(clientId, { hasAgencyAccess: false, canViewInternalNotes: false });
    const out = (notes || [])
      .filter((n) => String(n?.category || '').toLowerCase() === 'comment')
      .filter((n) => !schedulerOwnOnly || Number(n?.author_id || 0) === Number(userId))
      .slice(0, 200)
      .map((n) => ({
        id: n.id,
        created_at: n.created_at || null,
        message: n.message || '',
        author_id: n.author_id || null,
        author_name: n.author_name || null
      }));

    logClientAccess(req, clientId, 'school_portal_comments_viewed').catch(() => {});

    res.json(out);
  } catch (e) {
    next(e);
  }
};

/**
 * Create a shared client comment (non-ticket note) for School Portal.
 * POST /api/school-portal/:organizationId/clients/:clientId/comments
 * body: { message }
 */
export const createClientComment = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    const clientId = parseInt(req.params.clientId, 10);
    if (!orgId || !clientId) return res.status(400).json({ error: { message: 'Invalid organizationId or clientId' } });

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 500) return res.status(400).json({ error: { message: 'Comment is too long (max 500 characters)' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const inOrg = await clientBelongsToOrg({ clientId, orgId });
    if (!inOrg) return res.status(404).json({ error: { message: 'Client not found in this organization' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const roiAccess = await ensureSchoolStaffClientRoiAccess({
      userId,
      role: roleNorm,
      schoolOrganizationId: orgId,
      clientId
    });
    if (!roiAccess.ok) return res.status(roiAccess.status).json({ error: { message: roiAccess.message } });

    const isSupervisorOnly = await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user });
    // Providers may only comment for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // Supervisor-only (not admin/super_admin) are scoped to clients assigned to their supervisees.
    if (isSupervisorOnly) {
      const assigned = await supervisorCanAccessClientInOrg({ supervisorUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const saved = await ClientNotes.create(
      { client_id: clientId, author_id: userId, message, is_internal_only: false, category: 'comment', urgency: 'low' },
      { hasAgencyAccess: false, canViewInternalNotes: false }
    );

    logClientAccess(req, clientId, 'school_portal_comment_posted').catch(() => {});

    res.status(201).json({
      comment: saved
        ? {
            id: saved.id,
            created_at: saved.created_at || null,
            message: saved.message || '',
            author_id: saved.author_id || null,
            author_name: saved.author_name || null
          }
        : null
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Create or reuse a client-specific Smart ROI signing link from the school portal.
 * POST /api/school-portal/:organizationId/clients/:clientId/smart-roi-link
 */
export const issueSchoolPortalClientSmartRoiLink = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    const clientId = parseInt(req.params.clientId, 10);
    if (!orgId || !clientId) {
      return res.status(400).json({ error: { message: 'Invalid organizationId or clientId' } });
    }

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) {
      return res.status(401).json({ error: { message: 'Not authenticated' } });
    }

    await assertSchoolPortalAccess(req, orgId);

    const inOrg = await clientBelongsToOrg({ clientId, orgId });
    if (!inOrg) {
      return res.status(404).json({ error: { message: 'Client not found in this organization' } });
    }

    const isSupervisorOnly = await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user });
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (isSupervisorOnly) {
      const assigned = await supervisorCanAccessClientInOrg({ supervisorUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    const issueResult = await ensureIssuedRoiSigningLinkForClient({
      client,
      schoolOrganizationId: orgId,
      actorUserId: userId,
      regenerate: false
    });
    if (!issueResult.ok) {
      return res.status(issueResult.status || 400).json({ error: { message: issueResult.message || 'Unable to prepare Smart ROI link' } });
    }

    res.json({
      client_id: Number(client.id),
      school_organization_id: Number(orgId),
      issued_link: {
        id: Number(issueResult.issuedLink?.id || 0) || null,
        public_key: issueResult.issuedLink?.public_key || null,
        status: String(issueResult.issuedLink?.status || 'issued').trim().toLowerCase(),
        intake_link_id: Number(issueResult.issuedLink?.intake_link_id || 0) || null,
        intake_link_title: issueResult.issuedLink?.intake_link_title || null,
        issued_at: issueResult.issuedLink?.issued_at || null
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Combined school portal notifications feed (client events + manual announcements).
 * GET /api/school-portal/:organizationId/notifications/feed
 */
export const listSchoolPortalNotificationsFeed = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({
        userId,
        role: roleNorm,
        user: req.user,
        schoolOrganizationId: orgId
      });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const providerUserId = roleNorm === 'provider' ? Number(userId) : null;
    const providerClientIds = providerUserId
      ? await getProviderAssignedClientIds({ providerUserId, schoolOrganizationId: orgId })
      : [];
    const providerClientPlaceholders = providerClientIds.map(() => '?').join(',');

    // Admin/super_admin/support get full access (all clients); supervisor-only gets supervisees' clients.
    const isSupervisorOnly = await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user });
    const supervisorClientIds = isSupervisorOnly
      ? await listSupervisorClientIdsForOrg({ supervisorUserId: userId, orgId })
      : [];
    const supervisorClientPlaceholders = supervisorClientIds.map(() => '?').join(',');

    const scopedClientIds = providerUserId
      ? providerClientIds
      : (isSupervisorOnly ? supervisorClientIds : []);
    const scopedClientPlaceholders = providerUserId
      ? providerClientPlaceholders
      : (isSupervisorOnly ? supervisorClientPlaceholders : '');
    const hasScopedRole = !!providerUserId || isSupervisorOnly;
    const canQueryScopedClients = !hasScopedRole || scopedClientIds.length > 0;

    // Per-user client notification toggles (default ON when missing).
    const categories = await getUserNotificationCategories(userId);
    const allowAnnouncements = categories.school_portal_announcements !== false;
    const allowClientUpdates = categories.school_portal_client_updates !== false;
    const allowStatusUpdates = categories.school_portal_client_update_status !== false;
    const allowProviderUpdates = categories.school_portal_client_update_provider !== false;
    const allowServiceDayUpdates = categories.school_portal_client_update_service_day !== false;
    const allowSubmissionDateUpdates = categories.school_portal_client_update_submission_date !== false;
    const allowDocumentDateUpdates = categories.school_portal_client_update_document_date !== false;
    const allowOrgSwaps = categories.school_portal_client_update_org_swaps !== false;
    const allowOtherUpdates = categories.school_portal_client_update_other !== false;
    const allowClientComments = categories.school_portal_client_comments !== false;
    const allowClientMessages = categories.school_portal_client_messages !== false;
    const allowTickets = categories.school_portal_ticket_activity !== false;
    const allowTicketsForUser = allowTickets && !schedulerOwnOnly;
    const allowClientCreated = categories.school_portal_client_created !== false;
    const allowProviderSlots = categories.school_portal_provider_slots !== false;
    const allowProviderDayAdded = categories.school_portal_provider_day_added !== false;
    const allowDocsLinks = categories.school_portal_docs_links !== false;
    const allowChecklist = categories.school_portal_checklist_updates !== false;
    const allowAssignments = categories.school_portal_client_assignments !== false;
    const allowIntakePacketSubmitted = categories.school_portal_intake_packet_submitted !== false;

    // Manual announcements (all, newest-first)
    let announcements = [];
    try {
      if (!allowAnnouncements) {
        announcements = [];
      } else {
        const [rows] = await pool.execute(
          `SELECT
             a.id,
             a.organization_id,
             a.title,
             a.message,
             a.display_type,
             a.audience,
             a.starts_at,
             a.ends_at,
             a.created_at,
             u.first_name,
             u.last_name
           FROM school_portal_announcements a
           LEFT JOIN users u ON u.id = a.created_by_user_id
           WHERE a.organization_id = ?
           ORDER BY a.created_at DESC, a.id DESC
           LIMIT 200`,
          [orgId]
        );
        announcements = (rows || []).map((r) => ({
          id: `announcement:${r.id}`,
          kind: 'announcement',
          created_at: r.created_at,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          display_type: r.display_type || 'announcement',
          audience: r.audience || 'everyone',
          title: r.title || 'Announcement',
          message: r.message || '',
          actor_name: [String(r.first_name || '').trim(), String(r.last_name || '').trim()].filter(Boolean).join(' ').trim() || null
        }));
      }
    } catch (e) {
      // table may not exist yet; ignore
      announcements = [];
    }

    // Client history from client_status_history (scoped to clients affiliated with this org)
    let events = [];
    let checklistUpdates = [];
    let statusChanges = [];
    let assignmentChanges = [];
    try {
      const needsHistory =
        allowClientUpdates || allowChecklist || allowAssignments || allowStatusUpdates || allowServiceDayUpdates || allowSubmissionDateUpdates
        || allowDocumentDateUpdates || allowOrgSwaps || allowOtherUpdates;
      if (!needsHistory) {
        events = [];
      } else if (canQueryScopedClients) {
        const providerFilter = hasScopedRole ? `AND h.client_id IN (${scopedClientPlaceholders})` : '';
        const params = hasScopedRole ? [orgId, ...scopedClientIds] : [orgId];
        const [rows] = await pool.execute(
          `SELECT
             h.id,
             h.client_id,
             h.field_changed,
             h.from_value,
             h.to_value,
             h.note,
             h.changed_at,
             c.initials,
             c.identifier_code,
             u.first_name AS actor_first_name,
             u.last_name AS actor_last_name
           FROM client_status_history h
           JOIN client_organization_assignments coa
             ON coa.client_id = h.client_id
            AND coa.organization_id = ?
            AND coa.is_active = TRUE
           JOIN clients c ON c.id = h.client_id
           LEFT JOIN users u ON u.id = h.changed_by_user_id
           WHERE 1=1
           ${providerFilter}
           ORDER BY h.changed_at DESC, h.id DESC
           LIMIT 800`,
          params
        );

        const history = Array.isArray(rows) ? rows : [];
        const statusIds = new Set();
        const providerIds = new Set();
        for (const r of history) {
          if (String(r.field_changed || '') === 'client_status_id') {
            const fromId = parseInt(r.from_value, 10);
            const toId = parseInt(r.to_value, 10);
            if (Number.isFinite(fromId)) statusIds.add(fromId);
            if (Number.isFinite(toId)) statusIds.add(toId);
          }
          if (['provider_id', 'provider_user_id'].includes(String(r.field_changed || ''))) {
            const fromId = parseInt(r.from_value, 10);
            const toId = parseInt(r.to_value, 10);
            if (Number.isFinite(fromId)) providerIds.add(fromId);
            if (Number.isFinite(toId)) providerIds.add(toId);
          }
        }

        const statusLabels = new Map();
        if (statusIds.size > 0) {
          const ids = Array.from(statusIds);
          const [sRows] = await pool.execute(
            `SELECT id, label FROM client_statuses WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids
          );
          for (const r of sRows || []) statusLabels.set(Number(r.id), String(r.label || ''));
        }

        const providerNames = new Map();
        if (providerIds.size > 0) {
          const ids = Array.from(providerIds);
          const [pRows] = await pool.execute(
            `SELECT id, first_name, last_name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids
          );
          for (const r of pRows || []) {
            const name = [String(r.first_name || '').trim(), String(r.last_name || '').trim()].filter(Boolean).join(' ').trim();
            providerNames.set(Number(r.id), name || `Provider ${r.id}`);
          }
        }

        const parseMaybe = (v) => {
          if (!v) return null;
          if (typeof v === 'object') return v;
          if (typeof v !== 'string') return null;
          try {
            return JSON.parse(v);
          } catch {
            return null;
          }
        };

        for (const r of history) {
          const actor = [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
          const clientLabel = String(r.identifier_code || r.initials || '—');
          const field = String(r.field_changed || '').trim();

          if (field === 'compliance_checklist' && allowChecklist) {
            const fromObj = parseMaybe(r.from_value) || {};
            const toObj = parseMaybe(r.to_value) || {};
            const checklistEvents = [
              { key: 'parentsContactedAt', label: 'Parent contacted' },
              { key: 'intakeAt', label: 'Intake date entered' },
              { key: 'firstServiceAt', label: 'First service date entered' }
            ];
            for (const ev of checklistEvents) {
              if (!toObj?.[ev.key] || toObj?.[ev.key] === fromObj?.[ev.key]) continue;
              checklistUpdates.push({
                id: `checklist:${r.id}:${ev.key}`,
                kind: 'checklist',
                created_at: r.changed_at,
                title: 'Checklist updated',
                message: `${clientLabel}: ${ev.label}`,
                actor_name: actor || null,
                client_id: Number(r.client_id),
                client_initials: r.initials || null,
                client_identifier_code: r.identifier_code || null
              });
            }
            continue;
          }

          if ((field === 'client_status_id' || field === 'status') && allowStatusUpdates) {
            let fromLabel = String(r.from_value || '').trim();
            let toLabel = String(r.to_value || '').trim();
            if (field === 'client_status_id') {
              const fromId = parseInt(r.from_value, 10);
              const toId = parseInt(r.to_value, 10);
              if (Number.isFinite(fromId)) fromLabel = statusLabels.get(fromId) || `Status ${fromId}`;
              if (Number.isFinite(toId)) toLabel = statusLabels.get(toId) || `Status ${toId}`;
            }
            statusChanges.push({
              id: `status:${r.id}`,
              kind: 'status',
              created_at: r.changed_at,
              title: 'Status changed',
              message: `${clientLabel}: ${fromLabel || 'Unknown'} → ${toLabel || 'Unknown'}`,
              actor_name: actor || null,
              client_id: Number(r.client_id),
              client_initials: r.initials || null,
              client_identifier_code: r.identifier_code || null
            });
            continue;
          }

          if (['provider_id', 'provider_user_id'].includes(field) && allowAssignments) {
            const toId = parseInt(r.to_value, 10);
            if (!Number.isFinite(toId)) continue;
            const toName = providerNames.get(toId) || `Provider ${toId}`;
            assignmentChanges.push({
              id: `assignment:${r.id}`,
              kind: 'assignment',
              created_at: r.changed_at,
              title: 'Client assigned',
              message: `${clientLabel}: assigned to ${toName}`,
              actor_name: actor || null,
              client_id: Number(r.client_id),
              client_initials: r.initials || null,
              client_identifier_code: r.identifier_code || null
            });
            continue;
          }

          if (!allowClientUpdates) continue;

          if (!allowOrgSwaps && field === 'organization_id') continue;
          if ((field === 'provider_id' || field === 'provider_user_id') && !allowAssignments) continue;
          if (field === 'service_day' && !allowServiceDayUpdates) continue;
          if (field === 'submission_date' && !allowSubmissionDateUpdates) continue;
          if (field === 'doc_date' && !allowDocumentDateUpdates) continue;
          if (
            !['client_status_id', 'status', 'provider_id', 'provider_user_id', 'service_day', 'submission_date', 'doc_date', 'organization_id'].includes(field)
            && !allowOtherUpdates
          ) {
            continue;
          }

          const title =
            field === 'client_status_id' || field === 'status'
              ? 'Client status updated'
              : field === 'provider_id' || field === 'provider_user_id'
                ? 'Provider assignment updated'
                : field === 'service_day'
                  ? 'Assigned day updated'
                  : field === 'submission_date'
                    ? 'Submission date updated'
                    : field === 'doc_date'
                      ? 'Document date updated'
                      : field === 'organization_id'
                        ? 'Organization updated'
                        : 'Client updated';

          const msg =
            field === 'client_status_id' || field === 'status'
              ? `${clientLabel}: status updated`
              : field === 'provider_id' || field === 'provider_user_id'
                ? `${clientLabel}: provider assignment updated`
                : field === 'service_day'
                  ? `${clientLabel}: assigned day updated`
                  : field === 'submission_date'
                    ? `${clientLabel}: submission date updated`
                    : field === 'doc_date'
                      ? `${clientLabel}: document date updated`
                      : field === 'organization_id'
                        ? `${clientLabel}: organization updated`
                        : `${clientLabel}: updated`;

          events.push({
            id: `client_event:${r.id}`,
            kind: 'client_event',
            created_at: r.changed_at,
            title,
            message: msg,
            actor_name: actor || null,
            client_id: Number(r.client_id),
            client_initials: r.initials || null,
            client_identifier_code: r.identifier_code || null
          });
        }
      }
    } catch (e) {
      events = [];
      checklistUpdates = [];
      statusChanges = [];
      assignmentChanges = [];
    }

    // Client comments (client_notes, non-internal, category=comment)
    let comments = [];
    try {
      if (!allowClientComments) {
        comments = [];
      } else if (canQueryScopedClients) {
        const providerFilter = hasScopedRole ? `AND n.client_id IN (${scopedClientPlaceholders})` : '';
        const params = hasScopedRole ? [orgId, ...scopedClientIds] : [orgId];
        const [rows] = await pool.execute(
          `SELECT
             n.id,
             n.client_id,
            n.message,
            n.author_id,
             n.created_at,
             c.initials,
             c.identifier_code,
             u.first_name AS actor_first_name,
             u.last_name AS actor_last_name
           FROM client_notes n
           JOIN client_organization_assignments coa
             ON coa.client_id = n.client_id
            AND coa.organization_id = ?
            AND coa.is_active = TRUE
           JOIN clients c ON c.id = n.client_id
           LEFT JOIN users u ON u.id = n.author_id
           WHERE n.is_internal_only = FALSE
             AND (n.category IS NULL OR n.category = 'comment')
             ${providerFilter}
           ORDER BY n.created_at DESC, n.id DESC
           LIMIT 400`,
          params
        );
        comments = (rows || []).map((r) => {
          const actor = [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
          const clientLabel = String(r.identifier_code || r.initials || '—');
          const raw = String(r.message || '').trim();
          const snippet = raw.length > 260 ? `${raw.slice(0, 260)}…` : raw;
          if (schedulerOwnOnly && Number(r.author_id || 0) !== Number(userId)) return null;
          return {
            id: `comment:${r.id}`,
            kind: 'comment',
            created_at: r.created_at,
            title: 'New comment',
            message: snippet ? `${clientLabel}: ${snippet}` : `${clientLabel}: comment added`,
            actor_name: actor || null,
            client_id: Number(r.client_id),
            client_initials: r.initials || null,
            client_identifier_code: r.identifier_code || null
          };
        }).filter(Boolean);
      }
    } catch {
      comments = [];
    }

    // Client messages (support_ticket_messages for client-scoped tickets)
    let messages = [];
    try {
      if (!allowClientMessages) {
        messages = [];
      } else if (canQueryScopedClients) {
        if (await hasSupportTicketMessagesTable()) {
          const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
          const providerFilter = hasScopedRole ? `AND t.client_id IN (${scopedClientPlaceholders})` : '';
          const params = hasScopedRole ? [orgId, orgId, ...scopedClientIds] : [orgId, orgId];
          const [rows] = await pool.execute(
            `SELECT
              m.id,
              m.ticket_id,
               t.client_id,
               m.body,
               m.created_at,
               c.initials,
               c.identifier_code,
               u.first_name AS actor_first_name,
               u.last_name AS actor_last_name,
               m.author_user_id
             FROM support_ticket_messages m
             JOIN support_tickets t ON t.id = m.ticket_id
             JOIN client_organization_assignments coa
               ON coa.client_id = t.client_id
              AND coa.organization_id = ?
              AND coa.is_active = TRUE
             JOIN clients c ON c.id = t.client_id
             LEFT JOIN users u ON u.id = m.author_user_id
             WHERE t.school_organization_id = ?
               AND t.client_id IS NOT NULL
               ${hasSoftDelete ? 'AND (m.is_deleted IS NULL OR m.is_deleted = 0)' : ''}
               ${providerFilter}
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT 400`,
            params
          );
          messages = (rows || []).map((r) => {
          const actor = [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
          const clientLabel = String(r.identifier_code || r.initials || '—');
          const raw = String(r.body || '').trim();
          const snippet = raw.length > 260 ? `${raw.slice(0, 260)}…` : raw;
          if (schedulerOwnOnly && Number(r.author_user_id || 0) !== Number(userId)) return null;
          return {
            id: `ticket_message:${r.id}`,
            kind: 'message',
            category: 'ticket',
            created_at: r.created_at,
            title: 'New message',
            message: snippet ? `${clientLabel}: ${snippet}` : `${clientLabel}: new message`,
            actor_name: actor || null,
            ticket_id: r.ticket_id ? Number(r.ticket_id) : null,
            client_id: Number(r.client_id),
            client_initials: r.initials || null,
            client_identifier_code: r.identifier_code || null
          };
          }).filter(Boolean);
        }
      }
    } catch {
      messages = [];
    }

    // Ticket activity (created, reply, closed)
    let ticketActivity = [];
    try {
      if (!allowTicketsForUser || roleNorm === 'provider') {
        ticketActivity = [];
      } else if (await hasSupportTicketMessagesTable()) {
        const [ticketRows] = await pool.execute(
          `SELECT
             t.id,
             t.client_id,
             t.status,
             t.subject,
             t.question,
             t.created_at,
             t.updated_at,
             c.initials,
           c.identifier_code,
           t.answer,
           t.answered_at,
           u.first_name AS actor_first_name,
           u.last_name AS actor_last_name,
           ab.first_name AS answered_by_first_name,
           ab.last_name AS answered_by_last_name
           FROM support_tickets t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN users u ON u.id = t.created_by_user_id
           LEFT JOIN users ab ON ab.id = t.answered_by_user_id
           WHERE t.school_organization_id = ?
           ORDER BY t.created_at DESC, t.id DESC
           LIMIT 200`,
          [orgId]
        );
        const createdItems = (ticketRows || []).map((r) => {
          const actor = [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
          const clientLabel = String(r.identifier_code || r.initials || '—');
          const subj = String(r.subject || '').trim() || 'Ticket';
          return {
            id: `ticket_created:${r.id}`,
            kind: 'ticket',
            category: 'ticket',
            created_at: r.created_at,
            title: 'New ticket',
            message: r.client_id ? `${clientLabel}: ${subj}` : subj,
            actor_name: actor || null,
            client_id: r.client_id ? Number(r.client_id) : null,
            client_initials: r.initials || null,
            client_identifier_code: r.identifier_code || null
          };
        });

        const closedItems = (ticketRows || [])
          .filter((r) => String(r.status || '').toLowerCase() === 'closed')
          .map((r) => {
            const actor = [String(r.answered_by_first_name || '').trim(), String(r.answered_by_last_name || '').trim()]
              .filter(Boolean)
              .join(' ')
              .trim() || [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
            const clientLabel = String(r.identifier_code || r.initials || '—');
            const subj = String(r.subject || '').trim() || 'Ticket';
            return {
              id: `ticket_closed:${r.id}`,
              kind: 'ticket',
              category: 'ticket',
              created_at: r.answered_at || r.updated_at || r.created_at,
              title: 'Ticket closed',
              message: r.client_id ? `${clientLabel}: ${subj}` : subj,
              actor_name: actor || null,
              client_id: r.client_id ? Number(r.client_id) : null,
              client_initials: r.initials || null,
              client_identifier_code: r.identifier_code || null
            };
          });

        const answeredItems = (ticketRows || [])
          .filter((r) => String(r.status || '').toLowerCase() === 'answered')
          .map((r) => {
            const actor = [String(r.answered_by_first_name || '').trim(), String(r.answered_by_last_name || '').trim()]
              .filter(Boolean)
              .join(' ')
              .trim() || [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
            const clientLabel = String(r.identifier_code || r.initials || '—');
            const subj = String(r.subject || '').trim() || 'Ticket';
            const raw = String(r.answer || '').trim();
            const snippet = raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
            const message = snippet ? `${clientLabel}: ${snippet}` : (r.client_id ? `${clientLabel}: ${subj}` : subj);
            return {
              id: `ticket_answered:${r.id}`,
              kind: 'ticket',
              category: 'ticket',
              created_at: r.answered_at || r.updated_at || r.created_at,
              title: 'Ticket answered',
              message,
              actor_name: actor || null,
              client_id: r.client_id ? Number(r.client_id) : null,
              client_initials: r.initials || null,
              client_identifier_code: r.identifier_code || null
            };
          });

        const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
        const [replyRows] = await pool.execute(
          `SELECT
             m.id,
             m.ticket_id,
             m.body,
             m.created_at,
             t.client_id,
             c.initials,
             c.identifier_code,
             u.first_name AS actor_first_name,
             u.last_name AS actor_last_name
           FROM support_ticket_messages m
           JOIN support_tickets t ON t.id = m.ticket_id
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN users u ON u.id = m.author_user_id
           WHERE t.school_organization_id = ?
             ${hasSoftDelete ? 'AND (m.is_deleted IS NULL OR m.is_deleted = 0)' : ''}
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT 200`,
          [orgId]
        );
        const replyItems = (replyRows || []).map((r) => {
          const actor = [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
          const clientLabel = String(r.identifier_code || r.initials || '—');
          const raw = String(r.body || '').trim();
          const snippet = raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
          return {
            id: `ticket_reply:${r.id}`,
            kind: 'ticket',
            category: 'ticket',
            created_at: r.created_at,
            title: 'Ticket reply',
            message: r.client_id ? `${clientLabel}: ${snippet || 'reply added'}` : snippet || 'reply added',
            actor_name: actor || null,
            client_id: r.client_id ? Number(r.client_id) : null,
            client_initials: r.initials || null,
            client_identifier_code: r.identifier_code || null
          };
        });

        ticketActivity = [...createdItems, ...closedItems, ...answeredItems, ...replyItems];
      }
    } catch {
      ticketActivity = [];
    }

    // Client created notifications
    let clientCreated = [];
    try {
      if (!allowClientCreated) {
        clientCreated = [];
      } else if (canQueryScopedClients) {
        const providerFilter = hasScopedRole ? `AND c.id IN (${scopedClientPlaceholders})` : '';
        const params = hasScopedRole ? [orgId, ...scopedClientIds] : [orgId];
        const [rows] = await pool.execute(
          `SELECT
             c.id,
             c.created_at,
             c.source,
             c.initials,
             c.identifier_code,
             u.first_name,
             u.last_name
           FROM clients c
           JOIN client_organization_assignments coa
             ON coa.client_id = c.id
            AND coa.organization_id = ?
            AND coa.is_active = TRUE
           LEFT JOIN users u ON u.id = c.created_by_user_id
           WHERE 1=1
           ${providerFilter}
           ORDER BY c.created_at DESC, c.id DESC
           LIMIT 200`,
          params
        );
        const sourceLabel = (src) => {
          const s = String(src || '').toLowerCase();
          if (s.includes('packet') || s.includes('upload')) return 'packet';
          if (s.includes('email')) return 'email';
          if (s.includes('public_intake_link') || s.includes('intake_link')) return 'link or QR';
          if (s.includes('bulk_import')) return 'import';
          return 'manual';
        };
        clientCreated = (rows || []).map((r) => {
          const actor = [String(r.first_name || '').trim(), String(r.last_name || '').trim()].filter(Boolean).join(' ').trim();
          const clientLabel = String(r.identifier_code || r.initials || '—');
          const source = sourceLabel(r.source);
          const isLinkedPacket = String(r.source || '').toLowerCase().includes('public_intake_link') || String(r.source || '').toLowerCase().includes('intake_link');
          const title = isLinkedPacket ? 'New packet upload' : 'New client added';
          const msg = isLinkedPacket
            ? `${clientLabel}: ROI has not been updated by staff yet`
            : (actor ? `${clientLabel}: added by ${actor}` : `${clientLabel}: added via ${source}`);
          return {
            id: `client_created:${r.id}`,
            kind: 'client_created',
            created_at: r.created_at,
            title,
            message: msg,
            actor_name: actor || null,
            client_id: Number(r.id),
            client_initials: r.initials || null,
            client_identifier_code: r.identifier_code || null
          };
        });
      }
    } catch {
      clientCreated = [];
    }

    // Provider slot updates (added/closed)
    let providerSlots = [];
    try {
      if (!allowProviderSlots || roleNorm === 'provider') {
        providerSlots = [];
      } else {
        const [rows] = await pool.execute(
          `SELECT
             psa.id,
             psa.provider_user_id,
             psa.school_organization_id,
             psa.day_of_week,
             psa.slots_total,
             psa.slots_available,
             psa.is_active,
             psa.created_at,
             psa.updated_at,
             u.first_name,
             u.last_name
           FROM provider_school_assignments psa
           LEFT JOIN users u ON u.id = psa.provider_user_id
           WHERE psa.school_organization_id = ?
           ORDER BY psa.updated_at DESC, psa.id DESC
           LIMIT 200`,
          [orgId]
        );
        providerSlots = (rows || []).map((r) => {
          const name = [String(r.first_name || '').trim(), String(r.last_name || '').trim()].filter(Boolean).join(' ').trim() || 'Provider';
          const isClosed = r.is_active === 0 || r.is_active === false;
          const title = isClosed ? 'Provider closed' : 'Provider slots updated';
          const message = isClosed ? `${name}: closed schedule` : `${name}: ${Number(r.slots_total || 0)} slots`;
          return {
            id: `provider_slots:${r.id}:${isClosed ? 'closed' : 'updated'}`,
            kind: 'provider_slots',
            created_at: r.updated_at || r.created_at,
            title,
            message,
            actor_name: null
          };
        });
      }
    } catch {
      providerSlots = [];
    }

    // Provider added to day
    let providerDayAdded = [];
    try {
      if (!allowProviderDayAdded || roleNorm === 'provider') {
        providerDayAdded = [];
      } else {
        const [rows] = await pool.execute(
          `SELECT
             a.id,
             a.weekday,
             a.provider_user_id,
             a.created_at,
             a.created_by_user_id,
             p.first_name AS provider_first_name,
             p.last_name AS provider_last_name,
             u.first_name AS actor_first_name,
             u.last_name AS actor_last_name
           FROM school_day_provider_assignments a
           JOIN users p ON p.id = a.provider_user_id
           LEFT JOIN users u ON u.id = a.created_by_user_id
           WHERE a.school_organization_id = ?
             AND a.is_active = TRUE
           ORDER BY a.created_at DESC, a.id DESC
           LIMIT 200`,
          [orgId]
        );
        providerDayAdded = (rows || []).map((r) => {
          const providerName = [String(r.provider_first_name || '').trim(), String(r.provider_last_name || '').trim()].filter(Boolean).join(' ').trim() || 'Provider';
          const actor = [String(r.actor_first_name || '').trim(), String(r.actor_last_name || '').trim()].filter(Boolean).join(' ').trim();
          const day = String(r.weekday || '').trim();
          return {
            id: `provider_day:${r.id}`,
            kind: 'provider_day',
            created_at: r.created_at,
            title: 'Provider added to day',
            message: day ? `${providerName}: ${day}` : `${providerName}: added`,
            actor_name: actor || null
          };
        });
      }
    } catch {
      providerDayAdded = [];
    }

    // Documents/links added
    let docsLinks = [];
    try {
      if (!allowDocsLinks) {
        docsLinks = [];
      } else {
        let phiItems = [];
        if (canQueryScopedClients) {
          const docParams = hasScopedRole ? [orgId, ...scopedClientIds] : [orgId];
          const docFilter = hasScopedRole ? `AND c.id IN (${scopedClientPlaceholders})` : '';
          const [phiRows] = await pool.execute(
            `SELECT
               d.id,
               d.client_id,
               d.original_name,
               d.uploaded_at,
               c.initials,
               c.identifier_code,
               u.first_name,
               u.last_name
             FROM client_phi_documents d
             JOIN clients c ON c.id = d.client_id
             JOIN client_organization_assignments coa
               ON coa.client_id = d.client_id
              AND coa.organization_id = ?
              AND coa.is_active = TRUE
             LEFT JOIN users u ON u.id = d.uploaded_by_user_id
             WHERE 1=1
             ${docFilter}
             ORDER BY d.uploaded_at DESC, d.id DESC
             LIMIT 200`,
            docParams
          );
          phiItems = (phiRows || []).map((r) => {
          const actor = [String(r.first_name || '').trim(), String(r.last_name || '').trim()].filter(Boolean).join(' ').trim();
          const clientLabel = String(r.identifier_code || r.initials || '—');
          const name = String(r.original_name || '').trim() || 'document';
          return {
            id: `doc:${r.id}`,
            kind: 'doc',
            created_at: r.uploaded_at,
            title: 'New document added',
            message: `${clientLabel}: ${name}`,
            actor_name: actor || null,
            client_id: Number(r.client_id),
            client_initials: r.initials || null,
            client_identifier_code: r.identifier_code || null
          };
          });
        }

        const [pubRows] = await pool.execute(
          `SELECT
             d.id,
             d.title,
             d.link_url,
             d.created_at,
             u.first_name,
             u.last_name
           FROM school_public_documents d
           LEFT JOIN users u ON u.id = d.uploaded_by_user_id
           WHERE d.school_organization_id = ?
           ORDER BY d.created_at DESC, d.id DESC
           LIMIT 200`,
          [orgId]
        );
        const pubItems = (pubRows || []).map((r) => {
          const actor = [String(r.first_name || '').trim(), String(r.last_name || '').trim()].filter(Boolean).join(' ').trim();
          const isLink = !!String(r.link_url || '').trim();
          return {
            id: `public_doc:${r.id}`,
            kind: 'doc',
            created_at: r.created_at,
            title: isLink ? 'New link added' : 'New document added',
            message: String(r.title || '').trim() || (isLink ? 'Link added' : 'Document added'),
            actor_name: actor || null
          };
        });

        docsLinks = [...phiItems, ...pubItems];
      }
    } catch {
      docsLinks = [];
    }

    // Intake packet/link submissions (digital forms submitted to this school)
    let intakePacketSubmitted = [];
    try {
      if (!allowIntakePacketSubmitted) {
        intakePacketSubmitted = [];
      } else {
        const [intakeRows] = await pool.execute(
          `SELECT
             s.id,
             s.submitted_at,
             s.signer_name,
             s.client_id,
             isc.full_name AS client_full_name,
             c.initials AS client_initials,
             c.identifier_code AS client_identifier_code
           FROM intake_submissions s
           JOIN intake_links l ON s.intake_link_id = l.id
           LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
           LEFT JOIN clients c ON c.id = COALESCE(isc.client_id, s.client_id)
           WHERE l.organization_id = ?
             AND LOWER(COALESCE(l.scope_type, 'agency')) = 'school'
             AND s.submitted_at IS NOT NULL
           ORDER BY s.submitted_at DESC, s.id DESC
           LIMIT 200`,
          [orgId]
        );
        const seen = new Set();
        intakePacketSubmitted = (intakeRows || [])
          .filter((r) => {
            const key = `${r.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((r) => {
            const signer = String(r.signer_name || '').trim() || 'Parent/Guardian';
            const clientLabel =
              r.client_identifier_code || r.client_initials || r.client_full_name || '—';
            return {
              id: `intake_submitted:${r.id}`,
              kind: 'intake_packet_submitted',
              created_at: r.submitted_at,
              title: 'Intake packet submitted',
              message: `${clientLabel}: ${signer} submitted via digital form`,
              actor_name: signer,
              client_id: r.client_id ? Number(r.client_id) : null,
              client_initials: r.client_initials || null,
              client_identifier_code: r.client_identifier_code || null
            };
          });
      }
    } catch {
      intakePacketSubmitted = [];
    }

    const all = [
      ...announcements,
      ...events,
      ...checklistUpdates,
      ...statusChanges,
      ...assignmentChanges,
      ...comments,
      ...messages,
      ...ticketActivity,
      ...clientCreated,
      ...intakePacketSubmitted,
      ...providerSlots,
      ...docsLinks,
      ...providerDayAdded
    ];

    // Guard against join fanout (e.g., duplicate active org assignments) producing
    // duplicate feed rows for the same logical notification id.
    const deduped = [];
    const seenFeedIds = new Set();
    for (const item of all) {
      const key = String(item?.id || '');
      if (!key || seenFeedIds.has(key)) continue;
      seenFeedIds.add(key);
      deduped.push(item);
    }

    deduped.sort((a, b) => {
      const at = new Date(a.created_at || 0).getTime();
      const bt = new Date(b.created_at || 0).getTime();
      if (at !== bt) return bt - at;
      return String(b.id).localeCompare(String(a.id));
    });

    let responseItems = deduped.slice(0, 500);
    if (roleNorm === 'school_staff') {
      const clientIds = Array.from(
        new Set(responseItems.map((item) => Number(item?.client_id || 0)).filter(Boolean))
      );
      const accessByClientId = await listSchoolStaffAccessByClient({
        userId,
        role: roleNorm,
        schoolOrganizationId: orgId,
        clientIds
      });
      const roiExpiresByClientId = new Map();
      const resolvedStateByClientId = new Map();
      if (clientIds.length > 0) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [clientRows] = await pool.execute(
          `SELECT id, roi_expires_at
           FROM clients
           WHERE id IN (${placeholders})`,
          clientIds
        );
        for (const row of clientRows || []) {
          roiExpiresByClientId.set(Number(row.id), row.roi_expires_at || null);
        }
        await Promise.all(
          clientIds.map(async (clientId) => {
            const state = await ClientSchoolStaffRoiAccess.resolveSchoolStaffClientAccessState({
              clientId,
              schoolOrganizationId: orgId,
              schoolStaffUserId: userId
            });
            resolvedStateByClientId.set(clientId, state);
          })
        );
      }
      responseItems = responseItems.flatMap((item) => {
        const clientId = Number(item?.client_id || 0);
        if (!clientId) return [item];
        const accessMeta = getSchoolStaffPortalAccessMeta(
          { id: clientId, roi_expires_at: roiExpiresByClientId.get(clientId) || null },
          accessByClientId,
          resolvedStateByClientId
        );
        if (accessMeta.school_portal_can_open === false) {
          return [];
        }
        return [{
          ...item,
          client_access_locked: false,
          client_force_code_only: false,
          school_staff_effective_access_state: accessMeta.school_staff_effective_access_state
        }];
      });
    }

    res.json(responseItems);
  } catch (e) {
    next(e);
  }
};

/**
 * Compliance Corner (admin-only): query client access logs scoped to a school.
 * POST /api/school-portal/:organizationId/compliance-corner/query
 * body: { query }
 */
export const queryComplianceCorner = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!['super_admin', 'admin', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: { message: 'Query is required' } });

    const filters = await parseComplianceQuery(query);
    const limitRaw = Number.parseInt(filters?.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 10;

    const providerName = String(filters?.providerName || '').trim();
    const providerEmail = String(filters?.providerEmail || '').trim();
    const providerId = Number(filters?.providerId || 0) || null;
    const clientName = String(filters?.clientName || '').trim();
    const clientId = Number(filters?.clientId || 0) || null;
    const actionContains = String(filters?.actionContains || '').trim();
    const since = filters?.since ? new Date(filters.since) : null;
    const until = filters?.until ? new Date(filters.until) : null;

    let userRole = String(filters?.userRole || '').trim().toLowerCase();
    if (!userRole && (providerName || providerEmail || providerId)) userRole = 'provider';

    // Organization scoping is already enforced in the JOIN below.
    const clauses = ['1=1'];
    const params = [orgId];

    if (providerId) {
      clauses.push('l.user_id = ?');
      params.push(providerId);
    }

    if (userRole) {
      clauses.push('LOWER(l.user_role) = ?');
      params.push(userRole);
    }

    if (providerEmail) {
      clauses.push('LOWER(u.email) LIKE ?');
      params.push(`%${providerEmail.toLowerCase()}%`);
    }

    if (providerName) {
      const like = `%${providerName.toLowerCase()}%`;
      clauses.push(
        '(LOWER(u.first_name) LIKE ? OR LOWER(u.last_name) LIKE ? OR LOWER(CONCAT(u.first_name, " ", u.last_name)) LIKE ?)'
      );
      params.push(like, like, like);
    }

    if (clientId) {
      clauses.push('l.client_id = ?');
      params.push(clientId);
    }

    if (clientName) {
      const like = `%${clientName.toLowerCase()}%`;
      clauses.push('(LOWER(c.initials) LIKE ? OR LOWER(c.identifier_code) LIKE ?)');
      params.push(like, like);
    }

    if (actionContains) {
      const like = `%${actionContains.toLowerCase()}%`;
      clauses.push('(LOWER(l.action) LIKE ? OR LOWER(l.route) LIKE ?)');
      params.push(like, like);
    }

    if (since && !Number.isNaN(since.getTime())) {
      clauses.push('l.created_at >= ?');
      params.push(since);
    }

    if (until && !Number.isNaN(until.getTime())) {
      clauses.push('l.created_at <= ?');
      params.push(until);
    }

    let rows = [];
    try {
      const [out] = await pool.execute(
        `SELECT l.id,
                l.client_id,
                l.user_id,
                l.user_role,
                l.action,
                l.route,
                l.method,
                l.ip_address,
                l.user_agent,
                l.created_at,
                u.first_name AS user_first_name,
                u.last_name AS user_last_name,
                u.email AS user_email,
                c.initials AS client_initials,
                c.identifier_code AS client_identifier_code
         FROM client_access_logs l
         JOIN clients c ON c.id = l.client_id
         JOIN client_organization_assignments coa
           ON coa.client_id = c.id
          AND coa.organization_id = ?
          AND coa.is_active = TRUE
         LEFT JOIN users u ON u.id = l.user_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY l.created_at DESC
         LIMIT ?`,
        [...params, limit]
      );
      rows = Array.isArray(out) ? out : [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR');
      if (!missing) throw e;
      rows = [];
    }

    res.json({ filters: { ...filters, limit }, results: rows });
  } catch (e) {
    next(e);
  }
};

/**
 * Mark school portal notifications as read for the current user.
 * POST /api/school-portal/:organizationId/notifications/read
 * body: { kind?: string, clientId?: number }
 */
export const markSchoolPortalNotificationsRead = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const kindRaw = String(req.body?.kind || '').trim().toLowerCase();
    const normalizedKind = kindRaw === 'all' ? '' : kindRaw;
    const clientIdRaw = req.body?.clientId ?? req.body?.client_id ?? null;
    const clientId = clientIdRaw ? parseInt(clientIdRaw, 10) : null;
    const nowIso = new Date().toISOString();

    let progress = await getUserNotificationsProgress(userId);
    if (!normalizedKind && !clientId) {
      progress = setLastSeenByOrg(progress, orgId, nowIso);
    } else if (normalizedKind && clientId) {
      progress = setLastSeenByOrgClientKind(progress, orgId, clientId, normalizedKind, nowIso);
    } else if (normalizedKind) {
      progress = setLastSeenByOrgKind(progress, orgId, normalizedKind, nowIso);
    }

    await UserPreferences.update(userId, { school_portal_notifications_progress: progress });
    res.json({ ok: true, progress });
  } catch (e) {
    next(e);
  }
};

/**
 * Dismiss school portal notifications (per-user hide from list).
 * POST /api/school-portal/:organizationId/notifications/dismiss
 * body: { ids?: string[] } - notification IDs to dismiss. Omit or empty = dismiss all visible.
 */
export const dismissSchoolPortalNotifications = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const rawIds = req.body?.ids;
    const ids = Array.isArray(rawIds) ? rawIds.map((x) => String(x || '').trim()).filter(Boolean) : [];

    let progress = await getUserNotificationsProgress(userId);
    const orgKey = String(orgId);
    const nowIso = new Date().toISOString();

    if (ids.length > 0) {
      const existing = new Set(progress?.dismissed_by_org?.[orgKey] || []);
      ids.forEach((id) => existing.add(id));
      const dismissed = { ...(progress?.dismissed_by_org || {}), [orgKey]: Array.from(existing).slice(-500) };
      progress = { ...progress, dismissed_by_org: dismissed };
    } else {
      progress = setLastSeenByOrg(progress, orgId, nowIso);
    }

    await UserPreferences.update(userId, { school_portal_notifications_progress: progress });
    res.json({ ok: true, progress });
  } catch (e) {
    next(e);
  }
};

/**
 * Active banner announcements (scrolling banner).
 * GET /api/school-portal/:organizationId/announcements/banner
 */
export const listSchoolPortalBannerAnnouncements = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const [rows] = await pool.execute(
      `SELECT id, title, message, display_type, audience, starts_at, ends_at, created_at
       FROM school_portal_announcements
       WHERE organization_id = ?
         AND NOW() >= starts_at
         AND NOW() <= ends_at
       ORDER BY starts_at ASC, id DESC
       LIMIT 20`,
      [orgId]
    );
    const out = (rows || [])
      .filter((r) => schoolPortalAudienceMatchesRole(r.audience || 'everyone', roleNorm))
      .map((r) => ({
        id: r.id,
        title: r.title || 'Announcement',
        message: r.message || '',
        display_type: r.display_type || 'announcement',
        audience: r.audience || 'everyone',
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        created_at: r.created_at
      }));
    res.json(out);
  } catch (e) {
    next(e);
  }
};

/**
 * Create a scheduled, time-limited banner announcement for this school portal.
 * POST /api/school-portal/:organizationId/announcements
 * body: { title?, message, starts_at, ends_at }
 */
export const createSchoolPortalAnnouncement = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user })) {
      return res.status(403).json({ error: { message: 'Supervisors have read-only access in school portal announcements' } });
    }

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const titleRaw = req.body?.title;
    const title = titleRaw === null || titleRaw === undefined ? null : String(titleRaw || '').trim().slice(0, 255) || null;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 1200) return res.status(400).json({ error: { message: 'Message is too long (max 1200 characters)' } });

    const startsAtRaw = req.body?.starts_at || req.body?.startsAt;
    const endsAtRaw = req.body?.ends_at || req.body?.endsAt;
    if (!startsAtRaw || !endsAtRaw) return res.status(400).json({ error: { message: 'starts_at and ends_at are required' } });

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid starts_at or ends_at' } });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return res.status(400).json({ error: { message: 'ends_at must be after starts_at' } });
    }

    const MS_DAY = 24 * 60 * 60 * 1000;
    const durationDays = (endsAt.getTime() - startsAt.getTime()) / MS_DAY;
    if (durationDays > 14.0001) {
      return res.status(400).json({ error: { message: 'Announcements must be time-limited to 2 weeks maximum' } });
    }

    const maxStart = Date.now() + 364 * MS_DAY;
    if (startsAt.getTime() > maxStart) {
      return res.status(400).json({ error: { message: 'Announcements can only be scheduled up to 364 days out' } });
    }

    const displayType = parseSchoolPortalDisplayType(req.body?.display_type || req.body?.displayType);
    const audience = parseSchoolPortalAudience(req.body?.audience);

    const [result] = await pool.execute(
      `INSERT INTO school_portal_announcements
       (organization_id, created_by_user_id, title, message, display_type, audience, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orgId, userId, title, message, displayType, audience, startsAt, endsAt]
    );

    const id = result?.insertId ? Number(result.insertId) : null;
    res.status(201).json({
      announcement: {
        id,
        organization_id: orgId,
        title,
        message,
        display_type: displayType,
        audience,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by_user_id: userId
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Update an individual school portal announcement.
 * PUT /api/school-portal/:organizationId/announcements/:announcementId
 */
export const updateSchoolPortalAnnouncement = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const announcementId = parseInt(req.params.announcementId, 10);
    if (!announcementId) return res.status(400).json({ error: { message: 'Invalid announcement id' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user })) {
      return res.status(403).json({ error: { message: 'Supervisors have read-only access in school portal announcements' } });
    }

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const titleRaw = req.body?.title;
    const title = titleRaw === null || titleRaw === undefined ? null : String(titleRaw || '').trim().slice(0, 255) || null;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 1200) return res.status(400).json({ error: { message: 'Message is too long (max 1200 characters)' } });

    const startsAtRaw = req.body?.starts_at || req.body?.startsAt;
    const endsAtRaw = req.body?.ends_at || req.body?.endsAt;
    if (!startsAtRaw || !endsAtRaw) return res.status(400).json({ error: { message: 'starts_at and ends_at are required' } });

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid starts_at or ends_at' } });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return res.status(400).json({ error: { message: 'ends_at must be after starts_at' } });
    }

    const MS_DAY = 24 * 60 * 60 * 1000;
    const durationDays = (endsAt.getTime() - startsAt.getTime()) / MS_DAY;
    if (durationDays > 14.0001) {
      return res.status(400).json({ error: { message: 'Announcements must be time-limited to 2 weeks maximum' } });
    }

    const displayType = parseSchoolPortalDisplayType(req.body?.display_type || req.body?.displayType);
    const audience = parseSchoolPortalAudience(req.body?.audience);

    const [result] = await pool.execute(
      `UPDATE school_portal_announcements
       SET title = ?, message = ?, display_type = ?, audience = ?, starts_at = ?, ends_at = ?
       WHERE id = ? AND organization_id = ?`,
      [title, message, displayType, audience, startsAt, endsAt, announcementId, orgId]
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ error: { message: 'Announcement not found' } });
    }

    res.json({
      announcement: { id: announcementId, organization_id: orgId, title, message, display_type: displayType, audience, starts_at: startsAt, ends_at: endsAt }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Delete an individual school portal announcement.
 * DELETE /api/school-portal/:organizationId/announcements/:announcementId
 */
export const deleteSchoolPortalAnnouncement = async (req, res, next) => {
  try {
    const orgId = await resolveOrgIdFromParam(req.params.organizationId);
    if (!orgId) return res.status(400).json({ error: { message: 'Invalid organizationId' } });

    const announcementId = parseInt(req.params.announcementId, 10);
    if (!announcementId) return res.status(400).json({ error: { message: 'Invalid announcement id' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user })) {
      return res.status(403).json({ error: { message: 'Supervisors have read-only access in school portal announcements' } });
    }

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const [result] = await pool.execute(
      `DELETE FROM school_portal_announcements WHERE id = ? AND organization_id = ?`,
      [announcementId, orgId]
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ error: { message: 'Announcement not found' } });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * Create the same time-limited scrolling banner for multiple school portals at once.
 * POST /api/school-portal/bulk-announcements
 * body: { organizationIds, title?, message, starts_at, ends_at }
 */
export const createBulkSchoolPortalAnnouncements = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user })) {
      return res.status(403).json({ error: { message: 'Supervisors have read-only access in school portal announcements' } });
    }

    const organizationIds = Array.isArray(req.body?.organizationIds)
      ? req.body.organizationIds.map((id) => parseInt(id, 10)).filter(Boolean)
      : [];
    const uniqueOrgIds = Array.from(new Set(organizationIds));
    if (uniqueOrgIds.length === 0) {
      return res.status(400).json({ error: { message: 'organizationIds is required' } });
    }
    if (uniqueOrgIds.length > 500) {
      return res.status(400).json({ error: { message: 'Too many target schools (max 500)' } });
    }

    const titleRaw = req.body?.title;
    const title = titleRaw === null || titleRaw === undefined ? null : String(titleRaw || '').trim().slice(0, 255) || null;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 1200) return res.status(400).json({ error: { message: 'Message is too long (max 1200 characters)' } });

    const startsAtRaw = req.body?.starts_at || req.body?.startsAt;
    const endsAtRaw = req.body?.ends_at || req.body?.endsAt;
    if (!startsAtRaw || !endsAtRaw) return res.status(400).json({ error: { message: 'starts_at and ends_at are required' } });

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid starts_at or ends_at' } });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return res.status(400).json({ error: { message: 'ends_at must be after starts_at' } });
    }

    const MS_DAY = 24 * 60 * 60 * 1000;
    const durationDays = (endsAt.getTime() - startsAt.getTime()) / MS_DAY;
    if (durationDays > 14.0001) {
      return res.status(400).json({ error: { message: 'Announcements must be time-limited to 2 weeks maximum' } });
    }

    const maxStart = Date.now() + 364 * MS_DAY;
    if (startsAt.getTime() > maxStart) {
      return res.status(400).json({ error: { message: 'Announcements can only be scheduled up to 364 days out' } });
    }

    const placeholders = uniqueOrgIds.map(() => '?').join(',');
    const [orgRows] = await pool.execute(
      `SELECT id, organization_type
       FROM agencies
       WHERE id IN (${placeholders})`,
      uniqueOrgIds
    );
    const foundIds = new Set((orgRows || []).map((row) => Number(row.id)));
    const missingIds = uniqueOrgIds.filter((id) => !foundIds.has(Number(id)));
    if (missingIds.length > 0) {
      return res.status(400).json({ error: { message: `Unknown organization ids: ${missingIds.join(', ')}` } });
    }

    for (const row of orgRows || []) {
      const orgType = String(row.organization_type || '').toLowerCase();
      if (!['school', 'program', 'learning'].includes(orgType)) {
        return res.status(400).json({ error: { message: 'Bulk school announcements can only target school, program, or learning portals.' } });
      }
    }

    if (roleNorm !== 'super_admin') {
      for (const orgId of uniqueOrgIds) {
        const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
        if (!ok) {
          return res.status(403).json({ error: { message: `You do not have access to organization ${orgId}` } });
        }
      }
    }

    const displayType = parseSchoolPortalDisplayType(req.body?.display_type || req.body?.displayType);
    const audience = parseSchoolPortalAudience(req.body?.audience);
    const bulkGroupId = crypto.randomUUID();

    const values = uniqueOrgIds.flatMap((orgId) => [orgId, userId, bulkGroupId, title, message, displayType, audience, startsAt, endsAt]);
    const rowPlaceholders = uniqueOrgIds.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const [result] = await pool.execute(
      `INSERT INTO school_portal_announcements
       (organization_id, created_by_user_id, bulk_group_id, title, message, display_type, audience, starts_at, ends_at)
       VALUES ${rowPlaceholders}`,
      values
    );

    logAuditEvent(req, {
      actionType: 'school_portal_bulk_announcements_created',
      metadata: {
        bulkGroupId,
        organizationIds: uniqueOrgIds,
        count: uniqueOrgIds.length,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString()
      }
    }).catch(() => {});

    res.status(201).json({
      ok: true,
      bulk_group_id: bulkGroupId,
      inserted_count: Number(result?.affectedRows || 0),
      organization_ids: uniqueOrgIds
    });
  } catch (e) {
    next(e);
  }
};

/**
 * List recent bulk announcement groups for an agency's school portals.
 * GET /api/school-portal/bulk-announcements?agencyId=X
 */
export const listBulkSchoolPortalAnnouncements = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const agencyId = parseInt(req.query?.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId query parameter is required' } });

    const [rows] = await pool.execute(
      `SELECT
         a.bulk_group_id,
         a.title,
         a.message,
         a.display_type,
         a.audience,
         a.starts_at,
         a.ends_at,
         a.created_by_user_id,
         a.created_at,
         COUNT(*) AS portal_count,
         CONCAT(TRIM(u.first_name), ' ', TRIM(u.last_name)) AS created_by_name
       FROM school_portal_announcements a
       INNER JOIN agency_schools asc2 ON asc2.school_id = a.organization_id AND asc2.agency_id = ?
       LEFT JOIN users u ON u.id = a.created_by_user_id
       WHERE a.bulk_group_id IS NOT NULL
       GROUP BY a.bulk_group_id, a.title, a.message, a.display_type, a.audience, a.starts_at, a.ends_at,
                a.created_by_user_id, a.created_at, u.first_name, u.last_name
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [agencyId]
    );

    const out = (rows || []).map((r) => ({
      bulk_group_id: r.bulk_group_id,
      title: r.title || null,
      message: r.message || '',
      display_type: r.display_type || 'announcement',
      audience: r.audience || 'everyone',
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      created_at: r.created_at,
      created_by_user_id: r.created_by_user_id || null,
      created_by_name: r.created_by_name?.trim() || null,
      portal_count: Number(r.portal_count || 0),
      is_active: new Date(r.starts_at) <= new Date() && new Date(r.ends_at) >= new Date()
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
};

/**
 * Update all announcements in a bulk group (same message, dates across portals).
 * PUT /api/school-portal/bulk-announcements/:groupId
 */
export const updateBulkSchoolPortalAnnouncements = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user })) {
      return res.status(403).json({ error: { message: 'Supervisors have read-only access in school portal announcements' } });
    }

    const groupId = String(req.params.groupId || '').trim();
    if (!groupId) return res.status(400).json({ error: { message: 'Invalid group id' } });

    const [existing] = await pool.execute(
      `SELECT id FROM school_portal_announcements WHERE bulk_group_id = ? LIMIT 1`,
      [groupId]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: { message: 'Announcement group not found' } });
    }

    const titleRaw = req.body?.title;
    const title = titleRaw === null || titleRaw === undefined ? null : String(titleRaw || '').trim().slice(0, 255) || null;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 1200) return res.status(400).json({ error: { message: 'Message is too long (max 1200 characters)' } });

    const startsAtRaw = req.body?.starts_at || req.body?.startsAt;
    const endsAtRaw = req.body?.ends_at || req.body?.endsAt;
    if (!startsAtRaw || !endsAtRaw) return res.status(400).json({ error: { message: 'starts_at and ends_at are required' } });

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid starts_at or ends_at' } });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return res.status(400).json({ error: { message: 'ends_at must be after starts_at' } });
    }

    const MS_DAY = 24 * 60 * 60 * 1000;
    const durationDays = (endsAt.getTime() - startsAt.getTime()) / MS_DAY;
    if (durationDays > 14.0001) {
      return res.status(400).json({ error: { message: 'Announcements must be time-limited to 2 weeks maximum' } });
    }

    const displayType = parseSchoolPortalDisplayType(req.body?.display_type || req.body?.displayType);
    const audience = parseSchoolPortalAudience(req.body?.audience);

    const [result] = await pool.execute(
      `UPDATE school_portal_announcements
       SET title = ?, message = ?, display_type = ?, audience = ?, starts_at = ?, ends_at = ?
       WHERE bulk_group_id = ?`,
      [title, message, displayType, audience, startsAt, endsAt, groupId]
    );

    logAuditEvent(req, {
      actionType: 'school_portal_bulk_announcements_updated',
      metadata: { bulkGroupId: groupId, affectedRows: result?.affectedRows || 0 }
    }).catch(() => {});

    res.json({ ok: true, updated_count: Number(result?.affectedRows || 0) });
  } catch (e) {
    next(e);
  }
};

/**
 * Delete all announcements in a bulk group.
 * DELETE /api/school-portal/bulk-announcements/:groupId
 */
export const deleteBulkSchoolPortalAnnouncements = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (await isSupervisorOnlyActor({ userId, role: roleNorm, user: req.user })) {
      return res.status(403).json({ error: { message: 'Supervisors have read-only access in school portal announcements' } });
    }

    const groupId = String(req.params.groupId || '').trim();
    if (!groupId) return res.status(400).json({ error: { message: 'Invalid group id' } });

    const [result] = await pool.execute(
      `DELETE FROM school_portal_announcements WHERE bulk_group_id = ?`,
      [groupId]
    );

    if (!result?.affectedRows) {
      return res.status(404).json({ error: { message: 'Announcement group not found' } });
    }

    logAuditEvent(req, {
      actionType: 'school_portal_bulk_announcements_deleted',
      metadata: { bulkGroupId: groupId, deletedRows: result.affectedRows }
    }).catch(() => {});

    res.json({ ok: true, deleted_count: Number(result.affectedRows) });
  } catch (e) {
    next(e);
  }
};
