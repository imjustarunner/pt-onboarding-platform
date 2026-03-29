import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeCaptainApplication {
  static async listByClass(learningClassId) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT a.*, u.first_name, u.last_name, u.email
       FROM challenge_captain_applications a
       INNER JOIN users u ON u.id = a.user_id
       WHERE a.learning_class_id = ?
       ORDER BY
         CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END ASC,
         a.created_at DESC`,
      [classId]
    );
    return rows || [];
  }

  static async upsertPending({ learningClassId, userId, applicationText = null }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    if (!classId || !uid) return null;
    await pool.execute(
      `INSERT INTO challenge_captain_applications
       (learning_class_id, user_id, status, application_text)
       VALUES (?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE
         status = 'pending',
         application_text = VALUES(application_text),
         manager_notes = NULL,
         reviewed_by_user_id = NULL,
         reviewed_at = NULL`,
      [classId, uid, applicationText ? String(applicationText).trim() : null]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_captain_applications WHERE learning_class_id = ? AND user_id = ? LIMIT 1`,
      [classId, uid]
    );
    return rows?.[0] || null;
  }

  static async findByClassAndUser(learningClassId, userId) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    if (!classId || !uid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_captain_applications WHERE learning_class_id = ? AND user_id = ? LIMIT 1`,
      [classId, uid]
    );
    return rows?.[0] || null;
  }

  static async findById(id) {
    const appId = toInt(id);
    if (!appId) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_captain_applications WHERE id = ? LIMIT 1`,
      [appId]
    );
    return rows?.[0] || null;
  }

  static async review({ id, status, managerNotes = null, reviewedByUserId }) {
    const appId = toInt(id);
    if (!appId) return null;
    const normalized = String(status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(normalized)) return null;
    await pool.execute(
      `UPDATE challenge_captain_applications
       SET status = ?, manager_notes = ?, reviewed_by_user_id = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [normalized, managerNotes ? String(managerNotes).trim() : null, toInt(reviewedByUserId), appId]
    );
    return this.findById(appId);
  }
}

export default ChallengeCaptainApplication;
