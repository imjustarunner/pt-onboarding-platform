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
    let baseWhere = 'm.learning_class_id = ?';
    const baseParams = [classId];
    if (normalizedScope === 'team') {
      baseWhere += ' AND m.team_id = ?';
      baseParams.push(toInt(teamId) || 0);
    } else {
      baseWhere += ' AND m.team_id IS NULL';
    }
    baseWhere += ' AND m.deleted_at IS NULL';
    const lim = Math.min(Math.max(toInt(limit) || 50, 1), 500);
    const off = Math.max(toInt(offset) || 0, 0);
    // Pinned messages first (small set), then the *most recent* unpinned messages (DESC), reversed to chronological for the UI.
    const [pinnedRows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, u.profile_photo_path, t.team_name,
              pm.message_text AS parent_message_text, pu.first_name AS parent_first_name
       FROM challenge_messages m
       INNER JOIN users u ON u.id = m.user_id
       LEFT JOIN challenge_teams t ON t.id = m.team_id
       LEFT JOIN challenge_messages pm ON pm.id = m.parent_message_id
       LEFT JOIN users pu ON pu.id = pm.user_id
       WHERE ${baseWhere} AND m.is_pinned = 1
       ORDER BY m.pinned_at DESC, m.id DESC`,
      baseParams
    );
    const pinned = (pinnedRows || []).reverse().slice(0, lim);
    const pinCount = pinned.length;
    const takeUnpinned = Math.max(0, lim - pinCount);
    if (takeUnpinned === 0) return pinned;
    const [unpinnedDesc] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, u.profile_photo_path, t.team_name,
              pm.message_text AS parent_message_text, pu.first_name AS parent_first_name
       FROM challenge_messages m
       INNER JOIN users u ON u.id = m.user_id
       LEFT JOIN challenge_teams t ON t.id = m.team_id
       LEFT JOIN challenge_messages pm ON pm.id = m.parent_message_id
       LEFT JOIN users pu ON pu.id = pm.user_id
       WHERE ${baseWhere} AND (m.is_pinned IS NULL OR m.is_pinned = 0)
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${takeUnpinned} OFFSET ${off}`,
      baseParams
    );
    const unpinnedChrono = (unpinnedDesc || []).reverse();
    return [...pinned, ...unpinnedChrono];
  }

  static async getLatestMessageId(learningClassId, { scope = 'season', teamId = null } = {}) {
    const classId = toInt(learningClassId);
    if (!classId) return null;
    const normalizedScope = String(scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    let whereSql = 'learning_class_id = ? AND deleted_at IS NULL';
    const params = [classId];
    if (normalizedScope === 'team') {
      whereSql += ' AND team_id = ?';
      params.push(toInt(teamId) || 0);
    } else {
      whereSql += ' AND team_id IS NULL';
    }
    const [rows] = await pool.execute(
      `SELECT MAX(id) AS latest_id FROM challenge_messages WHERE ${whereSql}`,
      params
    );
    const id = toInt(rows?.[0]?.latest_id);
    return id || null;
  }

  static async findById(id) {
    const messageId = toInt(id);
    if (!messageId) return null;
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, u.profile_photo_path, t.team_name
       FROM challenge_messages m
       INNER JOIN users u ON u.id = m.user_id
       LEFT JOIN challenge_teams t ON t.id = m.team_id
       WHERE m.id = ?
       LIMIT 1`,
      [messageId]
    );
    return rows?.[0] || null;
  }

  static async create({ learningClassId, userId, teamId = null, messageText, attachmentsJson = null, parentMessageId = null }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const text = String(messageText || '').trim();
    if (!classId || !uid || !text) return null;
    const attJson = attachmentsJson ? String(attachmentsJson) : null;
    const parentId = toInt(parentMessageId) || null;
    const [result] = await pool.execute(
      `INSERT INTO challenge_messages
       (learning_class_id, team_id, user_id, message_text, attachments_json, parent_message_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [classId, teamId ? toInt(teamId) : null, uid, text, attJson, parentId]
    );
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, u.profile_photo_path, t.team_name
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
         last_read_message_id = CASE
           WHEN VALUES(last_read_message_id) IS NOT NULL THEN GREATEST(COALESCE(last_read_message_id, 0), VALUES(last_read_message_id))
           ELSE last_read_message_id
         END,
         last_read_at = NOW()`,
      [classId, uid, normalizedScope, tid, msgId]
    );
    return true;
  }

  /** Advance read pointer using UPDATE+GREATEST (avoids INSERT NULL edge cases). */
  static async bumpReadWatermark({ learningClassId, userId, scope = 'season', teamId = 0, lastReadMessageId = null }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const msgId = toInt(lastReadMessageId);
    const normalizedScope = String(scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    const tid = normalizedScope === 'team' ? (toInt(teamId) || 0) : 0;
    if (!classId || !uid || !msgId) return false;
    const [upd] = await pool.execute(
      `UPDATE challenge_message_reads
       SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?),
           last_read_at = NOW()
       WHERE learning_class_id = ? AND user_id = ? AND scope = ? AND team_id = ?`,
      [msgId, classId, uid, normalizedScope, tid]
    );
    if (Number(upd?.affectedRows || 0) > 0) return true;
    return this.markRead({ learningClassId: classId, userId: uid, scope: normalizedScope, teamId: tid, lastReadMessageId: msgId });
  }

  static async getUnreadCounts({ learningClassId, userId, teamId = 0 }) {
    const classId = toInt(learningClassId);
    const uid = toInt(userId);
    const tid = toInt(teamId) || 0;
    if (!classId || !uid) {
      return {
        seasonUnread: 0,
        teamUnread: 0,
        seasonLastReadMessageId: null,
        teamLastReadMessageId: null
      };
    }
    const [seasonReadRow] = await pool.execute(
      `SELECT last_read_message_id FROM challenge_message_reads
       WHERE learning_class_id = ? AND user_id = ? AND scope = 'season' AND team_id = 0
       LIMIT 1`,
      [classId, uid]
    );
    let teamLastReadMessageId = null;
    if (tid > 0) {
      const [teamReadRow] = await pool.execute(
        `SELECT last_read_message_id FROM challenge_message_reads
         WHERE learning_class_id = ? AND user_id = ? AND scope = 'team' AND team_id = ?
         LIMIT 1`,
        [classId, uid, tid]
      );
      teamLastReadMessageId = teamReadRow?.[0]?.last_read_message_id != null
        ? toInt(teamReadRow[0].last_read_message_id)
        : null;
    }
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
      teamUnread,
      seasonLastReadMessageId: seasonReadRow?.[0]?.last_read_message_id != null
        ? toInt(seasonReadRow[0].last_read_message_id)
        : null,
      teamLastReadMessageId: teamLastReadMessageId
    };
  }
}

export default ChallengeMessage;
