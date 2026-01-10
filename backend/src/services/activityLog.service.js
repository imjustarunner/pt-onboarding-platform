import UserActivityLog from '../models/UserActivityLog.model.js';
import User from '../models/User.model.js';

/**
 * Centralized service for logging user activities
 * Provides consistent, non-blocking activity logging across the application
 */
class ActivityLogService {
  /**
   * Extract user context from request object
   * @param {Object} req - Express request object
   * @returns {Object} Context object with userId, agencyId, ipAddress, userAgent, sessionId
   */
  static extractContext(req) {
    const context = {
      userId: null,
      agencyId: null,
      ipAddress: null,
      userAgent: null,
      sessionId: null
    };

    // Extract user ID from authenticated user
    // req.user is set by the authenticate middleware
    if (req.user && req.user.id) {
      context.userId = req.user.id;
      context.sessionId = req.user.sessionId || null;
    }

    // Extract IP address
    context.ipAddress = req.ip || 
                       req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                       req.connection?.remoteAddress || 
                       'unknown';

    // Extract user agent
    context.userAgent = req.headers['user-agent'] || 'unknown';

    return context;
  }

  /**
   * Get user's primary agency ID
   * @param {number} userId - User ID
   * @returns {Promise<number|null>} Primary agency ID or null
   */
  static async getPrimaryAgencyId(userId) {
    if (!userId) return null;
    
    try {
      const agencies = await User.getAgencies(userId);
      if (agencies && agencies.length > 0) {
        return agencies[0].id;
      }
    } catch (err) {
      console.error('[ActivityLogService] Failed to get user agencies:', err);
    }
    
    return null;
  }

  /**
   * Validate activity data
   * @param {Object} data - Activity data to validate
   * @returns {Object} Validation result with isValid and errors
   */
  static validateActivityData(data) {
    const errors = [];

    // actionType is required
    if (!data.actionType || typeof data.actionType !== 'string') {
      errors.push('actionType is required and must be a string');
    }

    // Validate actionType is one of the allowed values
    const allowedActionTypes = [
      'login',
      'logout',
      'timeout',
      'module_start',
      'module_end',
      'module_complete',
      'password_change'
    ];
    
    if (data.actionType && !allowedActionTypes.includes(data.actionType)) {
      errors.push(`actionType must be one of: ${allowedActionTypes.join(', ')}`);
    }

    // userId should be a number if provided
    if (data.userId !== null && data.userId !== undefined && typeof data.userId !== 'number') {
      errors.push('userId must be a number or null');
    }

    // moduleId should be a number if provided (for module-related actions)
    if (data.moduleId !== null && data.moduleId !== undefined && typeof data.moduleId !== 'number') {
      errors.push('moduleId must be a number or null');
    }

    // durationSeconds should be a number if provided
    if (data.durationSeconds !== null && data.durationSeconds !== undefined && typeof data.durationSeconds !== 'number') {
      errors.push('durationSeconds must be a number or null');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Log user activity (async, non-blocking)
   * @param {Object} activityData - Activity data
   * @param {string} activityData.actionType - Type of activity (login, logout, module_start, etc.)
   * @param {number|null} activityData.userId - User ID (optional, will be extracted from req if not provided)
   * @param {number|null} activityData.agencyId - Agency ID (optional, will be fetched if not provided)
   * @param {string|null} activityData.ipAddress - IP address (optional, will be extracted from req if not provided)
   * @param {string|null} activityData.userAgent - User agent (optional, will be extracted from req if not provided)
   * @param {string|null} activityData.sessionId - Session ID (optional, will be extracted from req if not provided)
   * @param {number|null} activityData.moduleId - Module ID (for module-related activities)
   * @param {number|null} activityData.durationSeconds - Duration in seconds (for timed activities)
   * @param {Object|null} activityData.metadata - Additional metadata (will be JSON stringified)
   * @param {Object} req - Express request object (optional, used to extract context)
   * @returns {Promise<void>}
   */
  static logActivity(activityData, req = null) {
    // Make this non-async at the top level, handle async internally
    console.log(`[ActivityLogService] logActivity called for actionType: ${activityData?.actionType}`);
    
    if (!activityData || !activityData.actionType) {
      console.error('[ActivityLogService] Invalid activityData provided:', activityData);
      return;
    }
    
    // Execute all async operations in a single IIFE
    (async () => {
      try {
        // Extract context from request if provided
        let context = {};
        if (req) {
          context = this.extractContext(req);
        }

        // Merge provided data with extracted context (provided data takes precedence)
        const finalData = {
          actionType: activityData.actionType,
          userId: activityData.userId !== undefined ? activityData.userId : context.userId,
          agencyId: activityData.agencyId !== undefined ? activityData.agencyId : context.agencyId,
          ipAddress: activityData.ipAddress !== undefined ? activityData.ipAddress : context.ipAddress,
          userAgent: activityData.userAgent !== undefined ? activityData.userAgent : context.userAgent,
          sessionId: activityData.sessionId !== undefined ? activityData.sessionId : context.sessionId,
          moduleId: activityData.moduleId !== undefined ? activityData.moduleId : null,
          durationSeconds: activityData.durationSeconds !== undefined ? activityData.durationSeconds : null,
          metadata: activityData.metadata || null
        };

        // Get agency ID if not provided but userId is available
        if (!finalData.agencyId && finalData.userId) {
          finalData.agencyId = await this.getPrimaryAgencyId(finalData.userId);
          console.log(`[ActivityLogService] Resolved agencyId: ${finalData.agencyId} for userId: ${finalData.userId}`);
        }

        console.log(`[ActivityLogService] Final data before validation:`, {
          actionType: finalData.actionType,
          userId: finalData.userId,
          agencyId: finalData.agencyId,
          hasIpAddress: !!finalData.ipAddress,
          hasUserAgent: !!finalData.userAgent,
          sessionId: finalData.sessionId
        });

        // Validate the activity data
        const validation = this.validateActivityData(finalData);
        if (!validation.isValid) {
          console.error('[ActivityLogService] Invalid activity data:', validation.errors);
          console.error('[ActivityLogService] Activity data:', finalData);
          return; // Don't log invalid data
        }
        
        console.log(`[ActivityLogService] Validation passed, inserting into database`);

        // Insert into database
        console.log(`[ActivityLogService] Attempting to log ${finalData.actionType} for user ${finalData.userId || 'unknown'}`);
        const result = await UserActivityLog.logActivity(finalData);
        console.log(`[ActivityLogService] ✅ Successfully logged ${finalData.actionType} activity for user ${finalData.userId || 'unknown'}, ID: ${result?.id || 'unknown'}`);
      } catch (err) {
        // Log error but don't throw - activity logging should never break the main functionality
        console.error('[ActivityLogService] ❌ Failed to log activity:', err);
        console.error('[ActivityLogService] Error details:', {
          message: err.message,
          code: err.code,
          errno: err.errno,
          sqlState: err.sqlState,
          sqlMessage: err.sqlMessage,
          stack: err.stack
        });
      }
    })().catch(err => {
      // Catch any unhandled errors in the async IIFE
      console.error('[ActivityLogService] Unhandled error in async logging:', err);
    });
  }
}

export default ActivityLogService;
