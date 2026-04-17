import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { getUserCapabilities } from '../utils/capabilities.js';
import { isSupervisorActor, supervisorHasSuperviseeInSchool } from '../utils/supervisorSchoolAccess.js';
import { canUserManageClub, getUserClubMembership, inferLegacyClubRole } from '../utils/sscClubAccess.js';

/** Normalize role strings for authorization (JWT quirks / legacy variants). */
function normalizeAuthRole(role) {
  let r = String(role || '').toLowerCase().trim();
  if (r === 'superadmin' || r === 'super-admin' || r === 'super admin') r = 'super_admin';
  return r;
}

function isBackofficeAdminRole(role) {
  const r = normalizeAuthRole(role);
  return r === 'admin' || r === 'super_admin' || r === 'support';
}

/**
 * Resolves req.user.effectiveRole based on the X-Agency-Id request header.
 *
 * - Affiliation agency (club context): effectiveRole = user_agencies.club_role,
 *   falling back to inferLegacyClubRole(users.role).
 * - Work agency context: effectiveRole = users.work_role (if club_manager), else users.role.
 * - No header / no user id: effectiveRole = users.role (unchanged behaviour).
 *
 * Errors are swallowed so a DB hiccup never blocks a request.
 */
async function resolveEffectiveRole(req) {
  if (!req.user) return;

  const agencyIdHeader = req.headers['x-agency-id'];
  const agencyId = agencyIdHeader ? parseInt(agencyIdHeader, 10) : NaN;

  if (!agencyId || isNaN(agencyId) || !req.user.id) {
    req.user.effectiveRole = req.user.role;
    return;
  }

  try {
    const agency = await Agency.findById(agencyId);
    const orgType = String(agency?.organization_type || '').toLowerCase();

    if (orgType === 'affiliation') {
      const membership = await getUserClubMembership(req.user.id, agencyId);
      req.user.effectiveRole = membership?.club_role ?? inferLegacyClubRole(req.user.role);
    } else {
      if (req.user.role === 'club_manager') {
        const dbUser = await User.findById(req.user.id);
        req.user.effectiveRole = dbUser?.work_role ?? 'provider';
      } else {
        req.user.effectiveRole = req.user.role;
      }
    }
  } catch (err) {
    console.warn('[auth] Could not resolve effectiveRole:', err.message);
    req.user.effectiveRole = req.user.role;
  }
}

/** Platform admins or Summit club managers (e.g. icon upload scoped to a club). */
export const requireBackofficeAdminOrClubManager = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ error: { message: 'Admin access required' } });
  }
  if (isBackofficeAdminRole(req.user.role)) {
    return next();
  }
  if (normalizeAuthRole(req.user.role) === 'club_manager') {
    return next();
  }
  return res.status(403).json({ error: { message: 'Admin access required' } });
};

export const authenticate = async (req, res, next) => {
  try {
    // Public endpoints (no auth) - never block these with session auth.
    // Note: Some environments may inadvertently wrap `/api/public/*` with `authenticate`.
    const requestPath = String(req.originalUrl || req.path || '').split('?')[0];
    if (requestPath.startsWith('/api/public/')) {
      return next();
    }
    if (requestPath.startsWith('/api/public-intake') && !requestPath.includes('/approve')) {
      return next();
    }
    if (requestPath.includes('/verify-club-manager-email')) {
      return next();
    }
    // Summit Stats Team Challenge public endpoints.
    if (req.method === 'GET' && /^\/api\/summit-stats\/clubs\/?$/.test(requestPath)) {
      return next();
    }
    if (req.method === 'GET' && /^\/api\/summit-stats\/clubs\/[^/]+\/public\/?$/.test(requestPath)) {
      return next();
    }
    if (req.method === 'GET' && /^\/api\/summit-stats\/clubs\/[^/]+\/members\/directory\/public\/?$/.test(requestPath)) {
      return next();
    }
    if (req.method === 'GET' && /^\/api\/summit-stats\/clubs\/invite\/[^/]+\/?$/.test(requestPath)) {
      return next();
    }
    if (req.method === 'POST' && /^\/api\/summit-stats\/application-email-status\/?$/.test(requestPath)) {
      return next();
    }
    if (req.method === 'POST' && /^\/api\/summit-stats\/clubs\/[^/]+\/apply-form\/?$/.test(requestPath)) {
      return next();
    }
    if (req.method === 'POST' && /^\/api\/summit-stats\/clubs\/invite\/[^/]+\/apply\/?$/.test(requestPath)) {
      return next();
    }
    if (req.method === 'POST' && /^\/api\/summit-stats\/clubs\/[^/]+\/request-invite\/?$/.test(requestPath)) {
      return next();
    }
    // Fonts are used on public login/portal pages.
    if (requestPath.startsWith('/api/fonts/public') || requestPath.startsWith('/api/fonts/families')) {
      return next();
    }

    // Try cookie first (new method), then fall back to Authorization header (for backward compatibility)
    const token = req.cookies?.authToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
    
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Handle approved employee tokens — agency context already embedded in JWT claims.
    if (decoded.type === 'approved_employee') {
      req.user = {
        email: decoded.email,
        role: 'approved_employee',
        effectiveRole: 'approved_employee',
        type: decoded.type || 'approved_employee',
        agencyId: decoded.agencyId,
        agencyIds: decoded.agencyIds || (decoded.agencyId ? [decoded.agencyId] : [])
      };
      return next();
    }
    
    // Backward compatibility: older passwordless tokens may include type='passwordless'.
    // These are still normal users-table accounts and MUST retain decoded.id/role.
    if (decoded.type === 'passwordless') {
      if (!decoded.id) {
        return res.status(401).json({ error: { message: 'Invalid token' } });
      }
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        type: 'passwordless',
        agencyId: decoded.agencyId,
        sessionId: decoded.sessionId || null,
        demoMode: decoded.demoMode === true,
        demoRealRole: decoded.demoRealRole || null
      };
      await resolveEffectiveRole(req);
      return next();
    }

    // Regular user tokens - support both email and username for login
    // The token contains email field which may be username or email
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      type: decoded.type || 'regular',
      agencyId: decoded.agencyId,
      sessionId: decoded.sessionId || null,
      demoMode: decoded.demoMode === true,
      demoRealRole: decoded.demoRealRole || null
    };
    await resolveEffectiveRole(req);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: { message: 'Token expired' } });
    }
    return res.status(401).json({ error: { message: 'Invalid token' } });
  }
};

// Like authenticate(), but does not fail the request when no token is present.
// Useful for endpoints that support alternative auth (ex: a one-time ops token).
export const authenticateOptional = (req, res, next) => {
  try {
    const token = req.cookies?.authToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
    if (!token) return next();

    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.type === 'approved_employee') {
      req.user = {
        email: decoded.email,
        role: 'approved_employee',
        type: decoded.type || 'approved_employee',
        agencyId: decoded.agencyId,
        agencyIds: decoded.agencyIds || (decoded.agencyId ? [decoded.agencyId] : [])
      };
      return next();
    }

    if (decoded.type === 'passwordless') {
      if (!decoded.id) return next();
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        type: 'passwordless',
        agencyId: decoded.agencyId,
        sessionId: decoded.sessionId || null,
        demoMode: decoded.demoMode === true,
        demoRealRole: decoded.demoRealRole || null
      };
      return next();
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      type: decoded.type || 'regular',
      agencyId: decoded.agencyId,
      sessionId: decoded.sessionId || null,
      demoMode: decoded.demoMode === true,
      demoRealRole: decoded.demoRealRole || null
    };
    return next();
  } catch {
    // If token is invalid/expired, treat as unauthenticated.
    return next();
  }
};

export const requireAdmin = async (req, res, next) => {
  // Allow admin, super_admin, support, supervisors, CPAs, and provider_plus.
  // Check if user is a supervisor using boolean as source of truth
  const requestingUser = await User.findById(req.user.id);
  const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
  
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support' && 
      !isSupervisor && req.user.role !== 'clinical_practice_assistant' && req.user.role !== 'provider_plus' &&
      req.user.role !== 'club_manager') {
    return res.status(403).json({ error: { message: 'Admin access required' } });
  }
  next();
};

/**
 * Backoffice admin access only (no supervisors/CPAs).
 * Use this for actions that should be limited to true admins/support/super admins.
 *
 * Uses normalized role matching and, if the JWT role is not allowed, re-checks the
 * database row so promotions to admin/support take effect without forcing a new login.
 */
export const requireBackofficeAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    if (isBackofficeAdminRole(req.user.role)) {
      return next();
    }
    const uid = req.user.id;
    if (!uid) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const row = await User.findById(uid);
    if (row && isBackofficeAdminRole(row.role)) {
      return next();
    }
    return res.status(403).json({ error: { message: 'Admin access required' } });
  } catch (e) {
    next(e);
  }
};

/**
 * Backoffice admin OR Summit club manager updating their own affiliation (club) row.
 * Sets `req.agencyUpdateScope` to `full` (platform admins) or `club_branding` (club managers only).
 */
export const requireBackofficeAdminOrClubManagerForAgency = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    if (isBackofficeAdminRole(req.user.role)) {
      req.agencyUpdateScope = 'full';
      return next();
    }
    const uid = req.user.id;
    if (!uid) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const row = await User.findById(uid);
    if (row && isBackofficeAdminRole(row.role)) {
      req.agencyUpdateScope = 'full';
      return next();
    }

    const agencyId = parseInt(req.params.id, 10);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    const agency = await Agency.findById(agencyId);
    if (!agency || String(agency.organization_type || '').toLowerCase() !== 'affiliation') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const ok = await canUserManageClub({ user: req.user, clubId: agencyId });
    if (!ok) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    req.agencyUpdateScope = 'club_branding';
    return next();
  } catch (e) {
    next(e);
  }
};

/** Kiosk users only – used for kiosk-specific authenticated routes */
export const requireKioskUser = (req, res, next) => {
  if (String(req.user?.role || '').toLowerCase() !== 'kiosk') {
    return res.status(403).json({ error: { message: 'Kiosk access required' } });
  }
  next();
};

/**
 * Guardian list access: backoffice admin OR supervisor with access to the client.
 * Use for GET /clients/:id/guardians (view only).
 */
export const requireGuardianListAccess = async (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support') {
    return next();
  }
  const requestingUser = await User.findById(req.user.id);
  const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
  if (!isSupervisor) {
    return res.status(403).json({ error: { message: 'Admin access required' } });
  }
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const Client = (await import('../models/Client.model.js')).default;
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    const { supervisorCanAccessClient } = await import('../utils/supervisorSchoolAccess.js');
    const allowed = await supervisorCanAccessClient({ supervisorUserId: req.user.id, client });
    if (!allowed) return res.status(403).json({ error: { message: 'You do not have access to this client' } });
    next();
  } catch (e) {
    next(e);
  }
};

export const requireSuperAdmin = (req, res, next) => {
  if (normalizeAuthRole(req.user?.role) !== 'super_admin') {
    return res.status(403).json({ error: { message: 'Super admin access required' } });
  }
  next();
};

// Allow either a super_admin session OR a configured ops token header.
// Header: X-Admin-Actions-Token: <token>
export const requireSuperAdminOrAdminActionsToken = (req, res, next) => {
  if (req.user?.role === 'super_admin') return next();
  const token = String(req.headers['x-admin-actions-token'] || '').trim();
  const expected = String(process.env.ADMIN_ACTIONS_TOKEN || '').trim();
  if (expected && token && token === expected) return next();
  return res.status(403).json({ error: { message: 'Super admin access required' } });
};

/**
 * Require one or more capabilities on the authenticated user.
 * Capabilities are derived server-side from the user record (source of truth).
 *
 * Usage:
 *   router.get('/x', authenticate, requireCapability('canSignDocuments'), handler)
 *   router.get('/y', authenticate, requireCapability(['canViewTraining','canAccessPlatform']), handler)
 */
export const requireCapability = (required) => {
  const requiredList = Array.isArray(required) ? required : [required];
  return async (req, res, next) => {
    try {
      // Approved employee tokens do not have a users-table record.
      let userForCaps = null;
      if (req.user?.role === 'approved_employee') {
        userForCaps = { role: 'approved_employee', status: 'ACTIVE_EMPLOYEE', type: req.user.type || 'approved_employee' };
      } else {
        userForCaps = await User.findById(req.user.id);
      }

      let caps = getUserCapabilities(userForCaps, { effectiveRole: req.user?.effectiveRole });

      // canManagePayroll, canAccessBudgetManagement, canManageCredentialing require async resolution from user_agencies
      const needsPayrollCaps = requiredList.some((k) => k === 'canManagePayroll' || k === 'canAccessBudgetManagement');
      const needsCredentialingCap = requiredList.some((k) => k === 'canManageCredentialing');
      if ((needsPayrollCaps || needsCredentialingCap) && userForCaps?.id) {
        const [payrollAgencyIds, departmentAgencyIds, credentialingAgencyIds] = await Promise.all([
          User.listPayrollAgencyIds(userForCaps.id),
          User.listDepartmentAgencyIds(userForCaps.id),
          User.listCredentialingAgencyIds(userForCaps.id)
        ]);
        if (needsPayrollCaps) {
          const canManagePayroll = userForCaps.role === 'super_admin' || payrollAgencyIds.length > 0;
          const canAccessBudgetManagement =
            canManagePayroll ||
            ((userForCaps.role === 'assistant_admin' || userForCaps.role === 'provider_plus') &&
              departmentAgencyIds.length > 0);
          caps = { ...caps, canManagePayroll, canAccessBudgetManagement };
        }
        if (needsCredentialingCap) {
          caps = { ...caps, canManageCredentialing: userForCaps.role === 'super_admin' || credentialingAgencyIds.length > 0 };
        }
      }

      req.userCapabilities = caps;

      const ok = requiredList.every((k) => !!caps?.[k]);
      if (!ok) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }

      next();
    } catch (e) {
      next(e);
    }
  };
};

export const requireAgencyAdmin = async (req, res, next) => {
  try {
    // Super Admin has access to all agencies
    if (req.user.role === 'super_admin') {
      return next();
    }

    const agencyId = req.params.agencyId || req.body.agencyId || req.query.agencyId;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID required' } });
    }
    const aid = parseInt(agencyId, 10);

    // Summit club managers: same billing/admin actions for their club agency
    if (normalizeAuthRole(req.user.role) === 'club_manager') {
      const ok = await canUserManageClub({ user: req.user, clubId: aid });
      if (ok) return next();
      return res.status(403).json({ error: { message: 'You do not have admin access to this agency' } });
    }

    // Must be admin/support/staff role (agency-side backoffice)
    if (req.user.role !== 'admin' && req.user.role !== 'support' && req.user.role !== 'staff') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userAgencies = await User.getAgencies(req.user.id);
    const hasAccess = userAgencies.some((a) => a.id === aid);

    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'You do not have admin access to this agency' } });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const requireAgencyAccess = async (req, res, next) => {
  try {
    // Super Admin, Admin, and Support have access
    if (req.user.role === 'super_admin' || req.user.role === 'admin' || req.user.role === 'support') {
      return next();
    }
    
    // Get agency ID from params or body
    const agencyId = req.params.agencyId || req.body.agencyId || req.query.agencyId;
    
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID required' } });
    }
    
    // Check if user belongs to this agency
    const userAgencies = await User.getAgencies(req.user.id);
    const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
    
    if (!hasAccess) {
      const hasSupervisorCapability = await isSupervisorActor({
        userId: req.user?.id,
        role: req.user?.role,
        user: req.user
      });
      if (hasSupervisorCapability) {
        const canSupervisorAccess = await supervisorHasSuperviseeInSchool(req.user?.id, agencyId);
        if (canSupervisorAccess) return next();
      }
      return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

export const checkPendingAccess = async (req, res, next) => {
  try {
    // Get full user details to check status
    const fullUser = await User.findById(req.user.id);
    
    if (!fullUser || fullUser.status !== 'PREHIRE_OPEN') {
      // Not a pre-hire open user, allow access
      return next();
    }
    
    // Check if pending access is locked
    if (fullUser.pending_access_locked) {
      return res.status(403).json({ 
        error: { message: 'Your pre-hire access has been locked. Please contact your administrator.' } 
      });
    }
    
    // PREHIRE_OPEN users can only access specific routes
    const allowedPaths = [
      '/api/users/me',
      '/api/users/onboarding-checklist',
      '/api/users/pending/status',
      '/api/users/pending/complete',
      '/api/user-documents',
      '/api/tasks',
      '/api/custom-checklist-items',
      '/api/user-checklist-assignments'
    ];
    
    const requestPath = req.path;
    const isAllowed = allowedPaths.some(path => requestPath.startsWith(path));
    
    // Block access to training modules, employee documents, and credentials
    const blockedPaths = [
      '/api/modules',
      '/api/training-focuses',
      '/api/user-accounts',
      '/api/users/change-password'
    ];
    
    const isBlocked = blockedPaths.some(path => requestPath.startsWith(path));
    
    if (isBlocked) {
      return res.status(403).json({ 
        error: { message: 'This feature is not available during the pre-hire process.' } 
      });
    }
    
    // For document access, we'll filter in the controller
    // For now, allow the request to proceed
    next();
  } catch (error) {
    next(error);
  }
};

export const requireActiveStatus = async (req, res, next) => {
  try {
    const { checkAccess, canLogin, isAccessExpired } = await import('../utils/accessControl.js');
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(401).json({ error: { message: 'User not found' } });
    }
    
    // Superadmins bypass all status checks (except terminal states)
    if (user.role === 'super_admin' && user.status !== 'ARCHIVED' && user.status !== 'INACTIVE_EMPLOYEE') {
      // Give superadmins full access
      req.userAccess = {
        canAccessOnDemand: true,
        canAccessDashboard: true,
        canAccessTraining: true,
        canAccessDocuments: true,
        canAccessAdmin: true
      };
      return next();
    }
    
    // Check if user can login
    if (!canLogin(user)) {
      return res.status(403).json({ 
        error: { message: 'Your account is not accessible. Please contact your administrator.' } 
      });
    }
    
    // Check if access has expired (for TERMINATED_PENDING users)
    if (isAccessExpired(user)) {
      return res.status(403).json({ 
        error: { message: 'Your account access has expired. Please contact your administrator.' } 
      });
    }
    
    // Block archived / inactive users from all routes
    if (user.status === 'ARCHIVED') {
      return res.status(403).json({ 
        error: { message: 'Your account has been archived. Please contact your administrator.' } 
      });
    }
    if (user.status === 'INACTIVE_EMPLOYEE') {
      return res.status(403).json({
        error: { message: 'Your account is inactive. Please contact your administrator.' }
      });
    }
    
    // Block PENDING_SETUP users who haven't set password yet
    if (user.status === 'PENDING_SETUP' && (!user.password_hash || user.password_hash === null)) {
      return res.status(403).json({ 
        error: { message: 'Please complete your account setup first.' } 
      });
    }
    
    // Check access permissions for the route
    const access = checkAccess(user);
    const requestPath = req.path;
    
    // Check if this is an on-demand training route
    const isOnDemandRoute = requestPath.startsWith('/api/public-training') || 
                            requestPath.startsWith('/api/modules') && req.query?.onDemand === 'true';
    
    // Allow on-demand routes for users with on-demand access
    if (isOnDemandRoute && access.canAccessOnDemand) {
      return next();
    }
    
    // Block users without dashboard access from most routes
    if (!access.canAccessDashboard && !isOnDemandRoute) {
      return res.status(403).json({ 
        error: { message: 'You do not have access to this resource based on your account status.' } 
      });
    }
    
    // Store access permissions in request for use in controllers
    req.userAccess = access;
    
    next();
  } catch (error) {
    next(error);
  }
};
