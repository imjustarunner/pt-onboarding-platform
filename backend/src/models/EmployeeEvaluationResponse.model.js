import pool from '../config/database.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class EmployeeEvaluationResponse {
  static mapRow(row) {
    if (!row) return null;
    return {
      ...row,
      rubric_snapshot_json: parseJson(row.rubric_snapshot_json, {}),
      ratings_json: parseJson(row.ratings_json, {}),
      section_action_items_json: parseJson(row.section_action_items_json, {}),
      reflection_json: parseJson(row.reflection_json, {}),
      is_supervisor_rubric: !!(row.is_supervisor_rubric === 1 || row.is_supervisor_rubric === true)
    };
  }

  static async listForCycle(cycleId) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_responses
       WHERE cycle_id = ?
       ORDER BY is_supervisor_rubric ASC, id ASC`,
      [cycleId]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_responses WHERE id = ? LIMIT 1`,
      [id]
    );
    return this.mapRow(rows?.[0]);
  }

  static async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO employee_evaluation_responses
        (cycle_id, template_id, template_slug, template_name, is_supervisor_rubric,
         rubric_snapshot_json, ratings_json, section_action_items_json, reflection_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.cycleId,
        data.templateId || null,
        data.templateSlug,
        data.templateName,
        data.isSupervisorRubric ? 1 : 0,
        JSON.stringify(data.rubricSnapshot || {}),
        JSON.stringify(data.ratings || {}),
        JSON.stringify(data.sectionActionItems || {}),
        JSON.stringify(data.reflection || {}),
        data.status || 'draft'
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateDraft(id, patch = {}) {
    const sets = [];
    const params = [];
    if (patch.ratings !== undefined) {
      sets.push('ratings_json = ?');
      params.push(JSON.stringify(patch.ratings || {}));
    }
    if (patch.sectionActionItems !== undefined) {
      sets.push('section_action_items_json = ?');
      params.push(JSON.stringify(patch.sectionActionItems || {}));
    }
    if (patch.reflection !== undefined) {
      sets.push('reflection_json = ?');
      params.push(JSON.stringify(patch.reflection || {}));
    }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.submittedAt !== undefined) {
      sets.push('submitted_at = ?');
      params.push(patch.submittedAt);
    }
    if (!sets.length) return this.findById(id);
    params.push(id);
    await pool.execute(
      `UPDATE employee_evaluation_responses SET ${sets.join(', ')} WHERE id = ? LIMIT 1`,
      params
    );
    return this.findById(id);
  }
}

export default EmployeeEvaluationResponse;
