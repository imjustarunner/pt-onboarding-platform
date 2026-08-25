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
    diagnosticJustification = null,
    effectiveDate = null
  }) {
    const conn = await clinicalPool.getConnection();
    try {
      await conn.beginTransaction();
      let planId;
      try {
        const [result] = await conn.execute(
          `INSERT INTO clinical_treatment_plans
           (agency_id, client_id, clinical_session_id, clinical_note_id, title, effective_date, status, discharge_plan,
            source_tool_id, created_by_user_id, primary_diagnosis_id, diagnostic_justification)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            agencyId,
            clientId,
            clinicalSessionId,
            clinicalNoteId,
            title,
            effectiveDate || null,
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
        } catch (e2) {
          if (e2.code !== 'ER_BAD_FIELD_ERROR') throw e2;
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
          let oRes;
          try {
            [oRes] = await conn.execute(
              `INSERT INTO clinical_treatment_plan_objectives
               (goal_id, objective_index, objective_text, scale_current, scale_target, scale_direction, measurement_method)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                goalId,
                o.objectiveIndex || 1,
                objectiveText,
                o.scaleCurrent ?? null,
                o.scaleTarget ?? null,
                o.scaleDirection === 'increase' || o.scaleDirection === 'decrease' ? o.scaleDirection : null,
                o.measurementMethod || null
              ]
            );
          } catch (objErr) {
            if (objErr.code !== 'ER_BAD_FIELD_ERROR') throw objErr;
            [oRes] = await conn.execute(
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
          }
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
    let planDiagnoses = [];
    try {
      const [dxRows] = await clinicalPool.execute(
        `SELECT pd.id, pd.treatment_plan_id, pd.diagnosis_id, pd.sort_order, pd.is_primary, pd.justification,
                d.icd10_code, d.description
         FROM clinical_treatment_plan_diagnoses pd
         INNER JOIN clinical_diagnoses d ON d.id = pd.diagnosis_id
         WHERE pd.treatment_plan_id = ?
         ORDER BY pd.sort_order ASC, pd.id ASC`,
        [id]
      );
      planDiagnoses = dxRows || [];
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    return { ...plan, goals: outGoals, planDiagnoses };
  }

  static async listByClient({ agencyId, clientId }) {
    try {
      const [rows] = await clinicalPool.execute(
        `SELECT id, agency_id, client_id, clinical_session_id, clinical_note_id, title, effective_date,
                status, source_tool_id, primary_diagnosis_id, created_at, updated_at
         FROM clinical_treatment_plans
         WHERE agency_id = ? AND client_id = ?
         ORDER BY COALESCE(effective_date, DATE(created_at)) DESC, created_at DESC`,
        [agencyId, clientId]
      );
      return rows || [];
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await clinicalPool.execute(
        `SELECT id, agency_id, client_id, clinical_session_id, clinical_note_id, title, status, source_tool_id, created_at, updated_at
         FROM clinical_treatment_plans
         WHERE agency_id = ? AND client_id = ?
         ORDER BY created_at DESC`,
        [agencyId, clientId]
      );
      return rows || [];
    }
  }

  /**
   * Replace ordered diagnosis links for a plan. Keeps primary_diagnosis_id in sync.
   */
  static async replacePlanDiagnoses({
    planId,
    diagnoses = [],
    primaryDiagnosisId = null
  }) {
    const pid = Number(planId || 0);
    if (!pid) return [];
    const conn = await clinicalPool.getConnection();
    try {
      await conn.beginTransaction();
      try {
        await conn.execute(`DELETE FROM clinical_treatment_plan_diagnoses WHERE treatment_plan_id = ?`, [pid]);
        let primaryId = Number(primaryDiagnosisId || 0) || null;
        for (let i = 0; i < (diagnoses || []).length; i += 1) {
          const d = diagnoses[i];
          const diagnosisId = Number(d.diagnosisId || d.diagnosis_id || d.id || 0);
          if (!diagnosisId) continue;
          const isPrimary = d.isPrimary === true || d.is_primary === true || d.isPrimary === 1 || Number(d.is_primary) === 1
            || (!primaryId && i === 0);
          if (isPrimary) primaryId = diagnosisId;
          await conn.execute(
            `INSERT INTO clinical_treatment_plan_diagnoses
             (treatment_plan_id, diagnosis_id, sort_order, is_primary, justification)
             VALUES (?, ?, ?, ?, ?)`,
            [
              pid,
              diagnosisId,
              Number(d.sortOrder || d.sort_order || i + 1),
              isPrimary ? 1 : 0,
              d.justification ? String(d.justification) : null
            ]
          );
        }
        if (primaryId) {
          try {
            await conn.execute(
              `UPDATE clinical_treatment_plans SET primary_diagnosis_id = ? WHERE id = ?`,
              [primaryId, pid]
            );
          } catch {
            // column may be missing pre-006
          }
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        if (e.code === 'ER_NO_SUCH_TABLE') return [];
        throw e;
      }
      return this.findById(pid);
    } finally {
      conn.release();
    }
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
