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

class EmployeeEvaluationTemplate {
  static mapRow(row) {
    if (!row) return null;
    return {
      ...row,
      rubric_json: parseJson(row.rubric_json, {}),
      is_supervisor_rubric: !!(row.is_supervisor_rubric === 1 || row.is_supervisor_rubric === true),
      is_active: !!(row.is_active === 1 || row.is_active === true)
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_templates WHERE id = ? LIMIT 1`,
      [id]
    );
    return this.mapRow(rows?.[0]);
  }

  static async findLatestBySlug(agencyId, slug) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_templates
       WHERE agency_id = ? AND slug = ?
       ORDER BY version DESC LIMIT 1`,
      [agencyId, slug]
    );
    return this.mapRow(rows?.[0]);
  }

  static async listForAgency(agencyId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'agency_id = ?' : 'agency_id = ? AND is_active = 1';
    const [rows] = await pool.execute(
      `SELECT t.*
       FROM employee_evaluation_templates t
       INNER JOIN (
         SELECT slug, MAX(version) AS max_version
         FROM employee_evaluation_templates
         WHERE ${where}
         GROUP BY slug
       ) latest ON latest.slug = t.slug AND latest.max_version = t.version
       WHERE t.agency_id = ?
       ORDER BY t.name ASC`,
      includeInactive ? [agencyId, agencyId] : [agencyId, agencyId]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async createVersion({
    agencyId,
    slug,
    name,
    description = null,
    rubricJson,
    isSupervisorRubric = false,
    createdByUserId = null
  }) {
    const latest = await this.findLatestBySlug(agencyId, slug);
    const version = latest ? Number(latest.version || 1) + 1 : 1;
    const [result] = await pool.execute(
      `INSERT INTO employee_evaluation_templates
        (agency_id, slug, name, description, version, rubric_json, is_supervisor_rubric, is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        agencyId,
        slug,
        name,
        description,
        version,
        JSON.stringify(rubricJson || {}),
        isSupervisorRubric ? 1 : 0,
        createdByUserId
      ]
    );
    return this.findById(result.insertId);
  }
}

export default EmployeeEvaluationTemplate;
