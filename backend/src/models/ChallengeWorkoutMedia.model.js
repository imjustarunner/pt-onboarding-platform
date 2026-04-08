import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeWorkoutMedia {
  static async listByWorkoutIds(workoutIds = []) {
    const ids = (Array.isArray(workoutIds) ? workoutIds : []).map((v) => toInt(v)).filter(Boolean);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT *
       FROM challenge_workout_media
       WHERE workout_id IN (${placeholders})
       ORDER BY id ASC`,
      ids
    );
    return rows || [];
  }

  static async create({ workoutId, learningClassId, userId, mediaType = 'image', filePath }) {
    const wid = toInt(workoutId);
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const path = String(filePath || '').trim();
    if (!wid || !classId || !uid || !path) return null;
    const allowed = new Set(['image', 'gif', 'treadmill_proof', 'map']);
    const raw = String(mediaType || '').toLowerCase();
    const mType = allowed.has(raw) ? raw : 'image';
    const [result] = await pool.execute(
      `INSERT INTO challenge_workout_media
       (workout_id, learning_class_id, user_id, media_type, file_path)
       VALUES (?, ?, ?, ?, ?)`,
      [wid, classId, uid, mType, path]
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_workout_media WHERE id = ? LIMIT 1`, [result.insertId]);
    return rows?.[0] || null;
  }
}

export default ChallengeWorkoutMedia;
