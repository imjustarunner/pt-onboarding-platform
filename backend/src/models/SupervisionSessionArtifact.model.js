import pool from '../config/database.js';
import {
  encryptSensitiveArtifact,
  isSupervisionArtifactEncryptionConfigured,
  resolveArtifactPlainFields
} from '../services/supervisionArtifactEncryption.service.js';

function toJsonParam(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function mapSupervisionArtifact(row) {
  if (!row) return null;
  const plain = resolveArtifactPlainFields(row);
  return {
    ...row,
    // Never expose raw ciphertext in API payloads.
    sensitive_ciphertext: undefined,
    sensitive_iv: undefined,
    sensitive_auth_tag: undefined,
    encryption_key_id: plain.isEncrypted ? row.encryption_key_id : row.encryption_key_id,
    transcript_url: plain.transcriptUrl,
    transcript_text: plain.transcriptText,
    summary_text: plain.summaryText,
    focus_title: plain.focusTitle,
    goals_json: plain.goals,
    action_items_json: plain.actionItems,
    private_notes_text: plain.privateNotesText,
    focusTitle: plain.focusTitle,
    goals: plain.goals,
    actionItems: plain.actionItems,
    privateNotesText: plain.privateNotesText,
    transcriptUrl: plain.transcriptUrl,
    transcriptText: plain.transcriptText,
    summaryText: plain.summaryText,
    isEncrypted: !!plain.isEncrypted
  };
}

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
    return mapSupervisionArtifact(rows?.[0] || null);
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
    focusTitle = undefined,
    goals = undefined,
    actionItems = undefined,
    privateNotesText = undefined,
    updatedByUserId = null
  }) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return null;
    const updatedBy = updatedByUserId ? parseInt(updatedByUserId, 10) : null;

    // Merge with existing decrypted values so partial updates don't wipe fields.
    const existing = await this.findBySessionId(sid);
    const next = {
      transcriptUrl: transcriptUrl === undefined ? (existing?.transcriptUrl ?? null) : (transcriptUrl || null),
      transcriptText: transcriptText === undefined ? (existing?.transcriptText ?? null) : (transcriptText || null),
      summaryText: summaryText === undefined ? (existing?.summaryText ?? null) : (summaryText || null),
      focusTitle: focusTitle === undefined ? (existing?.focusTitle ?? null) : (String(focusTitle || '').trim().slice(0, 500) || null),
      goals: goals === undefined ? (existing?.goals || []) : (Array.isArray(goals) ? goals : []),
      actionItems: actionItems === undefined ? (existing?.actionItems || []) : (Array.isArray(actionItems) ? actionItems : []),
      privateNotesText: privateNotesText === undefined ? (existing?.privateNotesText ?? null) : (privateNotesText || null)
    };

    const enc = encryptSensitiveArtifact(next);
    const useEncryption = !!enc && isSupervisionArtifactEncryptionConfigured();

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
          focus_title,
          goals_json,
          action_items_json,
          private_notes_text,
          sensitive_ciphertext,
          sensitive_iv,
          sensitive_auth_tag,
          encryption_key_id,
          updated_by_user_id
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tagged_at = COALESCE(VALUES(tagged_at), tagged_at),
         transcript_url = VALUES(transcript_url),
         transcript_text = VALUES(transcript_text),
         summary_text = VALUES(summary_text),
         summary_model = CASE WHEN VALUES(summary_model) IS NULL THEN summary_model ELSE VALUES(summary_model) END,
         summary_generated_at = CASE
           WHEN VALUES(summary_generated_at) IS NULL THEN summary_generated_at
           ELSE VALUES(summary_generated_at)
         END,
         focus_title = VALUES(focus_title),
         goals_json = VALUES(goals_json),
         action_items_json = VALUES(action_items_json),
         private_notes_text = VALUES(private_notes_text),
         sensitive_ciphertext = VALUES(sensitive_ciphertext),
         sensitive_iv = VALUES(sensitive_iv),
         sensitive_auth_tag = VALUES(sensitive_auth_tag),
         encryption_key_id = VALUES(encryption_key_id),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        sid,
        taggedAt || null,
        // When encryption is on, keep plaintext columns empty at rest.
        useEncryption ? null : next.transcriptUrl,
        useEncryption ? null : next.transcriptText,
        useEncryption ? null : next.summaryText,
        summaryModel === undefined ? null : (summaryModel || null),
        summaryGeneratedAt === undefined ? null : (summaryGeneratedAt || null),
        useEncryption ? null : next.focusTitle,
        useEncryption ? null : toJsonParam(next.goals),
        useEncryption ? null : toJsonParam(next.actionItems),
        useEncryption ? null : next.privateNotesText,
        useEncryption ? enc.ciphertextB64 : null,
        useEncryption ? enc.ivB64 : null,
        useEncryption ? enc.authTagB64 : null,
        useEncryption ? enc.keyId : null,
        updatedBy
      ]
    );

    return this.findBySessionId(sid);
  }
}

export default SupervisionSessionArtifact;
