import UserTrack from '../models/UserTrack.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import { UserTrainingFocusProgress, UserTrainingFocusStepProgress } from '../models/UserTrainingFocusProgress.model.js';
import TrainingFocusStep from '../models/TrainingFocusStep.model.js';

class TrainingFocusPayrollService {
  static async createClaimIfEligible(userId, trainingFocusId, agencyId) {
    const assignment = await UserTrack.getUserTrack(userId, trainingFocusId, agencyId);
    if (!assignment) {
      return null;
    }

    const progress = await UserTrainingFocusProgress.find(userId, trainingFocusId, agencyId);
    if (!progress || progress.status !== 'completed') {
      return null;
    }
    if (progress.payrollClaimId) {
      return await PayrollTimeClaim.findById(progress.payrollClaimId);
    }

    const focus = await TrainingTrack.findById(trainingFocusId);
    const steps = await TrainingFocusStep.findByFocusId(trainingFocusId);
    const stepProgress = await UserTrainingFocusStepProgress.findByFocus(userId, agencyId, trainingFocusId);
    const stepProgressById = new Map(stepProgress.map((sp) => [sp.stepId, sp]));

    const stepBreakdown = steps.map((step) => {
      const sp = stepProgressById.get(step.id);
      return {
        stepId: step.id,
        stepType: step.stepType,
        referenceId: step.referenceId,
        title: step.title,
        timeSpentSeconds: sp?.timeSpentSeconds || 0,
        status: sp?.status || 'not_started'
      };
    });

    const totalSeconds = progress.totalTimeSpentSeconds || 0;
    const completedAt = progress.completedAt || new Date();
    const claimDate = new Date(completedAt).toISOString().slice(0, 10);

    const period = await PayrollPeriod.findForAgencyByDate({ agencyId, dateYmd: claimDate });

    const payload = {
      trainingFocusId,
      trainingFocusName: focus?.name || `Focus ${trainingFocusId}`,
      agencyId,
      totalSeconds,
      totalMinutes: Math.floor(totalSeconds / 60),
      stepBreakdown,
      completedAt: completedAt instanceof Date ? completedAt.toISOString() : completedAt,
      assignmentSource: 'assigned'
    };

    const claim = await PayrollTimeClaim.create({
      agencyId,
      userId,
      submittedByUserId: userId,
      status: 'submitted',
      claimType: 'training_focus_completion',
      claimDate,
      payload,
      suggestedPayrollPeriodId: period?.id || null
    });

    await UserTrainingFocusProgress.setPayrollClaimId(userId, trainingFocusId, agencyId, claim.id);
    return claim;
  }
}

export default TrainingFocusPayrollService;
