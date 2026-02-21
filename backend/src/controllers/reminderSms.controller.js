/**
 * Send reminder/digest via SMS to the current user ("Text me this").
 */
import User from '../models/User.model.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import TwilioService from '../services/twilio.service.js';
import { resolveReminderNumber } from '../services/twilioNumberRouting.service.js';
import NotificationSmsLog from '../models/NotificationSmsLog.model.js';
import UserCommunication from '../models/UserCommunication.model.js';
import { buildReminderDigestText } from '../services/reminderDigest.service.js';

function pickUserPhone(user) {
  const raw = user?.personal_phone || user?.work_phone || user?.phone_number || null;
  return raw ? TwilioNumber.normalizePhone(raw) : null;
}

export const sendReminderSms = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const to = pickUserPhone(user);
    if (!to) {
      return res.status(400).json({
        error: { message: 'No phone number on file. Add a phone number in your account settings to receive text reminders.' }
      });
    }

    let body;
    if (req.body?.useDigest) {
      const agencies = await User.getAgencies(userId);
      const agencyId = agencies?.[0]?.id || req.body?.agencyId || null;
      body = await buildReminderDigestText(userId, agencyId);
    } else {
      const text = String(req.body?.text || req.body?.message || '').trim();
      body = text || `You have ${req.body?.count ?? 0} notification(s) needing attention. Log in to review.`;
    }
    const truncated = body.length > 480 ? body.slice(0, 477) + '...' : body;

    const agencies = await User.getAgencies(userId);
    const agencyId = agencies?.[0]?.id || null;
    const resolved = await resolveReminderNumber({ providerUserId: userId, clientId: null });

    if (!resolved?.number?.phone_number) {
      return res.status(503).json({
        error: { message: 'SMS is not configured for your agency. Contact your administrator.' }
      });
    }

    const from = TwilioNumber.normalizePhone(resolved.number.phone_number) || resolved.number.phone_number;

    const log = await NotificationSmsLog.create({
      userId,
      agencyId,
      notificationId: null,
      toNumber: to,
      fromNumber: from,
      body: truncated,
      status: 'pending'
    });

    let comm = null;
    try {
      comm = await UserCommunication.create({
        userId,
        agencyId,
        templateType: 'reminder_sms',
        templateId: null,
        subject: null,
        body: truncated,
        generatedByUserId: userId,
        channel: 'sms',
        recipientAddress: to,
        deliveryStatus: 'pending'
      });
    } catch (e) {
      console.warn('UserCommunication create (reminder SMS) failed:', e?.message);
    }

    try {
      const msg = await TwilioService.sendSms({ to, from, body: truncated });
      await NotificationSmsLog.updateStatus(log.id, { status: 'sent', twilioSid: msg.sid });
      if (comm?.id) {
        await UserCommunication.updateDeliveryStatus(comm.id, 'sent', msg?.sid || null);
      }
    } catch (e) {
      await NotificationSmsLog.updateStatus(log.id, { status: 'failed', errorMessage: e.message });
      if (comm?.id) {
        await UserCommunication.updateDeliveryStatus(
          comm.id,
          'failed',
          null,
          null,
          String(e?.message || 'send_failed').slice(0, 500)
        );
      }
      return res.status(502).json({
        error: { message: 'Failed to send SMS', details: e.message }
      });
    }

    res.json({ ok: true, message: 'Reminder sent to your phone' });
  } catch (err) {
    next(err);
  }
};
