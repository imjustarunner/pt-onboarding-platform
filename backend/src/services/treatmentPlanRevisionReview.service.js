import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';

export async function reviseTreatmentPlanForReview({ planId, agencyId, clientId, user, goals = [], effectiveDate = null }) {
  const source = await ClinicalTreatmentPlan.findById(planId);
  if (!source || Number(source.agency_id) !== Number(agencyId) || Number(source.client_id) !== Number(clientId)) throw Object.assign(new Error('Treatment plan not found.'), { status: 404 });
  if (Number(source.created_by_user_id) !== Number(user?.id)) throw Object.assign(new Error('The plan author must prepare its revision. Supervisors can request changes during review.'), { status: 403 });
  await requireStaffCareEligibility(user.id, agencyId);
  if (source.status === 'draft') return ClinicalTreatmentPlan.amend({ planId, agencyId, clientId, goals });
  const incoming = new Map(goals.filter(goal => goal.goalId).map(goal => [Number(goal.goalId), goal]));
  const existingGoals = (source.goals || []).filter(goal => !goal.superseded_at && !['superseded', 'inactive', 'archived'].includes(goal.status));
  const merged = existingGoals.map(goal => {
    const edit = incoming.get(Number(goal.id)) || {};
    const objectiveEdits = new Map((edit.objectives || []).filter(objective => objective.objectiveId).map(objective => [Number(objective.objectiveId), objective]));
    return { goalIndex: edit.goalIndex || goal.goal_index, goalText: edit.goalText ?? goal.goal_text, projectedCompletion: edit.projectedCompletion ?? goal.projected_completion,
      objectives: [...(goal.objectives || []).filter(objective => !objective.superseded_at && objective.status !== 'superseded').map(objective => {
        const update = objectiveEdits.get(Number(objective.id)) || {};
        return { objectiveIndex: update.objectiveIndex || objective.objective_index, objectiveText: update.objectiveText ?? objective.objective_text,
          scaleCurrent: update.scaleCurrent ?? objective.scale_current, scaleTarget: update.scaleTarget ?? objective.scale_target, scaleDirection: update.scaleDirection || objective.scale_direction,
          measurementMethod: update.measurementMethod ?? objective.measurement_method, interventions: update.interventions || objective.interventions || [] };
      }), ...(edit.objectives || []).filter(objective => !objective.objectiveId)] };
  });
  merged.push(...goals.filter(goal => !goal.goalId));
  const revision = await ClinicalTreatmentPlan.create({ agencyId, clientId, createdByUserId: user.id, title: source.title, status: 'draft',
    effectiveDate, dischargePlan: source.discharge_plan, presentingProblem: source.presenting_problem, prescribedFrequency: source.prescribed_frequency,
    sourceToolId: 'note_aid_pending_revision', primaryDiagnosisId: source.primary_diagnosis_id, diagnosticJustification: source.diagnostic_justification, goals: merged });
  if (source.planDiagnoses?.length) await ClinicalTreatmentPlan.replacePlanDiagnoses({ planId: revision.id,
    diagnoses: source.planDiagnoses.map(diagnosis => ({ diagnosisId: diagnosis.diagnosis_id, sortOrder: diagnosis.sort_order, isPrimary: !!Number(diagnosis.is_primary), justification: diagnosis.justification })), primaryDiagnosisId: source.primary_diagnosis_id });
  return ClinicalTreatmentPlan.findById(revision.id);
}
