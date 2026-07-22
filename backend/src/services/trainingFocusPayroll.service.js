import UserTrack from '../models/UserTrack.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import { UserTrainingFocusProgress, UserTrainingFocusStepProgress } from '../models/UserTrainingFocusProgress.model.js';
import TrainingFocusStep from '../models/TrainingFocusStep.model.js';
import pool from '../config/database.js';

class TrainingFocusPayrollService {
  static async _loadStepEstimates(trainingFocusId) {
    const [rows] = await pool.execute(
      `SELECT tfs.id AS step_id,
              tfs.step_type,
              tfs.reference_id,
              COALESCE(m.estimated_time_minutes, 0) AS estimated_time_minutes
       FROM training_focus_steps tfs
       LEFT JOIN modules m ON tfs.step_type = 'module' AND m.id = tfs.reference_id
       WHERE tfs.training_focus_id = ?
       ORDER BY tfs.order_index ASC, tfs.id ASC`,
      [trainingFocusId]
    );
    return rows || [];
  }

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
    const estimates = await this._loadStepEstimates(trainingFocusId);
    const estimateByStepId = new Map(estimates.map((e) => [Number(e.step_id), Number(e.estimated_time_minutes || 0)]));

    const stepBreakdown = steps.map((step) => {
      const sp = stepProgressById.get(step.id);
      const trackedSeconds = Number(sp?.timeSpentSeconds || 0);
      const estimatedMinutes = Number(estimateByStepId.get(Number(step.id)) || 0);
      const estimatedSeconds = Math.max(0, Math.round(estimatedMinutes * 60));
      // Prefer tracked time; fall back to module estimated minutes when tracking is empty
      // (common for quick module completions / checklists).
      const effectiveSeconds = trackedSeconds > 0 ? trackedSeconds : estimatedSeconds;
      return {
        stepId: step.id,
        stepType: step.stepType,
        referenceId: step.referenceId,
        title: step.title,
        timeSpentSeconds: trackedSeconds,
        estimatedMinutes,
        effectiveSeconds,
        status: sp?.status || 'not_started'
      };
    });

    const trackedTotalSeconds = Number(progress.totalTimeSpentSeconds || 0);
    const estimatedTotalSeconds = stepBreakdown.reduce((sum, s) => sum + Number(s.estimatedMinutes || 0) * 60, 0);
    const totalSeconds = trackedTotalSeconds > 0
      ? trackedTotalSeconds
      : stepBreakdown.reduce((sum, s) => sum + Number(s.effectiveSeconds || 0), 0) || estimatedTotalSeconds;
    const completedAt = progress.completedAt || new Date();
    const claimDate = new Date(completedAt).toISOString().slice(0, 10);

    const period = await PayrollPeriod.findForAgencyByDate({ agencyId, dateYmd: claimDate });

    const payload = {
      trainingFocusId,
      trainingFocusName: focus?.name || `Focus ${trainingFocusId}`,
      agencyId,
      totalSeconds,
      totalMinutes: Math.floor(totalSeconds / 60),
      minutesSource: trackedTotalSeconds > 0 ? 'tracked' : 'estimated',
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

  /**
   * Backfill totalMinutes for already-submitted training-focus claims that stored 0
   * because module time tracking was empty. Uses module estimated_time_minutes.
   */
  static async enrichClaimMinutesIfEmpty(claim) {
    if (!claim || String(claim.claim_type || '').toLowerCase() !== 'training_focus_completion') return claim;
    const payload = claim.payload && typeof claim.payload === 'object' ? claim.payload : {};
    const mins = Number(payload.totalMinutes || 0);
    const secs = Number(payload.totalSeconds || 0);
    if ((Number.isFinite(mins) && mins > 0) || (Number.isFinite(secs) && secs > 0)) return claim;

    const trainingFocusId = Number(payload.trainingFocusId || 0);
    if (!trainingFocusId) return claim;
    const estimates = await this._loadStepEstimates(trainingFocusId);
    const estimatedTotalMinutes = (estimates || []).reduce(
      (sum, e) => sum + Number(e.estimated_time_minutes || 0),
      0
    );
    if (!(estimatedTotalMinutes > 0)) return claim;

    const nextPayload = {
      ...payload,
      totalMinutes: Math.floor(estimatedTotalMinutes),
      totalSeconds: Math.floor(estimatedTotalMinutes * 60),
      minutesSource: 'estimated',
      stepBreakdown: Array.isArray(payload.stepBreakdown)
        ? payload.stepBreakdown.map((step) => {
            const est = (estimates || []).find((e) => Number(e.step_id) === Number(step.stepId));
            const estimatedMinutes = Number(est?.estimated_time_minutes || step.estimatedMinutes || 0);
            return {
              ...step,
              estimatedMinutes,
              effectiveSeconds: Number(step.timeSpentSeconds || 0) > 0
                ? Number(step.timeSpentSeconds || 0)
                : Math.round(estimatedMinutes * 60)
            };
          })
        : payload.stepBreakdown
    };
    return PayrollTimeClaim.updatePayload({ id: claim.id, payload: nextPayload });
  }
}

export default TrainingFocusPayrollService;
