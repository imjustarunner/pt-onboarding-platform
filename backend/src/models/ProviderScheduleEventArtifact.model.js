import pool from '../config/database.js';

class ProviderScheduleEventArtifact {
  static async findByEventId(eventId) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_event_artifacts
       WHERE event_id = ?
       LIMIT 1`,
      [eid]
    );
    return rows?.[0] || null;
  }

  static async ensureTagged({ eventId, updatedByUserId = null }) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const updatedBy = updatedByUserId ? parseInt(updatedByUserId, 10) : null;
    await pool.execute(
      `INSERT INTO provider_schedule_event_artifacts
        (event_id, tagged_at, updated_by_user_id)
       VALUES (?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         tagged_at = COALESCE(tagged_at, NOW()),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [eid, updatedBy]
    );
    return this.findByEventId(eid);
  }

  static async upsertByEventId({
    eventId,
    taggedAt = null,
    transcriptUrl = undefined,
    transcriptText = undefined,
    summaryText = undefined,
    summaryModel = undefined,
    summaryGeneratedAt = undefined,
    recordingUrl = undefined,
    recordingPath = undefined,
    updatedByUserId = null
  }) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const updatedBy = updatedByUserId ? parseInt(updatedByUserId, 10) : null;

    await pool.execute(
      `INSERT INTO provider_schedule_event_artifacts
        (
          event_id,
          tagged_at,
          transcript_url,
          transcript_text,
          summary_text,
          summary_model,
          summary_generated_at,
          recording_url,
          recording_path,
          updated_by_user_id
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         recording_url = CASE WHEN VALUES(recording_url) IS NULL THEN recording_url ELSE VALUES(recording_url) END,
         recording_path = CASE WHEN VALUES(recording_path) IS NULL THEN recording_path ELSE VALUES(recording_path) END,
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        eid,
        taggedAt || null,
        transcriptUrl === undefined ? null : (transcriptUrl || null),
        transcriptText === undefined ? null : (transcriptText || null),
        summaryText === undefined ? null : (summaryText || null),
        summaryModel === undefined ? null : (summaryModel || null),
        summaryGeneratedAt === undefined ? null : (summaryGeneratedAt || null),
        recordingUrl === undefined ? null : (recordingUrl || null),
        recordingPath === undefined ? null : (recordingPath || null),
        updatedBy
      ]
    );

    return this.findByEventId(eid);
  }
}

export default ProviderScheduleEventArtifact;
