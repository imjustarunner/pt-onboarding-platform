/**
 * SMS/Voice retention cleanup: purge message_logs, call_voicemails, call_logs,
 * notification_sms_logs older than SMS_VOICE_RETENTION_DAYS (default 365).
 * Routine call logs use three calendar years. Client-linked and preservation-held
 * records are excluded; voicemail audio/transcripts require a separate clinical retention policy.
 * Set SMS_VOICE_RETENTION_DAYS=0 to disable (keep indefinitely).
 */
import pool from '../config/database.js';

const DEFAULT_DAYS = 365;

function getRetentionDays() {
  const raw = process.env.SMS_VOICE_RETENTION_DAYS;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DAYS;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAYS;
  if (n === 0) return 0; // 0 = keep indefinitely, skip purge
  return n;
}

export default class SmsVoiceRetentionCleanupService {
  static async run({ limit = 500 } = {}) {
    const days = getRetentionDays();
    if (days === 0) return { skipped: true, reason: 'SMS_VOICE_RETENTION_DAYS=0 (keep indefinitely)' };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const callCutoff = new Date();
    callCutoff.setUTCFullYear(callCutoff.getUTCFullYear() - 3);
    const callCutoffSql = callCutoff.toISOString().slice(0, 19).replace('T', ' ');
    const cutoffSql = cutoff.toISOString().slice(0, 19).replace('T', ' ');
    // MySQL prepared statements do not support LIMIT with a placeholder; use sanitized literal
    const lim = Math.max(1, Math.min(10000, parseInt(limit, 10) || 500));

    let deletedVoicemails = 0;
    let deletedCallLogs = 0;
    let deletedMessageLogs = 0;
    let deletedNotificationSms = 0;

    try {
      // Voicemail may itself be a clinical record. Do not purge audio/transcripts
      // through this routine task, or remove a log with a surviving voicemail.
      const [clResult] = await pool.execute(
        `DELETE FROM call_logs WHERE COALESCE(started_at, created_at) < ?
          AND client_id IS NULL
          AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.legalHold')), 'false') NOT IN ('true','1')
          AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.retentionHold')), 'false') NOT IN ('true','1')
          AND NOT EXISTS (SELECT 1 FROM call_voicemails v WHERE v.call_log_id=call_logs.id)
          LIMIT ${lim}`,
        [callCutoffSql]
      );
      deletedCallLogs = clResult?.affectedRows || 0;

      // 3. message_logs
      const [mlResult] = await pool.execute(
        `DELETE FROM message_logs WHERE created_at < ? AND client_id IS NULL
          AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.legalHold')), 'false') NOT IN ('true','1')
          AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.retentionHold')), 'false') NOT IN ('true','1')
          LIMIT ${lim}`,
        [cutoffSql]
      );
      deletedMessageLogs = mlResult?.affectedRows || 0;

      // 4. notification_sms_logs
      const [nsResult] = await pool.execute(
        `DELETE FROM notification_sms_logs WHERE created_at < ? LIMIT ${lim}`,
        [cutoffSql]
      );
      deletedNotificationSms = nsResult?.affectedRows || 0;
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') throw e;
      throw e;
    }

    return {
      days,
      callLogRetentionYears: 3,
      callLogCutoff: callCutoffSql,
      cutoff: cutoffSql,
      deletedVoicemails,
      deletedCallLogs,
      deletedMessageLogs,
      deletedNotificationSms,
      total:
        deletedVoicemails + deletedCallLogs + deletedMessageLogs + deletedNotificationSms
    };
  }
}
