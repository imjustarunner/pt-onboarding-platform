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

function parseIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function assertClientAgencyAccess(reqUserId, client) {
  // If the client is not agency-scoped, allow (legacy / edge cases).
  const clientAgencyId = client?.agency_id ? Number(client.agency_id) : null;
  if (!clientAgencyId) return true;
  const agencyIds = await getAgencyIdsForUser(reqUserId);
  if (!agencyIds.includes(clientAgencyId)) {
    const err = new Error('Access denied to this client');
    err.status = 403;
    throw err;
  }
  return true;
}

export const getRecentMessages = async (req, res, next) => {
  try {
    // Privacy rule: users can only see their own message logs (no cross-user safety net feed).
    const agencyIds = await getAgencyIdsForUser(req.user.id);
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 200) : 50;
    let rows = [];
    if (agencyIds.length === 0) {
      const [r] = await pool.execute(
        `SELECT ml.*,
                c.initials AS client_initials,
                u.first_name AS user_first_name,
                u.last_name AS user_last_name
         FROM message_logs ml
         LEFT JOIN clients c ON ml.client_id = c.id
         LEFT JOIN users u ON ml.user_id = u.id
         WHERE ml.user_id = ?
         ORDER BY ml.created_at DESC
         LIMIT ?`,
        [req.user.id, limit]
      );
      rows = r;
    } else {
      const placeholders = agencyIds.map(() => '?').join(',');
      const [r] = await pool.execute(
        `SELECT ml.*,
                c.initials AS client_initials,
                u.first_name AS user_first_name,
                u.last_name AS user_last_name
         FROM message_logs ml
         LEFT JOIN clients c ON ml.client_id = c.id
         LEFT JOIN users u ON ml.user_id = u.id
         WHERE ml.user_id = ?
           AND (ml.agency_id IN (${placeholders}) OR ml.agency_id IS NULL)
         ORDER BY ml.created_at DESC
         LIMIT ?`,
        [req.user.id, ...agencyIds, limit]
      );
      rows = r;
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getThread = async (req, res, next) => {
  try {
    const { userId, clientId } = req.params;
    const uidParam = parseIntOrNull(userId);
    const cid = parseIntOrNull(clientId);
    if (!cid) return res.status(400).json({ error: { message: 'clientId is required' } });

    // Privacy rule: the authenticated user can only load their own thread.
    if (uidParam && uidParam !== req.user.id) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const client = await Client.findById(cid, { includeSensitive: false });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    await assertClientAgencyAccess(req.user.id, client);

    const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 200) : 100;
    const rows = await MessageLog.listThread({ userId: req.user.id, clientId: cid, limit });
    res.json({ client, messages: rows });
  } catch (e) {
    next(e);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { userId, clientId, body } = req.body;
    if (userId && parseIntOrNull(userId) && parseIntOrNull(userId) !== req.user.id) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!clientId || !body) {
      return res.status(400).json({ error: { message: 'clientId and body are required' } });
    }

    const uid = req.user.id;
    const cid = parseIntOrNull(clientId);
    if (!cid) return res.status(400).json({ error: { message: 'clientId is required' } });

    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (!user.system_phone_number) {
      return res.status(400).json({ error: { message: 'User does not have a system phone number assigned' } });
    }

    const client = await Client.findById(cid, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    await assertClientAgencyAccess(req.user.id, client);
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

export const deleteThread = async (req, res, next) => {
  try {
    const clientId = parseIntOrNull(req.params.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: false });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    await assertClientAgencyAccess(req.user.id, client);

    const [r] = await pool.execute('DELETE FROM message_logs WHERE user_id = ? AND client_id = ?', [req.user.id, clientId]);
    res.json({ ok: true, deletedCount: r.affectedRows || 0 });
  } catch (e) {
    next(e);
  }
};

export const deleteMessageLog = async (req, res, next) => {
  try {
    const id = parseIntOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const [r] = await pool.execute('DELETE FROM message_logs WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: { message: 'Message not found' } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

