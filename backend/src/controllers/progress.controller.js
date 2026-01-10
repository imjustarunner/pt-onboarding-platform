import UserProgress from '../models/UserProgress.model.js';
import TimeLog from '../models/TimeLog.model.js';
import Task from '../models/Task.model.js';
import ActivityLogService from '../services/activityLog.service.js';
import { validationResult } from 'express-validator';

export const getUserProgress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const progress = await UserProgress.findByUserId(userId);
    res.json(progress);
  } catch (error) {
    next(error);
  }
};

export const startModule = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.body;

    if (!moduleId) {
      return res.status(400).json({ error: { message: 'Module ID is required' } });
    }

    // Check if module is already completed - prevent restarting
    const existingProgress = await UserProgress.findByUserAndModule(userId, moduleId);
    if (existingProgress && existingProgress.status === 'completed') {
      return res.status(400).json({ 
        error: { 
          message: 'This module has already been completed. You cannot restart it to preserve time tracking accuracy.' 
        } 
      });
    }

    const progress = await UserProgress.createOrUpdate(userId, moduleId, {
      status: 'in_progress'
    });

    // Log module start activity using centralized service
    ActivityLogService.logActivity({
      actionType: 'module_start',
      moduleId: parseInt(moduleId),
      metadata: {
        moduleId: parseInt(moduleId)
      }
    }, req);

    res.json(progress);
  } catch (error) {
    next(error);
  }
};

export const completeModule = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.body;

    if (!moduleId) {
      return res.status(400).json({ error: { message: 'Module ID is required' } });
    }

    const progress = await UserProgress.createOrUpdate(userId, moduleId, {
      status: 'completed'
    });

    // Also mark any associated training tasks as complete
    try {
      const userTasks = await Task.findByUser(userId, { taskType: 'training' });
      for (const task of userTasks) {
        if (task.reference_id === parseInt(moduleId) && 
            (task.status === 'pending' || task.status === 'in_progress')) {
          await Task.markComplete(task.id, userId);
        }
      }
    } catch (taskError) {
      // Log but don't fail the module completion if task update fails
      console.error('Failed to mark associated task as complete:', taskError);
    }

    // Auto-generate certificates
    try {
      const CertificateService = (await import('../services/certificate.service.js')).default;
      const Module = (await import('../models/Module.model.js')).default;
      
      // Get module info
      const module = await Module.findById(moduleId);
      if (module) {
        // Check if module is standalone (not part of any training focus)
        const isStandalone = await CertificateService.isModuleStandalone(moduleId);
        
        if (isStandalone) {
          // Generate certificate for standalone module
          // Check if certificate already exists
          const Certificate = (await import('../models/Certificate.model.js')).default;
          const existingCert = await Certificate.findByReference('module', moduleId, userId);
          if (!existingCert) {
            // Get user's agency for template
            const User = (await import('../models/User.model.js')).default;
            const userAgencies = await User.getAgencies(userId);
            const agencyId = userAgencies.length > 0 ? userAgencies[0].id : null;
            
            await CertificateService.generateCertificate('module', moduleId, userId, null, agencyId);
          }
        } else {
          // Module is part of a training focus - check all modules in the track
          // Get track_id from module
          if (module.track_id) {
            await CertificateService.checkAndGenerateTrainingFocusCertificate(userId, module.track_id);
          }
        }
      }
    } catch (certError) {
      // Log but don't fail module completion if certificate generation fails
      console.error('Failed to generate certificate:', certError);
    }

    // Get time spent in module
    const moduleProgress = await UserProgress.findByUserAndModule(userId, moduleId);
    const totalSeconds = moduleProgress ? (moduleProgress.time_spent_minutes || 0) * 60 + (moduleProgress.time_spent_seconds || 0) : 0;

    // Log module completion activity using centralized service
    ActivityLogService.logActivity({
      actionType: 'module_complete',
      moduleId: parseInt(moduleId),
      durationSeconds: totalSeconds,
      metadata: {
        moduleId: parseInt(moduleId),
        totalTimeMinutes: moduleProgress?.time_spent_minutes || 0
      }
    }, req);

    res.json(progress);
  } catch (error) {
    next(error);
  }
};

export const logTime = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const userId = req.user.id;
    const { moduleId, sessionStart, sessionEnd, durationMinutes } = req.body;

    // Log time in time_logs table
    await TimeLog.create({
      userId,
      moduleId,
      sessionStart: new Date(sessionStart),
      sessionEnd: sessionEnd ? new Date(sessionEnd) : null,
      durationMinutes
    });

    // Update total time in user_progress
    await UserProgress.logTime(userId, moduleId, durationMinutes);

    const durationSeconds = Math.floor(durationMinutes * 60);

    // Log module end activity using centralized service
    ActivityLogService.logActivity({
      actionType: 'module_end',
      moduleId: parseInt(moduleId),
      durationSeconds,
      metadata: {
        moduleId: parseInt(moduleId),
        durationMinutes,
        sessionStart,
        sessionEnd
      }
    }, req);

    res.json({ message: 'Time logged successfully' });
  } catch (error) {
    next(error);
  }
};

