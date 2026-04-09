import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const BACKEND_URL = process.env.BACKEND_URL || '';

/** Resolve a stored file path to a public URL. */
const resolveUrl = (filePath) =>
  filePath ? `${BACKEND_URL}/uploads/${String(filePath).replace(/^uploads\//, '')}` : null;

class ChallengeWorkoutComment {
  static async listByWorkout(workoutId) {
    const wid = toInt(workoutId);
    if (!wid) return [];
    let rows;
    try {
      [rows] = await pool.execute(
        `SELECT c.*, u.first_name, u.last_name,
                i.file_path AS icon_file_path
         FROM challenge_workout_comments c
         INNER JOIN users u ON u.id = c.user_id
         LEFT JOIN icons i ON i.id = c.icon_id
         WHERE c.workout_id = ?
         ORDER BY COALESCE(c.parent_comment_id, c.id) ASC, c.id ASC`,
        [wid]
      );
    } catch {
      // icon_id column may not exist yet (migration 694 pending) — fall back
      [rows] = await pool.execute(
        `SELECT c.*, u.first_name, u.last_name
         FROM challenge_workout_comments c
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.workout_id = ?
         ORDER BY COALESCE(c.parent_comment_id, c.id) ASC, c.id ASC`,
        [wid]
      );
    }
    return (rows || []).map((r) => ({
      ...r,
      attachment_url: resolveUrl(r.attachment_path),
      icon_url: r.icon_file_path ? resolveUrl(r.icon_file_path) : null
    }));
  }

  static async create({ workoutId, learningClassId, userId, commentText, parentCommentId = null, attachmentPath = null, iconId = null }) {
    const wid = toInt(workoutId);
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const text = String(commentText || '').trim();
    const parentId = parentCommentId ? toInt(parentCommentId) : null;
    const iconIdInt = iconId ? toInt(iconId) : null;
    // Allow empty text only when attachment or icon is provided
    if (!wid || !classId || !uid || (!text && !attachmentPath && !iconIdInt)) return null;

    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO challenge_workout_comments
         (workout_id, learning_class_id, user_id, comment_text, parent_comment_id, attachment_path, icon_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [wid, classId, uid, text || null, parentId, attachmentPath || null, iconIdInt]
      );
    } catch {
      // Migration 694 columns not yet applied — fall back to base columns
      [result] = await pool.execute(
        `INSERT INTO challenge_workout_comments
         (workout_id, learning_class_id, user_id, comment_text, parent_comment_id)
         VALUES (?, ?, ?, ?, ?)`,
        [wid, classId, uid, text || '', parentId]
      );
    }

    const [rows] = await pool.execute(
      `SELECT c.*, u.first_name, u.last_name
       FROM challenge_workout_comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = ? LIMIT 1`,
      [result.insertId]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    return {
      ...row,
      attachment_url: resolveUrl(row.attachment_path),
      icon_url: null
    };
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
