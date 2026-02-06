/**
 * School Portal Controller
 * Handles restricted school portal views and client list access
 */

import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { callGeminiText } from '../services/geminiText.service.js';

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
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
  if (parsed && typeof parsed === 'object' && parsed.by_org) return parsed;
  const legacy = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    by_org: legacy,
    by_org_kind: {},
    by_org_client_kind: {}
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
  return r === 'admin' || r === 'support' || r === 'staff';
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

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, schoolOrganizationId }) {
  if (!userId) return false;
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;

  // Providers should be allowed if they have active assignment(s) under this school.
  // They still only receive their own assigned clients from the roster endpoint.
  if (String(role || '').toLowerCase() === 'provider') {
    return await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId });
  }

  if (!roleCanUseAgencyAffiliation(role)) return false;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(activeAgencyId, 10));
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

    // Providers ARE allowed to view the roster, but only for clients assigned to them
    // (restricted fields, no sensitive data).
    const isProvider = String(userRole || '').toLowerCase() === 'provider';

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
           c.waitlist_started_at,
           c.grade,
           c.school_year,
           GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ', ') AS provider_name,
           GROUP_CONCAT(DISTINCT cpa.provider_user_id ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ',') AS provider_ids,
           GROUP_CONCAT(DISTINCT cpa.service_day ORDER BY FIELD(cpa.service_day,'Monday','Tuesday','Wednesday','Thursday','Friday') SEPARATOR ', ') AS service_day,
           MAX(CASE WHEN ? IS NOT NULL AND cpa.provider_user_id = ? THEN 1 ELSE 0 END) AS user_is_assigned_provider,
           c.submission_date,
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

    // Unread ticket message counts (per user) - best effort when tables exist.
    const unreadTicketMsgsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      const orgId = parseInt(organizationId, 10);
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

    // Open ticket counts (per client).
    const openTicketsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && orgId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT t.client_id, COUNT(*) AS open_count
           FROM support_tickets t
           WHERE t.school_organization_id = ?
             AND t.client_id IN (${placeholders})
             AND (t.status IS NULL OR LOWER(t.status) <> 'closed')
           GROUP BY t.client_id`,
          [orgId, ...clientIds]
        );
        for (const r of rows || []) {
          openTicketsByClientId.set(Number(r.client_id), Number(r.open_count || 0));
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
      const orgId = parseInt(organizationId, 10);
      if (clientIds.length > 0 && userId && orgId) {
        const counts = await getUnreadClientUpdateCounts({ userId, orgId, clientIds });
        for (const [cid, cnt] of counts.entries()) {
          unreadUpdatesByClientId.set(Number(cid), Number(cnt || 0));
        }
      }
    } catch {
      // ignore
    }

    // Format response: Only include non-sensitive fields
    const restrictedClients = clients.map(client => {
      return {
        id: client.id,
        initials: client.initials,
        identifier_code: client.identifier_code || null,
        // "status" (workflow) is treated as an internal archive flag; schools should see the configured client status.
        client_status_id: client.client_status_id || null,
        client_status_label: client.client_status_label || null,
        client_status_key: client.client_status_key || null,
        waitlist_started_at: client.waitlist_started_at || null,
        grade: client.grade || null,
        school_year: client.school_year || null,
        provider_id: null,
        provider_name: client.provider_name || null,
        service_day: client.service_day || null,
        user_is_assigned_provider: client.user_is_assigned_provider === 1 || client.user_is_assigned_provider === true,
        submission_date: client.submission_date,
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
        unread_notes_count: unreadCountsByClientId.get(Number(client.id)) || 0,
        notes_count: totalNotesByClientId.get(Number(client.id)) || 0,
        unread_ticket_messages_count: unreadTicketMsgsByClientId.get(Number(client.id)) || 0,
        ticket_messages_count: totalTicketMsgsByClientId.get(Number(client.id)) || 0,
        unread_updates_count: unreadUpdatesByClientId.get(Number(client.id)) || 0,
        open_ticket_count: openTicketsByClientId.get(Number(client.id)) || 0,
        has_open_ticket: (openTicketsByClientId.get(Number(client.id)) || 0) > 0
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

    if (userRole !== 'provider') {
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
           c.initials,
           c.identifier_code,
           c.client_status_id,
           cs.label AS client_status_label,
           cs.status_key AS client_status_key,
           c.waitlist_started_at,
           c.grade,
           c.school_year,
           GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ', ') AS provider_name,
           GROUP_CONCAT(DISTINCT cpa.provider_user_id ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ',') AS provider_ids,
           GROUP_CONCAT(DISTINCT cpa.service_day ORDER BY FIELD(cpa.service_day,'Monday','Tuesday','Wednesday','Thursday','Friday') SEPARATOR ', ') AS service_day,
           1 AS user_is_assigned_provider,
           c.submission_date,
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
         GROUP BY c.id
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
      const intakeAt = client.intake_at ? new Date(client.intake_at) : null;
      const firstServiceAt = client.first_service_at ? new Date(client.first_service_at) : null;
      const intakePassed = intakeAt && intakeAt.getTime() <= today.getTime();
      const firstServicePassed = firstServiceAt && firstServiceAt.getTime() <= today.getTime();
      const statusKey = String(client?.client_status_key || '').toLowerCase();
      const workflow = String(client?.status || '').toUpperCase();
      const isPendingStatus = statusKey === 'pending' || workflow === 'PENDING_REVIEW';
      const isCurrentByDates = intakePassed || firstServicePassed;
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
      if (!intakePassed) missingChecklist.push('Intake date');
      if (!firstServicePassed) missingChecklist.push('First session');
      return {
        id: client.id,
        initials: client.initials,
        identifier_code: client.identifier_code || null,
        client_status_id: client.client_status_id || null,
        client_status_label: client.client_status_label || null,
        client_status_key: client.client_status_key || null,
        waitlist_started_at: client.waitlist_started_at || null,
        grade: client.grade || null,
        school_year: client.school_year || null,
        provider_id: providerUserId,
        provider_name: client.provider_name || null,
        service_day: client.service_day || null,
        user_is_assigned_provider: true,
        submission_date: client.submission_date,
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
        has_open_ticket: (openTicketsByClientId.get(Number(client.id)) || 0) > 0,
        compliance_pending: compliancePending,
        compliance_days_since_assigned: daysSinceAssigned,
        compliance_missing: missingChecklist
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

    res.json(restrictedClients);
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
    // - Never allow edit from school_staff/provider
    // - super_admin always allowed
    // - admin/staff/support allowed when they have agency access via active affiliation
    const canEditClients =
      roleNorm === 'super_admin'
        ? true
        : (roleCanUseAgencyAffiliation(role) && !!activeAgencyId && userHasAgencyAccess && roleNorm !== 'provider' && roleNorm !== 'school_staff');

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
 * List school staff users linked to this school organization.
 * GET /api/school-portal/:organizationId/school-staff
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

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.status,
         u.created_at
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role,'')) = 'school_staff'
         AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'
       ORDER BY u.last_name ASC, u.first_name ASC, u.email ASC`,
      [orgId]
    );

    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

/**
 * Remove a school_staff user from this school organization.
 * DELETE /api/school-portal/:organizationId/school-staff/:userId
 */
export const removeSchoolStaff = async (req, res, next) => {
  try {
    const { organizationId, userId: targetUserIdParam } = req.params;
    const orgId = parseInt(organizationId, 10);
    const targetUserId = parseInt(targetUserIdParam, 10);
    if (!orgId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid organizationId or userId' } });

    const actorId = req.user?.id;
    const actorRole = String(req.user?.role || '').toLowerCase();
    const canRemove = actorRole === 'super_admin' || actorRole === 'admin' || actorRole === 'staff' || actorRole === 'support';
    if (!canRemove) {
      return res.status(403).json({ error: { message: 'Only admin/staff/support can remove school staff users' } });
    }

    // Validate access via org or affiliated agency.
    if (actorRole !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId: actorId, role: actorRole, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const u = await User.findById(targetUserId);
    if (!u) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(u.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can be removed from a school via this endpoint' } });
    }

    await User.removeFromAgency(targetUserId, orgId);
    res.json({ ok: true });
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
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    // Ensure client is actually part of this org (prevents cross-org note disclosure).
    const inOrg = await clientBelongsToOrg({ clientId, orgId });
    if (!inOrg) return res.status(404).json({ error: { message: 'Client not found in this organization' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    const providerUserId = roleNorm === 'provider' ? Number(userId) : null;
    const providerClientIds = providerUserId ? await getProviderAssignedClientIds({ providerUserId, schoolOrganizationId: orgId }) : [];
    const providerClientPlaceholders = providerClientIds.map(() => '?').join(',');

    // Providers can only read waitlist notes for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const note = await ClientNotes.findLatestSharedByClientAndCategory(clientId, 'waitlist');
    if (!note) return res.json({ note: null });

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
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const inOrg = await clientBelongsToOrg({ clientId, orgId });
    if (!inOrg) return res.status(404).json({ error: { message: 'Client not found in this organization' } });

    if (roleNorm !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

    // Providers can only edit waitlist notes for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const saved = await ClientNotes.upsertSharedSingletonByClientAndCategory({
      clientId,
      category: 'waitlist',
      message,
      actorUserId: userId
    });

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

    // Providers may only view comments for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Shared notes only (internal notes are filtered by the model when canViewInternalNotes=false).
    const notes = await ClientNotes.findByClientId(clientId, { hasAgencyAccess: false, canViewInternalNotes: false });
    const out = (notes || [])
      .filter((n) => String(n?.category || '').toLowerCase() === 'comment')
      .slice(0, 200)
      .map((n) => ({
        id: n.id,
        created_at: n.created_at || null,
        message: n.message || '',
        author_id: n.author_id || null,
        author_name: n.author_name || null
      }));

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

    // Providers may only comment for clients assigned to them in this org.
    if (roleNorm === 'provider') {
      const assigned = await providerAssignedToClientInOrg({ providerUserId: userId, clientId, orgId });
      if (!assigned) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const saved = await ClientNotes.create(
      { client_id: clientId, author_id: userId, message, is_internal_only: false, category: 'comment', urgency: 'low' },
      { hasAgencyAccess: false, canViewInternalNotes: false }
    );

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
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, schoolOrganizationId: orgId });
      if (!ok) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });
    }

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
    const allowClientCreated = categories.school_portal_client_created !== false;
    const allowProviderSlots = categories.school_portal_provider_slots !== false;
    const allowProviderDayAdded = categories.school_portal_provider_day_added !== false;
    const allowDocsLinks = categories.school_portal_docs_links !== false;
    const allowChecklist = categories.school_portal_checklist_updates !== false;
    const allowAssignments = categories.school_portal_client_assignments !== false;

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
      } else if (!providerUserId || providerClientIds.length > 0) {
        const providerFilter = providerUserId ? `AND h.client_id IN (${providerClientPlaceholders})` : '';
        const params = providerUserId ? [orgId, ...providerClientIds] : [orgId];
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
      } else if (!providerUserId || providerClientIds.length > 0) {
        const providerFilter = providerUserId ? `AND n.client_id IN (${providerClientPlaceholders})` : '';
        const params = providerUserId ? [orgId, ...providerClientIds] : [orgId];
        const [rows] = await pool.execute(
          `SELECT
             n.id,
             n.client_id,
             n.message,
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
        });
      }
    } catch {
      comments = [];
    }

    // Client messages (support_ticket_messages for client-scoped tickets)
    let messages = [];
    try {
      if (!allowClientMessages) {
        messages = [];
      } else if (!providerUserId || providerClientIds.length > 0) {
        if (await hasSupportTicketMessagesTable()) {
          const hasSoftDelete = await hasSupportTicketMessagesSoftDeleteColumns();
          const providerFilter = providerUserId ? `AND t.client_id IN (${providerClientPlaceholders})` : '';
          const params = providerUserId ? [orgId, orgId, ...providerClientIds] : [orgId, orgId];
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
               u.last_name AS actor_last_name
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
          });
        }
      }
    } catch {
      messages = [];
    }

    // Ticket activity (created, reply, closed)
    let ticketActivity = [];
    try {
      if (!allowTickets || roleNorm === 'provider') {
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
      } else if (!providerUserId || providerClientIds.length > 0) {
        const providerFilter = providerUserId ? `AND c.id IN (${providerClientPlaceholders})` : '';
        const params = providerUserId ? [orgId, ...providerClientIds] : [orgId];
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
          const msg = actor ? `${clientLabel}: added by ${actor}` : `${clientLabel}: added via ${source}`;
          return {
            id: `client_created:${r.id}`,
            kind: 'client_created',
            created_at: r.created_at,
            title: 'New client added',
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
        if (!providerUserId || providerClientIds.length > 0) {
          const docParams = providerUserId && providerClientIds.length > 0 ? [orgId, ...providerClientIds] : [orgId];
          const docFilter = providerUserId ? `AND c.id IN (${providerClientPlaceholders})` : '';
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
      ...providerSlots,
      ...docsLinks,
      ...providerDayAdded
    ].sort((a, b) => {
      const at = new Date(a.created_at || 0).getTime();
      const bt = new Date(b.created_at || 0).getTime();
      if (at !== bt) return bt - at;
      return String(b.id).localeCompare(String(a.id));
    });

    res.json(all.slice(0, 500));
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
    if (!['super_admin', 'admin'].includes(roleNorm)) {
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

    const clauses = ['coa.organization_id = ?', 'coa.is_active = TRUE'];
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
      `SELECT id, title, message, starts_at, ends_at, created_at
       FROM school_portal_announcements
       WHERE organization_id = ?
         AND NOW() >= starts_at
         AND NOW() <= ends_at
       ORDER BY starts_at ASC, id DESC
       LIMIT 20`,
      [orgId]
    );
    const out = (rows || []).map((r) => ({
      id: r.id,
      title: r.title || 'Announcement',
      message: r.message || '',
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

    const [result] = await pool.execute(
      `INSERT INTO school_portal_announcements
       (organization_id, created_by_user_id, title, message, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, userId, title, message, startsAt, endsAt]
    );

    const id = result?.insertId ? Number(result.insertId) : null;
    res.status(201).json({
      announcement: {
        id,
        organization_id: orgId,
        title,
        message,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by_user_id: userId
      }
    });
  } catch (e) {
    next(e);
  }
};
