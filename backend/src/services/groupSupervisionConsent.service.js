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

export async function groupTranscriptionConsent(session, db = pool) {
  // Waiting-room occupants are not in the call. Require acknowledgement from
  // every currently present, admitted attendee, including hosts and presenters.
  const [rows] = await db.execute(`SELECT p.join_identity FROM supervision_session_join_presence p
    JOIN supervision_session_video_admissions a ON a.session_id=p.session_id AND p.join_identity=CONCAT('user-',a.user_id)
    LEFT JOIN supervision_group_transcription_consents c ON c.session_id=a.session_id AND c.user_id=a.user_id AND c.notice_version=?
    WHERE p.session_id=? AND p.left_at IS NULL AND p.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND)
      AND c.user_id IS NULL LIMIT 1`, [GROUP_TRANSCRIPTION_NOTICE_VERSION, session.id]);
  return rows.length ? { allowed: false, reason: 'Waiting for everyone in the room to agree to group transcription or leave.' } : { allowed: true };
}
