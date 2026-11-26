import pool from '../config/database.js';
import { maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';

export const PLAN_REVIEW_RULES = 'treatment-plan-v1';

export function scoreTreatmentPlan(plan, draft = {}) {
  const goals = plan.goals || [];
  const objectives = goals.flatMap(goal => goal.objectives || []);
  const scaled = objectives.filter(objective => {
    const baseline = Number(objective.scale_start ?? objective.scale_current);
    const target = Number(objective.scale_target);
    return baseline >= 1 && target >= 1 && baseline <= 10 && target <= 10
      && (objective.scale_direction === 'increase' && baseline < target
        || objective.scale_direction === 'decrease' && baseline > target);
  });
  const diagnoses = plan.planDiagnoses || [];
  const criteria = [
    ['Presenting problem', 15, plan.presentingProblem || plan.presenting_problem, 'Document the current concern and impact.'],
    ['Diagnoses and justification', 15, diagnoses.length && diagnoses.every(diagnosis => diagnosis.justification?.trim()),
      'Document a reason for care and justification for each diagnosis.'],
    ['Goals and objectives', 15, goals.length && goals.every(goal => goal.goal_text?.trim() && goal.objectives?.length
      && goal.objectives.every(objective => objective.objective_text?.trim())), 'Include a measurable objective for each goal.'],
    ['Objective timeframes', 10, goals.length && goals.every(goal => goal.projected_completion), 'Record the expected timeframe for each goal.'],
    ['Recorded scales', 15, scaled.length >= 2, 'Record two objectives with a baseline, target and direction.'],
    ['Linked interventions', 10, objectives.length && objectives.every(objective => objective.interventions?.length),
      'Identify interventions that support each objective.'],
    ['Visit frequency', 10, plan.prescribedFrequency || plan.prescribed_frequency, 'Document the expected visit frequency.'],
    ['Discharge criteria', 10, (plan.dischargePlan || plan.discharge_plan) && !draft.dischargeReviewDeferred && !draft.dischargeNeedsReview,
      'Review discharge criteria against the plan’s current goals and objectives.']
  ].map(([label, points, value, message]) => ({
    label, points, status: value ? 'supported' : 'missing', message
  }));
  const score = criteria.reduce((total, criterion) => total + (criterion.status === 'supported' ? criterion.points : 0), 0);
  return { criteria, score };
}

export async function recordTreatmentPlanReview(plan, contentHash, draft, database = pool) {
  const scoring = scoreTreatmentPlan(plan, draft);
  const status = scoring.score >= 70 ? 'passed' : 'action_required';
  const result = {
    phase: 'treatment_plan', planId: plan.id, clientId: plan.client_id, documentationCode: 'Treatment plan',
    status, scoring, planAuthorship: draft?.manualOnly ? 'Manual writer' : draft?.aiContentUsed ? 'Narriva assisted' : null
  };
  await database.execute(`INSERT INTO narriva_reviews
    (agency_id,actor_user_id,source_hash,rules_version,status,result_encrypted,completed_at)
    SELECT ?,?,?,?,?,?,UTC_TIMESTAMP(3) WHERE NOT EXISTS (
      SELECT 1 FROM narriva_reviews WHERE agency_id=? AND actor_user_id=? AND rules_version=? AND source_hash=?
    )`, [plan.agency_id, plan.created_by_user_id, contentHash, PLAN_REVIEW_RULES, status,
    maybeEncryptNotePayload(JSON.stringify(result)), plan.agency_id, plan.created_by_user_id, PLAN_REVIEW_RULES, contentHash]);
}
