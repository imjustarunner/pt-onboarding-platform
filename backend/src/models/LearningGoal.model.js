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

const normalizeGoal = (row) => ({
  ...row,
  metadata_json: parseJson(row.metadata_json, {})
});

class LearningGoal {
  static async create(payload, actorUserId) {
    const {
      clientId,
      programContextType = 'custom',
      programContextId = null,
      domainId,
      subdomainId = null,
      standardId = null,
      skillId,
      measurementType,
      baselineValue = null,
      baselineRubricLevel = null,
      targetValue = null,
      targetRubricLevel = null,
      startDate,
      targetDate,
      status = 'draft',
      notes = null,
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO learning_goals
       (client_id, program_context_type, program_context_id, domain_id, subdomain_id, standard_id, skill_id,
        measurement_type, baseline_value, baseline_rubric_level, target_value, target_rubric_level,
        start_date, target_date, status, notes, metadata_json, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        programContextType,
        programContextId,
        domainId,
        subdomainId,
        standardId,
        skillId,
        measurementType,
        baselineValue,
        baselineRubricLevel,
        targetValue,
        targetRubricLevel,
        startDate,
        targetDate,
        status,
        notes,
        metadata ? JSON.stringify(metadata) : null,
        actorUserId || null,
        actorUserId || null
      ]
    );

    return this.findById(result.insertId);
  }

  static async update(goalId, payload, actorUserId) {
    const updates = [];
    const values = [];
    const map = {
      programContextType: 'program_context_type',
      programContextId: 'program_context_id',
      domainId: 'domain_id',
      subdomainId: 'subdomain_id',
      standardId: 'standard_id',
      skillId: 'skill_id',
      measurementType: 'measurement_type',
      baselineValue: 'baseline_value',
      baselineRubricLevel: 'baseline_rubric_level',
      targetValue: 'target_value',
      targetRubricLevel: 'target_rubric_level',
      startDate: 'start_date',
      targetDate: 'target_date',
      status: 'status',
      notes: 'notes'
    };

    Object.keys(map).forEach((inputKey) => {
      if (Object.prototype.hasOwnProperty.call(payload, inputKey)) {
        updates.push(`${map[inputKey]} = ?`);
        values.push(payload[inputKey]);
      }
    });

    if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
      updates.push('metadata_json = ?');
      values.push(payload.metadata ? JSON.stringify(payload.metadata) : null);
    }

    updates.push('updated_by_user_id = ?');
    values.push(actorUserId || null);

    if (!updates.length) {
      return this.findById(goalId);
    }

    values.push(goalId);
    await pool.execute(`UPDATE learning_goals SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(goalId);
  }

  static async activate(goalId, actorUserId) {
    await pool.execute(
      `UPDATE learning_goals
       SET status = 'active', updated_by_user_id = ?
       WHERE id = ?`,
      [actorUserId || null, goalId]
    );
    return this.findById(goalId);
  }

  static async archive(goalId, actorUserId) {
    await pool.execute(
      `UPDATE learning_goals
       SET status = 'closed', updated_by_user_id = ?
       WHERE id = ?`,
      [actorUserId || null, goalId]
    );
    return this.findById(goalId);
  }

  static async findById(goalId) {
    const [rows] = await pool.execute(
      `SELECT lg.*, d.title AS domain_title, sd.title AS subdomain_title,
              st.code AS standard_code, sk.title AS skill_title
       FROM learning_goals lg
       JOIN learning_standards_domains d ON d.id = lg.domain_id
       LEFT JOIN learning_standards_subdomains sd ON sd.id = lg.subdomain_id
       LEFT JOIN learning_standards st ON st.id = lg.standard_id
       JOIN learning_skills sk ON sk.id = lg.skill_id
       WHERE lg.id = ?`,
      [goalId]
    );
    return rows[0] ? normalizeGoal(rows[0]) : null;
  }

  static async listByClient(clientId) {
    const [rows] = await pool.execute(
      `SELECT lg.*, d.title AS domain_title, sd.title AS subdomain_title,
              st.code AS standard_code, sk.title AS skill_title
       FROM learning_goals lg
       JOIN learning_standards_domains d ON d.id = lg.domain_id
       LEFT JOIN learning_standards_subdomains sd ON sd.id = lg.subdomain_id
       LEFT JOIN learning_standards st ON st.id = lg.standard_id
       JOIN learning_skills sk ON sk.id = lg.skill_id
       WHERE lg.client_id = ?
       ORDER BY FIELD(lg.status, 'active', 'draft', 'paused', 'achieved', 'closed'), lg.target_date ASC`,
      [clientId]
    );
    return rows.map(normalizeGoal);
  }

  static async suggestFromRecentEvidence(clientId, { days = 30 } = {}) {
    const [rows] = await pool.execute(
      `SELECT le.domain_id, le.subdomain_id, le.standard_id, le.skill_id,
              COUNT(*) AS evidence_count,
              AVG(CASE WHEN le.score_value IS NULL THEN 0 ELSE le.score_value END) AS avg_score,
              MAX(le.observed_at) AS latest_observed_at
       FROM learning_evidence le
       WHERE le.client_id = ?
         AND le.observed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
       GROUP BY le.domain_id, le.subdomain_id, le.standard_id, le.skill_id
       ORDER BY avg_score ASC, evidence_count DESC
       LIMIT 5`,
      [clientId, days]
    );

    return rows;
  }
}

export default LearningGoal;
