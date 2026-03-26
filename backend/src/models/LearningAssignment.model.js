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

const normalize = (row) => ({
  ...row,
  metadata_json: parseJson(row.metadata_json, {})
});

class LearningAssignment {
  static async create(payload, actorUserId) {
    const {
      clientId,
      title,
      description = null,
      domainId,
      subdomainId = null,
      standardId = null,
      skillId,
      deliveryMethod = 'at_home',
      sourceType = 'manual',
      status = 'assigned',
      assignedAt = new Date(),
      dueAt = null,
      metadata = null,
      goalIds = []
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO learning_assignments
       (client_id, title, description, domain_id, subdomain_id, standard_id, skill_id,
        delivery_method, source_type, status, assigned_by_user_id, assigned_at, due_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        title,
        description,
        domainId,
        subdomainId,
        standardId,
        skillId,
        deliveryMethod,
        sourceType,
        status,
        actorUserId || null,
        assignedAt,
        dueAt,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    if (Array.isArray(goalIds) && goalIds.length) {
      const links = goalIds
        .map((goalId) => [result.insertId, Number(goalId)])
        .filter(([, goalId]) => Number.isInteger(goalId) && goalId > 0);
      if (links.length) {
        await pool.query(
          `INSERT IGNORE INTO learning_assignment_goals (assignment_id, goal_id) VALUES ?`,
          [links]
        );
      }
    }

    return this.findById(result.insertId);
  }

  static async findById(assignmentId) {
    const [rows] = await pool.execute(
      `SELECT la.*, d.title AS domain_title, sd.title AS subdomain_title,
              st.code AS standard_code, sk.title AS skill_title
       FROM learning_assignments la
       JOIN learning_standards_domains d ON d.id = la.domain_id
       LEFT JOIN learning_standards_subdomains sd ON sd.id = la.subdomain_id
       LEFT JOIN learning_standards st ON st.id = la.standard_id
       JOIN learning_skills sk ON sk.id = la.skill_id
       WHERE la.id = ?`,
      [assignmentId]
    );

    if (!rows[0]) return null;
    const assignment = normalize(rows[0]);
    const [goalRows] = await pool.execute(
      `SELECT goal_id
       FROM learning_assignment_goals
       WHERE assignment_id = ?`,
      [assignmentId]
    );
    assignment.goal_ids = goalRows.map((row) => row.goal_id);
    return assignment;
  }

  static async createSubmission(assignmentId, payload, actorUserId) {
    const { submissionMode, responseText = null, fileUrl = null, metadata = null } = payload;
    const [result] = await pool.execute(
      `INSERT INTO learning_assignment_submissions
       (assignment_id, submitted_by_user_id, submission_mode, response_text, file_url, metadata_json, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        assignmentId,
        actorUserId || null,
        submissionMode,
        responseText,
        fileUrl,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    await pool.execute(
      `UPDATE learning_assignments
       SET status = 'submitted', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assignmentId]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM learning_assignment_submissions WHERE id = ?`,
      [result.insertId]
    );
    return rows[0] ? normalize(rows[0]) : null;
  }

  static async createEvaluation(assignmentId, payload, actorUserId) {
    const {
      submissionId = null,
      scoreValue = null,
      rubricLevel = null,
      completionStatus = 'completed',
      observationalNotes = null,
      confidenceScore = null,
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO learning_assignment_evaluations
       (assignment_id, submission_id, evaluator_user_id, score_value, rubric_level, completion_status,
        observational_notes, confidence_score, metadata_json, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        assignmentId,
        submissionId,
        actorUserId || null,
        scoreValue,
        rubricLevel,
        completionStatus,
        observationalNotes,
        confidenceScore,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    await pool.execute(
      `UPDATE learning_assignments
       SET status = 'evaluated', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assignmentId]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM learning_assignment_evaluations WHERE id = ?`,
      [result.insertId]
    );
    return rows[0] ? normalize(rows[0]) : null;
  }
}

export default LearningAssignment;
