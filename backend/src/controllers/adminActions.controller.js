import User from '../models/User.model.js';
import UserProgress from '../models/UserProgress.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import UserActivityLog from '../models/UserActivityLog.model.js';
import { validationResult } from 'express-validator';

export const resetModule = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { userId, moduleId, agencyId } = req.body;
    const actorUserId = req.user.id;

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(actorUserId);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    // Delete quiz attempts
    await QuizAttempt.deleteAttempts(parseInt(userId), parseInt(moduleId));

    // Reset progress
    await UserProgress.resetModule(parseInt(userId), parseInt(moduleId), actorUserId);

    // Log action
    await AdminAuditLog.logAction({
      actionType: 'reset_module',
      actorUserId,
      targetUserId: parseInt(userId),
      moduleId: parseInt(moduleId),
      agencyId: parseInt(agencyId),
      metadata: {
        moduleTitle: 'Module reset by admin'
      }
    });

    res.json({ message: 'Module reset successfully' });
  } catch (error) {
    next(error);
  }
};

export const resetTrack = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { userId, trackId, agencyId } = req.body;
    const actorUserId = req.user.id;

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(actorUserId);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    // Get all modules in the track
    const modules = await TrainingTrack.getModules(parseInt(trackId));
    let resetCount = 0;

    // Reset each module
    for (const module of modules) {
      await QuizAttempt.deleteAttempts(parseInt(userId), module.id);
      await UserProgress.resetModule(parseInt(userId), module.id, actorUserId);
      resetCount++;
    }

    // Log action
    await AdminAuditLog.logAction({
      actionType: 'reset_track',
      actorUserId,
      targetUserId: parseInt(userId),
      trackId: parseInt(trackId),
      agencyId: parseInt(agencyId),
      metadata: {
        modulesReset: resetCount,
        trackName: 'Track reset by admin'
      }
    });

    res.json({ 
      message: 'Track reset successfully',
      modulesReset: resetCount
    });
  } catch (error) {
    next(error);
  }
};

export const markModuleComplete = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { userId, moduleId, agencyId } = req.body;
    const actorUserId = req.user.id;

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(actorUserId);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    // Mark module complete
    await UserProgress.markComplete(parseInt(userId), parseInt(moduleId), actorUserId);

    // Log action
    await AdminAuditLog.logAction({
      actionType: 'mark_module_complete',
      actorUserId,
      targetUserId: parseInt(userId),
      moduleId: parseInt(moduleId),
      agencyId: parseInt(agencyId),
      metadata: {
        moduleTitle: 'Module marked complete by admin'
      }
    });

    res.json({ message: 'Module marked as complete' });
  } catch (error) {
    next(error);
  }
};

export const markTrackComplete = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { userId, trackId, agencyId } = req.body;
    const actorUserId = req.user.id;

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(actorUserId);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    // Get all modules in the track
    const modules = await TrainingTrack.getModules(parseInt(trackId));
    let completedCount = 0;

    // Mark each module complete
    for (const module of modules) {
      await UserProgress.markComplete(parseInt(userId), module.id, actorUserId);
      completedCount++;
    }

    // Log action
    await AdminAuditLog.logAction({
      actionType: 'mark_track_complete',
      actorUserId,
      targetUserId: parseInt(userId),
      trackId: parseInt(trackId),
      agencyId: parseInt(agencyId),
      metadata: {
        modulesCompleted: completedCount,
        trackName: 'Track marked complete by admin'
      }
    });

    res.json({ 
      message: 'Track marked as complete',
      modulesCompleted: completedCount
    });
  } catch (error) {
    next(error);
  }
};

export const getAuditLog = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { userId, actionType, startDate, endDate, limit, includeActivity } = req.query;

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    const limitNum = limit ? parseInt(limit) : 100;
    
    // Get admin audit log
    const adminAuditLog = await AdminAuditLog.getAuditLog(parseInt(agencyId), {
      userId: userId ? parseInt(userId) : null,
      actionType: actionType || null,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: limitNum
    });

    // If includeActivity is true or not specified, also get user activity logs
    let activityLog = [];
    if (includeActivity !== 'false') {
      // Map admin action types to activity types for filtering
      const activityTypeMap = {
        'reset_module': null,
        'reset_track': null,
        'mark_module_complete': null,
        'mark_track_complete': null
      };
      
      // Only filter by actionType if it's an activity type (login, logout, timeout)
      let activityActionType = null;
      if (actionType && ['login', 'logout', 'timeout', 'page_view', 'api_call'].includes(actionType)) {
        activityActionType = actionType;
      }
      
      activityLog = await UserActivityLog.getActivityForAgency(parseInt(agencyId), {
        userId: userId ? parseInt(userId) : null,
        actionType: activityActionType,
        startDate: startDate || null,
        endDate: endDate || null,
        limit: limitNum
      });
    }

    // Combine and sort by created_at
    const combinedLog = [
      ...adminAuditLog.map(entry => ({
        ...entry,
        logType: 'admin_action',
        action_type: entry.action_type
      })),
      ...activityLog.map(entry => ({
        ...entry,
        logType: 'user_activity',
        action_type: entry.action_type,
        // Map activity log fields to match admin audit log structure
        actor_user_id: entry.user_id,
        target_user_id: entry.user_id,
        actor_first_name: entry.user_first_name,
        actor_last_name: entry.user_last_name,
        actor_email: entry.user_email,
        target_first_name: entry.user_first_name,
        target_last_name: entry.user_last_name,
        target_email: entry.user_email
      }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limitNum);

    res.json(combinedLog);
  } catch (error) {
    next(error);
  }
};

