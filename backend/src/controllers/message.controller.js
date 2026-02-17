import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import MessageLog from '../models/MessageLog.model.js';
import Agency from '../models/Agency.model.js';
import TwilioOptInState from '../models/TwilioOptInState.model.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import TwilioService from '../services/twilio.service.js';
import { resolveOutboundNumber } from '../services/twilioNumberRouting.service.js';
import SmsThreadEscalation from '../models/SmsThreadEscalation.model.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};

const canViewSafetyNetFeed = (role) =>
  role === 'support' || role === 'admin' || role === 'super_admin' || role === 'clinical_practice_assistant' || role === 'provider_plus';

async function getAgencyIdsForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || [])
    .map((a) => Number(a?.id))
    .filter((id) => Number.isFinite(id) && id > 0);
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
    const uid = parseIntOrNull(req.user?.id);
    if (!uid) return res.status(401).json({ error: { message: 'Not authenticated' } });

    // Privacy rule: users can only see their own message logs (no cross-user safety net feed).
    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const safeUid = Number(uid);
    const safeLimit = Number(limit);
    const sql = `
      SELECT ml.*,
             c.initials AS client_initials,
             u.first_name AS user_first_name,
             u.last_name AS user_last_name
      FROM message_logs ml
      LEFT JOIN clients c ON ml.client_id = c.id
      LEFT JOIN users u ON ml.user_id = u.id
      WHERE ml.user_id = ${safeUid}
        AND (
          ml.agency_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM user_agencies ua
            WHERE ua.user_id = ${safeUid}
              AND ua.agency_id = ml.agency_id
          )
        )
      ORDER BY ml.created_at DESC
      LIMIT ${safeLimit}
    `;
    const [rows] = await pool.query(sql);
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

    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
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

    const client = await Client.findById(cid, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    await assertClientAgencyAccess(req.user.id, client);
    if (!client.contact_phone) {
      return res.status(400).json({ error: { message: 'Client does not have a contact phone assigned' } });
    }

    const resolved = await resolveOutboundNumber({
      userId: uid,
      clientId: cid,
      requestedNumberId: req.body?.numberId ? parseIntOrNull(req.body.numberId) : null
    });
    if (resolved?.error === 'number_unavailable') {
      return res.status(404).json({ error: { message: 'Selected number is unavailable' } });
    }
    if (resolved?.error === 'number_not_assigned') {
      return res.status(403).json({ error: { message: 'Selected number is not assigned to you' } });
    }
    if (resolved?.error === 'number_not_accessible') {
      return res.status(403).json({ error: { message: 'Selected number is not accessible for this agency' } });
    }
    if (!resolved?.number && !user.system_phone_number) {
      return res.status(400).json({ error: { message: 'No system phone number assigned for sending' } });
    }

    let activeEscalation = null;
    try {
      activeEscalation = await SmsThreadEscalation.findActive({ userId: uid, clientId: cid });
    } catch {
      activeEscalation = null;
    }
    if (activeEscalation && activeEscalation.thread_mode === 'read_only') {
      return res.status(403).json({
        error: {
          message: 'This thread is currently escalated to support in read-only mode for the provider.'
        }
      });
    }
    const fromNumber = resolved?.number?.phone_number || user.system_phone_number;
    const numberId = resolved?.number?.id || null;
    const ownerType = resolved?.ownerType || (resolved?.number ? 'agency' : 'staff');
    const assignedUserId = resolved?.assignment?.user_id || uid;

    // Compliance: opt-in/opt-out handling per agency feature flags.
    const agency = client.agency_id ? await Agency.findById(client.agency_id) : null;
    const flags = parseFeatureFlags(agency?.feature_flags);
    const complianceMode = String(flags.smsComplianceMode || 'opt_in_required');
    if (numberId && client?.id) {
      const optState = await TwilioOptInState.findByClientNumber({ clientId: client.id, numberId });
      const optStatus = optState?.status || 'pending';
      if (optStatus === 'opted_out') {
        return res.status(403).json({ error: { message: 'Client has opted out of SMS' } });
      }
      if (complianceMode === 'opt_in_required' && optStatus !== 'opted_in') {
        return res.status(403).json({ error: { message: 'Client has not opted in to SMS yet' } });
      }
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
      assignedUserId,
      numberId,
      ownerType,
      clientId: cid,
      body,
      fromNumber,
      toNumber: client.contact_phone,
      deliveryStatus: 'pending',
      metadata: { provider: 'twilio', gatekeeper: decision, numberId }
    });

    try {
      const msg = await TwilioService.sendSms({
        to: MessageLog.normalizePhone(client.contact_phone) || client.contact_phone,
        from: MessageLog.normalizePhone(fromNumber) || fromNumber,
        body
      });
      const updated = await MessageLog.markSent(outboundLog.id, msg.sid, { provider: 'twilio', status: msg.status, gatekeeper: decision });
      await logAuditEvent(req, {
        actionType: 'sms_sent',
        agencyId: client.agency_id || null,
        metadata: {
          clientId: cid,
          messageLogId: updated?.id || outboundLog?.id || null,
          numberId,
          ownerType
        }
      });
      await SmsThreadEscalation.resolveActive({ userId: uid, clientId: cid }).catch(() => {});
      res.status(201).json(updated);
    } catch (sendErr) {
      await MessageLog.markFailed(outboundLog.id, sendErr.message);
      await logAuditEvent(req, {
        actionType: 'sms_send_failed',
        agencyId: client.agency_id || null,
        metadata: {
          clientId: cid,
          messageLogId: outboundLog?.id || null,
          numberId,
          ownerType,
          error: String(sendErr?.message || '').slice(0, 400)
        }
      });
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
    await logAuditEvent(req, {
      actionType: 'sms_thread_deleted',
      agencyId: client.agency_id || null,
      metadata: { clientId, deletedCount: Number(r?.affectedRows || 0) }
    });
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
    await logAuditEvent(req, {
      actionType: 'sms_message_deleted',
      metadata: { messageLogId: id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

