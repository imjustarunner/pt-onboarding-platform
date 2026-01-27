import pool from '../config/database.js';

class HiringProfile {
  static async upsert({ candidateUserId, stage = 'applied', appliedRole = null, source = null }) {
    const [result] = await pool.execute(
      `INSERT INTO hiring_profiles (candidate_user_id, stage, applied_role, source)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         stage = VALUES(stage),
         applied_role = VALUES(applied_role),
         source = VALUES(source)`,
      [candidateUserId, stage, appliedRole, source]
    );

    // For UPDATE, insertId may be 0; always fetch by candidate id.
    return this.findByCandidateUserId(candidateUserId);
  }

  static async findByCandidateUserId(candidateUserId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM hiring_profiles
       WHERE candidate_user_id = ?
       LIMIT 1`,
      [candidateUserId]
    );
    return rows[0] || null;
  }
}

export default HiringProfile;

