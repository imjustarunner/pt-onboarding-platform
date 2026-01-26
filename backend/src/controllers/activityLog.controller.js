import UserActivityLog from '../models/UserActivityLog.model.js';
import User from '../models/User.model.js';

/**
 * Check if the requesting user has permission to view activity for the target user
 */
const checkActivityLogPermission = async (req, targetUserId) => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      console.error('[checkActivityLogPermission] Missing user in request');
      return false;
    }

    const requestingUserId = req.user.id;
    const requestingRole = req.user.role;
    const targetUserIdInt = parseInt(targetUserId);
    const requestingUserIdInt = parseInt(requestingUserId);

    if (isNaN(targetUserIdInt) || isNaN(requestingUserIdInt)) {
      console.error('[checkActivityLogPermission] Invalid user IDs:', { targetUserId, requestingUserId });
      return false;
    }

    // Users can always view their own activity
    if (requestingUserIdInt === targetUserIdInt) {
      return true;
    }

    // Get requesting user to check supervisor status
    let requestingUser;
    try {
      requestingUser = await User.findById(requestingUserIdInt);
    } catch (err) {
      console.error('[checkActivityLogPermission] Error fetching requesting user:', err);
      return false;
    }

    if (!requestingUser) {
      console.log('[checkActivityLogPermission] Requesting user not found:', requestingUserIdInt);
      return false;
    }

    // Check if requesting user is a supervisor using boolean as source of truth
    const isRequestingSupervisor = User.isSupervisor(requestingUser);
    
    // Only supervisors, CPAs, admin, super_admin, and support can view other users' activity
    if (!isRequestingSupervisor && !['clinical_practice_assistant', 'admin', 'super_admin', 'support'].includes(requestingRole)) {
      return false;
    }

    // Super admin can view all users
    if (requestingRole === 'super_admin') {
      return true;
    }

    // Get target user to check their role and agencies
    let targetUser;
    try {
      targetUser = await User.findById(targetUserIdInt);
    } catch (err) {
      console.error('[checkActivityLogPermission] Error fetching target user:', err);
      return false;
    }

    if (!targetUser) {
      console.log('[checkActivityLogPermission] Target user not found:', targetUserIdInt);
      return false;
    }

    // Supervisors can only view activity for assigned supervisees
    if (isRequestingSupervisor) {
      try {
        // Check if supervisor has access to this user (is assigned)
        const supervisorAgencies = await User.getAgencies(requestingUserIdInt);
        for (const agency of supervisorAgencies) {
          const hasAccess = await User.supervisorHasAccess(requestingUserIdInt, targetUserIdInt, agency.id);
          if (hasAccess) {
            return true;
          }
        }
        return false;
      } catch (err) {
        console.error('[checkActivityLogPermission] Error checking supervisor access:', err);
        return false;
      }
    }

    // CPAs can view activity for all users in their agencies
    if (requestingRole === 'clinical_practice_assistant') {
      try {
        if (!['staff', 'provider', 'school_staff', 'facilitator', 'intern'].includes(targetUser.role)) {
          return false;
        }
        // Check if CPA and target user share an agency
        const requestingUserAgencies = await User.getAgencies(requestingUserIdInt);
        const targetUserAgencies = await User.getAgencies(targetUserIdInt);
        
        const requestingAgencyIds = requestingUserAgencies.map(a => a.id);
        const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
        const sharedAgencies = requestingAgencyIds.filter(id => targetUserAgencyIds.includes(id));

        return sharedAgencies.length > 0;
      } catch (err) {
        console.error('[checkActivityLogPermission] Error checking CPA access:', err);
        return false;
      }
    }

    // Admin and support: check if requesting user and target user share an agency
    try {
      const requestingUserAgencies = await User.getAgencies(requestingUserIdInt);
      const targetUserAgencies = await User.getAgencies(targetUserIdInt);
      
      const requestingAgencyIds = requestingUserAgencies.map(a => a.id);
      const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
      const sharedAgencies = requestingAgencyIds.filter(id => targetUserAgencyIds.includes(id));

      return sharedAgencies.length > 0;
    } catch (err) {
      console.error('[checkActivityLogPermission] Error checking admin/support access:', err);
      return false;
    }
  } catch (error) {
    console.error('[checkActivityLogPermission] Unexpected error:', error);
    console.error('[checkActivityLogPermission] Error stack:', error.stack);
    return false;
  }
};

/**
 * Get activity log for a specific user
 */
export const getUserActivityLog = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);
    const { actionType, startDate, endDate, limit = 100 } = req.query;

    if (isNaN(userIdInt)) {
      return res.status(400).json({ 
        error: { message: 'Invalid user ID' } 
      });
    }

    console.log(`[getUserActivityLog] Requesting user: ${req.user.id} (${req.user.role}), Target user: ${userIdInt}`);

    // Check permission
    let hasPermission = false;
    try {
      hasPermission = await checkActivityLogPermission(req, userIdInt);
      console.log(`[getUserActivityLog] Permission check result: ${hasPermission}`);
    } catch (permError) {
      console.error('[getUserActivityLog] Error in permission check:', permError);
      return res.status(500).json({ 
        error: { message: 'Error checking permissions', details: permError.message } 
      });
    }

    if (!hasPermission) {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to view this user\'s activity log' } 
      });
    }

    const filters = {
      userId: userIdInt,
      actionType: actionType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: parseInt(limit) || 100
    };

    console.log(`[getUserActivityLog] Fetching activity log with filters:`, filters);
    let activityLog;
    try {
      activityLog = await UserActivityLog.getActivityForUser(userIdInt, filters);
      console.log(`[getUserActivityLog] Successfully fetched ${activityLog.length} activity log entries`);
    } catch (dbError) {
      console.error('[getUserActivityLog] Database error:', dbError);
      console.error('[getUserActivityLog] Database error details:', {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
        sqlMessage: dbError.sqlMessage,
        sql: dbError.sql
      });
      
      // If it's a column error, return empty array
      if (dbError.code === 'ER_BAD_FIELD_ERROR') {
        console.warn('[getUserActivityLog] Missing database columns, returning empty log');
        activityLog = [];
      } else {
        // For other errors, re-throw to be caught by outer catch
        throw dbError;
      }
    }

    res.json(activityLog);
  } catch (error) {
    console.error('[getUserActivityLog] Unexpected error:', error);
    console.error('[getUserActivityLog] Error stack:', error.stack);
    console.error('[getUserActivityLog] Error details:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      message: error.message
    });
    
    // Return empty array instead of error to prevent UI crash
    // But log the error for debugging
    res.status(200).json([]);
  }
};

/**
 * Get activity summary for a specific user
 */
export const getActivitySummary = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);

    console.log(`[getActivitySummary] Requesting user: ${req.user?.id} (${req.user?.role}), Target user: ${userIdInt}`);

    if (isNaN(userIdInt)) {
      return res.status(400).json({ 
        error: { message: 'Invalid user ID' } 
      });
    }

    // Check permission
    let hasPermission = false;
    try {
      hasPermission = await checkActivityLogPermission(req, userIdInt);
      console.log(`[getActivitySummary] Permission check result: ${hasPermission}`);
    } catch (permError) {
      console.error('[getActivitySummary] Error in permission check:', permError);
      return res.status(500).json({ 
        error: { message: 'Error checking permissions', details: permError.message } 
      });
    }

    if (!hasPermission) {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to view this user\'s activity summary' } 
      });
    }

    console.log(`[getActivitySummary] Fetching summary for user: ${userIdInt}`);
    let summary;
    try {
      summary = await UserActivityLog.getActivitySummary(userIdInt);
      console.log(`[getActivitySummary] Summary data:`, summary);
    } catch (dbError) {
      console.error('[getActivitySummary] Database error:', dbError);
      console.error('[getActivitySummary] Database error details:', {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
        sqlMessage: dbError.sqlMessage,
        sql: dbError.sql
      });
      
      // Return default summary instead of error
      summary = {
        totalLogins: 0,
        firstLogin: null,
        lastLogin: null,
        totalModuleTimeSeconds: 0,
        totalSessionTimeSeconds: 0
      };
    }

    res.json(summary);
  } catch (error) {
    console.error('[getActivitySummary] Unexpected error:', error);
    console.error('[getActivitySummary] Error stack:', error.stack);
    
    // Return default summary instead of error to prevent UI crash
    res.status(200).json({
      totalLogins: 0,
      firstLogin: null,
      lastLogin: null,
      totalModuleTimeSeconds: 0,
      totalSessionTimeSeconds: 0
    });
  }
};

/**
 * Get module time breakdown for a specific user
 */
export const getModuleTimeBreakdown = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);

    // Check permission
    const hasPermission = await checkActivityLogPermission(req, userIdInt);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to view this user\'s module time breakdown' } 
      });
    }

    const breakdown = await UserActivityLog.getModuleTimeBreakdown(userIdInt);

    res.json(breakdown);
  } catch (error) {
    console.error('Error in getModuleTimeBreakdown:', error);
    next(error);
  }
};
