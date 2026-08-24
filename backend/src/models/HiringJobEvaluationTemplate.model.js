import pool from '../config/database.js';

class HiringJobEvaluationTemplate {
  static async listForJob(jobDescriptionId) {
    const [rows] = await pool.execute(
      `SELECT hjet.*, t.slug, t.name AS template_name, t.version, t.is_supervisor_rubric, t.rubric_json
       FROM hiring_job_evaluation_templates hjet
       JOIN employee_evaluation_templates t ON t.id = hjet.template_id
       WHERE hjet.job_description_id = ?
       ORDER BY hjet.is_primary DESC, hjet.sort_order ASC, hjet.id ASC`,
      [jobDescriptionId]
    );
    return rows || [];
  }

  static async setPrimary({ agencyId, jobDescriptionId, templateId }) {
    await pool.execute(
      `DELETE FROM hiring_job_evaluation_templates
       WHERE agency_id = ? AND job_description_id = ? AND is_primary = 1`,
      [agencyId, jobDescriptionId]
    );
    await pool.execute(
      `INSERT INTO hiring_job_evaluation_templates
        (agency_id, job_description_id, template_id, is_primary, sort_order)
       VALUES (?, ?, ?, 1, 0)
       ON DUPLICATE KEY UPDATE is_primary = 1, sort_order = 0`,
      [agencyId, jobDescriptionId, templateId]
    );
    return this.listForJob(jobDescriptionId);
  }
}

export default HiringJobEvaluationTemplate;
