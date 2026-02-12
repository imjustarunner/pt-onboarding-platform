import pool from '../config/database.js';

class LearningService {
  static async listByAgency({ agencyId, activeOnly = true }) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const where = activeOnly ? 'AND is_active = TRUE' : '';
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_services
       WHERE agency_id = ?
       ${where}
       ORDER BY name ASC, id ASC`,
      [aid]
    );
    return rows || [];
  }
}

export default LearningService;
