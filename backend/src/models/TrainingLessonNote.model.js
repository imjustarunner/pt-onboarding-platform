import pool from '../config/database.js';

class TrainingLessonNote {
  static async findByUserAndModule(userId, moduleId) {
    const [rows] = await pool.execute(
      `SELECT id, user_id, module_id, notes, created_at, updated_at
       FROM training_lesson_notes
       WHERE user_id = ? AND module_id = ?
       LIMIT 1`,
      [userId, moduleId]
    );
    return rows[0] || null;
  }

  static async upsert(userId, moduleId, notes) {
    await pool.execute(
      `INSERT INTO training_lesson_notes (user_id, module_id, notes)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes)`,
      [userId, moduleId, notes ?? '']
    );
    return this.findByUserAndModule(userId, moduleId);
  }
}

export default TrainingLessonNote;
