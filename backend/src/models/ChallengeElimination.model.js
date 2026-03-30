/**
 * ChallengeElimination model
 * Tracks who was eliminated each week. Eliminated users are booted completely.
 */
import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeElimination {
  static async isEliminated(learningClassId, providerUserId) {
    const classId = toInt(learningClassId);
    const pId = toInt(providerUserId);
    if (!classId || !pId) return false;
    const [rows] = await pool.execute(
      `SELECT 1 FROM challenge_eliminations WHERE learning_class_id = ? AND provider_user_id = ? LIMIT 1`,
      [classId, pId]
    );
    return (rows?.length || 0) > 0;
  }

  static async listByWeek(learningClassId, weekStartDate) {
    const classId = toInt(learningClassId);
    const week = String(weekStartDate || '').trim().slice(0, 10);
    if (!classId || !week) return [];
    const [rows] = await pool.execute(
      `SELECT e.*, u.first_name, u.last_name, u.email, t.team_name
       FROM challenge_eliminations e
       INNER JOIN users u ON u.id = e.provider_user_id
       LEFT JOIN challenge_teams t ON t.id = e.team_id
       WHERE e.learning_class_id = ? AND e.week_start_date = ?
       ORDER BY e.eliminated_at ASC`,
      [classId, week]
    );
    return rows || [];
  }

  static async listAll(learningClassId) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT e.*, u.first_name, u.last_name, u.email, t.team_name
       FROM challenge_eliminations e
       INNER JOIN users u ON u.id = e.provider_user_id
       LEFT JOIN challenge_teams t ON t.id = e.team_id
       WHERE e.learning_class_id = ?
       ORDER BY e.week_start_date DESC, e.eliminated_at ASC`,
      [classId]
    );
    return rows || [];
  }

  static async create({
    learningClassId,
    providerUserId,
    teamId = null,
    weekStartDate,
    reason,
    adminComment = null,
    publicMessage = null,
    eliminationMode = 'auto',
    createdByUserId = null
  }) {
    const classId = toInt(learningClassId);
    const pId = toInt(providerUserId);
    const week = String(weekStartDate || '').trim().slice(0, 10);
    const r = String(reason || 'points_failed').toLowerCase();
    if (!classId || !pId || !week) return null;
    const validReason = ['points_failed', 'challenge_not_completed', 'both', 'manual_boot'].includes(r) ? r : 'points_failed';
    const mode = String(eliminationMode || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
    const [result] = await pool.execute(
      `INSERT INTO challenge_eliminations (learning_class_id, provider_user_id, team_id, week_start_date, reason, elimination_mode, admin_comment, public_message, created_by_user_id, eliminated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        classId,
        pId,
        teamId ? toInt(teamId) : null,
        week,
        validReason,
        mode,
        adminComment ? String(adminComment).trim() : null,
        publicMessage ? String(publicMessage).trim() : null,
        createdByUserId ? toInt(createdByUserId) : null
      ]
    );
    return result.insertId;
  }

  static async updateAdminComment(eliminationId, adminComment) {
    const id = toInt(eliminationId);
    if (!id) return null;
    await pool.execute(
      `UPDATE challenge_eliminations SET admin_comment = ? WHERE id = ?`,
      [adminComment ? String(adminComment).trim() : null, id]
    );
    return true;
  }
}

export default ChallengeElimination;
