import pool from '../config/database.js';
import VonageService from './vonage.service.js';
import MessageLog from '../models/MessageLog.model.js';
import SmsThreadEscalation from '../models/SmsThreadEscalation.model.js';
import Agency from '../models/Agency.model.js';
import VacationScheduleSyncService from './vacationScheduleSync.service.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import { callGeminiText } from './geminiText.service.js';
import User from '../models/User.model.js';
import { resolveOutboundNumber } from './communicationRouting.service.js';

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
};

class SmsAutoReplyRuleService {
  /**
   * Periodic tick to find unanswered messages and send auto-replies.
   */
  static async runTick() {
    const [rows] = await pool.execute(
      `SELECT ml.id, ml.agency_id, ml.user_id, ml.client_id, ml.created_at, ml.from_number, ml.to_number,
              a.feature_flags, a.phone_number AS agency_phone
       FROM message_logs ml
       JOIN agencies a ON a.id = ml.agency_id
       WHERE ml.direction = 'INBOUND'
         AND ml.client_id IS NOT NULL
         AND ml.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND NOT EXISTS (
           SELECT 1 FROM message_logs out_msg
           WHERE out_msg.user_id = ml.user_id
             AND out_msg.client_id = ml.client_id
             AND out_msg.direction = 'OUTBOUND'
             AND out_msg.created_at > ml.created_at
         )
         AND NOT EXISTS (
           SELECT 1 FROM message_logs ar
           WHERE ar.client_id = ml.client_id
             AND ar.direction = 'OUTBOUND'
             AND (JSON_EXTRACT(ar.metadata, '$.forwardOffer') = true)
             AND ar.created_at > ml.created_at
         )
       ORDER BY ml.created_at ASC
       LIMIT 100`
    );

    for (const row of rows || []) {
      const flags = parseFeatureFlags(row.feature_flags);
      const minutes = Number(flags.smsUnansweredAutoReplyMinutes || 0);
      if (minutes <= 0) continue;

      const createdAt = new Date(row.created_at);
      const ageMs = Date.now() - createdAt.getTime();
      if (ageMs < minutes * 60 * 1000) continue;

      const messageTemplate = flags.smsUnansweredAutoReplyMessage || 
        "Your provider has not responded in {{minutes}} minutes, your message is still private and encrypted in our platform, respond YES if you'd like it to be forwarded to our support team.";
      
      const body = messageTemplate.replace('{{minutes}}', minutes);
      const from = MessageLog.normalizePhone(row.to_number) || row.to_number;
      const to = MessageLog.normalizePhone(row.from_number) || row.from_number;

      try {
        const outboundLog = await MessageLog.createOutbound({
          agencyId: row.agency_id,
          userId: row.user_id,
          clientId: row.client_id,
          body,
          fromNumber: from,
          toNumber: to,
          metadata: { forwardOffer: true, provider: 'vonage', triggerInboundId: row.id }
        });

        const msg = await VonageService.sendSms({ to, from, body });
        await MessageLog.markSent(outboundLog.id, msg.sid, { forwardOffer: true, provider: 'vonage', status: msg.status });
      } catch (e) {
        console.warn('[SmsAutoReplyRuleService] failed to send auto-reply:', e.message);
      }
    }
  }

  /**
   * Handle a "YES" reply from a client after they received a forward offer.
   */
  static async handleYesReply({ fromNumber, toNumber, agencyId, clientId, userId }) {
    // ... same code ...
  }

  /**
   * Generate AI smart replies based on thread history.
   */
  static async generateSmartReplies({ userId, clientId, agencyContactId }) {
    const thread = await MessageLog.listThread({ userId, clientId, agencyContactId, limit: 10 });
    const messages = thread.messages || [];
    if (!messages.length) return [];

    const history = messages
      .map(m => `${m.direction === 'INBOUND' ? 'Client' : 'Provider'}: ${m.body}`)
      .reverse()
      .join('\n');

    const prompt = `You are an assistant for a healthcare provider. Based on the following SMS conversation history, provide 3 short (under 80 characters), professional, and helpful reply suggestions for the provider to send back to the client. Format the output as a simple JSON array of strings.

History:
${history}

Suggestions:`;

    try {
      const result = await callGeminiText({ prompt, temperature: 0.7, maxOutputTokens: 200 });
      let text = result.text.trim();
      // Basic JSON cleanup if Gemini wraps it in markdown
      if (text.startsWith('```')) {
        text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      const suggestions = JSON.parse(text);
      return Array.isArray(suggestions) ? suggestions : [];
    } catch (e) {
      console.warn('[SmsAutoReplyRuleService] smart reply generation failed:', e.message);
      return [];
    }
  }

  /**
   * Run a check for providers who have just returned from vacation/OOO
   * and send them a digest of unread messages.
   */
  static async runOooDigestCheck() {
    // 1. Find users whose vacation just ended (within the last 15 mins)
    // For simplicity, we'll check users who had a vacation event ending in the last interval.
    // In a real system, we'd probably store 'last_digest_sent_at' on UserCallSettings.
    
    try {
      // Get all providers
      const [providers] = await pool.execute(`
        SELECT u.id, u.first_name, u.personal_phone AS phone, a.id as agency_id, a.name as agency_name
        FROM users u
        JOIN user_agencies ua ON u.id = ua.user_id
        JOIN agencies a ON ua.agency_id = a.id
        WHERE u.role IN ('provider', 'provider_plus', 'admin', 'staff')
      `);

      for (const p of providers) {
        // Check if they WERE on vacation 15 mins ago but are NOT now
        const now = new Date();
        const fifteenAgo = new Date(now.getTime() - 15 * 60000);
        
        const wasOnVacation = await VacationScheduleSyncService.isUserOnVacation(p.id, p.agency_id, fifteenAgo);
        const isOnVacation = await VacationScheduleSyncService.isUserOnVacation(p.id, p.agency_id, now);

        if (wasOnVacation && !isOnVacation) {
          // They just returned!
          // Find unread inbound messages from their vacation period
          // Let's look back 7 days max for the "vacation period"
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60000);
          
          const [unread] = await pool.execute(`
            SELECT COUNT(*) as count, COUNT(DISTINCT client_id) as client_count
            FROM message_logs
            WHERE user_id = ? AND direction = 'INBOUND' AND is_read = 0
            AND created_at > ?
          `, [p.id, weekAgo]);

          const count = unread?.[0]?.count || 0;
          const clientCount = unread?.[0]?.client_count || 0;

          if (count > 0 && p.phone) {
            const body = `Welcome back! You have ${count} unread message${count > 1 ? 's' : ''} from ${clientCount} client${clientCount > 1 ? 's' : ''} waiting for you on ${p.agency_name}. View them here: ${process.env.FRONTEND_URL}/admin/communications`;
            
            // Send digest via SMS from agency main number or their primary
            const { number: from } = await resolveOutboundNumber({ userId: p.id });
            if (from) {
              await VonageService.sendSms({ to: p.phone, from, body });
              console.log(`[OooDigest] Sent digest to ${p.id} (${p.phone}): ${count} messages`);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[SmsAutoReplyRuleService] runOooDigestCheck failed:', e.message);
    }
  }
}

export default SmsAutoReplyRuleService;
