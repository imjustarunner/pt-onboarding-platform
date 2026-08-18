import pool from '../config/database.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clampText(v, maxLen) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return maxLen && s.length > maxLen ? s.slice(0, maxLen) : s;
}

class SessionRecording {
  static async create(row = {}) {
    const agencyId = safeInt(row.agencyId);
    const userId = safeInt(row.createdByUserId);
    if (!agencyId || !userId) throw new Error('agencyId and createdByUserId are required');

    const [result] = await pool.execute(
      `INSERT INTO session_recordings (
        agency_id, created_by_user_id, client_id, office_event_id, learning_class_session_id,
        session_kind, status, service_code, tool_id, note_aid_id, session_type_label, modality_label,
        date_of_service, auto_transcribe, speaker_identification, generate_structured_note,
        highlight_interventions, options_json, consent_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        safeInt(row.clientId),
        safeInt(row.officeEventId),
        safeInt(row.learningClassSessionId),
        row.sessionKind || 'standalone',
        row.status || 'setup',
        clampText(row.serviceCode, 32)?.toUpperCase() || null,
        clampText(row.toolId, 80),
        clampText(row.noteAidId, 80),
        clampText(row.sessionTypeLabel, 160),
        clampText(row.modalityLabel, 120),
        row.dateOfService ? String(row.dateOfService).slice(0, 10) : null,
        row.autoTranscribe === true ? 1 : 0,
        row.speakerIdentification === false ? 0 : 1,
        row.generateStructuredNote ? 1 : 0,
        row.highlightInterventions === false ? 0 : 1,
        row.optionsJson ? JSON.stringify(row.optionsJson) : null,
        safeInt(row.consentId)
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const rid = safeInt(id);
    if (!rid) return null;
    const [rows] = await pool.execute('SELECT * FROM session_recordings WHERE id = ? LIMIT 1', [rid]);
    return this.normalize(rows?.[0] || null);
  }

  static async findByIdForUser({ id, userId, agencyId = null }) {
    const rid = safeInt(id);
    const uid = safeInt(userId);
    if (!rid || !uid) return null;
    const params = [rid, uid];
    let sql = 'SELECT * FROM session_recordings WHERE id = ? AND created_by_user_id = ?';
    if (agencyId) {
      sql += ' AND agency_id = ?';
      params.push(safeInt(agencyId));
    }
    sql += ' LIMIT 1';
    const [rows] = await pool.execute(sql, params);
    return this.normalize(rows?.[0] || null);
  }

  static async listForUser({ userId, agencyId, limit = 40 }) {
    const uid = safeInt(userId);
    const aid = safeInt(agencyId);
    if (!uid || !aid) return [];
    const lim = Math.min(100, Math.max(1, Number(limit) || 40));
    const [rows] = await pool.execute(
      `SELECT * FROM session_recordings
       WHERE created_by_user_id = ? AND agency_id = ?
       ORDER BY created_at DESC
       LIMIT ${lim}`,
      [uid, aid]
    );
    return (rows || []).map((r) => this.normalize(r));
  }

  static async update(id, patch = {}) {
    const rid = safeInt(id);
    if (!rid) throw new Error('Invalid id');
    const updates = [];
    const values = [];
    const map = {
      clientId: ['client_id', (v) => safeInt(v)],
      officeEventId: ['office_event_id', (v) => safeInt(v)],
      learningClassSessionId: ['learning_class_session_id', (v) => safeInt(v)],
      sessionKind: ['session_kind', (v) => clampText(v, 32)],
      status: ['status', (v) => clampText(v, 32)],
      serviceCode: ['service_code', (v) => clampText(v, 32)?.toUpperCase() || null],
      toolId: ['tool_id', (v) => clampText(v, 80)],
      noteAidId: ['note_aid_id', (v) => clampText(v, 80)],
      sessionTypeLabel: ['session_type_label', (v) => clampText(v, 160)],
      modalityLabel: ['modality_label', (v) => clampText(v, 120)],
      dateOfService: ['date_of_service', (v) => (v ? String(v).slice(0, 10) : null)],
      startedAt: ['started_at', (v) => v || null],
      endedAt: ['ended_at', (v) => v || null],
      durationSeconds: ['duration_seconds', (v) => (v == null ? null : Number(v))],
      autoTranscribe: ['auto_transcribe', (v) => (v ? 1 : 0)],
      speakerIdentification: ['speaker_identification', (v) => (v ? 1 : 0)],
      generateStructuredNote: ['generate_structured_note', (v) => (v ? 1 : 0)],
      highlightInterventions: ['highlight_interventions', (v) => (v ? 1 : 0)],
      transcriptText: ['transcript_text', (v) => (v == null ? null : String(v))],
      summaryText: ['summary_text', (v) => (v == null ? null : String(v))],
      topicsJson: ['topics_json', (v) => (v == null ? null : JSON.stringify(v))],
      techniquesJson: ['techniques_json', (v) => (v == null ? null : JSON.stringify(v))],
      markersJson: ['markers_json', (v) => (v == null ? null : JSON.stringify(v))],
      optionsJson: ['options_json', (v) => (v == null ? null : JSON.stringify(v))],
      consentId: ['consent_id', (v) => safeInt(v)],
      errorMessage: ['error_message', (v) => clampText(v, 500)]
    };
    for (const [key, [col, fn]] of Object.entries(map)) {
      if (patch[key] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(fn(patch[key]));
      }
    }
    if (!updates.length) return this.findById(rid);
    values.push(rid);
    await pool.execute(`UPDATE session_recordings SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(rid);
  }

  static normalize(row) {
    if (!row) return null;
    const parseJson = (v) => {
      if (v == null || v === '') return null;
      if (typeof v === 'object') return v;
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    };
    return {
      ...row,
      topics_json: parseJson(row.topics_json),
      techniques_json: parseJson(row.techniques_json),
      markers_json: parseJson(row.markers_json),
      options_json: parseJson(row.options_json)
    };
  }
}

export default SessionRecording;
