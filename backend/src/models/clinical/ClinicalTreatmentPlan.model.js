import clinicalPool from '../../config/clinicalDatabase.js';
import { fingerprintPlanText } from './ClinicalTreatmentObjectiveRating.model.js';

class ClinicalTreatmentPlan {
  static async create({
    agencyId,
    clientId,
    clinicalSessionId = null,
    clinicalNoteId = null,
    title = 'Treatment Plan',
    status = 'active',
    dischargePlan = null,
    sourceToolId = null,
    createdByUserId,
    goals = [],
    primaryDiagnosisId = null,
    diagnosticJustification = null
  }) {
    const conn = await clinicalPool.getConnection();
    try {
      await conn.beginTransaction();
      let planId;
      try {
        const [result] = await conn.execute(
          `INSERT INTO clinical_treatment_plans
           (agency_id, client_id, clinical_session_id, clinical_note_id, title, status, discharge_plan,
            source_tool_id, created_by_user_id, primary_diagnosis_id, diagnostic_justification)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            agencyId,
            clientId,
            clinicalSessionId,
            clinicalNoteId,
            title,
            status,
            dischargePlan,
            sourceToolId,
            createdByUserId,
            primaryDiagnosisId || null,
            diagnosticJustification || null
          ]
        );
        planId = result.insertId;
      } catch (e) {
        if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        const [result] = await conn.execute(
          `INSERT INTO clinical_treatment_plans
           (agency_id, client_id, clinical_session_id, clinical_note_id, title, status, discharge_plan, source_tool_id, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            agencyId,
            clientId,
            clinicalSessionId,
            clinicalNoteId,
            title,
            status,
            dischargePlan,
            sourceToolId,
            createdByUserId
          ]
        );
        planId = result.insertId;
      }
      for (const g of goals || []) {
        const goalText = g.goalText || '';
        const [gRes] = await conn.execute(
          `INSERT INTO clinical_treatment_plan_goals
           (treatment_plan_id, goal_index, goal_text, projected_completion, status)
           VALUES (?, ?, ?, ?, ?)`,
          [
            planId,
            g.goalIndex || 1,
            goalText,
            g.projectedCompletion || null,
            g.status || 'active'
          ]
        );
        const goalId = gRes.insertId;
        try {
          await conn.execute(
            `UPDATE clinical_treatment_plan_goals SET content_fingerprint = ? WHERE id = ?`,
            [fingerprintPlanText(goalText), goalId]
          );
        } catch {
          // lineage columns from clinical migration 005 may not exist yet
        }
        for (const o of g.objectives || []) {
          const objectiveText = o.objectiveText || '';
          const [oRes] = await conn.execute(
            `INSERT INTO clinical_treatment_plan_objectives
             (goal_id, objective_index, objective_text, scale_current, scale_target, measurement_method)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              goalId,
              o.objectiveIndex || 1,
              objectiveText,
              o.scaleCurrent ?? null,
              o.scaleTarget ?? null,
              o.measurementMethod || null
            ]
          );
          try {
            await conn.execute(
              `UPDATE clinical_treatment_plan_objectives
               SET content_fingerprint = ?, status = 'active'
               WHERE id = ?`,
              [fingerprintPlanText(objectiveText), oRes.insertId]
            );
          } catch {
            // lineage columns from clinical migration 005 may not exist yet
          }
        }
      }
      await conn.commit();
      return this.findById(planId);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async findById(id) {
    const [rows] = await clinicalPool.execute(
      `SELECT * FROM clinical_treatment_plans WHERE id = ? LIMIT 1`,
      [id]
    );
    const plan = rows?.[0];
    if (!plan) return null;
    const [goals] = await clinicalPool.execute(
      `SELECT * FROM clinical_treatment_plan_goals
       WHERE treatment_plan_id = ?
       ORDER BY goal_index ASC`,
      [id]
    );
    const outGoals = [];
    for (const g of goals || []) {
      const [objs] = await clinicalPool.execute(
        `SELECT * FROM clinical_treatment_plan_objectives
         WHERE goal_id = ?
         ORDER BY objective_index ASC`,
        [g.id]
      );
      outGoals.push({ ...g, objectives: objs || [] });
    }
    return { ...plan, goals: outGoals };
  }

  static async listByClient({ agencyId, clientId }) {
    const [rows] = await clinicalPool.execute(
      `SELECT id, agency_id, client_id, clinical_session_id, clinical_note_id, title, status, source_tool_id, created_at, updated_at
       FROM clinical_treatment_plans
       WHERE agency_id = ? AND client_id = ?
       ORDER BY created_at DESC`,
      [agencyId, clientId]
    );
    return rows || [];
  }

  /**
   * Identity-lock amend:
   * - scale_target / projected_completion / measurement_method only → update in place
   * - objective_text change → supersede objective, insert new
   * - goal_text change → supersede goal, insert new goal + require new objectives
   */
  static async amend({ planId, agencyId, clientId, goals = [] }) {
    const plan = await this.findById(planId);
    if (!plan) throw new Error('Treatment plan not found');
    if (Number(plan.agency_id) !== Number(agencyId) || Number(plan.client_id) !== Number(clientId)) {
      throw new Error('Treatment plan does not belong to this agency/client');
    }

    const conn = await clinicalPool.getConnection();
    try {
      await conn.beginTransaction();
      const existingGoals = plan.goals || [];

      for (const incoming of goals || []) {
        const existingGoal = incoming.goalId
          ? existingGoals.find((g) => Number(g.id) === Number(incoming.goalId))
          : null;

        if (!existingGoal) {
          const goalText = incoming.goalText || '';
          const [gRes] = await conn.execute(
            `INSERT INTO clinical_treatment_plan_goals
             (treatment_plan_id, goal_index, goal_text, projected_completion, status, content_fingerprint)
             VALUES (?, ?, ?, ?, 'active', ?)`,
            [
              planId,
              incoming.goalIndex || existingGoals.length + 1,
              goalText,
              incoming.projectedCompletion || null,
              fingerprintPlanText(goalText)
            ]
          );
          const newGoalId = gRes.insertId;
          for (const o of incoming.objectives || []) {
            const objectiveText = o.objectiveText || '';
            await conn.execute(
              `INSERT INTO clinical_treatment_plan_objectives
               (goal_id, objective_index, objective_text, scale_current, scale_target, measurement_method, content_fingerprint, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
              [
                newGoalId,
                o.objectiveIndex || 1,
                objectiveText,
                o.scaleCurrent ?? null,
                o.scaleTarget ?? null,
                o.measurementMethod || null,
                fingerprintPlanText(objectiveText)
              ]
            );
          }
          continue;
        }

        const newGoalFp = fingerprintPlanText(incoming.goalText || existingGoal.goal_text);
        const oldGoalFp =
          existingGoal.content_fingerprint || fingerprintPlanText(existingGoal.goal_text);
        const goalTextChanged = newGoalFp !== oldGoalFp;

        if (goalTextChanged) {
          const [gRes] = await conn.execute(
            `INSERT INTO clinical_treatment_plan_goals
             (treatment_plan_id, goal_index, goal_text, projected_completion, status, content_fingerprint)
             VALUES (?, ?, ?, ?, 'active', ?)`,
            [
              planId,
              incoming.goalIndex || existingGoal.goal_index,
              incoming.goalText || '',
              incoming.projectedCompletion ?? existingGoal.projected_completion,
              newGoalFp
            ]
          );
          const newGoalId = gRes.insertId;
          await conn.execute(
            `UPDATE clinical_treatment_plan_goals
             SET status = 'superseded', superseded_at = NOW(), replaced_by_id = ?
             WHERE id = ?`,
            [newGoalId, existingGoal.id]
          );
          await conn.execute(
            `UPDATE clinical_treatment_plan_objectives
             SET status = 'superseded', superseded_at = NOW()
             WHERE goal_id = ? AND superseded_at IS NULL`,
            [existingGoal.id]
          );
          const objs = incoming.objectives || [];
          if (!objs.length) {
            throw new Error('Changing a goal requires at least one new objective');
          }
          for (const o of objs) {
            const objectiveText = o.objectiveText || '';
            await conn.execute(
              `INSERT INTO clinical_treatment_plan_objectives
               (goal_id, objective_index, objective_text, scale_current, scale_target, measurement_method, content_fingerprint, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
              [
                newGoalId,
                o.objectiveIndex || 1,
                objectiveText,
                o.scaleCurrent ?? null,
                o.scaleTarget ?? null,
                o.measurementMethod || null,
                fingerprintPlanText(objectiveText)
              ]
            );
          }
          continue;
        }

        if (incoming.projectedCompletion !== undefined) {
          await conn.execute(
            `UPDATE clinical_treatment_plan_goals SET projected_completion = ? WHERE id = ?`,
            [incoming.projectedCompletion || null, existingGoal.id]
          );
        }

        const existingObjs = existingGoal.objectives || [];
        for (const o of incoming.objectives || []) {
          const existingObj = o.objectiveId
            ? existingObjs.find((x) => Number(x.id) === Number(o.objectiveId))
            : null;

          if (!existingObj) {
            const objectiveText = o.objectiveText || '';
            await conn.execute(
              `INSERT INTO clinical_treatment_plan_objectives
               (goal_id, objective_index, objective_text, scale_current, scale_target, measurement_method, content_fingerprint, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
              [
                existingGoal.id,
                o.objectiveIndex || existingObjs.length + 1,
                objectiveText,
                o.scaleCurrent ?? null,
                o.scaleTarget ?? null,
                o.measurementMethod || null,
                fingerprintPlanText(objectiveText)
              ]
            );
            continue;
          }

          const newObjFp = fingerprintPlanText(o.objectiveText || existingObj.objective_text);
          const oldObjFp =
            existingObj.content_fingerprint || fingerprintPlanText(existingObj.objective_text);
          const objTextChanged = newObjFp !== oldObjFp;

          if (objTextChanged) {
            const [oRes] = await conn.execute(
              `INSERT INTO clinical_treatment_plan_objectives
               (goal_id, objective_index, objective_text, scale_current, scale_target, measurement_method, content_fingerprint, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
              [
                existingGoal.id,
                o.objectiveIndex || existingObj.objective_index,
                o.objectiveText || '',
                o.scaleCurrent ?? existingObj.scale_current,
                o.scaleTarget ?? existingObj.scale_target,
                o.measurementMethod ?? existingObj.measurement_method,
                newObjFp
              ]
            );
            await conn.execute(
              `UPDATE clinical_treatment_plan_objectives
               SET status = 'superseded', superseded_at = NOW(), replaced_by_id = ?
               WHERE id = ?`,
              [oRes.insertId, existingObj.id]
            );
          } else {
            if (o.scaleTarget !== undefined) {
              await conn.execute(
                `UPDATE clinical_treatment_plan_objectives SET scale_target = ? WHERE id = ?`,
                [o.scaleTarget, existingObj.id]
              );
            }
            if (o.scaleCurrent !== undefined) {
              await conn.execute(
                `UPDATE clinical_treatment_plan_objectives SET scale_current = ? WHERE id = ?`,
                [o.scaleCurrent, existingObj.id]
              );
            }
            if (o.measurementMethod !== undefined) {
              await conn.execute(
                `UPDATE clinical_treatment_plan_objectives SET measurement_method = ? WHERE id = ?`,
                [o.measurementMethod, existingObj.id]
              );
            }
          }
        }
      }

      await conn.commit();
      return this.findById(planId);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default ClinicalTreatmentPlan;
