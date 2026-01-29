import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import User from '../models/User.model.js';
import { getUserCapabilities } from '../utils/capabilities.js';

export const authenticate = (req, res, next) => {
  try {
    // Public endpoints (no auth) - never block these with session auth.
    // Note: Some environments may inadvertently wrap `/api/public/*` with `authenticate`.
    const requestPath = String(req.originalUrl || req.path || '');
    if (requestPath.startsWith('/api/public/')) {
      return next();
    }

    // Try cookie first (new method), then fall back to Authorization header (for backward compatibility)
    const token = req.cookies?.authToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
    
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Handle approved employee tokens
    if (decoded.type === 'approved_employee' || decoded.type === 'passwordless') {
      req.user = {
        email: decoded.email,
        role: 'approved_employee',
        type: decoded.type || 'approved_employee',
        agencyId: decoded.agencyId, // Default agency
        agencyIds: decoded.agencyIds || (decoded.agencyId ? [decoded.agencyId] : []) // All agencies
      };
      return next();
    }
    
    // Regular user tokens - support both email and username for login
    // The token contains email field which may be username or email
    req.user = {
      id: decoded.id,
      email: decoded.email, // This may be username or email
      role: decoded.role,
      type: decoded.type || 'regular',
      agencyId: decoded.agencyId
    };
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
    if (decoded.type === 'approved_employee' || decoded.type === 'passwordless') {
      req.user = {
        email: decoded.email,
        role: 'approved_employee',
        type: decoded.type || 'approved_employee',
        agencyId: decoded.agencyId,
        agencyIds: decoded.agencyIds || (decoded.agencyId ? [decoded.agencyId] : [])
      };
      return next();
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      type: decoded.type || 'regular',
      agencyId: decoded.agencyId
    };
    return next();
  } catch {
    // If token is invalid/expired, treat as unauthenticated.
    return next();
  }
};

export const requireAdmin = async (req, res, next) => {
  // Allow admin, super_admin, support, supervisors, and CPAs
  // Check if user is a supervisor using boolean as source of truth
  const requestingUser = await User.findById(req.user.id);
  const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
  
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support' && 
      !isSupervisor && req.user.role !== 'clinical_practice_assistant') {
    return res.status(403).json({ error: { message: 'Admin access required' } });
  }
  next();
};

/**
 * Backoffice admin access only (no supervisors/CPAs).
 * Use this for actions that should be limited to true admins/support/super admins.
 */
export const requireBackofficeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
    return res.status(403).json({ error: { message: 'Admin access required' } });
  }
  next();
};

export const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
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

      const caps = getUserCapabilities(userForCaps);
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
    
    // Must be admin/support/staff role (agency-side backoffice)
    if (req.user.role !== 'admin' && req.user.role !== 'support' && req.user.role !== 'staff') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Get agency ID from params or body
    const agencyId = req.params.agencyId || req.body.agencyId || req.query.agencyId;
    
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID required' } });
    }
    
    // Check if user is admin for this agency
    const userAgencies = await User.getAgencies(req.user.id);
    const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
    
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
    
    // Superadmins bypass all status checks (except ARCHIVED)
    if (user.role === 'super_admin' && user.status !== 'ARCHIVED') {
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
    
    // Block ARCHIVED users from all routes
    if (user.status === 'ARCHIVED') {
      return res.status(403).json({ 
        error: { message: 'Your account has been archived. Please contact your administrator.' } 
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
