import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeWorkoutComment {
  static async listByWorkout(workoutId) {
    const wid = toInt(workoutId);
    if (!wid) return [];
    const [rows] = await pool.execute(
      `SELECT c.*, u.first_name, u.last_name
       FROM challenge_workout_comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.workout_id = ?
       ORDER BY c.created_at ASC, c.id ASC`,
      [wid]
    );
    return rows || [];
  }

  static async create({ workoutId, learningClassId, userId, commentText }) {
    const wid = toInt(workoutId);
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const text = String(commentText || '').trim();
    if (!wid || !classId || !uid || !text) return null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_workout_comments
       (workout_id, learning_class_id, user_id, comment_text)
       VALUES (?, ?, ?, ?)`,
      [wid, classId, uid, text]
    );
    const [rows] = await pool.execute(
      `SELECT c.*, u.first_name, u.last_name
       FROM challenge_workout_comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = ? LIMIT 1`,
      [result.insertId]
    );
    return rows?.[0] || null;
  }

  static async findById(id) {
    const cid = toInt(id);
    if (!cid) return null;
    const [rows] = await pool.execute(`SELECT * FROM challenge_workout_comments WHERE id = ? LIMIT 1`, [cid]);
    return rows?.[0] || null;
  }

  static async remove(id) {
    const cid = toInt(id);
    if (!cid) return false;
    const [result] = await pool.execute(`DELETE FROM challenge_workout_comments WHERE id = ?`, [cid]);
    return Number(result?.affectedRows || 0) > 0;
  }
}

export default ChallengeWorkoutComment;
