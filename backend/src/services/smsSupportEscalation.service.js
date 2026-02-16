import pool from '../config/database.js';
import TwilioService from './twilio.service.js';
import MessageLog from '../models/MessageLog.model.js';
import SmsThreadEscalation from '../models/SmsThreadEscalation.model.js';

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};

class SmsSupportEscalationService {
  static async runTick() {
    const [rows] = await pool.execute(
      `SELECT ml.id, ml.agency_id, ml.user_id, ml.client_id, ml.body, ml.created_at, ml.from_number, ml.to_number,
              c.initials AS client_initials, a.feature_flags, a.phone_number AS agency_phone,
              u.role,
              up.sms_support_thread_mode AS support_mode
       FROM message_logs ml
       JOIN users u ON u.id = ml.user_id
       LEFT JOIN clients c ON c.id = ml.client_id
       LEFT JOIN agencies a ON a.id = ml.agency_id
       LEFT JOIN user_preferences up ON up.user_id = ml.user_id
       WHERE ml.direction = 'INBOUND'
         AND ml.client_id IS NOT NULL
         AND u.role = 'provider'
         AND NOT EXISTS (
           SELECT 1 FROM message_logs newer_in
           WHERE newer_in.user_id = ml.user_id
             AND newer_in.client_id = ml.client_id
             AND newer_in.direction = 'INBOUND'
             AND newer_in.created_at > ml.created_at
         )
         AND NOT EXISTS (
           SELECT 1 FROM message_logs out_msg
           WHERE out_msg.user_id = ml.user_id
             AND out_msg.client_id = ml.client_id
             AND out_msg.direction = 'OUTBOUND'
             AND out_msg.created_at > ml.created_at
         )
         AND NOT EXISTS (
           SELECT 1 FROM sms_thread_escalations se
           WHERE se.inbound_log_id = ml.id
         )
       ORDER BY ml.created_at ASC
       LIMIT 200`
    );

    for (const row of rows || []) {
      const flags = parseFeatureFlags(row.feature_flags);
      const hours = Number(flags.smsSupportEscalationHours || 12);
      const thresholdHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 168) : 12;
      const createdAt = new Date(row.created_at);
      const ageMs = Date.now() - createdAt.getTime();
      if (!Number.isFinite(ageMs) || ageMs < thresholdHours * 60 * 60 * 1000) continue;

      const supportPhone = MessageLog.normalizePhone(flags.smsSupportFallbackPhone || row.agency_phone) ||
        flags.smsSupportFallbackPhone || row.agency_phone || null;
      if (!supportPhone) continue;

      const body = `Support escalation: provider has not replied in ${thresholdHours}h. Client ${row.client_initials || '#'+row.client_id} sent: "${String(row.body || '').slice(0, 180)}"`;
      const from = MessageLog.normalizePhone(row.to_number) || row.to_number;
      try {
        await TwilioService.sendSms({ to: supportPhone, from, body });
        await SmsThreadEscalation.createOrKeep({
          agencyId: row.agency_id,
          userId: row.user_id,
          clientId: row.client_id,
          inboundLogId: row.id,
          escalatedToPhone: supportPhone,
          escalationType: 'sla_timeout',
          threadMode: row.support_mode === 'read_only' ? 'read_only' : 'respondable',
          metadata: { thresholdHours }
        });
      } catch (e) {
        // best effort; skip and retry next tick
      }
    }
  }
}

export default SmsSupportEscalationService;

