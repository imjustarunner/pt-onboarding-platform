import pool from '../config/database.js';

class UserProgress {
  static async findByUserId(userId) {
    const [rows] = await pool.execute(
      `SELECT up.*, m.title, m.description 
       FROM user_progress up 
       JOIN modules m ON up.module_id = m.id 
       WHERE up.user_id = ? 
       ORDER BY m.order_index ASC`,
      [userId]
    );
    return rows;
  }

  static async findByUserAndModule(userId, moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_progress WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    );
    return rows[0] || null;
  }

  static async createOrUpdate(userId, moduleId, progressData) {
    const existing = await this.findByUserAndModule(userId, moduleId);
    
    if (existing) {
      const { status, timeSpentMinutes } = progressData;
      const updates = [];
      const values = [];

      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
        if (status === 'in_progress' && !existing.started_at) {
          updates.push('started_at = CURRENT_TIMESTAMP');
        }
        if (status === 'completed' && !existing.completed_at) {
          updates.push('completed_at = CURRENT_TIMESTAMP');
        }
      }
      if (timeSpentMinutes !== undefined) {
        updates.push('time_spent_minutes = time_spent_minutes + ?');
        values.push(timeSpentMinutes);
      }

      if (updates.length > 0) {
        values.push(userId, moduleId);
        await pool.execute(
          `UPDATE user_progress SET ${updates.join(', ')} WHERE user_id = ? AND module_id = ?`,
          values
        );
      }
      return this.findByUserAndModule(userId, moduleId);
    } else {
      const { status } = progressData;
      const [result] = await pool.execute(
        `INSERT INTO user_progress (user_id, module_id, status, started_at) 
         VALUES (?, ?, ?, ?)`,
        [userId, moduleId, status || 'in_progress', status === 'in_progress' ? new Date() : null]
      );
      return this.findByUserAndModule(userId, moduleId);
    }
  }

  static async logTime(userId, moduleId, durationMinutes) {
    const durationSeconds = durationMinutes * 60;
    await pool.execute(
      `UPDATE user_progress 
       SET time_spent_minutes = time_spent_minutes + ?,
           time_spent_seconds = time_spent_seconds + ?
       WHERE user_id = ? AND module_id = ?`,
      [durationMinutes, durationSeconds, userId, moduleId]
    );
  }

  static async resetModule(userId, moduleId, actorUserId) {
    // Reset progress to not_started, clear time, clear timestamps
    await pool.execute(
      `UPDATE user_progress 
       SET status = 'not_started',
           started_at = NULL,
           completed_at = NULL,
           time_spent_minutes = 0,
           time_spent_seconds = 0,
           overridden_by_user_id = NULL,
           overridden_at = NULL
       WHERE user_id = ? AND module_id = ?`,
      [userId, moduleId]
    );
    return this.findByUserAndModule(userId, moduleId);
  }

  static async markComplete(userId, moduleId, actorUserId) {
    const existing = await this.findByUserAndModule(userId, moduleId);
    
    if (existing) {
      await pool.execute(
        `UPDATE user_progress 
         SET status = 'completed',
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             overridden_by_user_id = ?,
             overridden_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND module_id = ?`,
        [actorUserId, userId, moduleId]
      );
    } else {
      await pool.execute(
        `INSERT INTO user_progress (user_id, module_id, status, started_at, completed_at, overridden_by_user_id, overridden_at)
         VALUES (?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`,
        [userId, moduleId, actorUserId]
      );
    }
    return this.findByUserAndModule(userId, moduleId);
  }

  static async getProgressByAgency(agencyId, userId = null) {
    let query = `
      SELECT up.*, 
             m.title as module_title,
             m.track_id,
             t.name as track_name,
             a.id as agency_id,
             a.name as agency_name
      FROM user_progress up
      JOIN modules m ON up.module_id = m.id
      LEFT JOIN training_tracks t ON m.track_id = t.id
      JOIN user_agencies ua ON up.user_id = ua.user_id
      JOIN agencies a ON ua.agency_id = a.id
      WHERE ua.agency_id = ?
    `;
    const params = [agencyId];

    if (userId) {
      query += ' AND up.user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY up.user_id, t.name, m.order_index';

    const [rows] = await pool.execute(query, params);
    return rows;
  }
}

export default UserProgress;

