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
   * Validate activity data.
   *
   * Historical note: this method used to enforce a hardcoded whitelist of ~20
   * action types. That silently blocked every other action the codebase emits
   * (school portal views, SMS, call, ROI, client, document, payroll, task, and
   * billing events) before they ever reached the database. Combined with the
   * ENUM column in user_activity_log (see migration 738), audit coverage was
   * effectively limited to auth + training + a few AI surfaces.
   *
   * The canonical list of human-readable labels lives in
   * backend/src/config/auditActionRegistry.js and the frontend mirror; new
   * action types are added there. This validator only enforces shape + size
   * to prevent SQL/ENUM errors and injection of unreasonable values.
   */
  static validateActivityData(data) {
    const errors = [];

    if (!data.actionType || typeof data.actionType !== 'string') {
      errors.push('actionType is required and must be a string');
    } else {
      const at = data.actionType.trim();
      if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(at)) {
        errors.push('actionType must start with a letter and contain only letters, digits, or underscores (max 100 chars)');
      }
    }

    if (data.userId !== null && data.userId !== undefined && typeof data.userId !== 'number') {
      errors.push('userId must be a number or null');
    }

    if (data.moduleId !== null && data.moduleId !== undefined && typeof data.moduleId !== 'number') {
      errors.push('moduleId must be a number or null');
    }

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
    if (!activityData || !activityData.actionType) {
      console.error('[ActivityLogService] Invalid activityData provided:', activityData);
      return;
    }

    (async () => {
      try {
        let context = {};
        if (req) context = this.extractContext(req);

        const finalData = {
          actionType: String(activityData.actionType || '').trim(),
          userId: activityData.userId !== undefined ? activityData.userId : context.userId,
          agencyId: activityData.agencyId !== undefined ? activityData.agencyId : context.agencyId,
          ipAddress: activityData.ipAddress !== undefined ? activityData.ipAddress : context.ipAddress,
          userAgent: activityData.userAgent !== undefined ? activityData.userAgent : context.userAgent,
          sessionId: activityData.sessionId !== undefined ? activityData.sessionId : context.sessionId,
          moduleId: activityData.moduleId !== undefined ? activityData.moduleId : null,
          durationSeconds: activityData.durationSeconds !== undefined ? activityData.durationSeconds : null,
          metadata: activityData.metadata || null
        };

        if (!finalData.agencyId && finalData.userId) {
          finalData.agencyId = await this.getPrimaryAgencyId(finalData.userId);
        }

        const validation = this.validateActivityData(finalData);
        if (!validation.isValid) {
          console.error('[ActivityLogService] Invalid activity data:', validation.errors, {
            actionType: finalData.actionType,
            userId: finalData.userId
          });
          return;
        }

        await UserActivityLog.logActivity(finalData);
      } catch (err) {
        console.error('[ActivityLogService] Failed to log activity:', {
          actionType: activityData?.actionType,
          message: err?.message,
          code: err?.code,
          errno: err?.errno,
          sqlState: err?.sqlState,
          sqlMessage: err?.sqlMessage
        });
        if (
          Number(err?.errno) === 1265 &&
          String(err?.sqlMessage || err?.message || '').includes('action_type')
        ) {
          console.error(
            '[ActivityLogService] user_activity_log.action_type rejected this value. ' +
              'Apply migration 738 (user_activity_log_action_type_varchar) on this database.'
          );
        }
      }
    })().catch((err) => {
      console.error('[ActivityLogService] Unhandled error in async logging:', err);
    });
  }
}

export default ActivityLogService;
