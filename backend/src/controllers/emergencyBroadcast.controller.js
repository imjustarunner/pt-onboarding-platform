import pool from '../config/database.js';
import User from '../models/User.model.js';
import TwilioService from '../services/twilio.service.js';
import MessageLog from '../models/MessageLog.model.js';
import Notification from '../models/Notification.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';

const canBroadcast = (role) => role === 'admin' || role === 'super_admin' || role === 'support';

function pickUserSmsNumber(user) {
  // Prefer personal_phone, then work_phone, then legacy phone_number
  return (
    user?.personal_phone ||
    user?.work_phone ||
    user?.phone_number ||
    null
  );
}

async function getAccessibleAgencyIdsForUser(userId, role) {
  if (role === 'super_admin') {
    // super_admin can broadcast to any agency, but we still require explicit agencyId in request for safety
    return null;
  }
  const agencies = await User.getAgencies(userId);
  return (agencies || []).map((a) => a.id);
}

export const createAndSendBroadcast = async (req, res, next) => {
  try {
    if (!canBroadcast(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const {
      agencyId,
      title,
      body,
      roles = [],
      channels = { sms: true, email: false }
    } = req.body || {};

    if (!title || !body) {
      return res.status(400).json({ error: { message: 'title and body are required' } });
    }

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required (for safety)' } });
    }

    const accessible = await getAccessibleAgencyIdsForUser(req.user.id, req.user.role);
    if (accessible && !accessible.includes(parseInt(agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied to this agency' } });
    }

    const normalizedRoles = Array.isArray(roles) ? roles : [];
    const filters = { agencyId: parseInt(agencyId), roles: normalizedRoles };

    const [broadcastResult] = await pool.execute(
      `INSERT INTO emergency_broadcasts
       (agency_id, created_by_user_id, title, body, channels, filters, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, 'sending', NOW())`,
      [
        parseInt(agencyId),
        req.user.id,
        title,
        body,
        JSON.stringify(channels || { sms: true, email: false }),
        JSON.stringify(filters)
      ]
    );

    const broadcastId = broadcastResult.insertId;

    // Resolve recipients
    const params = [parseInt(agencyId)];
    let roleClause = '';
    if (normalizedRoles.length > 0) {
      roleClause = ` AND u.role IN (${normalizedRoles.map(() => '?').join(',')})`;
      params.push(...normalizedRoles);
    }

    const [users] = await pool.execute(
      `SELECT DISTINCT u.*
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ${roleClause}`,
      params
    );

    // Create recipient rows first (pending)
    const recipients = [];
    if (channels?.sms) {
      for (const u of users) {
        const phone = pickUserSmsNumber(u);
        if (!phone) continue;
        recipients.push({ userId: u.id, channel: 'sms', recipient: phone });
      }
    }

    for (const r of recipients) {
      await pool.execute(
        `INSERT INTO emergency_broadcast_recipients
         (broadcast_id, user_id, channel, recipient_address, delivery_status)
         VALUES (?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE recipient_address = VALUES(recipient_address)`,
        [broadcastId, r.userId, r.channel, r.recipient]
      );
    }

    // Throttled send (50 at a time)
    let sent = 0;
    let failed = 0;
    const batchSize = 50;

    if (channels?.sms) {
      const from = process.env.TWILIO_BROADCAST_FROM || process.env.TWILIO_DEFAULT_FROM;
      if (!from) {
        return res.status(400).json({ error: { message: 'Missing TWILIO_BROADCAST_FROM (or TWILIO_DEFAULT_FROM) env var' } });
      }

      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        await Promise.all(batch.map(async (r) => {
          try {
            const to = MessageLog.normalizePhone(r.recipient) || r.recipient;
            const msg = await TwilioService.sendSms({ to, from, body });
            sent += 1;
            await pool.execute(
              `UPDATE emergency_broadcast_recipients
               SET delivery_status = 'sent', provider_message_id = ?, sent_at = NOW()
               WHERE broadcast_id = ? AND user_id = ? AND channel = 'sms'`,
              [msg.sid, broadcastId, r.userId]
            );

            // In-app notification (bypass preferences by meaning; delivery is in-app)
            await createNotificationAndDispatch(
              {
              type: 'emergency_broadcast',
              severity: 'urgent',
              title,
              message: body,
              userId: r.userId,
              agencyId: parseInt(agencyId),
              relatedEntityType: 'emergency_broadcast',
              relatedEntityId: broadcastId
              },
              { context: { isEmergencyBroadcast: true, isUrgent: true } }
            );
          } catch (e) {
            failed += 1;
            await pool.execute(
              `UPDATE emergency_broadcast_recipients
               SET delivery_status = 'failed', error_message = ?
               WHERE broadcast_id = ? AND user_id = ? AND channel = 'sms'`,
              [e.message, broadcastId, r.userId]
            );
          }
        }));
      }
    }

    const finalStatus = failed > 0 ? 'failed' : 'sent';
    await pool.execute(
      `UPDATE emergency_broadcasts
       SET status = ?, finished_at = NOW()
       WHERE id = ?`,
      [finalStatus, broadcastId]
    );

    res.status(201).json({ id: broadcastId, status: finalStatus, sent, failed, total: recipients.length });
  } catch (e) {
    next(e);
  }
};

export const listBroadcasts = async (req, res, next) => {
  try {
    if (!canBroadcast(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const accessible = await getAccessibleAgencyIdsForUser(req.user.id, req.user.role);
    if (accessible && !accessible.includes(agencyId)) {
      return res.status(403).json({ error: { message: 'Access denied to this agency' } });
    }

    const [rows] = await pool.execute(
      `SELECT * FROM emergency_broadcasts
       WHERE agency_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

