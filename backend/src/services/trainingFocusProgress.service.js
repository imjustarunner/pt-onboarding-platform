import TrainingFocusStep from '../models/TrainingFocusStep.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import UserProgress from '../models/UserProgress.model.js';
import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import Task from '../models/Task.model.js';
import {
  UserTrainingFocusProgress,
  UserTrainingFocusStepProgress,
  TrainingFocusTimeLog
} from '../models/UserTrainingFocusProgress.model.js';
import TrainingFocusPayrollService from './trainingFocusPayroll.service.js';

class TrainingFocusProgressService {
  static async getPath(userId, trainingFocusId, agencyId) {
    const steps = await TrainingFocusStep.findByFocusId(trainingFocusId);
    const focusProgress = await UserTrainingFocusProgress.ensure(userId, trainingFocusId, agencyId);
    const stepProgressList = await UserTrainingFocusStepProgress.findByFocus(userId, agencyId, trainingFocusId);
    const stepProgressById = new Map(stepProgressList.map((sp) => [sp.stepId, sp]));

    const totalSteps = steps.length;
    let completedCount = 0;
    let currentStepId = focusProgress.currentStepId;

    const enrichedSteps = [];
    for (const step of steps) {
      const sp = stepProgressById.get(step.id) || { status: 'not_started', timeSpentSeconds: 0 };
      if (sp.status === 'completed') completedCount++;

      let taskId = null;
      if (step.stepType === 'module') {
        const tasks = await Task.findByUser(userId, { taskType: 'training' });
        const task = (tasks || []).find(
          (t) =>
            Number(t.reference_id) === Number(step.referenceId) &&
            Number(t.assigned_to_agency_id) === Number(agencyId)
        );
        taskId = task?.id || null;
      } else if (step.stepType === 'document') {
        const tasks = await Task.findByUser(userId, { taskType: 'document' });
        const task = (tasks || []).find(
          (t) =>
            Number(t.reference_id) === Number(step.referenceId) &&
            Number(t.assigned_to_agency_id) === Number(agencyId)
        );
        taskId = task?.id || null;
      }

      enrichedSteps.push({
        ...step,
        status: sp.status,
        timeSpentSeconds: sp.timeSpentSeconds,
        startedAt: sp.startedAt,
        completedAt: sp.completedAt,
        taskId
      });
    }

    if (!currentStepId) {
      const firstIncomplete = enrichedSteps.find((s) => s.status !== 'completed');
      currentStepId = firstIncomplete?.id || null;
    }

    const completionPercent = totalSteps ? Math.round((completedCount / totalSteps) * 100) : 0;

    const firstIncompleteIdx = enrichedSteps.findIndex((s) => s.status !== 'completed');
    if (firstIncompleteIdx >= 0) {
      currentStepId = enrichedSteps[firstIncompleteIdx].id;
    }

    const stepsWithLock = enrichedSteps.map((step, index) => {
      let lockState = 'locked';
      if (step.status === 'completed') lockState = 'completed';
      else if (index === firstIncompleteIdx) lockState = 'current';
      return { ...step, lockState };
    });

    return {
      trainingFocusId,
      agencyId,
      status: focusProgress.status,
      currentStepId,
      totalTimeSpentSeconds: focusProgress.totalTimeSpentSeconds,
      completionPercent,
      stepsCompleted: completedCount,
      stepsTotal: totalSteps,
      steps: stepsWithLock
    };
  }

  static async startStep(userId, trainingFocusId, agencyId, stepId) {
    const step = await TrainingFocusStep.findById(stepId);
    if (!step || step.trainingFocusId !== Number(trainingFocusId)) {
      throw Object.assign(new Error('Step not found'), { statusCode: 404 });
    }

    const path = await this.getPath(userId, trainingFocusId, agencyId);
    const target = path.steps.find((s) => s.id === Number(stepId));
    if (target?.lockState === 'locked') {
      throw Object.assign(new Error('Complete previous steps first'), { statusCode: 403 });
    }

    await UserTrainingFocusStepProgress.start(userId, agencyId, stepId);
    await UserTrainingFocusProgress.updateCurrentStep(userId, trainingFocusId, agencyId, stepId);

    if (step.stepType === 'module') {
      await UserProgress.createOrUpdate(userId, step.referenceId, { status: 'in_progress' });
    }

    return this.getPath(userId, trainingFocusId, agencyId);
  }

  static async completeStep(userId, trainingFocusId, agencyId, stepId) {
    const step = await TrainingFocusStep.findById(stepId);
    if (!step || step.trainingFocusId !== Number(trainingFocusId)) {
      throw Object.assign(new Error('Step not found'), { statusCode: 404 });
    }

    await UserTrainingFocusStepProgress.complete(userId, agencyId, stepId);

    if (step.stepType === 'module') {
      await UserProgress.createOrUpdate(userId, step.referenceId, { status: 'completed' });
      const tasks = await Task.findByUser(userId, { taskType: 'training' });
      const task = (tasks || []).find(
        (t) =>
          Number(t.reference_id) === Number(step.referenceId) &&
          Number(t.assigned_to_agency_id) === Number(agencyId)
      );
      if (task?.id) await Task.markComplete(task.id, userId);
    } else if (step.stepType === 'checklist_item') {
      await UserChecklistAssignment.markComplete(userId, step.referenceId);
    }

    const steps = await TrainingFocusStep.findByFocusId(trainingFocusId);
    const stepProgressList = await UserTrainingFocusStepProgress.findByFocus(userId, agencyId, trainingFocusId);
    const completedIds = new Set(stepProgressList.filter((sp) => sp.status === 'completed').map((sp) => sp.stepId));
    completedIds.add(Number(stepId));

    const allComplete = steps.length > 0 && steps.every((s) => completedIds.has(s.id));

    if (allComplete) {
      await UserTrainingFocusProgress.markCompleted(userId, trainingFocusId, agencyId);
      await TrainingFocusPayrollService.createClaimIfEligible(userId, trainingFocusId, agencyId);
      try {
        const CertificateService = (await import('./certificate.service.js')).default;
        await CertificateService.checkAndGenerateTrainingFocusCertificate(userId, trainingFocusId);
      } catch (certErr) {
        console.error('Certificate generation after focus complete:', certErr);
      }
      return this.getPath(userId, trainingFocusId, agencyId);
    }

    const nextStep = steps.find((s) => !completedIds.has(s.id));
    if (nextStep) {
      await UserTrainingFocusProgress.updateCurrentStep(userId, trainingFocusId, agencyId, nextStep.id);
    }

    return this.getPath(userId, trainingFocusId, agencyId);
  }

  static async logStepTime(userId, trainingFocusId, agencyId, stepId, { sessionStart, sessionEnd, durationSeconds }) {
    const step = await TrainingFocusStep.findById(stepId);
    if (!step || step.trainingFocusId !== Number(trainingFocusId)) {
      throw Object.assign(new Error('Step not found'), { statusCode: 404 });
    }

    const seconds = Math.max(0, Math.floor(Number(durationSeconds || 0)));
    if (!seconds) return { ok: true };

    const start = sessionStart ? new Date(sessionStart) : new Date();
    const end = sessionEnd ? new Date(sessionEnd) : new Date();

    await TrainingFocusTimeLog.create({
      userId,
      agencyId,
      trainingFocusId,
      stepId,
      sessionStart: start,
      sessionEnd: end,
      durationSeconds: seconds
    });

    await UserTrainingFocusStepProgress.addTime(userId, agencyId, stepId, seconds);
    await UserTrainingFocusProgress.addTime(userId, trainingFocusId, agencyId, seconds);

    if (step.stepType === 'module') {
      const existing = await UserProgress.findByUserAndModule(userId, step.referenceId);
      if (!existing) {
        await UserProgress.createOrUpdate(userId, step.referenceId, { status: 'in_progress' });
      }
      await UserProgress.logTime(userId, step.referenceId, seconds);
    }

    return { ok: true, secondsLogged: seconds };
  }

  static async calculateStepBasedProgress(userId, trainingFocusId, agencyId) {
    const path = await this.getPath(userId, trainingFocusId, agencyId);
    return {
      completionPercent: path.completionPercent,
      status: path.status === 'completed' ? 'complete' : path.status === 'in_progress' ? 'in_progress' : 'not_started',
      stepsCompleted: path.stepsCompleted,
      stepsTotal: path.stepsTotal,
      totalTimeSpentSeconds: path.totalTimeSpentSeconds,
      totalTimeSpentMinutes: Math.floor((path.totalTimeSpentSeconds || 0) / 60)
    };
  }
}

export default TrainingFocusProgressService;
