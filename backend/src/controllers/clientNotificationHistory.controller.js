import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';

export async function listClientNotificationHistory(req, res, next) {
  try {
    const clientId = Number(req.params.clientId || req.params.id);
    if (!Number.isSafeInteger(clientId) || clientId < 1) return res.status(400).json({ error: { message: 'Invalid client' } });
    if (req.guardianPreviewMode) return res.json({ notifications: [] });
    if (['client', 'client_guardian'].includes(req.user.role)) {
      const [self] = await pool.execute('SELECT id FROM clients WHERE id = ? AND user_id = ?', [clientId, req.user.id]);
      const link = await ClientGuardian.getLink({ clientId, guardianUserId: req.user.id });
      if (!self.length && (!link || !Number(link.access_enabled))) return res.status(403).json({ error: { message: 'Account access is required' } });
      const permissions = typeof link?.permissions_json === 'string' ? JSON.parse(link.permissions_json) : link?.permissions_json || {};
      if (permissions.noView || permissions.noViewOtherGuardian) return res.status(403).json({ error: { message: 'Account access is restricted' } });
    } else {
      const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId });
      if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    }
    const offset = Math.max(0, Math.min(Number.parseInt(req.query?.offset, 10) || 0, 1000000));
    const [rows] = await pool.execute(
      `SELECT CONCAT('email-', uc.id) AS id, uc.channel, uc.template_type AS notification_type,
        uc.recipient_address, uc.delivery_status, COALESCE(uc.sent_at, uc.generated_at) AS occurred_at, a.name AS organization_name
       FROM user_communications uc LEFT JOIN agencies a ON a.id = uc.agency_id WHERE uc.client_id = ?
       UNION ALL
       SELECT CONCAT('sms-', ml.id), 'sms', 'session_or_service_notification', ml.to_number,
       ml.delivery_status, ml.created_at, a.name FROM message_logs ml LEFT JOIN agencies a ON a.id = ml.agency_id
       WHERE ml.client_id = ? AND ml.direction = 'OUTBOUND'
       UNION ALL
       SELECT CONCAT('session-', ac.id), ac.channel, ac.kind,
        JSON_UNQUOTE(JSON_EXTRACT(ac.metadata_json, '$.recipient')),
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ac.metadata_json, '$.status')), 'sent'), ac.created_at, a.name
       FROM appointment_communications ac LEFT JOIN agencies a ON a.id = ac.agency_id
       WHERE ac.direction = 'outbound' AND EXISTS (SELECT 1 FROM appointment_participants ap WHERE ap.appointment_id = ac.appointment_id AND ap.client_id = ?)
       UNION ALL
       SELECT CONCAT('app-', n.id), 'in_app', n.type, CONCAT_WS(' ', u.first_name, u.last_name),
        'delivered', n.created_at, a.name
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
