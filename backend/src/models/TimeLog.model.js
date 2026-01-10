import pool from '../config/database.js';

class TimeLog {
  static async create(timeLogData) {
    const { userId, moduleId, sessionStart, sessionEnd, durationMinutes } = timeLogData;
    const [result] = await pool.execute(
      'INSERT INTO time_logs (user_id, module_id, session_start, session_end, duration_minutes) VALUES (?, ?, ?, ?, ?)',
      [userId, moduleId, sessionStart, sessionEnd, durationMinutes]
    );
    return result.insertId;
  }

  static async findByUser(userId, startDate, endDate) {
    let query = 'SELECT * FROM time_logs WHERE user_id = ?';
    const params = [userId];

    if (startDate) {
      query += ' AND session_start >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND session_start <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY session_start DESC';
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async getTotalTimeByUser(userId) {
    const [rows] = await pool.execute(
      `SELECT 
        SUM(duration_minutes) as total_minutes,
        COUNT(*) as session_count
       FROM time_logs 
       WHERE user_id = ?`,
      [userId]
    );
    return rows[0] || { total_minutes: 0, session_count: 0 };
  }
}

export default TimeLog;

