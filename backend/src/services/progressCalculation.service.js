import UserProgress from '../models/UserProgress.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import UserTrack from '../models/UserTrack.model.js';

class ProgressCalculationService {
  /**
   * Calculate training focus (track) completion percentage and status
   * @param {number} userId - User ID
   * @param {number} trackId - Training Focus ID
   * @param {number} agencyId - Agency ID
   * @returns {Promise<Object>} - { completionPercent, status, modulesCompleted, modulesTotal }
   */
  static async calculateTrackProgress(userId, trackId, agencyId) {
    // Alias for backward compatibility - this calculates Training Focus progress
    // Get all modules in the track
    const modules = await TrainingTrack.getModules(trackId);
    
    if (modules.length === 0) {
      return {
        completionPercent: 0,
        status: 'not_started',
        modulesCompleted: 0,
        modulesTotal: 0
      };
    }

    // Get progress for all modules
    let completedCount = 0;
    let inProgressCount = 0;
    let notStartedCount = 0;

    for (const module of modules) {
      const progress = await UserProgress.findByUserAndModule(userId, module.id);
      if (!progress || progress.status === 'not_started') {
        notStartedCount++;
      } else if (progress.status === 'completed') {
        completedCount++;
      } else if (progress.status === 'in_progress') {
        inProgressCount++;
      }
    }

    const completionPercent = Math.round((completedCount / modules.length) * 100);
    
    let status = 'not_started';
    if (completedCount === modules.length) {
      status = 'complete';
    } else if (completedCount > 0 || inProgressCount > 0) {
      status = 'in_progress';
    }

    return {
      completionPercent,
      status,
      modulesCompleted: completedCount,
      modulesTotal: modules.length,
      modulesInProgress: inProgressCount,
      modulesNotStarted: notStartedCount
    };
  }

  /**
   * Get module progress status
   * @param {number} userId - User ID
   * @param {number} moduleId - Module ID
   * @returns {Promise<Object>} - Module status and details
   */
  static async calculateModuleProgress(userId, moduleId) {
    const progress = await UserProgress.findByUserAndModule(userId, moduleId);
    
    if (!progress) {
      return {
        status: 'not_started',
        startedAt: null,
        completedAt: null,
        timeSpentMinutes: 0,
        timeSpentSeconds: 0,
        isOverridden: false,
        overriddenBy: null,
        overriddenAt: null
      };
    }

    const secondsRaw = Number(progress.time_spent_seconds || 0);
    const minutesRaw = Number(progress.time_spent_minutes || 0);
    const timeSpentSeconds =
      Number.isFinite(secondsRaw) && secondsRaw > 0
        ? Math.floor(secondsRaw)
        : (Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.floor(minutesRaw * 60) : 0);

    return {
      status: progress.status,
      startedAt: progress.started_at,
      completedAt: progress.completed_at,
      timeSpentMinutes: Math.floor(timeSpentSeconds / 60),
      timeSpentSeconds,
      isOverridden: !!progress.overridden_by_user_id,
      overriddenBy: progress.overridden_by_user_id,
      overriddenAt: progress.overridden_at
    };
  }

  /**
   * Get time spent for a track (sum of all modules in track)
   * @param {number} userId - User ID
   * @param {number} trackId - Track ID
   * @param {number} agencyId - Agency ID
   * @returns {Promise<Object>} - { totalMinutes, totalSeconds, byModule }
   */
  static async getTimeSpent(userId, trackId, agencyId) {
    const modules = await TrainingTrack.getModules(trackId);
    const byModule = [];
    let totalSeconds = 0;

    for (const module of modules) {
      const progress = await UserProgress.findByUserAndModule(userId, module.id);
      const secondsRaw = Number(progress?.time_spent_seconds || 0);
      const minutesRaw = Number(progress?.time_spent_minutes || 0);
      const seconds =
        Number.isFinite(secondsRaw) && secondsRaw > 0
          ? Math.floor(secondsRaw)
          : (Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.floor(minutesRaw * 60) : 0);
      const minutes = Math.floor(seconds / 60);
      
      byModule.push({
        moduleId: module.id,
        moduleTitle: module.title,
        minutes,
        seconds
      });

      totalSeconds += seconds;
    }

    return {
      totalMinutes: Math.floor(totalSeconds / 60),
      totalSeconds,
      byModule
    };
  }

  /**
   * Get total time spent across all tracks for a user in an agency
   * @param {number} userId - User ID
   * @param {number} agencyId - Agency ID
   * @returns {Promise<Object>} - { totalMinutes, totalSeconds, byTrack }
   */
  static async getTotalTimeSpent(userId, agencyId) {
    const userTracks = await UserTrack.getUserTracks(userId, agencyId);
    const byTrack = [];
    let totalSeconds = 0;

    for (const userTrack of userTracks) {
      const trackTime = await this.getTimeSpent(userId, userTrack.track_id, agencyId);
      byTrack.push({
        trackId: userTrack.track_id,
        trackName: userTrack.track_name,
        minutes: trackTime.totalMinutes,
        seconds: trackTime.totalSeconds
      });

      totalSeconds += trackTime.totalSeconds;
    }

    return {
      totalMinutes: Math.floor(totalSeconds / 60),
      totalSeconds,
      byTrack
    };
  }

  /**
   * Get quiz statistics for a module
   * @param {number} userId - User ID
   * @param {number} moduleId - Module ID
   * @returns {Promise<Object>} - { latestScore, attemptCount, latestAttempt }
   */
  static async getQuizStats(userId, moduleId) {
    const latestAttempt = await QuizAttempt.getLatestAttempt(userId, moduleId);
    const attemptCount = await QuizAttempt.getAttemptCount(userId, moduleId);

    // Get quiz content to calculate correct/total
    let correctCount = null;
    let totalQuestions = null;
    let minimumScore = null;
    let passed = null;

    if (latestAttempt) {
      // Get quiz content to determine total questions
      const ModuleContent = (await import('../models/ModuleContent.model.js')).default;
      const contentItems = await ModuleContent.findByModuleId(moduleId);
      const quizContent = contentItems.find(item => item.content_type === 'quiz');
      
      if (quizContent) {
        const quizData = typeof quizContent.content_data === 'string' 
          ? JSON.parse(quizContent.content_data) 
          : quizContent.content_data;
        
        totalQuestions = quizData.questions?.length || 0;
        minimumScore = quizData.minimumScore || null;
        
        if (totalQuestions > 0 && latestAttempt.score !== null) {
          // Calculate correct count from score percentage
          correctCount = Math.round((latestAttempt.score / 100) * totalQuestions);
          passed = minimumScore ? latestAttempt.score >= minimumScore : true;
        }
      }
    }

    return {
      latestScore: latestAttempt ? latestAttempt.score : null,
      attemptCount: attemptCount || 0,
      correctCount,
      totalQuestions,
      minimumScore,
      passed,
      latestAttempt: latestAttempt ? {
        score: latestAttempt.score,
        completedAt: latestAttempt.completed_at
      } : null
    };
  }

  /**
   * Get comprehensive progress for a user in an agency
   * @param {number} userId - User ID
   * @param {number} agencyId - Agency ID
   * @returns {Promise<Object>} - Complete progress summary
   */
  static async getUserProgressSummary(userId, agencyId) {
    const userTracks = await UserTrack.getUserTracks(userId, agencyId);
    const tracks = [];

    for (const userTrack of userTracks) {
      const trackProgress = await this.calculateTrackProgress(userId, userTrack.track_id, agencyId);
      const trackTime = await this.getTimeSpent(userId, userTrack.track_id, agencyId);
      
      // Get modules with their individual progress
      const modules = await TrainingTrack.getModules(userTrack.track_id);
      const moduleDetails = [];

      for (const module of modules) {
        const moduleProgress = await this.calculateModuleProgress(userId, module.id);
        const quizStats = await this.getQuizStats(userId, module.id);

        moduleDetails.push({
          moduleId: module.id,
          moduleTitle: module.title,
          orderIndex: module.track_order || module.order_index,
          status: moduleProgress.status,
          timeSpentMinutes: moduleProgress.timeSpentMinutes,
          timeSpentSeconds: moduleProgress.timeSpentSeconds,
          quizScore: quizStats.latestScore,
          quizAttemptCount: quizStats.attemptCount,
          isOverridden: moduleProgress.isOverridden,
          overriddenAt: moduleProgress.overriddenAt
        });
      }

      tracks.push({
        trackId: userTrack.track_id,
        trackName: userTrack.track_name,
        trackDescription: userTrack.track_description,
        assignedAt: userTrack.assigned_at,
        ...trackProgress,
        timeSpent: trackTime,
        modules: moduleDetails
      });
    }

    const totalTime = await this.getTotalTimeSpent(userId, agencyId);

    return {
      userId,
      agencyId,
      tracks,
      totalTimeSpent: {
        minutes: totalTime.totalMinutes,
        seconds: totalTime.totalSeconds
      }
    };
  }
}

export default ProgressCalculationService;

