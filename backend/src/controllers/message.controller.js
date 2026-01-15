import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import MessageLog from '../models/MessageLog.model.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import TwilioService from '../services/twilio.service.js';

const canViewSafetyNetFeed = (role) =>
  role === 'support' || role === 'admin' || role === 'super_admin' || role === 'clinical_practice_assistant';

async function getAgencyIdsForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || []).map((a) => a.id);
}

export const getRecentMessages = async (req, res, next) => {
  try {
    const role = req.user.role;
    const agencyIds = await getAgencyIdsForUser(req.user.id);
    if (agencyIds.length === 0) return res.json([]);

    // Support feed: show all recent texts for their agencies.
    if (!canViewSafetyNetFeed(role) && role !== 'clinician' && role !== 'staff') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 200) : 50;
    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT ml.*,
              c.initials AS client_initials,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name
       FROM message_logs ml
       LEFT JOIN clients c ON ml.client_id = c.id
       LEFT JOIN users u ON ml.user_id = u.id
       WHERE ml.agency_id IN (${placeholders})
       ORDER BY ml.created_at DESC
       LIMIT ?`,
      [...agencyIds, limit]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getThread = async (req, res, next) => {
  try {
    const { userId, clientId } = req.params;
    const uid = parseInt(userId);
    const cid = parseInt(clientId);

    // Access: support/admin/cpa can view; clinician can view own only.
    const role = req.user.role;
    if (!canViewSafetyNetFeed(role) && req.user.id !== uid) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const client = await Client.findById(cid, { includeSensitive: false });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 200) : 100;
    const rows = await MessageLog.listThread({ userId: uid, clientId: cid, limit });
    res.json({ client, messages: rows });
  } catch (e) {
    next(e);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { userId, clientId, body } = req.body;
    if (!userId || !clientId || !body) {
      return res.status(400).json({ error: { message: 'userId, clientId, and body are required' } });
    }

    const uid = parseInt(userId);
    const cid = parseInt(clientId);

    // Only staff/clinician can send as themselves; support/admin/cpa can send too (step-in).
    const role = req.user.role;
    if (!canViewSafetyNetFeed(role) && req.user.id !== uid) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (!user.system_phone_number) {
      return res.status(400).json({ error: { message: 'User does not have a system phone number assigned' } });
    }

    const client = await Client.findById(cid, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    if (!client.contact_phone) {
      return res.status(400).json({ error: { message: 'Client does not have a contact phone assigned' } });
    }

    // Gatekeeper integration: this is about after-hours *notifications* to user.
    // For outbound SMS to clients, we still allow sending. But we tag metadata with quiet-hours state for analytics.
    const decision = await NotificationGatekeeperService.decideChannels({
      userId: uid,
      context: { severity: 'info' }
    });

    const outboundLog = await MessageLog.createOutbound({
      agencyId: client.agency_id || null,
      userId: uid,
      clientId: cid,
      body,
      fromNumber: user.system_phone_number,
      toNumber: client.contact_phone,
      deliveryStatus: 'pending',
      metadata: { provider: 'twilio', gatekeeper: decision }
    });

    try {
      const msg = await TwilioService.sendSms({
        to: MessageLog.normalizePhone(client.contact_phone) || client.contact_phone,
        from: MessageLog.normalizePhone(user.system_phone_number) || user.system_phone_number,
        body
      });
      const updated = await MessageLog.markSent(outboundLog.id, msg.sid, { provider: 'twilio', status: msg.status, gatekeeper: decision });
      res.status(201).json(updated);
    } catch (sendErr) {
      await MessageLog.markFailed(outboundLog.id, sendErr.message);
      return res.status(502).json({ error: { message: 'Failed to send SMS via Twilio', details: sendErr.message } });
    }
  } catch (e) {
    next(e);
  }
};

