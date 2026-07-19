import clinicalPool from '../../config/clinicalDatabase.js';

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
    goals = []
  }) {
    const conn = await clinicalPool.getConnection();
    try {
      await conn.beginTransaction();
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
      const planId = result.insertId;
      for (const g of goals || []) {
        const [gRes] = await conn.execute(
          `INSERT INTO clinical_treatment_plan_goals
           (treatment_plan_id, goal_index, goal_text, projected_completion, status)
           VALUES (?, ?, ?, ?, ?)`,
          [planId, g.goalIndex || 1, g.goalText || '', g.projectedCompletion || null, g.status || 'active']
        );
        const goalId = gRes.insertId;
        for (const o of g.objectives || []) {
          await conn.execute(
            `INSERT INTO clinical_treatment_plan_objectives
             (goal_id, objective_index, objective_text, scale_current, scale_target, measurement_method)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              goalId,
              o.objectiveIndex || 1,
              o.objectiveText || '',
              o.scaleCurrent ?? null,
              o.scaleTarget ?? null,
              o.measurementMethod || null
            ]
          );
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
      `SELECT * FROM clinical_treatment_plan_goals WHERE treatment_plan_id = ? ORDER BY goal_index ASC`,
      [id]
    );
    const outGoals = [];
    for (const g of goals || []) {
      const [objs] = await clinicalPool.execute(
        `SELECT * FROM clinical_treatment_plan_objectives WHERE goal_id = ? ORDER BY objective_index ASC`,
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
}

export default ClinicalTreatmentPlan;
