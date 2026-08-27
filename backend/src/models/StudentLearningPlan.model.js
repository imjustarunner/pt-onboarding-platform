import pool from '../config/database.js';

const parseJson = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizePlan = (row) => {
  if (!row) return null;
  return {
    ...row,
    strengths_json: parseJson(row.strengths_json, []),
    priority_needs_json: parseJson(row.priority_needs_json, []),
    instructional_strategies_json: parseJson(row.instructional_strategies_json, []),
    progress_monitoring_plan_json: parseJson(row.progress_monitoring_plan_json, {}),
    metadata_json: parseJson(row.metadata_json, {})
  };
};

const normalizeGoal = (row) => {
  if (!row) return null;
  return {
    ...row,
    standards_refs_json: parseJson(row.standards_refs_json, []),
    metadata_json: parseJson(row.metadata_json, {})
  };
};

const normalizeObjective = (row) => {
  if (!row) return null;
  return {
    ...row,
    metadata_json: parseJson(row.metadata_json, {})
  };
};

class StudentLearningPlan {
  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      evaluationSummaryId = null,
      title,
      status = 'draft',
      strengths = [],
      priorityNeeds = [],
      instructionalStrategies = [],
      progressMonitoringPlan = {},
      standardsVersionKey = null,
      parentSummary = null,
      effectiveFrom = null,
      effectiveTo = null,
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO student_learning_plans
       (agency_id, client_id, student_subject_id, evaluation_summary_id, title, status,
        strengths_json, priority_needs_json, instructional_strategies_json,
        progress_monitoring_plan_json, standards_version_key, parent_summary,
        effective_from, effective_to, metadata_json, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        evaluationSummaryId,
        title,
        status,
        JSON.stringify(strengths || []),
        JSON.stringify(priorityNeeds || []),
        JSON.stringify(instructionalStrategies || []),
        JSON.stringify(progressMonitoringPlan || {}),
        standardsVersionKey,
        parentSummary,
        effectiveFrom,
        effectiveTo,
        metadata ? JSON.stringify(metadata) : null,
        actorUserId || null,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM student_learning_plans WHERE id = ? LIMIT 1`, [id]);
    return normalizePlan(rows[0] || null);
  }

  static async listBySubject(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT * FROM student_learning_plans WHERE student_subject_id = ? ORDER BY FIELD(status,'active','pending_review','draft','superseded','archived'), created_at DESC`,
      [studentSubjectId]
    );
    return rows.map(normalizePlan);
  }

  static async findActiveBySubject(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT * FROM student_learning_plans WHERE student_subject_id = ? AND status = 'active' ORDER BY approved_at DESC, id DESC LIMIT 1`,
      [studentSubjectId]
    );
    return normalizePlan(rows[0] || null);
  }

  static async update(id, payload, actorUserId) {
    const map = {
      title: 'title',
      status: 'status',
      evaluationSummaryId: 'evaluation_summary_id',
      standardsVersionKey: 'standards_version_key',
      parentSummary: 'parent_summary',
      effectiveFrom: 'effective_from',
      effectiveTo: 'effective_to',
      aiArtifactId: 'ai_artifact_id'
    };
    const updates = [];
    const values = [];
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${map[key]} = ?`);
        values.push(payload[key]);
      }
    });
    const jsonFields = [
      ['strengths', 'strengths_json'],
      ['priorityNeeds', 'priority_needs_json'],
      ['instructionalStrategies', 'instructional_strategies_json'],
      ['progressMonitoringPlan', 'progress_monitoring_plan_json'],
      ['metadata', 'metadata_json']
    ];
    for (const [key, col] of jsonFields) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${col} = ?`);
        values.push(payload[key] != null ? JSON.stringify(payload[key]) : null);
      }
    }
    if (!updates.length) return this.findById(id);
    updates.push('updated_by_user_id = ?');
    values.push(actorUserId || null);
    values.push(id);
    await pool.execute(`UPDATE student_learning_plans SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async approve(id, actorUserId) {
    await pool.execute(
      `UPDATE student_learning_plans
       SET status = 'active', approved_at = NOW(), approved_by_user_id = ?, updated_by_user_id = ?
       WHERE id = ?`,
      [actorUserId || null, actorUserId || null, id]
    );
    // Supersede other active plans for the same subject
    const plan = await this.findById(id);
    if (plan) {
      await pool.execute(
        `UPDATE student_learning_plans
         SET status = 'superseded', updated_by_user_id = ?
         WHERE student_subject_id = ? AND id <> ? AND status = 'active'`,
        [actorUserId || null, plan.student_subject_id, id]
      );
    }
    return this.findById(id);
  }

  static async addGoal(payload) {
    const {
      learningPlanId,
      studentSubjectId,
      learningGoalId = null,
      title,
      description = null,
      skillKey = null,
      skillLabel = null,
      baselineText = null,
      successCriteria = null,
      measurementMethod = null,
      status = 'not_assessed',
      sortOrder = 0,
      standardsRefs = [],
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO student_learning_plan_goals
       (learning_plan_id, student_subject_id, learning_goal_id, title, description, skill_key, skill_label,
        baseline_text, success_criteria, measurement_method, status, sort_order, standards_refs_json, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        learningPlanId,
        studentSubjectId,
        learningGoalId,
        title,
        description,
        skillKey,
        skillLabel,
        baselineText,
        successCriteria,
        measurementMethod,
        status,
        sortOrder,
        JSON.stringify(standardsRefs || []),
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findGoalById(result.insertId);
  }

  static async findGoalById(id) {
    const [rows] = await pool.execute(`SELECT * FROM student_learning_plan_goals WHERE id = ? LIMIT 1`, [id]);
    return normalizeGoal(rows[0] || null);
  }

  static async listGoals(learningPlanId) {
    const [rows] = await pool.execute(
      `SELECT * FROM student_learning_plan_goals WHERE learning_plan_id = ? ORDER BY sort_order ASC, id ASC`,
      [learningPlanId]
    );
    return rows.map(normalizeGoal);
  }

  static async updateGoal(id, payload) {
    const map = {
      title: 'title',
      description: 'description',
      skillKey: 'skill_key',
      skillLabel: 'skill_label',
      baselineText: 'baseline_text',
      successCriteria: 'success_criteria',
      measurementMethod: 'measurement_method',
      status: 'status',
      sortOrder: 'sort_order',
      learningGoalId: 'learning_goal_id'
    };
    const updates = [];
    const values = [];
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${map[key]} = ?`);
        values.push(payload[key]);
      }
    });
    if (Object.prototype.hasOwnProperty.call(payload, 'standardsRefs')) {
      updates.push('standards_refs_json = ?');
      values.push(JSON.stringify(payload.standardsRefs || []));
    }
    if (!updates.length) return this.findGoalById(id);
    values.push(id);
    await pool.execute(`UPDATE student_learning_plan_goals SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findGoalById(id);
  }

  static async addObjective(payload) {
    const {
      planGoalId,
      learningPlanId,
      title,
      description = null,
      status = 'not_started',
      sortOrder = 0,
      targetDate = null,
      metadata = null
    } = payload;
    const [result] = await pool.execute(
      `INSERT INTO student_learning_plan_objectives
       (plan_goal_id, learning_plan_id, title, description, status, sort_order, target_date, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        planGoalId,
        learningPlanId,
        title,
        description,
        status,
        sortOrder,
        targetDate,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM student_learning_plan_objectives WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return normalizeObjective(rows[0] || null);
  }

  static async listObjectives(learningPlanId) {
    const [rows] = await pool.execute(
      `SELECT * FROM student_learning_plan_objectives WHERE learning_plan_id = ? ORDER BY sort_order ASC, id ASC`,
      [learningPlanId]
    );
    return rows.map(normalizeObjective);
  }

  static async getPlanBundle(id) {
    const plan = await this.findById(id);
    if (!plan) return null;
    const goals = await this.listGoals(id);
    const objectives = await this.listObjectives(id);
    return { plan, goals, objectives };
  }
}

export default StudentLearningPlan;
