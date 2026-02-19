import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import User from '../models/User.model.js';
import UserActivityLog from '../models/UserActivityLog.model.js';
import ActivityLogService from '../services/activityLog.service.js';
import config from '../config/config.js';
import { getUserCapabilities } from '../utils/capabilities.js';
import Agency from '../models/Agency.model.js';
import { createSignedState as createGoogleState, verifySignedState as verifyGoogleState, exchangeCodeForTokens, getGoogleAuthorizeUrl, getGoogleOAuthClient } from '../services/googleOAuth.service.js';
import EmailService from '../services/email.service.js';
import EmailTemplateService from '../services/emailTemplate.service.js';
import CommunicationLoggingService from '../services/communicationLogging.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import pool from '../config/database.js';

async function buildPayrollCaps(user) {
  const payrollAgencyIds = user?.id ? await User.listPayrollAgencyIds(user.id) : [];
  const baseCaps = getUserCapabilities(user);
  const canManagePayroll = user?.role === 'super_admin' || payrollAgencyIds.length > 0;
  return {
    payrollAgencyIds,
    capabilities: {
      ...baseCaps,
      canManagePayroll,
      canViewMyPayroll: true
    }
  };
}

const SSO_EXCLUDED_ROLES = new Set(['school_staff', 'client_guardian', 'client', 'guardian', 'kiosk']);
const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
};
const isSsoPasswordOverrideEnabled = (user) =>
  user?.sso_password_override === 1 || user?.sso_password_override === true || user?.sso_password_override === '1';
const isSsoPolicyRequiredForRole = ({ featureFlags, userRole }) => {
  const ssoEnabled = featureFlags?.googleSsoEnabled === true;
  const requiredRoles = Array.isArray(featureFlags?.googleSsoRequiredRoles)
    ? featureFlags.googleSsoRequiredRoles.map((r) => String(r || '').toLowerCase()).filter(Boolean)
    : [];
  const roleNorm = String(userRole || '').toLowerCase();
  const roleAliases =
    roleNorm === 'provider_plus' || roleNorm === 'clinical_practice_assistant'
      ? ['provider_plus', 'clinical_practice_assistant']
      : [roleNorm];
  return ssoEnabled && roleAliases.some((r) => requiredRoles.includes(r)) && !SSO_EXCLUDED_ROLES.has(roleNorm);
};
const isDomainAllowedForOrg = ({ email, featureFlags }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const domain = normalizedEmail.includes('@') ? normalizedEmail.split('@')[1] : '';
  const allowedDomains = Array.isArray(featureFlags?.googleSsoAllowedDomains)
    ? featureFlags.googleSsoAllowedDomains.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!allowedDomains.length) return true;
  return !!domain && allowedDomains.includes(domain);
};
/** True if any login email in the list has a domain in the org's allowed list (or no allowlist). Used when identifier is username (no @). */
const isAnyLoginEmailDomainAllowed = ({ loginEmails, featureFlags }) => {
  const allowedDomains = Array.isArray(featureFlags?.googleSsoAllowedDomains)
    ? featureFlags.googleSsoAllowedDomains.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!allowedDomains.length) return true;
  const normalized = (Array.isArray(loginEmails) ? loginEmails : []).map((e) => String(e || '').trim().toLowerCase()).filter((e) => e && e.includes('@'));
  return normalized.some((email) => {
    const domain = email.split('@')[1] || '';
    return !!domain && allowedDomains.includes(domain);
  });
};
const getUserLoginIdentifiers = async (userId) => {
  if (!userId) return [];
  try {
    const UserLoginEmail = (await import('../models/UserLoginEmail.model.js')).default;
    const aliases = await UserLoginEmail.listForUser(userId);
    return (aliases || []).map((r) => r?.email).filter(Boolean);
  } catch {
    return [];
  }
};
const isWorkspaceEligibleForSso = ({ user, identifier, featureFlags, identifierUsedToFindUser, loginIdentifiers }) => {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
  const userRole = String(user?.role || '').toLowerCase();
  const ssoPolicyRequired = isSsoPolicyRequiredForRole({ featureFlags, userRole });
  if (!ssoPolicyRequired || isSsoPasswordOverrideEnabled(user)) return false;

  // They must use a valid login identifier (email, work_email, username, login aliases). NOT personal_email.
  const validIds = new Set([
    String(user?.email || '').trim().toLowerCase(),
    String(user?.work_email || '').trim().toLowerCase(),
    String(user?.username || '').trim().toLowerCase(),
    ...(identifierUsedToFindUser ? [String(identifierUsedToFindUser).trim().toLowerCase()] : []),
    ...(loginIdentifiers || []).map((e) => String(e || '').trim().toLowerCase())
  ].filter(Boolean));
  if (!validIds.has(normalizedIdentifier)) return false;

  const loginEmails = [
    user?.email,
    user?.work_email,
    ...(loginIdentifiers || []).filter((e) => e && String(e).includes('@'))
  ].filter(Boolean);

  // Domain check: the identifier they entered must match allowed domain. Prevents SSO with personal@gmail.com etc.
  if (normalizedIdentifier.includes('@')) {
    // If the entered login alias domain is not allowlisted, still allow Google when
    // another valid login email on this account is allowlisted for the org.
    if (
      !isDomainAllowedForOrg({ email: normalizedIdentifier, featureFlags }) &&
      !isAnyLoginEmailDomainAllowed({ loginEmails, featureFlags })
    ) {
      return false;
    }
  } else {
    // Username (no @): check if their login emails have an allowed domain; personal_email is excluded.
    if (!isAnyLoginEmailDomainAllowed({ loginEmails, featureFlags })) return false;
  }
  return true;
};

export const approvedEmployeeLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { email, password } = req.body;

    if (!password) {
      return res.status(400).json({ error: { message: 'Password is required' } });
    }

    // Check if email is in approved list - find ALL entries for this email (multiple agencies)
    const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
    const allEmployees = await ApprovedEmployee.findAllByEmail(email);

    if (!allEmployees || allEmployees.length === 0) {
      // Check if email exists in users table but is inactive
      const user = await User.findByEmail(email);
      if (user && (user.is_active === false || user.is_active === 0)) {
        return res.status(401).json({ 
          error: { 
            message: 'Forgot password? Please contact your administrator. Additionally, you may be attempting to login as a past user who has been set to "inactive" following the completion of your onboarding training. If this is the case and you are a current employee, on-demand training may be available to you and there may be a different password to access this training. If you are a current employee and believe this describes your current status, please email PO@itsco.health and request the on-demand credentials to access your account.' 
          } 
        });
      }
      // Email not found at all
      return res.status(401).json({ 
        error: { 
          message: 'User not found. Contact PO@ITSCO.health if this is an error or if you require your credentials.' 
        } 
      });
    }

    // Filter to only active employees
    const activeEmployees = allEmployees.filter(emp => emp.is_active);
    if (activeEmployees.length === 0) {
      return res.status(401).json({ error: { message: 'Email not approved for access' } });
    }

    // Check if verification is required and completed for any entry
    const unverifiedEmployees = activeEmployees.filter(emp => emp.requires_verification && !emp.verified_at);
    if (unverifiedEmployees.length > 0) {
      return res.status(403).json({
        error: {
          message: 'Email verification required',
          requiresVerification: true,
          email: activeEmployees[0].email
        }
      });
    }

    // Check if user is archived (if they exist in users table)
    const firstEmployee = activeEmployees[0];
    if (firstEmployee.user_id) {
      const User = (await import('../models/User.model.js')).default;
      const user = await User.findById(firstEmployee.user_id);
      if (user && (user.is_archived === true || user.is_archived === 1)) {
        return res.status(403).json({ error: { message: 'Account has been archived. Access denied.' } });
      }
    }

    // Verify password - try each employee entry until we find a match
    // Check individual password first, then company default (if enabled)
    let isValidPassword = false;
    let matchedEmployee = null;
    
    for (const employee of activeEmployees) {
      const useDefaultPassword = employee.use_default_password !== undefined ? employee.use_default_password : true;
      
      if (employee.password_hash) {
        // Check individual password first
        isValidPassword = await bcrypt.compare(password, employee.password_hash);
        if (isValidPassword) {
          matchedEmployee = employee;
          break;
        }
      }
      
      // If individual password didn't match, try company default
      if (!isValidPassword && useDefaultPassword && employee.company_default_password_hash) {
        isValidPassword = await bcrypt.compare(password, employee.company_default_password_hash);
        if (isValidPassword) {
          matchedEmployee = employee;
          break;
        }
      }
    }

    if (!isValidPassword) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }

    // Generate session ID
    const sessionId = crypto.randomUUID();
    
    // Get IP address and user agent
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Collect all agency IDs the user has access to
    const agencyIds = activeEmployees.map(emp => emp.agency_id).filter(id => id !== null);

    // Use the first agency as the default, but include all agencies in the response
    const defaultAgencyId = matchedEmployee.agency_id || (agencyIds.length > 0 ? agencyIds[0] : null);

    // Create session token (expires in 24 hours)
    // Include all agency IDs in the token for agency switching
    const sessionToken = jwt.sign(
      { 
        email: matchedEmployee.email,
        type: 'approved_employee',
        agencyId: defaultAgencyId, // Default agency
        agencyIds: agencyIds, // All agencies user has access to
        sessionId
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    // Set secure HttpOnly cookie for authentication
    // Use shared cookie options to ensure consistency with logout
    const cookieOptions = config.authCookie.set();
    res.cookie('authToken', sessionToken, cookieOptions);

    // Log login activity for each agency using centralized service
    for (const employee of activeEmployees) {
      ActivityLogService.logActivity({
        actionType: 'login',
        userId: employee.user_id || null,
        agencyId: employee.agency_id,
        ipAddress,
        userAgent,
        sessionId,
        metadata: {
          email: employee.email,
          type: 'approved_employee',
          multipleAgencies: activeEmployees.length > 1
        }
      });
    }

    res.json({
      token: sessionToken,
      user: {
        email: matchedEmployee.email,
        role: 'approved_employee',
        type: 'approved_employee',
        agencyIds: agencyIds, // Include all agency IDs in response
        capabilities: getUserCapabilities({ role: 'approved_employee', status: 'ACTIVE_EMPLOYEE', type: 'approved_employee' })
      },
      sessionId,
      agencies: agencyIds // Also include as separate field for convenience
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const identifierRaw = req.body?.username || req.body?.email || '';
    const identifier = String(identifierRaw || '').trim().toLowerCase();
    const { password } = req.body;
    const orgSlugRaw = req.body?.organizationSlug || req.body?.orgSlug || null;
    const orgSlug = orgSlugRaw ? String(orgSlugRaw).trim().toLowerCase() : null;

    let user;
    try {
      // Try to find by email first (which also checks username now)
      user = await User.findByEmail(identifier);
      // If not found by email, try username field specifically
      if (!user) {
        user = await User.findByUsername(identifier);
      }
    } catch (dbError) {
      console.error('Database error during login:', {
        message: dbError.message,
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
        sqlMessage: dbError.sqlMessage,
        stack: dbError.stack
      });
      
      // Check if it's a database connection/auth error
      if (
        dbError.code === 'ER_ACCESS_DENIED_ERROR' ||
        dbError.code === 'ECONNREFUSED' ||
        dbError.code === 'ETIMEDOUT' ||
        dbError.code === 'PROTOCOL_CONNECTION_LOST'
      ) {
        const isDev = process.env.NODE_ENV === 'development';
        return res.status(503).json({ 
          error: { 
            message: isDev
              ? 'Database connection error. In local dev, ensure Cloud SQL Proxy is running and your gcloud Application Default Credentials are valid.'
              : 'Database connection error. Please contact support if this persists.',
            code: 'DATABASE_ERROR'
          } 
        });
      }
      
      // For other database errors, log and return generic error
      return res.status(500).json({ 
        error: { 
          message: 'An error occurred during login. Please try again.',
          code: 'INTERNAL_ERROR'
        } 
      });
    }
    if (!user) {
      // User not found in system at all
      return res.status(401).json({ 
        error: { 
          message: 'User not found. Contact PO@ITSCO.health if this is an error or if you require your credentials.' 
        } 
      });
    }

    // Optional org-level SSO enforcement: if this login attempt is for a specific org slug,
    // and that org has Google SSO enabled for this role, block local password login.
    if (orgSlug) {
      try {
        const org = (await Agency.findBySlug(orgSlug)) || (await Agency.findByPortalUrl(orgSlug));
        const featureFlags = parseFeatureFlags(org?.feature_flags ?? null);
        const loginIdentifiers = await getUserLoginIdentifiers(user?.id);
        if (isWorkspaceEligibleForSso({ user, identifier, featureFlags, identifierUsedToFindUser: identifier, loginIdentifiers })) {
          return res.status(403).json({
            error: {
              message: 'This organization requires Google sign-in. Please continue with Google.',
              code: 'SSO_REQUIRED'
            }
          });
        }
      } catch {
        // Best-effort: if org lookup fails, do not block login.
      }
    }

    // Check user status and access using new lifecycle system
    const { canLogin: canUserLogin, isAccessExpired } = await import('../utils/accessControl.js');
    const userStatus = user.status || 'PENDING_SETUP';
    
    // Block ARCHIVED users from login
    if (userStatus === 'ARCHIVED') {
      return res.status(403).json({ 
        error: { message: 'Account has been archived. Access denied.' } 
      });
    }
    
    // Block PENDING_SETUP users who haven't set password yet
    if (userStatus === 'PENDING_SETUP' && (!user.password_hash || user.password_hash === null)) {
      return res.status(403).json({ 
        error: { 
          message: 'Please complete your account setup first. Use the passwordless login link sent to your email.',
          requiresSetup: true
        } 
      });
    }
    
    // Check if access has expired (for TERMINATED_PENDING users)
    if (isAccessExpired(user)) {
      return res.status(403).json({ 
        error: { message: 'Account access has expired. Please contact your administrator.' } 
      });
    }
    
    // Check if user can login based on status
    if (!canUserLogin(user)) {
      return res.status(403).json({ 
        error: { message: 'Account is not accessible. Please contact your administrator.' } 
      });
    }

    // Verify password (supports temporary passwords)
    const hasPasswordHash = !!user.password_hash;
    const hasTempHash = !!user.temporary_password_hash;

    if (!hasPasswordHash && !hasTempHash) {
      return res.status(401).json({
        error: {
          message: 'Please complete your account setup first. Please contact your administrator for your temporary password.',
          requiresSetup: true
        }
      });
    }

    let isValidPassword = false;
    if (hasPasswordHash) {
      isValidPassword = await bcrypt.compare(password, user.password_hash);
    }

    // If normal password did not match (or isn't set), fall back to temporary password if present + unexpired
    if (!isValidPassword && hasTempHash) {
      // Enforce expiration (with small clock-skew buffer)
      if (user.temporary_password_expires_at) {
        const expiresAt = new Date(user.temporary_password_expires_at);
        const now = new Date();
        const bufferMs = 60 * 1000; // 1 minute
        if (expiresAt.getTime() < (now.getTime() - bufferMs)) {
          return res.status(401).json({
            error: {
              message: 'Temporary password has expired. Please contact your administrator for a new temporary password.'
            }
          });
        }
      }
      isValidPassword = await bcrypt.compare(password, user.temporary_password_hash);
    }

    if (!isValidPassword) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }
    
    // If user is inactive but password is correct, still allow login (they may be reinstated)
    // The frontend will handle redirecting them appropriately

    // Generate session ID
    const sessionId = crypto.randomUUID();
    
    // Get IP address and user agent
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Get user's primary agency (first agency if multiple)
    let agencyId = null;
    try {
      const agencies = await User.getAgencies(user.id);
      if (agencies && agencies.length > 0) {
        agencyId = agencies[0].id;
      }
    } catch (err) {
      console.error('Failed to get user agencies for activity log:', err);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, sessionId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Set secure HttpOnly cookie for authentication
    // Use shared cookie options to ensure consistency with logout
    const cookieOptions = config.authCookie.set();
    res.cookie('authToken', token, cookieOptions);

    // Check if this is the first login
    const isFirstLogin = await UserActivityLog.isFirstLogin(user.id);

    // Log login activity using centralized service
    // Note: req.user doesn't exist yet during login, so we pass userId explicitly
    ActivityLogService.logActivity({
      actionType: 'login',
      userId: user.id,
      metadata: {
        email: user.email,
        role: user.role,
        isFirstLogin
      }
    }, req);

    // Create first login notification if this is the first login
    if (isFirstLogin) {
      setTimeout(async () => {
        try {
          const NotificationService = (await import('../services/notification.service.js')).default;
          
          // Get all user agencies and create notifications for each
          const agencies = await User.getAgencies(user.id);
          for (const agency of agencies) {
            if (user.status === 'PREHIRE_OPEN' || user.status === 'PENDING_SETUP') {
              NotificationService.createFirstLoginPendingNotification(user.id, agency.id).catch(err => {
                console.error('Failed to create first login pending notification:', err);
              });
            } else {
              NotificationService.createFirstLoginNotification(user.id, agency.id).catch(err => {
                console.error('Failed to create first login notification:', err);
              });
            }
          }
        } catch (err) {
          console.error('Failed to get user agencies for notification:', err);
          // Fallback to primary agency
          if (agencyId) {
            try {
              const NotificationService = (await import('../services/notification.service.js')).default;
              if (user.status === 'PREHIRE_OPEN' || user.status === 'PENDING_SETUP') {
                NotificationService.createFirstLoginPendingNotification(user.id, agencyId).catch(err => {
                  console.error('Failed to create first login pending notification:', err);
                });
              } else {
                NotificationService.createFirstLoginNotification(user.id, agencyId).catch(err => {
                  console.error('Failed to create first login notification:', err);
                });
              }
            } catch (importErr) {
              console.error('Failed to import NotificationService:', importErr);
            }
          }
        }
      }, 0);
    }

    // Ensure we have the latest user fields (including contract flags like medcancel_rate_schedule).
    // Some login flows may not select all columns.
    let freshUser = user;
    try {
      const loaded = await User.findById(user.id);
      if (loaded) freshUser = loaded;
    } catch {
      // best-effort
    }

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
    const pw = calcPasswordExpiry(freshUser);

    // Force a password change when a temporary password is active (and unexpired).
    const tempActive = (() => {
      if (!freshUser?.temporary_password_hash) return false;
      if (!freshUser?.temporary_password_expires_at) return true;
      const expiresAt = new Date(freshUser.temporary_password_expires_at);
      if (Number.isNaN(expiresAt.getTime())) return true;
      return expiresAt.getTime() > Date.now();
    })();

    const medcancelRateSchedule = freshUser?.medcancel_rate_schedule || null;
    const medcancelEnabled = ['low', 'high'].includes(String(medcancelRateSchedule || '').toLowerCase());
    const companyCardEnabled = Boolean(freshUser?.company_card_enabled);

    const responseData = {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        firstName: user.first_name,
        lastName: user.last_name,
        preferredName: freshUser?.preferred_name || null,
        username: user.username || user.email,
        medcancelEnabled,
        medcancelRateSchedule,
        companyCardEnabled,
        requiresPasswordChange: pw.requiresPasswordChange || tempActive,
        passwordExpiresAt: pw.passwordExpiresAt,
        passwordExpired: pw.passwordExpired,
        has_supervisor_privileges: !!(freshUser?.has_supervisor_privileges === true || freshUser?.has_supervisor_privileges === 1 || freshUser?.has_supervisor_privileges === '1'),
        has_provider_access: !!(freshUser?.has_provider_access === true || freshUser?.has_provider_access === 1 || freshUser?.has_provider_access === '1'),
        has_staff_access: !!(freshUser?.has_staff_access === true || freshUser?.has_staff_access === 1 || freshUser?.has_staff_access === '1'),
        skill_builder_eligible: !!(freshUser?.skill_builder_eligible === true || freshUser?.skill_builder_eligible === 1 || freshUser?.skill_builder_eligible === '1'),
        has_skill_builder_coordinator_access: !!(
          freshUser?.has_skill_builder_coordinator_access === true ||
          freshUser?.has_skill_builder_coordinator_access === 1 ||
          freshUser?.has_skill_builder_coordinator_access === '1'
        ),
        skill_builder_confirm_required_next_login: !!(
          freshUser?.skill_builder_confirm_required_next_login === true ||
          freshUser?.skill_builder_confirm_required_next_login === 1 ||
          freshUser?.skill_builder_confirm_required_next_login === '1'
        ),
        ...(await buildPayrollCaps(user))
      },
      sessionId
    };
    
    console.log('Login successful for user:', user.email, 'Session ID:', sessionId);
    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * Public endpoint: identify a username/email and return the best org context + login method.
 * This powers a username-first login UX (verify -> branded login -> google or password).
 */
export const identifyLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const usernameRaw = req.body?.username || req.body?.email || '';
    const normalizedUsername = String(usernameRaw || '').trim().toLowerCase();
    const orgSlugRaw = req.body?.organizationSlug || req.body?.orgSlug || null;
    const requestedOrgSlug = orgSlugRaw ? String(orgSlugRaw).trim().toLowerCase() : null;
    const rescueMode = req.body?.rescue === true || String(req.body?.rescue || '').trim() === '1';

    const notifyRescueAttempt = ({ matched = false, method = 'password', resolvedSlug = null }) => {
      if (!rescueMode) return;
      notifyCurrentEmployeeRescue({
        orgSlug: requestedOrgSlug || resolvedSlug || null,
        username: normalizedUsername,
        matched,
        method,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown'
      }).catch(() => {});
    };

    if (!normalizedUsername) {
      notifyRescueAttempt({ matched: false, method: 'password', resolvedSlug: requestedOrgSlug });
      return res.json({
        matched: false,
        normalizedUsername,
        needsOrgChoice: false,
        resolvedOrg: null,
        login: { method: 'password' }
      });
    }

    let user = null;
    try {
      user = await User.findByEmail(normalizedUsername);
      if (!user) user = await User.findByUsername(normalizedUsername);
      // Explicit fallback: user_login_emails (Login Email aliases) when users table has no match.
      // Covers cases where Login Email is stored only in user_login_emails or findByEmail's internal fallback fails.
      if (!user && normalizedUsername.includes('@')) {
        const UserLoginEmail = (await import('../models/UserLoginEmail.model.js')).default;
        const userId = await UserLoginEmail.findUserIdByEmail(normalizedUsername);
        if (userId) user = await User.findById(userId);
      }
    } catch {
      user = null;
    }

    if (!user?.id) {
      notifyRescueAttempt({ matched: false, method: 'password', resolvedSlug: requestedOrgSlug });
      return res.json({
        matched: false,
        normalizedUsername,
        needsOrgChoice: false,
        resolvedOrg: null,
        login: { method: 'password' }
      });
    }

    const userRole = String(user?.role || '').toLowerCase();
    if (userRole === 'super_admin') {
      // Keep platform /login username-first + password by default.
      // On org-branded login pages, allow Google routing when org SSO is enabled,
      // so super admins are not blocked behind password-only verify flow.
      if (requestedOrgSlug) {
        let useGoogle = rescueMode;
        try {
          const org = (await Agency.findBySlug(requestedOrgSlug)) || (await Agency.findByPortalUrl(requestedOrgSlug));
          const flags = parseFeatureFlags(org?.feature_flags ?? null);
          if (flags?.googleSsoEnabled === true) {
            useGoogle = true;
          }
        } catch {
          // best-effort: fall back to default behavior below
        }

        if (useGoogle) {
          const googleStartUrl = `/auth/google/start?orgSlug=${encodeURIComponent(requestedOrgSlug)}`;
          notifyRescueAttempt({ matched: true, method: 'google', resolvedSlug: requestedOrgSlug });
          return res.json({
            matched: true,
            normalizedUsername,
            needsOrgChoice: false,
            resolvedOrg: null,
            login: { method: 'google', googleStartUrl }
          });
        }
      }

      notifyRescueAttempt({ matched: true, method: 'password', resolvedSlug: requestedOrgSlug });
      return res.json({
        matched: true,
        normalizedUsername,
        needsOrgChoice: false,
        resolvedOrg: null,
        login: { method: 'password' }
      });
    }

    // IMPORTANT: prefer portal_url (public portal identifier) over slug (internal identifier).
    // Many child orgs (school/program/learning) use portal_url as the actual path segment.
    const pickSlug = (org) => String(org?.portal_url || org?.portalUrl || org?.slug || '').trim().toLowerCase() || null;
    const pickType = (org) => String(org?.organization_type || org?.organizationType || 'agency').trim().toLowerCase();

    let orgs = [];
    try {
      orgs = (await User.getAgencies(user.id)) || [];
    } catch {
      orgs = [];
    }

    // Best-effort: tag orgs with affiliated agency id so we can identify portal orgs
    // even when organization_type is NULL/empty in older data.
    // This avoids forcing school_staff users to pick an org, and prevents snapping to the parent agency branding.
    const attachAffiliationMeta = async (list) => {
      const out = Array.isArray(list) ? list : [];
      if (!out.length) return out;
      const ids = Array.from(
        new Set(out.map((o) => parseInt(o?.id, 10)).filter((n) => Number.isFinite(n) && n > 0))
      );
      if (!ids.length) return out;
      const byOrg = new Map();

      // organization_affiliations (newer)
      try {
        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT organization_id, agency_id
           FROM organization_affiliations
           WHERE is_active = TRUE
             AND organization_id IN (${placeholders})
           ORDER BY updated_at DESC, id DESC`,
          ids
        );
        for (const r of rows || []) {
          const orgId = Number(r?.organization_id || 0);
          if (!orgId || byOrg.has(orgId)) continue;
          byOrg.set(orgId, Number(r?.agency_id || 0) || null);
        }
      } catch {
        // Fallback for older schemas that used active_agency_id and/or active flags.
        try {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT organization_id, active_agency_id AS agency_id
             FROM organization_affiliations
             WHERE (is_active = TRUE OR active = TRUE)
               AND organization_id IN (${placeholders})
             ORDER BY updated_at DESC, id DESC`,
            ids
          );
          for (const r of rows || []) {
            const orgId = Number(r?.organization_id || 0);
            if (!orgId || byOrg.has(orgId)) continue;
            byOrg.set(orgId, Number(r?.agency_id || 0) || null);
          }
        } catch {
          // ignore; table/columns may differ or not exist
        }
      }

      // agency_schools (legacy)
      try {
        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT school_organization_id AS organization_id, agency_id
           FROM agency_schools
           WHERE is_active = TRUE
             AND school_organization_id IN (${placeholders})
           ORDER BY updated_at DESC, id DESC`,
          ids
        );
        for (const r of rows || []) {
          const orgId = Number(r?.organization_id || 0);
          if (!orgId || byOrg.has(orgId)) continue;
          byOrg.set(orgId, Number(r?.agency_id || 0) || null);
        }
      } catch {
        // Fallback for older schemas that used school_id / active_agency_id / active.
        try {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT school_id AS organization_id, active_agency_id AS agency_id
             FROM agency_schools
             WHERE (is_active = TRUE OR active = TRUE)
               AND school_id IN (${placeholders})
             ORDER BY updated_at DESC, id DESC`,
            ids
          );
          for (const r of rows || []) {
            const orgId = Number(r?.organization_id || 0);
            if (!orgId || byOrg.has(orgId)) continue;
            byOrg.set(orgId, Number(r?.agency_id || 0) || null);
          }
        } catch {
          // ignore; table/columns may differ or not exist
        }
      }

      for (const o of out) {
        const id = parseInt(o?.id, 10);
        if (!id) continue;
        if (o.affiliated_agency_id === undefined || o.affiliated_agency_id === null) {
          o.affiliated_agency_id = byOrg.get(id) || null;
        }
      }
      return out;
    };

    await attachAffiliationMeta(orgs);

    const orgOptions = (orgs || []).map((o) => ({
      id: o?.id ?? null,
      name: o?.name ?? null,
      slug: o?.slug ?? null,
      portal_url: o?.portal_url ?? o?.portalUrl ?? null,
      organization_type: o?.organization_type ?? o?.organizationType ?? null
    }));

    // Resolve org context
    let resolved = null;
    const requested = requestedOrgSlug ? String(requestedOrgSlug).trim().toLowerCase() : null;

    const hasMembership = (slug) => {
      if (!slug) return false;
      const s = String(slug).trim().toLowerCase();
      return (orgs || []).some((o) => {
        const os = pickSlug(o);
        return os && os === s;
      });
    };

    if (requested && hasMembership(requested)) {
      const candidate = (orgs || []).find((o) => pickSlug(o) === requested) || null;
      // For school_staff, ignore requested agency slugs when a portal org exists.
      // This prevents remembered/previous org slugs (often the parent agency) from blocking the
      // intended behavior: snap to the affiliated school/program/learning portal.
      if (candidate && userRole === 'school_staff') {
        const candidateType = pickType(candidate);
        const isPortalCandidate = ['school', 'program', 'learning'].includes(candidateType) || !!candidate?.affiliated_agency_id;
        if (isPortalCandidate) {
          resolved = candidate;
        }
      } else {
        resolved = candidate;
      }
    }

    // Special-case school_staff:
    // - exactly one portal org (school/program/learning) => snap to that portal
    // - multiple portal orgs => stay on/resolve to agency context
    if (!resolved && userRole === 'school_staff') {
      const isPortalOrg = (o) => {
        const t = pickType(o);
        if (['school', 'program', 'learning'].includes(t)) return true;
        // If org is affiliated under an agency, treat it as a portal org even if organization_type is blank/null.
        return !!(o?.affiliated_agency_id);
      };

      const portalOrgs = (orgs || []).filter(isPortalOrg);
      if (portalOrgs.length === 1) {
        resolved = portalOrgs[0];
      } else if (portalOrgs.length > 1) {
        const agencyOrgs = (orgs || []).filter((o) => pickType(o) === 'agency');
        // Prefer the requested slug when it points at an agency membership.
        if (requested) {
          const requestedAgency = agencyOrgs.find((o) => pickSlug(o) === requested) || null;
          if (requestedAgency) {
            resolved = requestedAgency;
          }
        }
        // Otherwise pick the first agency org if present.
        if (!resolved && agencyOrgs.length > 0) {
          resolved = agencyOrgs[0];
        }
      }
    }

    // If still unresolved:
    // - single org => use it
    // - multi-org => keep unresolved (no org dropdown; stay on current login context)
    if (!resolved) {
      if ((orgs || []).length === 1) {
        resolved = orgs[0];
      }
    }

    const resolvedSlug = resolved ? pickSlug(resolved) : null;

    // Determine login method (Google vs password) for resolved org
    let loginMethod = 'password';
    let googleStartUrl = null;

    // Rescue mode is a fail-safe: after we can match the user and org context,
    // route to Google start directly instead of depending on normal pre-check heuristics.
    if (rescueMode) {
      const rescueSlug = resolvedSlug || requestedOrgSlug;
      if (rescueSlug) {
        loginMethod = 'google';
        googleStartUrl = `/auth/google/start?orgSlug=${encodeURIComponent(rescueSlug)}`;
      }
    }

    if (resolvedSlug) {
      try {
        const org = (await Agency.findBySlug(resolvedSlug)) || (await Agency.findByPortalUrl(resolvedSlug));
        const flags = parseFeatureFlags(org?.feature_flags ?? null);
        const ssoPolicyRequired = isSsoPolicyRequiredForRole({ featureFlags: flags, userRole });
        const hasSsoPasswordOverride = isSsoPasswordOverrideEnabled(user);
        // Login identifiers only (email, work_email, login aliases). NOT personal_email.
        const loginIdentifiers = [
          user?.email,
          user?.work_email,
          ...(await getUserLoginIdentifiers(user?.id))
        ].filter(Boolean);

        // IMPORTANT:
        // If org policy requires Google SSO for this role, do not gate the Google start step on
        // the typed login identifier. The callback performs the real account/domain authorization.
        // This avoids "Verify" dead-ends when users type an alternate identifier.
        const canStartGoogleByPolicy = ssoPolicyRequired && !hasSsoPasswordOverride;
        const canStartGoogleByEligibility = isWorkspaceEligibleForSso({
          user,
          identifier: normalizedUsername,
          featureFlags: flags,
          identifierUsedToFindUser: normalizedUsername,
          loginIdentifiers
        });

        if (canStartGoogleByPolicy || canStartGoogleByEligibility) {
          loginMethod = 'google';
          googleStartUrl = `/auth/google/start?orgSlug=${encodeURIComponent(resolvedSlug)}`;
        }
      } catch {
        // best-effort
      }
    }

    notifyRescueAttempt({ matched: true, method: loginMethod, resolvedSlug });
    return res.json({
      matched: true,
      normalizedUsername,
      needsOrgChoice: false,
      orgOptions: undefined,
      resolvedOrg: resolved
        ? {
            id: resolved?.id ?? null,
            name: resolved?.name ?? null,
            slug: resolved?.slug ?? null,
            portal_url: resolved?.portal_url ?? resolved?.portalUrl ?? null,
            organization_type: resolved?.organization_type ?? resolved?.organizationType ?? null
          }
        : null,
      login:
        loginMethod === 'google'
          ? { method: 'google', googleStartUrl }
          : { method: 'password' }
    });
  } catch (e) {
    next(e);
  }
};

export const logout = async (req, res, next) => {
  try {
    // Get session ID from token if available
    const token = req.headers.authorization?.substring(7);
    let sessionId = null;
    let userId = null;
    let agencyId = null;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        sessionId = decoded.sessionId || null;
        userId = decoded.id || null;
        agencyId = decoded.agencyId || null;
      } catch (err) {
        // Token might be expired, that's okay
      }
    }
    
    // Get session ID and reason from body if provided
    const bodySessionId = req.body?.sessionId;
    const reason = req.body?.reason || 'user_logout';
    
    if (bodySessionId) {
      sessionId = bodySessionId;
    }
    
    // Get IP address and user agent
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Calculate session duration if we have a session ID
    let sessionDuration = null;
    if (sessionId) {
      try {
        sessionDuration = await UserActivityLog.calculateSessionDuration(sessionId);
      } catch (err) {
        console.error('Failed to calculate session duration:', err);
      }
    }
    
    // Log logout activity using centralized service
    if (userId || sessionId) {
      ActivityLogService.logActivity({
        actionType: reason === 'timeout' ? 'timeout' : 'logout',
        userId: userId || null,
        durationSeconds: sessionDuration,
        metadata: {
          reason
        }
      }, req);
    }
    
    // Clear authentication cookie
    // Use shared cookie options to ensure exact match with cookie setting options
    // This is critical: clearCookie must use the same path, secure, sameSite, and domain
    // as the original cookie, otherwise the cookie won't be cleared properly
    const clearCookieOptions = config.authCookie.clear();
    res.clearCookie('authToken', clearCookieOptions);
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify session lock PIN for unlock.
 * POST /auth/verify-session-pin
 * Body: { pin: string } (4 digits)
 */
export const verifySessionPin = async (req, res, next) => {
  try {
    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: { message: 'PIN must be exactly 4 digits' } });
    }
    const UserPreferences = (await import('../models/UserPreferences.model.js')).default;
    const prefs = await UserPreferences.findByUserId(req.user.id);
    const hash = prefs?.session_lock_pin_hash;
    if (!hash) {
      return res.status(400).json({ error: { message: 'No session lock PIN set' } });
    }
    const valid = await bcrypt.compare(pin, hash);
    if (!valid) {
      return res.status(401).json({ error: { message: 'Invalid PIN' } });
    }
    res.json({ valid: true });
  } catch (e) {
    next(e);
  }
};

/**
 * Get session lock config for activity tracker.
 * GET /auth/session-lock-config
 * Returns platform max, agency max, user settings, effective timeout.
 */
export const getSessionLockConfig = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const UserPreferences = (await import('../models/UserPreferences.model.js')).default;
    const prefs = await UserPreferences.findByUserId(userId);
    const agencies = await User.getAgencies(userId);
    const agencyId = agencies?.[0]?.id || null;

    let platformMax = 30;
    try {
      const [rows] = await pool.execute(
        'SELECT max_inactivity_timeout_minutes FROM platform_branding ORDER BY id DESC LIMIT 1'
      );
      if (rows?.[0]?.max_inactivity_timeout_minutes != null) {
        platformMax = Math.min(240, Math.max(1, parseInt(rows[0].max_inactivity_timeout_minutes, 10) || 30));
      }
    } catch {
      /* use default */
    }

    let agencyMax = platformMax;
    if (agencyId) {
      try {
        const [aRows] = await pool.execute(
          'SELECT session_settings_json FROM agencies WHERE id = ? LIMIT 1',
          [agencyId]
        );
        const settings = aRows?.[0]?.session_settings_json;
        const parsed = typeof settings === 'string' ? (() => { try { return JSON.parse(settings); } catch { return {}; } })() : (settings || {});
        const am = parsed.maxInactivityTimeoutMinutes ?? parsed.max_inactivity_timeout_minutes;
        if (am != null) {
          const n = parseInt(am, 10);
          if (!isNaN(n) && n >= 1) agencyMax = Math.min(platformMax, n);
        }
      } catch {
        /* use platform max */
      }
    }

    const sessionLockEnabled = prefs?.session_lock_enabled === true || prefs?.session_lock_enabled === 1;
    const userTimeout = prefs?.inactivity_timeout_minutes != null
      ? Math.min(agencyMax, Math.max(1, parseInt(prefs.inactivity_timeout_minutes, 10) || agencyMax))
      : agencyMax;
    const hasPin = !!(prefs?.session_lock_pin_hash && String(prefs.session_lock_pin_hash).trim());

    res.json({
      platformMaxMinutes: platformMax,
      agencyMaxMinutes: agencyMax,
      sessionLockEnabled,
      inactivityTimeoutMinutes: userTimeout,
      hasPin,
      effectiveTimeoutMinutes: userTimeout,
      useLockScreen: sessionLockEnabled && hasPin
    });
  } catch (e) {
    next(e);
  }
};

export const googleOAuthStart = async (req, res, next) => {
  try {
    const normalizeHost = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return null;
      const host = raw.split(',')[0].trim();
      if (!host) return null;
      if (host.startsWith('[')) return host; // IPv6-style host; keep as-is.
      return host.replace(/:443$/, '').replace(/:80$/, '');
    };
    const getRequestHost = () => normalizeHost(req.get('x-forwarded-host') || req.get('host') || req.hostname || '');
    const getRequestProto = () => {
      const xfProto = req.get('x-forwarded-proto');
      const raw = (xfProto || req.protocol || 'https').toString();
      const p = raw.split(',')[0].trim().toLowerCase();
      return p === 'http' || p === 'https' ? p : 'https';
    };
    const addHostFromUrl = (set, rawUrl) => {
      const value = String(rawUrl || '').trim();
      if (!value) return;
      try {
        const u = new URL(value);
        const h = normalizeHost(u.host);
        if (h) set.add(h);
      } catch {
        // ignore malformed URL
      }
    };
    const addHostsFromCsv = (set, csv) => {
      const value = String(csv || '').trim();
      if (!value) return;
      for (const part of value.split(',').map((v) => normalizeHost(v)).filter(Boolean)) {
        set.add(part);
      }
    };
    const getAllowedRedirectHosts = () => {
      const out = new Set();
      addHostFromUrl(out, process.env.GOOGLE_OAUTH_REDIRECT_URI);
      addHostFromUrl(out, process.env.FRONTEND_URL);
      addHostFromUrl(out, process.env.BACKEND_PUBLIC_URL);
      addHostsFromCsv(out, process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_HOSTS);
      addHostsFromCsv(out, process.env.CORS_ORIGIN);
      return out;
    };
    const buildOAuthRedirectUriForRequest = () => {
      const fallback = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
      const host = getRequestHost();
      const proto = getRequestProto();
      if (!host) return fallback;
      const allowedHosts = getAllowedRedirectHosts();
      if (allowedHosts.has(host)) {
        return `${proto}://${host}/api/auth/google/callback`;
      }
      return fallback;
    };

    const orgSlugRaw = req.query?.orgSlug || req.query?.organizationSlug || null;
    const orgSlug = orgSlugRaw ? String(orgSlugRaw).trim().toLowerCase() : null;
    if (!orgSlug) {
      return res.status(400).send('Missing orgSlug');
    }

    // Ensure org exists (best-effort; also ensures we normalize to slug)
    const org = (await Agency.findBySlug(orgSlug)) || (await Agency.findByPortalUrl(orgSlug));
    if (!org) {
      return res.status(404).send('Organization not found');
    }

    const redirectUri = buildOAuthRedirectUriForRequest();
    const state = createGoogleState({ orgSlug, redirectUri });
    const payload = verifyGoogleState(state);
    const nonce = payload?.nonce || null;

    const authUrl = getGoogleAuthorizeUrl({ state, nonce, redirectUri });
    return res.redirect(302, authUrl);
  } catch (error) {
    next(error);
  }
};

export const googleOAuthCallback = async (req, res, next) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    const normalizeHost = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return null;
      const host = raw.split(',')[0].trim();
      if (!host) return null;
      if (host.startsWith('[')) return host; // IPv6-style host; keep as-is.
      return host.replace(/:443$/, '').replace(/:80$/, '');
    };
    const getRequestHost = () => normalizeHost(req.get('x-forwarded-host') || req.get('host') || req.hostname || '');
    const getRequestProto = () => {
      const xfProto = req.get('x-forwarded-proto');
      const raw = (xfProto || req.protocol || 'https').toString();
      const p = raw.split(',')[0].trim().toLowerCase();
      return p === 'http' || p === 'https' ? p : 'https';
    };
    const addHostFromUrl = (set, rawUrl) => {
      const value = String(rawUrl || '').trim();
      if (!value) return;
      try {
        const u = new URL(value);
        const h = normalizeHost(u.host);
        if (h) set.add(h);
      } catch {
        // ignore malformed URL
      }
    };
    const addHostsFromCsv = (set, csv) => {
      const value = String(csv || '').trim();
      if (!value) return;
      for (const part of value.split(',').map((v) => normalizeHost(v)).filter(Boolean)) {
        set.add(part);
      }
    };
    const getAllowedRedirectHosts = () => {
      const out = new Set();
      addHostFromUrl(out, process.env.GOOGLE_OAUTH_REDIRECT_URI);
      addHostFromUrl(out, process.env.FRONTEND_URL);
      addHostFromUrl(out, process.env.BACKEND_PUBLIC_URL);
      addHostsFromCsv(out, process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_HOSTS);
      addHostsFromCsv(out, process.env.CORS_ORIGIN);
      return out;
    };
    const buildOAuthRedirectUriForRequest = () => {
      const fallback = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
      const host = getRequestHost();
      const proto = getRequestProto();
      if (!host) return fallback;
      const allowedHosts = getAllowedRedirectHosts();
      if (allowedHosts.has(host)) {
        return `${proto}://${host}/api/auth/google/callback`;
      }
      return fallback;
    };
    const frontendBaseFromRedirectUri = (redirectUri) => {
      try {
        const u = new URL(String(redirectUri || '').trim());
        return `${u.protocol}//${u.host}`;
      } catch {
        return config.frontendUrl;
      }
    };

    const reqRedirectUri = buildOAuthRedirectUriForRequest();
    const reqFrontendBase = frontendBaseFromRedirectUri(reqRedirectUri);

    const redirectToLogin = (orgSlug, msg, frontendBase = reqFrontendBase) => {
      const safeSlug = String(orgSlug || '').trim() || '';
      const url = new URL(frontendBase || config.frontendUrl);
      url.pathname = safeSlug ? `/${safeSlug}/login` : '/login';
      if (msg) url.searchParams.set('error', String(msg));
      return res.redirect(302, url.toString());
    };

    if (oauthError) {
      return redirectToLogin('', error_description || oauthError, reqFrontendBase);
    }

    if (!code || !state) {
      return res.status(400).send('Missing required query parameters');
    }

    const verified = verifyGoogleState(state);
    if (!verified?.orgSlug) {
      return res.status(400).send('Invalid or expired state');
    }
    const orgSlug = String(verified.orgSlug || '').trim().toLowerCase();
    const redirectUri = String(verified?.redirectUri || reqRedirectUri || '').trim();
    const frontendBase = frontendBaseFromRedirectUri(redirectUri);

    const org = (await Agency.findBySlug(orgSlug)) || (await Agency.findByPortalUrl(orgSlug));
    if (!org) {
      return redirectToLogin(orgSlug, 'Organization not found', frontendBase);
    }

    const tokens = await exchangeCodeForTokens({ code: String(code), redirectUri });
    const idToken = tokens?.id_token || null;
    if (!idToken) {
      return redirectToLogin(orgSlug, 'Google sign-in failed (missing id_token)', frontendBase);
    }

    const oauthClient = getGoogleOAuthClient({ redirectUri });
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID
    });
    const claims = ticket?.getPayload?.() || null;
    const email = String(claims?.email || '').trim().toLowerCase();
    const emailVerified = claims?.email_verified === true || claims?.email_verified === 'true';
    const nonceOk = !verified?.nonce || String(claims?.nonce || '') === String(verified.nonce || '');
    if (!email || !emailVerified || !nonceOk) {
      return redirectToLogin(orgSlug, 'Google sign-in could not be verified', frontendBase);
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return redirectToLogin(orgSlug, 'No user account matches this Google email', frontendBase);
    }

    // Domain enforcement (multi-domain allowlist)
    const rawFlags = org?.feature_flags ?? null;
    const featureFlags =
      rawFlags && typeof rawFlags === 'string'
        ? (() => { try { return JSON.parse(rawFlags); } catch { return {}; } })()
        : (rawFlags && typeof rawFlags === 'object' ? rawFlags : {});

    const userRole = String(user.role || '').toLowerCase();
    const allowedDomains = Array.isArray(featureFlags?.googleSsoAllowedDomains)
      ? featureFlags.googleSsoAllowedDomains.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (allowedDomains.length > 0 && userRole !== 'super_admin') {
      const domain = email.includes('@') ? email.split('@')[1] : '';
      if (!domain || !allowedDomains.includes(domain)) {
        return redirectToLogin(orgSlug, 'Your Google account is not allowed for this organization', frontendBase);
      }
    }

    // Enforce org membership (unless super admin)
    if (userRole !== 'super_admin') {
      const userOrgs = await User.getAgencies(user.id);
      const ok = (userOrgs || []).some((o) => String(o?.slug || o?.portal_url || '').toLowerCase() === orgSlug || Number(o?.id) === Number(org?.id));
      if (!ok) {
        return redirectToLogin(orgSlug, 'You are not authorized to access this organization', frontendBase);
      }
    }

    // Issue session cookie + log activity
    const sessionId = crypto.randomUUID();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, sessionId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    res.cookie('authToken', token, config.authCookie.set());

    ActivityLogService.logActivity({
      actionType: 'login',
      userId: user.id,
      sessionId,
      metadata: {
        email: user.email,
        role: user.role,
        loginType: 'google_oauth',
        orgSlug
      }
    }, req);

    const url = new URL(frontendBase || config.frontendUrl);
    url.pathname = `/${orgSlug}/dashboard`;
    // Mark successful Google OAuth return so frontend can remember quick-login only after real use.
    url.searchParams.set('sso', '1');
    return res.redirect(302, url.toString());
  } catch (error) {
    next(error);
  }
};

export const passwordlessTokenLogin = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { lastName } = req.body; // Optional last name for pending users

    console.log('[passwordlessTokenLogin] Received token:', token ? `${token.substring(0, 20)}...` : 'null', 'Length:', token?.length);

    if (!token) {
      return res.status(400).json({ error: { message: 'Token is required' } });
    }

    // Validate token
    let user = await User.validatePasswordlessToken(token);
    if (!user) {
      console.log('[passwordlessTokenLogin] Token validation failed, checking if token exists in DB...');
      // Check if token exists but expired
      const pool = (await import('../config/database.js')).default;
      const [tokenRows] = await pool.execute(
        'SELECT id, passwordless_token, passwordless_token_expires_at, status FROM users WHERE passwordless_token = ?',
        [token.trim()]
      );
      
      if (tokenRows.length > 0) {
        const tokenUser = tokenRows[0];
        console.log('[passwordlessTokenLogin] Token found in DB:', {
          userId: tokenUser.id,
          status: tokenUser.status,
          expiresAt: tokenUser.passwordless_token_expires_at,
          tokenMatch: tokenUser.passwordless_token === token.trim()
        });
        
        if (tokenUser.passwordless_token_expires_at) {
          const expiresAt = new Date(tokenUser.passwordless_token_expires_at);
          const now = new Date();
          if (expiresAt < now) {
            console.log('[passwordlessTokenLogin] Token expired. Expires:', expiresAt.toISOString(), 'Now:', now.toISOString());
            return res.status(401).json({ 
              error: { 
                message: 'Token has expired. Please request a new login link.',
                code: 'TOKEN_EXPIRED',
                expiredAt: tokenUser.passwordless_token_expires_at
              } 
            });
          } else {
            console.log('[passwordlessTokenLogin] Token not expired but validation failed. Possible causes: access locked or other validation issue.');
          }
        }
      } else {
        console.log('[passwordlessTokenLogin] Token not found in database at all');
        // Check if this token belongs to a different user
        const [allTokenRows] = await pool.execute(
          'SELECT id, first_name, last_name, status, passwordless_token_expires_at FROM users WHERE passwordless_token = ?',
          [token.trim()]
        );
        if (allTokenRows.length > 0) {
          const tokenUser = allTokenRows[0];
          console.log('[passwordlessTokenLogin] Token belongs to different user:', tokenUser.id, tokenUser.first_name, tokenUser.last_name);
          return res.status(401).json({ 
            error: { 
              message: 'This login link belongs to a different user. Please use the correct link for your account.',
              code: 'TOKEN_USER_MISMATCH'
            } 
          });
        }
      }
      
      return res.status(401).json({ error: { message: 'Invalid or expired token' } });
    }
    
    console.log('[passwordlessTokenLogin] Token validated, user:', user.id, 'status:', user.status);

    // If this token is for password reset, do NOT allow direct login.
    // Reset flows must force the user to set a new password first.
    if (user.passwordless_token_purpose === 'reset') {
      const userAgencies = await User.getAgencies(user.id);
      const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
      return res.status(400).json({
        error: {
          message: 'Password reset required',
          requiresPasswordReset: true,
          portalSlug
        }
      });
    }

    // Check if user needs initial setup (no password set)
    if (!user.password_hash) {
      // User needs to set password first
      return res.status(400).json({ 
        error: { 
          message: 'Password setup required',
          requiresSetup: true,
          firstName: user.first_name
        } 
      });
    }

    // For PREHIRE_OPEN users, ALWAYS require last name verification for security
    if (user.status === 'PREHIRE_OPEN' || user.status === 'PENDING_SETUP') {
      if (!lastName) {
        return res.status(400).json({ 
          error: { 
            message: 'Last name verification required',
            requiresIdentityVerification: true
          } 
        });
      }
      
      // Validate last name
      user = await User.validatePendingIdentity(token, lastName);
      if (!user) {
        return res.status(401).json({ error: { message: 'Last name does not match' } });
      }
      
      // Mark as verified if not already (for future logins, but we'll still require it)
      if (!user.pending_identity_verified) {
        const pool = (await import('../config/database.js')).default;
        await pool.execute(
          'UPDATE users SET pending_identity_verified = TRUE WHERE id = ?',
          [user.id]
        );
      }
    }

    // Check user status and access
    const fullUser = await User.findById(user.id);
    if (!fullUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

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
    const pw = calcPasswordExpiry(fullUser);
    
    // Block ARCHIVED users
    if (fullUser.status === 'ARCHIVED') {
      return res.status(403).json({ error: { message: 'Account has been archived. Access denied.' } });
    }
    
    // Check access expiration for TERMINATED_PENDING users
    const { isAccessExpired } = await import('../utils/accessControl.js');
    if (isAccessExpired(fullUser)) {
      return res.status(403).json({ error: { message: 'Account access has expired. Please contact your administrator.' } });
    }

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Generate JWT token for session
    try {
      const jwtToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, status: user.status, sessionId },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Set secure HttpOnly cookie for authentication
      // Use shared cookie options to ensure consistency with logout
      const cookieOptions = config.authCookie.set();
      res.cookie('authToken', jwtToken, cookieOptions);

      // Get user agencies
      const userAgencies = await User.getAgencies(user.id);

      // Log login activity using centralized service
      // Note: req.user doesn't exist yet during login, so we pass userId explicitly
      ActivityLogService.logActivity({
        actionType: 'login',
        userId: user.id,
        sessionId,
        metadata: {
          email: user.email,
          role: user.role,
          loginType: 'passwordless',
          isPending: user.status === 'pending'
        }
      }, req);

      console.log('[passwordlessTokenLogin] Login successful for user:', user.id, user.first_name, user.last_name);
      res.json({
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          preferredName: fullUser?.preferred_name || user.preferred_name || null,
          role: user.role,
          status: user.status,
          requiresPasswordChange: pw.requiresPasswordChange,
          passwordExpiresAt: pw.passwordExpiresAt,
          passwordExpired: pw.passwordExpired,
          has_supervisor_privileges: !!(fullUser?.has_supervisor_privileges === true || fullUser?.has_supervisor_privileges === 1 || fullUser?.has_supervisor_privileges === '1'),
          has_provider_access: !!(fullUser?.has_provider_access === true || fullUser?.has_provider_access === 1 || fullUser?.has_provider_access === '1'),
          has_staff_access: !!(fullUser?.has_staff_access === true || fullUser?.has_staff_access === 1 || fullUser?.has_staff_access === '1'),
          skill_builder_eligible: !!(fullUser?.skill_builder_eligible === true || fullUser?.skill_builder_eligible === 1 || fullUser?.skill_builder_eligible === '1'),
          has_skill_builder_coordinator_access: !!(
            fullUser?.has_skill_builder_coordinator_access === true ||
            fullUser?.has_skill_builder_coordinator_access === 1 ||
            fullUser?.has_skill_builder_coordinator_access === '1'
          ),
          skill_builder_confirm_required_next_login: !!(
            fullUser?.skill_builder_confirm_required_next_login === true ||
            fullUser?.skill_builder_confirm_required_next_login === 1 ||
            fullUser?.skill_builder_confirm_required_next_login === '1'
          ),
          ...(await buildPayrollCaps(fullUser))
        },
        sessionId,
        agencies: userAgencies,
        requiresPasswordChange: pw.requiresPasswordChange,
        message: user.status === 'pending' 
          ? 'Login successful. Complete your pre-hire checklist.' 
          : 'Login successful. Please change your password.'
      });
    } catch (jwtError) {
      console.error('[passwordlessTokenLogin] Error generating JWT:', jwtError);
      return res.status(500).json({ 
        error: { 
          message: 'Failed to create session. Please try again.',
          code: 'JWT_ERROR'
        } 
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Passwordless login using token from request body
 * Alternative to URL param-based login for better security (tokens not in URLs)
 */
export const passwordlessTokenLoginFromBody = async (req, res, next) => {
  try {
    const { token, lastName } = req.body; // Token and optional last name from body

    console.log('[passwordlessTokenLoginFromBody] Received token:', token ? `${token.substring(0, 20)}...` : 'null', 'Length:', token?.length);

    if (!token) {
      return res.status(400).json({ error: { message: 'Token is required in request body' } });
    }

    // Reuse the same validation logic as URL param version
    // Validate token
    let user = await User.validatePasswordlessToken(token);
    if (!user) {
      console.log('[passwordlessTokenLoginFromBody] Token validation failed, checking if token exists in DB...');
      // Check if token exists but expired
      const pool = (await import('../config/database.js')).default;
      const [tokenRows] = await pool.execute(
        'SELECT id, passwordless_token, passwordless_token_expires_at, status FROM users WHERE passwordless_token = ?',
        [token.trim()]
      );
      
      if (tokenRows.length > 0) {
        const tokenUser = tokenRows[0];
        console.log('[passwordlessTokenLoginFromBody] Token found in DB:', {
          userId: tokenUser.id,
          status: tokenUser.status,
          expiresAt: tokenUser.passwordless_token_expires_at,
          tokenMatch: tokenUser.passwordless_token === token.trim()
        });
        
        if (tokenUser.passwordless_token_expires_at) {
          const expiresAt = new Date(tokenUser.passwordless_token_expires_at);
          const now = new Date();
          if (expiresAt < now) {
            console.log('[passwordlessTokenLoginFromBody] Token expired. Expires:', expiresAt.toISOString(), 'Now:', now.toISOString());
            return res.status(401).json({ 
              error: { 
                message: 'Token has expired. Please request a new login link.',
                code: 'TOKEN_EXPIRED',
                expiredAt: tokenUser.passwordless_token_expires_at
              } 
            });
          } else {
            console.log('[passwordlessTokenLoginFromBody] Token not expired but validation failed. Possible causes: access locked or other validation issue.');
          }
        }
      } else {
        console.log('[passwordlessTokenLoginFromBody] Token not found in database at all');
        // Check if this token belongs to a different user
        const [allTokenRows] = await pool.execute(
          'SELECT id, first_name, last_name, status, passwordless_token_expires_at FROM users WHERE passwordless_token = ?',
          [token.trim()]
        );
        if (allTokenRows.length > 0) {
          const tokenUser = allTokenRows[0];
          console.log('[passwordlessTokenLoginFromBody] Token belongs to different user:', tokenUser.id, tokenUser.first_name, tokenUser.last_name);
          return res.status(401).json({ 
            error: { 
              message: 'This login link belongs to a different user. Please use the correct link for your account.',
              code: 'TOKEN_USER_MISMATCH'
            } 
          });
        }
      }
      
      return res.status(401).json({ error: { message: 'Invalid or expired token' } });
    }
    
    console.log('[passwordlessTokenLoginFromBody] Token validated, user:', user.id, 'status:', user.status);

    if (user.passwordless_token_purpose === 'reset') {
      const userAgencies = await User.getAgencies(user.id);
      const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
      return res.status(400).json({
        error: {
          message: 'Password reset required',
          requiresPasswordReset: true,
          portalSlug
        }
      });
    }

    // For pending users, ALWAYS require last name verification for security
    if (user.status === 'pending') {
      if (!lastName) {
        return res.status(400).json({ 
          error: { 
            message: 'Last name verification required',
            requiresIdentityVerification: true
          } 
        });
      }
      
      // Validate last name
      user = await User.validatePendingIdentity(token, lastName);
      if (!user) {
        return res.status(401).json({ error: { message: 'Last name does not match' } });
      }
      
      // Mark as verified if not already
      if (!user.pending_identity_verified) {
        const pool = (await import('../config/database.js')).default;
        await pool.execute(
          'UPDATE users SET pending_identity_verified = TRUE WHERE id = ?',
          [user.id]
        );
      }
    }

    // Check if user is inactive (but allow pending users)
    const fullUser = await User.findById(user.id);
    if (!fullUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // For non-pending users, check if inactive
    if (fullUser.status !== 'pending' && fullUser.status !== 'ready_for_review' && (fullUser.is_active === false || fullUser.is_active === 0)) {
      return res.status(403).json({ error: { message: 'Account is inactive' } });
    }

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Generate JWT token for session
    try {
      const jwtToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, status: user.status, sessionId },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Set secure HttpOnly cookie for authentication
      // Use shared cookie options to ensure consistency with logout
      const cookieOptions = config.authCookie.set();
      res.cookie('authToken', jwtToken, cookieOptions);

      // Get user agencies
      const userAgencies = await User.getAgencies(user.id);

      // Log login activity using centralized service
      ActivityLogService.logActivity({
        actionType: 'login',
        userId: user.id,
        sessionId,
        metadata: {
          email: user.email,
          role: user.role,
          loginType: 'passwordless',
          isPending: user.status === 'pending',
          method: 'body' // Indicate this was body-based login
        }
      }, req);

      console.log('[passwordlessTokenLoginFromBody] Login successful for user:', user.id, user.first_name, user.last_name);
      
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
      const pw = calcPasswordExpiry(fullUser);
      
      const response = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          preferredName: fullUser?.preferred_name || user.preferred_name || null,
          role: user.role,
          status: user.status,
          requiresPasswordChange: pw.requiresPasswordChange,
          passwordExpiresAt: pw.passwordExpiresAt,
          passwordExpired: pw.passwordExpired,
          medcancelEnabled: ['low', 'high'].includes(String(fullUser?.medcancel_rate_schedule || '').toLowerCase()),
          medcancelRateSchedule: fullUser?.medcancel_rate_schedule || null,
          has_supervisor_privileges: !!(fullUser?.has_supervisor_privileges === true || fullUser?.has_supervisor_privileges === 1 || fullUser?.has_supervisor_privileges === '1'),
          has_provider_access: !!(fullUser?.has_provider_access === true || fullUser?.has_provider_access === 1 || fullUser?.has_provider_access === '1'),
          has_staff_access: !!(fullUser?.has_staff_access === true || fullUser?.has_staff_access === 1 || fullUser?.has_staff_access === '1'),
          skill_builder_eligible: !!(fullUser?.skill_builder_eligible === true || fullUser?.skill_builder_eligible === 1 || fullUser?.skill_builder_eligible === '1'),
          has_skill_builder_coordinator_access: !!(
            fullUser?.has_skill_builder_coordinator_access === true ||
            fullUser?.has_skill_builder_coordinator_access === 1 ||
            fullUser?.has_skill_builder_coordinator_access === '1'
          ),
          skill_builder_confirm_required_next_login: !!(
            fullUser?.skill_builder_confirm_required_next_login === true ||
            fullUser?.skill_builder_confirm_required_next_login === 1 ||
            fullUser?.skill_builder_confirm_required_next_login === '1'
          ),
          ...(await buildPayrollCaps(fullUser))
        },
        sessionId,
        agencies: userAgencies,
        requiresPasswordChange: pw.requiresPasswordChange,
        message: user.status === 'pending' 
          ? 'Login successful. Complete your pre-hire checklist.' 
          : 'Login successful. Please change your password.'
      };

      // Only include token in response if feature flag is enabled
      // Note: Feature flag will be implemented separately, check if it exists
      if (config.exposeTokenInResponse === true) {
        response.token = jwtToken;
      }

      res.json(response);
    } catch (jwtError) {
      console.error('[passwordlessTokenLoginFromBody] Error generating JWT:', jwtError);
      return res.status(500).json({ 
        error: { 
          message: 'Failed to create session. Please try again.',
          code: 'JWT_ERROR'
        } 
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Validate setup token without using it
 * Returns user info for welcome message
 */
export const validateSetupToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: { message: 'Token is required' } });
    }

    // Validate token (but don't mark as used)
    const user = await User.validatePasswordlessToken(token);
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid or expired token' } });
    }

    // Check if user already has password
    if (user.password_hash) {
      return res.status(400).json({ error: { message: 'Password already set' } });
    }

    // Return user info for welcome message
    res.json({
      firstName: user.first_name,
      lastName: user.last_name,
      preferredName: user.preferred_name || null,
      email: user.personal_email || user.email,
      username: user.username || user.personal_email || user.email
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate reset token without using it
 * Returns minimal info for reset screen (branded experience)
 */
export const validateResetToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: { message: 'Token is required' } });
    }

    const user = await User.validatePasswordlessToken(token);
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid or expired reset link' } });
    }

    if (user.passwordless_token_purpose !== 'reset') {
      return res.status(400).json({ error: { message: 'This link is not a password reset link' } });
    }

    const userAgencies = await User.getAgencies(user.id);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;

    res.json({
      firstName: user.first_name,
      portalSlug
    });
  } catch (error) {
    next(error);
  }
};

const normalizeOrgSlug = (value) => {
  const v = String(value || '').trim().toLowerCase();
  return v || null;
};

const safeGenericRecoveryResponse = (res, extra = {}) => {
  // Always return success-like response to prevent account enumeration.
  return res.json({
    ok: true,
    message: 'If the account information matches our records, you will receive an email shortly.',
    ...extra
  });
};

const pickRecoveryRecipientEmail = (user, requestedEmail = null) => {
  const requested = String(requestedEmail || '').trim().toLowerCase();
  const candidates = [
    requested || null,
    user?.email || null,
    user?.username || null,
    user?.work_email || null,
    user?.personal_email || null
  ]
    .map((v) => (v ? String(v).trim().toLowerCase() : null))
    .filter(Boolean);

  // First candidate that looks like an email.
  const emailish = candidates.find((v) => v.includes('@'));
  return emailish || null;
};

const resolveAgencyFromOrgSlug = async (orgSlug) => {
  const slug = normalizeOrgSlug(orgSlug);
  if (!slug) return null;
  return (await Agency.findByPortalUrl(slug)) || (await Agency.findBySlug(slug)) || null;
};

const resolvePrimaryAgencyForUser = async (userId, orgSlug = null) => {
  // Prefer the org login page context when provided.
  const fromSlug = await resolveAgencyFromOrgSlug(orgSlug);
  if (fromSlug) return fromSlug;

  // Otherwise, best-effort: use first agency membership.
  try {
    const agencies = await User.getAgencies(userId);
    return agencies?.[0] || null;
  } catch {
    return null;
  }
};

const getOrgAdminEmail = (agency) => {
  // Configurable override (useful for platform-level portals).
  const override = String(process.env.LOGIN_ASSISTANCE_ADMIN_EMAIL || '').trim();
  if (override) return override;

  const candidates = [
    agency?.onboarding_team_email,
    agency?.people_ops_email
  ]
    .map((v) => (v ? String(v).trim() : ''))
    .filter(Boolean);

  return candidates[0] || null;
};

const resolveRecoverySenderIdentity = async (agencyId) => {
  const a = agencyId ? Number(agencyId) : null;
  const list = await EmailSenderIdentity.list({
    agencyId: a,
    includePlatformDefaults: true,
    onlyActive: true
  });
  const preferredKeys = ['login_recovery', 'system', 'default', 'notifications'];
  for (const key of preferredKeys) {
    const hit = (list || []).find((i) => String(i?.identity_key || '').trim().toLowerCase() === key);
    if (hit) return hit;
  }
  return (list || [])[0] || null;
};

const sendRecoveryEmail = async ({
  agencyId,
  to,
  subject,
  text,
  html = null,
  source = 'auto'
}) => {
  const identity = await resolveRecoverySenderIdentity(agencyId);
  if (identity?.id) {
    return await sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to,
      subject,
      text,
      html,
      source
    });
  }
  return await EmailService.sendEmail({
    to,
    subject,
    text,
    html,
    fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
    fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
    replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
    source,
    agencyId: agencyId || null
  });
};

const notifyCurrentEmployeeRescue = async ({
  orgSlug,
  username,
  matched = false,
  method = 'password',
  ipAddress = 'unknown',
  userAgent = 'unknown'
}) => {
  try {
    const agency = await resolveAgencyFromOrgSlug(orgSlug);
    const adminEmail = getOrgAdminEmail(agency);
    if (!adminEmail) return;

    const safeUsername = String(username || '').trim().toLowerCase();
    const masked =
      safeUsername && safeUsername.includes('@')
        ? `${safeUsername.slice(0, 2)}***@${safeUsername.split('@')[1]}`
        : (safeUsername ? `${safeUsername.slice(0, 2)}***` : '(empty)');

    const subject = `Login rescue clicked (${agency?.name || orgSlug || 'unknown org'})`;
    const body = [
      'A user clicked the "Are you a current employee? Click here" login rescue button.',
      '',
      `Org slug: ${orgSlug || '(none)'}`,
      `Org name: ${agency?.name || '(unknown)'}`,
      `Entered username: ${masked}`,
      `Matched user: ${matched ? 'yes' : 'no'}`,
      `Suggested route: ${String(method || 'password')}`,
      `IP: ${ipAddress || 'unknown'}`,
      `User-Agent: ${userAgent || 'unknown'}`
    ].join('\n');

    await sendRecoveryEmail({
      agencyId: agency?.id || null,
      to: adminEmail,
      subject,
      text: body,
      html: null,
      source: 'auto'
    });
  } catch {
    // best-effort alerting; never block auth flow
  }
};

export const getRecoveryStatus = async (req, res, next) => {
  try {
    const sendingMode = await EmailService.getSendingMode().catch(() => 'unknown');
    res.json({
      ok: true,
      emailConfigured: EmailService.isConfigured(),
      sendingMode
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Public endpoint: request a password reset email.
 * Always returns a generic success response to avoid revealing whether an email exists.
 */
export const requestPasswordReset = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Keep response generic; do not leak validation details to attackers.
      return safeGenericRecoveryResponse(res);
    }

    const emailRaw = req.body?.email;
    const orgSlug = normalizeOrgSlug(req.body?.organizationSlug || req.body?.orgSlug);
    const requestedEmail = String(emailRaw || '').trim().toLowerCase();
    if (!requestedEmail) return safeGenericRecoveryResponse(res);

    const user = await User.findByEmail(requestedEmail).catch(() => null);
    if (!user?.id) return safeGenericRecoveryResponse(res);

    // If this user is under Workspace-only policy for the requested org, do not issue reset tokens.
    // Keep response generic to avoid account/policy enumeration.
    try {
      const agency = await resolvePrimaryAgencyForUser(user.id, orgSlug);
      const featureFlags = parseFeatureFlags(agency?.feature_flags ?? null);
      if (isWorkspaceEligibleForSso({ user, identifier: requestedEmail, featureFlags })) {
        return safeGenericRecoveryResponse(res);
      }
    } catch {
      // best-effort; continue with normal flow
    }

    // Generate token (single-use) with purpose 'reset'
    const expiresInHours = 48;
    const tokenResult = await User.generatePasswordlessToken(user.id, expiresInHours, 'reset');

    const agency = await resolvePrimaryAgencyForUser(user.id, orgSlug);
    const frontendBase = String(config.frontendUrl || '').replace(/\/$/, '');
    const portalSlug = agency?.portal_url || agency?.slug || orgSlug || null;
    const resetLink = portalSlug
      ? `${frontendBase}/${portalSlug}/reset-password/${tokenResult.token}`
      : `${frontendBase}/reset-password/${tokenResult.token}`;

    // Best-effort template support (falls back to simple text)
    let subject = 'Reset your password';
    let body = `We received a request to reset your password.\n\nReset your password using this link (expires in ${expiresInHours} hours):\n${resetLink}\n\nIf you did not request this, you can ignore this email.`;
    try {
      const template = await EmailTemplateService.getTemplateForAgency(agency?.id || null, 'password_reset');
      if (template?.body) {
        const params = await EmailTemplateService.collectParameters(user, agency, {
          passwordlessToken: tokenResult.token,
          senderName: 'System'
        });
        const rendered = EmailTemplateService.renderTemplate(template, params);
        subject = rendered.subject || subject;
        body = rendered.body || body;
      }
    } catch {
      // ignore
    }

    const to = pickRecoveryRecipientEmail(user, requestedEmail);
    if (!to) return safeGenericRecoveryResponse(res);

    // Log + send email (best-effort logging; public endpoint may not have generated_by_user_id)
    let comm = null;
    try {
      comm = await CommunicationLoggingService.logGeneratedCommunication({
        userId: user.id,
        agencyId: agency?.id || null,
        templateType: 'password_reset',
        templateId: null,
        subject,
        body,
        generatedByUserId: null,
        channel: 'email',
        recipientAddress: to
      });
    } catch {
      comm = null;
    }

    let sendResult = null;
    try {
      sendResult = await sendRecoveryEmail({
        agencyId: agency?.id || null,
        to,
        subject,
        text: body,
        html: null,
        source: 'auto'
      });
    } catch (e) {
      // In production: still keep response generic.
      if (process.env.NODE_ENV !== 'production') {
        return safeGenericRecoveryResponse(res, {
          debug: {
            emailConfigured: EmailService.isConfigured(),
            resetLink,
            error: String(e?.message || e)
          }
        });
      }
      return safeGenericRecoveryResponse(res);
    }

    if (comm?.id && sendResult?.id) {
      await CommunicationLoggingService.markAsSent(comm.id, sendResult.id, {
        fromEmail: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || null
      }).catch(() => {});
    }

    if (process.env.NODE_ENV !== 'production' && (sendResult?.skipped || sendResult?.reason)) {
      return safeGenericRecoveryResponse(res, {
        debug: {
          resetLink,
          sendResult
        }
      });
    }

    return safeGenericRecoveryResponse(res);
  } catch (e) {
    next(e);
  }
};

/**
 * Public endpoint: recover username by first/last/role.
 * - If exactly one match, send username to the user’s associated email.
 * - Otherwise notify the org admin (based on the login page org slug).
 * Always returns a generic success response to avoid revealing whether a user exists.
 */
export const recoverUsername = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return safeGenericRecoveryResponse(res);
    }

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const role = String(req.body?.role || '').trim().toLowerCase();
    const orgSlug = normalizeOrgSlug(req.body?.organizationSlug || req.body?.orgSlug);

    if (!firstName || !lastName || !role) return safeGenericRecoveryResponse(res);

    const matches = await User.findByName(firstName, lastName).catch(() => []);
    const filtered = (matches || []).filter((u) => String(u?.role || '').trim().toLowerCase() === role);

    if (filtered.length === 1) {
      const u = filtered[0];
      const full = await User.findById(u.id).catch(() => null);
      const username = full?.username || full?.email || full?.work_email || full?.personal_email || u?.email || null;
      const to = pickRecoveryRecipientEmail(full || u, full?.email || u?.email);
      const agency = await resolvePrimaryAgencyForUser(u.id, orgSlug);

      if (to && username) {
        const subject = 'Your username';
        const body = `Hello ${full?.first_name || firstName},\n\nYour username is:\n${username}\n\nYou can sign in here:\n${EmailTemplateService.buildPortalLoginLink(agency)}\n\nIf you did not request this email, you can ignore it.`;

        try {
          const comm = await CommunicationLoggingService.logGeneratedCommunication({
            userId: u.id,
            agencyId: agency?.id || null,
            templateType: 'username_recovery',
            templateId: null,
            subject,
            body,
            generatedByUserId: null,
            channel: 'email',
            recipientAddress: to
          }).catch(() => null);

          const sendResult = await sendRecoveryEmail({
            agencyId: agency?.id || null,
            to,
            subject,
            text: body,
            html: null,
            source: 'auto'
          });

          if (comm?.id && sendResult?.id) {
            await CommunicationLoggingService.markAsSent(comm.id, sendResult.id, {
              fromEmail: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || null
            }).catch(() => {});
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            return safeGenericRecoveryResponse(res, {
              debug: { error: String(e?.message || e), to, username }
            });
          }
        }
      }

      return safeGenericRecoveryResponse(res);
    }

    // None or multiple: notify org admin for this login page (best-effort)
    const org = await resolveAgencyFromOrgSlug(orgSlug);
    const adminEmail = getOrgAdminEmail(org);
    if (adminEmail) {
      const subject = `Login help needed: username not found (${org?.name || orgSlug || 'unknown org'})`;
      const body = [
        'A user attempted to recover their username, but no unique account match was found.',
        '',
        `First name: ${firstName}`,
        `Last name: ${lastName}`,
        `Role: ${role}`,
        `Org slug: ${orgSlug || '(none provided)'}`,
        `IP: ${req.ip || '(unknown)'}`,
        '',
        'Please assist the user with their login credentials.'
      ].join('\n');

      try {
        await EmailService.sendEmail({
          to: adminEmail,
          subject,
          text: body,
          html: null,
          fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
          fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
          replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
          source: 'auto',
          agencyId: org?.id || null
        });
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          return safeGenericRecoveryResponse(res, { debug: { adminEmail, error: String(e?.message || e) } });
        }
      }
    } else if (process.env.NODE_ENV !== 'production') {
      return safeGenericRecoveryResponse(res, {
        debug: { error: 'No admin email configured for this organization (onboarding_team_email/people_ops_email/LOGIN_ASSISTANCE_ADMIN_EMAIL).' }
      });
    }

    return safeGenericRecoveryResponse(res);
  } catch (e) {
    next(e);
  }
};

/**
 * Reset password using a single-use token.
 * This replaces the user's current password and logs them in.
 */
export const resetPasswordWithToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ error: { message: 'Token is required' } });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    }

    const user = await User.validatePasswordlessToken(token);
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid or expired reset link' } });
    }

    if (user.passwordless_token_purpose !== 'reset') {
      return res.status(400).json({ error: { message: 'This link is not a password reset link' } });
    }

    // Set new password (overwrites old password hash)
    await User.changePassword(user.id, password);

    // Best-effort: ensure user is active after reset
    try {
      const pool = (await import('../config/database.js')).default;
      await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [user.id]);
    } catch (e) {
      // ignore
    }

    // Invalidate the token so it cannot be reused
    await User.markTokenAsUsed(user.id);

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Generate JWT token for session
    const jwtToken = jwt.sign(
      { id: user.id, email: user.username || user.email, role: user.role, status: user.status, sessionId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Set secure HttpOnly cookie for authentication
    const cookieOptions = config.authCookie.set();
    res.cookie('authToken', jwtToken, cookieOptions);

    const userAgencies = await User.getAgencies(user.id);

    ActivityLogService.logActivity({
      actionType: 'login',
      userId: user.id,
      sessionId,
      metadata: {
        email: user.username || user.email,
        role: user.role,
        loginType: 'reset_password'
      }
    }, req);

    const updatedUser = await User.findById(user.id);

    res.json({
      token: jwtToken,
      user: {
        id: updatedUser.id,
        email: updatedUser.username || updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        role: updatedUser.role,
        status: updatedUser.status,
        username: updatedUser.username || updatedUser.personal_email || updatedUser.email,
        ...(await buildPayrollCaps(updatedUser))
      },
      sessionId,
      agencies: userAgencies,
      message: 'Password reset successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initial setup endpoint - sets password for first-time users
 * Single-use token expires after password is set
 */
export const initialSetup = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ error: { message: 'Token is required' } });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    }

    // Validate token
    const user = await User.validatePasswordlessToken(token);
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid or expired token' } });
    }

    // Check if user already has password
    if (user.password_hash) {
      return res.status(400).json({ error: { message: 'Password already set. Please use regular login.' } });
    }

    // Set password
    await User.changePassword(user.id, password);

    // Update status from PENDING_SETUP to PREHIRE_OPEN when password is first set
    if (user.status === 'PENDING_SETUP') {
      await User.updateStatus(user.id, 'PREHIRE_OPEN', user.id);
      console.log(`[initialSetup] User ${user.id} status updated from PENDING_SETUP to PREHIRE_OPEN`);
    }

    // Mark token as used (single-use token)
    await User.markTokenAsUsed(user.id);

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Generate JWT token for session
    const jwtToken = jwt.sign(
      { id: user.id, email: user.username || user.email, role: user.role, status: user.status, sessionId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Set secure HttpOnly cookie for authentication
    const cookieOptions = config.authCookie.set();
    res.cookie('authToken', jwtToken, cookieOptions);

    // Get user agencies
    const userAgencies = await User.getAgencies(user.id);

    // Log login activity
    ActivityLogService.logActivity({
      actionType: 'login',
      userId: user.id,
      sessionId,
      metadata: {
        email: user.username || user.email,
        role: user.role,
        loginType: 'passwordless_initial_setup',
        isPending: user.status === 'PREHIRE_OPEN' || user.status === 'PENDING_SETUP'
      }
    }, req);

    console.log('[initialSetup] Password set successfully for user:', user.id, user.first_name, user.last_name);
    
    // Get updated user data
    const updatedUser = await User.findById(user.id);
    
    res.json({
      token: jwtToken,
      user: {
        id: updatedUser.id,
        email: updatedUser.username || updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        preferredName: updatedUser.preferred_name || null,
        role: updatedUser.role,
        status: updatedUser.status,
        username: updatedUser.username || updatedUser.personal_email || updatedUser.email,
        ...(await buildPayrollCaps(updatedUser))
      },
      sessionId,
      agencies: userAgencies,
      message: 'Password set successfully. Welcome!'
    });
  } catch (error) {
    next(error);
  }
};

export const verifyPendingIdentity = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { lastName } = req.body;

    if (!token || !lastName) {
      return res.status(400).json({ error: { message: 'Token and last name are required' } });
    }

    const user = await User.validatePendingIdentity(token, lastName);
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid token or last name does not match' } });
    }

    res.json({
      verified: true,
      message: 'Identity verified successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const logActivity = async (req, res, next) => {
  try {
    const { actionType, sessionId, metadata } = req.body;
    
    // Log activity using centralized service
    ActivityLogService.logActivity({
      actionType,
      sessionId: sessionId || null,
      metadata
    }, req);
    
    res.json({ message: 'Activity logged successfully' });
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      // Use sanitized body from middleware (or sanitize if middleware not applied)
      console.error('Request body:', req.sanitizedBody || sanitizeRequestBody(req.body));
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { email, firstName, lastName, role, phoneNumber, agencyIds, organizationIds, personalEmail, billingAcknowledged, hasProviderAccess } = req.body;

    // Historically, this endpoint used `personalEmail` as the login identifier.
    // Frontend/user-manager often sends `email` instead. Support both.
    const resolvedLoginEmail = (() => {
      const v = personalEmail !== undefined && personalEmail !== null && String(personalEmail).trim()
        ? String(personalEmail).trim()
        : (email !== undefined && email !== null && String(email).trim() ? String(email).trim() : '');
      return v ? v.toLowerCase() : '';
    })();
    
    console.log('Register request body:', { email, role, agencyIds, personalEmail, resolvedLoginEmail });
    
    // Last name is required
    if (!lastName || !lastName.trim()) {
      return res.status(400).json({ error: { message: 'Last name is required' } });
    }

    // Check for users with the same name (unless bypassDuplicateCheck flag is set)
    if (!req.body.bypassDuplicateCheck && firstName && firstName.trim() && lastName && lastName.trim()) {
      const existingUsersWithName = await User.findByName(firstName.trim(), lastName.trim());
      if (existingUsersWithName && existingUsersWithName.length > 0) {
        // Return potential duplicates with their agency information
        return res.status(409).json({ 
          error: { 
            message: 'A user with this name already exists in the system.',
            code: 'DUPLICATE_NAME',
            potentialDuplicates: existingUsersWithName.map(u => ({
              id: u.id,
              firstName: u.first_name,
              lastName: u.last_name,
              email: u.email || u.work_email || 'No email',
              personalEmail: u.personal_email || null,
              role: u.role,
              status: u.status,
              agencyIds: u.agency_ids ? u.agency_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : [],
              agencyNames: u.agency_names || 'No agencies'
            }))
          } 
        });
      }
    }

    // Support users cannot create admin, super_admin, or support roles
    if (req.user && req.user.role === 'support') {
      if (role === 'admin' || role === 'super_admin' || role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot create admin, super admin, or support roles' } });
      }
    }

    // Check if login email provided and if user already exists
    if (resolvedLoginEmail) {
      const existingUser = await User.findByEmail(resolvedLoginEmail);
      if (existingUser) {
        return res.status(400).json({ error: { message: 'User with this email already exists' } });
      }
      // Also check work_email
      const existingWorkEmailUser = await User.findByWorkEmail(resolvedLoginEmail);
      if (existingWorkEmailUser) {
        return res.status(400).json({ error: { message: 'This email is already registered as a work email for another user.' } });
      }
      
      // Also check if email exists in approved_employee_emails table
      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const pool = (await import('../config/database.js')).default;
      const [existingEmployees] = await pool.execute(
        'SELECT email, agency_id FROM approved_employee_emails WHERE email = ? LIMIT 1',
        [resolvedLoginEmail]
      );
      if (existingEmployees.length > 0) {
        return res.status(400).json({ 
          error: { 
            message: 'This email is already registered as an approved employee in the system. Please use a different email or contact an administrator.' 
          } 
        });
      }
    }

    // CRITICAL: Protect superadmin email - always force super_admin role
    let finalRole = role || 'provider';
    if (resolvedLoginEmail === 'superadmin@plottwistco.com') {
      finalRole = 'super_admin';
      console.warn('⚠️  Attempted to create user with superadmin email - forcing super_admin role');
    }

    // Guardians must have a login email (portal account)
    if (String(finalRole || '').toLowerCase() === 'client_guardian' && !resolvedLoginEmail) {
      return res.status(400).json({ error: { message: 'Email is required for guardian accounts' } });
    }

    // Billing hard gate: adding an admin beyond included requires acknowledgement
    if (finalRole === 'admin' && Array.isArray(agencyIds) && agencyIds.length > 0) {
      const { getAdminAddBillingImpact } = await import('../services/adminBillingGate.service.js');
      const impacts = [];
      for (const aId of agencyIds) {
        const impact = await getAdminAddBillingImpact(parseInt(aId, 10), { deltaAdmins: 1 });
        if (impact) impacts.push({ agencyId: parseInt(aId, 10), ...impact });
      }
      if (impacts.length > 0 && billingAcknowledged !== true) {
        return res.status(409).json({
          error: { message: 'Billing acknowledgement required to add an admin beyond included limits.' },
          billingImpact: { code: 'ADMIN_OVERAGE', impacts }
        });
      }
    }
    
    // New onboarding flow: create with a temporary (expiring) password.
    // Admin will send username + temporary password; user logs in and is forced to set a new password.
    // Email is set to personalEmail initially (username will also be personalEmail).
    const tempPassword = await User.generateTemporaryPassword();
    const bcrypt = (await import('bcrypt')).default;
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const user = await User.create({
      email: resolvedLoginEmail || null, // Set email to personalEmail/email (for login compatibility)
      passwordHash: tempPasswordHash,
      firstName,
      lastName,
      phoneNumber,
      personalEmail: resolvedLoginEmail || null,
      role: finalRole,
      status: 'PENDING_SETUP' // New users start in PENDING_SETUP status
    });
    
    // Store the temp password hash + expiry marker (this is what forces /change-password)
    // Default: 48 hours
    await User.setTemporaryPassword(user.id, tempPassword, 48);

    // Login link (org-scoped if available once agencies are assigned)
    // We'll update this later once assignedAgencyIds is computed; placeholder for now:
    let portalLoginLink = `${config.frontendUrl}/login`;
    
    console.log('User created:', { id: user.id, email: user.email, workEmail: user.work_email });
    
    // Assign user to organizations if provided (agency + affiliated orgs like schools/programs/learning)
    const assignedAgencyIds = [];
    const inputOrgIds = Array.isArray(organizationIds) ? organizationIds : agencyIds;
    if (inputOrgIds && Array.isArray(inputOrgIds) && inputOrgIds.length > 0) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const OrganizationAffiliation = (await import('../models/OrganizationAffiliation.model.js')).default;

      // Expand child org selections to also include their affiliated (parent) agency.
      const expandedIds = new Set();
      for (const rawId of inputOrgIds) {
        const orgId = parseInt(rawId, 10);
        if (!orgId) continue;
        expandedIds.add(orgId);

        const org = await Agency.findById(orgId);
        const orgType = String(org?.organization_type || 'agency').toLowerCase();
        if (['school', 'program', 'learning'].includes(orgType)) {
          const parentAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
          if (parentAgencyId) {
            expandedIds.add(parseInt(parentAgencyId, 10));
          }
        }
      }

      const finalIds = Array.from(expandedIds.values()).filter((id) => Number.isFinite(id) && id > 0);
      console.log('Assigning user to organizations:', finalIds);

      // Non-super-admin: enforce that any "agency" assignments are within the requester's agencies
      if (req.user?.role && req.user.role !== 'super_admin') {
        const requesterOrgs = await User.getAgencies(req.user.id);
        const requesterOrgIds = new Set((requesterOrgs || []).map((o) => parseInt(o.id, 10)).filter(Boolean));
        // Validate agency-type orgs specifically (child orgs are allowed as long as the parent agency is allowed)
        for (const id of finalIds) {
          const org = await Agency.findById(id);
          const orgType = String(org?.organization_type || 'agency').toLowerCase();
          if (orgType === 'agency' && !requesterOrgIds.has(id)) {
            return res.status(403).json({ error: { message: 'You can only assign users to your organizations' } });
          }
        }
      }

      for (const orgId of finalIds) {
        try {
          const parsedOrgId = parseInt(orgId, 10);
          if (isNaN(parsedOrgId)) {
            console.error(`Invalid organization ID: ${orgId}`);
            continue;
          }
          console.log(`Assigning user ${user.id} to organization ${parsedOrgId}`);
          await User.assignToAgency(user.id, parsedOrgId);
          assignedAgencyIds.push(parsedOrgId);
          console.log(`Successfully assigned user ${user.id} to organization ${parsedOrgId}`);
        } catch (err) {
          console.error(`Failed to assign user to organization ${orgId}:`, err);
          console.error('Error details:', {
            message: err.message,
            code: err.code,
            sqlMessage: err.sqlMessage,
            stack: err.stack
          });
          // Continue with other agencies even if one fails
        }
      }
    } else {
      console.log('No agencies to assign or agencyIds is not an array');
    }

    // Optional: set provider-selectable capability for staff/support/admin users
    if (hasProviderAccess === true || hasProviderAccess === 'true' || hasProviderAccess === 1 || hasProviderAccess === '1') {
      try {
        await User.update(user.id, { hasProviderAccess: true });
      } catch (e) {
        // best effort; do not fail registration
      }
    }
    
    // Initialize onboarding checklist for new user
    try {
      const OnboardingChecklist = (await import('../models/OnboardingChecklist.model.js')).default;
      await OnboardingChecklist.initializeUserChecklist(user.id);
    } catch (err) {
      console.error('Failed to initialize onboarding checklist:', err);
      // Don't fail user creation if checklist initialization fails
    }
    
    // Note: Custom checklist items are now automatically available based on agency settings
    // No need to assign them during user creation - they will appear when user views their checklist

    // Generate email template for admin to copy (if template exists)
    const EmailTemplateService = (await import('../services/emailTemplate.service.js')).default;
    const EmailTemplate = (await import('../models/EmailTemplate.model.js')).default;
    const generatedEmails = [];
    
    // Get agency info for branding
    let agencyName = 'Your Agency';
    let peopleOpsEmail = 'support@example.com';
    let agency = null;
    if (assignedAgencyIds.length > 0) {
      const Agency = (await import('../models/Agency.model.js')).default;
      agency = await Agency.findById(assignedAgencyIds[0]);
      if (agency) {
        agencyName = agency.name;
        peopleOpsEmail = agency.people_ops_email || peopleOpsEmail;
        const portalSlug = agency.portal_url || agency.slug || null;
        if (portalSlug) {
          portalLoginLink = `${String(config.frontendUrl || '').replace(/\/\s*$/, '')}/${portalSlug}/login`;
        }
      }
    }
    
    // Try to get the pending_welcome template (agency-specific or platform default)
    try {
      const template = await EmailTemplateService.getTemplateForAgency(
        assignedAgencyIds.length > 0 ? assignedAgencyIds[0] : null,
        'pending_welcome'
      );
      
      if (template && template.body) {
        const parameters = {
          FIRST_NAME: firstName || '',
          LAST_NAME: lastName || '',
          AGENCY_NAME: agencyName,
          PORTAL_LOGIN_LINK: portalLoginLink,
          PORTAL_URL: config.frontendUrl,
          USERNAME: resolvedLoginEmail || 'N/A (Work email will be set when moved to active)',
          TEMP_PASSWORD: tempPassword,
          PEOPLE_OPS_EMAIL: peopleOpsEmail,
          SENDER_NAME: req.user?.firstName || 'Administrator'
        };
        
        const rendered = EmailTemplateService.renderTemplate(template, parameters);
        generatedEmails.push({
          type: 'Pending Welcome',
          subject: rendered.subject || 'Your Pre-Hire Access Link',
          body: rendered.body
        });
      }
    } catch (err) {
      // Template doesn't exist or error rendering - don't fail user creation
      console.warn('Could not generate pending welcome email template:', err.message);
      // Still include basic info in response
      generatedEmails.push({
        type: 'Pending Welcome',
        subject: 'Your Pre-Hire Access Link',
        body: `Hello ${firstName || ''} ${lastName || ''},\n\nHere are your login credentials:\n\nUsername: ${resolvedLoginEmail || ''}\nTemporary Password: ${tempPassword}\n\nLogin here: ${portalLoginLink}\n\nYou will be prompted to set a new password after logging in.\n\nPlease contact ${peopleOpsEmail} if you have any questions.`
      });
    }
    
    // Log generated emails to user_communications
    if (generatedEmails.length > 0 && assignedAgencyIds.length > 0) {
      try {
        const UserCommunication = (await import('../models/UserCommunication.model.js')).default;
        for (const email of generatedEmails) {
          await UserCommunication.create({
            userId: user.id,
            agencyId: assignedAgencyIds[0],
            templateType: 'pending_welcome',
            templateId: null, // Template ID not available in this context
            subject: email.subject,
            body: email.body,
            generatedByUserId: req.user.id,
            channel: 'email',
            recipientAddress: personalEmail || email || null, // May be null for pending users
            deliveryStatus: 'pending' // Will be updated when email API sends it
          });
        }
      } catch (logError) {
        // Don't fail the request if logging fails
        console.error('Failed to log communication:', logError);
      }
    }

    res.status(201).json({
      message: 'User created successfully in pending status.',
      user: {
        id: user.id,
        email: user.email, // This will be null for pending users
        workEmail: user.work_email,
        personalEmail: user.personal_email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status
      },
      temporaryPassword: tempPassword,
      portalLoginLink,
      generatedEmails
    });
  } catch (error) {
    console.error('Error in register controller:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      stack: error.stack,
      body: req.body
    });
    next(error);
  }
};

