import pool from '../config/database.js';

class QuizAttempt {
  static async findByUserAndModule(userId, moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM quiz_attempts WHERE user_id = ? AND module_id = ? ORDER BY completed_at DESC',
      [userId, moduleId]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM quiz_attempts WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async create(attemptData) {
    const { userId, moduleId, score, answers } = attemptData;
    const [result] = await pool.execute(
      'INSERT INTO quiz_attempts (user_id, module_id, score, answers) VALUES (?, ?, ?, ?)',
      [userId, moduleId, score, JSON.stringify(answers)]
    );
    return this.findById(result.insertId);
  }

  static async getAttemptsByAgency(agencyId, userId = null) {
    let query = `
      SELECT qa.*, 
             m.title as module_title,
             m.track_id,
             t.name as track_name
      FROM quiz_attempts qa
      JOIN modules m ON qa.module_id = m.id
      LEFT JOIN training_tracks t ON m.track_id = t.id
      JOIN user_agencies ua ON qa.user_id = ua.user_id
      WHERE ua.agency_id = ?
    `;
    const params = [agencyId];

    if (userId) {
      query += ' AND qa.user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY qa.completed_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows.map(row => ({
      ...row,
      answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
    }));
  }

  static async deleteAttempts(userId, moduleId) {
    const [result] = await pool.execute(
      'DELETE FROM quiz_attempts WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    );
    return result.affectedRows;
  }

  static async getLatestAttempt(userId, moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM quiz_attempts WHERE user_id = ? AND module_id = ? ORDER BY completed_at DESC LIMIT 1',
      [userId, moduleId]
    );
    if (rows.length === 0) return null;
    const attempt = rows[0];
    return {
      ...attempt,
      answers: typeof attempt.answers === 'string' ? JSON.parse(attempt.answers) : attempt.answers
    };
  }

  static async getAttemptCount(userId, moduleId) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    );
    return rows[0].count;
  }
}

export default QuizAttempt;

