import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Task from '../models/Task.model.js';
import { objectiveTargetReached } from '../../../frontend/src/utils/treatmentGoalAchievement.js';
export { objectiveTargetReached };
export async function ensureTreatmentPlanAchievementTask({ agencyId, clientId, planId, providerUserId, goalId, objectiveId = null, sourceNoteId = null }, { database = pool, taskModel = Task } = {}) {
  const sourceRefId = `${agencyId}:${clientId}:${planId}:${objectiveId ? `o${objectiveId}` : `g${goalId}`}`;
  const find = async () => (await database.execute("SELECT id,status FROM tasks WHERE source_ref_type='treatment_plan_achievement' AND source_ref_id=? LIMIT 1", [sourceRefId]))[0]?.[0] || null;
  const existing = await find();
  if (existing) return { taskId: existing.id, deduped: true };
  try {
    const task = await taskModel.create({ taskType: 'custom', title: 'Update treatment plan after goal achievement',
      description: 'A treatment objective or goal was achieved. Review the last three to five sessions, update the plan as appropriate, and obtain provider and supervisor review before sharing the new version.',
      assignedToUserId: providerUserId, assignedToAgencyId: agencyId, assignedByUserId: null,
      sourceRefType: 'treatment_plan_achievement', sourceRefId, categories: ['client'], isRequired: true,
      metadata: { source: 'narriva_goal_achievement', agencyId, clientId, treatmentPlanId: planId, goalId, objectiveId, sourceNoteId, action: 'update_treatment_plan' } });
    return { taskId: task.id || task.insertId, deduped: false };
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    const concurrent = await find();
    if (!concurrent) throw error;
    return { taskId: concurrent.id, deduped: true };
  }
}
export async function queueSignedObjectiveAchievements(note, { database = clinicalPool, ensureTask = ensureTreatmentPlanAchievementTask } = {}) {
  if (!note.provider_signed_at) return [];
  const [ratings] = await database.execute(`SELECT r.*,o.scale_direction,o.scale_start,o.scale_target AS current_target,g.treatment_plan_id AS plan_id
    FROM clinical_treatment_objective_ratings r
    JOIN clinical_treatment_plan_objectives o ON o.id=r.objective_id
    JOIN clinical_treatment_plan_goals g ON g.id=o.goal_id
    WHERE r.agency_id=? AND r.client_id=? AND r.clinical_note_id=?
      AND COALESCE(r.rater_kind,'clinician')='clinician' AND r.disposition='rated'`, [note.agency_id, note.client_id, note.id]);
  const tasks = [];
  for (const rating of ratings) if (objectiveTargetReached({ value: rating.scale_value, target: rating.scale_target_at_rating ?? rating.current_target, direction: rating.scale_direction, baseline: rating.scale_start })) {
    tasks.push(await ensureTask({ agencyId: note.agency_id, clientId: note.client_id, planId: rating.plan_id, providerUserId: note.created_by_user_id, goalId: rating.goal_id, objectiveId: rating.objective_id, sourceNoteId: note.id }));
  }
  return tasks;
}
