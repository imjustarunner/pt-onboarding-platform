import pool from '../config/database.js';

class HiringNote {
  static async create({ candidateUserId, authorUserId, message, rating = null, parentNoteId = null }) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO hiring_notes (candidate_user_id, parent_note_id, author_user_id, message, rating)
         VALUES (?, ?, ?, ?, ?)`,
        [candidateUserId, parentNoteId || null, authorUserId, String(message || ''), rating]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        const [result] = await pool.execute(
          `INSERT INTO hiring_notes (candidate_user_id, author_user_id, message, rating)
           VALUES (?, ?, ?, ?)`,
          [candidateUserId, authorUserId, String(message || ''), rating]
        );
        return this.findById(result.insertId);
      }
      throw e;
    }
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT n.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name,
              u.email AS author_email
       FROM hiring_notes n
       LEFT JOIN users u ON u.id = n.author_user_id
       WHERE n.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async listByCandidateUserId(candidateUserId, { limit = 100 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    try {
      const [rows] = await pool.execute(
        `SELECT n.*,
                u.first_name AS author_first_name,
                u.last_name AS author_last_name,
                u.email AS author_email,
                u.profile_photo_path AS author_profile_photo_path
         FROM hiring_notes n
         LEFT JOIN users u ON u.id = n.author_user_id
         WHERE n.candidate_user_id = ?
         ORDER BY n.created_at DESC
         LIMIT ${safeLimit}`,
        [candidateUserId]
      );
      return rows || [];
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        const [rows] = await pool.execute(
          `SELECT n.*,
                  u.first_name AS author_first_name,
                  u.last_name AS author_last_name,
                  u.email AS author_email
           FROM hiring_notes n
           LEFT JOIN users u ON u.id = n.author_user_id
           WHERE n.candidate_user_id = ?
           ORDER BY n.created_at DESC
           LIMIT ${safeLimit}`,
          [candidateUserId]
        );
        return rows || [];
      }
      throw e;
    }
  }
}

export default HiringNote;

