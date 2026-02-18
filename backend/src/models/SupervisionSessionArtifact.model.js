import pool from '../config/database.js';

class SupervisionSessionArtifact {
  static async findBySessionId(sessionId) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM supervision_session_artifacts
       WHERE session_id = ?
       LIMIT 1`,
      [sid]
    );
    return rows?.[0] || null;
  }

  static async ensureTagged({ sessionId, updatedByUserId = null }) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return null;
    const updatedBy = updatedByUserId ? parseInt(updatedByUserId, 10) : null;
    await pool.execute(
      `INSERT INTO supervision_session_artifacts
        (session_id, tagged_at, updated_by_user_id)
       VALUES (?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         tagged_at = COALESCE(tagged_at, NOW()),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [sid, updatedBy]
    );
    return this.findBySessionId(sid);
  }

  static async upsertBySessionId({
    sessionId,
    taggedAt = null,
    transcriptUrl = undefined,
    transcriptText = undefined,
    summaryText = undefined,
    summaryModel = undefined,
    summaryGeneratedAt = undefined,
    updatedByUserId = null
  }) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return null;
    const updatedBy = updatedByUserId ? parseInt(updatedByUserId, 10) : null;

    await pool.execute(
      `INSERT INTO supervision_session_artifacts
        (
          session_id,
          tagged_at,
          transcript_url,
          transcript_text,
          summary_text,
          summary_model,
          summary_generated_at,
          updated_by_user_id
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tagged_at = COALESCE(VALUES(tagged_at), tagged_at),
         transcript_url = CASE WHEN VALUES(transcript_url) IS NULL THEN transcript_url ELSE VALUES(transcript_url) END,
         transcript_text = CASE WHEN VALUES(transcript_text) IS NULL THEN transcript_text ELSE VALUES(transcript_text) END,
         summary_text = CASE WHEN VALUES(summary_text) IS NULL THEN summary_text ELSE VALUES(summary_text) END,
         summary_model = CASE WHEN VALUES(summary_model) IS NULL THEN summary_model ELSE VALUES(summary_model) END,
         summary_generated_at = CASE
           WHEN VALUES(summary_generated_at) IS NULL THEN summary_generated_at
           ELSE VALUES(summary_generated_at)
         END,
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        sid,
        taggedAt || null,
        transcriptUrl === undefined ? null : (transcriptUrl || null),
        transcriptText === undefined ? null : (transcriptText || null),
        summaryText === undefined ? null : (summaryText || null),
        summaryModel === undefined ? null : (summaryModel || null),
        summaryGeneratedAt === undefined ? null : (summaryGeneratedAt || null),
        updatedBy
      ]
    );

    return this.findBySessionId(sid);
  }
}

export default SupervisionSessionArtifact;

