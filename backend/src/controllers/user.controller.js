import User from '../models/User.model.js';
import UserAccount from '../models/UserAccount.model.js';
import OnboardingChecklist from '../models/OnboardingChecklist.model.js';
import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import OnboardingDataService from '../services/onboardingData.service.js';
import CompletionPackageService from '../services/completionPackage.service.js';
import NotificationService from '../services/notification.service.js';
import ActivityLogService from '../services/activityLog.service.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserCapabilities } from '../utils/capabilities.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import OfficeScheduleMaterializer from '../services/officeScheduleMaterializer.service.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import ExternalBusyCalendarService from '../services/externalBusyCalendar.service.js';
import UserExternalCalendar from '../models/UserExternalCalendar.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import pool from '../config/database.js';
import { adjustProviderSlots } from '../services/providerSlots.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isAdminOrSuperAdmin = (req) => {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
};

const normalizeBoolFlag = (val) => val === 1 || val === true || val === '1';
const SSO_EXCLUDED_ROLES = new Set(['school_staff', 'client_guardian', 'client', 'guardian']);
const isMissingBillingInfraError = (err) => {
  if (!err) return false;
  const code = String(err?.code || '');
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR' || code === 'ER_BAD_DB_ERROR') return true;
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('doesn\'t exist') ||
    msg.includes('unknown column') ||
    msg.includes('agency_billing_accounts') ||
    msg.includes('platform_billing_pricing')
  );
};

const parseFeatureFlags = (rawFlags) => {
  if (!rawFlags) return {};
  if (typeof rawFlags === 'string') {
    try {
      return JSON.parse(rawFlags);
    } catch {
      return {};
    }
  }
  return typeof rawFlags === 'object' ? rawFlags : {};
};

const isSsoPasswordOverrideEnabled = (user) => normalizeBoolFlag(user?.sso_password_override);

const getSsoStateForUser = async (user) => {
  const ssoPasswordOverride = isSsoPasswordOverrideEnabled(user);
  let ssoEnabled = false;
  let ssoPolicyRequired = false;

  try {
    const orgs = await User.getAgencies(user?.id);
    for (const org of (orgs || [])) {
      const flags = parseFeatureFlags(org?.feature_flags ?? null);
      if (flags?.googleSsoEnabled === true) ssoEnabled = true;

      const requiredRoles = Array.isArray(flags?.googleSsoRequiredRoles)
        ? flags.googleSsoRequiredRoles.map((r) => String(r || '').toLowerCase()).filter(Boolean)
        : [];
      const userRole = String(user?.role || '').toLowerCase();
      const orgRequires = flags?.googleSsoEnabled === true && requiredRoles.includes(userRole) && !SSO_EXCLUDED_ROLES.has(userRole);
      if (orgRequires) {
        ssoPolicyRequired = true;
        // No need to continue; effective requirement is true (unless override).
        break;
      }
    }
  } catch {
    // best-effort
  }

  return {
    ssoEnabled,
    ssoPolicyRequired,
    ssoPasswordOverride,
    ssoRequired: ssoPolicyRequired && !ssoPasswordOverride
  };
};

async function requireSharedAgencyAccessOrSuperAdmin({ actorUserId, targetUserId, actorRole }) {
  const r = String(actorRole || '').toLowerCase();
  if (r === 'super_admin') return true;
  const actorAgencies = await User.getAgencies(actorUserId);
  const targetAgencies = await User.getAgencies(targetUserId);
  const actorIds = new Set((actorAgencies || []).map((a) => Number(a.id)));
  const shared = (targetAgencies || []).map((a) => Number(a.id)).filter((id) => actorIds.has(id));
  return shared.length > 0;
}

async function attachAffiliationMeta(orgs) {
  const list = Array.isArray(orgs) ? orgs : [];
  if (!list.length) return list;
  try {
    const [tables] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organization_affiliations'"
    );
    const has = Number(tables?.[0]?.cnt || 0) > 0;
    if (!has) return list;

    const [rows] = await pool.execute(
      `SELECT organization_id, agency_id
       FROM organization_affiliations
       WHERE is_active = TRUE
       ORDER BY updated_at DESC, id DESC`
    );
    const byOrg = new Map();
    for (const r of (rows || [])) {
      const orgId = Number(r?.organization_id || 0);
      if (!orgId || byOrg.has(orgId)) continue;
      byOrg.set(orgId, Number(r?.agency_id || 0) || null);
    }

    for (const o of list) {
      if (!o || !o.id) continue;
      o.affiliated_agency_id = byOrg.get(Number(o.id)) || null;
    }
  } catch {
    // ignore; best-effort only
  }
  return list;
}

async function syncLegacyProviderCredentialValue(userId, rawCredential) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return;
  try {
    const [defs] = await pool.execute(
      `SELECT id
       FROM user_info_field_definitions
       WHERE field_key = 'provider_credential'
       ORDER BY (is_platform_template = TRUE) DESC, (agency_id IS NULL) DESC, id ASC
       LIMIT 1`
    );
    const fieldDefinitionId = Number(defs?.[0]?.id || 0);
    if (!Number.isInteger(fieldDefinitionId) || fieldDefinitionId <= 0) return;
    const v = rawCredential === null || rawCredential === undefined ? null : (String(rawCredential).trim() || null);
    await UserInfoValue.createOrUpdate(uid, fieldDefinitionId, v);
  } catch {
    // Legacy field sync is best-effort.
  }
}

export const getCurrentUser = async (req, res, next) => {
  try {
    // Approved employee tokens do not have a users-table record.
    if (!req.user?.id && req.user?.role === 'approved_employee') {
      const synthetic = { role: 'approved_employee', status: 'ACTIVE_EMPLOYEE', type: req.user.type || 'approved_employee' };
      return res.json({
        email: req.user.email,
        role: 'approved_employee',
        type: req.user.type || 'approved_employee',
        capabilities: getUserCapabilities(synthetic)
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const payrollAgencyIds = user?.id ? await User.listPayrollAgencyIds(user.id) : [];
    const baseCaps = getUserCapabilities(user);
    // Payroll management is gated by user_agencies.has_payroll_access (except super_admin).
    // This keeps UI capability checks consistent with payroll controller enforcement.
    const canManagePayroll = user.role === 'super_admin' || payrollAgencyIds.length > 0;

    // 6-month password expiry (best-effort; defaults to created_at if password_changed_at missing)
    const calcPasswordExpiry = (u) => {
      const changedAt = u?.password_changed_at ? new Date(u.password_changed_at) : (u?.created_at ? new Date(u.created_at) : null);
      if (!changedAt || Number.isNaN(changedAt.getTime())) return { requiresPasswordChange: false, passwordExpiresAt: null, passwordExpired: false };
      const expiresAt = new Date(changedAt.getTime());
      expiresAt.setMonth(expiresAt.getMonth() + 6);
      const expired = expiresAt.getTime() <= Date.now();
      return {
        requiresPasswordChange: expired,
        passwordExpiresAt: expiresAt.toISOString(),
        passwordExpired: expired
      };
    };
    const pw = calcPasswordExpiry(user);
    const tempActive = (() => {
      if (!user?.temporary_password_hash) return false;
      if (!user?.temporary_password_expires_at) return true;
      const expiresAt = new Date(user.temporary_password_expires_at);
      if (Number.isNaN(expiresAt.getTime())) return true;
      return expiresAt.getTime() > Date.now();
    })();

    // Return user in same format as login response + capabilities
    res.json({
      id: user.id,
      email: user.email,
      role: user.role, // Always get role from database, not token
      status: user.status,
      firstName: user.first_name,
      lastName: user.last_name,
      preferredName: user.preferred_name || null,
      title: user.title ?? null,
      serviceFocus: user.service_focus ?? null,
      username: user.username || user.personal_email || user.email,
      profilePhotoUrl: publicUploadsUrlFromStoredPath(user.profile_photo_path),
      requiresPasswordChange: pw.requiresPasswordChange || tempActive,
      passwordExpiresAt: pw.passwordExpiresAt,
      passwordExpired: pw.passwordExpired,
      // Provider global availability (best-effort; defaults true for older DBs)
      provider_accepting_new_clients:
        user.provider_accepting_new_clients === undefined || user.provider_accepting_new_clients === null
          ? true
          : Boolean(user.provider_accepting_new_clients),
      medcancelEnabled: ['low', 'high'].includes(String(user.medcancel_rate_schedule || '').toLowerCase()),
      medcancelRateSchedule: user.medcancel_rate_schedule || null,
      companyCardEnabled: Boolean(user.company_card_enabled),
      has_supervisor_privileges: !!(user.has_supervisor_privileges === true || user.has_supervisor_privileges === 1 || user.has_supervisor_privileges === '1'),
      has_provider_access: !!(user.has_provider_access === true || user.has_provider_access === 1 || user.has_provider_access === '1'),
      has_staff_access: !!(user.has_staff_access === true || user.has_staff_access === 1 || user.has_staff_access === '1'),
      skill_builder_eligible: !!(user.skill_builder_eligible === true || user.skill_builder_eligible === 1 || user.skill_builder_eligible === '1'),
      has_skill_builder_coordinator_access: !!(
        user.has_skill_builder_coordinator_access === true ||
        user.has_skill_builder_coordinator_access === 1 ||
        user.has_skill_builder_coordinator_access === '1'
      ),
      skill_builder_confirm_required_next_login: !!(
        user.skill_builder_confirm_required_next_login === true ||
        user.skill_builder_confirm_required_next_login === 1 ||
        user.skill_builder_confirm_required_next_login === '1'
      ),
      payrollAgencyIds,
      capabilities: {
        ...baseCaps,
        canManagePayroll,
        canViewMyPayroll: true
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    
    // For non-super_admin users, filter by their agencies
    let users;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const isPrivilegedAdmin = roleNorm === 'super_admin' || roleNorm === 'admin' || roleNorm === 'support';

    if (roleNorm === 'super_admin') {
      // Super admins see all users
      users = await User.findAll(includeArchived);
    } else if (!isPrivilegedAdmin && (User.isSupervisor(req.user) || roleNorm === 'supervisor')) {
      // Supervisors can ONLY view their assigned supervisees
      // Check using isSupervisor helper (requires full user object) or fallback to role check
      const requestingUser = await User.findById(req.user.id);
      if (!requestingUser || !User.isSupervisor(requestingUser)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      if (agencyIds.length === 0) {
        users = [];
      } else {
        // Get all supervisee IDs across all agencies
        const allSuperviseeIds = [];
        for (const agencyId of agencyIds) {
          const superviseeIds = await SupervisorAssignment.getSuperviseeIds(req.user.id, agencyId);
          allSuperviseeIds.push(...superviseeIds);
        }

        if (allSuperviseeIds.length === 0) {
          users = [];
        } else {
          const pool = (await import('../config/database.js')).default;
          const placeholders = allSuperviseeIds.map(() => '?').join(',');
          // Check if has_supervisor_privileges column exists
          let hasSupervisorPrivilegesField = '';
          try {
            const [columns] = await pool.execute(
              "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
            );
            if (columns.length > 0) {
              hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
            }
          } catch (err) {
            // Column doesn't exist yet, skip it
          }
          
          let query = `
            SELECT DISTINCT 
              u.id, 
              u.email, 
              u.role, 
              u.status, 
              u.completed_at, 
              u.terminated_at, 
              u.status_expires_at, 
              u.is_active, 
              u.first_name, 
              u.last_name, 
              u.created_at${hasSupervisorPrivilegesField},
              GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agencies,
              GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids
            FROM users u
            INNER JOIN user_agencies ua ON u.id = ua.user_id
            LEFT JOIN agencies a ON ua.agency_id = a.id
            WHERE u.id IN (${placeholders})
          `;
          
          if (!includeArchived) {
            query += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
          }
          
          let groupByFields = 'u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at, u.is_active, u.first_name, u.last_name, u.created_at';
          if (hasSupervisorPrivilegesField) {
            groupByFields += ', u.has_supervisor_privileges';
          }
          query += ` GROUP BY ${groupByFields}`;
          query += ' ORDER BY u.created_at DESC';
          
          const [rows] = await pool.execute(query, allSuperviseeIds);
          users = rows;
        }
      }
    } else if (roleNorm === 'clinical_practice_assistant' || roleNorm === 'provider_plus') {
      // CPAs/provider_plus users can view users in their agencies (same operational scope)
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      if (agencyIds.length === 0) {
        users = [];
      } else {
        const pool = (await import('../config/database.js')).default;
        // Check if has_supervisor_privileges column exists
        let hasSupervisorPrivilegesField = '';
        try {
          const [columns] = await pool.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
          );
          if (columns.length > 0) {
            hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
          }
        } catch (err) {
          // Column doesn't exist yet, skip it
        }
        
        let query = `
          SELECT DISTINCT 
            u.id, 
            u.email, 
            u.role, 
            u.status, 
            u.completed_at, 
            u.terminated_at, 
            u.status_expires_at, 
            u.is_active, 
            u.first_name, 
            u.last_name, 
            u.created_at${hasSupervisorPrivilegesField},
            GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agencies,
            GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids
          FROM users u
          INNER JOIN user_agencies ua ON u.id = ua.user_id
          LEFT JOIN agencies a ON ua.agency_id = a.id
          WHERE ua.agency_id IN (${agencyIds.map(() => '?').join(',')})
          AND u.role IN ('staff', 'provider', 'school_staff', 'facilitator', 'intern')
        `;
        
        if (!includeArchived) {
          query += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
        }
        
        let groupByFields = 'u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at, u.is_active, u.first_name, u.last_name, u.created_at';
        if (hasSupervisorPrivilegesField) {
          groupByFields += ', u.has_supervisor_privileges';
        }
        query += ` GROUP BY ${groupByFields}`;
        query += ' ORDER BY u.created_at DESC';
        
        const [rows] = await pool.execute(query, agencyIds);
        users = rows;
      }
    } else {
      // Admin and support users only see users from their agencies
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      if (agencyIds.length === 0) {
        // User has no agencies, return empty array
        users = [];
      } else {
        // Get users from user's agencies
        const pool = (await import('../config/database.js')).default;
        
        // Check if has_supervisor_privileges column exists
        let hasSupervisorPrivilegesField = '';
        let hasProviderAccessField = '';
        let hasStaffAccessField = '';
        try {
          const [columns] = await pool.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('has_supervisor_privileges','has_provider_access','has_staff_access')"
          );
          const existingColumns = columns.map(c => c.COLUMN_NAME);
          if (existingColumns.includes('has_supervisor_privileges')) {
            hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
          }
          if (existingColumns.includes('has_provider_access')) {
            hasProviderAccessField = ', u.has_provider_access';
          }
          if (existingColumns.includes('has_staff_access')) {
            hasStaffAccessField = ', u.has_staff_access';
          }
        } catch (err) {
          // Column doesn't exist yet, skip it
        }
        
        let query = `
          SELECT DISTINCT 
            u.id, 
            u.email, 
            u.role, 
            u.status, 
            u.completed_at, 
            u.terminated_at, 
            u.status_expires_at, 
            u.is_active, 
            u.first_name, 
            u.last_name, 
            u.created_at${hasSupervisorPrivilegesField}${hasProviderAccessField}${hasStaffAccessField},
            GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agencies,
            GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids
          FROM users u
          INNER JOIN user_agencies ua ON u.id = ua.user_id
          LEFT JOIN agencies a ON ua.agency_id = a.id
          WHERE ua.agency_id IN (${agencyIds.map(() => '?').join(',')})
        `;
        
        if (!includeArchived) {
          query += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
        }
        
        let groupByFields = 'u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at, u.is_active, u.first_name, u.last_name, u.created_at';
        if (hasSupervisorPrivilegesField) {
          groupByFields += ', u.has_supervisor_privileges';
        }
        if (hasProviderAccessField) {
          groupByFields += ', u.has_provider_access';
        }
        if (hasStaffAccessField) {
          groupByFields += ', u.has_staff_access';
        }
        query += ` GROUP BY ${groupByFields}`;
        query += ' ORDER BY u.created_at DESC';
        
        const [rows] = await pool.execute(query, agencyIds);
        users = rows;
      }
    }

    // Attach provider credential for client-side sorting/search (best-effort).
    // Note: Some environments store the useful “credential” text in other provider_* fields
    // (e.g. the license type/number). We expose a single `provider_credential` field to the UI.
    try {
      if (Array.isArray(users) && users.length > 0) {
        const pool = (await import('../config/database.js')).default;
        const ids = users.map((u) => parseInt(u.id, 10)).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const usersCredentialById = new Map();

          // Prefer the hard users.credential column when available.
          try {
            const [rows] = await pool.execute(
              `SELECT id, credential
               FROM users
               WHERE id IN (${placeholders})`,
              ids
            );
            for (const r of rows || []) {
              const value = String(r?.credential || '').trim();
              if (value) usersCredentialById.set(Number(r.id), value);
            }
          } catch {
            // Older DB without users.credential; fall back to user_info_values below.
          }

          const [rows] = await pool.execute(
            `SELECT uiv.user_id,
                    MAX(CASE WHEN uifd.field_key = 'provider_credential' THEN uiv.value END) AS credential,
                    MAX(CASE WHEN uifd.field_key = 'provider_credential_license_type_number' THEN uiv.value END) AS license_type_number
             FROM user_info_values uiv
             JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
             WHERE uifd.field_key IN ('provider_credential', 'provider_credential_license_type_number')
               AND uiv.user_id IN (${placeholders})
             GROUP BY uiv.user_id`,
            ids
          );
          const byUserId = new Map(
            (rows || []).map((r) => {
              const userId = Number(r.user_id);
              return [
                userId,
                usersCredentialById.get(userId) || r.credential || r.license_type_number || null
              ];
            })
          );

          for (const id of ids) {
            if (usersCredentialById.has(Number(id)) && !byUserId.has(Number(id))) {
              byUserId.set(Number(id), usersCredentialById.get(Number(id)));
            }
          }

          users = users.map((u) => ({
            ...u,
            provider_credential: byUserId.get(Number(u.id)) || null
          }));
        }
      }
    } catch {
      // Ignore if schema doesn't exist yet.
    }

    // Attach provider accepting-new-clients flag (best-effort).
    try {
      if (Array.isArray(users) && users.length > 0) {
        const pool = (await import('../config/database.js')).default;
        const ids = users.map((u) => parseInt(u.id, 10)).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT id, provider_accepting_new_clients
             FROM users
             WHERE id IN (${placeholders})`,
            ids
          );
          const byId = new Map((rows || []).map((r) => [Number(r.id), r.provider_accepting_new_clients]));
          users = users.map((u) => ({
            ...u,
            provider_accepting_new_clients:
              byId.has(Number(u.id)) ? Boolean(byId.get(Number(u.id))) : true
          }));
        }
      }
    } catch {
      // Ignore if column doesn't exist yet.
      users = (users || []).map((u) => ({ ...u, provider_accepting_new_clients: true }));
    }

    // Attach provider school availability summary (best-effort):
    // provider_has_open_school_slots = any active assignment with slots_available > 0
    // AND effective accepting_new_clients for that school (override/global) is true.
    try {
      if (Array.isArray(users) && users.length > 0) {
        const pool = (await import('../config/database.js')).default;
        const ids = users.map((u) => parseInt(u.id, 10)).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT psa.provider_user_id,
                    MAX(
                      CASE
                        WHEN psa.is_active = TRUE
                         AND psa.slots_available > 0
                         AND COALESCE(psa.accepting_new_clients_override, u.provider_accepting_new_clients, TRUE) = TRUE
                        THEN 1 ELSE 0
                      END
                    ) AS has_open
             FROM provider_school_assignments psa
             JOIN users u ON u.id = psa.provider_user_id
             WHERE psa.provider_user_id IN (${placeholders})
             GROUP BY psa.provider_user_id`,
            ids
          );
          const byId = new Map((rows || []).map((r) => [Number(r.provider_user_id), Number(r.has_open || 0)]));
          users = users.map((u) => ({
            ...u,
            provider_has_open_school_slots: Boolean(byId.get(Number(u.id)) || 0)
          }));
        }
      }
    } catch {
      // Ignore if table/columns don't exist yet.
      users = (users || []).map((u) => ({ ...u, provider_has_open_school_slots: false }));
    }

    res.json(users);
  } catch (error) {
    next(error);
  }
};

/**
 * Gemini-ready AI user search endpoint.
 *
 * Today: lightweight heuristic keyword extraction + SQL LIKE search across *all* user_info_values.value
 * for the users the requester can access.
 *
 * Later: swap keyword extraction with Gemini → structured filters, keep this endpoint stable.
 */
export const aiQueryUsers = async (req, res, next) => {
  try {
    const raw = String(req.query.query || '').trim();
    // Default behavior: be conservative (Active only, not archived) to avoid surprising “82 users” style results.
    const activeOnly = req.query.activeOnly !== 'false';
    const providersOnly = req.query.providersOnly === 'true';
    // Only allow includeArchived when not activeOnly (otherwise it's confusing / contradictory).
    const includeArchived = req.query.includeArchived === 'true' && !activeOnly;
    const limitRaw = parseInt(String(req.query.limit || '100'), 10);
    // NOTE: Some MySQL/CloudSQL setups reject prepared-statement params for LIMIT,
    // yielding "Incorrect arguments to mysqld_stmt_execute". We inline a validated integer.
    const limit = Number.isFinite(limitRaw) ? Math.trunc(Math.min(Math.max(limitRaw, 1), 500)) : 100;

    if (!raw) {
      return res.json({ results: [], emailsSemicolon: '', meta: { keywords: [], total: 0 } });
    }

    const extractKeywords = (text) => {
      const s = String(text || '').trim();
      if (!s) return [];

      // Prefer a quoted phrase if present.
      const quoted = s.match(/["“”']([^"“”']{2,80})["“”']/);
      if (quoted?.[1]) return [quoted[1].trim().toLowerCase()];

      // Prefer “interested in X” phrase.
      const interested = s.match(/\binterested\s+in\s+([a-z0-9][a-z0-9\s\-]{1,60})/i);
      if (interested?.[1]) {
        const phrase = interested[1].trim().replace(/\s+/g, ' ');
        // If they typed multiple words, keep the whole phrase as one keyword.
        return [phrase.toLowerCase()];
      }

      // Fallback: tokens with stopword filtering.
      const stop = new Set([
        'list', 'show', 'give', 'find', 'all', 'any', 'the', 'a', 'an', 'of', 'for', 'to', 'from',
        'with', 'without', 'and', 'or', 'but', 'who', 'that', 'which', 'where', 'when',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'mentioned', 'say', 'said',
        'they', 'them', 'their', 'people', 'person', 'users', 'user', 'in', 'on', 'at', 'as'
      ]);
      const tokens = s
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !stop.has(t));

      const uniq = [];
      for (const t of tokens) {
        if (!uniq.includes(t)) uniq.push(t);
        if (uniq.length >= 3) break;
      }
      return uniq;
    };

    const keywords = extractKeywords(raw);
    const terms = (keywords.length > 0 ? keywords : [raw.toLowerCase()]).slice(0, 5);

    const pool = (await import('../config/database.js')).default;

    // If the query looks like a clinical “find me a provider” request, prefer the provider_search_index
    // (it understands multi_select fields like treatment modalities and age specialty).
    const qLower = raw.toLowerCase();
    const wantsAvailability =
      /\b(available|availability|openings?|open\s+slots?|schedule|when|next\s+available|appointment)\b/i.test(raw);
    const isValidYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10));
    const weekStartYmd =
      isValidYmd(req.query.weekStart) ? String(req.query.weekStart).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const enrichProvidersWithAvailability = async ({ agencyId, results }) => {
      const aId = parseInt(String(agencyId || ''), 10);
      if (!Number.isFinite(aId) || aId <= 0) return { results, meta: { computedFor: 0 } };
      const list = Array.isArray(results) ? results : [];
      if (!list.length) return { results: list, meta: { computedFor: 0 } };

      const ProviderAvailabilityService = (await import('../services/providerAvailability.service.js')).default;
      const MAX = 25; // keep this cheap; availability computation can be expensive
      let computedFor = 0;

      // Compute sequentially to avoid spiky load (Google busy calendar calls).
      for (let i = 0; i < Math.min(list.length, MAX); i++) {
        const u = list[i];
        const providerId = parseInt(String(u?.id || ''), 10);
        if (!Number.isFinite(providerId) || providerId <= 0) continue;
        try {
          const availability = await ProviderAvailabilityService.computeWeekAvailability({
            agencyId: aId,
            providerId,
            weekStartYmd,
            includeGoogleBusy: true,
            externalCalendarIds: [],
            slotMinutes: 60
          });
          const virtual = Array.isArray(availability?.virtualSlots) ? availability.virtualSlots : [];
          const inPerson = Array.isArray(availability?.inPersonSlots) ? availability.inPersonSlots : [];
          const nextVirtual = virtual[0] || null;
          const nextInPerson = inPerson[0] || null;

          u.availability_timeZone = availability?.timeZone || null;
          u.availability_weekStart = availability?.weekStart || null;
          u.availability_nextVirtualStartAt = nextVirtual?.startAt || null;
          u.availability_nextVirtualEndAt = nextVirtual?.endAt || null;
          u.availability_nextInPersonStartAt = nextInPerson?.startAt || null;
          u.availability_nextInPersonEndAt = nextInPerson?.endAt || null;
          computedFor += 1;
        } catch {
          // Best-effort; skip availability for this provider.
        }
      }

      return { results: list, meta: { computedFor, weekStartYmd } };
    };

    const hasWord = (w) => new RegExp(`\\b${w}\\b`, 'i').test(raw);
    const detectedModalities = [];
    for (const code of ['CBT', 'DBT', 'EMDR', 'ERP', 'ACT', 'ABA', 'CPT', 'IFS', 'PCIT']) {
      if (new RegExp(`\\b${code}\\b`, 'i').test(raw)) detectedModalities.push(code);
    }
    const detectedIssues = [];
    if (hasWord('adhd')) detectedIssues.push('ADHD');

    const detectAgeBucket = () => {
      // Explicit bucket words
      if (/\btoddler\b/i.test(raw)) return 'Toddler (0-5)';
      if (/\bpreteen\b/i.test(raw)) return 'Preteen (11-13)';
      if (/\bteen\b/i.test(raw) || /\badolescen(t|ce)\b/i.test(raw)) return 'Teen (14-18)';
      if (/\bsenior\b/i.test(raw) || /\belder(ly)?\b/i.test(raw)) return 'Seniors (65+)';
      if (/\badult\b/i.test(raw)) return 'Adults (18+)';
      if (/\bchild(ren)?\b/i.test(raw) || /\bpediatric\b/i.test(raw) || /\bkid(s)?\b/i.test(raw)) return 'Children (6-10)';

      // Numeric age detection (e.g. 10yo, 10 year old)
      const m = raw.match(/\b(\d{1,2})\s*(yo|y\/o|yr|yrs|year|years)\b/i) || raw.match(/\b(\d{1,2})\b/);
      const n = m?.[1] ? parseInt(m[1], 10) : NaN;
      if (!Number.isFinite(n)) return null;
      if (n <= 5) return 'Toddler (0-5)';
      if (n <= 10) return 'Children (6-10)';
      if (n <= 13) return 'Preteen (11-13)';
      if (n <= 18) return 'Teen (14-18)';
      if (n >= 65) return 'Seniors (65+)';
      return 'Adults (18+)';
    };
    const detectedAge = detectAgeBucket();

    const looksLikeProviderMatchQuery =
      providersOnly ||
      detectedModalities.length > 0 ||
      detectedIssues.length > 0 ||
      !!detectedAge ||
      /\bprovider\b/i.test(raw) ||
      /\btherapist\b/i.test(raw);

    // Scope: same as /users for backoffice admins.
    // - super_admin: all users
    // - admin/support: users in the requester's agencies
    const isSuperAdmin = req.user.role === 'super_admin';
    const joinAgency = isSuperAdmin ? '' : 'INNER JOIN user_agencies ua ON ua.user_id = u.id';
    const whereParts = [];
    const params = [];

    if (!includeArchived) {
      // Backward-compatible "not archived" filter:
      // some older records may have status='ARCHIVED' without is_archived being set.
      whereParts.push('(u.is_archived = FALSE OR u.is_archived IS NULL)');
      whereParts.push(`UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`);
    }

    if (activeOnly) {
      // Only “active” users by default (matches your expectation of ~6 active users).
      // Include legacy ACTIVE string for older databases.
      whereParts.push(`UPPER(COALESCE(u.status, '')) IN ('ACTIVE_EMPLOYEE','ACTIVE')`);
    }

    if (providersOnly) {
      // Provider-like roles.
      whereParts.push(`LOWER(COALESCE(u.role, '')) IN ('provider')`);
    }

    // Resolve an agency context for provider_search_index when needed.
    const agencyIdRaw = req.query.agencyId ? parseInt(String(req.query.agencyId), 10) : null;
    let resolvedAgencyId = Number.isFinite(agencyIdRaw) && agencyIdRaw > 0 ? agencyIdRaw : null;

    let requesterAgencyIds = null;
    if (!isSuperAdmin) {
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = (userAgencies || []).map((a) => a.id).filter(Boolean);
      if (agencyIds.length === 0) {
        return res.json({ results: [], emailsSemicolon: '', meta: { keywords: terms, total: 0 } });
      }
      requesterAgencyIds = agencyIds;
      whereParts.push(`ua.agency_id IN (${agencyIds.map(() => '?').join(',')})`);
      params.push(...agencyIds);
      if (!resolvedAgencyId && agencyIds.length === 1) resolvedAgencyId = agencyIds[0];
    }

    // Provider-index path (field-aware): requires agencyId context.
    if (looksLikeProviderMatchQuery) {
      if (!resolvedAgencyId) {
        return res.status(400).json({
          error: { message: 'Select an agency (Filter by Agency) to run provider matching searches.' }
        });
      }

      if (!isSuperAdmin && Array.isArray(requesterAgencyIds) && !requesterAgencyIds.includes(resolvedAgencyId)) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }

      const ProviderSearchIndex = (await import('../models/ProviderSearchIndex.model.js')).default;

      // If the index is empty (common after migrations), rebuild once on demand.
      let rebuilt = false;
      try {
        const [cRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM provider_search_index WHERE agency_id = ?`,
          [resolvedAgencyId]
        );
        const c = Number(cRows?.[0]?.c || 0);
        if (c === 0) {
          await ProviderSearchIndex.rebuildForAgency({ agencyId: resolvedAgencyId });
          rebuilt = true;
        }
      } catch {
        // If the table doesn't exist yet, fall through to the generic search below.
      }

      // Build structured filters (OR over possible field keys by trying fallbacks).
      const modalityFieldKeys = ['treatment_prefs_max15', 'provider_marketing_treatment_modalities', 'modality'];
      const ageFieldKeys = ['age_specialty', 'provider_marketing_age_specialty'];
      const issueFieldKeys = ['pt_specialties_max25', 'provider_marketing_issues_specialties', 'specialties_general'];

      const desiredModalities = detectedModalities.length ? detectedModalities : [];
      const desiredIssues = detectedIssues.length ? detectedIssues : [];
      const desiredAge = detectedAge ? [detectedAge] : [];

      const trySearch = async ({ modalityKey, ageKey, issueKey }) => {
        const filters = [];
        for (const m of desiredModalities) filters.push({ fieldKey: modalityKey, op: 'hasOption', value: m });
        for (const a of desiredAge) filters.push({ fieldKey: ageKey, op: 'hasOption', value: a });
        for (const i of desiredIssues) filters.push({ fieldKey: issueKey, op: 'hasOption', value: i });
        const out = await ProviderSearchIndex.search({ agencyId: resolvedAgencyId, filters, limit: 200, offset: 0, textQuery: '' });
        return { out, filters };
      };

      let best = null;
      let bestFilters = [];
      const modalityCandidates = desiredModalities.length ? modalityFieldKeys : [modalityFieldKeys[0]];
      const ageCandidates = desiredAge.length ? ageFieldKeys : [ageFieldKeys[0]];
      const issueCandidates = desiredIssues.length ? issueFieldKeys : [issueFieldKeys[0]];

      for (const mk of modalityCandidates) {
        for (const ak of ageCandidates) {
          for (const ik of issueCandidates) {
            try {
              const { out, filters } = await trySearch({ modalityKey: mk, ageKey: ak, issueKey: ik });
              const users = Array.isArray(out?.users) ? out.users : [];
              if (!best || users.length > best.length) {
                best = users;
                bestFilters = filters;
              }
              // If we got any hits, stop early (good enough).
              if (users.length > 0) break;
            } catch {
              // ignore and keep trying other keys
            }
          }
          if (best && best.length > 0) break;
        }
        if (best && best.length > 0) break;
      }

      const matchedUsers = Array.isArray(best) ? best : [];
      const ids = matchedUsers.map((u) => parseInt(u.id, 10)).filter(Boolean);
      if (!ids.length) {
        return res.json({
          results: [],
          emailsSemicolon: '',
          meta: {
            mode: 'provider_index',
            agencyId: resolvedAgencyId,
            rebuiltIndex: rebuilt,
            parsed: { modalities: desiredModalities, issues: desiredIssues, age: desiredAge[0] || null },
            filters: bestFilters,
            total: 0
          }
        });
      }

      // Apply role/status constraints in SQL to keep results aligned with UI expectations.
      const placeholders = ids.map(() => '?').join(',');
      const uWhere = [];
      const uParams = [...ids];

      // Best-effort: only filter on provider_accepting_new_clients if the column exists.
      let hasAcceptingNewClientsCol = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'provider_accepting_new_clients' LIMIT 1"
        );
        hasAcceptingNewClientsCol = Array.isArray(cols) && cols.length > 0;
      } catch {
        hasAcceptingNewClientsCol = false;
      }

      if (activeOnly) {
        uWhere.push(`UPPER(COALESCE(u.status, '')) IN ('ACTIVE_EMPLOYEE','ACTIVE')`);
      }
      // Provider matching searches should almost always return providers.
      const effectiveProvidersOnly = providersOnly || looksLikeProviderMatchQuery;
      if (effectiveProvidersOnly) {
        uWhere.push(`LOWER(COALESCE(u.role, '')) IN ('provider')`);
        // Your definition of “available”: provider must be accepting new clients.
        if (hasAcceptingNewClientsCol) {
          uWhere.push(`COALESCE(u.provider_accepting_new_clients, TRUE) = TRUE`);
        }
      }

      const uWhereSql = uWhere.length ? `AND ${uWhere.join(' AND ')}` : '';
      const [uRows] = await pool.execute(
        `SELECT u.id, u.email, u.first_name, u.last_name
         FROM users u
         WHERE u.id IN (${placeholders})
         ${uWhereSql}
         ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC
         LIMIT ${limit}`,
        uParams
      );

      const results = (uRows || []).map((r) => ({
        id: r.id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name
      }));

      const emailsSemicolon = results
        .map((u) => {
          const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || String(u.email || '').trim();
          const email = String(u.email || '').trim();
          if (!email) return '';
          return `${name} <${email}>`;
        })
        .filter(Boolean)
        .join('; ');

      let availabilityMeta = null;
      if (wantsAvailability && effectiveProvidersOnly && resolvedAgencyId) {
        const enriched = await enrichProvidersWithAvailability({ agencyId: resolvedAgencyId, results });
        availabilityMeta = enriched?.meta || null;
      }

      return res.json({
        results,
        emailsSemicolon,
        meta: {
          mode: 'provider_index',
          agencyId: resolvedAgencyId,
          rebuiltIndex: rebuilt,
          parsed: { modalities: desiredModalities, issues: desiredIssues, age: desiredAge[0] || null },
          filters: bestFilters,
          total: results.length,
          limit,
          activeOnly,
          providersOnly: effectiveProvidersOnly,
          filteredByAcceptingNewClients: hasAcceptingNewClientsCol,
          availability: availabilityMeta
        }
      });
    }

    // Search all user_info_values.value (across all user info fields).
    // Important: require ALL terms to be present somewhere (AND of EXISTS),
    // otherwise queries like “10 year old adhd cbt” match almost everyone.
    for (const t of terms) {
      const like = `%${String(t).toLowerCase()}%`;
      whereParts.push(
        `EXISTS (
          SELECT 1
          FROM user_info_values uiv
          WHERE uiv.user_id = u.id
            AND LOWER(COALESCE(uiv.value, '')) LIKE ?
        )`
      );
      params.push(like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
       FROM users u
       ${joinAgency}
       ${whereSql}
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC
       LIMIT ${limit}`,
      params
    );

    const results = (rows || []).map((r) => ({
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name
    }));

    const emailsSemicolon = results
      .map((u) => {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || String(u.email || '').trim();
        const email = String(u.email || '').trim();
        if (!email) return '';
        return `${name} <${email}>`;
      })
      .filter(Boolean)
      .join('; ');

    let availabilityMeta = null;
    if (wantsAvailability) {
      if (!resolvedAgencyId) {
        return res.status(400).json({
          error: { message: 'Select an agency (Filter by Agency) to check provider availability.' }
        });
      }
      const likelyProviders = providersOnly || /\bprovider\b/i.test(raw) || /\btherapist\b/i.test(raw);
      if (likelyProviders) {
        const enriched = await enrichProvidersWithAvailability({ agencyId: resolvedAgencyId, results });
        availabilityMeta = enriched?.meta || null;
      }
    }

    res.json({
      results,
      emailsSemicolon,
      meta: { keywords: terms, total: results.length, limit, activeOnly, providersOnly, includeArchived, availability: availabilityMeta }
    });
  } catch (error) {
    next(error);
  }
};

export const archiveUser = async (req, res, next) => {
  try {
    // Support users cannot archive users
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot archive users' } });
    }
    
    const { id } = req.params;
    
    // Archive attribution: prefer the agency shared between actor and target user (so it shows in that agency's archive view).
    // This fixes cases where an admin belongs to multiple agencies and the UI is scoped to a specific agency.
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.id) {
      const actorAgencies = await User.getAgencies(req.user.id);
      const targetAgencies = await User.getAgencies(parseInt(id));

      const actorIds = new Set((actorAgencies || []).map((a) => a.id));
      const commonIds = (targetAgencies || [])
        .map((a) => a.id)
        .filter((agencyId) => actorIds.has(agencyId))
        .sort((a, b) => a - b);

      if (commonIds.length > 0) {
        archivedByAgencyId = commonIds[0];
      } else if ((actorAgencies || []).length > 0) {
        // Fallback: keep legacy behavior if we can't find a shared agency.
        archivedByAgencyId = actorAgencies[0].id;
      }
    }
    
    // Archive user - this will immediately set status to ARCHIVED
    const archived = await User.archive(parseInt(id), req.user.id, archivedByAgencyId);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const user = await User.findById(parseInt(id));
    
    res.json({ 
      message: 'User archived successfully. Access revoked immediately.',
      user
    });
  } catch (error) {
    next(error);
  }
};

export const archiveUserOld = async (req, res, next) => {
  try {
    // Support users cannot archive users
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot archive users' } });
    }
    
    const { id } = req.params;
    
    // Get user's agency ID (use first agency for admins, null for super_admin)
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        archivedByAgencyId = userAgencies[0].id;
      }
    }
    
    const archived = await User.archive(parseInt(id), req.user.id, archivedByAgencyId);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    res.json({ message: 'User archived successfully' });
  } catch (error) {
    next(error);
  }
};

export const restoreUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const restored = await User.restore(parseInt(id), userAgencyIds);
    
    if (!restored) {
      return res.status(404).json({ error: { message: 'User not found, not archived, or you do not have permission to restore it' } });
    }

    res.json({ message: 'User restored successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    // Support users cannot delete users
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot delete users' } });
    }
    
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const deleted = await User.delete(parseInt(id), userAgencyIds);
    
    if (!deleted) {
      return res.status(404).json({ error: { message: 'User not found, not archived, or you do not have permission to delete it' } });
    }

    res.json({ message: 'User permanently deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getArchivedUsers = async (req, res, next) => {
  try {
    // Get selected agency ID from query params (if user selected a specific agency)
    const selectedAgencyId = req.query.archivedByAgencyId ? parseInt(req.query.archivedByAgencyId) : null;
    
    // Get user's agency IDs for filtering
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
      
      // If a specific agency is selected, verify user has access to it
      if (selectedAgencyId && !userAgencyIds.includes(selectedAgencyId)) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }
    
    // If a specific agency is selected, filter by that agency only
    // Otherwise, filter by all user's agencies (or all for super_admin)
    const filterAgencyIds = selectedAgencyId ? [selectedAgencyId] : (req.user.role === 'super_admin' ? null : userAgencyIds);
    
    const users = await User.findAllArchived({ 
      agencyIds: filterAgencyIds,
      userRole: req.user.role
    });
    
    // Fetch archived_by_user_name for each user
    const pool = (await import('../config/database.js')).default;
    const usersWithNames = await Promise.all(users.map(async (user) => {
      if (user.archived_by_user_id) {
        try {
          const [archivers] = await pool.execute(
            'SELECT first_name, last_name FROM users WHERE id = ?',
            [user.archived_by_user_id]
          );
          if (archivers.length > 0) {
            user.archived_by_user_name = `${archivers[0].first_name} ${archivers[0].last_name}`;
          }
        } catch (err) {
          console.error('Error fetching archived_by_user_name:', err);
        }
      }
      return user;
    }));
    
    res.json(usersWithNames);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Allow any authenticated user to view their own profile.
    if (parseInt(id) === req.user.id) {
      const self = await User.findById(id);
      if (!self) return res.status(404).json({ error: { message: 'User not found' } });
      return res.json({ ...self, profile_photo_url: publicUploadsUrlFromStoredPath(self.profile_photo_path) });
    }

    // Admin, super_admin, and support can view any user (trumps supervisor privileges)
    if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support') {
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      return res.json({ ...user, profile_photo_url: publicUploadsUrlFromStoredPath(user.profile_photo_path) });
    }

    // Supervisors can ONLY view their assigned supervisees
    // Check if requesting user is a supervisor using boolean as source of truth
    const requestingUser = await User.findById(req.user.id);
    if (requestingUser && User.isSupervisor(requestingUser)) {
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      
      // Check if supervisor has access to this user (is assigned)
      const supervisorAgencies = await User.getAgencies(req.user.id);
      let hasAccess = false;
      
      for (const agency of supervisorAgencies) {
        const access = await User.supervisorHasAccess(req.user.id, id, agency.id);
        if (access) {
          hasAccess = true;
          break;
        }
      }
      
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only view users assigned to you as supervisees' } });
      }
      
      return res.json({ ...targetUser, profile_photo_url: publicUploadsUrlFromStoredPath(targetUser.profile_photo_path) });
    }

    // CPAs/provider_plus users can view users in their agencies
    if (req.user.role === 'clinical_practice_assistant' || req.user.role === 'provider_plus') {
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      
      // Check if target user is staff/provider/facilitator/intern
      if (!['staff', 'provider', 'school_staff', 'facilitator', 'intern'].includes(targetUser.role)) {
        return res.status(403).json({ error: { message: 'Clinical Practice Assistants can only view staff, provider, school staff, facilitator, and intern users' } });
      }
      
      // Check if CPA and target user share an agency
      const cpaAgencies = await User.getAgencies(req.user.id);
      const targetUserAgencies = await User.getAgencies(id);
      const cpaAgencyIds = cpaAgencies.map(a => a.id);
      const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
      const sharedAgencies = cpaAgencyIds.filter(id => targetUserAgencyIds.includes(id));
      
      if (sharedAgencies.length === 0) {
        return res.status(403).json({ error: { message: 'You can only view users from your assigned agencies' } });
      }
      
      return res.json({ ...targetUser, profile_photo_url: publicUploadsUrlFromStoredPath(targetUser.profile_photo_path) });
    }

    return res.status(403).json({ error: { message: 'Access denied' } });
  } catch (error) {
    next(error);
  }
};

export const getUserLoginEmailAliases = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Admin, super_admin, and support only (route is also protected with requireAdmin)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencies = await User.getAgencies(id);
    if (!Array.isArray(agencies) || agencies.length < 2) {
      return res.json({ loginEmailAliases: [] });
    }

    const UserLoginEmail = (await import('../models/UserLoginEmail.model.js')).default;
    const rows = await UserLoginEmail.listForUser(parseInt(id));
    res.json({
      loginEmailAliases: (rows || []).map((r) => r.email),
      loginEmailAliasesDetailed: (rows || []).map((r) => ({
        id: r.id,
        agency_id: r.agency_id,
        email: r.email
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const addUserLoginEmailAlias = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const pool = (await import('../config/database.js')).default;

    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: { message: 'email must be a valid email address' } });
    }

    // Admin/super_admin/support only
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this organization' } });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });

    // Don’t allow alias to equal primary identifiers.
    const primary = new Set([
      String(targetUser.email || '').toLowerCase(),
      String(targetUser.work_email || '').toLowerCase(),
      String(targetUser.username || '').toLowerCase()
    ].filter(Boolean));
    if (primary.has(email)) {
      return res.status(400).json({ error: { message: 'Alias matches an existing login identifier for this user' } });
    }

    // Ensure alias isn't used by another user (including via aliases)
    const existing = await User.findByEmail(email);
    if (existing && Number(existing.id) !== Number(userId)) {
      return res.status(409).json({ error: { message: `Login email already in use: ${email}` } });
    }

    try {
      await pool.execute(
        `INSERT INTO user_login_emails (user_id, agency_id, email)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), agency_id = VALUES(agency_id)`,
        [userId, agencyId, email]
      );
    } catch (e) {
      // Unique constraint violation on email is surfaced as 409
      const msg = String(e?.message || '');
      if (msg.includes('Duplicate') || e?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: { message: `Login email already in use: ${email}` } });
      }
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'Login email aliases are not enabled (missing user_login_emails table).' } });
      }
      throw e;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      email,
      loginEmail,
      preferredName,
      personalEmail,
      title,
      serviceFocus,
      credential,
      firstName,
      lastName,
      role: roleRaw,
      hasSupervisorPrivileges,
      hasProviderAccess,
      hasStaffAccess,
      providerAcceptingNewClients,
      personalPhone,
      workPhone,
      workPhoneExtension,
      homeStreetAddress,
      homeAddressLine2,
      homeCity,
      homeState,
      homePostalCode,
      medcancelEnabled,
      medcancelRateSchedule,
      companyCardEnabled,
      billingAcknowledged,
      skillBuilderEligible,
      hasSkillBuilderCoordinatorAccess,
      hasPayrollAccess,
      isHourlyWorker,
      hasHiringAccess,
      externalBusyIcsUrl
    } = req.body;
    const loginEmailAliases = req.body?.loginEmailAliases;

    // Normalize legacy / label-only roles into the current model.
    // Provider is the catch-all; credential/classification should be stored separately.
    const normalizeRole = (r) => {
      const v = String(r || '').trim().toLowerCase();
      if (!v) return null;
      if (v === 'clinician') return 'provider';
      if (v === 'intern' || v === 'facilitator') return 'provider';
      if (v === 'supervisor') return 'provider'; // supervisor is represented by has_supervisor_privileges
      return v;
    };

    const role = roleRaw !== undefined ? normalizeRole(roleRaw) : undefined;
    const forceSupervisorPrivileges = String(roleRaw || '').trim().toLowerCase() === 'supervisor';

    // Only admins/super_admins/support can change roles
    if (role && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change roles' } });
    }

    // Validate role if provided
    if (role) {
      // Note: we still accept legacy inputs (clinician/intern/facilitator/supervisor) via roleRaw,
      // but they are normalized above.
      const validRoles = ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff', 'provider', 'school_staff', 'client_guardian'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: { message: `Invalid role. Must be one of: ${validRoles.join(', ')}` } });
      }
      
      // Application-layer protection for superadmin account
      // This replaces database triggers which require SUPER privilege in Cloud SQL
      const targetUser = await User.findById(id);
      if (targetUser) {
        // Protect superadmin@plottwistco.com from role changes
        if (targetUser.email === 'superadmin@plottwistco.com' && role !== undefined && role !== 'super_admin') {
          return res.status(403).json({ 
            error: { message: 'Cannot change role of superadmin@plottwistco.com - this account must remain super_admin' } 
          });
        }
        
        // Additional protection: Prevent removing super_admin role from any user who currently has it
        if (role !== undefined && targetUser.role === 'super_admin' && role !== 'super_admin') {
          return res.status(403).json({ 
            error: { message: 'Cannot remove super_admin role from a user who currently has it' } 
          });
        }
        // Protect school_staff: never allow changing to provider (distinct portal role)
        if (role !== undefined && targetUser.role === 'school_staff' && String(role || '').toLowerCase() === 'provider') {
          return res.status(403).json({ 
            error: { message: 'Cannot change school_staff role to provider – school_staff is a distinct portal role' } 
          });
        }
      }
      
      // Enforce role assignment permissions
      // Super admin can only be assigned by super admin
      if (role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ 
          error: { message: 'Only super admins can assign the super admin role' } 
        });
      }
      
      // Admin can only be assigned by super admin or admin
      if (role === 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: { message: 'Only super admins and admins can assign the admin role' } 
        });
      }
      
      // Support can only be assigned by super admin or admin
      if (role === 'support' && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: { message: 'Only super admins and admins can assign the support role' } 
        });
      }

      // Billing hard gate: adding an admin beyond included requires acknowledgement.
      // If billing infra is not present in this environment, skip the gate instead of
      // blocking role changes with a 500.
      if (role === 'admin') {
        try {
          const { getAdminAddBillingImpact } = await import('../services/adminBillingGate.service.js');
          const targetUser = await User.findById(id);
          if (targetUser && targetUser.role !== 'admin') {
            const agencies = await User.getAgencies(id);
            const impacts = [];
            for (const agency of agencies) {
              const impact = await getAdminAddBillingImpact(agency.id, { deltaAdmins: 1 });
              if (impact) {
                impacts.push({ agencyId: agency.id, agencyName: agency.name, ...impact });
              }
            }
            if (impacts.length > 0 && billingAcknowledged !== true) {
              return res.status(409).json({
                error: { message: 'Billing acknowledgement required to add an admin beyond included limits.' },
                billingImpact: {
                  code: 'ADMIN_OVERAGE',
                  impacts
                }
              });
            }
          }
        } catch (billingGateError) {
          const isInfraError = isMissingBillingInfraError(billingGateError);
          const reason = isInfraError ? 'billing infra unavailable' : 'billing gate runtime error';
          // Fail open here to avoid blocking role management if billing checks fail.
          // We still keep visibility via warnings for follow-up.
          console.warn(`Admin billing gate skipped (${reason}):`, billingGateError?.message || billingGateError);
        }
      }
    }

    // Supervisors, CPAs, and provider_plus can only view, not edit.
    // Backoffice roles keep edit access even if they also hold supervisor privileges.
    const requestingUser = await User.findById(req.user.id);
    const requestingUserRole = String(requestingUser?.role || req.user.role || '').toLowerCase();
    const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
    const isBackofficeActor = requestingUserRole === 'admin' || requestingUserRole === 'super_admin' || requestingUserRole === 'support';
    if (!isBackofficeActor && (isSupervisor || requestingUserRole === 'clinical_practice_assistant' || requestingUserRole === 'provider_plus')) {
      return res.status(403).json({ error: { message: 'Supervisors and Provider Plus users have view-only access' } });
    }
    
    // Users can only update their own profile unless they're admin/super_admin/support
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'You can only update your own profile' } });
    }

    // Build update object
    const updateData = { firstName, lastName, role };

    // Login email updates (does NOT change password).
    const nextLoginEmailRaw = (loginEmail !== undefined ? loginEmail : email);
    if (nextLoginEmailRaw !== undefined) {
      // Only admins/super_admins/support can change login email (even for self) to avoid accidental lockouts.
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change login email' } });
      }

      const nextLoginEmail = String(nextLoginEmailRaw || '').trim().toLowerCase();
      if (!nextLoginEmail || !nextLoginEmail.includes('@')) {
        return res.status(400).json({ error: { message: 'email must be a valid email address' } });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      if (String(targetUser.email || '').toLowerCase() === 'superadmin@plottwistco.com' && nextLoginEmail !== 'superadmin@plottwistco.com') {
        return res.status(403).json({ error: { message: 'Cannot change login email of superadmin@plottwistco.com' } });
      }

      // Prevent collisions across email/work_email/username (findByEmail checks all of these).
      const existing = await User.findByEmail(nextLoginEmail);
      if (existing && Number(existing.id) !== Number(id)) {
        return res.status(409).json({ error: { message: 'That login email is already in use' } });
      }

      updateData.email = nextLoginEmail;
    }

    // Personal email (contact email; not used for login)
    if (personalEmail !== undefined) {
      const v = String(personalEmail || '').trim();
      if (v && !v.includes('@')) {
        return res.status(400).json({ error: { message: 'personalEmail must be a valid email address' } });
      }
      updateData.personalEmail = v ? v.toLowerCase() : null;
    }

    // Preferred name (display-only; not used for payroll)
    if (preferredName !== undefined) {
      const v = String(preferredName || '').trim();
      updateData.preferredName = v || null;
    }

    // Account fields
    if (title !== undefined) {
      const v = String(title || '').trim();
      updateData.title = v || null;
    }
    if (serviceFocus !== undefined) {
      const v = String(serviceFocus || '').trim();
      updateData.serviceFocus = v || null;
    }
    if (credential !== undefined) {
      const v = String(credential || '').trim();
      updateData.credential = v || null;
    }

    // Additional login emails (aliases) for multi-agency users.
    // Only admins/super_admins/support can manage these to avoid accidental lockouts.
    if (loginEmailAliases !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change login email aliases' } });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }

      const agencies = await User.getAgencies(id);
      if (!Array.isArray(agencies) || agencies.length < 2) {
        return res.status(400).json({ error: { message: 'Login email aliases are only available for users with 2+ organizations' } });
      }

      const UserLoginEmail = (await import('../models/UserLoginEmail.model.js')).default;
      const items = (Array.isArray(loginEmailAliases) ? loginEmailAliases : [])
        .map((e) => ({ email: e }));

      // Collision check: ensure none of these aliases belong to another user (or another identifier).
      for (const it of items) {
        const alias = String(it?.email || '').trim().toLowerCase();
        if (!alias) continue;
        if (!alias.includes('@')) {
          return res.status(400).json({ error: { message: `Invalid login email alias: ${alias}` } });
        }

        // Skip if it matches the user's existing login identifiers.
        if (
          String(targetUser.email || '').toLowerCase() === alias ||
          String(targetUser.work_email || '').toLowerCase() === alias ||
          String(targetUser.username || '').toLowerCase() === alias
        ) {
          continue;
        }

        // If another user already matches this email/username/etc (including via aliases), block it.
        const existing = await User.findByEmail(alias);
        if (existing && Number(existing.id) !== Number(id)) {
          return res.status(409).json({ error: { message: `Login email alias already in use: ${alias}` } });
        }
      }

      await UserLoginEmail.replaceForUser(parseInt(id), items);
    }
    
    // Auto-set has_supervisor_privileges when role changes to/from supervisor
    // This is handled in User.update() method, but we can also set it here for clarity
    if (role !== undefined) {
      const targetUser = await User.findById(id);
      if (targetUser) {
        const wasSupervisor = targetUser.role === 'supervisor';
        const willBeSupervisor = role === 'supervisor';
        
        // If role is changing to supervisor, auto-set boolean to true
        // If role is changing away from supervisor, auto-set boolean to false
        // User.update() will handle this automatically, but we ensure it here too
        if (wasSupervisor !== willBeSupervisor) {
          updateData.hasSupervisorPrivileges = willBeSupervisor;
        }
      }
    }
    
    // Handle supervisor privileges for non-supervisor roles (providers/admins/superadmins/CPAs)
    // This allows them to have supervisor privileges while keeping their primary role.
    if (hasSupervisorPrivileges !== undefined || forceSupervisorPrivileges) {
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      
      console.log('Processing supervisor privileges toggle:', {
        hasSupervisorPrivileges,
        currentRole: targetUser.role,
        newRole: role,
        targetUserId: id,
        requestingUserId: req.user.id
      });
      
      // Don't allow manual toggle if role is being set to 'supervisor' (legacy; it's automatic)
      const finalRole = role !== undefined ? role : targetUser.role;
      if (finalRole === 'supervisor') {
        // Supervisor role automatically gets privileges, skip manual toggle
        // But we still need to ensure it's set
        console.log('Role is supervisor, auto-setting privileges to true');
        updateData.hasSupervisorPrivileges = true;
      } else {
        // Only allow toggle for eligible roles
        const eligibleRoles = ['provider', 'admin', 'super_admin', 'clinical_practice_assistant', 'provider_plus'];
        const currentRole = targetUser.role;
        const newRole = role !== undefined ? role : currentRole;
        
        if (!eligibleRoles.includes(currentRole) && !eligibleRoles.includes(newRole)) {
          console.log('User role not eligible for supervisor privileges:', { currentRole, newRole });
          return res.status(400).json({ 
            error: { message: 'Supervisor privileges can only be enabled for providers, admins, super admins, or clinical practice assistants' } 
          });
        }
        
        // Users can toggle their own privileges if they have eligible role, or admins/superadmins can toggle for others
        if (parseInt(id) !== req.user.id) {
          if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            console.log('User does not have permission to toggle privileges for others');
            return res.status(403).json({ error: { message: 'Only admins and super admins can toggle supervisor privileges for other users' } });
          }
        } else {
          // User is toggling their own privileges - must have eligible role
          const userRole = role || targetUser.role;
          if (!eligibleRoles.includes(userRole)) {
            console.log('User cannot toggle their own privileges - not eligible role:', userRole);
            return res.status(403).json({ error: { message: 'You can only toggle supervisor privileges if you are a provider, admin, super admin, or clinical practice assistant' } });
          }
        }
        
        // Ensure boolean value is properly converted
        const boolValue = forceSupervisorPrivileges ? true : Boolean(hasSupervisorPrivileges);
        console.log('Setting supervisor privileges to:', boolValue);
        updateData.hasSupervisorPrivileges = boolValue;
      }
    } else {
      console.log('hasSupervisorPrivileges is undefined, skipping toggle processing');
    }
    
    // Handle permission attributes for cross-role capabilities
    if (hasProviderAccess !== undefined) {
      const targetUser = await User.findById(id);
      if (targetUser) {
        // Allow provider access for staff/support/admin (admin can be "provider-selectable" when needed)
        if (
          targetUser.role === 'staff' ||
          targetUser.role === 'support' ||
          targetUser.role === 'admin' ||
          (role && (role === 'staff' || role === 'support' || role === 'admin'))
        ) {
          updateData.hasProviderAccess = Boolean(hasProviderAccess);
        }
      }
    }
    
    if (hasStaffAccess !== undefined) {
      const targetUser = await User.findById(id);
      if (targetUser) {
        // Only allow staff access for providers
        if (targetUser.role === 'provider' || (role && role === 'provider')) {
          updateData.hasStaffAccess = Boolean(hasStaffAccess);
        }
      }
    }

    // Provider Open/Closed (accepting new clients) - allow self and admins/support.
    if (providerAcceptingNewClients !== undefined) {
      const targetUser = await User.findById(id);
      if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });
      const targetRole = String(role || targetUser.role || '').toLowerCase();
      const providerLike = targetRole === 'provider' || Boolean(targetUser.has_provider_access);
      if (providerLike) {
        updateData.providerAcceptingNewClients = Boolean(providerAcceptingNewClients);
      }
    }
    
    // Handle phone number updates
    if (personalPhone !== undefined) updateData.personalPhone = personalPhone;
    if (workPhone !== undefined) updateData.workPhone = workPhone;
    if (workPhoneExtension !== undefined) updateData.workPhoneExtension = workPhoneExtension;

    // Home address (used for mileage calculations)
    if (homeStreetAddress !== undefined) updateData.homeStreetAddress = homeStreetAddress;
    if (homeAddressLine2 !== undefined) updateData.homeAddressLine2 = homeAddressLine2;
    if (homeCity !== undefined) updateData.homeCity = homeCity;
    if (homeState !== undefined) updateData.homeState = homeState;
    if (homePostalCode !== undefined) updateData.homePostalCode = homePostalCode;

    // Med Cancel flags (contract feature)
    if (medcancelEnabled !== undefined) updateData.medcancelEnabled = Boolean(medcancelEnabled);
    if (medcancelRateSchedule !== undefined) updateData.medcancelRateSchedule = medcancelRateSchedule;

    // Company Card (contract feature)
    if (companyCardEnabled !== undefined) updateData.companyCardEnabled = Boolean(companyCardEnabled);

    // Skill Builder eligibility (provider program)
    if (skillBuilderEligible !== undefined) updateData.skillBuilderEligible = Boolean(skillBuilderEligible);

    // Skill Builder coordinator access (admin/support/super admin only)
    if (hasSkillBuilderCoordinatorAccess !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change Skill Builder coordinator access' } });
      }
      updateData.hasSkillBuilderCoordinatorAccess = Boolean(hasSkillBuilderCoordinatorAccess);
    }

    // Payroll access (profile toggle: set for all agencies for this user)
    if (hasPayrollAccess !== undefined) {
      // Only admins/super_admins can grant payroll access (including for themselves).
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change Payroll access' } });
      }
      updateData.hasPayrollAccess = Boolean(hasPayrollAccess);
    }
    // Hourly worker (drives Direct/Indirect ratio card visibility)
    if (isHourlyWorker !== undefined) updateData.isHourlyWorker = Boolean(isHourlyWorker);
    // Hiring process access (applicants / prospective)
    if (hasHiringAccess !== undefined) updateData.hasHiringAccess = Boolean(hasHiringAccess);

    // External busy calendar (ICS) URL (admin/support/super admin only)
    if (externalBusyIcsUrl !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change external busy calendar URL' } });
      }
      const v = externalBusyIcsUrl === null ? null : String(externalBusyIcsUrl || '').trim();
      updateData.externalBusyIcsUrl = v || null;
    }

    console.log('Calling User.update with updateData:', updateData);
    const user = await User.update(id, updateData);
    console.log('User.update returned user:', user ? {
      id: user.id,
      role: user.role,
      medcancel_rate_schedule: user.medcancel_rate_schedule,
      medcancel_enabled: user.medcancel_enabled
    } : 'null');
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Keep legacy provider_credential user-info value synchronized while older
    // readers still rely on user_info_values.
    if (credential !== undefined) {
      await syncLegacyProviderCredentialValue(id, updateData.credential);
    }

    // When hasPayrollAccess was provided, set it for all agencies for this user
    if (hasPayrollAccess !== undefined) {
      let payrollConn;
      try {
        payrollConn = await pool.getConnection();
        await payrollConn.beginTransaction();
        const targetUserId = parseInt(id, 10);
        const actorUserId = Number(req.user?.id || 0);
        const nextEnabled = !!hasPayrollAccess;

        const [rows] = await payrollConn.execute(
          'SELECT agency_id, has_payroll_access FROM user_agencies WHERE user_id = ?',
          [targetUserId]
        );

        await payrollConn.execute(
          'UPDATE user_agencies SET has_payroll_access = ? WHERE user_id = ?',
          [nextEnabled ? 1 : 0, targetUserId]
        );

        for (const row of (rows || [])) {
          const agencyId = Number(row?.agency_id || 0);
          if (!agencyId) continue;
          const prevEnabled = normalizeBoolFlag(row?.has_payroll_access);
          if (prevEnabled === nextEnabled) continue;
          await payrollConn.execute(
            `INSERT INTO admin_audit_log
             (action_type, actor_user_id, target_user_id, module_id, track_id, agency_id, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              nextEnabled ? 'grant_payroll_access' : 'revoke_payroll_access',
              actorUserId,
              targetUserId,
              null,
              null,
              agencyId,
              JSON.stringify({
                previous: prevEnabled,
                next: nextEnabled,
                source: 'user_profile_toggle',
                scope: 'all_agencies'
              })
            ]
          );
        }

        await payrollConn.commit();
      } catch (payrollErr) {
        if (payrollConn) {
          try {
            await payrollConn.rollback();
          } catch {
            // ignore
          }
        }
        console.error('Error setting payroll access for all agencies:', payrollErr);
        return res.status(500).json({ error: { message: 'Failed to update payroll access' } });
      } finally {
        if (payrollConn) payrollConn.release();
      }
    }

    res.json(user);
  } catch (error) {
    // Handle MySQL enum errors more gracefully
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || error.message?.includes('enum')) {
      console.error('Role enum error:', error.message);
      return res.status(400).json({ error: { message: `Invalid role value. Valid roles are: super_admin, admin, support, supervisor, clinical_practice_assistant, provider_plus, staff, provider, facilitator, intern` } });
    }
    console.error('Error updating user:', error);
    next(error);
  }
};

export const requireSkillBuilderConfirmNextLogin = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const actorRole = String(req.user?.role || '').toLowerCase();

    // Access control:
    // - super_admin can force confirm for any user
    // - admin can force confirm for users in shared agencies
    // - skill builder coordinators can force confirm for users in shared agencies
    let isCoordinator = false;
    if (!isAdminOrSuperAdmin(req) && actorRole !== 'super_admin') {
      try {
        const [rows] = await pool.execute(
          `SELECT has_skill_builder_coordinator_access
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [actorUserId]
        );
        const v = rows?.[0]?.has_skill_builder_coordinator_access;
        isCoordinator = v === 1 || v === true || v === '1';
      } catch (e) {
        // If older DB does not have the column yet, treat as not a coordinator.
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        isCoordinator = false;
      }
    }

    if (!(actorRole === 'super_admin' || isAdminOrSuperAdmin(req) || isCoordinator)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const sharedOk = await requireSharedAgencyAccessOrSuperAdmin({
      actorUserId,
      targetUserId,
      actorRole
    });
    if (!sharedOk) return res.status(403).json({ error: { message: 'Access denied' } });

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });

    const eligible =
      targetUser?.skill_builder_eligible === true ||
      targetUser?.skill_builder_eligible === 1 ||
      targetUser?.skill_builder_eligible === '1';
    if (!eligible) {
      return res.status(400).json({ error: { message: 'User is not Skill Builder eligible' } });
    }

    const user = await User.update(targetUserId, { skillBuilderConfirmRequiredNextLogin: true });
    res.json({ ok: true, user });
  } catch (e) {
    next(e);
  }
};

function startOfWeekMondayYmd(dateStr) {
  const d = new Date(`${String(dateStr || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMysqlDateTimeWall(value) {
  if (value === null || value === undefined) return null;
  const pad2 = (n) => String(n).padStart(2, '0');
  const formatUtcParts = (d) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatUtcParts(value);
  }

  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return formatUtcParts(d);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return formatUtcParts(d);
}

const canViewProviderScheduleSummary = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

function toDisplayStatus({ status, slotState }) {
  const st = String(status || '').trim().toUpperCase();
  const ss = String(slotState || '').trim().toUpperCase();
  if (st === 'BOOKED' || ss === 'ASSIGNED_BOOKED') return 'BOOKED';
  if (ss === 'ASSIGNED_TEMPORARY') return 'TEMPORARY';
  if (st === 'RELEASED' || ss === 'ASSIGNED_AVAILABLE') return 'AVAILABLE';
  if (st === 'CANCELLED') return 'CANCELED';
  return 'UNKNOWN';
}

function defaultAppointmentTypeForSlot({ status, slotState }) {
  const displayStatus = toDisplayStatus({ status, slotState });
  if (displayStatus === 'BOOKED') return 'SESSION';
  if (displayStatus === 'AVAILABLE') return 'AVAILABLE_SLOT';
  if (displayStatus === 'TEMPORARY') return 'SCHEDULE_BLOCK';
  return 'EVENT';
}

function sanitizeGoogleEventForSchedule(event) {
  const startAt = event?.start?.dateTime || event?.start?.date || null;
  const endAt = event?.end?.dateTime || event?.end?.date || null;
  return {
    id: event?.id || null,
    status: String(event?.status || '').trim().toLowerCase() === 'cancelled' ? 'CANCELED' : 'BUSY',
    displayStatus: 'BUSY',
    appointmentType: 'EVENT',
    appointmentSubtype: 'SCHEDULE_HOLD',
    serviceCode: null,
    statusOutcome: null,
    cancellationReason: null,
    summary: 'Busy',
    location: null,
    start: startAt,
    end: endAt
  };
}

export const getUserScheduleSummary = async (req, res, next) => {
  try {
    const pool = (await import('../config/database.js')).default;

    const providerId = parseInt(req.params.id, 10);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const isSelf = Number(req.user?.id || 0) === Number(providerId);
    if (!isSelf && !canViewProviderScheduleSummary(req.user?.role)) {
      // Allow supervisors to view their supervisees' schedules
      const requestingUser = await User.findById(req.user?.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      if (!isSupervisor) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      // supervisorHasAccess will be checked below with agencyId
    }

    const provider = await User.findById(providerId);
    if (!provider) return res.status(404).json({ error: { message: 'User not found' } });

    // Resolve agency context (used for access checks + scoping)
    let agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      try {
        // fallback to requester's first agency (super_admin may have none)
        const reqAgencies = await User.getAgencies(req.user.id);
        agencyId = reqAgencies?.[0]?.id ? Number(reqAgencies[0].id) : null;
      } catch {
        agencyId = null;
      }
    }

    // Access control: super_admin can view any user; otherwise must share agency with provider or be supervisor of provider.
    if (!isSelf && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      const actorAgencies = await User.getAgencies(req.user.id);
      const targetAgencies = await User.getAgencies(providerId);
      const actorIds = new Set((actorAgencies || []).map((a) => Number(a.id)));
      const shared = (targetAgencies || []).map((a) => Number(a.id)).filter((id) => actorIds.has(id));
      if (shared.length > 0) {
        if (!agencyId || !shared.includes(Number(agencyId))) {
          agencyId = shared[0];
        }
      } else {
        const requestingUser = await User.findById(req.user.id);
        const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
        if (isSupervisor) {
          const supervisorAgencyId = agencyId || (targetAgencies || [])[0]?.id;
          if (supervisorAgencyId && (await User.supervisorHasAccess(req.user.id, providerId, Number(supervisorAgencyId)))) {
            agencyId = Number(supervisorAgencyId);
          } else {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        } else {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      }
    }

    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(weekStartRaw);
    if (!weekStart) return res.status(400).json({ error: { message: 'weekStart must be YYYY-MM-DD' } });
    const weekEnd = addDaysYmd(weekStart, 7);

    const windowStart = `${weekStart} 00:00:00`;
    const windowEnd = `${weekEnd} 00:00:00`;
    const timeMinIso = `${weekStart}T00:00:00Z`;
    const timeMaxIso = `${weekEnd}T00:00:00Z`;

    const includeGoogleBusy = String(req.query.includeGoogleBusy || '').toLowerCase() === 'true';
    const includeGoogleEvents = String(req.query.includeGoogleEvents || '').toLowerCase() === 'true';
    const includeExternalBusy = String(req.query.includeExternalBusy || '').toLowerCase() === 'true';
    const externalCalendarIdsRaw = String(req.query.externalCalendarIds || '').trim();
    const externalCalendarIds = externalCalendarIdsRaw
      ? externalCalendarIdsRaw
        .split(',')
        .map((x) => parseInt(String(x).trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
      : [];

    // Ensure office_events are materialized for this week for buildings relevant to this provider (best-effort).
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT osa.office_location_id
         FROM office_standing_assignments osa
         JOIN office_location_agencies ola ON ola.office_location_id = osa.office_location_id
         WHERE osa.provider_id = ?
           AND osa.is_active = TRUE
           AND ola.agency_id = ?`,
        [providerId, agencyId]
      );
      const officeLocationIds = (rows || []).map((r) => Number(r.office_location_id)).filter((n) => Number.isInteger(n) && n > 0);
      for (const officeLocationId of officeLocationIds) {
        try {
          await OfficeScheduleMaterializer.materializeWeek({
            officeLocationId,
            weekStartRaw: weekStart,
            createdByUserId: req.user.id
          });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore if tables don't exist yet
    }

    // 1) Pending office availability requests (PENDING)
    const officeRequests = [];
    try {
      const [reqRows] = await pool.execute(
        `SELECT id, preferred_office_ids_json, notes, created_at
         FROM provider_office_availability_requests
         WHERE agency_id = ? AND provider_id = ? AND status = 'PENDING'
         ORDER BY created_at DESC`,
        [agencyId, providerId]
      );
      for (const r of reqRows || []) {
        const [slotRows] = await pool.execute(
          `SELECT weekday, start_hour, end_hour
           FROM provider_office_availability_request_slots
           WHERE request_id = ?
           ORDER BY weekday ASC, start_hour ASC`,
          [r.id]
        );
        officeRequests.push({
          id: r.id,
          notes: r.notes || '',
          createdAt: r.created_at,
          preferredOfficeIds: r.preferred_office_ids_json ? JSON.parse(r.preferred_office_ids_json) : [],
          slots: (slotRows || []).map((s) => ({ weekday: s.weekday, startHour: s.start_hour, endHour: s.end_hour }))
        });
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 2) Pending school daytime availability requests (PENDING)
    const schoolRequests = [];
    try {
      const [reqRows] = await pool.execute(
        `SELECT id, notes, created_at
         FROM provider_school_availability_requests
         WHERE agency_id = ? AND provider_id = ? AND status = 'PENDING'
         ORDER BY created_at DESC`,
        [agencyId, providerId]
      );
      for (const r of reqRows || []) {
        const [blockRows] = await pool.execute(
          `SELECT day_of_week, block_type, start_time, end_time
           FROM provider_school_availability_request_blocks
           WHERE request_id = ?
           ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
          [r.id]
        );
        schoolRequests.push({
          id: r.id,
          notes: r.notes || '',
          createdAt: r.created_at,
          blocks: (blockRows || []).map((b) => ({
            dayOfWeek: b.day_of_week,
            blockType: b.block_type,
            startTime: String(b.start_time || '').slice(0, 5),
            endTime: String(b.end_time || '').slice(0, 5)
          }))
        });
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 3) School scheduled hours (provider_school_assignments; not soft schedule)
    let schoolAssignments = [];
    try {
      const [rows] = await pool.execute(
        `SELECT
           psa.school_organization_id,
           a.name AS school_name,
           psa.day_of_week,
           psa.start_time,
           psa.end_time
         FROM provider_school_assignments psa
         JOIN agencies a ON a.id = psa.school_organization_id
         JOIN organization_affiliations oa ON oa.organization_id = psa.school_organization_id AND oa.agency_id = ? AND oa.is_active = TRUE
         WHERE psa.provider_user_id = ?
           AND psa.is_active = TRUE
         ORDER BY FIELD(psa.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday'), psa.start_time ASC`,
        [agencyId, providerId]
      );
      schoolAssignments = (rows || []).map((r) => ({
        schoolOrgId: r.school_organization_id,
        schoolName: r.school_name,
        dayOfWeek: r.day_of_week,
        startTime: String(r.start_time || '').slice(0, 5),
        endTime: String(r.end_time || '').slice(0, 5)
      }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 4) Office schedule (office_events with slot_state)
    let officeEvents = [];
    try {
      const [rows] = await pool.execute(
        `SELECT
           e.id,
           e.office_location_id,
           ol.name AS building_name,
           e.room_id,
           r.room_number,
           r.label AS room_label,
           r.name AS room_name,
           e.start_at,
           e.end_at,
           e.status,
           e.slot_state,
           e.appointment_type_code,
           e.appointment_subtype_code,
           e.service_code,
           e.modality,
           e.status_outcome,
           e.cancellation_reason,
           e.client_id,
           e.clinical_session_id,
           e.note_context_id,
           e.billing_context_id,
           EXISTS(
             SELECT 1
             FROM provider_virtual_slot_availability pv
             WHERE pv.agency_id = ?
               AND pv.provider_id = ?
               AND pv.start_at = e.start_at
               AND pv.end_at = e.end_at
               AND pv.is_active = TRUE
               AND UPPER(COALESCE(pv.session_type, 'REGULAR')) IN ('INTAKE', 'BOTH')
             LIMIT 1
           ) AS virtual_intake_enabled,
           EXISTS(
             SELECT 1
             FROM provider_in_person_slot_availability ip
             WHERE ip.agency_id = ?
               AND ip.provider_id = ?
               AND ip.start_at = e.start_at
               AND ip.end_at = e.end_at
               AND ip.is_active = TRUE
             LIMIT 1
           ) AS in_person_intake_enabled
         FROM office_events e
         JOIN office_rooms r ON r.id = e.room_id
         JOIN office_locations ol ON ol.id = e.office_location_id
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id = ?
         WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND e.start_at < ?
           AND e.end_at > ?
         ORDER BY e.start_at ASC`,
        [agencyId, providerId, agencyId, providerId, agencyId, providerId, providerId, windowEnd, windowStart]
      );
      officeEvents = (rows || []).map((r) => ({
        displayStatus: toDisplayStatus({ status: r.status, slotState: r.slot_state }),
        id: r.id,
        buildingId: r.office_location_id,
        buildingName: r.building_name,
        roomId: r.room_id,
        roomNumber: r.room_number,
        roomLabel: r.room_label || r.room_name,
        startAt: toMysqlDateTimeWall(r.start_at) || r.start_at,
        endAt: toMysqlDateTimeWall(r.end_at) || r.end_at,
        status: r.status,
        slotState: r.slot_state,
        appointmentType: String(r.appointment_type_code || '').trim().toUpperCase() || defaultAppointmentTypeForSlot({ status: r.status, slotState: r.slot_state }),
        appointmentSubtype: String(r.appointment_subtype_code || '').trim().toUpperCase() || null,
        serviceCode: String(r.service_code || '').trim().toUpperCase() || null,
        modality: String(r.modality || '').trim().toUpperCase() || null,
        statusOutcome: String(r.status_outcome || '').trim().toUpperCase() || null,
        cancellationReason: String(r.cancellation_reason || '').trim() || null,
        clientId: Number(r.client_id || 0) || null,
        clinicalSessionId: Number(r.clinical_session_id || 0) || null,
        noteContextId: Number(r.note_context_id || 0) || null,
        billingContextId: Number(r.billing_context_id || 0) || null,
        virtualIntakeEnabled: Number(r.virtual_intake_enabled || 0) === 1,
        inPersonIntakeEnabled: Number(r.in_person_intake_enabled || 0) === 1
      }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await pool.execute(
        `SELECT
           e.id,
           e.office_location_id,
           ol.name AS building_name,
           e.room_id,
           r.room_number,
           r.label AS room_label,
           r.name AS room_name,
           e.start_at,
           e.end_at,
           e.status,
           e.slot_state,
           EXISTS(
             SELECT 1
             FROM provider_virtual_slot_availability pv
             WHERE pv.agency_id = ?
               AND pv.provider_id = ?
               AND pv.start_at = e.start_at
               AND pv.end_at = e.end_at
               AND pv.is_active = TRUE
               AND UPPER(COALESCE(pv.session_type, 'REGULAR')) IN ('INTAKE', 'BOTH')
             LIMIT 1
           ) AS virtual_intake_enabled,
           EXISTS(
             SELECT 1
             FROM provider_in_person_slot_availability ip
             WHERE ip.agency_id = ?
               AND ip.provider_id = ?
               AND ip.start_at = e.start_at
               AND ip.end_at = e.end_at
               AND ip.is_active = TRUE
             LIMIT 1
           ) AS in_person_intake_enabled
         FROM office_events e
         JOIN office_rooms r ON r.id = e.room_id
         JOIN office_locations ol ON ol.id = e.office_location_id
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id = ?
         WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND e.start_at < ?
           AND e.end_at > ?
         ORDER BY e.start_at ASC`,
        [agencyId, providerId, agencyId, providerId, agencyId, providerId, providerId, windowEnd, windowStart]
      );
      officeEvents = (rows || []).map((r) => ({
        displayStatus: toDisplayStatus({ status: r.status, slotState: r.slot_state }),
        id: r.id,
        buildingId: r.office_location_id,
        buildingName: r.building_name,
        roomId: r.room_id,
        roomNumber: r.room_number,
        roomLabel: r.room_label || r.room_name,
        startAt: toMysqlDateTimeWall(r.start_at) || r.start_at,
        endAt: toMysqlDateTimeWall(r.end_at) || r.end_at,
        status: r.status,
        slotState: r.slot_state,
        appointmentType: defaultAppointmentTypeForSlot({ status: r.status, slotState: r.slot_state }),
        appointmentSubtype: null,
        serviceCode: null,
        modality: null,
        statusOutcome: null,
        cancellationReason: null,
        clientId: null,
        clinicalSessionId: null,
        noteContextId: null,
        billingContextId: null,
        virtualIntakeEnabled: Number(r.virtual_intake_enabled || 0) === 1,
        inPersonIntakeEnabled: Number(r.in_person_intake_enabled || 0) === 1
      }));
    }

    // 4b) Supervision sessions (app-scheduled, optionally synced to Google)
    let supervisionSessions = [];
    try {
      const rows = await SupervisionSession.listForUserInWindow({
        agencyId,
        userId: providerId,
        windowStart,
        windowEnd
      });
      supervisionSessions = (rows || []).map((r) => {
        const isSupervisor = Number(r.supervisor_user_id) === Number(providerId);
        const sessionType = String(r.session_type || 'individual').trim().toLowerCase();
        const superviseeNames = String(r.supervisee_names || '').trim();
        const oneToOneName = isSupervisor
          ? `${r.supervisee_first_name || ''} ${r.supervisee_last_name || ''}`.trim()
          : `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim();
        const groupDisplay = isSupervisor
          ? (superviseeNames || oneToOneName)
          : `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim();
        const otherName = sessionType === 'group' || sessionType === 'triadic' ? groupDisplay : oneToOneName;
        const hasViewerRequired = r?.viewer_is_required !== null && r?.viewer_is_required !== undefined;
        const isPrimarySupervisee = Number(r?.supervisee_user_id || 0) === Number(providerId);
        const isRequired = hasViewerRequired ? Number(r.viewer_is_required) === 1 : isPrimarySupervisee;
        return {
          id: r.id,
          role: isSupervisor ? 'supervisor' : 'supervisee',
          counterpartyName: otherName || null,
          sessionType,
          isRequired,
          presenterRole: r.viewer_presenter_role || null,
          presenterStatus: r.viewer_presenter_status || null,
          startAt: r.start_at,
          endAt: r.end_at,
          status: r.status,
          modality: r.modality,
          locationText: r.location_text,
          notes: r.notes,
          googleMeetLink: r.google_meet_link || null
        };
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      supervisionSessions = [];
    }

    // 5) Optional busy overlays (busy blocks only)
    let googleBusy = [];
    let googleBusyError = null;
    let googleEvents = [];
    let googleEventsError = null;
    let externalBusy = [];
    let externalCalendarsAvailable = [];
    let externalCalendars = [];

    // Always include available calendars (labels only; no URLs)
    try {
      externalCalendarsAvailable = await UserExternalCalendar.listAvailableCalendars({ userId: providerId });
    } catch {
      externalCalendarsAvailable = [];
    }

    if (includeGoogleBusy) {
      try {
        const providerEmail = String(provider?.email || '').trim().toLowerCase();
        const r = await GoogleCalendarService.freeBusy({
          subjectEmail: providerEmail,
          timeMin: timeMinIso,
          timeMax: timeMaxIso,
          calendarId: 'primary'
        });
        if (r?.ok) googleBusy = r.busy || [];
        else googleBusyError = r?.error || r?.reason || 'Google busy is not available';
      } catch {
        googleBusy = [];
        googleBusyError = 'Google busy lookup failed';
      }
    }

    if (includeGoogleEvents) {
      try {
        const providerEmail = String(provider?.email || '').trim().toLowerCase();
        const r = await GoogleCalendarService.listEvents({
          subjectEmail: providerEmail,
          timeMin: timeMinIso,
          timeMax: timeMaxIso,
          calendarId: 'primary',
          maxItems: 250
        });
        if (r?.ok) {
          googleEvents = isAdminOrSuperAdmin(req)
            ? (r.events || [])
            : (r.events || []).map((event) => sanitizeGoogleEventForSchedule(event));
        }
        else googleEventsError = r?.error || r?.reason || 'Google events are not available';
      } catch {
        googleEvents = [];
        googleEventsError = 'Google events lookup failed';
      }
    }

    // New: per-calendar external busy overlays
    // - If externalCalendarIds is provided, return per-calendar busy for those ids.
    // - If includeExternalBusy=true and no ids provided, fall back to legacy single-URL behavior.
    if (externalCalendarIds.length > 0) {
      try {
        const feeds = await UserExternalCalendar.listFeedsForCalendars({
          userId: providerId,
          calendarIds: externalCalendarIds,
          activeOnly: true
        });
        const byCalendar = new Map();
        for (const f of feeds || []) {
          if (!byCalendar.has(f.calendarId)) {
            byCalendar.set(f.calendarId, { id: f.calendarId, label: f.calendarLabel, feeds: [] });
          }
          byCalendar.get(f.calendarId).feeds.push({ id: f.feedId, url: f.icsUrl });
        }
        const calendarsToFetch = Array.from(byCalendar.values());
        const out = [];
        for (const c of calendarsToFetch) {
          // Busy per feed is fetched/parsed server-side; we union per calendar in the service layer.
          const r = await ExternalBusyCalendarService.getBusyForFeeds({
            userId: providerId,
            weekStart,
            feeds: c.feeds,
            timeMinIso,
            timeMaxIso
          });
          out.push({
            id: c.id,
            label: c.label,
            busy: r?.ok ? (r.busy || []) : [],
            ok: r?.ok !== false,
            error: r?.ok ? null : (r?.error || r?.reason || 'Failed to fetch calendar feed')
          });
        }
        externalCalendars = out;
      } catch {
        externalCalendars = [];
      }
    } else if (includeExternalBusy) {
      try {
        const icsUrl = provider?.external_busy_ics_url || provider?.externalBusyIcsUrl || null;
        const r = await ExternalBusyCalendarService.getBusyForWeek({
          userId: providerId,
          weekStart,
          icsUrl,
          timeMinIso,
          timeMaxIso
        });
        if (r?.ok) externalBusy = r.busy || [];
      } catch {
        externalBusy = [];
      }
    }

    res.json({
      ok: true,
      providerId,
      agencyId,
      weekStart,
      weekEnd,
      windowStart,
      windowEnd,
      officeRequests,
      schoolRequests,
      schoolAssignments,
      officeEvents,
      supervisionSessions,
      externalCalendarsAvailable,
      ...(externalCalendarIds.length ? { externalCalendars } : {}),
      ...(includeGoogleBusy ? { googleBusy, googleBusyError } : {}),
      ...(includeGoogleEvents ? { googleEvents, googleEventsError } : {}),
      ...(includeExternalBusy ? { externalBusy } : {})
    });
  } catch (e) {
    next(e);
  }
};

export const getUserExternalCalendars = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: { message: 'Access denied' } });

    const ok = await requireSharedAgencyAccessOrSuperAdmin({
      actorUserId: req.user.id,
      targetUserId: userId,
      actorRole: req.user.role
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const calendars = await UserExternalCalendar.listForUser({ userId, includeFeeds: true, activeOnly: false });
    res.json({ ok: true, userId, calendars });
  } catch (e) {
    next(e);
  }
};

export const createUserExternalCalendar = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: { message: 'Access denied' } });

    const ok = await requireSharedAgencyAccessOrSuperAdmin({
      actorUserId: req.user.id,
      targetUserId: userId,
      actorRole: req.user.role
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: { message: 'label is required' } });

    const calendar = await UserExternalCalendar.createCalendar({
      userId,
      label,
      createdByUserId: req.user.id
    });
    res.status(201).json({ ok: true, calendar });
  } catch (e) {
    if (e?.statusCode === 409) return res.status(409).json({ error: { message: e.message } });
    next(e);
  }
};

export const addUserExternalCalendarFeed = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const calendarId = parseInt(req.params.calendarId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!calendarId) return res.status(400).json({ error: { message: 'Invalid calendar id' } });
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: { message: 'Access denied' } });

    const ok = await requireSharedAgencyAccessOrSuperAdmin({
      actorUserId: req.user.id,
      targetUserId: userId,
      actorRole: req.user.role
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const icsUrl = String(req.body?.icsUrl || '').trim();
    if (!icsUrl) return res.status(400).json({ error: { message: 'icsUrl is required' } });

    const feed = await UserExternalCalendar.addFeed({ userId, calendarId, icsUrl });
    res.status(201).json({ ok: true, feed });
  } catch (e) {
    if (e?.statusCode === 404) return res.status(404).json({ error: { message: e.message } });
    if (e?.statusCode === 409) return res.status(409).json({ error: { message: e.message } });
    next(e);
  }
};

export const patchUserExternalCalendar = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const calendarId = parseInt(req.params.calendarId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!calendarId) return res.status(400).json({ error: { message: 'Invalid calendar id' } });
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: { message: 'Access denied' } });

    const ok = await requireSharedAgencyAccessOrSuperAdmin({
      actorUserId: req.user.id,
      targetUserId: userId,
      actorRole: req.user.role
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const isActive = req.body?.isActive;
    const label = req.body?.label;
    if (isActive === undefined && label === undefined) {
      return res.status(400).json({ error: { message: 'isActive or label is required' } });
    }

    if (label !== undefined) {
      const updatedLabel = await UserExternalCalendar.setCalendarLabel({ userId, calendarId, label });
      if (!updatedLabel) return res.status(404).json({ error: { message: 'Calendar not found' } });
    }
    if (isActive !== undefined) {
      const updatedActive = await UserExternalCalendar.setCalendarActive({ userId, calendarId, isActive });
      if (!updatedActive) return res.status(404).json({ error: { message: 'Calendar not found' } });
    }
    res.json({ ok: true });
  } catch (e) {
    if (e?.statusCode === 409) return res.status(409).json({ error: { message: e.message } });
    next(e);
  }
};

export const patchUserExternalCalendarFeed = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const calendarId = parseInt(req.params.calendarId, 10);
    const feedId = parseInt(req.params.feedId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!calendarId) return res.status(400).json({ error: { message: 'Invalid calendar id' } });
    if (!feedId) return res.status(400).json({ error: { message: 'Invalid feed id' } });
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: { message: 'Access denied' } });

    const ok = await requireSharedAgencyAccessOrSuperAdmin({
      actorUserId: req.user.id,
      targetUserId: userId,
      actorRole: req.user.role
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const isActive = req.body?.isActive;
    if (isActive === undefined) return res.status(400).json({ error: { message: 'isActive is required' } });

    const updated = await UserExternalCalendar.setFeedActive({ userId, calendarId, feedId, isActive });
    if (!updated) return res.status(404).json({ error: { message: 'Feed not found' } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const toggleSupervisorPrivileges = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: { message: 'enabled must be a boolean value' } });
    }
    
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Only allow toggle for eligible roles
    const eligibleRoles = ['admin', 'super_admin', 'clinical_practice_assistant', 'provider_plus'];
    if (!eligibleRoles.includes(targetUser.role)) {
      return res.status(400).json({ 
        error: { message: 'Supervisor privileges can only be enabled for admins, super admins, or clinical practice assistants' } 
      });
    }
    
    // Users can toggle their own privileges if they have eligible role, or admins/superadmins can toggle for others
    if (parseInt(id) !== req.user.id) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins and super admins can toggle supervisor privileges for other users' } });
      }
    } else {
      // User is toggling their own privileges - must have eligible role
      if (!eligibleRoles.includes(req.user.role)) {
        return res.status(403).json({ error: { message: 'You can only toggle supervisor privileges if you are an admin, super admin, or clinical practice assistant' } });
      }
    }
    
    const user = await User.update(id, { hasSupervisorPrivileges: enabled });
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    res.json({ 
      message: `Supervisor privileges ${enabled ? 'enabled' : 'disabled'} successfully`,
      user 
    });
  } catch (error) {
    console.error('Error toggling supervisor privileges:', error);
    next(error);
  }
};

export const getUserAgencies = async (req, res, next) => {
  try {
    // Handle approved employees (they don't have a user ID)
    if (req.user.type === 'approved_employee') {
      // Get agency IDs from the token
      const agencyIds = req.user.agencyIds || (req.user.agencyId ? [req.user.agencyId] : []);
      
      if (agencyIds.length === 0) {
        return res.json([]);
      }
      
      // Fetch agency details for each ID
      const Agency = (await import('../models/Agency.model.js')).default;
      const agencies = [];
      for (const agencyId of agencyIds) {
        try {
          const agency = await Agency.findById(agencyId);
          if (agency) {
            agencies.push(agency);
          }
        } catch (err) {
          console.error(`Failed to fetch agency ${agencyId}:`, err);
        }
      }
      
      await attachAffiliationMeta(agencies);
      return res.json(agencies);
    }
    
    // Regular users
    // If route is /me/agencies, use req.user.id, otherwise use :id param
    const userId = req.params.id || req.user.id;
    
    // Users can see their own agencies, or admins/super_admins/support can see any
    // CPAs and supervisors can see agencies for users they supervise
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      // Check if CPA or supervisor has access to this user
      if (req.user.role === 'clinical_practice_assistant' || req.user.role === 'provider_plus' || req.user.role === 'supervisor') {
        const targetUser = await User.findById(userId);
        if (!targetUser) {
          return res.status(404).json({ error: { message: 'User not found' } });
        }
        
        // CPAs can view agencies for all users in their agencies
        if (req.user.role === 'clinical_practice_assistant' || req.user.role === 'provider_plus') {
          const cpaAgencies = await User.getAgencies(req.user.id);
          const targetUserAgencies = await User.getAgencies(userId);
          const cpaAgencyIds = cpaAgencies.map(a => a.id);
          const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
          const sharedAgencies = cpaAgencyIds.filter(id => targetUserAgencyIds.includes(id));
          
          if (sharedAgencies.length === 0) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        } else if (req.user.role === 'supervisor') {
          // Supervisors can only view agencies for their assigned supervisees
          const hasAccess = await User.supervisorHasAccess(req.user.id, userId);
          if (!hasAccess) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const agencies = await User.getAgencies(userId);
    await attachAffiliationMeta(agencies);
    res.json(agencies);
  } catch (error) {
    next(error);
  }
};

/**
 * Get org slugs that the current user's supervisees are affiliated with (for router/school portal access).
 * GET /users/me/supervisee-portal-slugs
 */
export const getSuperviseePortalSlugs = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const requestingUser = await User.findById(userId);
    const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
    if (!isSupervisor) {
      return res.json({ slugs: [] });
    }

    const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
    const assignments = await SupervisorAssignment.findBySupervisor(userId, null);
    const superviseeIds = [...new Set((assignments || []).map((a) => Number(a.supervisee_id)).filter((n) => Number.isFinite(n) && n > 0))];
    const slugSet = new Set();
    for (const superviseeId of superviseeIds) {
      try {
        const agencies = await User.getAgencies(superviseeId);
        for (const a of agencies || []) {
          const slug = (a.slug || a.portal_url || '').toString().trim();
          if (slug) slugSet.add(slug);
        }
      } catch {
        // ignore per-supervisee errors
      }
    }
    const slugs = Array.from(slugSet).filter(Boolean).sort();
    res.json({ slugs });
  } catch (error) {
    next(error);
  }
};

/**
 * Get affiliated school/program/learning portals for a user (for supervisor view: one button per school).
 * GET /users/:id/affiliated-portals
 * Returns orgs of type school/program/learning the user belongs to (id, name, slug).
 * Allowed: self, admin/support/super_admin, or supervisor with access to this user.
 */
export const getAffiliatedPortals = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId || !Number.isFinite(userId)) {
      return res.status(400).json({ error: { message: 'User ID is required' } });
    }
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    if (requesterId !== userId) {
      const isAdminOrSupport = ['admin', 'super_admin', 'support'].includes(req.user?.role);
      if (!isAdminOrSupport) {
        const hasAccess = await User.supervisorHasAccess(requesterId, userId, null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'You can only view affiliated portals for yourself or your assigned supervisees.' } });
        }
      }
    }

    const agencies = await User.getAgencies(userId);
    const schoolTypes = ['school', 'program', 'learning'];
    const portals = (agencies || [])
      .filter((a) => schoolTypes.includes(String(a.organization_type || '').toLowerCase()))
      .map((a) => ({
        id: a.id,
        name: a.name || `Organization ${a.id}`,
        slug: (a.slug || a.portal_url || '').toString().trim(),
        organization_type: (a.organization_type || 'school').toLowerCase()
      }))
      .filter((p) => p.slug);

    res.json({ portals });
  } catch (error) {
    next(error);
  }
};

export const setUserAgencySupervisionPrelicensed = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const isPrelicensed = req.body?.isPrelicensed === true || req.body?.isPrelicensed === 1 || req.body?.isPrelicensed === '1';
    const isCompensable = req.body?.isCompensable === true || req.body?.isCompensable === 1 || req.body?.isCompensable === '1';
    const startDate = req.body?.startDate ? String(req.body.startDate).slice(0, 10) : null;
    const startIndividualHours = Number(req.body?.startIndividualHours || 0);
    const startGroupHours = Number(req.body?.startGroupHours || 0);

    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!Number.isFinite(startIndividualHours) || startIndividualHours < 0) {
      return res.status(400).json({ error: { message: 'startIndividualHours must be a non-negative number' } });
    }
    if (!Number.isFinite(startGroupHours) || startGroupHours < 0) {
      return res.status(400).json({ error: { message: 'startGroupHours must be a non-negative number' } });
    }
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({ error: { message: 'startDate must be YYYY-MM-DD' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this organization' } });
    }

    const updated = await User.setAgencySupervisionPrelicensedSettings(userId, agencyId, {
      isPrelicensed,
      isCompensable,
      startDate,
      startIndividualHours,
      startGroupHours
    });
    // Best-effort: recompute supervision account so profile reflects baseline changes quickly.
    let supervisionAccount = null;
    try {
      const { recomputeSupervisionAccountForUser } = await import('../services/supervision.service.js');
      supervisionAccount = await recomputeSupervisionAccountForUser({ agencyId, userId });
    } catch {
      supervisionAccount = null;
    }
    return res.json({ ok: true, membership: updated, supervisionAccount });
  } catch (error) {
    next(error);
  }
};


export const assignUserToAgency = async (req, res, next) => {
  try {
    const { userId, agencyId } = req.body;
    
    // Only admins/super_admins can assign users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    await User.assignToAgency(userId, agencyId);
    res.json({ message: 'User assigned to agency successfully' });
  } catch (error) {
    next(error);
  }
};


export const removeUserFromAgency = async (req, res, next) => {
  let conn = null;
  try {
    const { userId, agencyId } = req.body;

    // Only admins/super_admins can remove users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const uid = parseInt(userId, 10);
    const aid = parseInt(agencyId, 10);
    if (!uid || !aid) {
      return res.status(400).json({ error: { message: 'userId and agencyId are required' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Determine whether this "agency" is actually a school org. If so, clean up School Portal day/provider rows
    // so orphaned day assignments never keep showing in the portal.
    const [[orgRow]] = await conn.execute(
      `SELECT organization_type
       FROM agencies
       WHERE id = ?
       LIMIT 1`,
      [aid]
    );
    const orgType = String(orgRow?.organization_type || 'agency').toLowerCase();

    // Remove the membership itself.
    await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [uid, aid]);

    const ignoreIfMissing = (e) => {
      const msg = String(e?.message || '');
      return (
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes("doesn't exist") ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR')
      );
    };

    if (orgType === 'school') {
      // Unassign this provider from any clients at this school (and refund slots).
      // This is intentionally best-effort/backward-compatible: older DBs may not have multi-provider tables.
      try {
        const [assignRows] = await conn.execute(
          `SELECT id, client_id, service_day
           FROM client_provider_assignments
           WHERE provider_user_id = ? AND organization_id = ? AND is_active = TRUE
           FOR UPDATE`,
          [uid, aid]
        );

        for (const a of assignRows || []) {
          if (a?.service_day) {
            await adjustProviderSlots(conn, {
              providerUserId: uid,
              schoolId: aid,
              dayOfWeek: a.service_day,
              delta: +1
            });
          }

          await conn.execute(
            `UPDATE client_provider_assignments
             SET is_active = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [req.user.id, a.id]
          );

          // Keep legacy single-provider fields in sync (snap back to Not assigned when none remain).
          // Prefer explicit primary if available; otherwise pick most recent active assignment.
          let next = null;
          try {
            const [nextRows] = await conn.execute(
              `SELECT provider_user_id, service_day
               FROM client_provider_assignments
               WHERE client_id = ? AND is_active = TRUE
               ORDER BY (CASE WHEN is_primary = TRUE THEN 1 ELSE 0 END) DESC, updated_at DESC
               LIMIT 1`,
              [a.client_id]
            );
            next = nextRows?.[0] || null;
          } catch (e) {
            const msg = String(e?.message || '');
            const missingIsPrimary = msg.includes('Unknown column') && msg.includes('is_primary');
            if (!missingIsPrimary) throw e;
            const [nextRows] = await conn.execute(
              `SELECT provider_user_id, service_day
               FROM client_provider_assignments
               WHERE client_id = ? AND is_active = TRUE
               ORDER BY updated_at DESC
               LIMIT 1`,
              [a.client_id]
            );
            next = nextRows?.[0] || null;
          }

          try {
            await conn.execute(
              `UPDATE clients
               SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [next?.provider_user_id || null, next?.service_day || null, req.user.id, a.client_id]
            );
          } catch {
            // best-effort
          }
        }
      } catch (e) {
        if (!ignoreIfMissing(e)) throw e;

        // Legacy fallback: clients table only (no multi-provider assignments table).
        try {
          const [rows] = await conn.execute(
            `SELECT id, service_day
             FROM clients
             WHERE organization_id = ? AND provider_id = ?`,
            [aid, uid]
          );
          for (const r of rows || []) {
            if (r?.service_day) {
              await adjustProviderSlots(conn, {
                providerUserId: uid,
                schoolId: aid,
                dayOfWeek: r.service_day,
                delta: +1
              });
            }
          }
          await conn.execute(
            `UPDATE clients
             SET provider_id = NULL, service_day = NULL, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
             WHERE organization_id = ? AND provider_id = ?`,
            [req.user.id, aid, uid]
          );
        } catch (e2) {
          if (!ignoreIfMissing(e2)) throw e2;
        }
      }

      // Best-effort: deactivate work-hour assignments (legacy) so they don't continue to drive portal behavior.
      try {
        await conn.execute(
          `UPDATE provider_school_assignments
           SET is_active = FALSE
           WHERE provider_user_id = ? AND school_organization_id = ?`,
          [uid, aid]
        );
      } catch (e) {
        if (!ignoreIfMissing(e)) throw e;
      }

      // Best-effort: deactivate School Portal day-provider roster rows.
      try {
        await conn.execute(
          `UPDATE school_day_provider_assignments
           SET is_active = FALSE
           WHERE provider_user_id = ? AND school_organization_id = ?`,
          [uid, aid]
        );
      } catch (e) {
        if (!ignoreIfMissing(e)) throw e;
      }

      // Best-effort: remove soft schedule rows for this provider at this school.
      try {
        await conn.execute(
          `DELETE FROM soft_schedule_slots
           WHERE provider_user_id = ? AND school_organization_id = ?`,
          [uid, aid]
        );
      } catch (e) {
        if (!ignoreIfMissing(e)) throw e;
      }

      // Best-effort: remove school-entered logistics schedule entries for this provider at this school.
      try {
        await conn.execute(
          `DELETE FROM school_provider_schedule_entries
           WHERE provider_user_id = ? AND school_organization_id = ?`,
          [uid, aid]
        );
      } catch (e) {
        if (!ignoreIfMissing(e)) throw e;
      }
    }

    await conn.commit();
    res.json({ message: 'User removed from agency successfully' });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
    }
    next(error);
  } finally {
    if (conn) conn.release();
  }
};

export const setUserAgencyPayrollAccess = async (req, res, next) => {
  let conn;
  try {
    const { id } = req.params;
    const { agencyId, enabled } = req.body || {};

    // Only admins/super_admins can grant payroll access.
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userId = parseInt(id);
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    if (!userId || !agencyIdNum) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: { message: 'enabled must be a boolean' } });
    }
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [membershipRows] = await conn.execute(
      'SELECT has_payroll_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, agencyIdNum]
    );
    const membership = membershipRows?.[0] || null;
    if (!membership) {
      await conn.rollback();
      return res.status(400).json({ error: { message: 'User is not assigned to this agency' } });
    }

    const prevEnabled = normalizeBoolFlag(membership.has_payroll_access);
    const nextEnabled = !!enabled;

    if (prevEnabled !== nextEnabled) {
      await conn.execute(
        'UPDATE user_agencies SET has_payroll_access = ? WHERE user_id = ? AND agency_id = ?',
        [nextEnabled ? 1 : 0, userId, agencyIdNum]
      );
      await conn.execute(
        `INSERT INTO admin_audit_log
         (action_type, actor_user_id, target_user_id, module_id, track_id, agency_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          nextEnabled ? 'grant_payroll_access' : 'revoke_payroll_access',
          Number(req.user?.id || 0),
          userId,
          null,
          null,
          agencyIdNum,
          JSON.stringify({
            previous: prevEnabled,
            next: nextEnabled,
            source: 'user_agency_toggle'
          })
        ]
      );
    }

    const [updatedRows] = await conn.execute(
      'SELECT has_payroll_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, agencyIdNum]
    );
    await conn.commit();
    res.json({
      userId,
      agencyId: agencyIdNum,
      hasPayrollAccess: normalizeBoolFlag(updatedRows?.[0]?.has_payroll_access)
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
    }
    next(error);
  } finally {
    if (conn) conn.release();
  }
};

export const setUserAgencyH0032Mode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agencyId, mode } = req.body || {};

    // Only admins/super_admins can edit agency membership flags.
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userId = parseInt(id);
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    if (!userId || !agencyIdNum) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const rawMode = String(mode || '').trim().toLowerCase();
    if (!rawMode || !['cat1_hour', 'cat2_flat'].includes(rawMode)) {
      return res.status(400).json({ error: { message: 'mode must be one of: cat1_hour, cat2_flat' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyIdNum);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this agency' } });
    }

    // cat1_hour => requires manual minutes (shows in H0032 processing queue)
    // cat2_flat => auto 30 minutes per line (does NOT show in queue)
    const requiresManualMinutes = rawMode === 'cat1_hour';
    const updated = await User.setAgencyH0032RequiresManualMinutes(userId, agencyIdNum, requiresManualMinutes);

    res.json({
      userId,
      agencyId: agencyIdNum,
      mode: requiresManualMinutes ? 'cat1_hour' : 'cat2_flat',
      h0032RequiresManualMinutes: !!(updated?.h0032_requires_manual_minutes === 1 || updated?.h0032_requires_manual_minutes === true || updated?.h0032_requires_manual_minutes === '1')
    });
  } catch (error) {
    next(error);
  }
};

export const generateInvitationToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can generate tokens
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const token = await User.generateInvitationToken(id);
    res.json({ token });
  } catch (error) {
    next(error);
  }
};

export const generateTemporaryPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { expiresInDays, expiresInHours } = req.body;
    
    // Only admins/super_admins can generate temporary passwords
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // If Workspace login is required for this user, temp passwords are blocked unless admin override is enabled.
    try {
      const ssoState = await getSsoStateForUser(targetUser);
      if (ssoState.ssoRequired) {
        return res.status(409).json({
          error: {
            message: 'Password login is disabled by Workspace policy for this user. Enable admin password override to issue a temporary password.'
          }
        });
      }
    } catch {
      // Best-effort: do not block on org lookup failure.
    }

    const tempPassword = await User.generateTemporaryPassword();
    // Default to 48 hours if not specified
    const finalExpiresInHours =
      Number.isFinite(parseInt(expiresInHours)) ? parseInt(expiresInHours) :
      Number.isFinite(parseInt(expiresInDays)) ? (parseInt(expiresInDays) * 24) :
      48;
    const result = await User.setTemporaryPassword(id, tempPassword, Math.max(1, finalExpiresInHours));
    
    res.json({ 
      temporaryPassword: tempPassword,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    next(error);
  }
};

export const resetPasswordlessToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { expiresInDays, expiresInHours, expiresAt } = req.body;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Check permissions:
    // - Users can reset their own token if they're pending
    // - Admins/super_admins/support can reset any user's token
    const canReset = 
      (userId === req.user.id && user.status === 'pending') ||
      req.user.role === 'admin' ||
      req.user.role === 'super_admin' ||
      req.user.role === 'support';
    
    if (!canReset) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Only allow resetting tokens for pending or ready_for_review users
    if (user.status !== 'pending' && user.status !== 'ready_for_review') {
      return res.status(400).json({ 
        error: { message: 'Passwordless token can only be reset for pending or ready_for_review users' } 
      });
    }
    
    // Calculate expiration
    let finalExpiresInHours;
    if (expiresAt) {
      // If specific expiration date provided, calculate hours from now
      const targetDate = new Date(expiresAt);
      const now = new Date();
      finalExpiresInHours = Math.max(1, Math.round((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60)));
    } else if (expiresInHours) {
      // If hours provided, use that
      finalExpiresInHours = parseInt(expiresInHours);
    } else if (expiresInDays) {
      // If days provided, convert to hours
      finalExpiresInHours = parseInt(expiresInDays) * 24;
    } else {
      // Default: 7 days for pending users, 48 hours for ready_for_review
      finalExpiresInHours = user.status === 'pending' ? 7 * 24 : 48;
    }
    
    // Ensure minimum 1 hour expiration
    if (finalExpiresInHours < 1) {
      finalExpiresInHours = 1;
    }
    
    const tokenResult = await User.generatePasswordlessToken(userId, finalExpiresInHours, 'setup');
    
    // Get frontend URL for the link
    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(user.id);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const passwordlessTokenLink = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
      : `${frontendBase}/passwordless-login/${tokenResult.token}`;
    
    res.json({
      token: tokenResult.token,
      tokenLink: passwordlessTokenLink,
      expiresAt: tokenResult.expiresAt,
      expiresInHours: finalExpiresInHours,
      message: 'Passwordless token reset successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Admin action: send the initial setup link (idempotent if a valid setup token already exists)
export const sendInitialSetupLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    const { expiresInHours } = req.body || {};

    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    // Only admins/super_admins/support
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    // If password already set, this is no longer a "setup" action.
    if (user.password_hash) {
      return res.status(400).json({ error: { message: 'Password already set. Use Reset Password Link instead.' } });
    }

    // If there is already a non-expired setup token, return it (don’t rotate on “send”).
    const purpose = String(user.passwordless_token_purpose || 'setup');
    const expiresAt = user.passwordless_token_expires_at ? new Date(user.passwordless_token_expires_at) : null;
    const now = new Date();
    const hasValidExisting =
      user.passwordless_token &&
      purpose === 'setup' &&
      expiresAt &&
      expiresAt.getTime() > now.getTime();

    let tokenResult = null;
    if (hasValidExisting) {
      tokenResult = { token: user.passwordless_token, expiresAt };
    } else {
      let finalExpiresInHours = expiresInHours ? parseInt(expiresInHours) : 48;
      if (!Number.isInteger(finalExpiresInHours) || finalExpiresInHours < 1) finalExpiresInHours = 48;
      tokenResult = await User.generatePasswordlessToken(userId, finalExpiresInHours, 'setup');
    }

    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(user.id);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const link = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
      : `${frontendBase}/passwordless-login/${tokenResult.token}`;

    res.json({
      token: tokenResult.token,
      tokenLink: link,
      expiresAt: tokenResult.expiresAt,
      message: 'Setup link generated'
    });
  } catch (e) {
    next(e);
  }
};

// Admin action: resend setup link (always rotates a fresh setup token)
export const resendSetupLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    const { expiresInHours } = req.body || {};

    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    if (user.password_hash) {
      return res.status(400).json({ error: { message: 'Password already set. Use Reset Password Link instead.' } });
    }

    let finalExpiresInHours = expiresInHours ? parseInt(expiresInHours) : 48;
    if (!Number.isInteger(finalExpiresInHours) || finalExpiresInHours < 1) finalExpiresInHours = 48;

    const tokenResult = await User.generatePasswordlessToken(userId, finalExpiresInHours, 'setup');

    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(user.id);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const link = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
      : `${frontendBase}/passwordless-login/${tokenResult.token}`;

    res.json({
      token: tokenResult.token,
      tokenLink: link,
      expiresAt: tokenResult.expiresAt,
      message: 'Setup link resent'
    });
  } catch (e) {
    next(e);
  }
};

export const sendResetPasswordLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { expiresInHours, forceNew, sendEmail } = req.body || {};
    const userId = parseInt(id);

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Check permissions: Only admins/super_admins/support can send reset links
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Do not overwrite setup/invite links: pending users use the setup link flow, not reset
    const statusLower = String(user.status || '').toLowerCase();
    if (statusLower === 'pending' || statusLower === 'pending_setup') {
      return res.status(400).json({
        error: {
          message: 'Use the Direct Login Link (setup link) for pending users. Password reset links are for users who already have an account.'
        }
      });
    }

    // If Workspace login is required for this user, reset links are blocked unless admin override is enabled.
    try {
      const ssoState = await getSsoStateForUser(user);
      if (ssoState.ssoRequired) {
        return res.status(409).json({
          error: {
            message: 'Password reset is disabled by Workspace policy for this user. Enable admin password override first if an exception is required.'
          }
        });
      }
    } catch {
      // Best-effort: do not block on org lookup failure.
    }

    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(userId);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const buildResetLink = (token) =>
      portalSlug
        ? `${frontendBase}/${portalSlug}/reset-password/${token}`
        : `${frontendBase}/reset-password/${token}`;

    // Smart reuse: if user already has a valid reset token and forceNew is not true, return existing link
    const purpose = String(user.passwordless_token_purpose || '').toLowerCase();
    const expiresAt = user.passwordless_token_expires_at ? new Date(user.passwordless_token_expires_at) : null;
    const now = new Date();
    const hasValidExistingReset =
      user.passwordless_token &&
      purpose === 'reset' &&
      expiresAt &&
      expiresAt.getTime() > now.getTime() &&
      !forceNew;

    let tokenResult;
    let reused = false;
    if (hasValidExistingReset) {
      tokenResult = {
        token: user.passwordless_token,
        expiresAt: user.passwordless_token_expires_at
      };
      const hoursUntil = expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)) : 48;
      tokenResult.expiresInHours = hoursUntil;
      reused = true;
    } else {
      const finalExpiresInHours = expiresInHours ? parseInt(expiresInHours, 10) : 48;
      const finalHours = finalExpiresInHours < 1 ? 48 : finalExpiresInHours;
      tokenResult = await User.generatePasswordlessToken(userId, finalHours, 'reset');
      tokenResult.expiresInHours = finalHours;
    }

    const resetLink = buildResetLink(tokenResult.token);

    // Log that an admin sent (or re-sent) the reset link
    ActivityLogService.logActivity(
      {
        actionType: 'password_reset_link_sent',
        userId,
        metadata: {
          performedByUserId: req.user.id,
          performedByEmail: req.user.email || req.user.username,
          expiresAt: tokenResult.expiresAt,
          expiresInHours: tokenResult.expiresInHours
        }
      },
      req
    );

    let emailSent = false;
    if (sendEmail) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const EmailTemplateService = (await import('../services/emailTemplate.service.js')).default;
      const CommunicationLoggingService = (await import('../services/communicationLogging.service.js')).default;
      const EmailSenderIdentity = (await import('../models/EmailSenderIdentity.model.js')).default;
      const { sendEmailFromIdentity } = await import('../services/unifiedEmail/unifiedEmailSender.service.js');
      const EmailService = (await import('../services/email.service.js')).default;

      const agencyId = userAgencies?.[0]?.id || null;
      const agency = agencyId ? await Agency.findById(agencyId) : null;
      const to = [user.email, user.username, user.work_email, user.personal_email]
        .filter(Boolean)
        .map((e) => String(e).trim().toLowerCase())
        .find((e) => e.includes('@'));
      if (to) {
        let subject = 'Reset your password';
        let body = `Reset your password using this link (expires in ${tokenResult.expiresInHours} hours):\n${resetLink}\n\nIf you did not request this, you can ignore this email.`;
        try {
          const template =
            (await EmailTemplateService.getTemplateForAgency(agencyId, 'admin_initiated_password_reset')) ||
            (await EmailTemplateService.getTemplateForAgency(agencyId, 'password_reset'));
          if (template?.body) {
            const params = await EmailTemplateService.collectParameters(user, agency, {
              passwordlessToken: tokenResult.token,
              senderName: req.user.first_name || req.user.email || 'Admin'
            });
            const rendered = EmailTemplateService.renderTemplate(template, params);
            subject = rendered.subject || subject;
            body = rendered.body || body;
          }
        } catch {
          // keep default subject/body
        }
        let comm = null;
        try {
          comm = await CommunicationLoggingService.logGeneratedCommunication({
            userId: user.id,
            agencyId,
            templateType: 'admin_initiated_password_reset',
            templateId: null,
            subject,
            body,
            generatedByUserId: req.user.id,
            channel: 'email',
            recipientAddress: to
          });
        } catch {
          comm = null;
        }
        try {
          const list = await EmailSenderIdentity.list({
            agencyId,
            includePlatformDefaults: true,
            onlyActive: true
          });
          const preferredKeys = ['login_recovery', 'system', 'default', 'notifications'];
          let identity = null;
          for (const key of preferredKeys) {
            const hit = (list || []).find((i) => String(i?.identity_key || '').trim().toLowerCase() === key);
            if (hit) {
              identity = hit;
              break;
            }
          }
          identity = identity || (list || [])[0];
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
          if (comm?.id && sendResult?.id) {
            await CommunicationLoggingService.markAsSent(comm.id, sendResult.id, {
              fromEmail: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || null
            }).catch(() => {});
          }
          emailSent = true;
        } catch (err) {
          console.error('[sendResetPasswordLink] Failed to send email:', err);
        }
      }
    }

    res.json({
      token: tokenResult.token,
      tokenLink: resetLink,
      expiresAt: tokenResult.expiresAt,
      expiresInHours: tokenResult.expiresInHours,
      reused,
      emailSent,
      message: reused
        ? 'Existing reset password link returned (still valid).'
        : 'Reset password link generated successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const sendResetPasswordLinkSms = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    const { tokenLink } = req.body || {};

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Check permissions: Only admins/super_admins/support can send reset links via SMS
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // If Workspace login is required for this user, reset links are blocked unless admin override is enabled.
    try {
      const ssoState = await getSsoStateForUser(user);
      if (ssoState.ssoRequired) {
        return res.status(409).json({
          error: {
            message: 'Password reset is disabled by Workspace policy for this user. Enable admin password override first if an exception is required.'
          }
        });
      }
    } catch {
      // Best-effort: do not block on org lookup failure.
    }

    const phoneRaw = user.personal_phone || user.work_phone || user.phone_number || null;
    const to = User.normalizePhone(phoneRaw);
    if (!to) {
      return res.status(400).json({ error: { message: 'User does not have a valid phone number on file' } });
    }

    const from = process.env.TWILIO_AUTH_FROM || process.env.TWILIO_DEFAULT_FROM;
    if (!from) {
      return res.status(400).json({ error: { message: 'Missing TWILIO_AUTH_FROM (or TWILIO_DEFAULT_FROM) env var' } });
    }

    // If the UI already generated a link, send that exact link; otherwise generate a fresh one (48h)
    let linkToSend = tokenLink;
    if (!linkToSend) {
      const tokenResult = await User.generatePasswordlessToken(userId, 48, 'reset');
      const config = (await import('../config/config.js')).default;
      const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
      const userAgencies = await User.getAgencies(userId);
      const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
      linkToSend = portalSlug
        ? `${frontendBase}/${portalSlug}/reset-password/${tokenResult.token}`
        : `${frontendBase}/reset-password/${tokenResult.token}`;
    }

    const TwilioService = (await import('../services/twilio.service.js')).default;
    const body = `Reset your password using this link (expires in 48 hours): ${linkToSend}`;

    const msg = await TwilioService.sendSms({ to, from, body });

    res.json({
      message: 'Reset password link sent via SMS',
      to,
      sid: msg.sid
    });
  } catch (error) {
    next(error);
  }
};

export const getUserCredentials = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can view credentials
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    res.json({
      username: user.email, // Username is typically the email
      hasTemporaryPassword: !!user.temporary_password_hash,
      temporaryPasswordExpiresAt: user.temporary_password_expires_at,
      invitationToken: user.invitation_token,
      invitationTokenExpiresAt: user.invitation_token_expires_at
    });
  } catch (error) {
    next(error);
  }
};

export const getAccountInfo = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Users can view their own account info, admins can view any
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Block pending users from accessing account info (they should use dashboard only)
    if (user.status === 'pending' && parseInt(id) === req.user.id) {
      return res.status(403).json({ 
        error: { message: 'Account information is not available during the pre-hire process. Please use the dashboard to view your checklist items.' } 
      });
    }
    
    // Run expensive lookups in parallel to reduce wall time.
    const userIdInt = parseInt(id);
    const pool = (await import('../config/database.js')).default;

    const accountsPromise = UserAccount.findByUserId(id).catch((accountError) => {
      console.error('Error fetching user accounts:', accountError);
      return [];
    });

    const totalProgressPromise = UserChecklistAssignment.getUnifiedChecklist(userIdInt)
      .then((unifiedChecklist) => unifiedChecklist?.counts?.total || 0)
      .catch((checklistError) => {
        console.error('Error fetching unified checklist:', checklistError);
        return 0;
      });

    // Targeted lookup instead of loading every user_info_value row.
    const personalEmailPromise = (async () => {
      try {
        const [rows] = await pool.execute(
          `SELECT uiv.value
           FROM user_info_values uiv
           JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
           WHERE uiv.user_id = ?
             AND (
               uifd.field_key IN ('personal_email', 'personalEmail')
               OR LOWER(uifd.field_label) LIKE '%personal email%'
             )
           ORDER BY
             (uifd.field_key IN ('personal_email', 'personalEmail')) DESC,
             uifd.id ASC
           LIMIT 1`,
          [userIdInt]
        );
        const v = rows?.[0]?.value;
        return v !== undefined && v !== null && String(v).trim() ? String(v) : null;
      } catch (infoError) {
        console.error('Error fetching personal email from user info values:', infoError);
        return null;
      }
    })();

    const onboardingTimePromise = OnboardingDataService.getUserTrainingData(userIdInt)
      .then((trainingData) => {
        const totalTimeSeconds = (trainingData || []).reduce((sum, track) => sum + (track?.totalTimeSeconds || 0), 0);
        const totalTimeMinutes = Math.round(totalTimeSeconds / 60);
        const totalTimeHours = Math.floor(totalTimeMinutes / 60);
        const totalTimeMinutesRemainder = totalTimeMinutes % 60;
        return { totalTimeSeconds, totalTimeMinutes, totalTimeHours, totalTimeMinutesRemainder };
      })
      .catch((trainingError) => {
        console.error('Error fetching training data for account info:', trainingError);
        return { totalTimeSeconds: 0, totalTimeMinutes: 0, totalTimeHours: 0, totalTimeMinutesRemainder: 0 };
      });

    const supervisorsPromise = (async () => {
      try {
        const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
        const supervisorAssignments = await SupervisorAssignment.findBySupervisee(userIdInt);

        const supervisors = (supervisorAssignments || []).map((assignment) => ({
          id: assignment.supervisor_id,
          firstName: assignment.supervisor_first_name,
          lastName: assignment.supervisor_last_name,
          email: assignment.supervisor_email,
          workPhone: null,
          workPhoneExtension: null,
          agencyName: assignment.agency_name
        }));

        const ids = Array.from(new Set(supervisors.map((s) => Number(s.id)).filter((n) => Number.isInteger(n) && n > 0)));
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT id, work_phone, work_phone_extension
             FROM users
             WHERE id IN (${placeholders})`,
            ids
          );
          const byId = new Map((rows || []).map((r) => [Number(r.id), r]));
          for (const s of supervisors) {
            const r = byId.get(Number(s.id));
            if (!r) continue;
            s.workPhone = r.work_phone || null;
            s.workPhoneExtension = r.work_phone_extension || null;
          }
        }

        return supervisors;
      } catch (supervisorError) {
        console.error('Error fetching supervisor information:', supervisorError);
        return [];
      }
    })();

    // When user has a token, get purpose (findById may not include passwordless_token_purpose)
    const tokenPurposePromise = (async () => {
      if (!user.passwordless_token) return null;
      try {
        const [rows] = await pool.execute(
          "SELECT passwordless_token_purpose FROM users WHERE id = ?",
          [userIdInt]
        );
        return rows?.[0]?.passwordless_token_purpose ?? null;
      } catch {
        return null;
      }
    })();

    // Last "reset link sent" and "reset link used" from activity log (for admin reset-link UI)
    const resetLinkSentPromise = (async () => {
      try {
        const [rows] = await pool.execute(
          `SELECT created_at, metadata FROM user_activity_log
           WHERE user_id = ? AND action_type = 'password_reset_link_sent'
           ORDER BY created_at DESC LIMIT 1`,
          [userIdInt]
        );
        const row = rows?.[0];
        if (!row) return null;
        let meta = null;
        try {
          meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        } catch {
          meta = {};
        }
        return {
          resetLinkSentAt: row.created_at,
          resetLinkSentByUserId: meta?.performedByUserId ?? null,
          resetLinkSentByEmail: meta?.performedByEmail ?? null
        };
      } catch {
        return null;
      }
    })();

    const resetLinkUsedPromise = (async () => {
      try {
        const [rows] = await pool.execute(
          `SELECT created_at FROM user_activity_log
           WHERE user_id = ? AND action_type = 'login'
           AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.loginType')) = 'reset_password'
           ORDER BY created_at DESC LIMIT 1`,
          [userIdInt]
        );
        const row = rows?.[0];
        return row ? { resetLinkUsedAt: row.created_at } : null;
      } catch {
        return null;
      }
    })();

    const [accounts, totalProgress, personalEmail, onboardingTime, supervisors, tokenPurpose, resetLinkSent, resetLinkUsed] = await Promise.all([
      accountsPromise,
      totalProgressPromise,
      personalEmailPromise,
      onboardingTimePromise,
      supervisorsPromise,
      tokenPurposePromise,
      resetLinkSentPromise,
      resetLinkUsedPromise
    ]);

    if (tokenPurpose && user.passwordless_token) {
      user.passwordless_token_purpose = tokenPurpose;
    }

    // Has the user ever logged in?
    // Used to gate first-login credential options (temp password + reset link).
    let loginCount = 0;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS count
         FROM user_activity_log
         WHERE user_id = ? AND action_type = 'login'`,
        [userIdInt]
      );
      loginCount = parseInt(rows?.[0]?.count || 0, 10);
    } catch {
      loginCount = 0; // best-effort
    }

    // Best-effort: detect Google SSO policy + effective enforcement for this user.
    let ssoEnabled = false;
    let ssoPolicyRequired = false;
    let ssoPasswordOverride = false;
    let ssoRequired = false;
    try {
      const ssoState = await getSsoStateForUser(user);
      ssoEnabled = ssoState.ssoEnabled;
      ssoPolicyRequired = ssoState.ssoPolicyRequired;
      ssoPasswordOverride = ssoState.ssoPasswordOverride;
      ssoRequired = ssoState.ssoRequired;
    } catch {
      // best-effort
      ssoEnabled = false;
      ssoPolicyRequired = false;
      ssoPasswordOverride = false;
      ssoRequired = false;
    }
    
    const accountInfo = {
      loginEmail: user.email || user.work_email || 'Not provided',
      preferredName: user.preferred_name || null,
      title: user.title ?? null,
      serviceFocus: user.service_focus ?? null,
      personalEmail: personalEmail || user.personal_email || null,
      phoneNumber: user.phone_number || null, // Keep for backward compatibility
      personalPhone: user.personal_phone || null,
      workPhone: user.work_phone || null,
      workPhoneExtension: user.work_phone_extension || null,
      homeStreetAddress: user.home_street_address || null,
      homeAddressLine2: user.home_address_line2 || null,
      homeCity: user.home_city || null,
      homeState: user.home_state || null,
      homePostalCode: user.home_postal_code || null,
      totalProgress: totalProgress,
      totalOnboardingTime: {
        seconds: onboardingTime.totalTimeSeconds,
        minutes: onboardingTime.totalTimeMinutes,
        hours: onboardingTime.totalTimeHours,
        minutesRemainder: onboardingTime.totalTimeMinutesRemainder,
        formatted: onboardingTime.totalTimeHours > 0
          ? `${onboardingTime.totalTimeHours}h ${onboardingTime.totalTimeMinutesRemainder}m`
          : `${onboardingTime.totalTimeMinutes}m`
      },
      accounts: accounts,
      status: user.status,
      hasLoggedIn: loginCount > 0,
      neverLoggedIn: loginCount === 0,
      ssoEnabled,
      ssoPolicyRequired,
      ssoPasswordOverride,
      ssoRequired,
      supervisors: supervisors,
      hasSupervisorPrivileges: (user.role === 'admin' || user.role === 'super_admin' || user.role === 'clinical_practice_assistant' || user.role === 'provider_plus') 
        ? (user.has_supervisor_privileges || false) 
        : undefined, // Only include for eligible roles
      hasPayrollAccess: (await User.listPayrollAgencyIds(userIdInt)).length > 0,
      isHourlyWorker: !!(user.is_hourly_worker === 1 || user.is_hourly_worker === true || user.is_hourly_worker === '1'),
      hasHiringAccess: !!(user.has_hiring_access === 1 || user.has_hiring_access === true || user.has_hiring_access === '1'),
      companyCardEnabled: !!(user.company_card_enabled === 1 || user.company_card_enabled === true || user.company_card_enabled === '1'),
      skillBuilderEligible: !!(user.skill_builder_eligible === 1 || user.skill_builder_eligible === true || user.skill_builder_eligible === '1'),
      ...(resetLinkSent && {
        resetLinkSentAt: resetLinkSent.resetLinkSentAt,
        resetLinkSentByUserId: resetLinkSent.resetLinkSentByUserId,
        resetLinkSentByEmail: resetLinkSent.resetLinkSentByEmail
      }),
      ...(resetLinkUsed && { resetLinkUsedAt: resetLinkUsed.resetLinkUsedAt })
    };
    
    // For pending users, include passwordless login link (setup)
    if (user.status === 'pending' && user.passwordless_token) {
      const config = (await import('../config/config.js')).default;
      const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
      let portalSlug = null;
      try {
        const userAgencies = await User.getAgencies(user.id);
        portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
      } catch (e) {
        portalSlug = null;
      }
      accountInfo.passwordlessLoginLink = portalSlug
        ? `${frontendBase}/${portalSlug}/passwordless-login/${user.passwordless_token}`
        : `${frontendBase}/passwordless-login/${user.passwordless_token}`;
      accountInfo.passwordlessToken = user.passwordless_token;
      accountInfo.passwordlessTokenExpiresAt = user.passwordless_token_expires_at;
      accountInfo.requiresLastNameVerification = !user.pending_identity_verified;
      
      // Calculate time until expiration
      if (user.passwordless_token_expires_at) {
        const expiresAt = new Date(user.passwordless_token_expires_at);
        const now = new Date();
        const hoursUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        accountInfo.passwordlessTokenExpiresInHours = hoursUntilExpiry;
        accountInfo.passwordlessTokenIsExpired = hoursUntilExpiry <= 0;
      }
    }

    // For users with a reset token (admin-initiated or self-service), include reset link and expiration
    const purpose = user.passwordless_token_purpose || tokenPurpose;
    if (user.passwordless_token && purpose === 'reset') {
      const config = (await import('../config/config.js')).default;
      const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
      let portalSlug = null;
      try {
        const userAgencies = await User.getAgencies(user.id);
        portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
      } catch (e) {
        portalSlug = null;
      }
      accountInfo.passwordlessLoginLink = portalSlug
        ? `${frontendBase}/${portalSlug}/reset-password/${user.passwordless_token}`
        : `${frontendBase}/reset-password/${user.passwordless_token}`;
      accountInfo.passwordlessToken = user.passwordless_token;
      accountInfo.passwordlessTokenExpiresAt = user.passwordless_token_expires_at;
      accountInfo.passwordlessTokenPurpose = 'reset';
      if (user.passwordless_token_expires_at) {
        const expiresAt = new Date(user.passwordless_token_expires_at);
        const now = new Date();
        const hoursUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        accountInfo.passwordlessTokenExpiresInHours = hoursUntilExpiry;
        accountInfo.passwordlessTokenIsExpired = hoursUntilExpiry <= 0;
      }
    }
    
    res.json(accountInfo);
  } catch (error) {
    next(error);
  }
};

export const setSsoPasswordOverride = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const override = normalizeBoolFlag(req.body?.override);

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }

    // Only admins/super_admins/support can toggle this edge-case override.
    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(actorRole)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const [columns] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sso_password_override'"
    );
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(409).json({
        error: {
          message: 'Database is missing users.sso_password_override. Run the latest migration before using this override.'
        }
      });
    }

    await pool.execute('UPDATE users SET sso_password_override = ? WHERE id = ?', [override ? 1 : 0, userId]);

    const refreshed = await User.findById(userId);
    const ssoState = await getSsoStateForUser(refreshed || user).catch(() => ({
      ssoEnabled: false,
      ssoPolicyRequired: false,
      ssoPasswordOverride: override,
      ssoRequired: false
    }));

    res.json({
      message: override
        ? 'Password login override enabled for this user.'
        : 'Password login override disabled; Workspace policy is enforced again.',
      ssoEnabled: ssoState.ssoEnabled,
      ssoPolicyRequired: ssoState.ssoPolicyRequired,
      ssoPasswordOverride: ssoState.ssoPasswordOverride,
      ssoRequired: ssoState.ssoRequired
    });
  } catch (error) {
    next(error);
  }
};

export const downloadCompletionPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Users can download their own package, admins can download any
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Generate completion package
    const zipPath = await CompletionPackageService.generateCompletionPackage(parseInt(id));
    
    // Read zip file
    const zipBuffer = await fs.readFile(zipPath);
    
    // Clean up zip file
    await fs.unlink(zipPath).catch(() => {});
    
    // Send zip file
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
    const filename = `completion-package-${userName.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (error) {
    console.error('downloadCompletionPackage: Error:', error);
    next(error);
  }
};

export const getOnboardingChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Users can view their own checklist, admins can view any
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const checklist = await OnboardingChecklist.getUserChecklist(id);
    const completionPercentage = await OnboardingChecklist.getCompletionPercentage(id);
    
    res.json({
      items: checklist,
      completionPercentage
    });
  } catch (error) {
    next(error);
  }
};

export const markChecklistItemComplete = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    
    // Users can only mark their own items complete
    if (parseInt(id) !== req.user.id) {
      return res.status(403).json({ error: { message: 'You can only update your own checklist' } });
    }
    
    const item = await OnboardingChecklist.markItemComplete(id, itemId);
    if (!item) {
      return res.status(404).json({ error: { message: 'Checklist item not found' } });
    }
    
    const completionPercentage = await OnboardingChecklist.getCompletionPercentage(id);
    
    res.json({
      item,
      completionPercentage
    });
  } catch (error) {
    next(error);
  }
};

export const markUserComplete = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins/support can mark users as complete
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Verify user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Allow admins to convert a PENDING_SETUP user directly to ACTIVE_EMPLOYEE (current employee).
    // Note: This does NOT set/changing passwords. Use reset-password link flow for that.
    if (user.status === 'PENDING_SETUP') {
      const pool = (await import('../config/database.js')).default;
      await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [parseInt(id)]);
      try {
        await User.generatePasswordlessToken(parseInt(id), 48);
      } catch {
        // If token flow isn't available in older DBs, skip
      }

      const updatedUser = await User.updateStatus(parseInt(id), 'ACTIVE_EMPLOYEE', req.user.id);
      return res.json({
        message: 'User marked as active employee',
        user: updatedUser
      });
    }
    
    // Admins can mark PREHIRE_OPEN, PREHIRE_REVIEW, ONBOARDING, or ACTIVE_EMPLOYEE users as ACTIVE_EMPLOYEE
    // If in earlier statuses, we'll move them through the flow automatically
    if (user.status === 'PREHIRE_OPEN' || user.status === 'PREHIRE_REVIEW') {
      // For PREHIRE_OPEN users, first move to PREHIRE_REVIEW, then to ONBOARDING, then to ACTIVE_EMPLOYEE
      // For PREHIRE_REVIEW users, move to ONBOARDING, then to ACTIVE_EMPLOYEE
      
      // If PREHIRE_OPEN, we need to complete the pre-hire process first
      if (user.status === 'PREHIRE_OPEN') {
        // Check if all items are complete
        const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
        const completionCheck = await PendingCompletionService.checkAllChecklistItemsComplete(parseInt(id));
        if (!completionCheck.allComplete) {
          return res.status(400).json({ 
            error: { 
              message: 'Cannot mark as completed: Not all pre-hire checklist items are completed.',
              incompleteCount: completionCheck.incompleteCount
            } 
          });
        }
        
        // Mark pre-hire as complete (sets to PREHIRE_REVIEW)
        await PendingCompletionService.processPendingCompletion(parseInt(id), false);
      }
      
      // Now move PREHIRE_REVIEW to ONBOARDING (requires onboarding package assignment)
      // For admin-initiated completion, we'll skip to ACTIVE_EMPLOYEE if work email is set
      const workEmail = user.work_email || user.email;
      if (!workEmail) {
        return res.status(400).json({ 
          error: { 
            message: 'Work email is required. Please set the work email first.',
            requiresWorkEmail: true
          } 
        });
      }
      
      // Set work email if not already set
      if (!user.work_email) {
        await User.setWorkEmail(parseInt(id), workEmail);
        const pool = (await import('../config/database.js')).default;
        await pool.execute('UPDATE users SET email = ? WHERE id = ?', [workEmail, parseInt(id)]);
      }
      
      // Move through ONBOARDING to ACTIVE_EMPLOYEE
      // First set to ONBOARDING if in PREHIRE_REVIEW
      if (user.status === 'PREHIRE_REVIEW') {
        await User.updateStatus(parseInt(id), 'ONBOARDING', req.user.id);
      }
    }
    
    // Now mark as ACTIVE_EMPLOYEE (user should be in ONBOARDING or ACTIVE_EMPLOYEE at this point)
    const currentUser = await User.findById(id);
    if (currentUser.status !== 'ONBOARDING' && currentUser.status !== 'ACTIVE_EMPLOYEE') {
      return res.status(400).json({ 
        error: { 
          message: `User is in ${currentUser.status} status. Cannot mark as active employee. User must be in ONBOARDING status.`,
          currentStatus: currentUser.status
        } 
      });
    }
    
    const updatedUser = await User.updateStatus(id, 'ACTIVE_EMPLOYEE', req.user.id);
    if (!updatedUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    try {
      const { enforceWorkspaceLoginForUser } = await import('../services/workspaceLoginTransition.service.js');
      await enforceWorkspaceLoginForUser(updatedUser);
    } catch (e) {
      console.warn('Workspace login enforcement failed:', e?.message || e);
    }
    
    // Create onboarding completed notification for each agency the user belongs to
    try {
      const userAgencies = await User.getAgencies(id);
      for (const agency of userAgencies) {
        await NotificationService.createOnboardingCompletedNotification(id, agency.id);
      }
    } catch (notificationError) {
      // Log error but don't fail the request
      console.error('Error creating onboarding completed notification:', notificationError);
    }
    
    res.json({
      message: 'User marked as active employee',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

export const promoteToOnboarding = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can promote users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Verify user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Validate user is in PREHIRE_REVIEW status
    if (user.status !== 'PREHIRE_REVIEW') {
      return res.status(400).json({ 
        error: { 
          message: `User is in ${user.status} status. Can only promote users from PREHIRE_REVIEW status.`,
          currentStatus: user.status
        } 
      });
    }

    if (!user.work_email) {
      return res.status(400).json({
        error: {
          message: 'Work email is required before enabling onboarding access.',
          requiresWorkEmail: true
        }
      });
    }
    
    // Update status to ONBOARDING
    const updatedUser = await User.updateStatus(id, 'ONBOARDING', req.user.id);
    if (!updatedUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    try {
      const { enableWorkspaceLoginForUser } = await import('../services/workspaceLoginTransition.service.js');
      await enableWorkspaceLoginForUser(user);
    } catch (e) {
      console.warn('Workspace login enable failed:', e?.message || e);
    }
    
    // Note: Package assignment should be done separately via package assignment endpoint
    // The status change will be triggered when an onboarding package is assigned
    
    res.json({
      message: 'User promoted to onboarding status',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

const VALID_EMPLOYEE_STATUSES = [
  'PROSPECTIVE',
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'ARCHIVED'
];

export const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    // Only admins/super_admins/support can change status
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: { message: 'Status is required' } });
    }

    const statusUpper = String(status).trim().toUpperCase();
    if (!VALID_EMPLOYEE_STATUSES.includes(statusUpper)) {
      return res.status(400).json({
        error: {
          message: `Invalid status. Must be one of: ${VALID_EMPLOYEE_STATUSES.join(', ')}`,
          validStatuses: VALID_EMPLOYEE_STATUSES
        }
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Guard: do not allow changing status of superadmin account (unless actor is super_admin)
    if (user.email === 'superadmin@plottwistco.com' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Cannot change status of superadmin account' } });
    }

    // School staff and guardians only need active and archived
    const roleNorm = String(user.role || '').toLowerCase();
    const restrictedRoles = ['school_staff', 'client_guardian'];
    if (restrictedRoles.includes(roleNorm)) {
      const allowedStatuses = ['ACTIVE_EMPLOYEE', 'ARCHIVED'];
      if (!allowedStatuses.includes(statusUpper)) {
        return res.status(400).json({
          error: {
            message: `${roleNorm.replace('_', ' ')} can only be set to: ${allowedStatuses.join(', ')}`,
            validStatuses: allowedStatuses
          }
        });
      }
    }

    const updatedUser = await User.updateStatus(id, statusUpper, req.user.id);
    if (!updatedUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Optional side effects for specific transitions
    if (statusUpper === 'ONBOARDING') {
      try {
        const { enableWorkspaceLoginForUser } = await import('../services/workspaceLoginTransition.service.js');
        await enableWorkspaceLoginForUser(updatedUser);
      } catch (e) {
        console.warn('Workspace login enable failed:', e?.message || e);
      }
    } else if (statusUpper === 'ACTIVE_EMPLOYEE') {
      try {
        const { enforceWorkspaceLoginForUser } = await import('../services/workspaceLoginTransition.service.js');
        await enforceWorkspaceLoginForUser(updatedUser);
      } catch (e) {
        console.warn('Workspace login enforcement failed:', e?.message || e);
      }
      try {
        const userAgencies = await User.getAgencies(id);
        for (const agency of userAgencies || []) {
          await NotificationService.createOnboardingCompletedNotification(id, agency.id);
        }
      } catch (notificationError) {
        console.error('Onboarding completed notification failed:', notificationError);
      }
    }

    res.json({
      message: 'User status updated',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

export const createCurrentEmployee = async (req, res, next) => {
  try {
    // Only admins/super_admins can create current employees
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const { firstName, lastName, workEmail, agencyId, role, billingAcknowledged, organizationIds } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !workEmail || !agencyId) {
      return res.status(400).json({ 
        error: { message: 'First name, last name, work email, and agency ID are required' } 
      });
    }

    // Check if user with this work email already exists
    const existingUser = await User.findByWorkEmail(workEmail.trim());
    if (existingUser) {
      return res.status(400).json({ 
        error: { message: 'A user with this work email already exists' } 
      });
    }

    // Check if email exists in users table
    const existingEmail = await User.findByEmail(workEmail.trim());
    if (existingEmail) {
      return res.status(400).json({ 
        error: { message: 'A user with this email already exists' } 
      });
    }

    const pool = (await import('../config/database.js')).default;
    const bcrypt = (await import('bcrypt')).default;

    // Create user directly in ACTIVE_EMPLOYEE status (skips PENDING_SETUP, PREHIRE_OPEN, PREHIRE_REVIEW, ONBOARDING)
    const normalizeRole = (r) => {
      const v = String(r || '').trim().toLowerCase();
      if (!v) return 'provider';
      if (v === 'intern' || v === 'facilitator') return 'provider';
      if (v === 'supervisor') return 'provider';
      return v;
    };
    const finalRole = normalizeRole(role || 'provider');

    // Billing hard gate: adding an admin beyond included requires acknowledgement
    if (finalRole === 'admin') {
      const { getAdminAddBillingImpact } = await import('../services/adminBillingGate.service.js');
      const impact = await getAdminAddBillingImpact(parseInt(agencyId, 10), { deltaAdmins: 1 });
      if (impact && billingAcknowledged !== true) {
        return res.status(409).json({
          error: { message: 'Billing acknowledgement required.' },
          billingImpact: { code: 'ADMIN_OVERAGE', impacts: [{ agencyId: parseInt(agencyId, 10), ...impact }] }
        });
      }
    }
    
    // Create user with work email as username and email
    const user = await User.create({
      email: workEmail.trim(),
      passwordHash: null, // Will be set via passwordless token
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      personalEmail: null, // Current employees don't need personal email
      role: finalRole,
      status: 'ACTIVE_EMPLOYEE' // Skip all earlier statuses
    });

    // Set work email
    await User.setWorkEmail(user.id, workEmail.trim());
    await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [workEmail.trim(), workEmail.trim(), user.id]);

    // Assign to agency
    await User.assignToAgency(user.id, parseInt(agencyId));

    // Optional: assign to affiliated orgs (schools/programs/learning) under the same agency.
    try {
      const orgIds = Array.isArray(organizationIds)
        ? organizationIds.map((v) => parseInt(String(v), 10)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
      if (orgIds.length) {
        const AgencySchool = (await import('../models/AgencySchool.model.js')).default;
        const OrganizationAffiliation = (await import('../models/OrganizationAffiliation.model.js')).default;
        const targetAgencyId = parseInt(agencyId, 10);

        for (const orgId of orgIds) {
          let parent = null;
          try {
            parent = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
          } catch {
            parent = null;
          }
          if (!parent) {
            try {
              parent = await AgencySchool.getActiveAgencyIdForSchool(orgId);
            } catch {
              parent = null;
            }
          }
          if (parent && Number(parent) !== Number(targetAgencyId)) {
            // Skip orgs that belong to a different agency to prevent accidental cross-assignment.
            continue;
          }
          try {
            await User.assignToAgency(user.id, orgId);
          } catch {
            // ignore duplicates or failures; agency assignment is the primary requirement
          }
        }
      }
    } catch {
      // ignore
    }

    // Generate passwordless token for password setup (48 hours expiration)
    const passwordlessTokenResult = await User.generatePasswordlessToken(user.id, 48);
    const frontendBase = ((await import('../config/config.js')).default.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(user.id);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const passwordlessTokenLink = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${passwordlessTokenResult.token}`
      : `${frontendBase}/passwordless-login/${passwordlessTokenResult.token}`;

    // Get agency info for response
    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(parseInt(agencyId));

    res.status(201).json({
      message: 'Current employee created successfully',
      user: {
        id: user.id,
        email: workEmail.trim(),
        username: workEmail.trim(),
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status
      },
      passwordlessToken: passwordlessTokenResult.token,
      passwordlessTokenLink: passwordlessTokenLink,
      agencyName: agency?.name || 'Unknown'
    });
  } catch (error) {
    next(error);
  }
};

export const markUserTerminated = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can mark users as terminated
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Set status to TERMINATED_PENDING with termination_date
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    
    const pool = (await import('../config/database.js')).default;
    await pool.execute(
      `UPDATE users 
       SET status = 'TERMINATED_PENDING',
           terminated_at = ?,
           termination_date = ?,
           status_expires_at = ?
       WHERE id = ?`,
      [now, now, expiresAt, id]
    );
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    res.json({
      message: 'User marked as terminated. Access will expire in 7 days.',
      user,
      expiresAt: user.status_expires_at,
      terminationDate: user.termination_date
    });
  } catch (error) {
    next(error);
  }
};

export const markUserActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { workEmail } = req.body; // Required corporate email/username when moving from ready_for_review to active
    
    // Only admins/super_admins/support can activate users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Get current user status
    const currentUser = await User.findById(id);
    if (!currentUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // If user is pending or ready_for_review, we need to set up credentials
    if (currentUser.status === 'pending' || currentUser.status === 'ready_for_review') {
      // For pending users, check if all items are complete
      if (currentUser.status === 'pending') {
        const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
        const completionCheck = await PendingCompletionService.checkAllChecklistItemsComplete(parseInt(id));
        if (!completionCheck.allComplete) {
          return res.status(400).json({ 
            error: { 
              message: 'Cannot activate: Not all pre-hire checklist items are completed.',
              incompleteCount: completionCheck.incompleteCount,
              requiresCompletion: true
            } 
          });
        }
        
        // Mark pending as complete (sets to ready_for_review)
        await PendingCompletionService.processPendingCompletion(parseInt(id), false);
      }
      
      // Now handle ready_for_review -> active transition
      // Username (corporate email) is required - this changes from personal email to corporate email
      const newUsername = workEmail; // workEmail parameter is now the new corporate username
      if (!newUsername || !newUsername.trim()) {
        return res.status(400).json({ 
          error: { 
            message: 'Corporate email (username) is required to activate this user. Please provide a corporate email.',
            requiresUsername: true
          } 
        });
      }
      
      // Check if new username already exists
      const existingUserWithUsername = await User.findByUsername(newUsername.trim());
      if (existingUserWithUsername && existingUserWithUsername.id !== parseInt(id)) {
        return res.status(400).json({ error: { message: 'This username is already in use' } });
      }
      const existingUserWithEmail = await User.findByEmail(newUsername.trim());
      if (existingUserWithEmail && existingUserWithEmail.id !== parseInt(id)) {
        return res.status(400).json({ error: { message: 'This email is already in use' } });
      }
      
      // Update username to corporate email (preserves personal_email, preserves user ID)
      await User.updateUsername(parseInt(id), newUsername.trim());
      
      // Also set work_email for backward compatibility
      await User.setWorkEmail(parseInt(id), newUsername.trim());
      
      // Generate temporary password (48 hours expiration)
      const bcrypt = (await import('bcrypt')).default;
      const tempPassword = await User.generateTemporaryPassword();
      const tempPasswordHash = await bcrypt.hash(tempPassword, 10);
      
      // Set temporary password
      await User.setTemporaryPassword(parseInt(id), tempPassword, 48);
      
      // Set user password hash
      await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [tempPasswordHash, parseInt(id)]);
      
      // Generate new passwordless token (48 hours expiration for active users)
      await User.generatePasswordlessToken(parseInt(id), 48);
    }
    
    // Update status to active
    const user = await User.updateStatus(id, 'active', req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Remove user from approved_employee_emails when they become active again
    // They should use their regular user account, not the approved employee access
    const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
    const pool = (await import('../config/database.js')).default;
    
    // Get all approved employee entries for this user's email
    const [employeeEntries] = await pool.execute(
      'SELECT id, password_hash FROM approved_employee_emails WHERE email = ?',
      [user.email]
    );
    
    // If user doesn't have a password_hash in users table, copy it from approved_employee_emails
    // This ensures they can login with the password they were using as an approved employee
    if (!user.password_hash && employeeEntries.length > 0) {
      const employeePasswordHash = employeeEntries[0].password_hash;
      if (employeePasswordHash) {
        await pool.execute(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [employeePasswordHash, id]
        );
      }
    }
    
    // Delete all approved employee entries for this user
    for (const entry of employeeEntries) {
      await ApprovedEmployee.delete(entry.id);
    }
    
    res.json({
      message: 'User account reactivated and removed from approved employee list',
      user: await User.findById(id)
    });
  } catch (error) {
    next(error);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can deactivate users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const deactivated = await User.deactivate(parseInt(id));
    if (!deactivated) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    const user = await User.findById(parseInt(id));
    
    // If user is deactivated and not terminated/archived, ensure they're in approved employees list
    if (user && user.status !== 'terminated' && (!user.is_archived || user.is_archived === 0)) {
      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const Agency = (await import('../models/Agency.model.js')).default;
      const pool = (await import('../config/database.js')).default;
      
      // Get user's agencies
      const userAgencies = await User.getAgencies(parseInt(id));
      
      for (const agency of userAgencies) {
        // Check if email already exists in approved_employee_emails for this agency (including inactive ones)
        const [existingRows] = await pool.execute(
          'SELECT * FROM approved_employee_emails WHERE email = ? AND agency_id = ?',
          [user.email, agency.id]
        );
        
        if (existingRows.length === 0) {
          // Get agency to check for company default password
          const agencyData = await Agency.findById(agency.id);
          let passwordHash = null;

          if (agencyData && agencyData.company_default_password_hash) {
            passwordHash = agencyData.company_default_password_hash;
          } else {
            // Generate a temporary password hash if no company default
            const bcrypt = (await import('bcrypt')).default;
            const tempPassword = `temp_${user.id}_${Date.now()}`;
            passwordHash = await bcrypt.hash(tempPassword, 10);
          }

          // Add to approved_employee_emails
          await ApprovedEmployee.create({
            email: user.email,
            agencyId: agency.id,
            requiresVerification: false,
            passwordHash: passwordHash
          });
        } else {
          // Entry already exists - just ensure it's active
          const existing = existingRows[0];
          if (!existing.is_active) {
            await pool.execute(
              'UPDATE approved_employee_emails SET is_active = TRUE WHERE id = ?',
              [existing.id]
            );
          }
        }
      }
    }
    
    res.json({
      message: 'User deactivated successfully',
      user
    });
  } catch (error) {
    next(error);
  }
};

export const getOnboardingDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    
    console.log(`getOnboardingDocument: Generating document for user ${userId}`);
    
    // Users can download their own document, admins can download any
    if (userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    console.log(`getOnboardingDocument: User found: ${user.first_name} ${user.last_name}`);
    
    try {
      const OnboardingPdfService = (await import('../services/onboardingPdf.service.js')).default;
      console.log('getOnboardingDocument: Starting PDF generation...');
      const pdfBytes = await OnboardingPdfService.generateOnboardingDocument(userId);
      
      // Verify pdfBytes is valid
      if (!pdfBytes) {
        throw new Error('PDF generation returned null or undefined');
      }
      
      if (!(pdfBytes instanceof Uint8Array) && !Buffer.isBuffer(pdfBytes)) {
        console.error('getOnboardingDocument: pdfBytes is not a valid type:', typeof pdfBytes, pdfBytes.constructor.name);
        throw new Error('PDF generation returned invalid data type');
      }
      
      console.log(`getOnboardingDocument: PDF generated successfully, size: ${pdfBytes.length} bytes`);
      console.log(`getOnboardingDocument: PDF bytes type: ${pdfBytes.constructor.name}`);
      
      const filename = `onboarding-document-${user.first_name}-${user.last_name}-${Date.now()}.pdf`;
      
      // Ensure we're sending binary data, not JSON
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBytes.length);
      
      // Send as Buffer if it's a Uint8Array
      if (pdfBytes instanceof Uint8Array && !Buffer.isBuffer(pdfBytes)) {
        res.send(Buffer.from(pdfBytes));
      } else {
        res.send(pdfBytes);
      }
    } catch (pdfError) {
      console.error('getOnboardingDocument: Error generating PDF:', pdfError);
      console.error('getOnboardingDocument: Error stack:', pdfError.stack);
      
      // Make sure we're sending JSON, not trying to send error as PDF
      if (!res.headersSent) {
        return res.status(500).json({ 
          error: { 
            message: 'Failed to generate onboarding document',
            details: pdfError.message 
          } 
        });
      }
    }
  } catch (error) {
    console.error('getOnboardingDocument: Unexpected error:', error);
    console.error('getOnboardingDocument: Error stack:', error.stack);
    next(error);
  }
};

export const markPendingComplete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    const requestingUserId = req.user.id;
    
    // Verify user exists and is pending
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Check if user is requesting their own completion or if requester is admin/support
    const isSelfRequest = userId === requestingUserId;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support';
    
    if (!isSelfRequest && !isAdmin) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    if (user.status !== 'pending') {
      if (user.status === 'ready_for_review') {
        return res.status(400).json({ 
          error: { 
            message: 'You have already completed the pre-hire process. Your account is now ready for review by your administrator.',
            status: 'ready_for_review'
          } 
        });
      }
      return res.status(400).json({ error: { message: 'User is not in pending status' } });
    }
    
    // Check if access is already locked
    if (user.pending_access_locked) {
      return res.status(400).json({ 
        error: { 
          message: 'The pre-hire process has already been completed. Your account is ready for review.',
          status: 'ready_for_review'
        } 
      });
    }
    
    // Use service to process completion
    const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
    const result = await PendingCompletionService.processPendingCompletion(userId, false);
    
    res.json({
      message: 'Pre-hire process marked as complete',
      ...result
    });
  } catch (error) {
    console.error('Error in markPendingComplete:', error);
    if (error.message.includes('Not all checklist items')) {
      return res.status(400).json({ error: { message: error.message } });
    }
    if (error.message.includes('User is not in pending status')) {
      return res.status(400).json({ 
        error: { 
          message: 'You have already completed the pre-hire process. Your account is now ready for review by your administrator.',
          status: 'ready_for_review'
        } 
      });
    }
    next(error);
  }
};

export const checkPendingCompletionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    if (user.status !== 'pending') {
      return res.json({
        isPending: false,
        allComplete: false,
        message: 'User is not in pending status'
      });
    }
    
    // Check completion status
    const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
    const completionCheck = await PendingCompletionService.checkAllChecklistItemsComplete(userId);
    
    // Get last completion time
    const lastCompletion = await PendingCompletionService.getLastCompletionTime(userId);
    let autoCompleteTime = null;
    if (lastCompletion) {
      autoCompleteTime = new Date(lastCompletion.getTime() + 24 * 60 * 60 * 1000);
    }
    
    res.json({
      isPending: true,
      allComplete: completionCheck.allComplete,
      incompleteCount: completionCheck.incompleteCount,
      details: completionCheck.details,
      lastCompletionTime: lastCompletion,
      autoCompleteTime: autoCompleteTime,
      accessLocked: user.pending_access_locked || false
    });
  } catch (error) {
    next(error);
  }
};

export const movePendingToActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { workEmail, personalEmail, templateId } = req.body;
    const userId = parseInt(id);
    
    // Only admins/super_admins/support can mark users as reviewed and activated
    // CPAs and supervisors have view-only access
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Only admins, super admins, or support can mark users as reviewed and activated' } });
    }
    
    if (!workEmail || !workEmail.trim()) {
      return res.status(400).json({ error: { message: 'Work email is required' } });
    }
    
    // Verify user exists and is in ready_for_review status
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    if (user.status !== 'ready_for_review') {
      return res.status(400).json({ error: { message: 'User is not in ready_for_review status' } });
    }
    
    // Check if work email already exists
    const existingUserWithWorkEmail = await User.findByWorkEmail(workEmail.trim());
    if (existingUserWithWorkEmail && existingUserWithWorkEmail.id !== userId) {
      return res.status(400).json({ error: { message: 'Work email is already in use' } });
    }
    // Also check primary email field
    const existingUserWithEmail = await User.findByEmail(workEmail.trim());
    if (existingUserWithEmail && existingUserWithEmail.id !== userId) {
      return res.status(400).json({ error: { message: 'This email is already in use' } });
    }
    
    // Set work email and update primary email
    await User.setWorkEmail(userId, workEmail.trim());
    const pool = (await import('../config/database.js')).default;
    await pool.execute(
      'UPDATE users SET email = ? WHERE id = ?',
      [workEmail.trim(), userId]
    );
    
    // Set personal email if provided
    if (personalEmail && personalEmail.trim()) {
      await pool.execute(
        'UPDATE users SET personal_email = ? WHERE id = ?',
        [personalEmail.trim(), userId]
      );
    }
    
    // Generate temporary password (48 hours expiration)
    const bcrypt = (await import('bcrypt')).default;
    const tempPassword = await User.generateTemporaryPassword();
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);
    
    // Set temporary password
    await User.setTemporaryPassword(userId, tempPassword, 48);
    
    // Update user password hash
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [tempPasswordHash, userId]
    );
    
    // Generate new passwordless token (48 hours expiration for active users)
    const passwordlessTokenResult = await User.generatePasswordlessToken(userId, 48);
    
    // Change status to active
    await User.updateStatus(userId, 'active', req.user.id);
    
    // Get updated user
    const updatedUser = await User.findById(userId);
    
    // Generate email with credentials (using email template service)
    const EmailTemplateService = (await import('../services/emailTemplate.service.js')).default;
    const config = (await import('../config/config.js')).default;
    
    // Get agency info for branding
    let agencyName = 'Your Agency';
    let peopleOpsEmail = 'support@example.com';
    const userAgencies = await User.getAgencies(userId);
    if (userAgencies.length > 0) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const agency = await Agency.findById(userAgencies[0].id);
      if (agency) {
        agencyName = agency.name;
        peopleOpsEmail = agency.people_ops_email || peopleOpsEmail;
      }
    }
    
    let generatedEmail = null;
    let emailSubject = null;
    try {
      // Get the template - use selected template ID if provided, otherwise use default lookup
      let template = null;
      if (templateId) {
        const EmailTemplate = (await import('../models/EmailTemplate.model.js')).default;
        template = await EmailTemplate.findById(parseInt(templateId));
        // Verify template is a welcome type (accept both user_welcome and welcome_active)
        if (template && template.type !== 'welcome_active' && template.type !== 'user_welcome') {
          template = null; // Invalid template type, fall back to default
        }
      }
      
      // If no template selected or invalid, use default lookup
      // Try welcome_active first, then fall back to user_welcome
      if (!template) {
        template = await EmailTemplateService.getTemplateForAgency(
          userAgencies.length > 0 ? userAgencies[0].id : null,
          'welcome_active'
        );
        // If no welcome_active template, try user_welcome
        if (!template) {
          template = await EmailTemplateService.getTemplateForAgency(
            userAgencies.length > 0 ? userAgencies[0].id : null,
            'user_welcome'
          );
        }
      }
      
      if (template && template.body) {
        // Get base parameters
        const parameters = {
          FIRST_NAME: user.first_name,
          LAST_NAME: user.last_name,
          AGENCY_NAME: agencyName,
          PORTAL_LOGIN_LINK: passwordlessTokenLink,
          RESET_TOKEN_LINK: passwordlessTokenLink,
          PORTAL_URL: config.frontendUrl,
          USERNAME: workEmail.trim(),
          TEMP_PASSWORD: tempPassword,
          PEOPLE_OPS_EMAIL: peopleOpsEmail,
          SENDER_NAME: (await User.findById(req.user.id))?.first_name || 'Administrator'
        };
        
        // Add custom parameters from user info fields
        try {
          const UserInfoValue = (await import('../models/UserInfoValue.model.js')).default;
          const userInfoSummary = await UserInfoValue.getUserInfoSummary(userId, userAgencies.length > 0 ? userAgencies[0].id : null);
          
          // Add each user info field as a parameter (using field_key as parameter name)
          for (const field of userInfoSummary) {
            if (field.value && field.field_key) {
              // Convert field_key to UPPER_SNAKE_CASE for template parameter
              const paramName = field.field_key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
              parameters[paramName] = field.value;
            }
          }
        } catch (userInfoError) {
          console.error('Error loading user info fields for template:', userInfoError);
          // Continue without custom user info fields
        }
        
        // Add custom parameters from agency fields
        try {
          if (userAgencies.length > 0) {
            const Agency = (await import('../models/Agency.model.js')).default;
            const agency = await Agency.findById(userAgencies[0].id);
            if (agency) {
              // Add all existing agency fields as parameters
              if (agency.name) {
                parameters.AGENCY_NAME = agency.name;
              }
              if (agency.onboarding_team_email) {
                parameters.PEOPLE_OPS_EMAIL = agency.onboarding_team_email;
              }
              if (agency.phone_number) {
                parameters.AGENCY_PHONE = agency.phone_number;
                if (agency.phone_extension) {
                  parameters.AGENCY_PHONE_EXTENSION = agency.phone_extension;
                  parameters.AGENCY_PHONE_FULL = `${agency.phone_number} ext. ${agency.phone_extension}`;
                } else {
                  parameters.AGENCY_PHONE_FULL = agency.phone_number;
                }
              }
              if (agency.portal_url) {
                parameters.AGENCY_PORTAL_URL = agency.portal_url;
              }
              if (agency.slug) {
                parameters.AGENCY_SLUG = agency.slug;
              }
              if (agency.logo_url) {
                parameters.AGENCY_LOGO_URL = agency.logo_url;
              }
              
              // Add custom agency parameters from a JSON field if it exists
              // Check if agencies table has a custom_parameters JSON column
              try {
                const pool = (await import('../config/database.js')).default;
                const [columns] = await pool.execute(
                  "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'custom_parameters'"
                );
                
                if (columns.length > 0) {
                  // Custom parameters column exists, load it
                  const [customRows] = await pool.execute(
                    'SELECT custom_parameters FROM agencies WHERE id = ?',
                    [userAgencies[0].id]
                  );
                  
                  if (customRows.length > 0 && customRows[0].custom_parameters) {
                    let customParams = {};
                    try {
                      customParams = typeof customRows[0].custom_parameters === 'string' 
                        ? JSON.parse(customRows[0].custom_parameters)
                        : customRows[0].custom_parameters;
                      
                      // Add each custom parameter (convert keys to UPPER_SNAKE_CASE)
                      for (const [key, value] of Object.entries(customParams)) {
                        if (value !== null && value !== undefined) {
                          const paramName = key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
                          parameters[`AGENCY_${paramName}`] = String(value);
                        }
                      }
                    } catch (parseError) {
                      console.error('Error parsing custom_parameters JSON:', parseError);
                    }
                  }
                }
              } catch (customParamError) {
                // Column doesn't exist yet, that's okay - we'll create it in a migration
                console.log('Custom parameters column not found - will be available after migration');
              }
            }
          }
        } catch (agencyError) {
          console.error('Error loading agency fields for template:', agencyError);
          // Continue without custom agency fields
        }
        
        const rendered = EmailTemplateService.renderTemplate(template, parameters);
        generatedEmail = rendered.body;
        emailSubject = rendered.subject || template.subject || 'Your Account Credentials';
      } else {
        // Fallback if template doesn't exist
        const senderUser = await User.findById(req.user.id);
        const senderName = senderUser?.first_name || 'Administrator';
        generatedEmail = `Hello ${user.first_name} ${user.last_name},\n\nWelcome to ${agencyName}!\n\nYour account has been activated. Here are your login credentials:\n\nUsername: ${workEmail.trim()}\nTemporary Password: ${tempPassword}\n\nYou can log in using the link below, which will allow you to set your own password:\n${passwordlessTokenLink}\n\nThis link will expire in 48 hours.\n\nIf you have any questions, please contact ${peopleOpsEmail}.\n\nBest regards,\n${senderName}`;
        emailSubject = 'Your Account Credentials';
      }
    } catch (emailError) {
      console.error('Error generating email:', emailError);
      // Fallback email if template rendering fails
      const senderUser = await User.findById(req.user.id);
      const senderName = senderUser?.first_name || 'Administrator';
      generatedEmail = `Hello ${user.first_name} ${user.last_name},\n\nWelcome to ${agencyName}!\n\nYour account has been activated. Here are your login credentials:\n\nUsername: ${workEmail.trim()}\nTemporary Password: ${tempPassword}\n\nYou can log in using the link below, which will allow you to set your own password:\n${passwordlessTokenLink}\n\nThis link will expire in 48 hours.\n\nIf you have any questions, please contact ${peopleOpsEmail}.\n\nBest regards,\n${senderName}`;
      emailSubject = 'Your Account Credentials';
    }
    
    // Log the generated email to user_communications
    if (generatedEmail && userAgencies.length > 0) {
      try {
        const UserCommunication = (await import('../models/UserCommunication.model.js')).default;
        await UserCommunication.create({
          userId: userId,
          agencyId: userAgencies[0].id,
          templateType: 'welcome_active',
          templateId: templateId || null,
          subject: emailSubject,
          body: generatedEmail,
          generatedByUserId: req.user.id,
          channel: 'email',
          recipientAddress: workEmail.trim(),
          deliveryStatus: 'pending' // Will be updated when email API sends it
        });
      } catch (logError) {
        // Don't fail the request if logging fails
        console.error('Failed to log communication:', logError);
      }
    }

    res.json({
      message: 'User moved to active status',
      user: updatedUser,
      credentials: {
        workEmail: workEmail.trim(),
        temporaryPassword: tempPassword,
        passwordlessToken: passwordlessTokenResult.token,
        passwordlessTokenLink,
        generatedEmail: generatedEmail,
        emailSubject: emailSubject
      }
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    // Support both /change-password (uses req.user.id) and /:id/change-password
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    const userId = id ? parseInt(id) : req.user.id;

    // Users can only change their own password (unless admin/super_admin/support)
    if (userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'You can only change your own password' } });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: { message: 'New password must be at least 6 characters' } });
    }

    // NOTE: `User.findById` may omit sensitive fields like password hashes.
    // For password changes we must ensure we have password_hash / temporary_password_hash available.
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Best-effort load password hashes even if findById doesn't include them.
    let passwordHash = user.password_hash;
    let temporaryPasswordHash = user.temporary_password_hash;
    try {
      if (passwordHash === undefined || temporaryPasswordHash === undefined) {
        const pool = (await import('../config/database.js')).default;
        const [rows] = await pool.execute(
          `SELECT password_hash, temporary_password_hash
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [userId]
        );
        passwordHash = rows?.[0]?.password_hash;
        temporaryPasswordHash = rows?.[0]?.temporary_password_hash;
      }
    } catch {
      // ignore; we'll fall back to whatever we have
    }

    // If user is changing their own password, verify current password
    if (userId === req.user.id) {
      if (!currentPassword) {
        return res.status(400).json({ error: { message: 'Current password is required' } });
      }

      const bcrypt = (await import('bcrypt')).default;
      let isValidPassword = false;
      if (passwordHash) {
        isValidPassword = await bcrypt.compare(currentPassword, passwordHash);
      }
      
      if (!isValidPassword) {
        // Also check temporary password
        if (temporaryPasswordHash) {
          const isValidTempPassword = await bcrypt.compare(currentPassword, temporaryPasswordHash);
          if (!isValidTempPassword) {
            return res.status(401).json({ error: { message: 'Current password is incorrect' } });
          }
        } else {
          // If there is no stored password hash at all, the user likely needs initial setup instead.
          if (!passwordHash) {
            return res.status(400).json({
              error: { message: 'No existing password found for this account. Use the setup link flow instead of Change Password.' }
            });
          }
          return res.status(401).json({ error: { message: 'Current password is incorrect' } });
        }
      }
    }

    // Check if this is the first password change
    const UserActivityLog = (await import('../models/UserActivityLog.model.js')).default;
    const pool = (await import('../config/database.js')).default;
    const [passwordChanges] = await pool.execute(
      `SELECT COUNT(*) as count FROM user_activity_log 
       WHERE user_id = ? AND action_type = 'password_change'`,
      [userId]
    );
    const isFirstPasswordChange = parseInt(passwordChanges[0]?.count || 0) === 0;

    // Change the password
    await User.changePassword(userId, newPassword);

    // If user is inactive, activate them when they set their password
    if (user.is_active === false || user.is_active === 0) {
      const pool = (await import('../config/database.js')).default;
      await pool.execute(
        'UPDATE users SET is_active = TRUE WHERE id = ?',
        [userId]
      );
    }

    // Log password change activity using centralized service
    ActivityLogService.logActivity({
      actionType: 'password_change',
      userId: userId,
      metadata: {
        isFirstPasswordChange
      }
    }, req);

    // Create notification for password change (if first time)
    if (isFirstPasswordChange) {
      const NotificationService = (await import('../services/notification.service.js')).default;
      setTimeout(() => {
        // Best-effort agency context for the notification.
        const agencyId =
          (req.user && Number.isFinite(Number(req.user.agencyId)) ? Number(req.user.agencyId) : null) ||
          null;
        NotificationService.createPasswordChangeNotification(userId, agencyId).catch(err => {
          console.error('Failed to create password change notification:', err);
        });
      }, 0);
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

export const getPendingCompletionSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Check permissions - user can download their own, admins can download any
    if (user.status !== 'pending' && user.status !== 'ready_for_review') {
      return res.status(400).json({ error: { message: 'User is not in pending or ready_for_review status' } });
    }
    
    if (userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Generate completion summary
    const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
    const pdfBuffer = await PendingCompletionService.generateCompletionSummary(userId);
    
    // Set response headers for PDF download
    const filename = `completion-summary-${user.first_name}-${user.last_name}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

export const wipePendingUserData = async (req, res, next) => {
  try {
    // Support users cannot wipe user data
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot wipe user data' } });
    }
    
    const { id } = req.params;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Only allow wiping pending or ready_for_review users
    if (user.status !== 'pending' && user.status !== 'ready_for_review') {
      return res.status(400).json({ error: { message: 'Can only wipe data for users in pending or ready_for_review status' } });
    }
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
      
      // Check if the pending user belongs to any of the admin's agencies
      const pendingUserAgencies = await User.getAgencies(userId);
      const pendingUserAgencyIds = pendingUserAgencies.map(a => a.id);
      const hasAccess = pendingUserAgencyIds.some(id => userAgencyIds.includes(id));
      
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have permission to wipe this user\'s data' } });
      }
    }
    
    const pool = (await import('../config/database.js')).default;
    
    // Start transaction to delete training and document data only
    await pool.execute('START TRANSACTION');
    
    try {
      // TRAINING DATA
      // Delete user tracks (training track assignments)
      await pool.execute('DELETE FROM user_tracks WHERE user_id = ?', [userId]);
      
      // Delete module responses
      await pool.execute('DELETE FROM module_responses WHERE user_id = ?', [userId]);
      
      // Delete module response answers
      await pool.execute('DELETE FROM module_response_answers WHERE user_id = ?', [userId]);
      
      // Delete quiz attempts
      await pool.execute('DELETE FROM quiz_attempts WHERE user_id = ?', [userId]);
      
      // Delete quiz responses
      await pool.execute('DELETE FROM quiz_responses WHERE user_id = ?', [userId]);
      
      // Delete time logs
      await pool.execute('DELETE FROM time_logs WHERE user_id = ?', [userId]);
      
      // Delete acknowledgments (training acknowledgments)
      await pool.execute('DELETE FROM acknowledgments WHERE user_id = ?', [userId]);
      
      // Delete progress records
      await pool.execute('DELETE FROM progress WHERE user_id = ?', [userId]);
      
      // Delete task completions (training tasks)
      await pool.execute('DELETE FROM tasks WHERE user_id = ?', [userId]);
      
      // Delete signatures (training-related signatures)
      await pool.execute('DELETE FROM signatures WHERE user_id = ?', [userId]);
      
      // Delete checklist assignments (training checklist items)
      await pool.execute('DELETE FROM user_checklist_assignments WHERE user_id = ?', [userId]);
      
      // Delete onboarding checklist items (training checklist)
      await pool.execute('DELETE FROM onboarding_checklists WHERE user_id = ?', [userId]);
      
      // DOCUMENT DATA
      // Delete user-specific documents and their files
      const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;
      const userDocs = await UserSpecificDocument.findByUserId(userId);
      for (const doc of userDocs) {
        if (doc.file_path) {
          try {
            const fs = (await import('fs/promises')).default;
            const path = (await import('path')).default;
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const filePath = path.join(__dirname, '../../uploads', doc.file_path);
            await fs.unlink(filePath).catch(() => {}); // Ignore errors if file doesn't exist
          } catch (err) {
            console.warn('Could not delete user document file:', err);
          }
        }
      }
      await pool.execute('DELETE FROM user_specific_documents WHERE user_id = ?', [userId]);
      
      // Delete user documents (document task assignments)
      await pool.execute('DELETE FROM user_documents WHERE user_id = ?', [userId]);
      
      // Delete document acknowledgments
      await pool.execute('DELETE FROM document_acknowledgments WHERE user_id = ?', [userId]);
      
      // Delete document signings
      await pool.execute('DELETE FROM document_signings WHERE user_id = ?', [userId]);
      
      // Delete signed document files
      try {
        const fs = (await import('fs/promises')).default;
        const path = (await import('path')).default;
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const signedDir = path.join(__dirname, '../../uploads/signed');
        const files = await fs.readdir(signedDir).catch(() => []);
        for (const file of files) {
          if (file.includes(`user_${userId}_`) || file.includes(`_${userId}.`)) {
            try {
              await fs.unlink(path.join(signedDir, file)).catch(() => {});
            } catch (err) {
              console.warn('Could not delete signed document file:', err);
            }
          }
        }
      } catch (err) {
        console.warn('Could not access signed documents directory:', err);
      }
      
      // Commit transaction
      await pool.execute('COMMIT');
      
      res.json({ message: 'Training and document data wiped successfully. User record and other information preserved.' });
    } catch (error) {
      // Rollback on error
      await pool.execute('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error wiping pending user data:', error);
    next(error);
  }
};


