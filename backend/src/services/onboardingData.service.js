import User from '../models/User.model.js';
import UserAccount from '../models/UserAccount.model.js';
import UserTrack from '../models/UserTrack.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import UserProgress from '../models/UserProgress.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';
import Task from '../models/Task.model.js';
import SignedDocument from '../models/SignedDocument.model.js';
import ProgressCalculationService from './progressCalculation.service.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OnboardingDataService {
  static async getUserTrainingData(userId) {
    // Get all user's agencies
    const userAgencies = await User.getAgencies(userId);
    
    const trainingData = [];
    const moduleIdsInTracks = new Set(); // Track which modules are part of training focuses
    
    // First, get all training focuses and their modules
    for (const agency of userAgencies) {
      // Get training focuses for this agency
      const userTracks = await UserTrack.getUserTracks(userId, agency.id);
      
      for (const userTrack of userTracks) {
        // Get track details
        const track = await TrainingTrack.findById(userTrack.track_id);
        if (!track) continue;
        
        // Get modules in this track
        const modules = await TrainingTrack.getModules(userTrack.track_id);
        
        // Get progress for each module
        const moduleDetails = [];
        let totalTimeSeconds = 0;
        
        for (const module of modules) {
          moduleIdsInTracks.add(module.id); // Mark this module as part of a track
          
          const moduleProgress = await ProgressCalculationService.calculateModuleProgress(userId, module.id);
          const quizStats = await ProgressCalculationService.getQuizStats(userId, module.id);
          
          totalTimeSeconds += moduleProgress.timeSpentSeconds || 0;
          
          moduleDetails.push({
            id: module.id,
            title: module.title,
            description: module.description,
            status: moduleProgress.status,
            timeSpentMinutes: moduleProgress.timeSpentMinutes,
            timeSpentSeconds: moduleProgress.timeSpentSeconds,
            quizScore: quizStats.latestScore,
            quizAttemptCount: quizStats.attemptCount,
            completedAt: moduleProgress.completedAt,
            orderIndex: module.track_order || module.order_index
          });
        }
        
        // Calculate track completion
        const trackProgress = await ProgressCalculationService.calculateTrackProgress(
          userId,
          userTrack.track_id,
          agency.id
        );
        
        trainingData.push({
          trackId: track.id,
          trackName: track.name,
          trackDescription: track.description,
          agencyId: agency.id,
          agencyName: agency.name,
          completionPercent: trackProgress.completionPercent,
          status: trackProgress.status,
          modulesCompleted: trackProgress.modulesCompleted,
          modulesTotal: trackProgress.modulesTotal,
          totalTimeSeconds,
          modules: moduleDetails
        });
      }
    }
    
    // Now get individually assigned modules (from tasks, not part of training focuses)
    const Module = (await import('../models/Module.model.js')).default;
    const trainingTasks = await Task.findByUser(userId, { taskType: 'training' });
    
    const standaloneModules = [];
    let standaloneTimeSeconds = 0;
    
    for (const task of trainingTasks) {
      if (task.reference_id && !moduleIdsInTracks.has(task.reference_id)) {
        // This is an individually assigned module not in any training focus
        try {
          const module = await Module.findById(task.reference_id);
          if (module) {
            const moduleProgress = await ProgressCalculationService.calculateModuleProgress(userId, module.id);
            const quizStats = await ProgressCalculationService.getQuizStats(userId, module.id);
            
            standaloneTimeSeconds += moduleProgress.timeSpentSeconds || 0;
            
            standaloneModules.push({
              id: module.id,
              title: task.title || module.title,
              description: task.description || module.description,
              status: moduleProgress.status,
              timeSpentMinutes: moduleProgress.timeSpentMinutes,
              timeSpentSeconds: moduleProgress.timeSpentSeconds,
              quizScore: quizStats.latestScore,
              quizAttemptCount: quizStats.attemptCount,
              completedAt: moduleProgress.completedAt,
              orderIndex: 0,
              isStandalone: true,
              taskId: task.id
            });
          }
        } catch (err) {
          console.error(`Failed to get module ${task.reference_id} for task ${task.id}:`, err);
        }
      }
    }
    
    // Add standalone modules as a separate "track" entry
    if (standaloneModules.length > 0) {
      const completedCount = standaloneModules.filter(m => m.status === 'completed').length;
      trainingData.push({
        trackId: null,
        trackName: 'Individually Assigned Modules',
        trackDescription: 'Modules assigned individually (not part of a training focus)',
        agencyId: userAgencies.length > 0 ? userAgencies[0].id : null,
        agencyName: userAgencies.length > 0 ? userAgencies[0].name : 'N/A',
        completionPercent: Math.round((completedCount / standaloneModules.length) * 100),
        status: completedCount === standaloneModules.length ? 'complete' : (completedCount > 0 ? 'in_progress' : 'not_started'),
        modulesCompleted: completedCount,
        modulesTotal: standaloneModules.length,
        totalTimeSeconds: standaloneTimeSeconds,
        modules: standaloneModules,
        isStandalone: true
      });
    }
    
    return trainingData;
  }

  static async getUserAccountInfo(userId) {
    const accounts = await UserAccount.findByUserId(userId);
    return accounts;
  }

  static async getSignedDocuments(userId) {
    // Get all document tasks for user
    const documentTasks = await Task.findByUser(userId, { taskType: 'document' });
    
    const signedDocs = [];
    const StorageService = (await import('./storage.service.js')).default;
    
    for (const task of documentTasks) {
      if (task.status === 'completed') {
        try {
          // Signed documents are linked via task_id
          const signedDoc = await SignedDocument.findByTask(task.id);
          if (signedDoc && signedDoc.signed_pdf_path) {
            try {
              // Parse path to get components
              const pathInfo = StorageService.parseSignedDocumentPath(signedDoc.signed_pdf_path);
              
              let pdfBytes;
              if (pathInfo && pathInfo.format === 'new') {
                // New format: use storage service
                pdfBytes = await StorageService.readSignedDocument(
                  pathInfo.userId,
                  pathInfo.documentId,
                  pathInfo.filename
                );
              } else {
                // Old format: fallback to direct file read
                const pdfPath = path.join(__dirname, '../../uploads', signedDoc.signed_pdf_path);
                pdfBytes = await fs.readFile(pdfPath);
              }
              
              signedDocs.push({
                id: signedDoc.id,
                title: task.title || 'Signed Document',
                signedAt: signedDoc.signed_at,
                pdfBytes: pdfBytes,
                auditTrail: signedDoc.audit_trail
              });
            } catch (err) {
              console.error(`Failed to read PDF for signed document ${signedDoc.id}:`, err);
            }
          }
        } catch (err) {
          console.error(`Failed to get signed document for task ${task.id}:`, err);
        }
      }
    }
    
    return signedDocs;
  }

  static async getAgencyInfo(userId) {
    const agencies = await User.getAgencies(userId);
    return agencies.length > 0 ? agencies[0] : null; // Return primary agency
  }

  static async getCertificates(userId) {
    // Get certificates for completed training focuses
    // This would fetch from a certificates table if it exists
    // For now, return empty array
    try {
      // TODO: Implement certificate fetching when certificate system is fully implemented
      return [];
    } catch (error) {
      console.warn('getCertificates: Error fetching certificates, returning empty array:', error);
      return [];
    }
  }

  static async getAllOnboardingData(userId) {
    const [user, trainingData, accountInfo, signedDocuments, agencyInfo, certificates] = await Promise.all([
      User.findById(userId),
      this.getUserTrainingData(userId),
      this.getUserAccountInfo(userId),
      this.getSignedDocuments(userId),
      this.getAgencyInfo(userId),
      this.getCertificates(userId)
    ]);

    // Calculate total training time
    const totalTimeSeconds = trainingData.reduce((sum, track) => sum + (track.totalTimeSeconds || 0), 0);
    const totalTimeMinutes = Math.round(totalTimeSeconds / 60);
    const totalTimeHours = Math.floor(totalTimeMinutes / 60);
    const totalTimeMinutesRemainder = totalTimeMinutes % 60;

    return {
      user,
      trainingData,
      accountInfo,
      signedDocuments,
      agencyInfo,
      certificates,
      totalTime: {
        seconds: totalTimeSeconds,
        minutes: totalTimeMinutes,
        hours: totalTimeHours,
        minutesRemainder: totalTimeMinutesRemainder,
        formatted: totalTimeHours > 0 
          ? `${totalTimeHours}h ${totalTimeMinutesRemainder}m`
          : `${totalTimeMinutes}m`
      }
    };
  }
}

export default OnboardingDataService;

