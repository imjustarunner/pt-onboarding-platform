/**
 * Twilio usage monitoring for SMS and voice.
 * Tracks usage by agency, supports thresholds and alerts for cost control.
 */
import pool from '../config/database.js';
import BillingUsageService from './billingUsage.service.js';

function dateOnlyString(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Get Twilio usage summary for an agency (or platform-wide).
 * @param {number|null} agencyId - null for platform-wide
 * @param {{ periodStart?: Date|string, periodEnd?: Date|string }} opts
 */
export async function getTwilioUsage(agencyId, { periodStart = null, periodEnd = null } = {}) {
  const startStr = dateOnlyString(periodStart) || dateOnlyString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const endStr = dateOnlyString(periodEnd) || dateOnlyString(new Date());

  const agencyFilter = agencyId ? 'AND ml.agency_id = ?' : '';
  const params = agencyId ? [startStr, endStr, agencyId] : [startStr, endStr];

  // SMS counts
  const [outboundSms] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM message_logs ml
     WHERE ml.direction = 'OUTBOUND' AND ml.delivery_status = 'sent'
       AND ml.created_at >= ? AND ml.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ${agencyFilter}`,
    params
  );
  const [inboundSms] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM message_logs ml
     WHERE ml.direction = 'INBOUND' AND (ml.delivery_status = 'received' OR ml.delivery_status IS NULL)
       AND ml.created_at >= ? AND ml.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ${agencyFilter}`,
    params
  );
  const [notificationSms] = await pool.execute(
    agencyId
      ? `SELECT COUNT(*) AS cnt FROM notification_sms_logs nsl
         WHERE nsl.agency_id = ? AND nsl.status = 'sent'
           AND nsl.created_at >= ? AND nsl.created_at < DATE_ADD(?, INTERVAL 1 DAY)`
      : `SELECT COUNT(*) AS cnt FROM notification_sms_logs nsl
         WHERE nsl.status = 'sent'
           AND nsl.created_at >= ? AND nsl.created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    agencyId ? [agencyId, startStr, endStr] : [startStr, endStr]
  );

  // Voice: call minutes (from call_logs)
  const agencyFilterCall = agencyId ? 'AND cl.agency_id = ?' : '';
  const paramsCall = agencyId ? [startStr, endStr, agencyId] : [startStr, endStr];
  const [callMinutes] = await pool.execute(
    `SELECT COALESCE(SUM(cl.duration_seconds), 0) AS total_seconds
     FROM call_logs cl
     WHERE cl.started_at >= ? AND cl.started_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND cl.duration_seconds IS NOT NULL AND cl.duration_seconds > 0
       ${agencyFilterCall}`,
    paramsCall
  );

  const totalSeconds = Number(callMinutes?.[0]?.total_seconds || 0);
  const callMinutesUsed = Math.ceil(totalSeconds / 60);

  return {
    periodStart: startStr,
    periodEnd: endStr,
    outboundSms: Number(outboundSms?.[0]?.cnt || 0),
    inboundSms: Number(inboundSms?.[0]?.cnt || 0),
    notificationSms: Number(notificationSms?.[0]?.cnt || 0),
    totalSms: Number(outboundSms?.[0]?.cnt || 0) + Number(inboundSms?.[0]?.cnt || 0) + Number(notificationSms?.[0]?.cnt || 0),
    callMinutes: callMinutesUsed,
    phoneNumbers: agencyId ? (await BillingUsageService.getUsage(agencyId)).phoneNumbersUsed : null
  };
}

/**
 * Check if usage exceeds configured thresholds (env vars).
 * TWILIO_SMS_ALERT_THRESHOLD, TWILIO_CALL_MINUTES_ALERT_THRESHOLD (per agency, per period)
 * @returns {{ overThreshold: boolean, alerts: string[] }}
 */
export async function checkUsageThresholds(agencyId, usage = null) {
  const alerts = [];
  const u = usage || (await getTwilioUsage(agencyId));

  const smsThreshold = parseInt(process.env.TWILIO_SMS_ALERT_THRESHOLD || '0', 10);
  const callThreshold = parseInt(process.env.TWILIO_CALL_MINUTES_ALERT_THRESHOLD || '0', 10);

  if (smsThreshold > 0 && u.totalSms >= smsThreshold) {
    alerts.push(`SMS usage (${u.totalSms}) exceeds threshold (${smsThreshold})`);
  }
  if (callThreshold > 0 && u.callMinutes >= callThreshold) {
    alerts.push(`Call minutes (${u.callMinutes}) exceeds threshold (${callThreshold})`);
  }

  return {
    overThreshold: alerts.length > 0,
    alerts
  };
}
