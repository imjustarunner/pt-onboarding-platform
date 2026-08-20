import User from '../models/User.model.js';
import UserAccount from '../models/UserAccount.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
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
import { getUserCapabilities, buildAgencyAccessCaps } from '../utils/capabilities.js';
import { calcPasswordExpiry } from '../utils/passwordPolicy.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { sanitizePsychologyTodayUrl } from '../utils/psychologyTodayUrl.js';
import OfficeScheduleMaterializer from '../services/officeScheduleMaterializer.service.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import ExternalBusyCalendarService from '../services/externalBusyCalendar.service.js';
import UserExternalCalendar from '../models/UserExternalCalendar.model.js';
import { syncUserState as syncUserFeatureState } from '../services/featureEntitlement.service.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import pool from '../config/database.js';
import {
  complianceArchiveClient,
  complianceArchiveGuardian,
  getBulkGuardiansDeletePreview,
  permanentDeleteDevFillClient,
  permanentDeleteDevFillGuardian
} from '../services/devFill.service.js';
import { canUserManageClub } from '../utils/sscClubAccess.js';
import { detachUserFromOrganization, detachUserGlobalLinks } from '../services/userStaffDetach.service.js';
import { runSummitStrictErasureForAccountDeletion } from '../services/summitStrictErasure.service.js';
import { AGENCY_POSITION_ROLE_VALUES, normalizeAgencyRole } from '../constants/agencyMembership.js';
import { syncProgramMembershipForSkillBuilderEligibleUser } from '../services/skillBuildersProgramAffiliation.service.js';
import { isSkillBuildersSchoolProgramActiveForParentAgencyId } from '../utils/skillBuildersSchoolProgramFeature.js';
import { isStravaRolloutEnabledForEmail } from '../utils/stravaRollout.js';
import {
  canManageOthersSchedule,
  canViewFullScheduleDetails,
  resolveScheduleDetailLevel,
  toBusyOnlyScheduleSummary,
  toTypedPeerScheduleSummary
} from '../services/scheduleSummaryPrivacy.service.js';
import { generateJoinToken, joinUrlForSupervision, joinUrlForTeamMeeting } from '../utils/joinToken.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import {
  clientScheduleInstantToUtcMysql,
  normalizeUtcMysqlScheduleInstant,
  scheduleInstantToWallMysql
} from '../utils/zonedWallTime.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isAdminOrSuperAdmin = (req) => {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
};

async function targetUserBelongsToSkillBuildersSchoolProgramTenant(targetUserId) {
  const uid = parseInt(String(targetUserId), 10);
  if (!Number.isFinite(uid) || uid < 1) return false;
  try {
    const agencies = await User.getAgencies(uid);
    const ids = new Set();
    for (const a of agencies || []) {
      const id = parseInt(String(a?.id || 0), 10);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
    for (const aid of ids) {
      if (await isSkillBuildersSchoolProgramActiveForParentAgencyId(aid)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Summit club managers may view a user who belongs to their club or has a pending application there. */
async function clubManagerCanViewClubMemberUser(req, targetUserId) {
  const tid = parseInt(String(targetUserId), 10);
  const uid = req.user?.id;
  if (!Number.isFinite(tid) || tid <= 0 || !uid) return false;
  if (String(req.user?.role || '').toLowerCase() !== 'club_manager') return false;
  const clubs = await User.getAgencies(uid);
  const clubIds = (clubs || [])
    .filter((a) => String(a?.organization_type || '').toLowerCase() === 'affiliation')
    .map((a) => Number(a.id));
  for (const cid of clubIds) {
    if (!(await canUserManageClub({ user: req.user, clubId: cid }))) continue;
    const [shared] = await pool.execute(
      `SELECT 1 FROM user_agencies ua WHERE ua.user_id = ? AND ua.agency_id = ? LIMIT 1`,
      [tid, cid]
    );
    if (shared?.length) return true;
    const [pending] = await pool.execute(
      `SELECT 1 FROM challenge_member_applications
       WHERE agency_id = ? AND user_id = ? AND status = 'pending' LIMIT 1`,
      [cid, tid]
    );
    if (pending?.length) return true;
  }
  return false;
}

const normalizeBoolFlag = (val) => val === 1 || val === true || val === '1';

/** MySQL DATE / JS Date → yyyy-MM-dd for JSON (never use String(date).slice(0,10) — that yields "Fri Mar 21"). */
const toYmdDateOnly = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
};
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

/** Get first agency ID for admin_audit_log (required). Uses shared agency or target's first. */
async function getFirstAgencyForAudit(actorUserId, targetUserId, actorRole) {
  const targetAgencies = await User.getAgencies(targetUserId);
  if (!targetAgencies?.length) return null;
  const r = String(actorRole || '').toLowerCase();
  if (r === 'super_admin') return Number(targetAgencies[0]?.id || 0) || null;
  const actorAgencies = await User.getAgencies(actorUserId);
  const actorIds = new Set((actorAgencies || []).map((a) => Number(a.id)));
  const shared = (targetAgencies || []).map((a) => Number(a.id)).filter((id) => actorIds.has(id));
  return (shared[0] ?? targetAgencies[0]?.id) ? Number(shared[0] ?? targetAgencies[0]?.id) : null;
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

    const OrgAffModel = (await import('../models/OrganizationAffiliation.model.js')).default;
    if (OrgAffModel?.agencyHasClinicalOrg) {
      for (const o of list) {
        if (!o || !o.id) continue;
        const t = String(o.organization_type || '').toLowerCase();
        if (t === 'clinical') {
          o.hasClinicalOrg = true;
          o.hasLearningOrg = false;
          continue;
        }
        const agencyIdForCheck = t === 'agency' ? Number(o.id) : Number(o.affiliated_agency_id || o.id);
        if (agencyIdForCheck) {
          o.hasClinicalOrg = await OrgAffModel.agencyHasClinicalOrg(agencyIdForCheck);
          o.hasLearningOrg = OrgAffModel?.agencyHasLearningOrg
            ? await OrgAffModel.agencyHasLearningOrg(agencyIdForCheck)
            : false;
        } else {
          o.hasClinicalOrg = false;
          o.hasLearningOrg = false;
        }
      }
    }

    // For affiliations (e.g. Summit Stats Team Challenge clubs): add parent_slug for admin routing, inherit branding when missing
    const Agency = (await import('../models/Agency.model.js')).default;
    for (const o of list) {
      if (!o || !o.affiliated_agency_id) continue;
      try {
        const parent = await Agency.findById(o.affiliated_agency_id);
        if (parent) {
          o.parent_slug = parent.slug || parent.portal_url || null;
          const hasPalette = o.color_palette && (typeof o.color_palette === 'string' ? (() => { try { const p = JSON.parse(o.color_palette); return p && (p.primary || p.secondary || p.accent); } catch { return false; } })() : (o.color_palette?.primary || o.color_palette?.secondary || o.color_palette?.accent));
          if (!hasPalette && parent.color_palette) o.color_palette = parent.color_palette;
          if (!o.theme_settings && parent.theme_settings) o.theme_settings = parent.theme_settings;
        }
      } catch {
        // ignore; best-effort only
      }
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

    const isDemoMode = req.user?.demoMode === true;
    const effectiveRole = isDemoMode ? String(req.user?.role || user.role || '').toLowerCase() : user.role;
    // Keep agency-scoped caps (payroll / budget / credentialing) aligned with login.
    const agencyAccessCaps = await buildAgencyAccessCaps(user, { effectiveRole });

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
      role: effectiveRole,
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
      passwordExpiresSoon: pw.passwordExpiresSoon,
      passwordExpiresInDays: pw.passwordExpiresInDays,
      // Provider global availability (best-effort; defaults true for older DBs)
      provider_accepting_new_clients:
        user.provider_accepting_new_clients === undefined || user.provider_accepting_new_clients === null
          ? true
          : Boolean(user.provider_accepting_new_clients),
      medcancelEnabled: ['low', 'high'].includes(String(user.medcancel_rate_schedule || '').toLowerCase()),
      medcancelRateSchedule: user.medcancel_rate_schedule || null,
      employmentType: user.employment_type || null,
      benefitsEligibilityOverrides: (() => {
        const raw = user.benefits_eligibility_overrides_json;
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch { return {}; }
      })(),
      benefitsEnrollment: (() => {
        const raw = user.benefits_enrollment_json;
        if (!raw) return null;
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch { return null; }
      })(),
      isHourlyWorker: !!(user.is_hourly_worker === 1 || user.is_hourly_worker === true || user.is_hourly_worker === '1'),
      hourlyDualRateEnabled: !!(user.hourly_dual_rate_enabled === 1 || user.hourly_dual_rate_enabled === true || user.hourly_dual_rate_enabled === '1'),
      hourly_dual_rate_enabled: !!(user.hourly_dual_rate_enabled === 1 || user.hourly_dual_rate_enabled === true || user.hourly_dual_rate_enabled === '1'),
      is_hourly_worker: !!(user.is_hourly_worker === 1 || user.is_hourly_worker === true || user.is_hourly_worker === '1'),
      companyCardEnabled: Boolean(user.company_card_enabled),
      companyCarSubmitAccess: Boolean(user.company_car_submit_access),
      companyCarManageAccess: Boolean(user.company_car_manage_access),
      has_supervisor_privileges: !!(user.has_supervisor_privileges === true || user.has_supervisor_privileges === 1 || user.has_supervisor_privileges === '1'),
      group_supervision_eligible: !!(user.group_supervision_eligible === true || user.group_supervision_eligible === 1 || user.group_supervision_eligible === '1'),
      has_provider_access: !!(user.has_provider_access === true || user.has_provider_access === 1 || user.has_provider_access === '1'),
      has_staff_access: !!(user.has_staff_access === true || user.has_staff_access === 1 || user.has_staff_access === '1'),
      has_games_access: !!(user.has_games_access === true || user.has_games_access === 1 || user.has_games_access === '1'),
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
      ...agencyAccessCaps,
      demoMode: isDemoMode,
      demoRealRole: isDemoMode ? (req.user?.demoRealRole || user.role) : null
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
      let agencyIds = userAgencies.map(a => a.id);

      // Optional narrowing. Requested scopes are intersected with the caller's
      // accessible agencies, so these params can only ever reduce visibility.
      //
      // Selecting a tenant must also include the organizations beneath it: school staff
      // hold a membership on their school, not on the parent tenant, so filtering to the
      // tenant id alone would hide them.
      const accessible = new Set(agencyIds.map(Number));

      const narrowToOrgAndChildren = async (rootId) => {
        const scope = new Set();
        if (accessible.has(rootId)) scope.add(rootId);
        try {
          const [children] = await pool.execute(
            `SELECT organization_id FROM organization_affiliations
              WHERE is_active = TRUE AND agency_id = ?`,
            [rootId]
          );
          for (const row of children || []) {
            const childId = Number(row.organization_id);
            if (accessible.has(childId)) scope.add(childId);
          }
        } catch {
          // No affiliation table; the root on its own is the best available scope.
        }
        return [...scope];
      };

      const requestedOrgId = parseInt(req.query.organization_id, 10);
      const requestedAgencyId = parseInt(req.query.agency_id, 10);
      if (Number.isFinite(requestedOrgId) && requestedOrgId > 0) {
        // A specific organization is already the narrowest scope.
        agencyIds = accessible.has(requestedOrgId) ? [requestedOrgId] : [];
      } else if (Number.isFinite(requestedAgencyId) && requestedAgencyId > 0) {
        agencyIds = await narrowToOrgAndChildren(requestedAgencyId);
      }

      const ALLOWED_ROLE_FILTERS = new Set([
        'school_staff', 'provider', 'staff', 'admin', 'support',
        'facilitator', 'intern', 'supervisor', 'clinical_practice_assistant'
      ]);
      const requestedRole = String(req.query.role || '').trim().toLowerCase();
      const roleFilter = ALLOWED_ROLE_FILTERS.has(requestedRole) ? requestedRole : null;

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
        
        const queryParams = [...agencyIds];

        if (!includeArchived) {
          query += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
        }

        if (roleFilter) {
          query += ' AND LOWER(u.role) = ?';
          queryParams.push(roleFilter);
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

        const [rows] = await pool.execute(query, queryParams);
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

    // Attach profile photo URL (best-effort single bulk query).
    try {
      if (Array.isArray(users) && users.length > 0) {
        const pool = (await import('../config/database.js')).default;
        const ids = users.map((u) => parseInt(u.id, 10)).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT id, profile_photo_path FROM users WHERE id IN (${placeholders})`,
            ids
          );
          const photoById = new Map((rows || []).map((r) => [Number(r.id), r.profile_photo_path || null]));
          users = users.map((u) => ({
            ...u,
            profile_photo_url: publicUploadsUrlFromStoredPath(photoById.get(Number(u.id)) || null) || null,
          }));
        }
      }
    } catch {
      // Ignore if column doesn't exist yet.
    }

    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const getGuardianUsers = async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const includeComplianceArchived =
      req.query.includeComplianceArchived === 'true'
      || req.query.include_compliance_archived === 'true';
    const devFillFilterRaw = String(req.query.dev_fill || req.query.devFill || '').trim().toLowerCase();
    const devFillSql =
      devFillFilterRaw === 'true' || devFillFilterRaw === '1' || devFillFilterRaw === 'only'
        ? ' AND u.created_via_dev_fill = 1'
        : devFillFilterRaw === 'false' || devFillFilterRaw === '0' || devFillFilterRaw === 'exclude'
          ? ' AND (u.created_via_dev_fill = 0 OR u.created_via_dev_fill IS NULL)'
          : '';
    const complianceArchiveSql = includeComplianceArchived ? '' : ' AND u.compliance_archived_at IS NULL';
    const schoolAffiliated =
      req.query.schoolAffiliated === 'true'
      || req.query.schoolAffiliated === '1'
      || String(req.query.scope || '').toLowerCase() === 'school';
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const isSuperAdmin = roleNorm === 'super_admin';

    let scopedAgencyIds = [];
    if (!isSuperAdmin) {
      const userAgencies = await User.getAgencies(req.user.id);
      scopedAgencyIds = (userAgencies || []).map((a) => parseInt(a?.id, 10)).filter((id) => Number.isFinite(id) && id > 0);
      if (scopedAgencyIds.length === 0) {
        return res.json([]);
      }
    }

    const params = [];
    let scopeSql = '';
    if (!isSuperAdmin) {
      const placeholders = scopedAgencyIds.map(() => '?').join(',');
      scopeSql = ` AND EXISTS (
        SELECT 1
        FROM user_agencies ua_scope
        WHERE ua_scope.user_id = u.id
          AND ua_scope.agency_id IN (${placeholders})
      )`;
      params.push(...scopedAgencyIds);
    }

    let archiveSql = '';
    if (!includeArchived) {
      archiveSql = ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
    }

    let schoolSql = '';
    if (schoolAffiliated) {
      schoolSql = ` AND EXISTS (
        SELECT 1
        FROM client_guardians cg_school
        JOIN clients c_school ON c_school.id = cg_school.client_id
        LEFT JOIN agencies org_school ON org_school.id = c_school.organization_id
        WHERE cg_school.guardian_user_id = u.id
          AND (
            LOWER(COALESCE(c_school.client_type, '')) = 'school'
            OR LOWER(COALESCE(org_school.organization_type, '')) = 'school'
            OR EXISTS (
              SELECT 1
              FROM client_organization_assignments coa
              JOIN agencies o2 ON o2.id = coa.organization_id
              WHERE coa.client_id = c_school.id
                AND coa.is_active = TRUE
                AND LOWER(COALESCE(o2.organization_type, '')) = 'school'
            )
          )
      )`;
    }

    const [rows] = await pool.execute(
      `
        SELECT
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
          u.created_at,
          u.is_demo,
          u.created_via_dev_fill,
          u.compliance_archived_at,
          GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS agencies,
          GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') AS agency_ids,
          GROUP_CONCAT(DISTINCT org_client.name ORDER BY org_client.name SEPARATOR ', ') AS school_names,
          COUNT(DISTINCT CASE WHEN cg.access_enabled = 1 THEN cg.client_id ELSE NULL END) AS linked_clients_count,
          GROUP_CONCAT(
            DISTINCT CASE
              WHEN cg.access_enabled = 1
              THEN CONCAT(
                COALESCE(NULLIF(TRIM(c.full_name), ''), NULLIF(TRIM(c.initials), ''), CONCAT('#', c.id)),
                '::',
                c.id
              )
              ELSE NULL
            END
            ORDER BY c.full_name SEPARATOR '||'
          ) AS linked_clients_raw
        FROM users u
        LEFT JOIN user_agencies ua ON ua.user_id = u.id
        LEFT JOIN agencies a ON a.id = ua.agency_id
        LEFT JOIN client_guardians cg ON cg.guardian_user_id = u.id
        LEFT JOIN clients c ON c.id = cg.client_id
        LEFT JOIN agencies org_client ON org_client.id = c.organization_id
          AND LOWER(COALESCE(org_client.organization_type, '')) = 'school'
        WHERE LOWER(COALESCE(u.role, '')) = 'client_guardian'
        ${archiveSql}
        ${complianceArchiveSql}
        ${devFillSql}
        ${scopeSql}
        ${schoolSql}
        GROUP BY
          u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at,
          u.is_active, u.first_name, u.last_name, u.created_at, u.is_demo, u.created_via_dev_fill, u.compliance_archived_at
        ORDER BY u.created_at DESC
      `,
      params
    );

    let shaped = (rows || []).map((r) => {
      const linkedClients = String(r.linked_clients_raw || '')
        .split('||')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const idx = part.lastIndexOf('::');
          if (idx < 0) return { id: null, name: part };
          const name = part.slice(0, idx).trim();
          const id = parseInt(part.slice(idx + 2), 10);
          return { id: Number.isFinite(id) ? id : null, name: name || `#${id}` };
        });
      const { linked_clients_raw: _raw, ...rest } = r;
      return { ...rest, linked_clients: linkedClients };
    });

    if (schoolAffiliated) {
      shaped = shaped.sort((a, b) => {
        const sa = String(a.school_names || '');
        const sb = String(b.school_names || '');
        if (sa !== sb) return sa.localeCompare(sb);
        const la = String(a.last_name || '');
        const lb = String(b.last_name || '');
        if (la !== lb) return la.localeCompare(lb);
        return String(a.first_name || '').localeCompare(String(b.first_name || ''));
      });
    }

    res.json(shaped);
  } catch (error) {
    next(error);
  }
};

export const getGuardianLinkedClients = async (req, res, next) => {
  try {
    const guardianUserId = parseInt(req.params.id, 10);
    if (!guardianUserId) {
      return res.status(400).json({ error: { message: 'Invalid guardian user id' } });
    }

    const guardian = await User.findById(guardianUserId);
    if (!guardian) {
      return res.status(404).json({ error: { message: 'Guardian user not found' } });
    }
    if (String(guardian.role || '').toLowerCase() !== 'client_guardian') {
      return res.status(400).json({ error: { message: 'User is not a guardian account' } });
    }

    const hasRelationshipType = await ClientGuardian.hasRelationshipTypeColumn();
    const [rows] = await pool.execute(
      `SELECT
         c.id AS client_id,
         c.initials,
         c.full_name,
         c.date_of_birth,
         c.status,
         c.document_status,
         c.organization_id,
         c.agency_id,
         c.guardian_portal_enabled,
         o.name AS organization_name,
         o.organization_type AS organization_type,
         a.name AS agency_name,
         ${hasRelationshipType ? 'cg.relationship_type,' : "'guardian' AS relationship_type,"}
         cg.relationship_title,
         cg.access_enabled
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
       LEFT JOIN agencies o ON o.id = c.organization_id
       LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE cg.guardian_user_id = ?
       ORDER BY o.name, c.initials`,
      [guardianUserId]
    );
    return res.json(rows || []);
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
    // Detect requested day of week first (needed for wantsAvailability)
    const detectRequestedDayOfWeekEarly = () => {
      const dayMap = {
        sunday: 0, sun: 0, mondays: 1, monday: 1, mon: 1,
        tuesdays: 2, tuesday: 2, tue: 2, wednesdays: 3, wednesday: 3, wed: 3,
        thursdays: 4, thursday: 4, thu: 4, thurs: 4,
        fridays: 5, friday: 5, fri: 5, saturdays: 6, saturday: 6, sat: 6
      };
      const m = raw.match(/\b(sunday|sundays|sun|monday|mondays|mon|tuesday|tuesdays|tue|wednesday|wednesdays|wed|thursday|thursdays|thu|thurs|friday|fridays|fri|saturday|saturdays|sat)\b/i);
      return m ? dayMap[String(m[1]).toLowerCase()] : null;
    };
    const requestedDayOfWeekEarly = detectRequestedDayOfWeekEarly();
    const wantsAvailability =
      requestedDayOfWeekEarly != null ||
      /\b(available|availability|openings?|open\s+slots?|schedule|when|next\s+available|appointment)\b/i.test(raw);
    const isValidYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10));
    const weekStartYmd =
      isValidYmd(req.query.weekStart) ? String(req.query.weekStart).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const requestedDayOfWeek = requestedDayOfWeekEarly;
    const wantsInPerson = /\bin\s*person\b|\binperson\b/i.test(raw);

    const filterSlotsByDay = (slots, dayOfWeek) => {
      if (dayOfWeek == null || !Array.isArray(slots) || slots.length === 0) return slots;
      return slots.filter((s) => {
        try {
          const d = new Date(String(s?.startAt || ''));
          return !Number.isNaN(d.getTime()) && d.getDay() === dayOfWeek;
        } catch {
          return false;
        }
      });
    };

    // Sort slots: intake-available first (sessionType INTAKE or BOTH), then assigned_available (REGULAR), then by startAt.
    const sortSlotsIntakeFirst = (slots) => {
      if (!Array.isArray(slots) || slots.length === 0) return slots;
      const intakeFirst = (a, b) => {
        const aIntake = ['INTAKE', 'BOTH'].includes(String(a?.sessionType || '').toUpperCase());
        const bIntake = ['INTAKE', 'BOTH'].includes(String(b?.sessionType || '').toUpperCase());
        if (aIntake && !bIntake) return -1;
        if (!aIntake && bIntake) return 1;
        const aStart = new Date(String(a?.startAt || '')).getTime();
        const bStart = new Date(String(b?.startAt || '')).getTime();
        return aStart - bStart;
      };
      return [...slots].sort(intakeFirst);
    };

    const enrichProvidersWithAvailability = async ({ agencyId, results, requestedDayOfWeek: dayFilter, wantsInPerson: inPersonOnly }) => {
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
          let virtual = Array.isArray(availability?.virtualSlots) ? availability.virtualSlots : [];
          let inPerson = Array.isArray(availability?.inPersonSlots) ? availability.inPersonSlots : [];
          const virtualSorted = sortSlotsIntakeFirst([...virtual]);
          const inPersonSorted = sortSlotsIntakeFirst([...inPerson]);
          let virtualFiltered = virtualSorted;
          let inPersonFiltered = inPersonSorted;
          if (dayFilter != null) {
            virtualFiltered = sortSlotsIntakeFirst(filterSlotsByDay(virtual, dayFilter));
            inPersonFiltered = sortSlotsIntakeFirst(filterSlotsByDay(inPerson, dayFilter));
          }
          const nextVirtual = virtualFiltered[0] || null;
          const nextInPerson = inPersonFiltered[0] || null;
          const nextVirtualAny = virtualSorted[0] || null;
          const nextInPersonAny = inPersonSorted[0] || null;

          u.availability_timeZone = availability?.timeZone || null;
          u.availability_weekStart = availability?.weekStart || null;
          u.availability_nextVirtualStartAt = nextVirtual?.startAt || null;
          u.availability_nextVirtualEndAt = nextVirtual?.endAt || null;
          u.availability_nextInPersonStartAt = nextInPerson?.startAt || null;
          u.availability_nextInPersonEndAt = nextInPerson?.endAt || null;
          u._availability_nextVirtualAny = nextVirtualAny;
          u._availability_nextInPersonAny = nextInPersonAny;
          computedFor += 1;
        } catch {
          // Best-effort; skip availability for this provider.
        }
      }

      // When user asked for a specific day (e.g. "thursdays"), prefer providers who have a slot on that day.
      // If none do, fall back to showing all matched providers with their next available (any day) so the user at least sees who fits clinically.
      let filteredList = list;
      let dayFilteredToEmptyFallback = false;
      if (dayFilter != null && inPersonOnly) {
        filteredList = list.filter((u) => u.availability_nextInPersonStartAt != null);
        if (filteredList.length === 0 && list.length > 0) {
          for (const u of list) {
            const any = u._availability_nextInPersonAny;
            u.availability_nextInPersonStartAt = any?.startAt || null;
            u.availability_nextInPersonEndAt = any?.endAt || null;
          }
          filteredList = list;
          dayFilteredToEmptyFallback = true;
        }
      } else if (dayFilter != null) {
        filteredList = list.filter((u) =>
          u.availability_nextInPersonStartAt != null || u.availability_nextVirtualStartAt != null
        );
        if (filteredList.length === 0 && list.length > 0) {
          for (const u of list) {
            const vAny = u._availability_nextVirtualAny;
            const pAny = u._availability_nextInPersonAny;
            u.availability_nextVirtualStartAt = vAny?.startAt || null;
            u.availability_nextVirtualEndAt = vAny?.endAt || null;
            u.availability_nextInPersonStartAt = pAny?.startAt || null;
            u.availability_nextInPersonEndAt = pAny?.endAt || null;
          }
          filteredList = list;
          dayFilteredToEmptyFallback = true;
        }
      }
      for (const u of list) {
        delete u._availability_nextVirtualAny;
        delete u._availability_nextInPersonAny;
      }
      return {
        results: filteredList,
        meta: { computedFor, weekStartYmd, requestedDayOfWeek: dayFilter, dayFilteredToEmptyFallback }
      };
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

      let results = (uRows || []).map((r) => ({
        id: r.id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name
      }));

      let availabilityMeta = null;
      if (wantsAvailability && effectiveProvidersOnly && resolvedAgencyId) {
        const enriched = await enrichProvidersWithAvailability({
          agencyId: resolvedAgencyId,
          results,
          requestedDayOfWeek,
          wantsInPerson
        });
        results = enriched?.results ?? results;
        availabilityMeta = enriched?.meta || null;
      }

      const emailsSemicolon = results
        .map((u) => {
          const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || String(u.email || '').trim();
          const email = String(u.email || '').trim();
          if (!email) return '';
          return `${name} <${email}>`;
        })
        .filter(Boolean)
        .join('; ');

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

    let results = (rows || []).map((r) => ({
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name
    }));

    let availabilityMeta = null;
    if (wantsAvailability) {
      if (!resolvedAgencyId) {
        return res.status(400).json({
          error: { message: 'Select an agency (Filter by Agency) to check provider availability.' }
        });
      }
      const likelyProviders = providersOnly || /\bprovider\b/i.test(raw) || /\btherapist\b/i.test(raw);
      if (likelyProviders) {
        const enriched = await enrichProvidersWithAvailability({
          agencyId: resolvedAgencyId,
          results,
          requestedDayOfWeek,
          wantsInPerson
        });
        results = enriched?.results ?? results;
        availabilityMeta = enriched?.meta || null;
      }
    }

    const emailsSemicolon = results
      .map((u) => {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || String(u.email || '').trim();
        const email = String(u.email || '').trim();
        if (!email) return '';
        return `${name} <${email}>`;
      })
      .filter(Boolean)
      .join('; ');

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
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: { message: 'Only super administrators can archive accounts. Use Mark inactive to offboard staff while keeping their record.' }
      });
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

    try {
      const { detachUserFromMeetingInvites } = await import('../services/meetingInviteGroupSync.service.js');
      await detachUserFromMeetingInvites(parseInt(id, 10));
    } catch (e) {
      console.warn('[archiveUser] meeting invite detach failed', e?.message || e);
    }

    try {
      const agencyId = archivedByAgencyId ?? (await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role));
      if (agencyId) {
        await AdminAuditLog.logAction({
          actionType: 'user_archived',
          actorUserId: req.user.id,
          targetUserId: parseInt(id),
          agencyId,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
    }
    
    res.json({ 
      message: 'User archived successfully. Access revoked immediately.',
      user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Offboard a staff/provider: INACTIVE_EMPLOYEE, login disabled, all org/school affiliations and related operational links removed.
 * History (clients worked with, notes, training, etc.) remains on the user id.
 */
export const setStaffInactive = async (req, res, next) => {
  let conn = null;
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const uid = parseInt(req.params.id, 10);
    if (!uid) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }
    if (uid === req.user.id) {
      return res.status(400).json({ error: { message: 'You cannot mark your own account inactive' } });
    }

    const target = await User.findById(uid);
    if (!target) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const targetRole = String(target.role || '').toLowerCase();
    if (targetRole === 'client_guardian') {
      return res.status(400).json({ error: { message: 'Use guardian tools to manage guardian accounts' } });
    }
    if (target.email === 'superadmin@plottwistco.com' && role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Not allowed' } });
    }

    if (role !== 'super_admin') {
      const actorAgencies = await User.getAgencies(req.user.id);
      const targetAgencies = await User.getAgencies(uid);
      const actorIds = new Set((actorAgencies || []).map((a) => Number(a.id)));
      const shared = (targetAgencies || []).some((a) => actorIds.has(Number(a.id)));
      if (!shared) {
        return res.status(403).json({ error: { message: 'You can only mark inactive users who share an organization with you' } });
      }
    }

    const [memRows] = await pool.execute('SELECT agency_id FROM user_agencies WHERE user_id = ?', [uid]);
    const agencyIds = (memRows || []).map((r) => Number(r.agency_id)).filter((n) => Number.isFinite(n) && n > 0);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const actorId = Number(req.user.id) || 0;
    for (const aid of agencyIds) {
      await detachUserFromOrganization(conn, { userId: uid, agencyId: aid, actorUserId: actorId });
      try {
        await AdminAuditLog.logAction({
          actionType: 'user_removed_from_agency',
          actorUserId: actorId,
          targetUserId: uid,
          agencyId: aid,
          metadata: { source: 'set_staff_inactive' }
        });
      } catch (e) {
        console.warn('Admin audit log failed:', e?.message || e);
      }
    }

    await detachUserGlobalLinks(conn, uid);

    await conn.execute(
      `UPDATE users
       SET status = 'INACTIVE_EMPLOYEE',
           is_active = FALSE,
           provider_accepting_new_clients = FALSE
       WHERE id = ?`,
      [uid]
    );

    await conn.commit();

    try {
      const agencyId = await getFirstAgencyForAudit(req.user.id, uid, req.user.role);
      if (agencyId) {
        await AdminAuditLog.logAction({
          actionType: 'user_set_inactive',
          actorUserId: actorId,
          targetUserId: uid,
          agencyId,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
    }

    const user = await User.findById(uid);
    res.json({
      message: 'User marked inactive. Organization and school links were removed; their history remains on file.',
      user
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
    if (conn) {
      try {
        conn.release();
      } catch {
        // ignore
      }
    }
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

    try {
      const agencyId = userAgencyIds?.[0] ?? (await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role));
      if (agencyId) {
        await AdminAuditLog.logAction({
          actionType: 'user_restored',
          actorUserId: req.user.id,
          targetUserId: parseInt(id),
          agencyId,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
    }

    res.json({ message: 'User restored successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super administrators can permanently delete users.' } });
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

export const getGuardiansBulkDeletePreview = async (req, res, next) => {
  try {
    const rawIds = Array.isArray(req.body?.guardianIds) ? req.body.guardianIds : [];
    const guardianIds = rawIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0);
    if (!guardianIds.length) {
      return res.status(400).json({ error: { message: 'No valid guardian IDs provided' } });
    }
    const preview = await getBulkGuardiansDeletePreview(guardianIds);
    res.json(preview);
  } catch (e) {
    next(e);
  }
};

export const bulkDeleteGuardians = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const rawIds = Array.isArray(req.body.guardianIds) ? req.body.guardianIds : [];
    const guardianIds = rawIds
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (guardianIds.length === 0) {
      return res.status(400).json({ error: { message: 'No valid guardian IDs provided' } });
    }
    if (guardianIds.length > 100) {
      return res.status(400).json({ error: { message: 'Cannot bulk delete more than 100 guardians at a time' } });
    }

    const deleteRelated = req.body?.deleteRelated === true || req.body?.confirmCascade === true;
    const preview = await getBulkGuardiansDeletePreview(guardianIds);
    if (preview.requiresConfirmation && !deleteRelated) {
      return res.status(409).json({
        error: {
          message: 'Selected guardians have linked clients. Confirm to delete or archive all related records.',
          code: 'AFFILIATED_DELETE_CONFIRMATION_REQUIRED',
          preview
        }
      });
    }

    const results = [];
    const actorUserId = req.user.id;

    for (const guardianId of guardianIds) {
      try {
        const guardian = await User.findById(guardianId);
        if (!guardian || String(guardian.role || '').toLowerCase() !== 'client_guardian') {
          results.push({ id: guardianId, ok: false, error: 'Not a guardian account' });
          continue;
        }

        if (guardian.compliance_archived_at) {
          results.push({ id: guardianId, ok: false, error: 'Compliance-archived guardians cannot be permanently deleted' });
          continue;
        }

        const itemPreview = preview.previews.find((p) => p.guardian.id === guardianId);
        const isDevFill = Number(guardian.created_via_dev_fill) === 1;

        if (isDevFill) {
          const deleted = await permanentDeleteDevFillGuardian(guardianId, {
            deleteLinkedDevFillClients: deleteRelated
          });
          results.push({ id: guardianId, ok: deleted, mode: 'permanent_dev_fill' });
          continue;
        }

        if (deleteRelated && itemPreview?.linkedClients?.length) {
          for (const c of itemPreview.linkedClients) {
            if (c.createdViaDevFill) {
              const conn = await pool.getConnection();
              try {
                await conn.beginTransaction();
                await permanentDeleteDevFillClient(conn, c.id);
                await conn.commit();
              } catch (e) {
                try { await conn.rollback(); } catch { /* ignore */ }
              } finally {
                conn.release();
              }
            } else if (!c.complianceArchived) {
              await complianceArchiveClient({ clientId: c.id, actorUserId });
            }
          }
        }

        const [clientRows] = await pool.execute(
          'SELECT client_id FROM client_guardians WHERE guardian_user_id = ?',
          [guardianId]
        );
        const clientIds = (clientRows || []).map((r) => Number(r.client_id)).filter(Boolean);
        if (clientIds.length > 0) {
          const ph = clientIds.map(() => '?').join(',');
          try {
            await pool.execute(`DELETE FROM company_event_clients WHERE client_id IN (${ph})`, clientIds);
          } catch { /* table may not exist */ }
          try {
            await pool.execute(`DELETE FROM skills_group_clients WHERE client_id IN (${ph})`, clientIds);
          } catch { /* table may not exist */ }
        }

        await pool.execute('DELETE FROM client_guardians WHERE guardian_user_id = ?', [guardianId]);
        await complianceArchiveGuardian({
          guardianUserId: guardianId,
          actorUserId,
          note: deleteRelated ? 'Compliance archive with linked clients' : 'Compliance archive (deleted)'
        });
        results.push({ id: guardianId, ok: true, mode: 'compliance_archive' });
      } catch (err) {
        results.push({ id: guardianId, ok: false, error: err?.message || 'Unknown error' });
      }
    }

    const allOk = results.every((r) => r.ok);
    res.status(allOk ? 200 : 207).json({ ok: allOk, results });
  } catch (e) {
    next(e);
  }
};

/** GET /api/users/:id/guardian-events — admin view of events for a guardian's linked clients */
export const getGuardianEvents = async (req, res, next) => {
  try {
    const guardianUserId = parseInt(req.params.id, 10);
    if (!guardianUserId) return res.status(400).json({ error: { message: 'Invalid guardian user id' } });

    const guardian = await User.findById(guardianUserId);
    if (!guardian || String(guardian.role || '').toLowerCase() !== 'client_guardian') {
      return res.status(400).json({ error: { message: 'User is not a guardian account' } });
    }

    const [clientRows] = await pool.execute(
      'SELECT client_id FROM client_guardians WHERE guardian_user_id = ?',
      [guardianUserId]
    );
    const clientIds = (clientRows || []).map((r) => Number(r.client_id)).filter(Boolean);
    if (!clientIds.length) return res.json([]);

    const ph = clientIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT ce.id AS company_event_id,
              ce.title,
              ce.starts_at,
              ce.ends_at,
              ce.event_type,
              ag.name AS agency_name,
              prog.name AS program_name,
              c.id AS client_id,
              c.initials,
              c.full_name,
              cec.enrolled_at,
              cec.is_active
       FROM company_event_clients cec
       INNER JOIN company_events ce ON ce.id = cec.company_event_id
       INNER JOIN agencies ag ON ag.id = ce.agency_id
       LEFT JOIN agencies prog ON prog.id = ce.organization_id
       INNER JOIN clients c ON c.id = cec.client_id
       WHERE cec.client_id IN (${ph})
       ORDER BY ce.starts_at DESC`,
      clientIds
    );

    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const deleteMe = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const protectedRoles = ['admin', 'super_admin'];
    if (protectedRoles.includes(String(user.role || '').toLowerCase())) {
      return res.status(403).json({
        error: { message: 'Administrator accounts cannot be self-deleted. Contact your system administrator.' }
      });
    }

    const { confirmPhrase } = req.body;
    if (String(confirmPhrase || '').trim() !== 'DELETE') {
      return res.status(400).json({
        error: { message: 'Confirmation phrase is required. Type DELETE to confirm.' }
      });
    }

    const pool = (await import('../config/database.js')).default;

    let erasedClubCount = 0;
    try {
      const erasureResult = await runSummitStrictErasureForAccountDeletion(pool, user.id);
      erasedClubCount = Number(erasureResult?.erasedClubCount || 0);
    } catch (erasureErr) {
      const code = erasureErr?.code;
      const statusCode = Number(erasureErr?.statusCode);
      if (code === 'SOLE_MANAGER' || code === 'RETAINED_TOTALS_MIGRATION') {
        return res.status(Number.isFinite(statusCode) ? statusCode : 403).json({
          error: { message: erasureErr.message || 'Cannot delete account.', code }
        });
      }
      throw erasureErr;
    }

    const [remainRows] = await pool.execute(
      `SELECT COUNT(*) AS n FROM user_agencies WHERE user_id = ?`,
      [user.id]
    );
    const remainingAgencyMemberships = Number(remainRows?.[0]?.n || 0);

    if (remainingAgencyMemberships > 0) {
      return res.json({
        message:
          erasedClubCount > 0
            ? 'Your Summit challenge data and club memberships in this program have been removed. Your login and profile stay the same for your other organizations.'
            : 'You still have access through other organizations in this system. No Summit club data was linked to your account to remove.',
        removedSummitOnly: true,
        erasedClubCount
      });
    }

    await pool.execute(
      `UPDATE users SET status = 'ARCHIVED', is_archived = TRUE, archived_at = NOW() WHERE id = ?`,
      [user.id]
    );

    // Scrub direct identifiers while keeping the user row for referential integrity and audit trails.
    const closedEmail = `account-closed-u${user.id}-${Date.now()}@invalid.invalid`;
    try {
      await pool.execute(
        `UPDATE users SET
           first_name = 'Former',
           last_name = 'Member',
           email = ?,
           personal_email = NULL,
           phone = NULL,
           personal_phone = NULL,
           username = NULL,
           profile_photo_path = NULL,
           password_hash = '',
           temporary_password_hash = NULL,
           temporary_password_expires_at = NULL
         WHERE id = ?`,
        [closedEmail, user.id]
      );
    } catch (scrubErr) {
      console.error('deleteMe: PII scrub failed (account still archived):', scrubErr?.message || scrubErr);
    }

    const config = (await import('../config/index.js')).default;
    const clearCookieOptions = config.authCookie.clear();
    res.clearCookie('authToken', clearCookieOptions);

    res.json({ message: 'Your account has been deleted.', removedSummitOnly: false });
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

    // Summit Stats: club managers may view members (or pending applicants) in clubs they manage.
    if (String(req.user?.role || '').toLowerCase() === 'club_manager') {
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      if (await clubManagerCanViewClubMemberUser(req, id)) {
        return res.json({ ...targetUser, profile_photo_url: publicUploadsUrlFromStoredPath(targetUser.profile_photo_path) });
      }
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    return res.status(403).json({ error: { message: 'Access denied' } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id/strava-connection
 * Non-sensitive Strava link status for managers viewing a member (same visibility rules as getUserById).
 */
export const getUserStravaConnection = async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }

    const requesterId = req.user.id;
    const role = req.user.role;

    if (targetId !== requesterId) {
      if (role === 'admin' || role === 'super_admin' || role === 'support') {
        const targetUser = await User.findById(targetId);
        if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });
      } else {
        const requestingUser = await User.findById(requesterId);
        if (!requestingUser) return res.status(403).json({ error: { message: 'Access denied' } });

        if (User.isSupervisor(requestingUser)) {
          const targetUser = await User.findById(targetId);
          if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });
          const supervisorAgencies = await User.getAgencies(requesterId);
          let hasAccess = false;
          for (const agency of supervisorAgencies) {
            const access = await User.supervisorHasAccess(requesterId, targetId, agency.id);
            if (access) {
              hasAccess = true;
              break;
            }
          }
          if (!hasAccess) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        } else if (role === 'clinical_practice_assistant' || role === 'provider_plus') {
          const targetUser = await User.findById(targetId);
          if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });
          if (!['staff', 'provider', 'school_staff', 'facilitator', 'intern'].includes(targetUser.role)) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
          const reqAgencies = await User.getAgencies(requesterId);
          const targetAgencies = await User.getAgencies(targetId);
          const reqIds = reqAgencies.map((a) => a.id);
          const targetIds = targetAgencies.map((a) => a.id);
          const shared = reqIds.filter((id) => targetIds.includes(id));
          if (shared.length === 0) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        } else if (String(role || '').toLowerCase() === 'club_manager') {
          if (!(await clubManagerCanViewClubMemberUser(req, targetId))) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        } else {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      }
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });
    if (!isStravaRolloutEnabledForEmail(targetUser.email)) {
      return res.json({
        connected: false,
        username: null,
        connectedAt: null,
        stravaRolloutEnabled: false
      });
    }
    const [rows] = await pool.execute(
      'SELECT strava_athlete_id, strava_athlete_username, strava_connected_at FROM user_preferences WHERE user_id = ? LIMIT 1',
      [targetId]
    );
    const row = rows?.[0];
    return res.json({
      connected: !!(row?.strava_athlete_id),
      username: row?.strava_athlete_username || null,
      connectedAt: row?.strava_connected_at || null,
      stravaRolloutEnabled: true
    });
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

export const removeUserLoginEmailAlias = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;

    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this organization' } });
    }

    const pool = (await import('../config/database.js')).default;
    const [result] = await pool.execute(
      'DELETE FROM user_login_emails WHERE user_id = ? AND agency_id = ?',
      [userId, agencyId]
    );

    res.json({ ok: true, deleted: (result?.affectedRows || 0) > 0 });
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
      languagesSpoken,
      credential,
      firstName,
      lastName,
      role: roleRaw,
      hasSupervisorPrivileges,
      hasProviderAccess,
      hasStaffAccess,
      providerAcceptingNewClients,
      providerSchoolInfoBlurb,
      psychologyTodayUrl,
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
      companyCarSubmitAccess,
      companyCarManageAccess,
      billingAcknowledged,
      skillBuilderEligible,
      groupSupervisionEligible,
      hasSkillBuilderCoordinatorAccess,
      hasPayrollAccess,
      hasBillingAccess,
      isMarketingContact,
      hasPlatformSupport,
      hasCredentialingAccess,
      isHourlyWorker,
      hasHiringAccess,
      hasOutreachAccess,
      hasMedicalRecordsReleaseAccess,
      hasGamesAccess,
      externalBusyIcsUrl,
      providerStartDate,
      work_role: workRoleRaw,
      department,
      workLocation,
      employmentType,
      benefitsNotes,
      benefitsEligibilityOverrides,
      benefitsEnrollment
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
      const validRoles = ['super_admin', 'admin', 'assistant_admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff', 'provider', 'school_staff', 'client_guardian', 'club_manager', 'athlete'];
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
      if (role === 'assistant_admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return res.status(403).json({
          error: { message: 'Only super admins and admins can assign the assistant admin role' }
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

    const updateWarnings = [];

    // Build update object
    const updateData = { firstName, lastName, role };

    // work_role: for club_manager users, stores the role they use in a work-tenant context.
    // Only admins/super_admins/support can set this field.
    if (workRoleRaw !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change work_role' } });
      }
      const validWorkRoles = ['admin', 'assistant_admin', 'supervisor', 'facilitator', 'intern', 'support', 'staff', 'provider', 'school_staff', 'client_guardian', 'clinical_practice_assistant', 'provider_plus'];
      const normalizedWorkRole = workRoleRaw ? String(workRoleRaw).trim().toLowerCase() : null;
      if (normalizedWorkRole && !validWorkRoles.includes(normalizedWorkRole)) {
        return res.status(400).json({ error: { message: `Invalid work_role. Must be one of: ${validWorkRoles.join(', ')}` } });
      }
      updateData.work_role = normalizedWorkRole;
    }

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
    if (department !== undefined) {
      const v = String(department || '').trim();
      updateData.department = v || null;
    }
    if (workLocation !== undefined) {
      const v = String(workLocation || '').trim();
      updateData.workLocation = v || null;
    }
    if (serviceFocus !== undefined) {
      const v = String(serviceFocus || '').trim();
      updateData.serviceFocus = v || null;
    }
    if (languagesSpoken !== undefined) {
      const v = String(languagesSpoken || '').trim();
      updateData.languagesSpoken = v || null;
    }
    if (psychologyTodayUrl !== undefined) {
      try {
        updateData.psychologyTodayUrl = sanitizePsychologyTodayUrl(psychologyTodayUrl);
      } catch (err) {
        return res.status(400).json({ error: { message: err.message || 'Invalid Psychology Today URL' } });
      }
    }
    if (providerStartDate !== undefined) {
      if (providerStartDate === null || providerStartDate === '') {
        updateData.providerStartDate = null;
      } else {
        const s = toYmdDateOnly(providerStartDate);
        if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          return res.status(400).json({ error: { message: 'providerStartDate must be YYYY-MM-DD' } });
        }
        updateData.providerStartDate = s;
      }
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

    // Provider school info blurb (shared across all schools) - admin/support only.
    if (providerSchoolInfoBlurb !== undefined) {
      const roleForBlurb = String(req.user?.role || '').toLowerCase();
      const canEditBlurb = roleForBlurb === 'super_admin' || roleForBlurb === 'admin' || roleForBlurb === 'staff' || roleForBlurb === 'support';
      if (canEditBlurb) {
        updateData.providerSchoolInfoBlurb = providerSchoolInfoBlurb === null || providerSchoolInfoBlurb === undefined ? null : String(providerSchoolInfoBlurb).trim() || null;
      }
    }
    
    // Handle phone number updates
    const phoneNumberRaw = req.body?.phoneNumber;
    if (phoneNumberRaw !== undefined) {
      // Any user can update their own primary phone number (used for SSC phone login).
      if (parseInt(id) === req.user.id || req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support') {
        updateData.phoneNumber = phoneNumberRaw ? String(phoneNumberRaw).trim() : null;
      }
    }
    if (personalPhone !== undefined) updateData.personalPhone = personalPhone;
    if (workPhone !== undefined) updateData.workPhone = workPhone;
    if (workPhoneExtension !== undefined) updateData.workPhoneExtension = workPhoneExtension;

    // Allow users to update their own username (collision-checked).
    const usernameRaw = req.body?.username;
    if (usernameRaw !== undefined) {
      const newUsername = String(usernameRaw || '').trim();
      if (newUsername) {
        const collision = await User.findByUsername(newUsername);
        if (collision && Number(collision.id) !== Number(id)) {
          return res.status(409).json({ error: { message: 'That username is already taken' } });
        }
        // For SSC: username can be a phone — just store as-is.
        updateData.username = newUsername;
      } else {
        updateData.username = null;
      }
    }

    // Home address (used for mileage calculations)
    if (homeStreetAddress !== undefined) updateData.homeStreetAddress = homeStreetAddress;
    if (homeAddressLine2 !== undefined) updateData.homeAddressLine2 = homeAddressLine2;
    if (homeCity !== undefined) updateData.homeCity = homeCity;
    if (homeState !== undefined) updateData.homeState = homeState;
    if (homePostalCode !== undefined) updateData.homePostalCode = homePostalCode;

    // Med Cancel flags (contract feature / Benefits tab)
    if (medcancelEnabled !== undefined) updateData.medcancelEnabled = Boolean(medcancelEnabled);
    if (medcancelRateSchedule !== undefined) updateData.medcancelRateSchedule = medcancelRateSchedule;

    // Benefits tab: employment classification, notes, eligibility overrides, enrollment
    if (employmentType !== undefined) updateData.employmentType = employmentType;
    if (benefitsNotes !== undefined) updateData.benefitsNotes = benefitsNotes;
    if (benefitsEligibilityOverrides !== undefined) updateData.benefitsEligibilityOverrides = benefitsEligibilityOverrides;
    if (benefitsEnrollment !== undefined) updateData.benefitsEnrollment = benefitsEnrollment;

    // Company Card (contract feature)
    if (companyCardEnabled !== undefined) updateData.companyCardEnabled = Boolean(companyCardEnabled);

    // Company Car access (submit-only vs full manage)
    if (companyCarSubmitAccess !== undefined) updateData.companyCarSubmitAccess = Boolean(companyCarSubmitAccess);
    if (companyCarManageAccess !== undefined) updateData.companyCarManageAccess = Boolean(companyCarManageAccess);

    // Skill Builder eligibility (provider program)
    if (skillBuilderEligible !== undefined) updateData.skillBuilderEligible = Boolean(skillBuilderEligible);

    // Group supervision booking eligibility
    if (groupSupervisionEligible !== undefined) updateData.groupSupervisionEligible = Boolean(groupSupervisionEligible);

    // Program coordinator access (admin/support/super admin only)
    if (hasSkillBuilderCoordinatorAccess !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change program coordinator access' } });
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
    // Medical billing access (profile toggle: set for all agencies for this user)
    if (hasBillingAccess !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change Medical billing access' } });
      }
      updateData.hasBillingAccess = Boolean(hasBillingAccess);
    }
    // Marketing contact (receives school-event / field marketing photo notifications)
    if (isMarketingContact !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change Marketing contact' } });
      }
      updateData.isMarketingContact = Boolean(isMarketingContact);
    }
    // Platform support team (super_admin only — not full platform HQ powers)
    if (hasPlatformSupport !== undefined) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only super admins can change Platform support access' } });
      }
      updateData.hasPlatformSupport = Boolean(hasPlatformSupport);
    }
    // Credentialing access (profile toggle: set for all agencies for this user)
    if (hasCredentialingAccess !== undefined) {
      // Only admins/super_admins can grant credentialing access (including for themselves).
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change Credentialing access' } });
      }
      updateData.hasCredentialingAccess = Boolean(hasCredentialingAccess);
    }
    // Hourly worker (drives Direct/Indirect ratio card visibility)
    if (isHourlyWorker !== undefined) updateData.isHourlyWorker = Boolean(isHourlyWorker);
    // Hiring process access (applicants / prospective)
    if (hasHiringAccess !== undefined) updateData.hasHiringAccess = Boolean(hasHiringAccess);
    if (hasOutreachAccess !== undefined) updateData.hasOutreachAccess = Boolean(hasOutreachAccess);

    // Medical records release access (view/download ROI submissions in Submitted Documents)
    // Admins can grant for themselves or others; must be explicitly enabled; all changes audited.
    let prevMedicalRecordsReleaseAccess = null;
    if (hasMedicalRecordsReleaseAccess !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change Medical records release access' } });
      }
      const targetUserBefore = await User.findById(id);
      prevMedicalRecordsReleaseAccess = !!(targetUserBefore?.has_medical_records_release_access === 1 || targetUserBefore?.has_medical_records_release_access === true);
      updateData.hasMedicalRecordsReleaseAccess = Boolean(hasMedicalRecordsReleaseAccess);
    }

    // Games access entitlement (per-user billing model). Tracked through the
    // featureEntitlement event log; legacy `users.has_games_access` column is
    // kept as a denormalization for hot-path reads.
    let prevGamesAccess = null;
    if (hasGamesAccess !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change Games access' } });
      }
      const targetGamesBefore = await User.findById(id);
      prevGamesAccess = !!(targetGamesBefore?.has_games_access === 1 || targetGamesBefore?.has_games_access === true || targetGamesBefore?.has_games_access === '1');
      updateData.hasGamesAccess = Boolean(hasGamesAccess);
    }

    // External busy calendar (ICS) URL (admin/support/super admin only)
    if (externalBusyIcsUrl !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins or super admins can change external busy calendar URL' } });
      }
      const v = externalBusyIcsUrl === null ? null : String(externalBusyIcsUrl || '').trim();
      updateData.externalBusyIcsUrl = v || null;
    }

    if (skillBuilderEligible !== undefined && updateData.skillBuilderEligible === true) {
      const actorRole = String(req.user?.role || '').toLowerCase();
      if (actorRole !== 'super_admin') {
        const okSb = await targetUserBelongsToSkillBuildersSchoolProgramTenant(id);
        if (!okSb) {
          return res.status(403).json({
            error: {
              message:
                'Skill Builders school program must be enabled for a tenant this user belongs to before marking Skill Development Program eligible.'
            }
          });
        }
      }
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

    // Mirror per-user games entitlement into the event log for billing audit.
    if (hasGamesAccess !== undefined) {
      const newGamesAccess = !!updateData.hasGamesAccess;
      if (prevGamesAccess !== newGamesAccess) {
        try {
          const targetUser = user;
          const agencyId = Number(targetUser?.agency_id || targetUser?.primary_agency_id || 0);
          if (agencyId) {
            await syncUserFeatureState(agencyId, parseInt(id, 10), 'gamesPlatformEnabled', newGamesAccess, {
              actor: { id: req.user?.id || null, role: req.user?.role || null },
              notes: `Set via User profile (${newGamesAccess ? 'enabled' : 'disabled'})`
            });
          } else {
            const [agencies] = await pool.execute(
              'SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY agency_id ASC',
              [parseInt(id, 10)]
            );
            for (const row of agencies) {
              await syncUserFeatureState(Number(row.agency_id), parseInt(id, 10), 'gamesPlatformEnabled', newGamesAccess, {
                actor: { id: req.user?.id || null, role: req.user?.role || null },
                notes: `Set via User profile (${newGamesAccess ? 'enabled' : 'disabled'})`
              });
            }
          }
        } catch (e) {
          console.warn('featureEntitlement sync (gamesPlatformEnabled) failed:', e?.message || e);
        }
      }
    }

    if (skillBuilderEligible !== undefined) {
      const elig =
        user.skill_builder_eligible === true ||
        user.skill_builder_eligible === 1 ||
        user.skill_builder_eligible === '1';
      if (elig) {
        let sbConn;
        try {
          sbConn = await pool.getConnection();
          await syncProgramMembershipForSkillBuilderEligibleUser(sbConn, parseInt(id, 10));
        } catch (e) {
          console.warn('Skill Builders program affiliation sync failed:', e?.message || e);
        } finally {
          if (sbConn) sbConn.release();
        }
      }
    }

    // Admin audit: log when admin updates another user's profile
    if (parseInt(id, 10) !== req.user.id && (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support')) {
      try {
        const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
        if (agencyId) {
          await AdminAuditLog.logAction({
            actionType: 'user_profile_updated',
            actorUserId: req.user.id,
            targetUserId: parseInt(id),
            agencyId,
            metadata: { updatedFields: Object.keys(updateData) }
          });
        }
      } catch (e) {
        console.warn('Admin audit log failed:', e?.message || e);
      }
    }

    // Audit: medical records release access grant/revoke (admin can grant for self or others; all changes tracked)
    if (hasMedicalRecordsReleaseAccess !== undefined && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      const nextEnabled = !!hasMedicalRecordsReleaseAccess;
      if (prevMedicalRecordsReleaseAccess !== nextEnabled) {
        try {
          const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
          if (agencyId) {
            await AdminAuditLog.logAction({
              actionType: nextEnabled ? 'grant_medical_records_release_access' : 'revoke_medical_records_release_access',
              actorUserId: req.user.id,
              targetUserId: parseInt(id),
              agencyId,
              metadata: { previous: prevMedicalRecordsReleaseAccess, next: nextEnabled }
            });
          }
        } catch (e) {
          console.warn('Admin audit log failed:', e?.message || e);
        }
      }
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
        const isSchemaGap =
          payrollErr?.code === 'ER_BAD_FIELD_ERROR' ||
          payrollErr?.code === 'ER_NO_SUCH_TABLE';
        if (isSchemaGap) {
          // Older DBs may not have user_agencies.has_payroll_access yet.
          // Do not fail the entire user profile save in this case.
          console.warn('Skipping payroll access update (schema not ready):', payrollErr?.message || payrollErr);
          updateWarnings.push(
            'Payroll access update was skipped because payroll access columns are not available in this environment.'
          );
        } else {
          if (payrollConn) {
            try {
              await payrollConn.rollback();
            } catch {
              // ignore
            }
          }
          console.error('Error setting payroll access for all agencies:', payrollErr);
          return res.status(500).json({ error: { message: 'Failed to update payroll access' } });
        }
      } finally {
        if (payrollConn) payrollConn.release();
      }
    }

    // When hasBillingAccess was provided, set it for all agencies for this user
    if (hasBillingAccess !== undefined) {
      let billingConn;
      try {
        billingConn = await pool.getConnection();
        await billingConn.beginTransaction();
        const targetUserId = parseInt(id, 10);
        const actorUserId = Number(req.user?.id || 0);
        const nextEnabled = !!hasBillingAccess;

        const [rows] = await billingConn.execute(
          'SELECT agency_id, has_billing_access FROM user_agencies WHERE user_id = ?',
          [targetUserId]
        );

        await billingConn.execute(
          'UPDATE user_agencies SET has_billing_access = ? WHERE user_id = ?',
          [nextEnabled ? 1 : 0, targetUserId]
        );

        for (const row of (rows || [])) {
          const agencyId = Number(row?.agency_id || 0);
          if (!agencyId) continue;
          const prevEnabled = normalizeBoolFlag(row?.has_billing_access);
          if (prevEnabled === nextEnabled) continue;
          await billingConn.execute(
            `INSERT INTO admin_audit_log
             (action_type, actor_user_id, target_user_id, module_id, track_id, agency_id, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              nextEnabled ? 'grant_billing_access' : 'revoke_billing_access',
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

        await billingConn.commit();
      } catch (billingErr) {
        const isSchemaGap =
          billingErr?.code === 'ER_BAD_FIELD_ERROR' ||
          billingErr?.code === 'ER_NO_SUCH_TABLE';
        if (isSchemaGap) {
          console.warn('Skipping billing access update (schema not ready):', billingErr?.message || billingErr);
          updateWarnings.push(
            'Medical billing access update was skipped because billing access columns are not available in this environment.'
          );
        } else {
          if (billingConn) {
            try {
              await billingConn.rollback();
            } catch {
              // ignore
            }
          }
          console.error('Error setting billing access for all agencies:', billingErr);
          return res.status(500).json({ error: { message: 'Failed to update medical billing access' } });
        }
      } finally {
        if (billingConn) billingConn.release();
      }
    }

    // When isMarketingContact was provided, set it for all agencies for this user
    if (isMarketingContact !== undefined) {
      let marketingConn;
      try {
        marketingConn = await pool.getConnection();
        await marketingConn.beginTransaction();
        const targetUserId = parseInt(id, 10);
        const actorUserId = Number(req.user?.id || 0);
        const nextEnabled = !!isMarketingContact;

        const [rows] = await marketingConn.execute(
          'SELECT agency_id, is_marketing_contact FROM user_agencies WHERE user_id = ?',
          [targetUserId]
        );

        await marketingConn.execute(
          'UPDATE user_agencies SET is_marketing_contact = ? WHERE user_id = ?',
          [nextEnabled ? 1 : 0, targetUserId]
        );

        for (const row of (rows || [])) {
          const agencyId = Number(row?.agency_id || 0);
          if (!agencyId) continue;
          const prevEnabled = normalizeBoolFlag(row?.is_marketing_contact);
          if (prevEnabled === nextEnabled) continue;
          await marketingConn.execute(
            `INSERT INTO admin_audit_log
             (action_type, actor_user_id, target_user_id, module_id, track_id, agency_id, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              nextEnabled ? 'grant_marketing_contact' : 'revoke_marketing_contact',
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

        await marketingConn.commit();
      } catch (marketingErr) {
        const isSchemaGap =
          marketingErr?.code === 'ER_BAD_FIELD_ERROR' ||
          marketingErr?.code === 'ER_NO_SUCH_TABLE';
        if (isSchemaGap) {
          console.warn('Skipping marketing contact update (schema not ready):', marketingErr?.message || marketingErr);
          updateWarnings.push(
            'Marketing contact update was skipped because the marketing contact column is not available in this environment.'
          );
        } else {
          if (marketingConn) {
            try {
              await marketingConn.rollback();
            } catch {
              // ignore
            }
          }
          console.error('Error setting marketing contact for all agencies:', marketingErr);
          return res.status(500).json({ error: { message: 'Failed to update marketing contact' } });
        }
      } finally {
        if (marketingConn) marketingConn.release();
      }
    }

    // When hasCredentialingAccess was provided, set it for all agencies for this user
    if (hasCredentialingAccess !== undefined) {
      let credentialingConn;
      try {
        credentialingConn = await pool.getConnection();
        await credentialingConn.beginTransaction();
        const targetUserId = parseInt(id, 10);
        const actorUserId = Number(req.user?.id || 0);
        const nextEnabled = !!hasCredentialingAccess;

        const [rows] = await credentialingConn.execute(
          'SELECT agency_id, can_manage_credentialing FROM user_agencies WHERE user_id = ?',
          [targetUserId]
        );

        await credentialingConn.execute(
          'UPDATE user_agencies SET can_manage_credentialing = ? WHERE user_id = ?',
          [nextEnabled ? 1 : 0, targetUserId]
        );

        for (const row of (rows || [])) {
          const agencyId = Number(row?.agency_id || 0);
          if (!agencyId) continue;
          const prevEnabled = normalizeBoolFlag(row?.can_manage_credentialing);
          if (prevEnabled === nextEnabled) continue;
          await credentialingConn.execute(
            `INSERT INTO admin_audit_log
             (action_type, actor_user_id, target_user_id, module_id, track_id, agency_id, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              nextEnabled ? 'grant_credentialing_access' : 'revoke_credentialing_access',
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

        await credentialingConn.commit();
      } catch (credentialingErr) {
        const isSchemaGap =
          credentialingErr?.code === 'ER_BAD_FIELD_ERROR' ||
          credentialingErr?.code === 'ER_NO_SUCH_TABLE';
        if (isSchemaGap) {
          // Older DBs may not have user_agencies.can_manage_credentialing yet.
          // Do not fail the entire user profile save in this case.
          console.warn('Skipping credentialing access update (schema not ready):', credentialingErr?.message || credentialingErr);
          updateWarnings.push(
            'Credentialing access update was skipped because credentialing columns are not available in this environment.'
          );
        } else {
          if (credentialingConn) {
            try {
              await credentialingConn.rollback();
            } catch {
              // ignore
            }
          }
          console.error('Error setting credentialing access for all agencies:', credentialingErr);
          return res.status(500).json({ error: { message: 'Failed to update credentialing access' } });
        }
      } finally {
        if (credentialingConn) credentialingConn.release();
      }
    }

    if (updateWarnings.length > 0) {
      return res.json({
        ...user,
        warnings: updateWarnings
      });
    }
    res.json(user);
  } catch (error) {
    // Handle MySQL enum errors more gracefully
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || error.message?.includes('enum')) {
      console.error('Role enum error:', error.message);
      return res.status(400).json({ error: { message: `Invalid role value. Valid roles are: super_admin, admin, support, clinical_practice_assistant, provider_plus, staff, provider, school_staff, client_guardian, club_manager, athlete` } });
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
    // - program coordinators can force confirm for users in shared agencies
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

function startOfWeekIsoYmd(dateStr) {
  const d = new Date(`${String(dateStr || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : (1 - day); // shift to Monday
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeekSundayYmd(dateStr) {
  const d = new Date(`${String(dateStr || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeekYmd(dateStr, weekStartsOn = 'monday') {
  return String(weekStartsOn || '').toLowerCase() === 'sunday'
    ? startOfWeekSundayYmd(dateStr)
    : startOfWeekIsoYmd(dateStr);
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMysqlDateTimeWall(value) {
  if (value === null || value === undefined) return null;
  const pad2 = (n) => String(n).padStart(2, '0');
  const formatLocalParts = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const formatUtcParts = (d) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // mysql2 returns DATETIME columns as Date objects interpreted in UTC; keep wall time stable.
    return formatUtcParts(value);
  }

  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
  // Preserve local wall-time strings from datetime-local inputs.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const normalized = raw.length === 16 ? `${raw}:00` : raw;
    return normalized.replace('T', ' ');
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return formatLocalParts(d);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalParts(d);
}

/** Convert RFC3339 or Date to MySQL UTC datetime. Used when storing Google event times. */
function toMysqlUtc(value) {
  if (value === null || value === undefined) return null;
  const pad2 = (n) => String(n).padStart(2, '0');
  const d = value instanceof Date ? value : new Date(String(value || '').trim());
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/**
 * Interpret a wall-clock datetime string in `timeZone` and return MySQL UTC.
 * Needed for Google-synced schedule events (DB stores UTC; Google API wants wall+TZ).
 */
function wallInTimeZoneToMysqlUtc(value, timeZone) {
  const wall = toMysqlDateTimeWall(value);
  const tz = String(timeZone || '').trim();
  if (!wall) return null;
  if (!tz) return toMysqlUtc(wall.replace(' ', 'T') + 'Z') || wall;

  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return toMysqlUtc(wall);

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const desiredAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  let utcMs = desiredAsUtcMs;
  for (let i = 0; i < 4; i += 1) {
    const parts = dtf.formatToParts(new Date(utcMs));
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const asShownUtcMs = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) % 24,
      Number(map.minute),
      Number(map.second)
    );
    const delta = desiredAsUtcMs - asShownUtcMs;
    if (delta === 0) break;
    utcMs += delta;
  }

  return toMysqlUtc(new Date(utcMs));
}

/** Format a UTC MySQL/ISO instant as wall-clock `YYYY-MM-DD HH:mm:ss` in `timeZone`. */
function utcMysqlToWallInTimeZone(value, timeZone) {
  const tz = String(timeZone || '').trim() || 'America/Denver';
  if (value == null) return null;
  let d;
  if (value instanceof Date) {
    d = value;
  } else {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      d = new Date(raw.replace(' ', 'T') + 'Z');
    } else {
      d = new Date(raw);
    }
  }
  if (Number.isNaN(d.getTime())) return null;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = dtf.formatToParts(d);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${map.year}-${map.month}-${map.day} ${pad2(Number(map.hour) % 24)}:${map.minute}:${map.second}`;
}

/** Return ISO string with Z for schedule events so frontend parses as UTC and displays correctly in viewer's timezone. */
function toIsoUtcForSchedule(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  // Google-synced rows store UTC in MySQL DATETIME without a suffix — must not parse as server local.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Wall-clock schedule times saved without Google sync — keep as local datetime (no Z). */
function toScheduleWallIso(value) {
  const wall = toMysqlDateTimeWall(value);
  if (!wall) return null;
  return wall.replace(' ', 'T');
}

const SCHEDULE_MEETING_KINDS = new Set(['TEAM_MEETING', 'HUDDLE']);

/** All timed provider_schedule_events store UTC instants (migration 1098). */
function scheduleEventStoresUtc(row) {
  if (Number(row?.all_day || 0) === 1) return false;
  return true;
}

function scheduleEventStartEndForSummary(row) {
  const isAllDay = Number(row?.all_day || 0) === 1;
  if (isAllDay) return { startAt: null, endAt: null };
  return {
    startAt: toIsoUtcForSchedule(row.start_at) || toScheduleWallIso(row.start_at) || row.start_at || null,
    endAt: toIsoUtcForSchedule(row.end_at) || toScheduleWallIso(row.end_at) || row.end_at || null
  };
}

/** Any authenticated role may request a peer summary when they share an agency (busy by default). */
const canViewProviderScheduleSummary = (role) => {
  const r = String(role || '').toLowerCase();
  if (!r) return false;
  // Guardians / school-only portals do not get peer calendars.
  if (r === 'client_guardian' || r === 'guardian' || r === 'school_staff' || r === 'school_support') return false;
  return true;
};

/** Create/edit events on another user's calendar: privileged roles only (supervisor checked separately). */
const canCreateProviderScheduleEvent = (role) => canManageOthersSchedule(role);

async function actorIsSupervisorOfTarget(actorUserId, targetUserId, agencyId = null) {
  try {
    const actor = await User.findById(actorUserId);
    if (!actor || !User.isSupervisor(actor)) return false;
    return !!(await User.supervisorHasAccess(actorUserId, targetUserId, agencyId));
  } catch {
    return false;
  }
}

async function assertCanManageTargetSchedule({ actorUserId, actorRole, targetUserId, agencyId = null }) {
  if (Number(actorUserId) === Number(targetUserId)) return true;
  if (canCreateProviderScheduleEvent(actorRole)) {
    const sharedOk = await requireSharedAgencyAccessOrSuperAdmin({
      actorUserId,
      targetUserId,
      actorRole
    });
    if (sharedOk) return true;
  }
  return actorIsSupervisorOfTarget(actorUserId, targetUserId, agencyId);
}

/** Admin-meeting invitees may reschedule time/date; other edits stay host-only. */
async function actorIsAdminMeetingAttendee(actorUserId, eventRow) {
  const uid = Number(actorUserId || 0);
  const eid = Number(eventRow?.id || 0);
  if (!uid || !eid) return false;
  const kind = String(eventRow?.kind || '').trim().toUpperCase();
  const subtype = String(eventRow?.meeting_subtype || eventRow?.meetingSubtype || 'general').trim().toLowerCase();
  if (kind !== 'TEAM_MEETING' || subtype !== 'admin') return false;
  if (Number(eventRow?.provider_id || 0) === uid) return true;
  try {
    const ProviderScheduleEventAttendee = (await import('../models/ProviderScheduleEventAttendee.model.js')).default;
    const rows = await ProviderScheduleEventAttendee.listByEventId(eid);
    return (rows || []).some((r) => Number(r?.user_id || r?.userId || 0) === uid);
  } catch {
    return false;
  }
}

async function loadHostDisplayNamesByUserIds(userIds = []) {
  const ids = Array.from(new Set((userIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)));
  const out = new Map();
  if (!ids.length) return out;
  try {
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE id IN (${placeholders})`,
      ids
    );
    for (const r of rows || []) {
      const id = Number(r.id || 0);
      if (!id) continue;
      const firstName = String(r.first_name || '').trim();
      const lastName = String(r.last_name || '').trim();
      const name = [firstName, lastName].filter(Boolean).join(' ').trim()
        || String(r.email || '').trim()
        || '';
      out.set(id, { firstName, lastName, name });
    }
  } catch {
    /* optional */
  }
  return out;
}

const canListAllAgencyClientsForSchedule = (role) => {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(r);
};

function toDisplayStatus({ status, slotState }) {
  const st = String(status || '').trim().toUpperCase();
  const ss = String(slotState || '').trim().toUpperCase();
  if (st === 'BOOKED' || ss === 'ASSIGNED_BOOKED') return 'BOOKED';
  if (ss === 'ASSIGNED_TEMPORARY') return 'AVAILABLE';
  if (st === 'RELEASED' || ss === 'ASSIGNED_AVAILABLE') return 'AVAILABLE';
  if (st === 'CANCELLED') return 'CANCELED';
  return 'UNKNOWN';
}

function defaultAppointmentTypeForSlot({ status, slotState }) {
  const displayStatus = toDisplayStatus({ status, slotState });
  if (displayStatus === 'BOOKED') return 'SESSION';
  if (displayStatus === 'AVAILABLE') return 'AVAILABLE_SLOT';
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
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const provider = await User.findById(providerId);
    if (!provider) return res.status(404).json({ error: { message: 'User not found' } });

    // Resolve agency context (used for access checks + scoping)
    const includeAllAgenciesRaw = String(req.query.includeAllAgencies || '').trim().toLowerCase();
    const includeAllAgencies = includeAllAgenciesRaw === 'true'
      || includeAllAgenciesRaw === '1'
      || String(req.query.agencyId || '').trim().toLowerCase() === 'all';
    let agencyId = (!includeAllAgencies && req.query.agencyId) ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      try {
        // fallback to requester's first agency (super_admin may have none)
        const reqAgencies = await User.getAgencies(req.user.id);
        agencyId = reqAgencies?.[0]?.id ? Number(reqAgencies[0].id) : null;
      } catch {
        agencyId = null;
      }
    }

    let isSupervisorOfTarget = false;
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
        isSupervisorOfTarget = await actorIsSupervisorOfTarget(req.user.id, providerId, agencyId);
      } else {
        const supervisorAgencyId = agencyId || (targetAgencies || [])[0]?.id;
        if (supervisorAgencyId && (await User.supervisorHasAccess(req.user.id, providerId, Number(supervisorAgencyId)))) {
          agencyId = Number(supervisorAgencyId);
          isSupervisorOfTarget = true;
        } else {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      }
    } else if (!isSelf) {
      isSupervisorOfTarget = await actorIsSupervisorOfTarget(req.user.id, providerId, agencyId);
    }

    // super_admin skips the shared-agency branch above; requested agencyId may be a parent org while
    // provider_schedule_events and other rows use a child org id. If the provider has no membership
    // matching agencyId, scope to their first org so the summary is not empty.
    if (!isSelf && String(req.user?.role || '').toLowerCase() === 'super_admin') {
      const targetAgencies = await User.getAgencies(providerId);
      const targetIds = (targetAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0);
      if (targetIds.length) {
        const want = Number(agencyId || 0);
        if (!want || !targetIds.includes(want)) {
          agencyId = targetIds[0];
        }
      }
    }

    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStartsOn = String(req.query.weekStartsOn || req.query.week_starts_on || 'monday')
      .trim()
      .toLowerCase() === 'sunday'
      ? 'sunday'
      : 'monday';
    const weekStart = startOfWeekYmd(weekStartRaw, weekStartsOn);
    if (!weekStart) return res.status(400).json({ error: { message: 'weekStart must be YYYY-MM-DD' } });
    const weekEnd = addDaysYmd(weekStart, 7);

    const windowStart = `${weekStart} 00:00:00`;
    const windowEnd = `${weekEnd} 00:00:00`;
    const timeMinIso = `${weekStart}T00:00:00Z`;
    const timeMaxIso = `${weekEnd}T00:00:00Z`;

    const includeGoogleBusyRequested = String(req.query.includeGoogleBusy || '').toLowerCase() === 'true';
    const includeGoogleEvents = String(req.query.includeGoogleEvents || '').toLowerCase() === 'true';
    // Google overlays are mutually exclusive: titles mode wins when both are requested.
    const includeGoogleBusy = includeGoogleBusyRequested && !includeGoogleEvents;
    const includeExternalBusy = String(req.query.includeExternalBusy || '').toLowerCase() === 'true';
    const includeAllExternalCalendars =
      String(req.query.includeAllExternalCalendars || '').toLowerCase() === 'true';
    const externalCalendarIdsRaw = String(req.query.externalCalendarIds || '').trim();
    let externalCalendarIds = externalCalendarIdsRaw
      ? externalCalendarIdsRaw
        .split(',')
        .map((x) => parseInt(String(x).trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
      : [];

    // Ensure office_events are materialized for this week for buildings relevant to this provider (best-effort).
    try {
      const officeLocationIdSet = new Set();
      const [rows] = await pool.execute(
        `SELECT DISTINCT osa.office_location_id
         FROM office_standing_assignments osa
         JOIN office_location_agencies ola ON ola.office_location_id = osa.office_location_id
         WHERE osa.provider_id = ?
           AND osa.is_active = TRUE
           AND ola.agency_id = ?`,
        [providerId, agencyId]
      );
      for (const r of rows || []) {
        const oid = Number(r.office_location_id || 0);
        if (Number.isInteger(oid) && oid > 0) officeLocationIdSet.add(oid);
      }
      try {
        const [eventRows] = await pool.execute(
          `SELECT DISTINCT e.office_location_id
           FROM office_events e
           JOIN office_location_agencies ola ON ola.office_location_id = e.office_location_id
           WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
             AND ola.agency_id = ?
             AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
             AND e.start_at < ?
             AND e.end_at > ?`,
          [providerId, providerId, agencyId, windowEnd, windowStart]
        );
        for (const r of eventRows || []) {
          const oid = Number(r.office_location_id || 0);
          if (Number.isInteger(oid) && oid > 0) officeLocationIdSet.add(oid);
        }
      } catch {
        // ignore
      }
      const officeLocationIds = Array.from(officeLocationIdSet.values());
      const mondayAnchors = new Set();
      mondayAnchors.add(OfficeScheduleMaterializer.startOfWeekMonday(weekStart) || weekStart);
      // Sunday-start windows span parts of two Monday office weeks (e.g. Sun Jul 26–Sat Aug 1).
      if (weekStartsOn === 'sunday') {
        const nextDay = addDaysYmd(weekStart, 1);
        mondayAnchors.add(OfficeScheduleMaterializer.startOfWeekMonday(nextDay) || nextDay);
      }
      // Materialize only the viewed week(s) on the read path (cached, not force).
      await Promise.all(
        officeLocationIds.flatMap((officeLocationId) =>
          Array.from(mondayAnchors).map((mondayAnchor) =>
            OfficeScheduleMaterializer.materializeWeek({
              officeLocationId,
              weekStartRaw: mondayAnchor,
              createdByUserId: req.user.id,
              useExactWeekStart: true,
              force: false
            }).catch(() => null)
          )
        )
      );
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
        const preferredOfficeIdsRaw = r.preferred_office_ids_json;
        const preferredOfficeIds = Array.isArray(preferredOfficeIdsRaw)
          ? preferredOfficeIdsRaw
          : (typeof preferredOfficeIdsRaw === 'string' && preferredOfficeIdsRaw.trim()
            ? (() => {
                try { return JSON.parse(preferredOfficeIdsRaw); } catch { return []; }
              })()
            : []);
        officeRequests.push({
          id: r.id,
          notes: r.notes || '',
          createdAt: r.created_at,
          preferredOfficeIds: Array.isArray(preferredOfficeIds) ? preferredOfficeIds : [],
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
      let schoolAgencyIds = agencyId ? [Number(agencyId)] : [];
      if (includeAllAgencies) {
        try {
          const targetAgencies = await User.getAgencies(providerId);
          schoolAgencyIds = Array.from(new Set(
            (targetAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0)
          ));
        } catch {
          schoolAgencyIds = [];
        }
      }
      if (schoolAgencyIds.length) {
        const placeholders = schoolAgencyIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT
             psa.school_organization_id,
             oa.agency_id,
             a.name AS school_name,
             psa.day_of_week,
             psa.start_time,
             psa.end_time
           FROM provider_school_assignments psa
           JOIN agencies a ON a.id = psa.school_organization_id
           JOIN organization_affiliations oa
             ON oa.organization_id = psa.school_organization_id
            AND oa.agency_id IN (${placeholders})
            AND oa.is_active = TRUE
           WHERE psa.provider_user_id = ?
             AND psa.is_active = TRUE
           ORDER BY FIELD(psa.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday'), psa.start_time ASC`,
          [...schoolAgencyIds, providerId]
        );
        schoolAssignments = (rows || []).map((r) => ({
          schoolOrgId: r.school_organization_id,
          agencyId: Number(r.agency_id || 0) || null,
          schoolName: r.school_name,
          dayOfWeek: r.day_of_week,
          startTime: String(r.start_time || '').slice(0, 5),
          endTime: String(r.end_time || '').slice(0, 5)
        }));
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 4) Office schedule (office_events with slot_state + recurrence metadata)
    const officeEventFrequencyMeta = (r) => {
      const assignedFrequency = String(r.assigned_frequency || '').trim().toUpperCase() || null;
      const bookedFrequency = String(r.booked_frequency || '').trim().toUpperCase() || null;
      const mode = String(r.assignment_availability_mode || '').trim().toUpperCase();
      const since = r.assignment_available_since_date
        ? String(r.assignment_available_since_date).slice(0, 10)
        : null;
      const until = r.assignment_temporary_until_date
        ? String(r.assignment_temporary_until_date).slice(0, 10)
        : null;
      const oneTimeByTemporaryWindow =
        mode === 'TEMPORARY'
        && since
        && until
        && since === until
        && !bookedFrequency;
      let frequency = bookedFrequency || assignedFrequency || null;
      let frequencyLabel = null;
      if (oneTimeByTemporaryWindow) {
        frequency = 'ONCE';
        frequencyLabel = 'Once';
      }       else if (frequency === 'WEEKLY') frequencyLabel = 'Weekly';
      else if (frequency === 'BIWEEKLY') frequencyLabel = 'Every 2 weeks';
      else if (frequency === 'EVERY_3_WEEKS') frequencyLabel = 'Every 3 weeks';
      else if (frequency === 'EVERY_4_WEEKS') frequencyLabel = 'Every 4 weeks';
      else if (frequency === 'MONTHLY') frequencyLabel = 'Monthly';
      else if (frequency === 'ONCE') frequencyLabel = 'Once';
      else if (assignedFrequency || bookedFrequency) {
        frequency = frequency || 'ONCE';
        frequencyLabel = 'Once';
      }
      return { assignedFrequency, bookedFrequency, frequency, frequencyLabel };
    };

    let officeEvents = [];
    try {
      const [rows] = await pool.execute(
        `SELECT
           e.id,
           e.office_location_id,
           e.standing_assignment_id,
           e.booking_plan_id,
           e.assigned_provider_id,
           e.booked_provider_id,
           au.first_name AS assigned_provider_first_name,
           au.last_name AS assigned_provider_last_name,
           bu.first_name AS booked_provider_first_name,
           bu.last_name AS booked_provider_last_name,
           osa.availability_mode AS assignment_availability_mode,
           osa.temporary_extension_count AS assignment_temporary_extension_count,
           osa.assigned_frequency,
           osa.recurrence_group_id AS assignment_recurrence_group_id,
           osa.available_since_date AS assignment_available_since_date,
           osa.temporary_until_date AS assignment_temporary_until_date,
           bp.booked_frequency,
           ol.name AS building_name,
           ol.timezone AS building_timezone,
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
         LEFT JOIN users au ON au.id = e.assigned_provider_id
         LEFT JOIN users bu ON bu.id = e.booked_provider_id
         LEFT JOIN office_standing_assignments osa ON osa.id = e.standing_assignment_id
         LEFT JOIN office_booking_plans bp
           ON bp.standing_assignment_id = e.standing_assignment_id
          AND bp.is_active = TRUE
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id = ?
         WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND e.start_at < ?
           AND e.end_at > ?
         ORDER BY e.start_at ASC`,
        [agencyId, providerId, agencyId, providerId, agencyId, providerId, providerId, windowEnd, windowStart]
      );
      officeEvents = (rows || []).map((r) => {
        const normalizedSlotState = String(r.status || '').trim().toUpperCase() === 'BOOKED'
          ? 'ASSIGNED_BOOKED'
          : r.slot_state;
        const freq = officeEventFrequencyMeta(r);
        const assignedProviderName = [r.assigned_provider_first_name, r.assigned_provider_last_name]
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .join(' ') || null;
        const bookedProviderName = [r.booked_provider_first_name, r.booked_provider_last_name]
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .join(' ') || null;
        return {
        displayStatus: toDisplayStatus({ status: r.status, slotState: normalizedSlotState }),
        id: r.id,
        buildingId: r.office_location_id,
        // Scope badge to the agency used for the office_location_agencies join (provider context).
        agencyId: Number(agencyId || 0) || null,
        standingAssignmentId: Number(r.standing_assignment_id || 0) || null,
        bookingPlanId: Number(r.booking_plan_id || 0) || null,
        recurrenceGroupId: String(r.assignment_recurrence_group_id || '').trim() || null,
        assignedProviderId: Number(r.assigned_provider_id || 0) || null,
        bookedProviderId: Number(r.booked_provider_id || 0) || null,
        providerId: Number(r.booked_provider_id || r.assigned_provider_id || 0) || null,
        assignedProviderName,
        bookedProviderName,
        assignedProviderFullName: assignedProviderName,
        bookedProviderFullName: bookedProviderName,
        buildingName: r.building_name,
        roomId: r.room_id,
        roomNumber: r.room_number,
        roomLabel: r.room_label || r.room_name,
        // office_events are UTC instants — emit ISO with Z so the grid does not treat digits as local wall.
        startAt: toIsoUtcForSchedule(r.start_at) || toMysqlDateTimeWall(r.start_at) || r.start_at,
        endAt: toIsoUtcForSchedule(r.end_at) || toMysqlDateTimeWall(r.end_at) || r.end_at,
        buildingTimezone: String(r.building_timezone || r.timezone || '').trim() || null,
        status: r.status,
        slotState: normalizedSlotState,
        appointmentType: String(r.appointment_type_code || '').trim().toUpperCase() || defaultAppointmentTypeForSlot({ status: r.status, slotState: normalizedSlotState }),
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
        inPersonIntakeEnabled: Number(r.in_person_intake_enabled || 0) === 1,
        assignmentAvailabilityMode: String(r.assignment_availability_mode || '').toUpperCase() || null,
        assignmentTemporaryExtensionCount: Number(r.assignment_temporary_extension_count || 0),
        assignedFrequency: freq.assignedFrequency,
        bookedFrequency: freq.bookedFrequency,
        frequency: freq.frequency,
        frequencyLabel: freq.frequencyLabel
      };
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await pool.execute(
        `SELECT
           e.id,
           e.office_location_id,
           e.standing_assignment_id,
           e.assigned_provider_id,
           e.booked_provider_id,
           osa.availability_mode AS assignment_availability_mode,
           osa.temporary_extension_count AS assignment_temporary_extension_count,
           osa.assigned_frequency,
           osa.available_since_date AS assignment_available_since_date,
           osa.temporary_until_date AS assignment_temporary_until_date,
           ol.name AS building_name,
           ol.timezone AS building_timezone,
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
         LEFT JOIN office_standing_assignments osa ON osa.id = e.standing_assignment_id
         JOIN office_location_agencies ola ON ola.office_location_id = ol.id AND ola.agency_id = ?
         WHERE (e.assigned_provider_id = ? OR e.booked_provider_id = ?)
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND e.start_at < ?
           AND e.end_at > ?
         ORDER BY e.start_at ASC`,
        [agencyId, providerId, agencyId, providerId, agencyId, providerId, providerId, windowEnd, windowStart]
      );
      officeEvents = (rows || []).map((r) => {
        const normalizedSlotState = String(r.status || '').trim().toUpperCase() === 'BOOKED'
          ? 'ASSIGNED_BOOKED'
          : r.slot_state;
        const freq = officeEventFrequencyMeta({ ...r, booked_frequency: null });
        return {
        displayStatus: toDisplayStatus({ status: r.status, slotState: normalizedSlotState }),
        id: r.id,
        buildingId: r.office_location_id,
        agencyId: Number(agencyId || 0) || null,
        standingAssignmentId: Number(r.standing_assignment_id || 0) || null,
        bookingPlanId: null,
        recurrenceGroupId: null,
        assignedProviderId: Number(r.assigned_provider_id || 0) || null,
        bookedProviderId: Number(r.booked_provider_id || 0) || null,
        providerId: Number(r.booked_provider_id || r.assigned_provider_id || 0) || null,
        buildingName: r.building_name,
        roomId: r.room_id,
        roomNumber: r.room_number,
        roomLabel: r.room_label || r.room_name,
        startAt: toIsoUtcForSchedule(r.start_at) || toMysqlDateTimeWall(r.start_at) || r.start_at,
        endAt: toIsoUtcForSchedule(r.end_at) || toMysqlDateTimeWall(r.end_at) || r.end_at,
        buildingTimezone: String(r.building_timezone || '').trim() || null,
        status: r.status,
        slotState: normalizedSlotState,
        appointmentType: defaultAppointmentTypeForSlot({ status: r.status, slotState: normalizedSlotState }),
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
        inPersonIntakeEnabled: Number(r.in_person_intake_enabled || 0) === 1,
        assignmentAvailabilityMode: String(r.assignment_availability_mode || '').toUpperCase() || null,
        assignmentTemporaryExtensionCount: Number(r.assignment_temporary_extension_count || 0),
        assignedFrequency: freq.assignedFrequency,
        bookedFrequency: freq.bookedFrequency,
        frequency: freq.frequency,
        frequencyLabel: freq.frequencyLabel
      };
      });
    }

    // 4b) Supervision sessions (app-scheduled, optionally synced to Google)
    let supervisionSessions = [];
    const supervisionGoogleEventIds = new Set();
    let supervisionJoinUrlBase = null;
    let isVideoConfigured = false;
    try {
      const { isVideoConfigured: videoOk } = await import('../services/video.service.js');
      const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      if (videoOk() && frontendUrl) {
        supervisionJoinUrlBase = frontendUrl;
      }
    } catch {
      // ignore
    }
    try {
      const rows = await SupervisionSession.listForUserInWindow({
        agencyId: includeAllAgencies ? null : agencyId,
        allAgencies: includeAllAgencies,
        userId: providerId,
        windowStart,
        windowEnd
      });
      let signupRows = [];
      try {
        signupRows = await SupervisionSession.listSignupOfferingsForUserInWindow({
          agencyId: includeAllAgencies ? null : agencyId,
          allAgencies: includeAllAgencies,
          userId: providerId,
          windowStart,
          windowEnd
        });
      } catch {
        signupRows = [];
      }
      let openJoinRows = [];
      try {
        openJoinRows = await SupervisionSession.listOpenJoinOfferingsForUserInWindow({
          agencyId: includeAllAgencies ? null : agencyId,
          allAgencies: includeAllAgencies,
          userId: providerId,
          windowStart,
          windowEnd
        });
      } catch {
        openJoinRows = [];
      }
      const mergedRows = [...(rows || [])];
      const seenIds = new Set(mergedRows.map((r) => Number(r?.id || 0)).filter((n) => n > 0));
      for (const row of [...(signupRows || []), ...(openJoinRows || [])]) {
        const id = Number(row?.id || 0);
        if (id > 0 && !seenIds.has(id)) {
          seenIds.add(id);
          mergedRows.push(row);
        }
      }
      const agencyTzMap = new Map();
      const agencyIdsForTz = [...new Set(
        (mergedRows || []).map((r) => Number(r?.agency_id || 0)).filter((n) => n > 0)
      )];
      if (agencyIdsForTz.length) {
        try {
          const placeholders = agencyIdsForTz.map(() => '?').join(',');
          const [tzRows] = await pool.execute(
            `SELECT id, COALESCE(NULLIF(TRIM(timezone), ''), 'America/Denver') AS agency_timezone
             FROM agencies
             WHERE id IN (${placeholders})`,
            agencyIdsForTz
          );
          for (const tzRow of tzRows || []) {
            agencyTzMap.set(Number(tzRow.id), String(tzRow.agency_timezone || 'America/Denver').trim() || 'America/Denver');
          }
        } catch {
          /* optional */
        }
      }
      supervisionSessions = await Promise.all((mergedRows || []).map(async (r) => {
        const gid = String(r?.google_event_id || '').trim();
        if (gid) supervisionGoogleEventIds.add(gid);
        const isSupervisor = Number(r.supervisor_user_id) === Number(providerId);
        const enrollmentMode = String(r.enrollment_mode || 'invited').trim().toLowerCase();
        const isSignupOffering = enrollmentMode === 'signup_only';
        const isOpenJoinOffering = !isSignupOffering && (
          Number(r.is_open_join_offering) === 1
          || r.is_open_join_offering === true
        );
        const sessionType = String(r.session_type || 'individual').trim().toLowerCase();
        const superviseeNames = String(r.supervisee_names || '').trim();
        const oneToOneName = isSupervisor
          ? `${r.supervisee_first_name || ''} ${r.supervisee_last_name || ''}`.trim()
          : `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim();
        const groupDisplay = (isSignupOffering || isOpenJoinOffering)
          ? `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim()
          : (isSupervisor
            ? (superviseeNames || oneToOneName)
            : `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim());
        const otherName = sessionType === 'group' || sessionType === 'triadic' || isSignupOffering || isOpenJoinOffering
          ? groupDisplay
          : oneToOneName;
        const hasViewerRequired = r?.viewer_is_required !== null && r?.viewer_is_required !== undefined;
        const isPrimarySupervisee = Number(r?.supervisee_user_id || 0) === Number(providerId);
        const isRequired = hasViewerRequired ? Number(r.viewer_is_required) === 1 : isPrimarySupervisee;
        const viewerAttendeeStatus = String(r?.viewer_attendee_status || '').trim().toUpperCase();
        const viewerSignedUp = ['SIGNED_UP', 'JOINED', 'INVITED'].includes(viewerAttendeeStatus)
          && viewerAttendeeStatus !== 'WITHDRAWN';
        const signupClosesAt = toIsoUtcForSchedule(r.signup_closes_at) || r.signup_closes_at || null;
        const signupCount = Number(r?.signup_count || 0);
        const startWall = toIsoUtcForSchedule(r.start_at) || toMysqlDateTimeWall(r.start_at) || r.start_at;
        const endWall = toIsoUtcForSchedule(r.end_at) || toMysqlDateTimeWall(r.end_at) || r.end_at;
        const startDateYmd = String(r?.start_date_ymd || '').trim()
          || (startWall ? String(startWall).slice(0, 10) : null);
        let joinToken = String(r.participant_join_token || r.join_token || '').trim();
        let hostJoinToken = String(r.host_join_token || '').trim();
        if (!joinToken && Number(r.id || 0) > 0) {
          joinToken = generateJoinToken();
          try {
            await pool.execute(
              `UPDATE supervision_sessions SET join_token = ? WHERE id = ? AND (join_token IS NULL OR join_token = '')`,
              [joinToken, Number(r.id)]
            );
          } catch {
            joinToken = '';
          }
        }
        if (!hostJoinToken && Number(r.id || 0) > 0) {
          hostJoinToken = generateJoinToken();
          try {
            await pool.execute(
              `UPDATE supervision_sessions
               SET host_join_token = ?
               WHERE id = ? AND (host_join_token IS NULL OR host_join_token = '')`,
              [hostJoinToken, Number(r.id)]
            );
          } catch {
            hostJoinToken = '';
          }
        }
        const joinKey = joinToken || String(r.id || '').trim();
        const waitingRoomEnabled = r.waiting_room_enabled == null
          ? true
          : !(r.waiting_room_enabled === 0 || r.waiting_room_enabled === false || r.waiting_room_enabled === '0');
        const notifyParticipants = r.notify_participants == null
          ? true
          : !(r.notify_participants === 0 || r.notify_participants === false || r.notify_participants === '0');
        const liveEndedAt = r.live_ended_at || null;
        const liveEnded = !!liveEndedAt;
        const joinableSession = !liveEnded;
        return {
          id: r.id,
          role: isSupervisor
            ? 'supervisor'
            : (String(r.viewer_presenter_role || '').trim() ? 'presenter' : 'supervisee'),
          counterpartyName: otherName || null,
          sessionType,
          isRequired,
          presenterRole: r.viewer_presenter_role || null,
          presenterStatus: r.viewer_presenter_status || null,
          presenterNames: String(r.presenter_names || '').trim() || null,
          startAt: startWall,
          endAt: endWall,
          startDateYmd,
          status: r.status,
          modality: r.modality,
          locationText: r.location_text,
          notes: r.notes,
          googleEventId: gid || null,
          googleMeetLink: r.google_meet_link || null,
          joinToken: joinToken || null,
          hostJoinToken: hostJoinToken || null,
          joinUrl: joinableSession ? joinUrlForSupervision(supervisionJoinUrlBase, joinKey) : null,
          participantJoinUrl: joinableSession ? joinUrlForSupervision(supervisionJoinUrlBase, joinKey) : null,
          hostJoinUrl: joinableSession && hostJoinToken
            ? joinUrlForSupervision(supervisionJoinUrlBase, hostJoinToken)
            : null,
          liveEndedAt,
          liveEnded,
          waitingRoomEnabled,
          notifyParticipants,
          superviseeUserId: Number(r.supervisee_user_id || 0) || null,
          supervisorUserId: Number(r.supervisor_user_id || 0) || null,
          superviseeName: `${r.supervisee_first_name || ''} ${r.supervisee_last_name || ''}`.trim() || null,
          supervisorName: `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim() || null,
          agencyId: Number(r.agency_id || agencyId || 0) || null,
          agencyTimezone: agencyTzMap.get(Number(r.agency_id || 0)) || 'America/Denver',
          recurrenceSeriesId: String(r.recurrence_series_id || '').trim() || null,
          recurrenceFrequency: String(r.recurrence_frequency || '').trim().toUpperCase() || null,
          recurrenceIndex: r.recurrence_index == null ? null : Number(r.recurrence_index),
          enrollmentMode,
          isOpenJoinOffering,
          inviteAudienceAllSupervised: !!(r.invite_audience_all_supervised === 1 || r.invite_audience_all_supervised === true),
          inviteAudienceGroupSupport: !!(r.invite_audience_group_support === 1 || r.invite_audience_group_support === true),
          signupClosesAt,
          signupCount,
          viewerSignedUp,
          cancelReason: String(r.cancel_reason || '').trim() || null,
          // Only the supervisor (host) reschedules; supervisees may view/join.
          canReschedule: isSupervisor
            || canCreateProviderScheduleEvent(String(req.user?.role || '').toLowerCase()),
          canEdit: isSupervisor
            || canCreateProviderScheduleEvent(String(req.user?.role || '').toLowerCase())
        };
      }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      supervisionSessions = [];
    }

    // 4c) Provider schedule events (personal/hold/indirect)
    // includeAllAgencies: return every tenant the provider is booked on (not just membership/current org).
    let scheduleEvents = [];
    /** Re-read schedule events after inbound Google sync updates DB times. */
    let rematerializeScheduleEventsAfterGoogleSync = null;
    try {
      try {
        const Checkin = await import('../services/schoolReinitCheckin.service.js');
        await Checkin.repairHostScheduleEventsInWindow({
          providerId,
          windowStart,
          windowEnd,
        });
      } catch (repairErr) {
        console.warn('[schedule-summary] check-in host calendar repair failed', repairErr?.message || repairErr);
      }
      const scheduleListArgs = {
        agencyId: includeAllAgencies ? null : agencyId,
        allAgencies: includeAllAgencies,
        providerId,
        windowStart,
        windowEnd
      };
      const rows = await ProviderScheduleEvent.listForUserInWindow(scheduleListArgs);
      const actorId = Number(req.user?.id || 0);
      const actorRoleForEvents = String(req.user?.role || '').toLowerCase();
      const canSeePrivateTitle = actorId === Number(providerId);
      const canEditScheduleEvents = canSeePrivateTitle
        || canCreateProviderScheduleEvent(actorRoleForEvents)
        || isSupervisorOfTarget;
      let isVideoConfiguredForSchedule = false;
      try {
        const { isVideoConfigured: videoOk } = await import('../services/video.service.js');
        isVideoConfiguredForSchedule = videoOk();
      } catch {
        // ignore
      }

      const mapScheduleRows = (sourceRows) => (sourceRows || []).map((r) => {
        const isPrivate = Number(r.is_private || 0) === 1;
        const titleRaw = String(r.title || '').trim();
        const title = isPrivate && !canSeePrivateTitle
          ? 'Busy'
          : (titleRaw || (SCHEDULE_EVENT_KIND_LABELS[String(r.kind || '').toUpperCase()] || 'Schedule Event'));
        const { startAt: startAtOut, endAt: endAtOut } = scheduleEventStartEndForSummary(r);
        const kind = String(r.kind || '').trim().toUpperCase() || 'PERSONAL_EVENT';
        const meetingJoinKey = String(r.participant_join_token || r.join_token || r.id || '').trim();
        const meetingHostKey = String(r.host_join_token || '').trim();
        const cancelled = String(r.status || '').trim().toUpperCase() === 'CANCELLED';
        const meetingCompletedAt = r.meeting_completed_at || null;
        const meetingCompleted = !!meetingCompletedAt;
        const joinableMeeting = (kind === 'TEAM_MEETING' || kind === 'HUDDLE')
          && isVideoConfiguredForSchedule
          && !cancelled
          && !meetingCompleted;
        const appJoinUrl = (joinableMeeting && meetingJoinKey
          && (r.platform_video_link == null || Number(r.platform_video_link) === 1))
          ? `/join/team-meeting/${encodeURIComponent(meetingJoinKey)}`
          : null;
        const hostJoinUrl = (joinableMeeting && meetingHostKey
          && (r.platform_video_link == null || Number(r.platform_video_link) === 1))
          ? `/join/team-meeting/${encodeURIComponent(meetingHostKey)}`
          : null;
        const waitingRoomEnabled = r.waiting_room_enabled == null
          ? true
          : !(r.waiting_room_enabled === 0 || r.waiting_room_enabled === false || r.waiting_room_enabled === '0');
        const notifyParticipants = r.notify_participants == null
          ? true
          : !(r.notify_participants === 0 || r.notify_participants === false || r.notify_participants === '0');
        const eventProviderId = Number(r.provider_id || 0) || null;
        const createdByUserId = Number(r.created_by_user_id || 0) || null;
        const isHost = !!eventProviderId && eventProviderId === Number(providerId);
        // Attendee-only copies on your calendar are viewable, but edits must target the host provider.
        // Host (or creator / privileged scheduler) may fully edit; invitees may not change time/date.
        const canEditThisEvent = !!canEditScheduleEvents && (
          isHost
          || (createdByUserId != null && createdByUserId === actorId)
          || canCreateProviderScheduleEvent(actorRoleForEvents)
        );
        const meetingSubtypeNorm = (() => {
          const subtype = String(r.meeting_subtype || 'general').trim().toLowerCase();
          if (subtype === 'admin' || subtype === 'town_hall' || subtype === 'interview') return subtype;
          return 'general';
        })();
        return {
          id: Number(r.id || 0),
          agencyId: Number(r.agency_id || 0) || null,
          providerId: eventProviderId,
          createdByUserId,
          isHost,
          hostFirstName: null,
          hostLastName: null,
          hostName: null,
          kind,
          title,
          description: isPrivate && !canSeePrivateTitle
            ? null
            : (String(r.description || '').trim() || null),
          clientId: Number(r.client_id || 0) || null,
          isPrivate,
          allDay: Number(r.all_day || 0) === 1,
          startAt: startAtOut,
          endAt: endAtOut,
          // Zone of record this event's wall-clock was entered in — edit forms must anchor to
          // this instead of re-guessing from whichever office/tenant is selected in the UI.
          timeZone: r.event_timezone || null,
          startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
          endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
          reasonCode: String(r.reason_code || '').trim().toUpperCase() || null,
          recurrenceSeriesId: String(r.recurrence_series_id || '').trim() || null,
          recurrenceFrequency: String(r.recurrence_frequency || '').trim().toUpperCase() || null,
          recurrencePolicy: String(r.recurrence_policy || '').trim().toUpperCase() || null,
          recurrenceIndex: r.recurrence_index == null ? null : Number(r.recurrence_index),
          googleEventId: r.google_event_id || null,
          htmlLink: r.google_html_link || null,
          meetLink: r.google_meet_link ? String(r.google_meet_link).trim().slice(0, 1024) : null,
          appJoinUrl,
          hostJoinUrl,
          participantJoinUrl: appJoinUrl,
          waitingRoomEnabled: (kind === 'TEAM_MEETING' || kind === 'HUDDLE') ? waitingRoomEnabled : null,
          notifyParticipants: (kind === 'TEAM_MEETING' || kind === 'HUDDLE') ? notifyParticipants : null,
          status: String(r.status || 'ACTIVE').trim().toUpperCase() || 'ACTIVE',
          isCancelled: String(r.status || '').trim().toUpperCase() === 'CANCELLED',
          isTrainingPayEligible: Number(r.is_training_pay_eligible || 0) === 1,
          meetingSubtype: meetingSubtypeNorm,
          attendanceTrackingEnabled: (() => {
            if (kind === 'HUDDLE') return true;
            if (meetingSubtypeNorm === 'admin' || meetingSubtypeNorm === 'town_hall' || meetingSubtypeNorm === 'interview') return true;
            return Number(r.attendance_tracking_enabled || 0) === 1;
          })(),
          meetingCompletedAt,
          meetingCompleted,
          canEdit: canEditThisEvent && !cancelled,
          // Default; refined after attendees + host names attach (admin-meeting invitees can reschedule).
          canReschedule: canEditThisEvent && !cancelled,
          outreachTripId: Number(r.outreach_trip_id || 0) || null
        };
      });

      const attachMeetingParticipants = async (events) => {
        let next = events || [];
        try {
          const { enrichScheduleEventsWithPackageContext } = await import(
            '../services/practitionerPackage.service.js'
          );
          next = await enrichScheduleEventsWithPackageContext(next);
        } catch {
          /* package enrichment optional */
        }
        try {
          const hostIds = (next || []).map((e) => Number(e?.providerId || 0)).filter((n) => n > 0);
          const hostNames = await loadHostDisplayNamesByUserIds(hostIds);
          next = (next || []).map((e) => {
            const hid = Number(e?.providerId || 0);
            const host = hostNames.get(hid);
            if (!host) return e;
            return {
              ...e,
              hostFirstName: host.firstName || null,
              hostLastName: host.lastName || null,
              hostName: host.name || null
            };
          });
        } catch {
          /* host names optional */
        }
        try {
          const meetingEventIds = (next || [])
            .filter((e) => ['TEAM_MEETING', 'HUDDLE'].includes(String(e?.kind || '').toUpperCase()))
            .map((e) => Number(e?.id || 0))
            .filter((n) => n > 0);
          if (meetingEventIds.length) {
            const ProviderScheduleEventAttendee = (await import('../models/ProviderScheduleEventAttendee.model.js')).default;
            const byEvent = await ProviderScheduleEventAttendee.listDetailsByEventIds(meetingEventIds);
            let byEventGroups = new Map();
            try {
              const ProviderScheduleEventInviteGroup = (await import('../models/ProviderScheduleEventInviteGroup.model.js')).default;
              byEventGroups = await ProviderScheduleEventInviteGroup.listGroupIdsByEventIds(meetingEventIds);
            } catch {
              /* optional until migration */
            }
            next = (next || []).map((e) => {
              const kind = String(e?.kind || '').toUpperCase();
              if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) return e;
              const eid = Number(e?.id || 0);
              const details = byEvent.get(eid) || [];
              const attendeeUserIds = details.map((d) => Number(d.userId || 0)).filter((n) => n > 0);
              const isAdminMeeting = kind === 'TEAM_MEETING'
                && String(e?.meetingSubtype || '').toLowerCase() === 'admin';
              const cancelled = !!e?.isCancelled
                || String(e?.status || '').trim().toUpperCase() === 'CANCELLED';
              const actorIsInvitee = attendeeUserIds.includes(actorId)
                || Number(e?.providerId || 0) === actorId;
              const canReschedule = !cancelled && (
                !!e?.canEdit
                || (isAdminMeeting && actorIsInvitee)
              );
              return {
                ...e,
                attendeeUserIds,
                invitedGroupIds: (byEventGroups.get(eid) || []).map((n) => Number(n)).filter((n) => n > 0),
                attendees: details.map((d) => {
                  const firstName = String(d.firstName || '').trim();
                  const lastName = String(d.lastName || '').trim();
                  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
                  return {
                    id: Number(d.userId || 0),
                    firstName,
                    lastName,
                    email: d.email || '',
                    // Prefer real names — never surface role labels or bare ids as the primary label.
                    name: name || `User #${d.userId}`
                  };
                }),
                canReschedule
              };
            });
          }
        } catch {
          /* attendees optional */
        }
        // Non-meeting events: canReschedule follows canEdit.
        next = (next || []).map((e) => {
          if (e?.canReschedule != null) return e;
          return { ...e, canReschedule: !!e?.canEdit };
        });
        return next;
      };

      rematerializeScheduleEventsAfterGoogleSync = async () => {
        const freshRows = await ProviderScheduleEvent.listForUserInWindow(scheduleListArgs);
        return attachMeetingParticipants(mapScheduleRows(freshRows));
      };

      scheduleEvents = await attachMeetingParticipants(mapScheduleRows(rows));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      scheduleEvents = [];
    }

    // 4d) Skill Builders — materialized sessions this provider is booked on (per-session assignment)
    try {
      const sbParams = [agencyId, providerId, windowEnd, windowStart];
      const sbSqlBase = `SELECT s.id, s.starts_at, s.ends_at, sg.id AS skills_group_id, ce.title AS event_title, sg.name AS skills_group_name
         FROM skill_builders_event_sessions s
         INNER JOIN skills_groups sg ON sg.id = s.skills_group_id AND sg.agency_id = ?
         INNER JOIN company_events ce ON ce.id = s.company_event_id
         INNER JOIN skill_builders_event_session_providers sbesp
           ON sbesp.session_id = s.id AND sbesp.provider_user_id = ?
         WHERE s.starts_at < ? AND s.ends_at > ?
         ORDER BY s.starts_at ASC, s.id ASC
         LIMIT 400`;
      let sbRows;
      try {
        const [rows] = await pool.execute(
          `SELECT s.id, s.starts_at, s.ends_at, sg.id AS skills_group_id, ce.title AS event_title, sg.name AS skills_group_name,
                  ce.employee_report_time, ce.employee_departure_time
           FROM skill_builders_event_sessions s
           INNER JOIN skills_groups sg ON sg.id = s.skills_group_id AND sg.agency_id = ?
           INNER JOIN company_events ce ON ce.id = s.company_event_id
           INNER JOIN skill_builders_event_session_providers sbesp
             ON sbesp.session_id = s.id AND sbesp.provider_user_id = ?
           WHERE s.starts_at < ? AND s.ends_at > ?
           ORDER BY s.starts_at ASC, s.id ASC
           LIMIT 400`,
          sbParams
        );
        sbRows = rows;
      } catch (e) {
        // Migration 586 (employee_report_time / employee_departure_time) may not be applied yet.
        if (e?.errno === 1054 || e?.code === 'ER_BAD_FIELD_ERROR') {
          const [rows] = await pool.execute(sbSqlBase, sbParams);
          sbRows = rows;
        } else {
          throw e;
        }
      }
      /** @type {Map<number, { userId: number, firstName: string, lastName: string }[]>} */
      const sbProvidersBySession = new Map();
      const sbSessionIds = (sbRows || [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (sbSessionIds.length) {
        try {
          const ph = sbSessionIds.map(() => '?').join(',');
          const [provRows] = await pool.execute(
            `SELECT p.session_id, u.id AS user_id, u.first_name, u.last_name
             FROM skill_builders_event_session_providers p
             INNER JOIN users u ON u.id = p.provider_user_id
             WHERE p.session_id IN (${ph})
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            sbSessionIds
          );
          for (const pr of provRows || []) {
            const sid = Number(pr.session_id);
            if (!sbProvidersBySession.has(sid)) sbProvidersBySession.set(sid, []);
            sbProvidersBySession.get(sid).push({
              userId: Number(pr.user_id),
              firstName: String(pr.first_name || '').trim(),
              lastName: String(pr.last_name || '').trim()
            });
          }
        } catch (e) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }
      /** @type {Map<number, { userId: number, firstName: string, lastName: string }[]>} */
      const sbRosterByGroup = new Map();
      const sbGroupIds = [
        ...new Set(
          (sbRows || [])
            .map((row) => Number(row.skills_group_id))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      ];
      if (sbGroupIds.length) {
        const gph = sbGroupIds.map(() => '?').join(',');
        const [rosterRows] = await pool.execute(
          `SELECT sgp.skills_group_id, u.id AS user_id, u.first_name, u.last_name
           FROM skills_group_providers sgp
           INNER JOIN users u ON u.id = sgp.provider_user_id
           WHERE sgp.skills_group_id IN (${gph})
           ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
          sbGroupIds
        );
        for (const rr of rosterRows || []) {
          const gid = Number(rr.skills_group_id);
          if (!sbRosterByGroup.has(gid)) sbRosterByGroup.set(gid, []);
          sbRosterByGroup.get(gid).push({
            userId: Number(rr.user_id),
            firstName: String(rr.first_name || '').trim(),
            lastName: String(rr.last_name || '').trim()
          });
        }
      }
      const sbWallTime = (v) => (v != null && v !== '' ? String(v).slice(0, 8) : null);
      for (const r of sbRows || []) {
        const startAtOut =
          toIsoUtcForSchedule(r.starts_at) || toMysqlDateTimeWall(r.starts_at) || r.starts_at || null;
        const endAtOut = toIsoUtcForSchedule(r.ends_at) || toMysqlDateTimeWall(r.ends_at) || r.ends_at || null;
        if (!startAtOut || !endAtOut) continue;
        const sgName = String(r.skills_group_name || '').trim();
        const evTitle = String(r.event_title || '').trim();
        const title = [sgName, evTitle].filter(Boolean).join(' · ') || 'Skill Builders program';
        const sid = Number(r.id);
        const skillsGroupId = Number(r.skills_group_id);
        scheduleEvents.push({
          id: sid,
          agencyId: Number(agencyId),
          kind: 'SKILL_BUILDERS_PROGRAM',
          title,
          isPrivate: false,
          allDay: false,
          startAt: startAtOut,
          endAt: endAtOut,
          startDate: null,
          endDate: null,
          reasonCode: null,
          recurrenceSeriesId: null,
          recurrenceFrequency: null,
          recurrencePolicy: null,
          recurrenceIndex: null,
          googleEventId: null,
          htmlLink: null,
          meetLink: null,
          appJoinUrl: null,
          employeeReportTime: sbWallTime(r.employee_report_time),
          employeeDepartureTime: sbWallTime(r.employee_departure_time),
          assignedSessionProviders: sbProvidersBySession.get(sid) || [],
          groupRosterProviders: Number.isFinite(skillsGroupId) && skillsGroupId > 0
            ? sbRosterByGroup.get(skillsGroupId) || []
            : []
        });
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 4e) Program / company event session bookings (facilitator staffing assignments)
    try {
      const ceParams = [providerId, agencyId, windowEnd, windowStart, weekStart, weekEnd];
      const [ceRows] = await pool.execute(
        `SELECT cesd.id AS session_date_id,
                cesd.session_date,
                cesd.starts_at,
                cesd.ends_at,
                cesd.timezone,
                cesd.location_label,
                ce.id AS company_event_id,
                ce.title AS event_title,
                ce.event_type,
                ce.employee_report_time,
                ce.employee_departure_time,
                sch.name AS school_name,
                cesp.assignment_status
         FROM company_event_session_providers cesp
         INNER JOIN company_event_session_dates cesd ON cesd.id = cesp.session_date_id
         INNER JOIN company_events ce ON ce.id = cesp.company_event_id
         LEFT JOIN agencies sch ON sch.id = ce.organization_id
         WHERE cesp.provider_user_id = ?
           AND cesp.agency_id = ?
           AND ce.is_active = 1
           AND (
             (cesd.starts_at IS NOT NULL AND cesd.ends_at IS NOT NULL AND cesd.starts_at < ? AND cesd.ends_at > ?)
             OR (cesd.session_date >= ? AND cesd.session_date < ?)
           )
         ORDER BY COALESCE(cesd.starts_at, CONCAT(cesd.session_date, ' 00:00:00')) ASC, cesd.id ASC
         LIMIT 400`,
        ceParams
      );

      const ceSessionDateIds = [
        ...new Set(
          (ceRows || [])
            .map((row) => Number(row.session_date_id))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      ];
      const ceCompanyEventIds = [
        ...new Set(
          (ceRows || [])
            .map((row) => Number(row.company_event_id))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      ];

      /** @type {Map<number, { kioskEventPinSet: boolean, kioskEventPinCode: string|null }>} */
      const ceKioskByEventId = new Map();
      if (ceCompanyEventIds.length) {
        try {
          const ph = ceCompanyEventIds.map(() => '?').join(',');
          const [kioskRows] = await pool.execute(
            `SELECT id, kiosk_event_pin_hash, kiosk_event_pin_code
             FROM company_events
             WHERE agency_id = ? AND id IN (${ph})`,
            [agencyId, ...ceCompanyEventIds]
          );
          for (const kr of kioskRows || []) {
            const eid = Number(kr.id);
            const pinSet = !!(kr.kiosk_event_pin_hash && String(kr.kiosk_event_pin_hash).trim());
            ceKioskByEventId.set(eid, {
              kioskEventPinSet: pinSet,
              kioskEventPinCode:
                pinSet && kr.kiosk_event_pin_code ? String(kr.kiosk_event_pin_code).trim() : null
            });
          }
        } catch (e) {
          if (!(e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.sqlMessage || '').includes('kiosk_event_pin'))) {
            throw e;
          }
        }
      }

      /** @type {Map<number, { userId: number, firstName: string, lastName: string }[]>} */
      const ceProvidersBySessionDateId = new Map();
      if (ceSessionDateIds.length) {
        try {
          const ph = ceSessionDateIds.map(() => '?').join(',');
          const [provRows] = await pool.execute(
            `SELECT cesp.session_date_id, u.id AS user_id, u.first_name, u.last_name
             FROM company_event_session_providers cesp
             INNER JOIN users u ON u.id = cesp.provider_user_id
             WHERE cesp.agency_id = ? AND cesp.session_date_id IN (${ph})
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            [agencyId, ...ceSessionDateIds]
          );
          for (const pr of provRows || []) {
            const sid = Number(pr.session_date_id);
            if (!ceProvidersBySessionDateId.has(sid)) ceProvidersBySessionDateId.set(sid, []);
            ceProvidersBySessionDateId.get(sid).push({
              userId: Number(pr.user_id),
              firstName: String(pr.first_name || '').trim(),
              lastName: String(pr.last_name || '').trim()
            });
          }
        } catch (e) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }

      /** @type {Map<number, { userId: number, firstName: string, lastName: string }[]>} */
      const ceEventRosterByEventId = new Map();
      if (ceCompanyEventIds.length) {
        try {
          const ph = ceCompanyEventIds.map(() => '?').join(',');
          const [rosterRows] = await pool.execute(
            `SELECT cepa.company_event_id, u.id AS user_id, u.first_name, u.last_name
             FROM company_event_provider_assignments cepa
             INNER JOIN users u ON u.id = cepa.provider_user_id
             WHERE cepa.company_event_id IN (${ph})
             ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
            ceCompanyEventIds
          );
          for (const rr of rosterRows || []) {
            const eid = Number(rr.company_event_id);
            if (!ceEventRosterByEventId.has(eid)) ceEventRosterByEventId.set(eid, []);
            ceEventRosterByEventId.get(eid).push({
              userId: Number(rr.user_id),
              firstName: String(rr.first_name || '').trim(),
              lastName: String(rr.last_name || '').trim()
            });
          }
        } catch (e) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }

      const ageFromDateOfBirth = (dob) => {
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
      };

      /** @type {Map<number, { count: number, ages: number[] }>} */
      const ceParticipantsByEventId = new Map();
      if (ceCompanyEventIds.length) {
        try {
          const ph = ceCompanyEventIds.map(() => '?').join(',');
          const [partRows] = await pool.execute(
            `SELECT cec.company_event_id, c.date_of_birth
             FROM company_event_clients cec
             INNER JOIN clients c ON c.id = cec.client_id AND c.agency_id = cec.agency_id
             WHERE cec.agency_id = ?
               AND cec.company_event_id IN (${ph})
               AND (cec.is_active = TRUE OR cec.is_active IS NULL)
               AND cec.intake_outcome = 'accepted'
               AND (cec.intake_outcome IS NULL OR cec.intake_outcome <> 'denied')`,
            [agencyId, ...ceCompanyEventIds]
          );
          for (const pr of partRows || []) {
            const eid = Number(pr.company_event_id);
            if (!ceParticipantsByEventId.has(eid)) {
              ceParticipantsByEventId.set(eid, { count: 0, ages: [] });
            }
            const bucket = ceParticipantsByEventId.get(eid);
            bucket.count += 1;
            const age = ageFromDateOfBirth(pr.date_of_birth);
            if (age != null) bucket.ages.push(age);
          }
        } catch (e) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }

      const assignmentStatusLabel = (status) => {
        const s = String(status || 'draft').toLowerCase();
        if (s === 'finalized') return 'Confirmed';
        if (s === 'tentative') return 'Tentative';
        if (s === 'draft') return 'Draft';
        return s;
      };
      for (const r of ceRows || []) {
        const eventType = String(r.event_type || '').trim().toLowerCase();
        const isSchoolEvent = eventType.startsWith('school_');
        const schoolName = String(r.school_name || '').trim();
        let evTitle = String(r.event_title || '').trim()
          || (isSchoolEvent ? 'School event' : 'Program event');
        if (isSchoolEvent && schoolName && !evTitle.toLowerCase().includes(schoolName.toLowerCase())) {
          evTitle = `${evTitle} — ${schoolName}`;
        }
        const status = String(r.assignment_status || 'draft');
        const statusLabel = assignmentStatusLabel(status);
        const title = statusLabel === 'Confirmed' ? evTitle : `${evTitle} (${statusLabel})`;
        const sessionDateId = Number(r.session_date_id);
        const companyEventId = Number(r.company_event_id) || null;
        const kiosk = companyEventId ? ceKioskByEventId.get(companyEventId) || {} : {};
        const participants = companyEventId
          ? ceParticipantsByEventId.get(companyEventId) || { count: 0, ages: [] }
          : { count: 0, ages: [] };
        const sessionProviders = ceProvidersBySessionDateId.get(sessionDateId) || [];
        const eventRosterProviders =
          companyEventId && Number.isFinite(companyEventId)
            ? ceEventRosterByEventId.get(companyEventId) || []
            : [];
        const bookingExtras = {
          companyEventId,
          sessionDateId,
          eventType: eventType || null,
          isSchoolPortalEvent: isSchoolEvent,
          schoolName: schoolName || null,
          kioskEventPinSet: !!kiosk.kioskEventPinSet,
          kioskEventPinCode: kiosk.kioskEventPinCode || null,
          sessionProviders,
          eventRosterProviders,
          participantCount: participants.count,
          participantAges: [...participants.ages].sort((a, b) => a - b),
          employeeReportTime: reportTime || null,
          employeeDepartureTime: departureTime || null
        };
        const startRaw = r.starts_at;
        const endRaw = r.ends_at;
        const dateOnly = r.session_date ? String(r.session_date).slice(0, 10) : null;
        // Use employee_report_time (TIME) on the session date as the calendar start when set,
        // so the block begins at the staff report time rather than the public event start.
        const reportTime = r.employee_report_time ? String(r.employee_report_time).slice(0, 8) : null;
        const departureTime = r.employee_departure_time ? String(r.employee_departure_time).slice(0, 8) : null;
        if (startRaw && endRaw) {
          let startAtOut = toIsoUtcForSchedule(startRaw) || toMysqlDateTimeWall(startRaw) || startRaw;
          let endAtOut = toIsoUtcForSchedule(endRaw) || toMysqlDateTimeWall(endRaw) || endRaw;
          if (!startAtOut || !endAtOut) continue;
          // Override start with report_time when available (keep same date, replace time).
          if (reportTime && dateOnly) {
            const reportWall = `${dateOnly} ${reportTime}`;
            startAtOut = toIsoUtcForSchedule(reportWall) || toMysqlDateTimeWall(reportWall) || reportWall;
          }
          // Override end with departure_time when available.
          if (departureTime && dateOnly) {
            const departureWall = `${dateOnly} ${departureTime}`;
            endAtOut = toIsoUtcForSchedule(departureWall) || toMysqlDateTimeWall(departureWall) || departureWall;
          }
          scheduleEvents.push({
            id: sessionDateId,
            agencyId: Number(agencyId),
            kind: 'COMPANY_EVENT_BOOKING',
            title,
            isPrivate: false,
            allDay: false,
            startAt: startAtOut,
            endAt: endAtOut,
            startDate: null,
            endDate: null,
            reasonCode: null,
            recurrenceSeriesId: null,
            recurrenceFrequency: null,
            recurrencePolicy: null,
            recurrenceIndex: null,
            googleEventId: null,
            htmlLink: null,
            meetLink: null,
            appJoinUrl: null,
            assignmentStatus: status,
            assignmentStatusLabel: statusLabel,
            locationLabel: (r.location_label ? String(r.location_label).trim() : null) || schoolName || null,
            timezone: r.timezone ? String(r.timezone).trim() : null,
            ...bookingExtras
          });
        } else if (dateOnly) {
          // When session has no starts_at/ends_at but we have report_time + departure_time,
          // convert to a timed block so it appears correctly on the schedule grid.
          const reportWall = reportTime ? `${dateOnly} ${reportTime}` : null;
          const departureWall = departureTime ? `${dateOnly} ${departureTime}` : null;
          const timedStartOut = reportWall
            ? (toIsoUtcForSchedule(reportWall) || toMysqlDateTimeWall(reportWall) || reportWall)
            : null;
          const timedEndOut = departureWall
            ? (toIsoUtcForSchedule(departureWall) || toMysqlDateTimeWall(departureWall) || departureWall)
            : null;
          scheduleEvents.push({
            id: sessionDateId,
            agencyId: Number(agencyId),
            kind: 'COMPANY_EVENT_BOOKING',
            title,
            isPrivate: false,
            allDay: !timedStartOut || !timedEndOut,
            startAt: timedStartOut || null,
            endAt: timedEndOut || null,
            startDate: (!timedStartOut || !timedEndOut) ? dateOnly : null,
            endDate: (!timedStartOut || !timedEndOut) ? addDaysYmd(dateOnly, 1) : null,
            reasonCode: null,
            recurrenceSeriesId: null,
            recurrenceFrequency: null,
            recurrencePolicy: null,
            recurrenceIndex: null,
            googleEventId: null,
            htmlLink: null,
            meetLink: null,
            appJoinUrl: null,
            assignmentStatus: status,
            assignmentStatusLabel: statusLabel,
            locationLabel: (r.location_label ? String(r.location_label).trim() : null) || schoolName || null,
            timezone: r.timezone ? String(r.timezone).trim() : null,
            ...bookingExtras
          });
        }
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 4f) Open school/company events in the week window that the provider is NOT already assigned to.
    //     These appear as COMPANY_EVENT_OPEN so providers can see what's available and sign up.
    //     Only events with staffing signup enabled (or school outreach) that are not yet fully staffed.
    try {
      const schoolTypeList = [
        'school_back_to_school', 'school_fall_check_in', 'school_spring_event',
        'school_first_day', 'school_open_house', 'school_resource_fair',
        'school_family_night', 'school_orientation', 'school_holiday',
        'school_day_off', 'school_other'
      ];
      const stPh = schoolTypeList.map(() => '?').join(',');
      const [openRows] = await pool.execute(
        `SELECT cesd.id AS session_date_id,
                cesd.session_date,
                cesd.starts_at,
                cesd.ends_at,
                cesd.timezone,
                cesd.location_label,
                ce.id AS company_event_id,
                ce.title AS event_title,
                ce.event_type,
                ce.staffing_config_json,
                ce.outreach_table_invited,
                ce.employee_report_time,
                ce.employee_departure_time,
                sch.name AS school_name,
                COUNT(cesp_all.provider_user_id) AS assigned_count
         FROM company_event_session_dates cesd
         INNER JOIN company_events ce ON ce.id = cesd.company_event_id
           AND ce.agency_id = ?
           AND ce.is_active = 1
           AND ce.event_type IN (${stPh})
           AND NOT EXISTS (
             SELECT 1 FROM skills_groups sg
             WHERE sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
           )
         LEFT JOIN agencies sch ON sch.id = ce.organization_id
         LEFT JOIN company_event_session_providers cesp_all
           ON cesp_all.session_date_id = cesd.id
         WHERE (
             (cesd.starts_at IS NOT NULL AND cesd.ends_at IS NOT NULL AND cesd.starts_at < ? AND cesd.ends_at > ?)
             OR (cesd.session_date >= ? AND cesd.session_date < ?)
           )
           AND NOT EXISTS (
             SELECT 1 FROM company_event_session_providers cesp_me
             WHERE cesp_me.session_date_id = cesd.id AND cesp_me.provider_user_id = ?
           )
         GROUP BY cesd.id, ce.id
         ORDER BY COALESCE(cesd.starts_at, CONCAT(cesd.session_date, ' 00:00:00')) ASC, cesd.id ASC
         LIMIT 200`,
        [agencyId, ...schoolTypeList, windowEnd, windowStart, weekStart, weekEnd, providerId]
      );

      for (const r of openRows || []) {
        // Only show if staffing signup is open for this event.
        const eventType = String(r.event_type || '').trim().toLowerCase();
        let staffingEnabled = false;
        try {
          const cfg = r.staffing_config_json
            ? (typeof r.staffing_config_json === 'string' ? JSON.parse(r.staffing_config_json) : r.staffing_config_json)
            : null;
          if (cfg?.enabled && cfg?.providerSignup?.enabled !== false) staffingEnabled = true;
        } catch { /* ignore */ }
        const isOutreach = !!(r.outreach_table_invited === 1 || r.outreach_table_invited === true);
        if (!staffingEnabled && !isOutreach) continue;

        const sessionDateId = Number(r.session_date_id);
        const companyEventId = Number(r.company_event_id) || null;
        const isSchoolEvent = eventType.startsWith('school_');
        const schoolName = String(r.school_name || '').trim();
        const evTitle = String(r.event_title || '').trim() || (isSchoolEvent ? 'School event' : 'Program event');
        const title = isSchoolEvent && schoolName && !evTitle.toLowerCase().includes(schoolName.toLowerCase())
          ? `${evTitle} — ${schoolName}`
          : evTitle;

        const reportTime4f = r.employee_report_time ? String(r.employee_report_time).slice(0, 8) : null;
        const departureTime4f = r.employee_departure_time ? String(r.employee_departure_time).slice(0, 8) : null;
        const dateOnly4f = r.session_date ? String(r.session_date).slice(0, 10) : null;
        const startRaw4f = r.starts_at;
        const endRaw4f = r.ends_at;

        let startAtOut4f = null;
        let endAtOut4f = null;
        let allDay4f = false;
        let startDate4f = null;
        let endDate4f = null;

        if (startRaw4f && endRaw4f) {
          startAtOut4f = toIsoUtcForSchedule(startRaw4f) || toMysqlDateTimeWall(startRaw4f) || startRaw4f;
          endAtOut4f = toIsoUtcForSchedule(endRaw4f) || toMysqlDateTimeWall(endRaw4f) || endRaw4f;
          if (reportTime4f && dateOnly4f) {
            const rw = `${dateOnly4f} ${reportTime4f}`;
            startAtOut4f = toIsoUtcForSchedule(rw) || toMysqlDateTimeWall(rw) || rw;
          }
          if (departureTime4f && dateOnly4f) {
            const dw = `${dateOnly4f} ${departureTime4f}`;
            endAtOut4f = toIsoUtcForSchedule(dw) || toMysqlDateTimeWall(dw) || dw;
          }
        } else if (dateOnly4f) {
          const rw = reportTime4f ? `${dateOnly4f} ${reportTime4f}` : null;
          const dw = departureTime4f ? `${dateOnly4f} ${departureTime4f}` : null;
          if (rw && dw) {
            startAtOut4f = toIsoUtcForSchedule(rw) || toMysqlDateTimeWall(rw) || rw;
            endAtOut4f = toIsoUtcForSchedule(dw) || toMysqlDateTimeWall(dw) || dw;
          } else {
            allDay4f = true;
            startDate4f = dateOnly4f;
            endDate4f = addDaysYmd(dateOnly4f, 1);
          }
        }

        if (!startAtOut4f && !allDay4f) continue;

        scheduleEvents.push({
          id: sessionDateId,
          agencyId: Number(agencyId),
          kind: 'COMPANY_EVENT_OPEN',
          title,
          isPrivate: false,
          allDay: allDay4f,
          startAt: startAtOut4f || null,
          endAt: endAtOut4f || null,
          startDate: startDate4f,
          endDate: endDate4f,
          reasonCode: null,
          recurrenceSeriesId: null,
          recurrenceFrequency: null,
          recurrencePolicy: null,
          recurrenceIndex: null,
          googleEventId: null,
          htmlLink: null,
          meetLink: null,
          appJoinUrl: null,
          assignmentStatus: null,
          assignmentStatusLabel: null,
          locationLabel: (r.location_label ? String(r.location_label).trim() : null) || schoolName || null,
          timezone: r.timezone ? String(r.timezone).trim() : null,
          companyEventId,
          sessionDateId,
          eventType: eventType || null,
          isSchoolPortalEvent: isSchoolEvent,
          schoolName: schoolName || null,
          employeeReportTime: reportTime4f || null,
          employeeDepartureTime: departureTime4f || null
        });
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
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

    // Peer busy / “show all ICS feeds” — load every active Therapy Notes calendar for this provider.
    if (includeAllExternalCalendars && !externalCalendarIds.length) {
      externalCalendarIds = (externalCalendarsAvailable || [])
        .map((c) => Number(c?.id || 0))
        .filter((n) => Number.isInteger(n) && n > 0);
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

    // Fetch Google events when the overlay is requested, OR when we have linked app rows
    // to reconcile (inbound sync: move/cancel in Google → update app DB).
    const scheduleGoogleEventIds = new Set(
      (scheduleEvents || [])
        .map((e) => String(e?.googleEventId || e?.google_event_id || '').trim())
        .filter(Boolean)
    );
    const needsGoogleInboundSync = scheduleGoogleEventIds.size > 0 || supervisionGoogleEventIds.size > 0;
    if (includeGoogleEvents || needsGoogleInboundSync) {
      try {
        const providerEmail = String(provider?.email || '').trim().toLowerCase();
        const r = await GoogleCalendarService.listEvents({
          subjectEmail: providerEmail,
          timeMin: timeMinIso,
          timeMax: timeMaxIso,
          calendarId: 'primary',
          maxItems: 250
        });
        if (r?.ok || needsGoogleInboundSync) {
          const listed = r?.ok ? (r.events || []) : [];
          // Inbound sync: pull Google start/end (and cancellations) into linked app rows.
          // Must run before overlay dedupe so linked IDs are still present in `listed`.
          // Also runs with an empty list so getEvent can still catch moves/cancels.
          if (needsGoogleInboundSync) {
            try {
              const { reconcileGoogleLinkedSchedule } = await import(
                '../services/googleScheduleInboundSync.service.js'
              );
              const reconciled = await reconcileGoogleLinkedSchedule({
                viewedProviderId: providerId,
                viewedProviderEmail: providerEmail,
                scheduleEvents,
                supervisionSessions,
                googleEvents: listed,
                windowStart,
                windowEnd,
                actorUserId: Number(req.user?.id || 0) || null
              });
              if (reconciled.rematerialize && typeof rematerializeScheduleEventsAfterGoogleSync === 'function') {
                scheduleEvents = await rematerializeScheduleEventsAfterGoogleSync();
              } else {
                scheduleEvents = reconciled.scheduleEvents;
              }
              supervisionSessions = reconciled.supervisionSessions;
              // Refresh linked-id set after cancels / updates.
              scheduleGoogleEventIds.clear();
              for (const e of scheduleEvents || []) {
                const gid = String(e?.googleEventId || e?.google_event_id || '').trim();
                if (gid) scheduleGoogleEventIds.add(gid);
              }
              supervisionGoogleEventIds.clear();
              for (const s of supervisionSessions || []) {
                const gid = String(s?.googleEventId || s?.google_event_id || '').trim();
                if (gid) supervisionGoogleEventIds.add(gid);
              }
            } catch (syncErr) {
              console.warn('[schedule-summary] google inbound sync failed', syncErr?.message || syncErr);
            }
          }

          if (includeGoogleEvents && r?.ok) {
            let events = isAdminOrSuperAdmin(req)
              ? listed
              : listed.map((event) => sanitizeGoogleEventForSchedule(event));
            // Exclude Google events that already have first-class app rows.
            if (supervisionGoogleEventIds.size || scheduleGoogleEventIds.size) {
              events = events.filter((ev) => {
                const id = String(ev?.id || '').trim();
                if (!id) return true;
                if (supervisionGoogleEventIds.has(id)) return false;
                if (scheduleGoogleEventIds.has(id)) return false;
                return true;
              });
            }
            googleEvents = events;
          } else if (includeGoogleEvents && !r?.ok) {
            googleEventsError = r?.error || r?.reason || 'Google events are not available';
          }
        } else if (includeGoogleEvents) {
          googleEventsError = r?.error || r?.reason || 'Google events are not available';
        }
      } catch {
        if (includeGoogleEvents) {
          googleEvents = [];
          googleEventsError = 'Google events lookup failed';
        }
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
            events: r?.ok ? (r.events || r.busy || []) : [],
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

    let videoConfigured = false;
    try {
      const { isVideoConfigured: videoOk } = await import('../services/video.service.js');
      videoConfigured = videoOk();
    } catch {
      // ignore
    }

    const scheduleAgencyIdSet = new Set();
    if (agencyId) scheduleAgencyIdSet.add(Number(agencyId));
    for (const ev of scheduleEvents || []) {
      const aid = Number(ev?.agencyId || 0);
      if (aid > 0) scheduleAgencyIdSet.add(aid);
    }
    for (const ev of officeEvents || []) {
      const aid = Number(ev?.agencyId || 0);
      if (aid > 0) scheduleAgencyIdSet.add(aid);
    }
    try {
      const targetAgencies = await User.getAgencies(providerId);
      for (const a of targetAgencies || []) {
        const aid = Number(a?.id || 0);
        if (aid > 0) scheduleAgencyIdSet.add(aid);
      }
    } catch {
      // ignore
    }

    // Portal / virtual intake hours (Open for new clients) — recurring weekly windows.
    let virtualWorkingHours = [];
    try {
      const ProviderVirtualWorkingHours = (await import('../models/ProviderVirtualWorkingHours.model.js')).default;
      const agencyIdsForVwh = includeAllAgencies
        ? Array.from(scheduleAgencyIdSet.values())
        : (agencyId ? [Number(agencyId)] : []);
      const seenVwh = new Set();
      for (const aid of agencyIdsForVwh) {
        if (!aid) continue;
        const rows = await ProviderVirtualWorkingHours.listForProvider({ agencyId: aid, providerId });
        for (const r of rows || []) {
          const sessionType = String(r?.sessionType || 'REGULAR').toUpperCase();
          const forIntake = r?.availableForIntake === true
            || r?.availableForIntake === 1
            || ['INTAKE', 'BOTH'].includes(sessionType);
          // Grid "Open" marker is for intake-capable availability (never labeled "for intake").
          if (!forIntake) continue;
          const key = `${aid}|${r.dayOfWeek}|${r.startTime}|${r.endTime}|${sessionType}`;
          if (seenVwh.has(key)) continue;
          seenVwh.add(key);
          virtualWorkingHours.push({
            id: Number(r?.id || 0) || null,
            agencyId: aid,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            sessionType,
            availableForIntake: !!forIntake,
            availableForSession: !!(r?.availableForSession === true
              || r?.availableForSession === 1
              || ['REGULAR', 'BOTH'].includes(sessionType)),
            frequency: String(r?.frequency || 'WEEKLY').toUpperCase()
          });
        }
      }
    } catch {
      virtualWorkingHours = [];
    }

    // Enrich overlays with canonical appointmentId when linked (unified booking).
    try {
      const Appointment = (await import('../models/Appointment.model.js')).default;
      const officeIds = (officeEvents || []).map((e) => Number(e?.id || 0)).filter((n) => n > 0);
      const pseIds = (scheduleEvents || []).map((e) => Number(e?.id || 0)).filter((n) => n > 0);
      const [officeApptMap, pseApptMap] = await Promise.all([
        Appointment.listIdsByOfficeEventIds(officeIds),
        Appointment.listIdsByProviderScheduleEventIds(pseIds)
      ]);
      if (officeApptMap.size) {
        officeEvents = (officeEvents || []).map((e) => {
          const aid = officeApptMap.get(Number(e?.id || 0));
          return aid ? { ...e, appointmentId: aid } : e;
        });
      }
      if (pseApptMap.size) {
        scheduleEvents = (scheduleEvents || []).map((e) => {
          const aid = pseApptMap.get(Number(e?.id || 0));
          return aid ? { ...e, appointmentId: aid } : e;
        });
      }
    } catch {
      /* appointments table optional until migration */
    }

    // Fall school visit bookings: resolve school via booking rows (not PSE.agency_id alone —
    // older booked PSEs may still point at the tenant agency and would show ITSCO branding).
    try {
      const bookedPseIds = (scheduleEvents || [])
        .filter((ev) => String(ev?.kind || '').toUpperCase() === 'FALL_CHECKIN_BOOKED')
        .map((ev) => Number(ev?.id || 0))
        .filter((n) => n > 0);
      const schoolByPseId = new Map();
      if (bookedPseIds.length) {
        const placeholders = bookedPseIds.map(() => '?').join(',');
        const [bookingSchoolRows] = await pool.execute(
          `SELECT he.provider_schedule_event_id AS pse_id,
                  b.school_agency_id,
                  b.location_text AS booking_location_text,
                  a.id AS school_id,
                  a.name AS school_name,
                  a.street_address, a.city, a.state, a.postal_code,
                  a.logo_url, a.logo_path, i.file_path AS icon_file_path
           FROM school_reinit_checkin_slot_host_events he
           INNER JOIN school_reinit_checkin_slots s ON s.id = he.slot_id
           INNER JOIN school_reinit_checkin_bookings b
             ON b.slot_id = s.id AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled')
           INNER JOIN agencies a ON a.id = b.school_agency_id
           LEFT JOIN icons i ON a.icon_id = i.id
           WHERE he.provider_schedule_event_id IN (${placeholders})`,
          bookedPseIds
        );
        for (const r of bookingSchoolRows || []) {
          const pseId = Number(r.pse_id || 0);
          if (pseId > 0) schoolByPseId.set(pseId, r);
        }
      }

      // Fallback: PSE.agency_id already set to the school org.
      const fallbackAgencyIds = new Set();
      for (const ev of scheduleEvents || []) {
        if (String(ev?.kind || '').toUpperCase() !== 'FALL_CHECKIN_BOOKED') continue;
        if (schoolByPseId.has(Number(ev?.id || 0))) continue;
        const aid = Number(ev?.agencyId || 0);
        if (aid > 0) fallbackAgencyIds.add(aid);
      }
      const schoolByAgencyId = new Map();
      if (fallbackAgencyIds.size) {
        const ids = Array.from(fallbackAgencyIds.values());
        const placeholders = ids.map(() => '?').join(',');
        const [schoolRows] = await pool.execute(
          `SELECT a.id, a.name AS school_name, a.street_address,
                  a.city, a.state, a.postal_code, a.logo_url, a.logo_path, i.file_path AS icon_file_path
           FROM agencies a
           LEFT JOIN icons i ON a.icon_id = i.id
           WHERE a.id IN (${placeholders})`,
          ids
        );
        for (const r of schoolRows || []) schoolByAgencyId.set(Number(r.id), r);
      }

      const repairPseAgencyIds = [];
      scheduleEvents = (scheduleEvents || []).map((ev) => {
        if (String(ev?.kind || '').toUpperCase() !== 'FALL_CHECKIN_BOOKED') return ev;
        const row = schoolByPseId.get(Number(ev?.id || 0))
          || schoolByAgencyId.get(Number(ev?.agencyId || 0));
        if (!row) return ev;
        const schoolAgencyId = Number(row.school_agency_id || row.school_id || row.id || 0) || null;
        const locationAddress = [
          row.booking_location_text || row.street_address,
          [row.city, row.state].filter(Boolean).join(', '),
          row.postal_code || row.zip,
        ].filter(Boolean).join(' ').trim() || null;
        const schoolName = String(row.school_name || row.name || '').trim() || null;
        const mapsQuery = locationAddress || schoolName || null;
        const mapsUrl = mapsQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
          : null;
        const schoolLogoUrl = String(
          row.icon_file_path || row.logo_path || row.logo_url || ''
        ).trim() || null;
        if (schoolAgencyId && Number(ev.agencyId || 0) !== schoolAgencyId && Number(ev.id || 0) > 0) {
          repairPseAgencyIds.push({ pseId: Number(ev.id), schoolAgencyId });
        }
        return {
          ...ev,
          agencyId: schoolAgencyId || ev.agencyId || null,
          schoolName,
          locationAddress,
          mapsUrl,
          schoolLogoUrl,
        };
      });

      // Best-effort: keep PSE.agency_id aligned to school so logos keep working.
      for (const fix of repairPseAgencyIds) {
        try {
          await pool.execute(
            `UPDATE provider_schedule_events SET agency_id = ? WHERE id = ? AND kind = 'FALL_CHECKIN_BOOKED'`,
            [fix.schoolAgencyId, fix.pseId]
          );
        } catch {
          /* ignore */
        }
      }
    } catch (enrichErr) {
      console.warn('[schedule-summary] fall check-in school address enrich failed', enrichErr?.message || enrichErr);
    }

    const fullPayload = {
      ok: true,
      detailLevel: 'full',
      providerId,
      agencyId,
      includeAllAgencies: !!includeAllAgencies,
      scheduleAgencyIds: Array.from(scheduleAgencyIdSet.values()).sort((a, b) => a - b),
      weekStart,
      weekEnd,
      windowStart,
      windowEnd,
      officeRequests,
      schoolRequests,
      schoolAssignments,
      officeEvents,
      supervisionSessions,
      scheduleEvents,
      virtualWorkingHours,
      externalCalendarsAvailable,
      videoConfigured,
      ...(externalCalendarIds.length ? { externalCalendars } : {}),
      ...(includeGoogleBusy ? { googleBusy, googleBusyError } : {}),
      ...(includeGoogleEvents ? { googleEvents, googleEventsError } : {}),
      ...(includeExternalBusy ? { externalBusy } : {})
    };

    const detailLevel = resolveScheduleDetailLevel({
      requestedLevel: req.query.detailLevel || req.query.detail_level,
      isSelf,
      actorRole: req.user?.role,
      isSupervisorOfTarget
    });
    if (detailLevel === 'busy') {
      return res.json(toBusyOnlyScheduleSummary(fullPayload));
    }
    if (detailLevel === 'typed') {
      return res.json(toTypedPeerScheduleSummary(fullPayload));
    }
    res.json(fullPayload);
  } catch (e) {
    next(e);
  }
};

const SCHEDULE_EVENT_KIND_LABELS = {
  PERSONAL_EVENT: 'Personal Event',
  SCHEDULE_HOLD: 'Schedule Hold',
  INDIRECT_SERVICES: 'Indirect Services',
  TEAM_MEETING: 'Team Meeting',
  HUDDLE: 'Huddle',
  FALL_CHECKIN_PRESLOT: 'School visit pre-slot',
  FALL_CHECKIN_BOOKED: 'School visit',
};

function nextDateYmd(ymd) {
  return addDaysYmd(String(ymd || '').slice(0, 10), 1);
}

function buildScheduleEventSummary({ kind, title, reasonCode }) {
  const customTitle = String(title || '').trim();
  if (customTitle) return customTitle.slice(0, 200);
  const normalizedKind = String(kind || '').trim().toUpperCase();
  const fallback = SCHEDULE_EVENT_KIND_LABELS[normalizedKind] || 'Schedule Event';
  const reason = String(reasonCode || '').trim();
  if (!reason) return fallback;
  return `${fallback} - ${reason}`.slice(0, 200);
}

export const createUserScheduleEvent = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const isSelf = actorUserId === userId;
    if (!isSelf) {
      const asSupervisor = await actorIsSupervisorOfTarget(actorUserId, userId, Number(req.body?.agencyId || 0) || null);
      if (!canCreateProviderScheduleEvent(actorRole) && !asSupervisor) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      const sharedOk = await requireSharedAgencyAccessOrSuperAdmin({
        actorUserId,
        targetUserId: userId,
        actorRole
      });
      if (!sharedOk && !asSupervisor) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const provider = await User.findById(userId);
    if (!provider) return res.status(404).json({ error: { message: 'User not found' } });
    const subjectEmail = String(provider?.email || '').trim().toLowerCase();
    if (!subjectEmail) return res.status(400).json({ error: { message: 'Provider email is required to create calendar events' } });

    const kind = String(req.body?.kind || '').trim().toUpperCase();
    if (!['PERSONAL_EVENT', 'SCHEDULE_HOLD', 'INDIRECT_SERVICES', 'TEAM_MEETING', 'HUDDLE', 'OUTREACH_TRIP'].includes(kind)) {
      return res.status(400).json({ error: { message: 'kind must be PERSONAL_EVENT, SCHEDULE_HOLD, INDIRECT_SERVICES, TEAM_MEETING, HUDDLE, or OUTREACH_TRIP' } });
    }
    if (kind === 'HUDDLE') {
      const hostRole = String(provider?.role || '').trim().toLowerCase();
      const hostIsCpaOrPp = ['provider_plus', 'clinical_practice_assistant'].includes(hostRole);
      const actorIsCpaOrPp = ['provider_plus', 'clinical_practice_assistant'].includes(actorRole);
      const actorIsPrivilegedScheduler = ['super_admin', 'superadmin', 'admin', 'support'].includes(actorRole);
      if (actorIsCpaOrPp) {
        // CPA/Provider Plus schedule huddles as themselves (host = actor calendar).
        if (!isSelf && !hostIsCpaOrPp) {
          return res.status(403).json({
            error: { message: 'Huddles must be hosted by a CPA or Provider Plus.' }
          });
        }
      } else if (actorIsPrivilegedScheduler) {
        if (!hostIsCpaOrPp) {
          return res.status(403).json({
            error: { message: 'Admin, support, or super admin can only schedule Huddles for a CPA or Provider Plus host.' }
          });
        }
      } else {
        return res.status(403).json({
          error: { message: 'Only Provider Plus, CPA, or admin/support/super admin can schedule Huddle meetings.' }
        });
      }
    }
    const isPrivate = req.body?.isPrivate === true;
    const focusSessionEnabled = req.body?.focusSessionEnabled === true || req.body?.focus_session_enabled === true;

    const allDay = req.body?.allDay === true;
    const timeZone = String(req.body?.timeZone || 'America/Denver').trim() || 'America/Denver';
    const rawStartAt = req.body?.startAt;
    const rawEndAt = req.body?.endAt;
    const startAt = allDay ? null : scheduleInstantToWallMysql(rawStartAt, timeZone);
    const endAt = allDay ? null : scheduleInstantToWallMysql(rawEndAt, timeZone);
    const startDate = allDay ? String(req.body?.startDate || '').slice(0, 10) : '';
    const endDate = allDay ? String(req.body?.endDate || '').slice(0, 10) : '';
    let endDateExclusive = '';
    if (allDay) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ error: { message: 'startDate is required for all-day events (YYYY-MM-DD)' } });
      }
      endDateExclusive = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : nextDateYmd(startDate);
      if (endDateExclusive <= startDate) {
        return res.status(400).json({ error: { message: 'endDate must be after startDate for all-day events' } });
      }
    } else {
      if (!startAt || !endAt) {
        return res.status(400).json({ error: { message: 'startAt and endAt are required' } });
      }
      const startUtcMysql = clientScheduleInstantToUtcMysql(rawStartAt, timeZone);
      const endUtcMysql = clientScheduleInstantToUtcMysql(rawEndAt, timeZone);
      if (!(new Date(`${startUtcMysql.replace(' ', 'T')}Z`).getTime()
        < new Date(`${endUtcMysql.replace(' ', 'T')}Z`).getTime())) {
        return res.status(400).json({ error: { message: 'endAt must be after startAt' } });
      }
    }

    const reasonCode = String(req.body?.reasonCode || '').trim().toUpperCase() || null;
    const isAgencyOptionalEvent = ['PERSONAL_EVENT', 'SCHEDULE_HOLD'].includes(kind);
    const requestedAgencyId = Number(req.body?.agencyId || 0);
    const agencyId = requestedAgencyId > 0 ? requestedAgencyId : null;
    if (!isAgencyOptionalEvent && !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (agencyId) {
      const isSuperAdmin = actorRole === 'super_admin' || actorRole === 'superadmin';
      // Superadmins may schedule under any tenant (e.g. Demo ITSCO) without user_agencies membership.
      if (!isSuperAdmin) {
        const membership = await User.getAgencyMembership(userId, agencyId);
        if (!membership) {
          return res.status(403).json({ error: { message: 'Provider is not assigned to this agency' } });
        }
      }
    }
    const summaryText = buildScheduleEventSummary({
      kind,
      title: req.body?.title,
      reasonCode: reasonCode ? reasonCode.replace(/_/g, ' ') : ''
    });
    const description = String(req.body?.description || '').trim() || null;
    let attendeeUserIds = Array.from(
      new Set((Array.isArray(req.body?.attendeeUserIds) ? req.body.attendeeUserIds : [])
        .map((v) => Number(v || 0))
        .filter((n) => n > 0 && n !== userId))
    );
    const invitedGroupIds = Array.from(
      new Set((Array.isArray(req.body?.invitedGroupIds) ? req.body.invitedGroupIds : [])
        .map((v) => Number(v || 0))
        .filter((n) => n > 0))
    );
    if (invitedGroupIds.length && ['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
      try {
        const { collectMemberUserIds } = await import('../services/meetingInviteGroupSync.service.js');
        const fromGroups = await collectMemberUserIds(invitedGroupIds);
        attendeeUserIds = Array.from(new Set([
          ...attendeeUserIds,
          ...fromGroups.filter((uid) => uid > 0 && uid !== userId)
        ]));
      } catch {
        /* optional until migration */
      }
    }
    const recurrenceSeriesIdRaw = String(req.body?.recurrenceSeriesId || '').trim();
    const recurrenceSeriesId = recurrenceSeriesIdRaw ? recurrenceSeriesIdRaw.slice(0, 64) : null;
    const recurrenceFrequency = String(req.body?.recurrenceFrequency || '').trim().toUpperCase() || null;
    const recurrencePolicy = String(req.body?.recurrencePolicy || '').trim().toUpperCase() || null;
    const recurrenceIndex = req.body?.recurrenceIndex == null ? null : Math.max(0, parseInt(req.body.recurrenceIndex, 10) || 0);
    if (kind === 'TEAM_MEETING' && !attendeeUserIds.length) {
      return res.status(400).json({ error: { message: 'TEAM_MEETING requires at least one attendeeUserId.' } });
    }
    if (!['TEAM_MEETING', 'HUDDLE'].includes(kind) && attendeeUserIds.length) {
      return res.status(400).json({ error: { message: 'attendeeUserIds are only supported for TEAM_MEETING and HUDDLE.' } });
    }
    const canSetPrivilegedMeetingSubtype = ['super_admin', 'superadmin', 'admin', 'support'].includes(actorRole);
    const requestedSubtype = String(req.body?.meetingSubtype || req.body?.meeting_subtype || 'general')
      .trim()
      .toLowerCase();
    let meetingSubtype = 'general';
    if (kind === 'TEAM_MEETING' && (requestedSubtype === 'admin' || requestedSubtype === 'town_hall' || requestedSubtype === 'interview')) {
      if (requestedSubtype === 'interview') {
        const { getUserCapabilities } = await import('../utils/capabilities.js');
        const caps = getUserCapabilities(req.user, { effectiveRole: req.user?.effectiveRole });
        if (!caps?.canManageHiring && !canSetPrivilegedMeetingSubtype) {
          return res.status(403).json({
            error: { message: 'Only hiring-eligible staff can schedule Interview meetings.' }
          });
        }
      } else if (!canSetPrivilegedMeetingSubtype) {
        return res.status(403).json({
          error: {
            message: requestedSubtype === 'town_hall'
              ? 'Only admin, support, or super admin can schedule Town Hall meetings.'
              : 'Only admin, support, or super admin can schedule Admin Meetings.'
          }
        });
      }
      meetingSubtype = requestedSubtype;
    } else if (kind !== 'TEAM_MEETING' && (requestedSubtype === 'admin' || requestedSubtype === 'town_hall' || requestedSubtype === 'interview')) {
      return res.status(400).json({
        error: { message: 'Admin Meeting, Town Hall, and Interview subtypes are only valid for team meetings.' }
      });
    }
    const wantsTrainingPay = req.body?.isTrainingPayEligible === true
      || req.body?.isTrainingPayEligible === 1
      || req.body?.isTrainingPayEligible === '1'
      || req.body?.isTrainingPayEligible === 'true';
    let isTrainingPayEligible = false;
    if (wantsTrainingPay) {
      if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
        return res.status(400).json({ error: { message: 'Training/Mentorship/Onboarding pay is only for meetings.' } });
      }
      const hostRole = String(provider?.role || '').trim().toLowerCase();
      const { isTrainingPayEligibleRole } = await import('../services/scheduleEventTrainingPay.service.js');
      if (!isTrainingPayEligibleRole(hostRole)) {
        return res.status(403).json({
          error: { message: 'Training/Mentorship/Onboarding pay is only available for CPA and Provider Plus hosts.' }
        });
      }
      isTrainingPayEligible = true;
    }
    let videoConfiguredForMeeting = false;
    try {
      const { isVideoConfigured: videoOk } = await import('../services/video.service.js');
      videoConfiguredForMeeting = videoOk();
    } catch {
      videoConfiguredForMeeting = false;
    }
    const createPlatformVideoLink = (kind === 'TEAM_MEETING' || kind === 'HUDDLE')
      ? (videoConfiguredForMeeting && req.body?.createPlatformVideoLink !== false)
      : false;
    const createMeetLink = (kind === 'TEAM_MEETING' || kind === 'HUDDLE')
      ? (createPlatformVideoLink ? false : req.body?.createMeetLink !== false)
      : false;

    let attendeeEmails = [];
    if (attendeeUserIds.length) {
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'agencyId is required for TEAM_MEETING and HUDDLE attendees.' } });
      }
      const placeholders = attendeeUserIds.map(() => '?').join(',');
      const [attendeeRows] = await pool.execute(
        `SELECT
           u.id,
           u.email,
           u.role,
           EXISTS(
             SELECT 1 FROM user_agencies ua
             WHERE ua.user_id = u.id
               AND ua.agency_id = ?
           ) AS in_agency
         FROM users u
         WHERE u.id IN (${placeholders})`,
        [agencyId, ...attendeeUserIds]
      );
      const attendeeById = new Map((attendeeRows || []).map((r) => [Number(r.id || 0), r]));
      const { isMeetingAttendeeEligible } = await import('../utils/scheduleCoworkerRoles.js');
      const hostUser = await User.findById(userId);
      const hostRole = String(hostUser?.role || '').trim().toLowerCase();
      for (const attendeeId of attendeeUserIds) {
        const row = attendeeById.get(attendeeId);
        if (!isMeetingAttendeeEligible({
          attendeeRow: row,
          agencyId,
          actorRole,
          hostRole
        })) {
          return res.status(400).json({
            error: { message: 'One or more participants are not in the selected tenant. Switch tenant or remove them.' }
          });
        }
        const email = String(row?.email || '').trim().toLowerCase();
        // Platform video rooms do not require Google attendee emails.
        if (email) attendeeEmails.push(email);
        else if (createMeetLink) {
          return res.status(400).json({
            error: { message: 'A selected participant is missing an email address required for Google Meet invites.' }
          });
        }
      }
      attendeeEmails = Array.from(new Set(attendeeEmails));
    }

    // When false: add to calendars silently (no Google invite emails / in-app notify emails).
    const notifyParticipants = !(
      req.body?.notifyParticipants === false
      || req.body?.notifyParticipants === 0
      || req.body?.notifyParticipants === '0'
      || req.body?.notifyParticipants === 'false'
      || req.body?.sendCalendarInvites === false
      || req.body?.sendCalendarInvites === 0
      || req.body?.sendCalendarInvites === '0'
      || req.body?.sendCalendarInvites === 'false'
    );

    const result = await GoogleCalendarService.createProviderScheduleEvent({
      subjectEmail,
      startAt,
      endAt,
      allDay,
      startDate: allDay ? startDate : null,
      endDate: allDay ? endDateExclusive : null,
      timeZone,
      summary: summaryText,
      description,
      kind,
      reasonCode,
      isPrivate,
      attendeeEmails,
      createMeetLink,
      sendUpdates: notifyParticipants ? 'all' : 'none'
    });

    const googleOk = !!result?.ok;
    const googleError = googleOk
      ? null
      : String(result?.error || result?.reason || 'Could not create calendar event');
    // Platform video / counseling / team meetings must not hard-fail when Workspace calendar
    // impersonation fails (invalid_grant, missing user, revoked grant, etc.).
    // TEAM_MEETING/HUDDLE always allow local save; Google sync is best-effort (Meet link may be absent).
    const allowLocalFallback = req.body?.allowLocalOnly === true
      || ['PERSONAL_EVENT', 'SCHEDULE_HOLD', 'INDIRECT_SERVICES', 'TEAM_MEETING', 'HUDDLE', 'OUTREACH_TRIP'].includes(kind)
      || ((kind === 'TEAM_MEETING' || kind === 'HUDDLE') && createPlatformVideoLink && !createMeetLink);
    if (!googleOk && !allowLocalFallback) {
      return res.status(502).json({ error: { message: googleError || 'Could not create calendar event' } });
    }
    if (!googleOk && googleError) {
      console.warn('[createUserScheduleEvent] Google Calendar sync skipped; saving locally.', {
        userId,
        kind,
        subjectEmail,
        error: googleError
      });
    }

    // All timed schedule events store UTC instants. Convert from the wall clock the
    // user picked in `timeZone` (do not re-project Google's dateTime through a second TZ shift).
    const storesUtc = !allDay;
    const storedStartAt = allDay
      ? null
      : (clientScheduleInstantToUtcMysql(rawStartAt, timeZone)
        || (result?.startAt ? normalizeUtcMysqlScheduleInstant(result.startAt) : startAt));
    const storedEndAt = allDay
      ? null
      : (clientScheduleInstantToUtcMysql(rawEndAt, timeZone)
        || (result?.endAt ? normalizeUtcMysqlScheduleInstant(result.endAt) : endAt));

    let saved = null;
    let appJoinUrl = null;
    let hostJoinUrl = null;
    try {
      const waitingRoomEnabled = req.body?.waitingRoomEnabled !== false;
      saved = await ProviderScheduleEvent.create({
        agencyId,
        providerId: userId,
        kind,
        title: summaryText,
        description,
        reasonCode,
        isPrivate,
        focusSessionEnabled: kind === 'SCHEDULE_HOLD' ? focusSessionEnabled : false,
        allDay,
        startAt: storedStartAt,
        endAt: storedEndAt,
        startDate: allDay ? startDate : null,
        endDate: allDay ? endDateExclusive : null,
        // Persist the zone the wall-clock was entered in — re-editing must anchor to this,
        // never to whichever office/tenant happens to be selected in the UI at edit time.
        eventTimezone: storesUtc ? timeZone : null,
        recurrenceSeriesId,
        recurrenceFrequency,
        recurrencePolicy,
        recurrenceIndex,
        googleEventId: result?.eventId || null,
        googleHtmlLink: result?.htmlLink || null,
        googleMeetLink: result?.meetLink || null,
        platformVideoLink: (kind === 'TEAM_MEETING' || kind === 'HUDDLE') ? createPlatformVideoLink : null,
        createdByUserId: actorUserId,
        clientId: Number(req.body?.clientId || 0) || null,
        isTrainingPayEligible,
        waitingRoomEnabled,
        meetingSubtype,
        notifyParticipants
      });
      if (saved?.id && (kind === 'TEAM_MEETING' || kind === 'HUDDLE') && attendeeUserIds?.length) {
        const ProviderScheduleEventAttendee = (await import('../models/ProviderScheduleEventAttendee.model.js')).default;
        await ProviderScheduleEventAttendee.upsertForEvent(saved.id, attendeeUserIds);
      }
      if (saved?.id && (kind === 'TEAM_MEETING' || kind === 'HUDDLE') && invitedGroupIds?.length) {
        try {
          const { linkGroupsToEvent } = await import('../services/meetingInviteGroupSync.service.js');
          await linkGroupsToEvent(saved.id, invitedGroupIds);
        } catch {
          /* optional until migration */
        }
      }
      if (saved?.id && (kind === 'TEAM_MEETING' || kind === 'HUDDLE') && createPlatformVideoLink) {
        const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
        const joinKey = String(saved.participant_join_token || saved.join_token || saved.id || '').trim();
        const hostKey = String(saved.host_join_token || '').trim();
        // Prefer relative paths in the UI response so Join stays on the current origin
        // (absolute FRONTEND_URL was opening a host that dropped the session cookie).
        appJoinUrl = joinKey ? `/join/team-meeting/${encodeURIComponent(joinKey)}` : null;
        hostJoinUrl = hostKey ? `/join/team-meeting/${encodeURIComponent(hostKey)}` : null;
        const absoluteJoinForCalendar = (frontendUrl && joinKey)
          ? joinUrlForTeamMeeting(frontendUrl, joinKey)
          : null;
        if (result?.eventId && absoluteJoinForCalendar) {
          await GoogleCalendarService.appendToEventDescription({
            subjectEmail,
            googleEventId: result.eventId,
            appendText: `Join with app: ${absoluteJoinForCalendar}`,
            sendUpdates: notifyParticipants ? 'all' : 'none'
          }).catch(() => {});
        }
      }
      if (saved?.id && isTrainingPayEligible) {
        try {
          const { syncTrainingPayClaimForEvent } = await import('../services/scheduleEventTrainingPay.service.js');
          await syncTrainingPayClaimForEvent({
            event: saved,
            hostRole: String(provider?.role || '').trim().toLowerCase(),
            actorUserId,
            enabled: true
          });
        } catch (payErr) {
          console.warn('[createUserScheduleEvent] training pay claim sync failed', payErr?.message || payErr);
        }
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Notify attendees / host counterparts so their schedule can refresh.
    if (notifyParticipants && saved?.id && (kind === 'TEAM_MEETING' || kind === 'HUDDLE')) {
      try {
        const { createNotificationAndDispatch } = await import('../services/notificationDispatcher.service.js');
        const actorName = `${String(req.user?.first_name || req.user?.firstName || '').trim()} ${String(req.user?.last_name || req.user?.lastName || '').trim()}`.trim()
          || 'A teammate';
        const whenLabel = allDay
          ? String(startDate || '').slice(0, 10)
          : String(storedStartAt || startAt || '').replace(' ', ' · ').slice(0, 16);
        const titleText = String(summaryText || (kind === 'HUDDLE' ? 'Huddle' : 'Team meeting')).trim();
        const recipientIds = Array.from(new Set(
          [Number(userId || 0), ...(Array.isArray(attendeeUserIds) ? attendeeUserIds : [])]
            .map((n) => Number(n || 0))
            .filter((uid) => uid > 0 && uid !== Number(actorUserId || 0))
        ));
        await Promise.all(recipientIds.map((uid) => createNotificationAndDispatch({
          type: 'team_meeting_scheduled',
          severity: 'info',
          title: `${kind === 'HUDDLE' ? 'Huddle' : 'Meeting'} scheduled`,
          message: `${actorName} scheduled “${titleText}” for ${whenLabel}. Open My Schedule to see it.`,
          userId: uid,
          agencyId,
          relatedEntityType: 'provider_schedule_events',
          relatedEntityId: Number(saved.id),
          actorSource: 'Schedule',
          metadata: {
            eventId: Number(saved.id),
            kind,
            startAt: allDay ? null : (storedStartAt || startAt),
            endAt: allDay ? null : (storedEndAt || endAt),
            refreshSchedule: true
          }
        }).catch((err) => {
          console.warn('[createUserScheduleEvent] schedule notify failed', uid, err?.message || err);
          return null;
        })));
      } catch (notifyErr) {
        console.warn('[createUserScheduleEvent] schedule notify skipped', notifyErr?.message || notifyErr);
      }
    }

    return res.status(201).json({
      ok: true,
      googleSynced: googleOk,
      ...(googleOk ? {} : {
        googleCalendarWarning: googleError?.includes('invalid_grant')
          ? 'Saved in-app, but Google Calendar could not sync (invalid Google user/email grant). Platform video still works.'
          : `Saved in-app, but Google Calendar could not sync: ${googleError}`
      }),
      event: {
        id: saved?.id ? Number(saved.id) : null,
        providerScheduleEventId: saved?.id ? Number(saved.id) : null,
        googleEventId: result?.eventId || null,
        htmlLink: result?.htmlLink || null,
        meetLink: result?.meetLink || null,
        appJoinUrl: appJoinUrl || null,
        hostJoinUrl: hostJoinUrl || null,
        participantJoinUrl: appJoinUrl || null,
        waitingRoomEnabled: (kind === 'TEAM_MEETING' || kind === 'HUDDLE')
          ? (req.body?.waitingRoomEnabled !== false)
          : null,
        notifyParticipants: (kind === 'TEAM_MEETING' || kind === 'HUDDLE')
          ? !!notifyParticipants
          : null,
        agencyId,
        kind,
        meetingSubtype,
        title: summaryText,
        isPrivate,
        isTrainingPayEligible,
        attendeeUserIds,
        allDay,
        // Prefer stored UTC instant (with Z) so clients render the same wall time everywhere.
        startAt: allDay ? null : (toIsoUtcForSchedule(storedStartAt) || storedStartAt || startAt),
        endAt: allDay ? null : (toIsoUtcForSchedule(storedEndAt) || storedEndAt || endAt),
        // The zone of record for re-editing — clients must not re-guess this from ambient UI state.
        timeZone: allDay ? null : (saved?.event_timezone || timeZone),
        startDate: allDay ? startDate : null,
        endDate: allDay ? endDateExclusive : null,
        recurrenceSeriesId: saved?.recurrence_series_id || recurrenceSeriesId || null,
        recurrenceFrequency: saved?.recurrence_frequency || recurrenceFrequency || null,
        recurrencePolicy: saved?.recurrence_policy || recurrencePolicy || null,
        recurrenceIndex: saved?.recurrence_index == null ? recurrenceIndex : Number(saved.recurrence_index)
      }
    });
  } catch (e) {
    next(e);
  }
};

export const getUserScheduleEventNotificationPlan = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const eventId = parseInt(req.params.eventId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!(await assertCanManageTargetSchedule({
      actorUserId,
      actorRole,
      targetUserId: userId,
      agencyId: Number(req.query?.agencyId || 0) || null
    }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let target = await ProviderScheduleEvent.findByIdForProvider({ eventId, providerId: userId });
    if (!target) {
      const byId = await ProviderScheduleEvent.findById(eventId);
      if (byId) {
        const hostId = Number(byId.provider_id || 0);
        if (hostId > 0 && (await assertCanManageTargetSchedule({
          actorUserId,
          actorRole,
          targetUserId: hostId,
          agencyId: Number(byId.agency_id || 0) || null
        }))) {
          target = byId;
        }
      }
    }
    if (!target) return res.status(404).json({ error: { message: 'Schedule event not found' } });

    const kind = String(target.kind || '').trim().toUpperCase();
    if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
      return res.status(400).json({ error: { message: 'Notification plan is only available for team meetings and huddles.' } });
    }

    const { buildScheduleEventNotificationPlan } = await import('../services/joinReminder.service.js');
    const plan = await buildScheduleEventNotificationPlan(target);
    res.json({ ok: true, plan });
  } catch (e) {
    next(e);
  }
};

export const updateUserScheduleEvent = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const eventId = parseInt(req.params.eventId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();

    // Resolve the event first (path user may be an invitee calendar, not the host).
    let target = await ProviderScheduleEvent.findByIdForProvider({ eventId, providerId: userId });
    if (!target) {
      target = await ProviderScheduleEvent.findById(eventId);
    }
    if (!target) return res.status(404).json({ error: { message: 'Schedule event not found' } });
    if (String(target.status || '').trim().toUpperCase() === 'CANCELLED') {
      return res.status(400).json({ error: { message: 'Cannot edit a cancelled schedule event' } });
    }

    const kind = String(target.kind || '').trim().toUpperCase();
    if (!['PERSONAL_EVENT', 'SCHEDULE_HOLD', 'INDIRECT_SERVICES', 'TEAM_MEETING', 'HUDDLE', 'OUTREACH_TRIP'].includes(kind)) {
      return res.status(400).json({ error: { message: 'This event type cannot be edited here' } });
    }
    const hostProviderId = Number(target.provider_id || userId) || userId;
    const agencyForAccess = Number(req.body?.agencyId || target.agency_id || 0) || null;
    const canManageHost = await assertCanManageTargetSchedule({
      actorUserId,
      actorRole,
      targetUserId: hostProviderId,
      agencyId: agencyForAccess
    });
    const wantsTimeChange = req.body?.startAt != null
      || req.body?.endAt != null
      || req.body?.startDate != null
      || req.body?.endDate != null
      || req.body?.allDay !== undefined;
    const adminAttendeeReschedule = !canManageHost
      && wantsTimeChange
      && await actorIsAdminMeetingAttendee(actorUserId, target);
    if (!canManageHost && !adminAttendeeReschedule) {
      return res.status(403).json({ error: { message: 'Only the host can change this meeting’s time' } });
    }
    // Admin-meeting invitees may move time/date only — not title, roster, or other fields.
    if (adminAttendeeReschedule && !canManageHost) {
      const disallowedKeys = [
        'title', 'description', 'attendeeUserIds', 'invitedGroupIds', 'clientId',
        'isPrivate', 'meetingSubtype', 'meeting_subtype', 'isTrainingPayEligible',
        'waitingRoomEnabled', 'notifyParticipants', 'agencyId'
      ];
      const attempted = disallowedKeys.filter((k) => Object.prototype.hasOwnProperty.call(req.body || {}, k));
      if (attempted.length) {
        return res.status(403).json({
          error: { message: 'Only the host can edit meeting details. Invitees may reschedule the time.' }
        });
      }
    }

    const allDay = req.body?.allDay === undefined ? Number(target.all_day || 0) === 1 : req.body.allDay === true;
    let startAt = undefined;
    let endAt = undefined;
    let startDate = undefined;
    let endDate = undefined;
    /** Wall-clock values for Google Calendar (dateTime + timeZone). */
    let googleStartWall = undefined;
    let googleEndWall = undefined;
    let updateTimeZone = String(
      req.body?.timeZone
      || req.body?.timezone
      // Zone of record for this meeting — must win over any ambient office/tenant guess.
      || target.event_timezone
      || ''
    ).trim();
    if (!updateTimeZone) {
      const aid = Number(target.agency_id || agencyForAccess || 0);
      if (aid > 0) {
        try {
          const Agency = (await import('../models/Agency.model.js')).default;
          const agency = await Agency.findById(aid);
          const agencyTz = String(agency?.timezone || '').trim();
          if (agencyTz) updateTimeZone = agencyTz;
        } catch {
          /* optional */
        }
      }
    }
    if (!updateTimeZone) updateTimeZone = 'America/Denver';
    if (allDay) {
      startDate = req.body?.startDate != null
        ? String(req.body.startDate).slice(0, 10)
        : String(target.start_date || '').slice(0, 10);
      endDate = req.body?.endDate != null
        ? String(req.body.endDate).slice(0, 10)
        : String(target.end_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ error: { message: 'startDate is required for all-day events' } });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate <= startDate) {
        return res.status(400).json({ error: { message: 'endDate must be after startDate' } });
      }
      startAt = null;
      endAt = null;
    } else if (req.body?.startAt != null || req.body?.endAt != null) {
      const rawStart = req.body?.startAt != null ? req.body.startAt : target.start_at;
      const rawEnd = req.body?.endAt != null ? req.body.endAt : target.end_at;
      const startFromStorage = req.body?.startAt == null;
      const endFromStorage = req.body?.endAt == null;
      googleStartWall = scheduleInstantToWallMysql(rawStart, updateTimeZone, { fromStorage: startFromStorage });
      googleEndWall = scheduleInstantToWallMysql(rawEnd, updateTimeZone, { fromStorage: endFromStorage });
      // All timed schedule events store UTC.
      startAt = startFromStorage
        ? normalizeUtcMysqlScheduleInstant(rawStart)
        : clientScheduleInstantToUtcMysql(rawStart, updateTimeZone);
      endAt = endFromStorage
        ? normalizeUtcMysqlScheduleInstant(rawEnd)
        : clientScheduleInstantToUtcMysql(rawEnd, updateTimeZone);
      if (!startAt || !endAt) {
        return res.status(400).json({ error: { message: 'startAt and endAt are required' } });
      }
      if (!(new Date(`${String(startAt).replace(' ', 'T')}Z`).getTime()
        < new Date(`${String(endAt).replace(' ', 'T')}Z`).getTime())) {
        return res.status(400).json({ error: { message: 'endAt must be after startAt' } });
      }
      startDate = null;
      endDate = null;
    }

    const title = req.body?.title != null ? String(req.body.title).trim() : undefined;
    if (title !== undefined && !title) {
      return res.status(400).json({ error: { message: 'Title is required' } });
    }

    const wantsAttendeeUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'attendeeUserIds');
    const wantsInvitedGroupUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'invitedGroupIds');
    let invitedGroupIds = null;
    if (wantsInvitedGroupUpdate) {
      if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
        return res.status(400).json({ error: { message: 'invitedGroupIds are only supported for TEAM_MEETING and HUDDLE.' } });
      }
      invitedGroupIds = Array.from(
        new Set((Array.isArray(req.body?.invitedGroupIds) ? req.body.invitedGroupIds : [])
          .map((n) => Number(n || 0))
          .filter((n) => n > 0))
      );
    }
    let attendeeUserIds = null;
    if (wantsAttendeeUpdate) {
      if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
        return res.status(400).json({ error: { message: 'attendeeUserIds are only supported for TEAM_MEETING and HUDDLE.' } });
      }
      attendeeUserIds = Array.from(
        new Set((Array.isArray(req.body?.attendeeUserIds) ? req.body.attendeeUserIds : [])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0 && n !== Number(hostProviderId)))
      );
      if (!attendeeUserIds.length) {
        return res.status(400).json({ error: { message: `${kind} requires at least one coworker attendee.` } });
      }
      if (invitedGroupIds?.length) {
        try {
          const { collectMemberUserIds } = await import('../services/meetingInviteGroupSync.service.js');
          const fromGroups = await collectMemberUserIds(invitedGroupIds);
          attendeeUserIds = Array.from(new Set([
            ...attendeeUserIds,
            ...fromGroups.filter((uid) => uid > 0 && uid !== Number(hostProviderId))
          ]));
        } catch {
          /* optional until migration */
        }
      }
      const eventAgencyId = Number(req.body?.agencyId || 0)
        || Number(target.agency_id || 0)
        || null;
      if (!eventAgencyId) {
        return res.status(400).json({ error: { message: 'Select a tenant before saving meeting participants.' } });
      }
      const pool = (await import('../config/database.js')).default;
      const placeholders = attendeeUserIds.map(() => '?').join(',');
      const [attendeeRows] = await pool.execute(
        `SELECT
           u.id,
           u.role,
           EXISTS(
             SELECT 1 FROM user_agencies ua
             WHERE ua.user_id = u.id
               AND ua.agency_id = ?
           ) AS in_agency
         FROM users u
         WHERE u.id IN (${placeholders})`,
        [eventAgencyId, ...attendeeUserIds]
      );
      const attendeeById = new Map((attendeeRows || []).map((r) => [Number(r.id || 0), r]));
      const { isMeetingAttendeeEligible } = await import('../utils/scheduleCoworkerRoles.js');
      const hostUser = await User.findById(hostProviderId);
      const hostRole = String(hostUser?.role || '').trim().toLowerCase();
      for (const attendeeId of attendeeUserIds) {
        const row = attendeeById.get(attendeeId);
        if (!isMeetingAttendeeEligible({
          attendeeRow: row,
          agencyId: eventAgencyId,
          actorRole,
          hostRole
        })) {
          return res.status(400).json({
            error: { message: 'One or more participants are not in the selected tenant. Switch tenant or remove them.' }
          });
        }
      }
    }

    let nextTrainingPayEligible = undefined;
    if (req.body?.isTrainingPayEligible !== undefined) {
      const wantsTrainingPay = req.body?.isTrainingPayEligible === true
        || req.body?.isTrainingPayEligible === 1
        || req.body?.isTrainingPayEligible === '1'
        || req.body?.isTrainingPayEligible === 'true';
      if (wantsTrainingPay && !['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
        return res.status(400).json({ error: { message: 'Training/Mentorship/Onboarding pay is only for meetings.' } });
      }
      if (wantsTrainingPay) {
        const hostUser = await User.findById(hostProviderId);
        const hostRole = String(hostUser?.role || '').trim().toLowerCase();
        const { isTrainingPayEligibleRole } = await import('../services/scheduleEventTrainingPay.service.js');
        if (!isTrainingPayEligibleRole(hostRole)) {
          return res.status(403).json({
            error: { message: 'Training/Mentorship/Onboarding pay is only available for CPA and Provider Plus hosts.' }
          });
        }
      }
      nextTrainingPayEligible = !!wantsTrainingPay;
    }

    let nextMeetingSubtype = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'meetingSubtype')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'meeting_subtype')) {
      const requestedSubtype = String(req.body?.meetingSubtype || req.body?.meeting_subtype || 'general')
        .trim()
        .toLowerCase();
      if (kind !== 'TEAM_MEETING' && (requestedSubtype === 'admin' || requestedSubtype === 'town_hall')) {
        return res.status(400).json({
          error: { message: 'Admin Meeting and Town Hall subtypes are only valid for team meetings.' }
        });
      }
      if (requestedSubtype === 'admin' || requestedSubtype === 'town_hall') {
        const canSetPrivilegedMeetingSubtype = ['super_admin', 'superadmin', 'admin', 'support'].includes(actorRole);
        if (!canSetPrivilegedMeetingSubtype) {
          return res.status(403).json({
            error: {
              message: requestedSubtype === 'town_hall'
                ? 'Only admin, support, or super admin can set Town Hall subtype.'
                : 'Only admin, support, or super admin can set Admin Meeting subtype.'
            }
          });
        }
        nextMeetingSubtype = requestedSubtype;
      } else {
        nextMeetingSubtype = 'general';
      }
    }

    let nextWaitingRoomEnabled = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'waitingRoomEnabled')) {
      if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
        return res.status(400).json({ error: { message: 'waitingRoomEnabled is only supported for TEAM_MEETING and HUDDLE.' } });
      }
      const raw = req.body.waitingRoomEnabled;
      nextWaitingRoomEnabled = raw === true
        || raw === 1
        || raw === '1'
        || raw === 'true';
    }

    let nextNotifyParticipants = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notifyParticipants')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'sendCalendarInvites')) {
      if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
        return res.status(400).json({ error: { message: 'notifyParticipants is only supported for TEAM_MEETING and HUDDLE.' } });
      }
      const raw = req.body?.notifyParticipants !== undefined
        ? req.body.notifyParticipants
        : req.body.sendCalendarInvites;
      nextNotifyParticipants = !(
        raw === false
        || raw === 0
        || raw === '0'
        || raw === 'false'
      );
    }

    const scope = String(req.body?.scope || 'single').trim().toLowerCase();
    if (!['single', 'future'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be single or future' } });
    }

    let rowsToUpdate = [target];
    const seriesId = String(target.recurrence_series_id || '').trim();
    const timingChanged = startAt !== undefined || endAt !== undefined
      || startDate !== undefined || endDate !== undefined
      || (req.body?.allDay !== undefined);
    if (scope === 'future') {
      if (!seriesId) {
        return res.status(400).json({ error: { message: 'This event is not part of a recurring series.' } });
      }
      rowsToUpdate = await ProviderScheduleEvent.listActiveSeriesFromPoint({
        recurrenceSeriesId: seriesId,
        providerId: hostProviderId,
        fromStartAt: target.start_at || null,
        fromStartDate: target.start_date || null
      });
      if (!rowsToUpdate.length) rowsToUpdate = [target];
    }

    const { applyClockTimesToOccurrence } = await import('../utils/seriesTimeShift.js');
    let updated = null;
    for (const occ of rowsToUpdate) {
      const occId = Number(occ.id || 0);
      if (!occId) continue;
      const isPrimary = occId === eventId;
      let occStartAt = isPrimary ? startAt : undefined;
      let occEndAt = isPrimary ? endAt : undefined;
      let occStartDate = isPrimary ? startDate : undefined;
      let occEndDate = isPrimary ? endDate : undefined;
      let occAllDay = isPrimary && req.body?.allDay !== undefined ? allDay : undefined;

      if (timingChanged && scope === 'future' && !isPrimary && !allDay && startAt && endAt) {
        const shifted = applyClockTimesToOccurrence({
          occurrenceStartRaw: occ.start_at || occ.start_date,
          newStartRaw: startAt,
          newEndRaw: endAt
        });
        if (!shifted) continue;
        occStartAt = shifted.startAt;
        occEndAt = shifted.endAt;
        occAllDay = false;
        occStartDate = null;
        occEndDate = null;
      }

      // eslint-disable-next-line no-await-in-loop
      const rowUpdated = await ProviderScheduleEvent.updateForProvider({
        eventId: occId,
        providerId: hostProviderId,
        title: isPrimary ? title : undefined,
        description: isPrimary && req.body?.description !== undefined ? req.body.description : undefined,
        isPrivate: isPrimary && req.body?.isPrivate !== undefined ? req.body.isPrivate === true : undefined,
        allDay: occAllDay,
        startAt: occStartAt,
        endAt: occEndAt,
        startDate: occStartDate,
        endDate: occEndDate,
        // Only stamp the zone of record when the wall-clock actually moved — never on
        // attendee-only / metadata-only edits, so it can't drift from an ambient UI guess.
        eventTimezone: (occStartAt !== undefined || occEndAt !== undefined) ? updateTimeZone : undefined,
        agencyId: isPrimary && req.body?.agencyId !== undefined ? Number(req.body.agencyId || 0) || null : undefined,
        clientId: isPrimary && req.body?.clientId !== undefined ? Number(req.body.clientId || 0) || null : undefined,
        reasonCode: isPrimary && req.body?.reasonCode !== undefined ? req.body.reasonCode : undefined,
        isTrainingPayEligible: isPrimary ? nextTrainingPayEligible : undefined,
        meetingSubtype: isPrimary ? nextMeetingSubtype : (scope === 'future' ? nextMeetingSubtype : undefined),
        waitingRoomEnabled: isPrimary ? nextWaitingRoomEnabled : undefined,
        notifyParticipants: isPrimary ? nextNotifyParticipants : (scope === 'future' ? nextNotifyParticipants : undefined),
        updatedByUserId: actorUserId
      });
      if (isPrimary) updated = rowUpdated;
    }
    if (!updated) {
      updated = await ProviderScheduleEvent.findByIdForProvider({ eventId, providerId: hostProviderId });
    }

    if (wantsAttendeeUpdate && attendeeUserIds) {
      const ProviderScheduleEventAttendee = (await import('../models/ProviderScheduleEventAttendee.model.js')).default;
      await ProviderScheduleEventAttendee.replaceForEvent(eventId, attendeeUserIds);
    }

    if (wantsInvitedGroupUpdate) {
      try {
        const { linkGroupsToEvent } = await import('../services/meetingInviteGroupSync.service.js');
        await linkGroupsToEvent(eventId, invitedGroupIds || []);
      } catch {
        /* optional until migration */
      }
    }

    if (updated && ['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
      const trainingEnabled = nextTrainingPayEligible !== undefined
        ? nextTrainingPayEligible
        : Number(updated?.is_training_pay_eligible || 0) === 1;
      if (trainingEnabled || nextTrainingPayEligible === false) {
        try {
          const hostUser = await User.findById(hostProviderId);
          const { syncTrainingPayClaimForEvent } = await import('../services/scheduleEventTrainingPay.service.js');
          // Sync pay claims for each updated occurrence when series-scoped.
          for (const occ of rowsToUpdate) {
            const occId = Number(occ.id || 0);
            if (!occId) continue;
            // eslint-disable-next-line no-await-in-loop
            const fresh = await ProviderScheduleEvent.findById(occId);
            if (!fresh || Number(fresh.is_training_pay_eligible || 0) !== 1) {
              if (occId === eventId && nextTrainingPayEligible === false) {
                // eslint-disable-next-line no-await-in-loop
                await syncTrainingPayClaimForEvent({
                  event: fresh || occ,
                  hostRole: String(hostUser?.role || '').trim().toLowerCase(),
                  actorUserId,
                  enabled: false
                });
              }
              continue;
            }
            // eslint-disable-next-line no-await-in-loop
            await syncTrainingPayClaimForEvent({
              event: fresh,
              hostRole: String(hostUser?.role || '').trim().toLowerCase(),
              actorUserId,
              enabled: trainingEnabled
            });
          }
        } catch (payErr) {
          console.warn('[updateUserScheduleEvent] training pay claim sync failed', payErr?.message || payErr);
        }
      }
    }

    let resolvedAttendeeUserIds = attendeeUserIds;
    if (!resolvedAttendeeUserIds && ['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
      try {
        const ProviderScheduleEventAttendee = (await import('../models/ProviderScheduleEventAttendee.model.js')).default;
        resolvedAttendeeUserIds = await ProviderScheduleEventAttendee.listUserIdsByEventId(eventId);
      } catch {
        resolvedAttendeeUserIds = [];
      }
    }

    // Best-effort Google sync when linked (primary + series follow-ons).
    const subjectEmail = String((await User.findById(hostProviderId))?.email || '').trim().toLowerCase();
    let attendeeEmails = undefined;
    if (wantsAttendeeUpdate && Array.isArray(attendeeUserIds) && attendeeUserIds.length) {
      try {
        const pool = (await import('../config/database.js')).default;
        const placeholders = attendeeUserIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT email FROM users WHERE id IN (${placeholders})`,
          attendeeUserIds
        );
        attendeeEmails = (rows || [])
          .map((r) => String(r.email || '').trim().toLowerCase())
          .filter(Boolean);
      } catch {
        attendeeEmails = undefined;
      }
    }
    const tz = updateTimeZone;
    for (const occ of rowsToUpdate) {
      const occId = Number(occ.id || 0);
      if (!occId || !subjectEmail) continue;
      // eslint-disable-next-line no-await-in-loop
      const fresh = await ProviderScheduleEvent.findById(occId);
      if (!fresh) continue;
      const googleEventId = String(fresh?.google_event_id || '').trim();
      if (!googleEventId) continue;
      const occAllDay = Number(fresh.all_day || 0) === 1;
      // Google dateTime+timeZone expects wall clock — never send stored UTC DATETIME as wall.
      const gStart = occAllDay
        ? null
        : (googleStartWall || utcMysqlToWallInTimeZone(fresh.start_at, tz));
      const gEnd = occAllDay
        ? null
        : (googleEndWall || utcMysqlToWallInTimeZone(fresh.end_at, tz));
      // eslint-disable-next-line no-await-in-loop
      await GoogleCalendarService.upsertProviderPrimaryCalendarEvent({
        subjectEmail,
        existingGoogleEventId: googleEventId,
        summary: String(fresh?.title || title || '').trim() || 'Schedule event',
        description: fresh?.description || null,
        startAt: gStart,
        endAt: gEnd,
        allDay: occAllDay,
        startDate: occAllDay && fresh.start_date ? String(fresh.start_date).slice(0, 10) : null,
        endDate: occAllDay && fresh.end_date ? String(fresh.end_date).slice(0, 10) : null,
        timeZone: tz,
        ...(occId === eventId && attendeeEmails ? { attendees: attendeeEmails } : {})
      }).catch(() => {});
    }

    return res.json({
      ok: true,
      scope,
      updatedCount: rowsToUpdate.length,
      event: {
        id: Number(updated?.id || eventId),
        agencyId: Number(updated?.agency_id || 0) || null,
        kind,
        title: String(updated?.title || '').trim(),
        description: String(updated?.description || '').trim() || null,
        clientId: Number(updated?.client_id || 0) || null,
        isPrivate: Number(updated?.is_private || 0) === 1,
        allDay: Number(updated?.all_day || 0) === 1,
        startAt: allDay ? null : (scheduleEventStartEndForSummary(updated).startAt),
        endAt: allDay ? null : (scheduleEventStartEndForSummary(updated).endAt),
        // The zone of record for re-editing — clients must not re-guess this from ambient UI state.
        timeZone: allDay ? null : (updated?.event_timezone || updateTimeZone || null),
        startDate: updated?.start_date ? String(updated.start_date).slice(0, 10) : null,
        endDate: updated?.end_date ? String(updated.end_date).slice(0, 10) : null,
        attendeeUserIds: Array.isArray(resolvedAttendeeUserIds) ? resolvedAttendeeUserIds : undefined,
        isTrainingPayEligible: Number(updated?.is_training_pay_eligible || 0) === 1,
        waitingRoomEnabled: ['TEAM_MEETING', 'HUDDLE'].includes(kind)
          ? !(updated?.waiting_room_enabled === 0
            || updated?.waiting_room_enabled === false
            || updated?.waiting_room_enabled === '0')
          : null,
        notifyParticipants: ['TEAM_MEETING', 'HUDDLE'].includes(kind)
          ? !(updated?.notify_participants === 0
            || updated?.notify_participants === false
            || updated?.notify_participants === '0')
          : null,
        recurrenceSeriesId: seriesId || null
      }
    });
  } catch (e) {
    next(e);
  }
};

export const deleteUserScheduleEvent = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const eventId = parseInt(req.params.eventId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!(await assertCanManageTargetSchedule({
      actorUserId,
      actorRole,
      targetUserId: userId
    }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let target = await ProviderScheduleEvent.findByIdForProvider({ eventId, providerId: userId });
    if (!target) {
      const byId = await ProviderScheduleEvent.findById(eventId);
      if (byId) {
        const hostId = Number(byId.provider_id || 0);
        if (hostId > 0 && (await assertCanManageTargetSchedule({
          actorUserId,
          actorRole,
          targetUserId: hostId,
          agencyId: Number(byId.agency_id || 0) || null
        }))) {
          target = byId;
        }
      }
    }
    if (!target) return res.status(404).json({ error: { message: 'Schedule event not found' } });
    if (String(target.status || '').trim().toUpperCase() === 'CANCELLED') {
      return res.json({ ok: true, cancelledCount: 0, alreadyCancelled: true });
    }

    const hostProviderId = Number(target.provider_id || userId) || userId;
    const provider = await User.findById(hostProviderId);
    if (!provider) return res.status(404).json({ error: { message: 'User not found' } });
    const subjectEmail = String(provider?.email || '').trim().toLowerCase();

    const scope = String(req.query?.scope || req.body?.scope || 'single').trim().toLowerCase();
    if (!['single', 'future', 'others'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be single, future, or others' } });
    }
    // Only suppress the cancellation email when explicitly opted out — default stays 'send'.
    const notifyRaw = req.query?.notifyParticipants ?? req.body?.notifyParticipants;
    const notifyParticipants = !(
      notifyRaw === false || notifyRaw === 0 || notifyRaw === '0' || notifyRaw === 'false'
    );

    let rowsToCancel = [target];
    const seriesId = String(target.recurrence_series_id || '').trim();
    if (scope === 'future' || scope === 'others') {
      if (!seriesId) {
        return res.status(400).json({ error: { message: 'This event is not part of a recurring series.' } });
      }
      if (scope === 'future') {
        rowsToCancel = await ProviderScheduleEvent.listActiveSeriesFromPoint({
          recurrenceSeriesId: seriesId,
          providerId: hostProviderId,
          fromStartAt: target.start_at || null,
          fromStartDate: target.start_date || null
        });
        if (!rowsToCancel.length) rowsToCancel = [target];
      } else {
        rowsToCancel = await ProviderScheduleEvent.listActiveOthersInSeries({
          recurrenceSeriesId: seriesId,
          providerId: hostProviderId,
          excludeEventId: eventId
        });
      }
    }

    const ids = rowsToCancel.map((r) => Number(r.id || 0)).filter((n) => n > 0);
    // Soft-cancel in-app; best-effort mark Google copy cancelled via delete
    // (keeps Google clean while app calendars retain CANCELLED rows).
    await Promise.all(rowsToCancel.map(async (row) => {
      const gid = String(row?.google_event_id || '').trim();
      if (!gid || !subjectEmail) return;
      await GoogleCalendarService.deleteEvent({
        subjectEmail,
        calendarId: 'primary',
        eventId: gid,
        sendUpdates: notifyParticipants ? 'all' : 'none'
      }).catch(() => {});
    }));

    const cancelledCount = await ProviderScheduleEvent.cancelByIds({
      eventIds: ids,
      updatedByUserId: actorUserId
    });

    try {
      const { withdrawTrainingPayClaimsForEventIds } = await import('../services/scheduleEventTrainingPay.service.js');
      await withdrawTrainingPayClaimsForEventIds({
        eventIds: ids,
        providerId: hostProviderId
      });
    } catch (payErr) {
      console.warn('[deleteUserScheduleEvent] training pay withdraw failed', payErr?.message || payErr);
    }

    return res.json({
      ok: true,
      scope,
      cancelledCount,
      deletedCount: cancelledCount,
      seriesId: seriesId || null
    });
  } catch (e) {
    next(e);
  }
};

export const listUserMeetingCandidates = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!(await assertCanManageTargetSchedule({
      actorUserId,
      actorRole,
      targetUserId: userId,
      agencyId: Number(req.query?.agencyId || 0) || null
    }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const isActorSuperAdmin = actorRole === 'super_admin' || actorRole === 'superadmin';

    const targetAgencies = await User.getAgencies(userId);
    const targetAgencyIds = Array.from(new Set((targetAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0)));
    if (!targetAgencyIds.length && !isActorSuperAdmin) {
      return res.json({ ok: true, agencyIds: [], users: [] });
    }

    const actorAgencies = await User.getAgencies(actorUserId);
    const actorAgencyIds = Array.from(new Set((actorAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0)));
    const accessibleAgencyIds = targetAgencyIds.filter((id) => actorAgencyIds.includes(id));
    if (!accessibleAgencyIds.length && !isActorSuperAdmin) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const allAgencies = String(req.query?.allAgencies || '').trim().toLowerCase() === 'true';
    const requestedAgencyId = Number(req.query?.agencyId || 0);
    let scopedAgencyIds = [];
    if (allAgencies) {
      if (isActorSuperAdmin) {
        // Platform operators should see coworkers across every active tenant, not only
        // agencies the viewed user happens to belong to.
        try {
          const [agencyRows] = await pool.execute(
            `SELECT id
             FROM agencies
             WHERE is_active = TRUE
               AND (is_archived IS NULL OR is_archived = FALSE)
               AND LOWER(COALESCE(organization_type, 'agency')) IN ('agency', 'life_coach', 'consultant')
             ORDER BY id ASC`
          );
          scopedAgencyIds = Array.from(new Set(
            (agencyRows || []).map((r) => Number(r?.id || 0)).filter((n) => n > 0)
          ));
        } catch {
          scopedAgencyIds = [];
        }
        if (!scopedAgencyIds.length) scopedAgencyIds = targetAgencyIds;
      } else {
        scopedAgencyIds = accessibleAgencyIds;
      }
    } else {
      const fallbackAgencyId = (isActorSuperAdmin ? targetAgencyIds : accessibleAgencyIds)[0] || 0;
      const agencyId = requestedAgencyId > 0 ? requestedAgencyId : fallbackAgencyId;
      let scopeAllowed = accessibleAgencyIds.includes(agencyId);
      if (isActorSuperAdmin) {
        if (targetAgencyIds.includes(agencyId) || accessibleAgencyIds.includes(agencyId)) {
          scopeAllowed = true;
        } else if (agencyId > 0) {
          // Superadmin may scope to any active tenant, not only personal memberships.
          try {
            const [chk] = await pool.execute(
              `SELECT id FROM agencies
               WHERE id = ?
                 AND is_active = TRUE
                 AND (is_archived IS NULL OR is_archived = FALSE)
               LIMIT 1`,
              [agencyId]
            );
            scopeAllowed = Array.isArray(chk) && chk.length > 0;
          } catch {
            scopeAllowed = false;
          }
        } else {
          scopeAllowed = false;
        }
      }
      if (!agencyId || !scopeAllowed) {
        return res.status(403).json({ error: { message: 'Access denied for this agency' } });
      }
      scopedAgencyIds = [agencyId];
    }
    if (!scopedAgencyIds.length && !isActorSuperAdmin) {
      return res.json({ ok: true, agencyIds: [], users: [] });
    }

    let users = [];
    if (scopedAgencyIds.length) {
      const placeholders = scopedAgencyIds.map(() => '?').join(',');
      const { scheduleCoworkerRoleSqlClause, scheduleCoworkerRoleSqlParams } = await import('../utils/scheduleCoworkerRoles.js');
      const roleClause = scheduleCoworkerRoleSqlClause('u.role');
      const [rows] = await pool.execute(
        `SELECT
           u.id,
           u.first_name,
           u.last_name,
           u.email,
           u.role,
           u.profile_photo_path,
           GROUP_CONCAT(DISTINCT ua.agency_id ORDER BY ua.agency_id ASC) AS agency_ids
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id IN (${placeholders})
           AND u.id <> ?
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
           AND ${roleClause}
         GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.profile_photo_path
         ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
        [...scopedAgencyIds, userId, ...scheduleCoworkerRoleSqlParams()]
      );

      users = (rows || []).map((r) => ({
        id: Number(r.id || 0),
        firstName: String(r.first_name || '').trim(),
        lastName: String(r.last_name || '').trim(),
        email: String(r.email || '').trim().toLowerCase(),
        role: String(r.role || '').trim().toLowerCase(),
        profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path || null) || null,
        agencyIds: String(r.agency_ids || '')
          .split(',')
          .map((v) => Number(v || 0))
          .filter((n) => n > 0)
      })).filter((u) => u.id > 0);
    }

    if (isActorSuperAdmin) {
      const existingIds = new Set(users.map((u) => u.id));
      const [platformRows] = await pool.execute(
        `SELECT
           u.id,
           u.first_name,
           u.last_name,
           u.email,
           u.role,
           u.profile_photo_path,
           GROUP_CONCAT(DISTINCT ua.agency_id ORDER BY ua.agency_id ASC) AS agency_ids
         FROM users u
         LEFT JOIN user_agencies ua ON ua.user_id = u.id
         WHERE u.id <> ?
           AND LOWER(COALESCE(u.role, '')) IN ('super_admin', 'superadmin')
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
         GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.profile_photo_path
         ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
        [userId]
      );
      for (const r of (platformRows || [])) {
        const id = Number(r.id || 0);
        if (!id || existingIds.has(id)) continue;
        existingIds.add(id);
        users.push({
          id,
          firstName: String(r.first_name || '').trim(),
          lastName: String(r.last_name || '').trim(),
          email: String(r.email || '').trim().toLowerCase(),
          role: String(r.role || '').trim().toLowerCase(),
          profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path || null) || null,
          agencyIds: String(r.agency_ids || '')
            .split(',')
            .map((v) => Number(v || 0))
            .filter((n) => n > 0)
        });
      }
      users.sort((a, b) => {
        const last = String(a.lastName || '').localeCompare(String(b.lastName || ''));
        if (last !== 0) return last;
        return String(a.firstName || '').localeCompare(String(b.firstName || ''));
      });
    }

    const candidateIdSet = new Set(users.map((u) => u.id));
    const filterCandidateIds = (ids) => (ids || [])
      .map((n) => Number(n || 0))
      .filter((id) => id > 0 && candidateIdSet.has(id));

    const groups = [];
    const providerIds = filterCandidateIds(
      users.filter((u) => ['provider', 'provider_plus', 'clinician'].includes(u.role)).map((u) => u.id)
    );
    const adminStaffIds = filterCandidateIds(
      users.filter((u) => ['admin', 'assistant_admin', 'staff', 'support', 'clinical_practice_assistant', 'super_admin', 'superadmin'].includes(u.role)).map((u) => u.id)
    );
    if (providerIds.length) {
      groups.push({ key: 'role:providers', label: 'Providers', kind: 'team', userIds: providerIds });
    }
    if (adminStaffIds.length) {
      groups.push({ key: 'role:admin_staff', label: 'Admin / staff', kind: 'team', userIds: adminStaffIds });
    }

    if (scopedAgencyIds.length) {
      const placeholders = scopedAgencyIds.map(() => '?').join(',');
    try {
      const [supervisorRows] = await pool.execute(
        `SELECT DISTINCT supervisor_id AS user_id
         FROM supervisor_assignments
         WHERE agency_id IN (${placeholders})`,
        scopedAgencyIds
      );
      const supervisorIds = filterCandidateIds((supervisorRows || []).map((r) => r.user_id));
      if (supervisorIds.length) {
        groups.push({ key: 'rel:supervisors', label: 'Supervisors', kind: 'team', userIds: supervisorIds });
      }

      const [superviseeRows] = await pool.execute(
        `SELECT DISTINCT supervisee_id AS user_id
         FROM supervisor_assignments
         WHERE agency_id IN (${placeholders})`,
        scopedAgencyIds
      );
      const superviseeIds = filterCandidateIds((superviseeRows || []).map((r) => r.user_id));
      if (superviseeIds.length) {
        groups.push({ key: 'rel:supervisees', label: 'Supervisees', kind: 'team', userIds: superviseeIds });
      }
    } catch {
      // supervisor_assignments may be unavailable in some environments
    }

    try {
      const [deptRows] = await pool.execute(
        `SELECT d.id, d.name, d.agency_id, GROUP_CONCAT(uda.user_id) AS user_ids
         FROM agency_departments d
         INNER JOIN user_department_assignments uda
           ON uda.department_id = d.id AND uda.agency_id = d.agency_id
         WHERE d.agency_id IN (${placeholders}) AND d.is_active = 1
         GROUP BY d.id, d.name, d.agency_id
         ORDER BY d.display_order, d.name`,
        scopedAgencyIds
      );
      for (const row of (deptRows || [])) {
        const userIds = filterCandidateIds(String(row.user_ids || '').split(','));
        if (!userIds.length) continue;
        const agencySuffix = scopedAgencyIds.length > 1 ? ` (agency ${Number(row.agency_id || 0)})` : '';
        groups.push({
          key: `department:${Number(row.id || 0)}`,
          label: `${String(row.name || 'Department').trim()}${agencySuffix}`,
          kind: 'group',
          userIds
        });
      }
    } catch {
      // department tables may not exist
    }

    try {
      const AgencyMeetingInviteGroup = (await import('../models/AgencyMeetingInviteGroup.model.js')).default;
      const customGroups = await AgencyMeetingInviteGroup.listByAgencyIds(scopedAgencyIds);
      for (const g of customGroups) {
        const userIds = filterCandidateIds(g.userIds);
        groups.push({
          key: `custom:${g.id}`,
          label: g.name,
          kind: 'custom',
          customGroupId: g.id,
          userIds: userIds.length ? userIds : (g.userIds || [])
        });
      }
    } catch {
      // custom invite-group tables may not exist yet
    }
    }

    if (users.length) {
      groups.unshift({
        key: 'all:available',
        label: 'Everyone available',
        kind: 'team',
        userIds: users.map((u) => u.id)
      });
    }

    return res.json({
      ok: true,
      agencyIds: scopedAgencyIds,
      allAgencies,
      users,
      groups
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/users/:id/meeting-invite-groups
 * Create a named invite group for the selected agency (from current participant selection).
 */
export const createUserMeetingInviteGroup = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const agencyId = Number(req.body?.agencyId || req.query?.agencyId || 0);
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const userIds = Array.from(
      new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : [])
        .map((n) => Number(n || 0))
        .filter((n) => n > 0))
    );

    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!name) return res.status(400).json({ error: { message: 'Group name is required' } });
    if (!userIds.length) {
      return res.status(400).json({ error: { message: 'Select at least one participant before creating a group.' } });
    }

    if (!(await assertCanManageTargetSchedule({
      actorUserId,
      actorRole,
      targetUserId: userId,
      agencyId
    }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const actorAgencies = await User.getAgencies(actorUserId);
    const actorAgencyIds = new Set((actorAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0));
    if (actorRole !== 'super_admin' && !actorAgencyIds.has(agencyId)) {
      return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    }

    const placeholders = userIds.map(() => '?').join(',');
    const [memberRows] = await pool.execute(
      `SELECT u.id
       FROM users u
       WHERE u.id IN (${placeholders})
         AND EXISTS (
           SELECT 1 FROM user_agencies ua
           WHERE ua.user_id = u.id AND ua.agency_id = ?
         )`,
      [...userIds, agencyId]
    );
    const validIds = (memberRows || []).map((r) => Number(r.id || 0)).filter((n) => n > 0);
    if (!validIds.length) {
      return res.status(400).json({ error: { message: 'Selected participants are not in this agency.' } });
    }

    const AgencyMeetingInviteGroup = (await import('../models/AgencyMeetingInviteGroup.model.js')).default;
    const group = await AgencyMeetingInviteGroup.create({
      agencyId,
      name,
      createdByUserId: actorUserId,
      userIds: validIds
    });
    if (!group) return res.status(500).json({ error: { message: 'Failed to create group' } });

    return res.status(201).json({
      ok: true,
      group: {
        key: `custom:${group.id}`,
        label: group.name,
        kind: 'custom',
        customGroupId: group.id,
        userIds: group.userIds
      }
    });
  } catch (e) {
    if (String(e?.code || '') === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: { message: 'Meeting invite groups are not available yet. Run database migrations and try again.' }
      });
    }
    next(e);
  }
};

/**
 * PUT /api/users/:id/meeting-invite-groups/:groupId/members
 * Replace group membership and sync future linked schedule events.
 */
export const updateUserMeetingInviteGroupMembers = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const groupId = parseInt(req.params.groupId, 10);
    if (!userId || !groupId) {
      return res.status(400).json({ error: { message: 'Invalid user or group id' } });
    }

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const agencyId = Number(req.body?.agencyId || req.query?.agencyId || 0);
    const userIds = Array.from(
      new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : [])
        .map((n) => Number(n || 0))
        .filter((n) => n > 0))
    );

    const AgencyMeetingInviteGroup = (await import('../models/AgencyMeetingInviteGroup.model.js')).default;
    const group = await AgencyMeetingInviteGroup.findById(groupId);
    if (!group) return res.status(404).json({ error: { message: 'Group not found' } });

    const resolvedAgencyId = agencyId || Number(group.agencyId || 0);
    if (!resolvedAgencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    if (!(await assertCanManageTargetSchedule({
      actorUserId,
      actorRole,
      targetUserId: userId,
      agencyId: resolvedAgencyId
    }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const actorAgencies = await User.getAgencies(actorUserId);
    const actorAgencyIds = new Set((actorAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0));
    if (actorRole !== 'super_admin' && !actorAgencyIds.has(resolvedAgencyId)) {
      return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    }

    const placeholders = userIds.length ? userIds.map(() => '?').join(',') : '';
    let validIds = [];
    if (userIds.length) {
      const [memberRows] = await pool.execute(
        `SELECT u.id
         FROM users u
         WHERE u.id IN (${placeholders})
           AND EXISTS (
             SELECT 1 FROM user_agencies ua
             WHERE ua.user_id = u.id AND ua.agency_id = ?
           )
           AND COALESCE(u.is_active, 1) = 1
           AND COALESCE(u.is_archived, 0) = 0
           AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE_EMPLOYEE', 'PROSPECTIVE')`,
        [...userIds, resolvedAgencyId]
      );
      validIds = (memberRows || []).map((r) => Number(r.id || 0)).filter((n) => n > 0);
    }

    const { replaceGroupMembersWithSync } = await import('../services/meetingInviteGroupSync.service.js');
    const result = await replaceGroupMembersWithSync(groupId, validIds);
    if (!result?.ok) return res.status(404).json({ error: { message: 'Group not found' } });

    return res.json({
      ok: true,
      group: {
        key: `custom:${groupId}`,
        label: group.name,
        kind: 'custom',
        customGroupId: groupId,
        userIds: result.userIds || validIds
      },
      synced: {
        added: result.added || [],
        removed: result.removed || []
      }
    });
  } catch (e) {
    if (String(e?.code || '') === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: { message: 'Meeting invite groups are not available yet. Run database migrations and try again.' }
      });
    }
    next(e);
  }
};

function virtualSessionClientDisplayName(row = {}) {
  const full = String(row.full_name || '').trim();
  if (full) return full.slice(0, 200);
  const initials = String(row.initials || '').trim();
  if (initials) return initials.slice(0, 32);
  const code = String(row.identifier_code || '').trim();
  if (code) return code.slice(0, 64);
  const id = Number(row.id || 0);
  return id > 0 ? `Client ${id}` : 'Client';
}

/** Clients (and optional guardians) eligible for individual virtual session attendees. */
export const listUserVirtualSessionClients = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const actorUserId = Number(req.user?.id || 0);
    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!(await assertCanManageTargetSchedule({
      actorUserId,
      actorRole,
      targetUserId: userId,
      agencyId: Number(req.query?.agencyId || 0) || null
    }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencyId = Number(req.query?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const isSuperAdmin = actorRole === 'super_admin' || actorRole === 'superadmin';
    const targetAgencies = await User.getAgencies(userId);
    const targetAgencyIds = Array.from(new Set((targetAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0)));
    if (!targetAgencyIds.includes(agencyId) && !isSuperAdmin) {
      return res.status(403).json({ error: { message: 'Provider is not assigned to this agency' } });
    }

    const actorAgencies = await User.getAgencies(actorUserId);
    const actorAgencyIds = Array.from(new Set((actorAgencies || []).map((a) => Number(a?.id || 0)).filter((n) => n > 0)));
    if (!actorAgencyIds.includes(agencyId) && !isSuperAdmin) {
      return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    }

    const includeGuardians = String(req.query?.includeGuardians || '').trim().toLowerCase() === 'true';
    const listAllAgencyClients = canListAllAgencyClientsForSchedule(actorRole);

    let clientRows = [];
    try {
      if (listAllAgencyClients) {
        const [rows] = await pool.execute(
          `SELECT DISTINCT
             c.id,
             c.full_name,
             c.initials,
             c.identifier_code,
             c.client_type,
             cs.status_key AS client_status_key,
             cs.label AS client_status_label
           FROM clients c
           LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
           WHERE UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
             AND c.agency_id = ?
           ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code) ASC, c.id ASC`,
          [agencyId]
        );
        clientRows = rows || [];
      } else {
        const [rows] = await pool.execute(
          `SELECT DISTINCT
             c.id,
             c.full_name,
             c.initials,
             c.identifier_code,
             c.client_type,
             cs.status_key AS client_status_key,
             cs.label AS client_status_label
           FROM clients c
           LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
           WHERE UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
             AND (
               (c.agency_id = ? AND c.provider_id = ?)
               OR EXISTS (
                 SELECT 1
                 FROM client_provider_assignments cpa
                 JOIN clients cx ON cx.id = cpa.client_id
                 WHERE cpa.client_id = c.id
                   AND cpa.provider_user_id = ?
                   AND cpa.is_active = TRUE
                   AND cx.agency_id = ?
               )
             )
           ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code) ASC, c.id ASC`,
          [agencyId, userId, userId, agencyId]
        );
        clientRows = rows || [];
      }
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column');
      if (!missing) throw e;
      if (listAllAgencyClients) {
        const [rows] = await pool.execute(
          `SELECT DISTINCT
             c.id,
             c.full_name,
             c.initials,
             c.identifier_code,
             c.client_type,
             NULL AS client_status_key,
             NULL AS client_status_label
           FROM clients c
           WHERE UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
             AND c.agency_id = ?
           ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code) ASC, c.id ASC`,
          [agencyId]
        );
        clientRows = rows || [];
      } else {
        const [rows] = await pool.execute(
          `SELECT DISTINCT
             c.id,
             c.full_name,
             c.initials,
             c.identifier_code,
             c.client_type,
             NULL AS client_status_key,
             NULL AS client_status_label
           FROM clients c
           WHERE UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
             AND c.agency_id = ?
             AND c.provider_id = ?
           ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code) ASC, c.id ASC`,
          [agencyId, userId]
        );
        clientRows = rows || [];
      }
    }

    const clients = (clientRows || []).map((r) => ({
      id: Number(r.id || 0),
      fullName: String(r.full_name || '').trim() || null,
      initials: String(r.initials || '').trim() || null,
      identifierCode: String(r.identifier_code || '').trim() || null,
      displayName: virtualSessionClientDisplayName(r),
      clientType: String(r.client_type || '').trim().toLowerCase() || null,
      statusKey: String(r.client_status_key || '').trim().toLowerCase() || null,
      statusLabel: String(r.client_status_label || '').trim() || null,
      schools: []
    })).filter((c) => c.id > 0);

    // Attach school organizations (for location picker — clinical site, not claim billing address).
    if (clients.length) {
      const clientIds = clients.map((c) => c.id);
      const placeholders = clientIds.map(() => '?').join(',');
      try {
        const [schoolRows] = await pool.execute(
          `SELECT
             coa.client_id,
             a.id AS school_organization_id,
             a.name AS school_name,
             coa.is_primary
           FROM client_organization_assignments coa
           JOIN agencies a ON a.id = coa.organization_id
           WHERE coa.client_id IN (${placeholders})
             AND coa.is_active = TRUE
             AND LOWER(COALESCE(a.organization_type, '')) = 'school'
           ORDER BY coa.is_primary DESC, a.name ASC`,
          clientIds
        );
        const byClient = new Map();
        for (const row of schoolRows || []) {
          const cid = Number(row.client_id || 0);
          const sid = Number(row.school_organization_id || 0);
          if (!cid || !sid) continue;
          if (!byClient.has(cid)) byClient.set(cid, []);
          byClient.get(cid).push({
            schoolOrganizationId: sid,
            name: String(row.school_name || '').trim() || `School #${sid}`,
            isPrimary: !!row.is_primary
          });
        }
        for (const c of clients) {
          c.schools = byClient.get(c.id) || [];
        }
      } catch {
        // assignments table / organization_type may be unavailable
      }
    }

    let guardians = [];
    if (includeGuardians && clients.length) {
      const clientIds = clients.map((c) => c.id);
      const placeholders = clientIds.map(() => '?').join(',');
      try {
        const [guardianRows] = await pool.execute(
          `SELECT
             cg.client_id,
             cg.guardian_user_id,
             cg.relationship_type,
             gu.first_name,
             gu.last_name,
             gu.email
           FROM client_guardians cg
           JOIN users gu ON gu.id = cg.guardian_user_id
           WHERE cg.client_id IN (${placeholders})
             AND (gu.is_active IS NULL OR gu.is_active = TRUE)
             AND (gu.is_archived IS NULL OR gu.is_archived = FALSE)
           ORDER BY gu.last_name ASC, gu.first_name ASC, cg.guardian_user_id ASC`,
          clientIds
        );
        const clientNameById = new Map(clients.map((c) => [c.id, c.displayName]));
        guardians = (guardianRows || []).map((r) => {
          const userIdNum = Number(r.guardian_user_id || 0);
          const clientId = Number(r.client_id || 0);
          const first = String(r.first_name || '').trim();
          const last = String(r.last_name || '').trim();
          const name = `${first} ${last}`.trim() || String(r.email || '').trim() || `Guardian ${userIdNum}`;
          return {
            userId: userIdNum,
            clientId,
            clientName: clientNameById.get(clientId) || null,
            firstName: first || null,
            lastName: last || null,
            email: String(r.email || '').trim().toLowerCase() || null,
            displayName: name,
            relationshipType: String(r.relationship_type || 'guardian').trim().toLowerCase()
          };
        }).filter((g) => g.userId > 0 && g.clientId > 0);
      } catch {
        guardians = [];
      }
    }

    return res.json({
      ok: true,
      agencyId,
      clients,
      guardians
    });
  } catch (e) {
    next(e);
  }
};

export const getUserGoogleEvent = async (req, res, next) => {
  try {
    const providerId = parseInt(req.params.id, 10);
    const eventId = String(req.params.eventId || '').trim();
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const isSelf = Number(req.user?.id || 0) === Number(providerId);
    if (!isSelf && !canViewProviderScheduleSummary(req.user?.role)) {
      const requestingUser = await User.findById(req.user?.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      if (!isSupervisor) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const provider = await User.findById(providerId);
    if (!provider) return res.status(404).json({ error: { message: 'User not found' } });

    if (!isSelf && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      const ok = await requireSharedAgencyAccessOrSuperAdmin({
        actorUserId: req.user.id,
        targetUserId: providerId,
        actorRole: req.user.role
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const providerEmail = String(provider?.email || '').trim().toLowerCase();
    if (!providerEmail) return res.status(400).json({ error: { message: 'Provider email is required' } });

    const result = await GoogleCalendarService.getEvent({
      subjectEmail: providerEmail,
      calendarId: 'primary',
      eventId
    });

    if (!result?.ok) {
      if (result?.reason === 'event_not_found') return res.status(404).json({ error: { message: 'Event not found or deleted' } });
      return res.status(502).json({ error: { message: result?.error || result?.reason || 'Failed to fetch event' } });
    }

    res.json(result.event);
  } catch (e) {
    next(e);
  }
};

export const patchUserGoogleEvent = async (req, res, next) => {
  try {
    const providerId = parseInt(req.params.id, 10);
    const eventId = String(req.params.eventId || '').trim();
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    if (Number(req.user?.id || 0) !== Number(providerId)) {
      return res.status(403).json({ error: { message: 'You can only edit your own calendar events' } });
    }

    const provider = await User.findById(providerId);
    if (!provider) return res.status(404).json({ error: { message: 'User not found' } });

    const providerEmail = String(provider?.email || '').trim().toLowerCase();
    if (!providerEmail) return res.status(400).json({ error: { message: 'Provider email is required' } });

    const { summary, description, location, startAt, endAt } = req.body || {};

    if (startAt != null && endAt != null) {
      const st = new Date(startAt).getTime();
      const en = new Date(endAt).getTime();
      if (Number.isNaN(st) || Number.isNaN(en)) {
        return res.status(400).json({ error: { message: 'startAt and endAt must be valid date/time values' } });
      }
      if (en <= st) {
        return res.status(400).json({ error: { message: 'endAt must be after startAt' } });
      }
    }

    const result = await GoogleCalendarService.patchEvent({
      subjectEmail: providerEmail,
      calendarId: 'primary',
      eventId,
      summary,
      description,
      location,
      startAt,
      endAt
    });

    if (!result?.ok) {
      if (result?.reason === 'event_not_found') return res.status(404).json({ error: { message: 'Event not found or deleted' } });
      if (result?.reason === 'no_updates') return res.status(400).json({ error: { message: result?.error || 'No fields to update' } });
      return res.status(502).json({ error: { message: result?.error || result?.reason || 'Failed to update event' } });
    }

    res.json({ ok: true, event: result.event });
  } catch (e) {
    next(e);
  }
};

export const deleteUserGoogleEvent = async (req, res, next) => {
  try {
    const providerId = parseInt(req.params.id, 10);
    const eventId = String(req.params.eventId || '').trim();
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    if (Number(req.user?.id || 0) !== Number(providerId)) {
      return res.status(403).json({ error: { message: 'You can only delete your own calendar events' } });
    }

    const provider = await User.findById(providerId);
    if (!provider) return res.status(404).json({ error: { message: 'User not found' } });

    const providerEmail = String(provider?.email || '').trim().toLowerCase();
    if (!providerEmail) return res.status(400).json({ error: { message: 'Provider email is required' } });

    const result = await GoogleCalendarService.deleteEvent({
      subjectEmail: providerEmail,
      calendarId: 'primary',
      eventId
    });

    if (!result?.ok && !result?.skipped) {
      return res.status(502).json({ error: { message: result?.error || result?.reason || 'Failed to delete event' } });
    }

    res.json({ ok: true, deleted: !result?.skipped });
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

    if (parseInt(id) !== req.user.id && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      try {
        const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
        if (agencyId) {
          await AdminAuditLog.logAction({
            actionType: 'supervisor_privileges_toggled',
            actorUserId: req.user.id,
            targetUserId: parseInt(id),
            agencyId,
            metadata: { enabled }
          });
        }
      } catch (e) {
        console.warn('Admin audit log failed:', e?.message || e);
      }
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
      if (req.user.role === 'clinical_practice_assistant' || req.user.role === 'provider_plus' || req.user.role === 'supervisor' || String(req.user.role || '').toLowerCase() === 'club_manager') {
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
        } else if (String(req.user.role || '').toLowerCase() === 'club_manager') {
          if (!(await clubManagerCanViewClubMemberUser(req, userId))) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const agencies = await User.getAgencies(userId);
    await attachAffiliationMeta(agencies);

    // If the user is attached to an affiliated child org (program/school/learning/etc),
    // include the parent agency row as well so tenant-scoped UIs (like Programs & events)
    // can be navigated without requiring a second explicit membership.
    try {
      const existingIds = new Set((agencies || []).map((a) => Number(a?.id)).filter((n) => n > 0));
      const parentIds = [...new Set((agencies || [])
        .map((a) => Number(a?.affiliated_agency_id || 0))
        .filter((n) => n > 0 && !existingIds.has(n))
      )];
      if (parentIds.length) {
        const ph = parentIds.map(() => '?').join(',');
        const [parentRows] = await pool.execute(
          `SELECT id, slug, name, portal_url, organization_type, color_palette, theme_settings, feature_flags
           FROM agencies
           WHERE id IN (${ph})
             AND (is_archived = FALSE OR is_archived IS NULL)
             AND (is_active = TRUE OR is_active IS NULL)`,
          parentIds
        );
        for (const row of parentRows || []) {
          const id = Number(row?.id || 0);
          if (!id || existingIds.has(id)) continue;
          agencies.push(row);
          existingIds.add(id);
        }
        await attachAffiliationMeta(agencies);
      }
    } catch {
      // best-effort
    }

    agencies.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
    res.json(agencies);
  } catch (error) {
    next(error);
  }
};

/**
 * Get providers for provider_plus (all providers in their agencies, for "Providers" card).
 * GET /users/me/providers-for-support?agencyId=
 * Returns same shape as supervisor-assignments for UI reuse.
 */
export const getProvidersForSupport = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (String(req.user?.role || '').toLowerCase() !== 'provider_plus') {
      return res.status(403).json({ error: { message: 'Provider plus access required' } });
    }

    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const userAgencies = await User.getAgencies(userId);
    const agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (agencyIds.length === 0) return res.json([]);

    const effectiveAgencyIds = agencyId && agencyIds.includes(agencyId) ? [agencyId] : agencyIds;
    const placeholders = effectiveAgencyIds.map(() => '?').join(',');

    const [rows] = await pool.execute(
      `SELECT DISTINCT
         u.id AS supervisee_id,
         u.first_name AS supervisee_first_name,
         u.last_name AS supervisee_last_name,
         u.profile_photo_path AS supervisee_profile_photo_path,
         a.name AS agency_name
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${placeholders})
       JOIN agencies a ON a.id = ua.agency_id
       WHERE (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
         AND (
           LOWER(COALESCE(u.role, '')) IN ('provider', 'supervisor', 'clinician')
           OR (u.has_provider_access = TRUE)
         )
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      effectiveAgencyIds
    );

    const out = (rows || []).map((r) => ({
      supervisee_id: Number(r.supervisee_id),
      supervisee_first_name: r.supervisee_first_name || '',
      supervisee_last_name: r.supervisee_last_name || '',
      agency_name: r.agency_name || '',
      supervisee_profile_photo_url: r.supervisee_profile_photo_path
        ? publicUploadsUrlFromStoredPath(r.supervisee_profile_photo_path)
        : null
    }));

    res.json(out);
  } catch (error) {
    next(error);
  }
};

/**
 * Get org slugs that the current user's supervisees are affiliated with (for router/school portal access).
 * For provider_plus: returns slugs from ALL providers in their agencies.
 * GET /users/me/supervisee-portal-slugs
 */
export const getSuperviseePortalSlugs = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const requestingUser = await User.findById(userId);
    const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
    const isProviderPlus = String(requestingUser?.role || '').toLowerCase() === 'provider_plus';

    let providerIds = [];
    if (isProviderPlus) {
      const userAgencies = await User.getAgencies(userId);
      const agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0);
      if (agencyIds.length === 0) return res.json({ slugs: [] });
      const placeholders = agencyIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${placeholders})
         WHERE (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
           AND (
             LOWER(COALESCE(u.role, '')) IN ('provider', 'supervisor', 'clinician')
             OR (u.has_provider_access = TRUE)
           )`,
        agencyIds
      );
      providerIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    } else if (isSupervisor) {
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const assignments = await SupervisorAssignment.findBySupervisor(userId, null);
      providerIds = [...new Set((assignments || []).map((a) => Number(a.supervisee_id)).filter((n) => Number.isFinite(n) && n > 0))];
    } else {
      return res.json({ slugs: [] });
    }

    const slugSet = new Set();
    for (const pid of providerIds) {
      try {
        const agencies = await User.getAgencies(pid);
        for (const a of agencies || []) {
          const slug = (a.slug || a.portal_url || '').toString().trim();
          if (slug) slugSet.add(slug);
        }
      } catch {
        // ignore per-user errors
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
      const isProviderPlus = String(req.user?.role || '').toLowerCase() === 'provider_plus';
      if (!isAdminOrSupport && !isProviderPlus) {
        const hasAccess = await User.supervisorHasAccess(requesterId, userId, null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'You can only view affiliated portals for yourself or your assigned supervisees.' } });
        }
      }
      if (isProviderPlus) {
        const requesterAgencies = await User.getAgencies(requesterId);
        const targetAgencies = await User.getAgencies(userId);
        const reqIds = new Set((requesterAgencies || []).map((a) => Number(a.id)));
        const shared = (targetAgencies || []).some((a) => reqIds.has(Number(a.id)));
        if (!shared) {
          return res.status(403).json({ error: { message: 'You can only view affiliated portals for providers in your organization.' } });
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

    const priorStart = membership?.supervision_start_date
      ? String(membership.supervision_start_date).slice(0, 10)
      : null;
    const updated = await User.setAgencySupervisionPrelicensedSettings(userId, agencyId, {
      isPrelicensed,
      isCompensable,
      startDate,
      startIndividualHours,
      startGroupHours
    });
    // Best-effort: recompute supervision account so profile reflects baseline changes quickly.
    // When effective start date changes, re-apply session hour credits so only post-date hours count.
    let supervisionAccount = null;
    try {
      const nextStart = startDate || null;
      if (priorStart !== nextStart) {
        const { resyncFinalizedSessionHourCreditsForUser } = await import('../services/supervisionFinalizePipeline.service.js');
        await resyncFinalizedSessionHourCreditsForUser({
          agencyId,
          userId,
          actorUserId: req.user?.id || null
        });
        // Rebuild payroll-period hour entries with the new effective-date filter.
        try {
          const db = (await import('../config/database.js')).default;
          await db.execute(
            `DELETE FROM supervision_period_entries WHERE agency_id = ? AND user_id = ?`,
            [agencyId, userId]
          );
          const { accruePrelicensedSupervisionFromPayroll } = await import('../services/supervision.service.js');
          const [periodRows] = await db.execute(
            `SELECT DISTINCT pp.id
             FROM payroll_periods pp
             JOIN payroll_imports pi ON pi.payroll_period_id = pp.id
             WHERE pp.agency_id = ?
             ORDER BY pp.period_end DESC
             LIMIT 24`,
            [agencyId]
          );
          for (const pr of periodRows || []) {
            // eslint-disable-next-line no-await-in-loop
            await accruePrelicensedSupervisionFromPayroll({
              agencyId,
              payrollPeriodId: Number(pr.id),
              uploadedByUserId: req.user?.id || null
            });
          }
        } catch {
          /* best-effort */
        }
      }
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


/**
 * GET /users/:id/supervision-prelicensed-classification
 * Returns the auto-detected prelicensed classification and any conflict reason
 * for each agency the user belongs to.  Admin-only.
 */
export const getSupervisionPrelicensedClassification = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const {
      classifyPrelicensedStatus,
      determineLicenseStatus,
      classifyPayAndHcbsCategories,
    } = await import('../utils/credentialNormalization.js');

    // Fetch user base fields (role needed for license status) + all agency memberships
    const pool = (await import('../config/database.js')).default;
    const [[userRows], [agencyRows]] = await Promise.all([
      pool.execute(
        `SELECT id, credential, title, role, is_hourly_worker FROM users WHERE id = ? LIMIT 1`,
        [userId]
      ),
      pool.execute(
        `SELECT ua.agency_id, ua.supervision_is_prelicensed, ua.supervision_start_date,
                a.name AS agency_name
         FROM user_agencies ua
         JOIN agencies a ON a.id = ua.agency_id
         WHERE ua.user_id = ?`,
        [userId]
      ),
    ]);

    const user = userRows?.[0];
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const isHourlyWorker = !!(user.is_hourly_worker === 1 || user.is_hourly_worker === true || user.is_hourly_worker === '1');

    // License status is user-level (same across all agencies)
    const licenseClassification = determineLicenseStatus({
      credential: user.credential,
      title: user.title,
      jobTitle: null,
      role: user.role,
      isHourlyWorker,
    });

    const categoryAxes = classifyPayAndHcbsCategories({
      credential: user.credential,
      title: user.title,
      jobTitle: null,
      role: user.role,
      isHourlyWorker,
    });

    const results = (agencyRows || []).map((ua) => {
      const manualFlag = !!(ua.supervision_is_prelicensed === 1 || ua.supervision_is_prelicensed === true || ua.supervision_is_prelicensed === '1');
      const cls = classifyPrelicensedStatus({
        credential: user.credential,
        title: user.title,
        jobTitle: null,
        role: user.role,
        isHourlyWorker: user.is_hourly_worker,
        manualIsPrelicensed: manualFlag,
      });
      return {
        agencyId: ua.agency_id,
        agencyName: ua.agency_name,
        manualIsPrelicensed: manualFlag,
        classifiedAs: cls.classifiedAs,
        conflictReason: cls.conflictReason,
        autoDetected: cls.autoDetected,
        credential: user.credential || null,
        title: user.title || null,
        isHourlyWorker,
        // License status fields (user-level, same for every agency row)
        licenseStatus: licenseClassification.status,       // 'licensed' | 'prelicensed' | 'unlicensed' | 'unknown'
        licenseStatusReason: licenseClassification.reason, // human-readable rule explanation
        // Derived pay / HCBS categories (user-level; not H0032 billing-minutes mode)
        payCategory: categoryAxes.payCategory,
        payCategoryLabel: categoryAxes.payCategoryLabel,
        payCategoryReason: categoryAxes.payCategoryReason,
        hcbsCategory: categoryAxes.hcbsCategory,
        hcbsCategoryLabel: categoryAxes.hcbsCategoryLabel,
        hcbsCategoryReason: categoryAxes.hcbsCategoryReason,
      };
    });

    res.json({ userId, results });
  } catch (e) {
    next(e);
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
    try {
      const aid = parseInt(agencyId, 10);
      if (aid) {
        await AdminAuditLog.logAction({
          actionType: 'user_assigned_to_agency',
          actorUserId: req.user.id,
          targetUserId: parseInt(userId, 10),
          agencyId: aid,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
    }
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

    await detachUserFromOrganization(conn, {
      userId: uid,
      agencyId: aid,
      actorUserId: req.user.id
    });

    try {
      if (aid) {
        await AdminAuditLog.logAction({
          actionType: 'user_removed_from_agency',
          actorUserId: req.user.id,
          targetUserId: uid,
          agencyId: aid,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
    }

    await conn.commit();

    try {
      const { detachUserFromMeetingInvites } = await import('../services/meetingInviteGroupSync.service.js');
      await detachUserFromMeetingInvites(uid, { agencyIds: [aid] });
    } catch (e) {
      console.warn('[removeUserFromAgency] meeting invite detach failed', e?.message || e);
    }

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

export const setUserAgencyBillingAccess = async (req, res, next) => {
  let conn;
  try {
    const { id } = req.params;
    const { agencyId, enabled } = req.body || {};

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userId = parseInt(id, 10);
    const agencyIdNum = agencyId ? parseInt(agencyId, 10) : null;
    if (!userId || !agencyIdNum) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: { message: 'enabled must be a boolean' } });
    }
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [membershipRows] = await conn.execute(
      'SELECT has_billing_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, agencyIdNum]
    );
    const membership = membershipRows?.[0] || null;
    if (!membership) {
      await conn.rollback();
      return res.status(400).json({ error: { message: 'User is not assigned to this agency' } });
    }

    const prevEnabled = normalizeBoolFlag(membership.has_billing_access);
    const nextEnabled = !!enabled;

    if (prevEnabled !== nextEnabled) {
      await conn.execute(
        'UPDATE user_agencies SET has_billing_access = ? WHERE user_id = ? AND agency_id = ?',
        [nextEnabled ? 1 : 0, userId, agencyIdNum]
      );
      await conn.execute(
        `INSERT INTO admin_audit_log
         (action_type, actor_user_id, target_user_id, module_id, track_id, agency_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          nextEnabled ? 'grant_billing_access' : 'revoke_billing_access',
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
      'SELECT has_billing_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, agencyIdNum]
    );
    await conn.commit();
    res.json({
      userId,
      agencyId: agencyIdNum,
      hasBillingAccess: normalizeBoolFlag(updatedRows?.[0]?.has_billing_access)
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

export const setUserAgencyDepartmentAccess = async (req, res, next) => {
  let conn;
  try {
    const { id } = req.params;
    const { agencyId, hasDepartmentAccess, departmentIds, departmentAssignments, assistantAdminPermissions } = req.body || {};

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userId = parseInt(id);
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    if (!userId || !agencyIdNum) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    // departmentAssignments: [{ departmentId, isApprover }] or legacy departmentIds: [1,2,3]
    let assignments = [];
    if (Array.isArray(departmentAssignments) && departmentAssignments.length > 0) {
      assignments = departmentAssignments
        .map((a) => ({
          departmentId: parseInt(a.departmentId ?? a.department_id, 10),
          isApprover: a.isApprover === true || a.is_approver === true
        }))
        .filter((a) => Number.isFinite(a.departmentId) && a.departmentId > 0);
    } else if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      assignments = departmentIds
        .map((d) => parseInt(d, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((departmentId) => ({ departmentId, isApprover: false }));
    }
    const deptIds = assignments.map((a) => a.departmentId);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [membershipRows] = await conn.execute(
      'SELECT has_department_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, agencyIdNum]
    );
    const membership = membershipRows?.[0] || null;
    if (!membership) {
      await conn.rollback();
      return res.status(400).json({ error: { message: 'User is not assigned to this agency' } });
    }

    const nextEnabled = !!hasDepartmentAccess;
    const permsJson = typeof assistantAdminPermissions === 'object' && assistantAdminPermissions !== null
      ? JSON.stringify(assistantAdminPermissions)
      : null;

    await conn.execute(
      'UPDATE user_agencies SET has_department_access = ?, assistant_admin_permissions_json = ? WHERE user_id = ? AND agency_id = ?',
      [nextEnabled ? 1 : 0, permsJson, userId, agencyIdNum]
    );

    await conn.execute(
      'DELETE FROM user_department_assignments WHERE user_id = ? AND agency_id = ?',
      [userId, agencyIdNum]
    );

    if (nextEnabled && deptIds.length > 0) {
      const placeholders = deptIds.map(() => '?').join(',');
      const [deptRows] = await conn.execute(
        `SELECT id FROM agency_departments WHERE id IN (${placeholders}) AND agency_id = ?`,
        [...deptIds, agencyIdNum]
      );
      const validSet = new Set((deptRows || []).map((r) => r.id));
      const assignMap = new Map(assignments.map((a) => [a.departmentId, a.isApprover]));
      for (const deptId of deptIds) {
        if (!validSet.has(deptId)) continue;
        const isApprover = assignMap.get(deptId) === true ? 1 : 0;
        try {
          await conn.execute(
            'INSERT INTO user_department_assignments (user_id, agency_id, department_id, is_approver) VALUES (?, ?, ?, ?)',
            [userId, agencyIdNum, deptId, isApprover]
          );
        } catch (e) {
          if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.message?.includes('is_approver')) {
            await conn.execute(
              'INSERT INTO user_department_assignments (user_id, agency_id, department_id) VALUES (?, ?, ?)',
              [userId, agencyIdNum, deptId]
            );
          } else throw e;
        }
      }
    }

    await conn.commit();

    const [updatedRows] = await conn.execute(
      'SELECT has_department_access, assistant_admin_permissions_json FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, agencyIdNum]
    );
    const [assignRows] = await conn.execute(
      'SELECT department_id, is_approver FROM user_department_assignments WHERE user_id = ? AND agency_id = ?',
      [userId, agencyIdNum]
    );

    const assignmentsForResponse = (assignRows || []).map((r) => ({
      departmentId: r.department_id,
      isApprover: r.is_approver === 1 || r.is_approver === true
    }));

    let perms = {};
    try {
      const raw = updatedRows?.[0]?.assistant_admin_permissions_json;
      if (raw) perms = typeof raw === 'object' ? raw : (typeof raw === 'string' ? JSON.parse(raw) : {});
    } catch {
      perms = {};
    }

    res.json({
      userId,
      agencyId: agencyIdNum,
      hasDepartmentAccess: normalizeBoolFlag(updatedRows?.[0]?.has_department_access),
      assistantAdminPermissions: perms,
      departmentIds: (assignRows || []).map((r) => r.department_id),
      departmentAssignments: assignmentsForResponse
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

export const getUserDepartmentAccess = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    if (!userId) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }

    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const [rows] = await pool.execute(
      `SELECT ua.agency_id, ua.has_department_access, ua.assistant_admin_permissions_json
       FROM user_agencies ua
       WHERE ua.user_id = ?`,
      [userId]
    );

    let assignRows = [];
    try {
      [assignRows] = await pool.execute(
        'SELECT agency_id, department_id, is_approver FROM user_department_assignments WHERE user_id = ?',
        [userId]
      );
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.message?.includes('is_approver')) {
        const [fallback] = await pool.execute(
          'SELECT agency_id, department_id FROM user_department_assignments WHERE user_id = ?',
          [userId]
        );
        assignRows = (fallback || []).map((r) => ({ ...r, is_approver: 0 }));
      } else throw e;
    }
    const assignByAgency = {};
    for (const a of assignRows || []) {
      const aid = String(a.agency_id);
      if (!assignByAgency[aid]) assignByAgency[aid] = [];
      assignByAgency[aid].push({
        departmentId: a.department_id,
        isApprover: a.is_approver === 1 || a.is_approver === true
      });
    }

    const result = (rows || []).map((r) => {
      let perms = {};
      try {
        const raw = r.assistant_admin_permissions_json;
        if (raw) perms = typeof raw === 'object' ? raw : (typeof raw === 'string' ? JSON.parse(raw) : {});
      } catch {
        perms = {};
      }
      const aid = String(r.agency_id);
      const assignments = assignByAgency[aid] || [];
      return {
        agencyId: r.agency_id,
        hasDepartmentAccess: normalizeBoolFlag(r.has_department_access),
        assistantAdminPermissions: perms,
        departmentIds: assignments.map((a) => a.departmentId),
        departmentAssignments: assignments
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
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

export const setUserAgencyMembershipRole = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userId = parseInt(req.params.id, 10);
    const agencyIdNum = parseInt(req.body?.agencyId, 10);
    if (!userId || !agencyIdNum) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyIdNum);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this agency' } });
    }

    let agencyRole = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'agencyRole')) {
      const normalized = normalizeAgencyRole(req.body.agencyRole);
      if (normalized && !AGENCY_POSITION_ROLE_VALUES.has(normalized)) {
        return res.status(400).json({ error: { message: 'Invalid agency role' } });
      }
      agencyRole = normalized || null;
    }

    let agencyPosition = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'agencyPosition')) {
      agencyPosition = String(req.body.agencyPosition || '').trim().slice(0, 120);
    }

    let includeOnDisclosure = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'includeOnDisclosure')) {
      const raw = req.body.includeOnDisclosure;
      if (raw === 'include' || raw === 1 || raw === true || raw === '1') includeOnDisclosure = 1;
      else if (raw === 'exclude' || raw === 0 || raw === false || raw === '0') includeOnDisclosure = 0;
      else includeOnDisclosure = null;
    }

    const updated = await User.setAgencyMembershipRole({
      userId,
      agencyId: agencyIdNum,
      agencyRole,
      agencyPosition,
      includeOnDisclosure
    });

    res.json({
      userId,
      agencyId: agencyIdNum,
      agencyRole: updated?.agency_role || null,
      agencyPosition: updated?.agency_position || null,
      includeOnDisclosure: updated?.include_on_disclosure === 1 || updated?.include_on_disclosure === true
        ? 1
        : (updated?.include_on_disclosure === 0 || updated?.include_on_disclosure === false ? 0 : null)
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

export const setCustomTemporaryPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { temporaryPassword: customPassword, expiresInDays, expiresInHours } = req.body;

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

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
      // Best-effort
    }

    const password = String(customPassword || '').trim();
    if (!password || password.length < 6) {
      return res.status(400).json({ error: { message: 'Temporary password must be at least 6 characters' } });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: { message: 'Temporary password must be no more than 128 characters' } });
    }
    if (!/[a-zA-Z]/.test(password)) {
      return res.status(400).json({ error: { message: 'Temporary password must contain at least one letter (a–z or A–Z)' } });
    }

    const finalExpiresInHours =
      Number.isFinite(parseInt(expiresInHours)) ? parseInt(expiresInHours) :
      Number.isFinite(parseInt(expiresInDays)) ? (parseInt(expiresInDays) * 24) :
      48;
    const result = await User.setTemporaryPassword(id, password, Math.max(1, finalExpiresInHours));

    res.json({
      temporaryPassword: password,
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
    
    const userAgencies = await User.getAgencies(user.id);
    const passwordlessTokenLink = buildPublicAppUrl(userAgencies?.[0], `passwordless-login/${tokenResult.token}`);
    
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

    const userAgencies = await User.getAgencies(user.id);
    const link = buildPublicAppUrl(userAgencies?.[0], `passwordless-login/${tokenResult.token}`);

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

    const userAgencies = await User.getAgencies(user.id);
    const link = buildPublicAppUrl(userAgencies?.[0], `passwordless-login/${tokenResult.token}`);

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

    const userAgencies = await User.getAgencies(userId);
    const buildResetLink = (token) =>
      buildPublicAppUrl(userAgencies?.[0], `reset-password/${token}`);

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
      const { sendEmailFromIdentity } = await import('../services/unifiedEmail/unifiedEmailSender.service.js');
      const { resolveSenderIdentityForSend } = await import('../services/emailSenderIdentityResolver.service.js');
      const EmailService = (await import('../services/email.service.js')).default;

      const agencyId = userAgencies?.[0]?.id || null;
      const agency = agencyId ? await Agency.findById(agencyId) : null;
      const to = [user.email, user.username, user.work_email, user.personal_email]
        .filter(Boolean)
        .map((e) => String(e).trim().toLowerCase())
        .find((e) => e.includes('@'));
      if (to) {
        let subject = 'Reset your password';
        const junkNotice = 'Important: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe so you do not miss future messages from us.';
        let body = `Reset your password using this link (expires in ${tokenResult.expiresInHours} hours):\n${resetLink}\n\n${junkNotice}\n\nIf you did not request this, you can ignore this email.`;
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
            if (!String(body).includes('Junk')) {
              body = `${body}\n\n${junkNotice}`;
            }
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
          const resolved = await resolveSenderIdentityForSend({
            agencyId,
            templateType: 'admin_initiated_password_reset',
            preferredKeys: ['technology', 'login_recovery', 'notifications']
          });
          const sendResult = resolved?.identity?.id
            ? await sendEmailFromIdentity({
                senderIdentityId: resolved.identity.id,
                to,
                subject,
                text: body,
                html: null,
                source: 'auto',
                templateType: 'admin_initiated_password_reset',
                usedFallbackSender: false
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
                agencyId: agencyId || null,
                templateType: 'admin_initiated_password_reset',
                usedFallbackSender: true
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

    const from = process.env.VONAGE_FROM || process.env.VONAGE_DEFAULT_FROM;
    if (!from) {
      return res.status(400).json({ error: { message: 'Missing VONAGE_FROM (or VONAGE_DEFAULT_FROM) env var' } });
    }

    // If the UI already generated a link, send that exact link; otherwise generate a fresh one (48h)
    let linkToSend = tokenLink;
    if (!linkToSend) {
      const tokenResult = await User.generatePasswordlessToken(userId, 48, 'reset');
      const userAgencies = await User.getAgencies(userId);
      linkToSend = buildPublicAppUrl(userAgencies?.[0], `reset-password/${tokenResult.token}`);
    }

    const VonageService = (await import('../services/vonage.service.js')).default;
    const body = `Reset your password using this link (expires in 48 hours): ${linkToSend}`;

    const msg = await VonageService.sendSms({ to, from, body });

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
    const targetId = parseInt(id, 10);
    const isSelf = Number.isFinite(targetId) && targetId === req.user.id;

    if (!isSelf && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      if (String(req.user?.role || '').toLowerCase() === 'club_manager') {
        if (!(await clubManagerCanViewClubMemberUser(req, id))) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
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
          assignmentId: assignment.id,
          firstName: assignment.supervisor_first_name,
          lastName: assignment.supervisor_last_name,
          email: assignment.supervisor_email,
          workPhone: null,
          workPhoneExtension: null,
          agencyName: assignment.agency_name,
          supervisorType: assignment.supervisor_type || 'clinical',
          isPrimary: !!(assignment.is_primary === 1 || assignment.is_primary === true)
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
    
    const { resolveSchoolStaffRoleTitleForUser } = await import('../services/schoolStaffContactRole.service.js');
    const resolvedRoleTitle = await resolveSchoolStaffRoleTitleForUser(user);

    const accountInfo = {
      loginEmail: user.email || user.work_email || 'Not provided',
      username: user.username || null,
      preferredName: user.preferred_name || null,
      title: resolvedRoleTitle ?? user.title ?? null,
      serviceFocus: user.service_focus ?? null,
      languagesSpoken: user.languages_spoken ?? null,
      psychologyTodayUrl: user.psychology_today_url ?? null,
      providerStartDate: toYmdDateOnly(user.provider_start_date),
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
      hasBillingAccess: (await User.listBillingAgencyIds(userIdInt)).length > 0,
      isMarketingContact: (await User.listMarketingAgencyIds(userIdInt)).length > 0,
      hasPlatformSupport: !!(user.has_platform_support === 1 || user.has_platform_support === true || user.has_platform_support === '1'),
      hasCredentialingAccess: (await User.listCredentialingAgencyIds(userIdInt)).length > 0,
      isHourlyWorker: !!(user.is_hourly_worker === 1 || user.is_hourly_worker === true || user.is_hourly_worker === '1'),
      hourlyDualRateEnabled: !!(user.hourly_dual_rate_enabled === 1 || user.hourly_dual_rate_enabled === true || user.hourly_dual_rate_enabled === '1'),
      hourly_dual_rate_enabled: !!(user.hourly_dual_rate_enabled === 1 || user.hourly_dual_rate_enabled === true || user.hourly_dual_rate_enabled === '1'),
      hasHiringAccess: !!(user.has_hiring_access === 1 || user.has_hiring_access === true || user.has_hiring_access === '1'),
      hasOutreachAccess: !!(user.has_outreach_access === 1 || user.has_outreach_access === true || user.has_outreach_access === '1'),
      hasMedicalRecordsReleaseAccess: !!(user.has_medical_records_release_access === 1 || user.has_medical_records_release_access === true || user.has_medical_records_release_access === '1'),
      hasGamesAccess: !!(user.has_games_access === 1 || user.has_games_access === true || user.has_games_access === '1'),
      companyCardEnabled: !!(user.company_card_enabled === 1 || user.company_card_enabled === true || user.company_card_enabled === '1'),
      companyCarSubmitAccess: !!(user.company_car_submit_access === 1 || user.company_car_submit_access === true || user.company_car_submit_access === '1'),
      companyCarManageAccess: !!(user.company_car_manage_access === 1 || user.company_car_manage_access === true || user.company_car_manage_access === '1'),
      skillBuilderEligible: !!(user.skill_builder_eligible === 1 || user.skill_builder_eligible === true || user.skill_builder_eligible === '1'),
      groupSupervisionEligible: !!(user.group_supervision_eligible === 1 || user.group_supervision_eligible === true || user.group_supervision_eligible === '1'),
      group_supervision_eligible: !!(user.group_supervision_eligible === 1 || user.group_supervision_eligible === true || user.group_supervision_eligible === '1'),
      medcancelRateSchedule: ['low', 'high', 'none'].includes(String(user.medcancel_rate_schedule || '').toLowerCase())
        ? String(user.medcancel_rate_schedule).toLowerCase()
        : 'none',
      employmentType: user.employment_type || null,
      benefitsNotes: user.benefits_notes ?? null,
      benefitsEligibilityOverrides: (() => {
        const raw = user.benefits_eligibility_overrides_json;
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch { return {}; }
      })(),
      benefitsEnrollment: (() => {
        const raw = user.benefits_enrollment_json;
        if (!raw) return null;
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch { return null; }
      })(),
      ...(resetLinkSent && {
        resetLinkSentAt: resetLinkSent.resetLinkSentAt,
        resetLinkSentByUserId: resetLinkSent.resetLinkSentByUserId,
        resetLinkSentByEmail: resetLinkSent.resetLinkSentByEmail
      }),
      ...(resetLinkUsed && { resetLinkUsedAt: resetLinkUsed.resetLinkUsedAt })
    };
    
    // For pending users, include passwordless login link (setup)
    if (user.status === 'pending' && user.passwordless_token) {
      let homeAgency = null;
      try {
        const userAgencies = await User.getAgencies(user.id);
        homeAgency = userAgencies?.[0] || null;
      } catch {
        homeAgency = null;
      }
      accountInfo.passwordlessLoginLink = buildPublicAppUrl(
        homeAgency,
        `passwordless-login/${user.passwordless_token}`
      );
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
      let homeAgency = null;
      try {
        const userAgencies = await User.getAgencies(user.id);
        homeAgency = userAgencies?.[0] || null;
      } catch {
        homeAgency = null;
      }
      accountInfo.passwordlessLoginLink = buildPublicAppUrl(
        homeAgency,
        `reset-password/${user.passwordless_token}`
      );
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
      try {
        const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
        if (agencyId) {
          await AdminAuditLog.logAction({
            actionType: 'user_marked_complete',
            actorUserId: req.user.id,
            targetUserId: parseInt(id),
            agencyId,
            metadata: { fromStatus: 'PENDING_SETUP' }
          });
        }
      } catch (e) {
        console.warn('Admin audit log failed:', e?.message || e);
      }
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

    try {
      const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
      if (agencyId) {
        await AdminAuditLog.logAction({
          actionType: 'user_marked_complete',
          actorUserId: req.user.id,
          targetUserId: parseInt(id),
          agencyId,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
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

    // Resolve the package to assign:
    // 1. Explicit packageId from request body (staff override)
    // 2. Role-based default from prehire_settings.role_package_mappings
    // 3. Agency-wide default from prehire_settings.default_onboarding_package_id
    const { packageId: bodyPackageId, sendMethod = 'token' } = req.body || {};
    let autoPackageResult = null;
    try {
      const [agencyRows] = await pool.execute(
        'SELECT agency_id FROM user_agencies WHERE user_id = ? LIMIT 1',
        [id]
      );
      const agencyId = agencyRows[0]?.agency_id;

      if (agencyId) {
        const [settingsRows] = await pool.execute(
          'SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1',
          [agencyId]
        );
        const rawSettings = settingsRows[0]?.prehire_settings;
        const settings = typeof rawSettings === 'string' ? JSON.parse(rawSettings) : (rawSettings || {});

        // Resolve package: explicit > role-mapped > global default
        let resolvedPackageId = bodyPackageId ? parseInt(bodyPackageId, 10) : null;
        if (!resolvedPackageId) {
          // Look up the candidate's applied_role and check role mappings
          try {
            const [hpRows] = await pool.execute(
              'SELECT applied_role FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1',
              [id]
            );
            const appliedRole = hpRows[0]?.applied_role || null;
            if (appliedRole && Array.isArray(settings.role_package_mappings)) {
              const match = settings.role_package_mappings.find(
                (m) => m.role && m.role.toLowerCase() === appliedRole.toLowerCase()
              );
              if (match?.packageId) resolvedPackageId = parseInt(match.packageId, 10);
            }
          } catch { /* non-fatal */ }
        }
        if (!resolvedPackageId && settings.default_onboarding_package_id) {
          resolvedPackageId = parseInt(settings.default_onboarding_package_id, 10);
        }

        if (resolvedPackageId) {
          const { assignPackageToUser } = await import('../services/packageAssignment.service.js');
          autoPackageResult = await assignPackageToUser({
            packageId: resolvedPackageId,
            userId: parseInt(id),
            agencyId,
            assignedByUserId: req.user.id,
            ensureAccountSetup: true
          });
          console.log(`[promoteToOnboarding] Assigned onboarding package ${resolvedPackageId} to user ${id}`);
        }

        // Send credentials based on sendMethod
        if (sendMethod === 'token') {
          // Keep one portal token: extend / regenerate and email /pre-hire/:token
          // (same URL as pre-hire), not a separate passwordless-login link.
          try {
            let portalToken = user.passwordless_token || null;
            let expiresAt = user.passwordless_token_expires_at
              ? new Date(user.passwordless_token_expires_at)
              : null;
            const needsNew =
              !portalToken ||
              !expiresAt ||
              expiresAt.getTime() < Date.now() + 24 * 60 * 60 * 1000;
            if (needsNew) {
              const tokenResult = await User.generatePasswordlessToken(parseInt(id, 10), 14 * 24, 'prehire_portal');
              portalToken = tokenResult.token;
              expiresAt = tokenResult.expiresAt;
            } else {
              const bump = new Date();
              bump.setDate(bump.getDate() + 14);
              await pool.execute(
                `UPDATE users SET passwordless_token_expires_at = ? WHERE id = ? AND passwordless_token IS NOT NULL`,
                [bump, id]
              );
              expiresAt = bump;
            }
            const Agency = (await import('../models/Agency.model.js')).default;
            const agency = agencyId ? await Agency.findById(agencyId) : null;
            const tokenLink = buildPublicAppUrl(agency, `pre-hire/${portalToken}`);
            const to = user.personal_email || user.email;
            if (to) {
              const EmailService = (await import('../services/email.service.js')).default;
              await EmailService.sendEmail({
                to,
                subject: 'Your onboarding portal is ready',
                text: `Hi ${user.first_name || 'there'},\n\nYou've been promoted to onboarding! Continue with the same personal portal link (bookmark it):\n\n${tokenLink}\n\nThis link is valid until ${expiresAt ? new Date(expiresAt).toLocaleString() : 'further notice'}.\n\nOnce your Google Workspace login works, you can also sign in with your work email.`
              }).catch(() => {});
            }
          } catch (te) { console.warn('[promoteToOnboarding] Token send failed:', te?.message); }
        } else if (sendMethod === 'login') {
          // Send workspace login instructions
          try {
            const loginEmail = user.work_email || user.personal_email;
            if (loginEmail) {
              const EmailService = (await import('../services/email.service.js')).default;
              const Agency = (await import('../models/Agency.model.js')).default;
              const agency = agencyId ? await Agency.findById(agencyId) : null;
              const loginUrl = buildPublicAppUrl(agency, 'login');
              await EmailService.sendEmail({
                to: loginEmail,
                subject: 'Your workspace account is ready',
                text: `Hi ${user.first_name || 'there'},\n\nYour onboarding account is now active. Log in with your work email address at:\n\n${loginUrl}\n\nEmail: ${user.work_email || user.personal_email}\n\nIf you need to reset your password, use the "Forgot password" link on the login page.`
              }).catch(() => {});
            }
          } catch (le) { console.warn('[promoteToOnboarding] Login email send failed:', le?.message); }
        }
      }
    } catch (pkgErr) {
      console.warn('[promoteToOnboarding] Package/send step failed (non-fatal):', pkgErr?.message);
    }

    res.json({
      message: 'User promoted to onboarding status',
      user: updatedUser,
      autoPackageAssigned: autoPackageResult ? {
        packageId: autoPackageResult.packageId,
        packageName: autoPackageResult.packageName,
        documentsAssigned: autoPackageResult.documents?.length || 0,
        trainingAssigned: autoPackageResult.trainingFocuses?.length || 0
      } : null,
      sendMethod
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
  'INACTIVE_EMPLOYEE',
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

    if (statusUpper === 'INACTIVE_EMPLOYEE') {
      return res.status(400).json({
        error: {
          message:
            'Use “Mark inactive” on the user profile (or POST /users/:id/set-inactive) so affiliations and school links are removed automatically.'
        }
      });
    }

    if (statusUpper === 'ARCHIVED' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: { message: 'Only super administrators may set status to Archived. Use Mark inactive for standard offboarding.' }
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
      if (statusUpper === 'ARCHIVED' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          error: { message: 'Only super administrators may set school staff or guardians to Archived.' }
        });
      }
    }

    const updatedUser = await User.updateStatus(id, statusUpper, req.user.id);
    if (!updatedUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    try {
      const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
      if (agencyId) {
        await AdminAuditLog.logAction({
          actionType: 'user_status_changed',
          actorUserId: req.user.id,
          targetUserId: parseInt(id),
          agencyId,
          metadata: { previousStatus: user.status, newStatus: statusUpper, note: note || null }
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
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
    const userAgencies = await User.getAgencies(user.id);
    const passwordlessTokenLink = buildPublicAppUrl(
      userAgencies?.[0],
      `passwordless-login/${passwordlessTokenResult.token}`
    );

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

    try {
      const { scopeOffboardingChecklist } = await import('../services/lifecycleScope.service.js');
      await scopeOffboardingChecklist(parseInt(id, 10));
    } catch (scopeErr) {
      console.warn('[markUserTerminated] offboarding scope failed:', scopeErr?.message);
    }

    try {
      const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
      if (agencyId) {
        await AdminAuditLog.logAction({
          actionType: 'user_marked_terminated',
          actorUserId: req.user.id,
          targetUserId: parseInt(id),
          agencyId,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
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

    const statusNorm = String(currentUser.status || '').trim().toUpperCase();
    if (statusNorm === 'INACTIVE_EMPLOYEE') {
      const idNum = parseInt(id, 10);
      await User.updateStatus(idNum, 'ACTIVE_EMPLOYEE', req.user.id);
      const poolLocal = (await import('../config/database.js')).default;
      await poolLocal.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [idNum]);

      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const [employeeEntries] = await poolLocal.execute(
        'SELECT id, password_hash FROM approved_employee_emails WHERE email = ?',
        [currentUser.email]
      );
      let refreshed = await User.findById(idNum);
      if (refreshed && !refreshed.password_hash && employeeEntries.length > 0) {
        const employeePasswordHash = employeeEntries[0].password_hash;
        if (employeePasswordHash) {
          await poolLocal.execute('UPDATE users SET password_hash = ? WHERE id = ?', [employeePasswordHash, idNum]);
        }
      }
      for (const entry of employeeEntries) {
        await ApprovedEmployee.delete(entry.id);
      }

      return res.json({
        message: 'User reactivated from inactive. Re-assign them to agencies and schools as needed.',
        user: await User.findById(idNum)
      });
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

    try {
      const agencyId = await getFirstAgencyForAudit(req.user.id, parseInt(id), req.user.role);
      if (agencyId) {
        await AdminAuditLog.logAction({
          actionType: 'user_deactivated',
          actorUserId: req.user.id,
          targetUserId: parseInt(id),
          agencyId,
          metadata: null
        });
      }
    } catch (e) {
      console.warn('Admin audit log failed:', e?.message || e);
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

    if (newPassword.length > 128) {
      return res.status(400).json({ error: { message: 'New password must be no more than 128 characters' } });
    }

    if (!/[a-zA-Z]/.test(newPassword)) {
      return res.status(400).json({ error: { message: 'New password must contain at least one letter (a–z or A–Z)' } });
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

    // Max 1 password change per hour (enforced for self-service changes only)
    if (userId === req.user.id) {
      try {
        const [recentChange] = await pool.execute(
          "SELECT password_changed_at FROM users WHERE id = ? LIMIT 1",
          [userId]
        );
        const lastChange = recentChange?.[0]?.password_changed_at;
        if (lastChange) {
          const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
          if (new Date(lastChange) > hourAgo) {
            return res.status(429).json({
              error: { message: 'You may only change your password once per hour. Please try again later.' }
            });
          }
        }
      } catch {
        // best-effort — do not block if column not available
      }
    }

    // Username similarity check
    const accountId = user.username || user.email;
    if (accountId) {
      const { validatePasswordStrength } = await import('../utils/passwordValidation.js');
      const pwCheck = await validatePasswordStrength(newPassword, { accountId });
      if (!pwCheck.valid) {
        return res.status(400).json({ error: { message: pwCheck.message } });
      }
    } else {
      const { validatePasswordStrength } = await import('../utils/passwordValidation.js');
      const pwCheck = await validatePasswordStrength(newPassword);
      if (!pwCheck.valid) {
        return res.status(400).json({ error: { message: pwCheck.message } });
      }
    }

    // Password history reuse check (last 5 passwords)
    const isReused = await User.isPasswordReused(userId, newPassword, 5);
    if (isReused) {
      return res.status(400).json({
        error: { message: 'You cannot reuse one of your last 5 passwords. Please choose a different password.' }
      });
    }

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

/**
 * GET /users/:id/profile-overview?agencyId=
 *
 * Aggregates all sections needed for the employee Overview tab into a single
 * response, reducing ~8 client round trips to 1.  Every sub-query is
 * best-effort: failures return null/[] so the page still renders with whatever
 * data is available.
 */
export const getProfileOverview = async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid user id' } });
    }

    // Access control: backoffice roles only (mirrors account-info but slightly tighter)
    const actorRole = String(req.user?.role || '').toLowerCase();
    const isBackoffice = ['admin', 'super_admin', 'support'].includes(actorRole);
    const isSelf = req.user?.id === targetId;
    const isSupervisorUser = req.user?.has_supervisor_privileges;

    if (!isBackoffice && !isSelf && !isSupervisorUser) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencyId = parseInt(req.query.agencyId || req.user?.agencyId, 10) || null;

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    // ── Parallel sub-queries ─────────────────────────────────────────────────

    const accountInfoPromise = (async () => {
      try {
        // Reuse lightweight version: personal email + address fields from DB
        const [rows] = await pool.execute(
          `SELECT personal_email, home_street_address, home_address_line2, home_city, home_state, home_postal_code
           FROM users WHERE id = ? LIMIT 1`,
          [targetId]
        );
        const r = rows[0] || {};
        return {
          personalEmail: user.personal_email || r.personal_email || null,
          languagesSpoken: user.languages_spoken || null,
          preferredName: user.preferred_name || null,
          title: user.title || null,
          serviceFocus: user.service_focus || null,
          psychologyTodayUrl: user.psychology_today_url || null,
          phoneNumber: user.phone_number || null,
          personalPhone: user.personal_phone || null,
          workPhone: user.work_phone || null,
          workPhoneExtension: user.work_phone_extension || null,
          homeStreetAddress: r.home_street_address || null,
          homeAddressLine2: r.home_address_line2 || null,
          homeCity: r.home_city || null,
          homeState: r.home_state || null,
          homePostalCode: r.home_postal_code || null,
          companyCardEnabled: !!(user.company_card_enabled === 1 || user.company_card_enabled === true || user.company_card_enabled === '1'),
          companyCarSubmitAccess: !!(user.company_car_submit_access === 1 || user.company_car_submit_access === true || user.company_car_submit_access === '1'),
          companyCarManageAccess: !!(user.company_car_manage_access === 1 || user.company_car_manage_access === true || user.company_car_manage_access === '1'),
          skillBuilderEligible: !!(user.skill_builder_eligible === 1 || user.skill_builder_eligible === true || user.skill_builder_eligible === '1'),
          groupSupervisionEligible: !!(user.group_supervision_eligible === 1 || user.group_supervision_eligible === true || user.group_supervision_eligible === '1'),
          group_supervision_eligible: !!(user.group_supervision_eligible === 1 || user.group_supervision_eligible === true || user.group_supervision_eligible === '1'),
          hasPayrollAccess: (await User.listPayrollAgencyIds(targetId)).length > 0,
          hasBillingAccess: (await User.listBillingAgencyIds(targetId)).length > 0,
          isMarketingContact: (await User.listMarketingAgencyIds(targetId)).length > 0,
          hasCredentialingAccess: (await User.listCredentialingAgencyIds(targetId)).length > 0,
          isHourlyWorker: !!(user.is_hourly_worker === 1 || user.is_hourly_worker === true || user.is_hourly_worker === '1'),
      hourlyDualRateEnabled: !!(user.hourly_dual_rate_enabled === 1 || user.hourly_dual_rate_enabled === true || user.hourly_dual_rate_enabled === '1'),
      hourly_dual_rate_enabled: !!(user.hourly_dual_rate_enabled === 1 || user.hourly_dual_rate_enabled === true || user.hourly_dual_rate_enabled === '1'),
          hasHiringAccess: !!(user.has_hiring_access === 1 || user.has_hiring_access === true || user.has_hiring_access === '1'),
          hasOutreachAccess: !!(user.has_outreach_access === 1 || user.has_outreach_access === true || user.has_outreach_access === '1'),
        };
      } catch {
        return null;
      }
    })();

    const lifecyclePromise = (async () => {
      try {
        const { getLifecycleData } = await import('../services/lifecycle.service.js');
        const data = await getLifecycleData(targetId);
        // Return only the summary + dates slices needed for overview
        return { summary: data.summary, dates: data.dates };
      } catch {
        return null;
      }
    })();

    const tasksPromise = (async () => {
      try {
        const Task = (await import('../models/Task.model.js')).default;
        const tasks = await Task.getAll({ assignedToUserId: targetId });
        const now = new Date();
        let pendingCount = 0, inProgressCount = 0, overdueCount = 0, upcomingCount = 0;
        const recentDocs = [];
        const upcomingOverdue = [];

        for (const t of tasks) {
          if (t.status === 'pending') pendingCount++;
          if (t.status === 'in_progress') inProgressCount++;
          const dd = t.due_date ? new Date(t.due_date) : null;
          const isActive = t.status === 'pending' || t.status === 'in_progress';
          if (dd && isActive) {
            if (dd < now) overdueCount++;
            else if (dd <= new Date(now.getTime() + 30 * 86400000)) upcomingCount++;
            if (upcomingOverdue.length < 5) upcomingOverdue.push(t);
          }
          if ((t.task_type === 'document') && recentDocs.length < 5) recentDocs.push(t);
        }

        return { pendingCount, inProgressCount, overdueCount, upcomingCount, recentDocs, upcomingOverdue };
      } catch {
        return { pendingCount: 0, inProgressCount: 0, overdueCount: 0, upcomingCount: 0, recentDocs: [], upcomingOverdue: [] };
      }
    })();

    const supervisorsPromise = (async () => {
      try {
        const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
        return await SupervisorAssignment.findBySupervisee(targetId);
      } catch {
        return [];
      }
    })();

    const activityPromise = (async () => {
      try {
        const auditRows = await AdminAuditLog.getAuditLog(agencyId, { userId: targetId, limit: 8 });
        return (auditRows || []).slice(0, 8);
      } catch {
        return [];
      }
    })();

    const notesPromise = (async () => {
      try {
        const HiringNote = (await import('../models/HiringNote.model.js')).default;
        return await HiringNote.listByCandidateUserId(targetId, { limit: 10 });
      } catch {
        return [];
      }
    })();

    const acceptedInsurancesPromise = (async () => {
      if (!agencyId) return [];
      try {
        const { listProviderAcceptedInsurances } = await import('../services/providerAcceptedInsurance.service.js');
        return await listProviderAcceptedInsurances({ userId: targetId, agencyId });
      } catch {
        return [];
      }
    })();

    const [accountInfo, lifecycle, tasks, supervisors, recentActivity, notes, acceptedInsurances] = await Promise.all([
      accountInfoPromise,
      lifecyclePromise,
      tasksPromise,
      supervisorsPromise,
      activityPromise,
      notesPromise,
      acceptedInsurancesPromise,
    ]);

    res.json({
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        preferred_name: user.preferred_name,
        email: user.email,
        work_email: user.work_email,
        phone_number: user.phone_number,
        personal_phone: user.personal_phone,
        title: user.title,
        department: user.department,
        employment_type: user.employment_type,
        work_location: user.work_location,
        pay_rate: user.pay_rate,
        pay_type: user.pay_type,
        hire_date: user.hire_date,
        start_date: user.start_date,
        status: user.status,
        role: user.role,
        pronouns: user.pronouns,
        emergency_contact: user.emergency_contact,
        employee_id: user.employee_id,
        manager_name: user.manager_name,
        manager_first_name: user.manager_first_name,
        manager_last_name: user.manager_last_name,
        benefits_notes: user.benefits_notes ?? null,
        benefits_eligibility_overrides_json: user.benefits_eligibility_overrides_json ?? null,
        medcancel_rate_schedule: user.medcancel_rate_schedule ?? null,
        is_hourly_worker: user.is_hourly_worker,
        hourly_dual_rate_enabled: user.hourly_dual_rate_enabled,
      },
      accountInfo,
      lifecycle,
      tasks,
      supervisors,
      recentActivity,
      notes,
      acceptedInsurances,
    });
  } catch (err) {
    next(err);
  }
};
