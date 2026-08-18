import pool from '../config/database.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

class SessionRecordingNote {
  static async create({
    sessionRecordingId,
    agencyId,
    createdByUserId,
    toolId,
    serviceCode = null,
    noteAidId = null,
    outputJson = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO session_recording_notes
       (session_recording_id, agency_id, created_by_user_id, tool_id, service_code, note_aid_id, output_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        safeInt(sessionRecordingId),
        safeInt(agencyId),
        safeInt(createdByUserId),
        String(toolId || '').slice(0, 80),
        serviceCode ? String(serviceCode).slice(0, 32).toUpperCase() : null,
        noteAidId ? String(noteAidId).slice(0, 80) : null,
        outputJson == null ? null : String(outputJson)
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const nid = safeInt(id);
    if (!nid) return null;
    const [rows] = await pool.execute('SELECT * FROM session_recording_notes WHERE id = ? LIMIT 1', [nid]);
    return rows?.[0] || null;
  }

  static async listForRecording({ sessionRecordingId, userId }) {
    const rid = safeInt(sessionRecordingId);
    const uid = safeInt(userId);
    if (!rid || !uid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM session_recording_notes
       WHERE session_recording_id = ? AND created_by_user_id = ?
       ORDER BY created_at DESC`,
      [rid, uid]
    );
    return rows || [];
  }

  static async listRecentForUser({ userId, agencyId, limit = 40 }) {
    const uid = safeInt(userId);
    const aid = safeInt(agencyId);
    if (!uid || !aid) return [];
    const lim = Math.min(100, Math.max(1, Number(limit) || 40));
    const [rows] = await pool.execute(
      `SELECT n.*, r.session_kind, r.client_id, r.date_of_service, r.status AS recording_status
       FROM session_recording_notes n
       JOIN session_recordings r ON r.id = n.session_recording_id
       WHERE n.created_by_user_id = ? AND n.agency_id = ? AND n.archived_at IS NULL
       ORDER BY n.created_at DESC
       LIMIT ${lim}`,
      [uid, aid]
    );
    return rows || [];
  }
}

export default SessionRecordingNote;
