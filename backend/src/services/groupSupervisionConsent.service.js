import pool from '../config/database.js';

export const GROUP_TRANSCRIPTION_NOTICE_VERSION = '2026-10-06';
export const isGroupSupervision = session => String(session?.session_type || '').toLowerCase() === 'group';

export async function hasGroupTranscriptionConsent(sessionId, userId, db = pool) {
  const [rows] = await db.execute(`SELECT 1 FROM supervision_group_transcription_consents
    WHERE session_id=? AND user_id=? AND notice_version=?`, [sessionId, userId, GROUP_TRANSCRIPTION_NOTICE_VERSION]);
  return rows.length > 0;
}

export async function acceptGroupTranscriptionConsent(sessionId, userId, db = pool) {
  await db.execute(`INSERT INTO supervision_group_transcription_consents (session_id,user_id,notice_version,accepted_at)
    VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE accepted_at=accepted_at`,
  [sessionId, userId, GROUP_TRANSCRIPTION_NOTICE_VERSION]);
}

// Legacy acknowledgments remain available as audit records, separate from capture.
export async function groupTranscriptionConsent() {
  return { allowed: true };
}
