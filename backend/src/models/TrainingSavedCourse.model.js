import pool from '../config/database.js';

class TrainingSavedCourse {
  static async listByUser(userId) {
    const [rows] = await pool.execute(
      `SELECT id, user_id, item_type, item_id, created_at
       FROM training_saved_courses
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      itemType: r.item_type,
      itemId: r.item_id,
      createdAt: r.created_at
    }));
  }

  static async save(userId, itemType, itemId) {
    await pool.execute(
      `INSERT INTO training_saved_courses (user_id, item_type, item_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [userId, itemType, itemId]
    );
    return this.listByUser(userId);
  }

  static async remove(userId, itemType, itemId) {
    await pool.execute(
      `DELETE FROM training_saved_courses
       WHERE user_id = ? AND item_type = ? AND item_id = ?`,
      [userId, itemType, itemId]
    );
    return true;
  }

  static async isSaved(userId, itemType, itemId) {
    const [rows] = await pool.execute(
      `SELECT id FROM training_saved_courses
       WHERE user_id = ? AND item_type = ? AND item_id = ?
       LIMIT 1`,
      [userId, itemType, itemId]
    );
    return !!rows[0];
  }
}

export default TrainingSavedCourse;
