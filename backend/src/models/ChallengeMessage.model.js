import pool from '../config/database.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

class ChallengeMessage {
  static async listByChallenge(learningClassId, { limit = 50, offset = 0, scope = 'season', teamId = null } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return [];
    const normalizedScope = String(scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    let whereSql = 'm.learning_class_id = ?';
    const params = [classId];
    if (normalizedScope === 'team') {
      whereSql += ' AND m.team_id = ?';
      params.push(toInt(teamId) || 0);
    } else {
      whereSql += ' AND m.team_id IS NULL';
    }
    whereSql += ' AND m.deleted_at IS NULL';
    // Inline LIMIT/OFFSET: mysql2 prepared statements reject numeric ? for LIMIT/OFFSET (ER_WRONG_ARGUMENTS)
    const lim = Math.min(Math.max(toInt(limit) || 50, 1), 500);
    const off = Math.max(toInt(offset) || 0, 0);
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, t.team_name
       FROM challenge_messages m
       INNER JOIN users u ON u.id = m.user_id
       LEFT JOIN challenge_teams t ON t.id = m.team_id
       WHERE ${whereSql}
       ORDER BY m.is_pinned DESC, m.pinned_at DESC, m.created_at DESC, m.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async findById(id) {
    const messageId = toInt(id);
    if (!messageId) return null;
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, t.team_name
       FROM challenge_messages m
       INNER JOIN users u ON u.id = m.user_id
       LEFT JOIN challenge_teams t ON t.id = m.team_id
       WHERE m.id = ?
       LIMIT 1`,
      [messageId]
    );
    return rows?.[0] || null;
  }

  static async create({ learningClassId, userId, teamId = null, messageText, attachmentsJson = null }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const text = String(messageText || '').trim();
    if (!classId || !uid || !text) return null;
    const attJson = attachmentsJson ? String(attachmentsJson) : null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_messages
       (learning_class_id, team_id, user_id, message_text, attachments_json)
       VALUES (?, ?, ?, ?, ?)`,
      [classId, teamId ? toInt(teamId) : null, uid, text, attJson]
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

  static async softDelete(messageId, deletedByUserId) {
    const id = toInt(messageId);
    const byId = toInt(deletedByUserId);
    if (!id || !byId) return false;
    const [result] = await pool.execute(
      `UPDATE challenge_messages
       SET deleted_by_user_id = ?, deleted_at = NOW()
       WHERE id = ?`,
      [byId, id]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  static async pin(messageId, pinned, pinnedByUserId) {
    const id = toInt(messageId);
    const byId = toInt(pinnedByUserId);
    if (!id || !byId) return null;
    const nextPinned = pinned ? 1 : 0;
    await pool.execute(
      `UPDATE challenge_messages
       SET is_pinned = ?,
           pinned_by_user_id = ?,
           pinned_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END
       WHERE id = ?`,
      [nextPinned, nextPinned ? byId : null, nextPinned, id]
    );
    return this.findById(id);
  }

  static async markRead({ learningClassId, userId, scope = 'season', teamId = 0, lastReadMessageId = null }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const normalizedScope = String(scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    const tid = normalizedScope === 'team' ? (toInt(teamId) || 0) : 0;
    const msgId = toInt(lastReadMessageId) || null;
    if (!classId || !uid) return false;
    await pool.execute(
      `INSERT INTO challenge_message_reads
       (learning_class_id, user_id, scope, team_id, last_read_message_id, last_read_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         last_read_message_id = VALUES(last_read_message_id),
         last_read_at = NOW()`,
      [classId, uid, normalizedScope, tid, msgId]
    );
    return true;
  }

  static async getUnreadCounts({ learningClassId, userId, teamId = 0 }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const tid = toInt(teamId) || 0;
    if (!classId || !uid) return { seasonUnread: 0, teamUnread: 0 };
    const [seasonRows] = await pool.execute(
      `SELECT COUNT(*) AS unread
       FROM challenge_messages m
       LEFT JOIN challenge_message_reads r
         ON r.learning_class_id = m.learning_class_id
         AND r.user_id = ?
         AND r.scope = 'season'
         AND r.team_id = 0
       WHERE m.learning_class_id = ?
         AND m.team_id IS NULL
         AND m.deleted_at IS NULL
         AND m.user_id <> ?
         AND (r.last_read_message_id IS NULL OR m.id > r.last_read_message_id)`,
      [uid, classId, uid]
    );
    let teamUnread = 0;
    if (tid > 0) {
      const [teamRows] = await pool.execute(
        `SELECT COUNT(*) AS unread
         FROM challenge_messages m
         LEFT JOIN challenge_message_reads r
           ON r.learning_class_id = m.learning_class_id
           AND r.user_id = ?
           AND r.scope = 'team'
           AND r.team_id = ?
         WHERE m.learning_class_id = ?
           AND m.team_id = ?
           AND m.deleted_at IS NULL
           AND m.user_id <> ?
           AND (r.last_read_message_id IS NULL OR m.id > r.last_read_message_id)`,
        [uid, tid, classId, tid, uid]
      );
      teamUnread = Number(teamRows?.[0]?.unread || 0);
    }
    return {
      seasonUnread: Number(seasonRows?.[0]?.unread || 0),
      teamUnread
    };
  }
}

export default ChallengeMessage;
