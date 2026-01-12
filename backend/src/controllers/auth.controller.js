import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import User from '../models/User.model.js';
import UserActivityLog from '../models/UserActivityLog.model.js';
import ActivityLogService from '../services/activityLog.service.js';
import config from '../config/config.js';

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
        agencyIds: agencyIds // Include all agency IDs in response
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

    const { email, password } = req.body;

    let user;
    try {
      // Try to find by email first (which also checks username now)
      user = await User.findByEmail(email);
      // If not found by email, try username field specifically
      if (!user) {
        user = await User.findByUsername(email);
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
      if (dbError.code === 'ER_ACCESS_DENIED_ERROR' || dbError.code === 'ECONNREFUSED' || dbError.code === 'ETIMEDOUT') {
        return res.status(503).json({ 
          error: { 
            message: 'Database connection error. Please contact support if this persists.',
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

    // Verify password
    if (!user.password_hash) {
      return res.status(401).json({ 
        error: { 
          message: 'Please complete your account setup first. Use the passwordless login link sent to your email.',
          requiresSetup: true
        } 
      });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
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

    const responseData = {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        firstName: user.first_name,
        lastName: user.last_name,
        username: user.username || user.email
      },
      sessionId
    };
    
    console.log('Login successful for user:', user.email, 'Session ID:', sessionId);
    res.json(responseData);
  } catch (error) {
    next(error);
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
          role: user.role,
          status: user.status
        },
        sessionId,
        agencies: userAgencies,
        requiresPasswordChange: user.status !== 'pending', // Pending users don't need password change
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
      
      const response = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          status: user.status
        },
        sessionId,
        agencies: userAgencies,
        requiresPasswordChange: user.status !== 'pending',
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
      email: user.personal_email || user.email,
      username: user.username || user.personal_email || user.email
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
        role: updatedUser.role,
        status: updatedUser.status,
        username: updatedUser.username || updatedUser.personal_email || updatedUser.email
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

    const { email, firstName, lastName, role, phoneNumber, agencyIds, personalEmail } = req.body;
    
    console.log('Register request body:', { email, role, agencyIds, personalEmail });
    
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

    // Check if email provided and if user already exists
    if (email) {
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: { message: 'User with this email already exists' } });
      }
      // Also check work_email
      const existingWorkEmailUser = await User.findByWorkEmail(email);
      if (existingWorkEmailUser) {
        return res.status(400).json({ error: { message: 'This email is already registered as a work email for another user.' } });
      }
      
      // Also check if email exists in approved_employee_emails table
      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const pool = (await import('../config/database.js')).default;
      const [existingEmployees] = await pool.execute(
        'SELECT email, agency_id FROM approved_employee_emails WHERE email = ? LIMIT 1',
        [email]
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
    let finalRole = role || 'clinician';
    if (email === 'superadmin@plottwistco.com') {
      finalRole = 'super_admin';
      console.warn('⚠️  Attempted to create user with superadmin email - forcing super_admin role');
    }
    
    // For PENDING_SETUP users: NO temporary password, only passwordless token
    // Create user without password (PENDING_SETUP users use passwordless access only)
    // Email is set to personalEmail initially (username will also be personalEmail)
    const user = await User.create({
      email: personalEmail, // Set email to personalEmail initially (for login compatibility)
      passwordHash: null, // No password for PENDING_SETUP users - they'll set it via initial setup
      firstName,
      lastName,
      phoneNumber,
      personalEmail: personalEmail, // Required - this is the personal email
      role: finalRole,
      status: 'PENDING_SETUP' // New users start in PENDING_SETUP status
    });
    
    // Do NOT set temporary password for pending users
    // Generate passwordless login token (7 days expiration for pending users)
    // This token will be used for initial setup (password creation)
    const passwordlessTokenResult = await User.generatePasswordlessToken(user.id, 7 * 24); // 7 days in hours
    // Link goes to passwordless-login which will redirect to initial-setup if password not set
    const passwordlessTokenLink = `${config.frontendUrl}/passwordless-login/${passwordlessTokenResult.token}`;
    
    console.log('User created:', { id: user.id, email: user.email, workEmail: user.work_email });
    
    // Assign user to agencies if provided
    const assignedAgencyIds = [];
    if (agencyIds && Array.isArray(agencyIds) && agencyIds.length > 0) {
      console.log('Assigning user to agencies:', agencyIds);
      for (const agencyId of agencyIds) {
        try {
          const parsedAgencyId = parseInt(agencyId);
          if (isNaN(parsedAgencyId)) {
            console.error(`Invalid agency ID: ${agencyId}`);
            continue;
          }
          console.log(`Assigning user ${user.id} to agency ${parsedAgencyId}`);
          await User.assignToAgency(user.id, parsedAgencyId);
          assignedAgencyIds.push(parsedAgencyId);
          console.log(`Successfully assigned user ${user.id} to agency ${parsedAgencyId}`);
        } catch (err) {
          console.error(`Failed to assign user to agency ${agencyId}:`, err);
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
          PORTAL_LOGIN_LINK: passwordlessTokenLink,
          PORTAL_URL: config.frontendUrl,
          USERNAME: personalEmail || email || 'N/A (Work email will be set when moved to active)',
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
        body: `Hello ${firstName || ''} ${lastName || ''},\n\nYour pre-hire access link: ${passwordlessTokenLink}\n\nPlease contact ${peopleOpsEmail} if you have any questions.`
      });
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
      passwordlessToken: passwordlessTokenResult.token,
      passwordlessTokenLink: passwordlessTokenLink,
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

