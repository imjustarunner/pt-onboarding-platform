import pool from '../config/database.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Notification from '../models/Notification.model.js';
import { ensureIssuedRoiSigningLinkForClient } from './clientSchoolRoiAccess.controller.js';
import { resolvePreferredSenderIdentityForSchoolThenAgency } from '../services/emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { sendPushToUser } from '../services/pushNotification.service.js';

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, organizationId }) {
  const uid = parseInt(String(userId || ''), 10);
  const orgId = parseInt(String(organizationId || ''), 10);
  if (!uid || !orgId) return false;
  if (String(role || '').toLowerCase() === 'super_admin') return true;
  const orgs = await User.getAgencies(uid);
  const orgIds = (orgs || []).map((o) => parseInt(o.id, 10)).filter(Boolean);
  if (orgIds.includes(orgId)) return true;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
  if (!activeAgencyId) return false;
  return orgIds.includes(parseInt(activeAgencyId, 10));
}

const DEFAULT_MIN_PENDING_ENTERED_AT = '2026-02-01';
const DEFAULT_ROI_SOON_DAYS = 30;

const roiRenewalEmailQueues = new Map();

function parsePendingChecklist(client) {
  const missing = [];
  const parentsContactedAt = client?.parents_contacted_at ? new Date(client.parents_contacted_at) : null;
  const firstServiceAt = client?.first_service_at ? new Date(client.first_service_at) : null;
  const hasParentContactDate = !!parentsContactedAt;
  const hasFirstServiceDate = !!firstServiceAt;

  if (!hasParentContactDate) {
    missing.push('Parent contact date');
  } else if (!hasFirstServiceDate) {
    missing.push('First session date');
  }

  return { missing };
}

function isBackofficeRole(roleNorm) {
  return ['super_admin', 'admin', 'support', 'staff'].includes(String(roleNorm || '').toLowerCase());
}

async function ensureAgencyAccessForUser({ userId, roleNorm, agencyId }) {
  const agencyNum = Number(agencyId || 0);
  if (!agencyNum) return false;
  if (String(roleNorm || '').toLowerCase() === 'super_admin') return true;
  const actorOrgs = await User.getAgencies(userId);
  const actorOrgIds = (actorOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
  if (actorOrgIds.includes(agencyNum)) return true;
  for (const orgId of actorOrgIds) {
    // eslint-disable-next-line no-await-in-loop
    const affiliatedAgencyId = await resolveActiveAgencyIdForOrg(orgId);
    if (Number(affiliatedAgencyId || 0) === agencyNum) return true;
  }
  return false;
}

function formatYmd(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toIsoNoMs(dateLike = new Date()) {
  const d = dateLike instanceof Date ? dateLike : new Date(String(dateLike || ''));
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function daysUntilDate(value) {
  if (!value) return null;
  const ymd = formatYmd(value);
  if (!ymd) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thenUtc = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10))
  );
  return Math.floor((thenUtc - todayUtc) / 86400000);
}

function computeRoiStatus(roiExpiresAt, daysSoon = DEFAULT_ROI_SOON_DAYS) {
  const daysUntilExpiration = daysUntilDate(roiExpiresAt);
  if (daysUntilExpiration === null) {
    return { state: 'expired', daysUntilExpiration: null };
  }
  if (daysUntilExpiration < 0) {
    return { state: 'expired', daysUntilExpiration };
  }
  if (daysUntilExpiration <= Number(daysSoon || DEFAULT_ROI_SOON_DAYS)) {
    return { state: 'expiring_soon', daysUntilExpiration };
  }
  return { state: 'active', daysUntilExpiration };
}

function buildPublicIntakeUrl(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) return null;
  const base = String(
    process.env.PUBLIC_INTAKE_BASE_URL
      || process.env.PUBLIC_APP_URL
      || process.env.FRONTEND_URL
      || ''
  ).trim().replace(/\/+$/, '');
  if (!base) return `/i/${encodeURIComponent(key)}`;
  return `${base}/i/${encodeURIComponent(key)}`;
}

function enqueueRoiRenewalEmailJobs(agencyId, jobs = []) {
  const aid = Number(agencyId || 0);
  if (!aid || !Array.isArray(jobs) || jobs.length === 0) return { queued: 0, queueDepth: 0 };
  const queue = roiRenewalEmailQueues.get(aid) || { running: false, items: [] };
  queue.items.push(...jobs);
  roiRenewalEmailQueues.set(aid, queue);

  const processNext = async () => {
    if (queue.running) return;
    queue.running = true;
    while (queue.items.length > 0) {
      const item = queue.items.shift();
      try {
        // eslint-disable-next-line no-await-in-loop
        await item();
      } catch {
        // best-effort: continue processing remaining queue items
      }
      // Spread sends to avoid burst sends from a single click.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    queue.running = false;
  };

  processNext().catch(() => {});
  return { queued: jobs.length, queueDepth: queue.items.length + (queue.running ? 1 : 0) };
}

/**
 * Compliance Corner: list pending clients not yet current.
 * GET /api/compliance-corner/pending-clients
 * query: organizationId (optional), providerUserId (optional)
 */
export const listPendingComplianceClients = async (req, res, next) => {
  try {
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const organizationId = req.query?.organizationId ? parseInt(req.query.organizationId, 10) : null;
    const providerUserId = req.query?.providerUserId ? parseInt(req.query.providerUserId, 10) : null;
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const minPendingEnteredAtRaw = req.query?.minPendingEnteredAt !== undefined
      ? String(req.query.minPendingEnteredAt).trim()
      : DEFAULT_MIN_PENDING_ENTERED_AT;
    const minPendingEnteredAt = minPendingEnteredAtRaw
      ? (/^\d{4}-\d{2}-\d{2}$/.test(minPendingEnteredAtRaw) ? minPendingEnteredAtRaw : null)
      : null;
    if (minPendingEnteredAtRaw && !minPendingEnteredAt) {
      return res.status(400).json({ error: { message: 'minPendingEnteredAt must be YYYY-MM-DD' } });
    }

    const isBackofficeRole = ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm);
    const isProviderRole = roleNorm === 'provider' || roleNorm === 'provider_plus';
    const actorUser = req.user?.has_supervisor_privileges !== undefined ? req.user : (await User.findById(userId));
    const isSupervisorRole =
      roleNorm === 'supervisor' ||
      roleNorm === 'clinical_practice_assistant' ||
      User.isSupervisor(actorUser);

    if (!organizationId && !providerUserId && !agencyId) {
      return res.status(400).json({ error: { message: 'organizationId, providerUserId, or agencyId is required' } });
    }

    if (isBackofficeRole) {
      if (organizationId) {
        const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, organizationId });
        if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
      } else if (agencyId) {
        if (roleNorm !== 'super_admin') {
          const actorOrgs = await User.getAgencies(userId);
          const actorOrgIds = (actorOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
          let hasAgencyAccess = actorOrgIds.includes(Number(agencyId));
          if (!hasAgencyAccess) {
            for (const orgId of actorOrgIds) {
              // eslint-disable-next-line no-await-in-loop
              const affiliatedAgencyId = await resolveActiveAgencyIdForOrg(orgId);
              if (Number(affiliatedAgencyId || 0) === Number(agencyId)) {
                hasAgencyAccess = true;
                break;
              }
            }
          }
          if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else if (providerUserId) {
        // Admin/provider-only query support for supervisee widgets:
        // require at least one shared organization/agency membership.
        const [actorOrgs, providerOrgs] = await Promise.all([
          User.getAgencies(userId),
          User.getAgencies(providerUserId)
        ]);
        const actorOrgIds = new Set((actorOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0));
        const providerOrgIds = (providerOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
        const hasSharedOrg = providerOrgIds.some((id) => actorOrgIds.has(id));
        if (!hasSharedOrg) return res.status(403).json({ error: { message: 'Access denied' } });
      } else {
        return res.status(400).json({ error: { message: 'organizationId, providerUserId, or agencyId is required for backoffice queries' } });
      }
    } else if (isSupervisorRole) {
      if (!providerUserId) {
        return res.status(400).json({ error: { message: 'providerUserId is required for supervisor queries' } });
      }
      const [rows] = await pool.execute(
        `SELECT 1 FROM supervisor_assignments WHERE supervisor_id = ? AND supervisee_id = ? LIMIT 1`,
        [userId, providerUserId]
      );
      if (!rows?.[0]) return res.status(403).json({ error: { message: 'Access denied' } });
    } else if (isProviderRole) {
      if (!providerUserId || Number(providerUserId) !== Number(userId)) {
        return res.status(403).json({ error: { message: 'Providers can only query their own pending clients.' } });
      }
      if (agencyId) {
        const providerOrgs = await User.getAgencies(userId);
        const providerOrgIds = (providerOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
        let hasAgencyAccess = providerOrgIds.includes(Number(agencyId));
        if (!hasAgencyAccess) {
          for (const orgId of providerOrgIds) {
            // eslint-disable-next-line no-await-in-loop
            const affiliatedAgencyId = await resolveActiveAgencyIdForOrg(orgId);
            if (Number(affiliatedAgencyId || 0) === Number(agencyId)) {
              hasAgencyAccess = true;
              break;
            }
          }
        }
        if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const clauses = [
      'cpa.is_active = TRUE',
      "(c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')",
      "(cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')",
      "(LOWER(cs.status_key) = 'pending' OR UPPER(c.status) = 'PENDING_REVIEW')",
      "(org.organization_type IS NULL OR LOWER(org.organization_type) = 'school')",
      `(c.parents_contacted_at IS NULL OR c.first_service_at IS NULL)`
    ];
    const params = [];

    if (organizationId) {
      clauses.push('cpa.organization_id = ?');
      params.push(organizationId);
    }
    if (providerUserId) {
      clauses.push('cpa.provider_user_id = ?');
      params.push(providerUserId);
    }
    if (agencyId) {
      clauses.push('c.agency_id = ?');
      params.push(agencyId);
    }

    const [rows] = await pool.execute(
      `SELECT
         c.id AS client_id,
         c.initials,
         c.identifier_code,
         c.submission_date,
         c.created_at,
         c.first_service_at,
         c.parents_contacted_at,
         c.status,
         cs.status_key,
         pending_cs.id AS pending_status_id,
         org.id AS organization_id,
         org.name AS organization_name,
         u.id AS provider_user_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name,
         u.email AS provider_email,
         NULLIF(
           GREATEST(
             COALESCE(
               (
                 SELECT MAX(h_status.changed_at)
                 FROM client_status_history h_status
                 WHERE h_status.client_id = c.id
                   AND h_status.field_changed = 'status'
                   AND UPPER(h_status.to_value) = 'PENDING_REVIEW'
               ),
               '1000-01-01 00:00:00'
             ),
             COALESCE(
               (
                 SELECT MAX(h_cs.changed_at)
                 FROM client_status_history h_cs
                 WHERE h_cs.client_id = c.id
                   AND h_cs.field_changed = 'client_status_id'
                   AND CAST(h_cs.to_value AS UNSIGNED) = pending_cs.id
               ),
               '1000-01-01 00:00:00'
             )
           ),
           '1000-01-01 00:00:00'
         ) AS pending_entered_at,
         MIN(cpa.created_at) AS assigned_at,
         DATEDIFF(CURDATE(), MIN(cpa.created_at)) AS days_since_assigned,
         CASE
           WHEN c.parents_contacted_at IS NULL THEN 'no_parent_contact'
           ELSE 'no_first_session'
         END AS pending_stage
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       JOIN agencies org ON org.id = cpa.organization_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       LEFT JOIN client_statuses pending_cs
         ON pending_cs.agency_id = c.agency_id
        AND LOWER(pending_cs.status_key) = 'pending'
       LEFT JOIN users u ON u.id = cpa.provider_user_id
       WHERE ${clauses.join(' AND ')}
       GROUP BY c.id, org.id, u.id, pending_cs.id
       ORDER BY days_since_assigned DESC, c.id DESC`,
      params
    );

    let results = (rows || []).map((row) => {
      const { missing } = parsePendingChecklist(row);
      return {
        client_id: row.client_id,
        client_initials: row.initials || null,
        client_identifier_code: row.identifier_code || null,
        organization_id: row.organization_id,
        organization_name: row.organization_name || null,
        provider_user_id: row.provider_user_id,
        provider_first_name: row.provider_first_name || null,
        provider_last_name: row.provider_last_name || null,
        provider_email: row.provider_email || null,
        pending_added_at: row.pending_entered_at || row.created_at || row.submission_date || null,
        assigned_at: row.assigned_at || null,
        days_since_assigned: Number(row.days_since_assigned || 0),
        pending_stage: row.pending_stage === 'no_parent_contact' ? 'no_parent_contact' : 'no_first_session',
        tracking_days: Number(row.days_since_assigned || 0),
        parent_contacted_at: row.parents_contacted_at || null,
        first_service_at: row.first_service_at || null,
        missing_checklist: missing
      };
    });

    if (minPendingEnteredAt) {
      const cutoffTs = new Date(`${minPendingEnteredAt}T00:00:00`).getTime();
      results = results.filter((row) => {
        const raw = row?.pending_added_at;
        if (!raw) return false;
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) && ts >= cutoffTs;
      });
    }

    res.json({ count: results.length, results });
  } catch (e) {
    next(e);
  }
};

/**
 * Compliance Corner: list clients with expiring/expired ROI.
 * GET /api/compliance-corner/roi-renewals
 * query: agencyId (required), daysSoon (optional), includeActive (optional)
 */
export const listRoiRenewalCandidates = async (req, res, next) => {
  try {
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.id || 0);
    const agencyId = Number(req.query?.agencyId || 0);
    const daysSoon = Math.max(1, Math.min(365, Number(req.query?.daysSoon || DEFAULT_ROI_SOON_DAYS)));
    const includeActive = String(req.query?.includeActive || 'false').toLowerCase() === 'true';

    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!isBackofficeRole(roleNorm)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const hasAgencyAccess = await ensureAgencyAccessForUser({ userId, roleNorm, agencyId });
    if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT
         c.id AS client_id,
         c.initials AS client_initials,
         c.identifier_code AS client_identifier_code,
         c.full_name AS client_full_name,
         c.roi_expires_at,
         c.status AS client_workflow_status,
         c.client_status_id,
         c.organization_id,
         org.name AS organization_name,
         c.provider_id AS provider_user_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name,
         u.email AS provider_email
       FROM clients c
       JOIN agencies org ON org.id = c.organization_id
       LEFT JOIN users u ON u.id = c.provider_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE c.agency_id = ?
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
         AND (cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')
         AND (org.organization_type IS NULL OR LOWER(org.organization_type) = 'school')
       ORDER BY org.name ASC, c.initials ASC, c.id DESC`,
      [agencyId]
    );

    const results = [];
    for (const row of rows || []) {
      const guardians = await ClientGuardian.listForClient(Number(row.client_id || 0));
      const primaryGuardian = (guardians || []).find((g) => g?.access_enabled !== false && g?.access_enabled !== 0 && g?.email)
        || (guardians || []).find((g) => g?.email)
        || null;
      const roi = computeRoiStatus(row.roi_expires_at, daysSoon);
      if (!includeActive && roi.state === 'active') continue;
      results.push({
        ...row,
        roi_state: roi.state,
        days_until_expiration: roi.daysUntilExpiration,
        roi_expires_at_ymd: formatYmd(row.roi_expires_at),
        guardian_email: primaryGuardian?.email || null,
        guardian_name: [primaryGuardian?.first_name, primaryGuardian?.last_name].filter(Boolean).join(' ').trim() || null
      });
    }

    results.sort((a, b) => {
      const ad = a.days_until_expiration === null ? -99999 : Number(a.days_until_expiration || 0);
      const bd = b.days_until_expiration === null ? -99999 : Number(b.days_until_expiration || 0);
      if (ad !== bd) return ad - bd;
      return String(a.organization_name || '').localeCompare(String(b.organization_name || ''));
    });

    res.json({
      count: results.length,
      daysSoon,
      generatedAt: toIsoNoMs(),
      results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Compliance Corner: queue ROI renewal emails for many clients.
 * POST /api/compliance-corner/roi-renewals/bulk-email
 * body: { agencyId, clientIds: number[], regenerateLink?: boolean, subject?: string, message?: string }
 */
export const queueBulkRoiRenewalEmails = async (req, res, next) => {
  try {
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.id || 0);
    const agencyId = Number(req.body?.agencyId || 0);
    const clientIds = Array.from(
      new Set((Array.isArray(req.body?.clientIds) ? req.body.clientIds : []).map((id) => Number(id)).filter((id) => id > 0))
    );
    const regenerateLink = !!req.body?.regenerateLink;

    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!clientIds.length) return res.status(400).json({ error: { message: 'clientIds is required' } });
    if (!isBackofficeRole(roleNorm)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const hasAgencyAccess = await ensureAgencyAccessForUser({ userId, roleNorm, agencyId });
    if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const jobs = [];
    for (const clientId of clientIds) {
      jobs.push(async () => {
        const client = await Client.findById(clientId, { includeSensitive: true });
        if (!client || Number(client.agency_id || 0) !== agencyId) return;
        const schoolOrganizationId = Number(client.organization_id || 0);
        if (!schoolOrganizationId) return;

        const issued = await ensureIssuedRoiSigningLinkForClient({
          client,
          schoolOrganizationId,
          actorUserId: userId,
          regenerate: regenerateLink
        });
        if (!issued?.ok || !issued?.issuedLink?.public_key) return;

        const guardians = await ClientGuardian.listForClient(clientId);
        const recipient = (guardians || []).find((g) => g?.access_enabled !== false && g?.access_enabled !== 0 && g?.email)
          || (guardians || []).find((g) => g?.email)
          || null;
        const toEmail = String(recipient?.email || '').trim().toLowerCase();
        if (!toEmail || !toEmail.includes('@')) return;

        const senderIdentity = await resolvePreferredSenderIdentityForSchoolThenAgency({
          agencyId,
          schoolOrganizationId,
          preferredKeys: ['school_intake', 'intake', 'notifications', 'system']
        });
        if (!senderIdentity?.id) return;

        const linkUrl = buildPublicIntakeUrl(issued.issuedLink.public_key);
        const defaultSubject = `ROI renewal needed for ${client.full_name || client.initials || `Client ${clientId}`}`;
        const defaultBody = [
          `Hello,`,
          ``,
          `${client.agency_name || 'Our team'} needs an updated school ROI on file for ${client.full_name || 'your student'}.`,
          `Please complete this secure link: ${linkUrl}`,
          ``,
          `If you are no longer interested in services, reply STOP. Reply MORE if you would like us to call you.`,
          ``,
          `Thank you.`
        ].join('\n');
        const subject = String(req.body?.subject || defaultSubject).trim() || defaultSubject;
        const body = String(req.body?.message || defaultBody).trim() || defaultBody;

        await sendEmailFromIdentity({
          senderIdentityId: senderIdentity.id,
          to: toEmail,
          subject,
          text: body,
          html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${body}</pre>`
        });
      });
    }

    const queueState = enqueueRoiRenewalEmailJobs(agencyId, jobs);
    res.json({
      ok: true,
      queued: queueState.queued,
      queue_depth: queueState.queueDepth,
      message: 'ROI renewal emails queued for sequential delivery.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Compliance Corner: notify providers to refresh ROI access.
 * POST /api/compliance-corner/roi-provider-reminders
 * body: { agencyId, clientIds: number[] }
 */
export const sendProviderRoiReminders = async (req, res, next) => {
  try {
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.id || 0);
    const agencyId = Number(req.body?.agencyId || 0);
    const clientIds = Array.from(
      new Set((Array.isArray(req.body?.clientIds) ? req.body.clientIds : []).map((id) => Number(id)).filter((id) => id > 0))
    );

    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!clientIds.length) return res.status(400).json({ error: { message: 'clientIds is required' } });
    if (!isBackofficeRole(roleNorm)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const hasAgencyAccess = await ensureAgencyAccessForUser({ userId, roleNorm, agencyId });
    if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    let created = 0;
    let pushed = 0;
    for (const clientId of clientIds) {
      // eslint-disable-next-line no-await-in-loop
      const client = await Client.findById(clientId, { includeSensitive: true });
      if (!client || Number(client.agency_id || 0) !== agencyId) continue;
      const roi = computeRoiStatus(client.roi_expires_at, DEFAULT_ROI_SOON_DAYS);
      const expirationText = client.roi_expires_at ? formatYmd(client.roi_expires_at) : 'not on file';
      const title = 'ROI update reminder';
      const message = `${client.full_name || client.initials || `Client ${client.id}`} ROI is ${roi.state.replace('_', ' ')} (expires: ${expirationText}). Update ROI access.`;
      const providerIds = new Set();
      const primaryProviderId = Number(client.provider_id || 0);
      if (primaryProviderId > 0) providerIds.add(primaryProviderId);
      try {
        // eslint-disable-next-line no-await-in-loop
        const [assignmentRows] = await pool.execute(
          `SELECT DISTINCT provider_user_id
           FROM client_provider_assignments
           WHERE client_id = ? AND is_active = TRUE`,
          [clientId]
        );
        for (const row of assignmentRows || []) {
          const pid = Number(row?.provider_user_id || 0);
          if (pid > 0) providerIds.add(pid);
        }
      } catch {
        // table may not exist in all environments
      }

      for (const providerId of providerIds) {
        // eslint-disable-next-line no-await-in-loop
        await Notification.create({
          type: 'client_school_roi_provider_reminder',
          severity: roi.state === 'expired' ? 'warning' : 'info',
          title,
          message,
          userId: providerId,
          agencyId,
          relatedEntityType: 'client',
          relatedEntityId: clientId,
          actorUserId: userId,
          actorSource: 'compliance_corner'
        });
        created += 1;
        // eslint-disable-next-line no-await-in-loop
        const pushResult = await sendPushToUser(providerId, {
          title: `${title} (ROI)`,
          body: message,
          url: '/dashboard',
          tag: `roi-provider-reminder-${clientId}`
        });
        if (pushResult?.sent) pushed += 1;
      }
    }

    res.json({
      ok: true,
      notifications_created: created,
      push_sent: pushed
    });
  } catch (error) {
    next(error);
  }
};
