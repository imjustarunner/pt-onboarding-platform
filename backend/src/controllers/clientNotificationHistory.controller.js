import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';

// Historical tables use both unicode_ci and 0900_ai_ci; JSON text uses bin.
// Normalize every text projection before UNION, without altering stored data.
const historyText = expression => `CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;

export async function listClientNotificationHistory(req, res, next) {
  try {
    const clientId = Number(req.params.clientId || req.params.id);
    if (!Number.isSafeInteger(clientId) || clientId < 1) return res.status(400).json({ error: { message: 'Invalid client' } });
    if (req.guardianPreviewMode) return res.json({ notifications: [] });
    if (['client', 'client_guardian'].includes(req.user.role)) {
      // Both guardian and self relationships live in client_guardians.
      // There is no clients.user_id column in the current client schema.
      const link = await ClientGuardian.getLink({ clientId, guardianUserId: req.user.id });
      if (!link || !Number(link.access_enabled)) return res.status(403).json({ error: { message: 'Account access is required' } });
      const permissions = typeof link?.permissions_json === 'string' ? JSON.parse(link.permissions_json) : link?.permissions_json || {};
      if (permissions.noView || permissions.noViewOtherGuardian) return res.status(403).json({ error: { message: 'Account access is restricted' } });
    } else {
      const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId });
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    }
    const offset = Math.max(0, Math.min(Number.parseInt(req.query?.offset, 10) || 0, 1000000));
    const [rows] = await pool.execute(
      `SELECT ${historyText("CONCAT('email-', uc.id)")} AS id, ${historyText('uc.channel')} AS channel,
        ${historyText('uc.template_type')} AS notification_type, ${historyText('uc.recipient_address')} AS recipient_address,
        ${historyText('uc.delivery_status')} AS delivery_status,
        COALESCE(uc.sent_at, uc.generated_at) AS occurred_at, ${historyText('a.name')} AS organization_name
       FROM user_communications uc LEFT JOIN agencies a ON a.id = uc.agency_id WHERE uc.client_id = ?
       UNION ALL
       SELECT ${historyText("CONCAT('sms-', ml.id)")}, ${historyText("'sms'")},
        ${historyText("'session_or_service_notification'")}, ${historyText('ml.to_number')},
        ${historyText('ml.delivery_status')}, ml.created_at, ${historyText('a.name')}
       FROM message_logs ml LEFT JOIN agencies a ON a.id = ml.agency_id
       WHERE ml.client_id = ? AND ml.direction = 'OUTBOUND'
       UNION ALL
       SELECT ${historyText("CONCAT('session-', ac.id)")}, ${historyText('ac.channel')}, ${historyText('ac.kind')},
        ${historyText("JSON_UNQUOTE(JSON_EXTRACT(ac.metadata_json, '$.recipient'))")},
        ${historyText("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ac.metadata_json, '$.status')), 'sent')")},
        ac.created_at, ${historyText('a.name')}
       FROM appointment_communications ac LEFT JOIN agencies a ON a.id = ac.agency_id
       WHERE ac.direction = 'outbound' AND EXISTS (SELECT 1 FROM appointment_participants ap WHERE ap.appointment_id = ac.appointment_id AND ap.client_id = ?)
       UNION ALL
       SELECT ${historyText("CONCAT('app-', n.id)")}, ${historyText("'in_app'")}, ${historyText('n.type')},
        ${historyText("CONCAT_WS(' ', u.first_name, u.last_name)")}, ${historyText("'delivered'")},
        n.created_at, ${historyText('a.name')}
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id LEFT JOIN agencies a ON a.id = n.agency_id
       WHERE (n.related_entity_type = 'client' AND n.related_entity_id = ?)
         OR (n.related_entity_type = 'chat_thread' AND EXISTS (SELECT 1 FROM chat_threads t WHERE t.id = n.related_entity_id AND t.client_id = ?))
         OR (n.related_entity_type = 'support_ticket' AND EXISTS (SELECT 1 FROM support_tickets st WHERE st.id = n.related_entity_id AND st.client_id = ?))
       ORDER BY occurred_at DESC, id DESC LIMIT 50 OFFSET ${offset}`, [clientId, clientId, clientId, clientId, clientId, clientId]);
    // Shared delivery history never discloses another recipient's login/setup links or tokens.
    const notifications = rows.map((r) => ({ id: r.id, channel: r.channel, type: r.notification_type,
      recipient: r.recipient_address, status: r.delivery_status, occurredAt: r.occurred_at, organization: r.organization_name }));
    res.set('Cache-Control', 'no-store');
    res.json({ notifications, hasMore: rows.length === 50, nextOffset: offset + rows.length });
  } catch (e) { next(e); }
}
