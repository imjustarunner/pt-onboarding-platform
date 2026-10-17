import crypto from 'node:crypto';
import { smsPolicyError, validateSmsRegistration } from '../utils/smsCompliancePolicy.js';

export const CLIENT_SMS_PURPOSES = ['care', 'reminders', 'billing', 'account_security'];
export function smsTransport(delivery, env = process.env) {
  const registration = delivery.registration || {};
  if (registration.provider !== 'notifyre') {
    if (env.NOTIFYRE_CLIENT_CAMPAIGN_ID && registration.campaignId === env.NOTIFYRE_CLIENT_CAMPAIGN_ID) {
      throw smsPolicyError('notifyre_registration_incomplete', 'Client campaign transport must be configured before sending.');
    }
    return 'vonage';
  }
  if (validateSmsRegistration(registration).length || registration.campaignId !== env.NOTIFYRE_CLIENT_CAMPAIGN_ID ||
      registration.purposes.some(p => !CLIENT_SMS_PURPOSES.includes(p)) ||
      (!delivery.controlReply && !CLIENT_SMS_PURPOSES.includes(delivery.purpose))) {
    throw smsPolicyError('notifyre_client_scope_required', 'Notifyre is limited to the approved client notification campaign.');
  }
  if (env.NOTIFYRE_ENABLED !== 'true' || !env.NOTIFYRE_API_TOKEN || !env.NOTIFYRE_WEBHOOK_SECRET) {
    throw smsPolicyError('notifyre_not_ready', 'Notifyre client messaging is awaiting activation.');
  }
  return 'notifyre';
}

export async function sendNotifyreSms(delivery, { fetchImpl = fetch, env = process.env } = {}) {
  if (smsTransport(delivery, env) !== 'notifyre') throw new Error('A Notifyre registration is required.');
  let response, data;
  try {
    response = await fetchImpl('https://api.notifyre.com/sms/send', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'x-api-token': env.NOTIFYRE_API_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ Body: delivery.body, From: delivery.from,
        Recipients: [{ type: 'mobile_number', value: delivery.to }], AddUnsubscribeLink: false,
        CampaignName: 'client-notifications' })
    });
    data = await response.json();
  } catch {
    // An uncertain network result must never trigger a second carrier send.
    throw smsPolicyError('notifyre_delivery_uncertain', 'Notifyre did not confirm acceptance. Check message activity before retrying.');
  }
  const payload = data?.payload || data?.Payload;
  const id = payload?.smsMessageID || payload?.SmsMessageID;
  const invalid = payload?.invalidToNumbers || payload?.InvalidToNumbers || [];
  if (!response.ok || (data?.success ?? data?.Success) !== true || !id || invalid.length) {
    throw smsPolicyError('notifyre_send_rejected', 'Notifyre did not accept this message. Check the campaign, sender and recipient in Notifyre.');
  }
  return { sid: `notifyre:${id}`, status: 'queued', to: delivery.to, provider: 'notifyre' };
}

export function verifyNotifyreSignature(rawBody, header, secret, now = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || !secret || typeof header !== 'string') return false;
  const values = header.split(',').map(part => part.trim().split('='));
  if (values.filter(([key]) => key === 't').length !== 1 || values.filter(([key]) => key === 'v').length !== 1) return false;
  const timestamp = values.find(([key]) => key === 't')?.[1];
  const signature = values.find(([key]) => key === 'v')?.[1];
  if (!/^\d+$/.test(timestamp || '') || !/^[a-f0-9]{64}$/i.test(signature || '') || Math.abs(now - Number(timestamp) * 1000) > 300000) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function normalizeNotifyreEvent(event) {
  const payload = event?.Payload || event?.payload;
  const type = event?.Event || event?.event;
  if (!payload) return null;
  if (type === 'sms_received') {
    const id = payload.ReplyID || payload.replyID;
    const from = payload.SenderNumber || payload.senderNumber;
    const to = payload.RecipientNumber || payload.recipientNumber;
    if (!id || !from || !to) throw new Error('Incomplete Notifyre received event.');
    return { type, id: `notifyre:${id}`, from, to, text: payload.Message ?? payload.message ?? '' };
  }
  if (type === 'sms_sent') {
    const recipient = payload.Recipient || payload.recipient || {};
    const id = payload.ID || payload.id;
    const status = String(recipient.DeliveryStatus || recipient.deliveryStatus || recipient.Status || recipient.status || '').toLowerCase();
    if (!id || !status) throw new Error('Incomplete Notifyre delivery event.');
    return { type, id: `notifyre:${id}`, from: payload.FromNumber || payload.fromNumber, to: recipient.ToNumber || recipient.toNumber,
      status: status === 'successful' ? 'delivered' : status === 'accepted' ? 'queued' : status };
  }
  return null;
}
