/**
 * SMS/Voice retention cleanup: purge message_logs, call_voicemails, call_logs,
 * notification_sms_logs older than SMS_VOICE_RETENTION_DAYS (default 365).
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
    const cutoffSql = cutoff.toISOString().slice(0, 19).replace('T', ' ');

    let deletedVoicemails = 0;
    let deletedCallLogs = 0;
    let deletedMessageLogs = 0;
    let deletedNotificationSms = 0;

    try {
      // 1. call_voicemails (before call_logs due to FK)
      const [vmResult] = await pool.execute(
        `DELETE FROM call_voicemails WHERE created_at < ? LIMIT ?`,
        [cutoffSql, limit]
      );
      deletedVoicemails = vmResult?.affectedRows || 0;

      // 2. call_logs
      const [clResult] = await pool.execute(
        `DELETE FROM call_logs WHERE COALESCE(started_at, created_at) < ? LIMIT ?`,
        [cutoffSql, limit]
      );
      deletedCallLogs = clResult?.affectedRows || 0;

      // 3. message_logs
      const [mlResult] = await pool.execute(
        `DELETE FROM message_logs WHERE created_at < ? LIMIT ?`,
        [cutoffSql, limit]
      );
      deletedMessageLogs = mlResult?.affectedRows || 0;

      // 4. notification_sms_logs
      const [nsResult] = await pool.execute(
        `DELETE FROM notification_sms_logs WHERE created_at < ? LIMIT ?`,
        [cutoffSql, limit]
      );
      deletedNotificationSms = nsResult?.affectedRows || 0;
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') throw e;
      throw e;
    }

    return {
      days,
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
