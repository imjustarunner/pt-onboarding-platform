import pool from '../config/database.js';

class EmployeeEvaluationActivity {
  static async create({ cycleId, actorUserId = null, eventType, detail = null }) {
    const [result] = await pool.execute(
      `INSERT INTO employee_evaluation_activity (cycle_id, actor_user_id, event_type, detail_json)
       VALUES (?, ?, ?, ?)`,
      [cycleId, actorUserId, eventType, detail ? JSON.stringify(detail) : null]
    );
    return result.insertId;
  }

  static async listForCycle(cycleId) {
    const [rows] = await pool.execute(
      `SELECT a.*,
              CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS actor_name
       FROM employee_evaluation_activity a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.cycle_id = ?
       ORDER BY a.created_at ASC, a.id ASC`,
      [cycleId]
    );
    return rows || [];
  }
}

export default EmployeeEvaluationActivity;
