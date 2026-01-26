import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserTrack from '../models/UserTrack.model.js';
import ProgressCalculationService from '../services/progressCalculation.service.js';
import { validationResult } from 'express-validator';

export const getAgencyUsers = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const agencyIdInt = parseInt(agencyId);

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === agencyIdInt);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    // Get all users assigned to this agency
    const [userRows] = await pool.execute(
      `SELECT DISTINCT u.* 
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY u.last_name, u.first_name`,
      [agencyIdInt]
    );

    // Get progress summary for each user
    const usersWithProgress = await Promise.all(
      userRows.map(async (user) => {
        try {
          const userTracks = await UserTrack.getUserTracks(user.id, agencyIdInt);
          const totalTime = await ProgressCalculationService.getTotalTimeSpent(user.id, agencyIdInt);
          
          // Calculate overall progress across all tracks
          let totalModules = 0;
          let completedModules = 0;
          let inProgressModules = 0;

          for (const userTrack of userTracks) {
            try {
              const trackProgress = await ProgressCalculationService.calculateTrackProgress(
                user.id,
                userTrack.track_id,
                agencyIdInt
              );
              totalModules += trackProgress.modulesTotal || 0;
              completedModules += trackProgress.modulesCompleted || 0;
              inProgressModules += trackProgress.modulesInProgress || 0;
            } catch (trackError) {
              console.error(`Error calculating progress for user ${user.id}, track ${userTrack.track_id}:`, trackError);
              // Continue with other tracks
            }
          }

          const overallCompletion = totalModules > 0 
            ? Math.round((completedModules / totalModules) * 100)
            : 0;

          return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            tracksAssigned: userTracks.length,
            overallCompletion,
            totalModules,
            completedModules,
            inProgressModules,
            totalTimeSpent: {
              minutes: totalTime?.totalMinutes || 0,
              seconds: totalTime?.totalSeconds || 0
            }
          };
        } catch (userError) {
          console.error(`Error processing user ${user.id}:`, userError);
          // Return basic user info even if progress calculation fails
          return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            tracksAssigned: 0,
            overallCompletion: 0,
            totalModules: 0,
            completedModules: 0,
            inProgressModules: 0,
            totalTimeSpent: {
              minutes: 0,
              seconds: 0
            }
          };
        }
      })
    );

    res.json(usersWithProgress);
  } catch (error) {
    next(error);
  }
};

export const getUserProgress = async (req, res, next) => {
  try {
    const { agencyId, userId } = req.params;
    const agencyIdInt = parseInt(agencyId);
    const userIdInt = parseInt(userId);

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === agencyIdInt);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    // Verify user is in this agency
    const userAgencies = await User.getAgencies(userIdInt);
    const userInAgency = userAgencies.some(a => a.id === agencyIdInt);
    if (!userInAgency) {
      return res.status(404).json({ error: { message: 'User not found in this agency' } });
    }

    const progressSummary = await ProgressCalculationService.getUserProgressSummary(
      userIdInt,
      agencyIdInt
    );

    res.json(progressSummary);
  } catch (error) {
    next(error);
  }
};

export const getTrackProgress = async (req, res, next) => {
  try {
    const { agencyId, userId, trackId } = req.params;
    const agencyIdInt = parseInt(agencyId);
    const userIdInt = parseInt(userId);
    const trackIdInt = parseInt(trackId);

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === agencyIdInt);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    const trackProgress = await ProgressCalculationService.calculateTrackProgress(
      userIdInt,
      trackIdInt,
      agencyIdInt
    );
    const trackTime = await ProgressCalculationService.getTimeSpent(
      userIdInt,
      trackIdInt,
      agencyIdInt
    );

    res.json({
      trackId: trackIdInt,
      userId: userIdInt,
      agencyId: agencyIdInt,
      ...trackProgress,
      timeSpent: trackTime
    });
  } catch (error) {
    next(error);
  }
};

export const getModuleProgress = async (req, res, next) => {
  try {
    const { agencyId, userId, moduleId } = req.params;
    const agencyIdInt = parseInt(agencyId);
    const userIdInt = parseInt(userId);
    const moduleIdInt = parseInt(moduleId);

    // Verify admin has access to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === agencyIdInt);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    const moduleProgress = await ProgressCalculationService.calculateModuleProgress(
      userIdInt,
      moduleIdInt
    );
    const quizStats = await ProgressCalculationService.getQuizStats(
      userIdInt,
      moduleIdInt
    );

    res.json({
      moduleId: moduleIdInt,
      userId: userIdInt,
      agencyId: agencyIdInt,
      ...moduleProgress,
      quiz: quizStats
    });
  } catch (error) {
    next(error);
  }
};

