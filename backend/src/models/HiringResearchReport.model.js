import pool from '../config/database.js';

class HiringResearchReport {
  static async create({
    candidateUserId,
    status = 'pending',
    reportText = null,
    reportJson = null,
    createdByUserId,
    isAiGenerated = false
  }) {
    const reportJsonText = reportJson ? JSON.stringify(reportJson) : null;

    // Backward compatibility: older DBs may not have is_ai_generated yet.
    try {
      const [result] = await pool.execute(
        `INSERT INTO hiring_research_reports (
          candidate_user_id, status, report_text, report_json, is_ai_generated, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [candidateUserId, status, reportText, reportJsonText, isAiGenerated ? 1 : 0, createdByUserId]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        const [result] = await pool.execute(
          `INSERT INTO hiring_research_reports (candidate_user_id, status, report_text, report_json, created_by_user_id)
           VALUES (?, ?, ?, ?, ?)`,
          [candidateUserId, status, reportText, reportJsonText, createdByUserId]
        );
        return this.findById(result.insertId);
      }
      throw e;
    }
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT r.*,
              u.first_name AS created_by_first_name,
              u.last_name AS created_by_last_name,
              u.email AS created_by_email
       FROM hiring_research_reports r
       LEFT JOIN users u ON u.id = r.created_by_user_id
       WHERE r.id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows[0] || null;
    if (!row) return null;
    return {
      ...row,
      report_json: this.parseJson(row.report_json)
    };
  }

  static async findLatestByCandidateUserId(candidateUserId) {
    const [rows] = await pool.execute(
      `SELECT r.*,
              u.first_name AS created_by_first_name,
              u.last_name AS created_by_last_name,
              u.email AS created_by_email
       FROM hiring_research_reports r
       LEFT JOIN users u ON u.id = r.created_by_user_id
       WHERE r.candidate_user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [candidateUserId]
    );
    const row = rows[0] || null;
    if (!row) return null;
    return {
      ...row,
      report_json: this.parseJson(row.report_json)
    };
  }

  static async findLatestAiByCandidateUserId(candidateUserId) {
    // Backward compatibility: if column doesn't exist, just return null.
    try {
      const [rows] = await pool.execute(
        `SELECT r.*,
                u.first_name AS created_by_first_name,
                u.last_name AS created_by_last_name,
                u.email AS created_by_email
         FROM hiring_research_reports r
         LEFT JOIN users u ON u.id = r.created_by_user_id
         WHERE r.candidate_user_id = ?
           AND r.is_ai_generated = 1
         ORDER BY r.created_at DESC
         LIMIT 1`,
        [candidateUserId]
      );
      const row = rows[0] || null;
      if (!row) return null;
      return {
        ...row,
        report_json: this.parseJson(row.report_json)
      };
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') return null;
      throw e;
    }
  }

  static parseJson(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
}

export default HiringResearchReport;

