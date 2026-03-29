import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeMessage {
  static async listByChallenge(learningClassId, { limit = 50, offset = 0 } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, t.team_name
       FROM challenge_messages m
       INNER JOIN users u ON u.id = m.user_id
       LEFT JOIN challenge_teams t ON t.id = m.team_id
       WHERE m.learning_class_id = ?
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      [classId, toInt(limit) || 50, toInt(offset) || 0]
    );
    return rows || [];
  }

  static async create({ learningClassId, userId, teamId = null, messageText }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const text = String(messageText || '').trim();
    if (!classId || !uid || !text) return null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_messages
       (learning_class_id, team_id, user_id, message_text)
       VALUES (?, ?, ?, ?)`,
      [classId, teamId ? toInt(teamId) : null, uid, text]
    );
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, t.team_name
       FROM challenge_messages m
       INNER JOIN users u ON u.id = m.user_id
       LEFT JOIN challenge_teams t ON t.id = m.team_id
       WHERE m.id = ?
       LIMIT 1`,
      [result.insertId]
    );
    return rows?.[0] || null;
  }
}

export default ChallengeMessage;
