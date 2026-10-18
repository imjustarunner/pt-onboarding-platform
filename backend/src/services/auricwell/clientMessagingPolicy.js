import crypto from 'node:crypto';
import { fail, hash } from './policy.js';
import { normalizeSessionPhone } from './integrationPolicy.js';

export const SMS_CATEGORIES = Object.freeze(['reminders', 'links', 'forms', 'account', 'conversations']);
export const CATEGORY_COMMANDS = Object.freeze({ NOREMIND: 'reminders', NOLINK: 'links', NOFORM: 'forms' });
export const emptyCategories = () => Object.fromEntries(SMS_CATEGORIES.map(k => [k, false]));
export const phoneKey = phone => hash(`auricwell:sms:phone:${normalizeSessionPhone(phone)}`);
export function smsCommand(body) {
  const value = String(body || '').trim().toUpperCase();
  if (CATEGORY_COMMANDS[value]) return { type: 'category', category: CATEGORY_COMMANDS[value] };
  if (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPT OUT)[.!]?$/.test(value)
    || /^(PLEASE )?(STOP (TEXTING|MESSAGING)( ME)?|DO NOT (TEXT|MESSAGE)( ME)?|DON'T (TEXT|MESSAGE)( ME)?|REMOVE ME( FROM (YOUR|THE) (LIST|TEXTS))?)[.!]?$/.test(value)) return { type: 'stop' };
  if (['START', 'UNSTOP', 'YES'].includes(value)) return { type: 'start' };
  if (['HELP', 'INFO'].includes(value)) return { type: 'help' };
  if (value === 'Y') return { type: 'attendance' };
  return null;
}
export function routeFor(settings, practiceId) {
  return (settings.clientMessaging?.routes || []).find(r => r.practiceId === practiceId);
}
export function assertMessagingReady(settings, practiceId, line = 'main') {
  const route = routeFor(settings, practiceId);
  if (!route || !route.enabled || route.approval !== 'approved' || !route.campaignId || !route.verifiedAt || route.verifiedProvider !== settings.smsProvider)
    throw fail(409, 'This agency’s SMS campaign is not approved and verified for sending.');
  if (!['main', 'provider'].includes(line) || !normalizeSessionPhone(route[`${line}Number`]))
    throw fail(409, 'The agency SMS number is not connected.');
  if (settings.smsProvider === 'notifyre') {
    if (!settings.notifyre.apiToken || !settings.notifyre.baaReference || !settings.notifyre.webhookSecret || !settings.notifyre.webhookVerifiedAt)
      throw fail(409, 'Connect Notifyre, record the BAA, and verify signed webhooks before sending.');
  } else if (settings.smsProvider === 'vonage') {
    if (process.env.VONAGE_CLINICAL_APPROVED !== 'true') throw fail(409, 'Vonage patient messaging is not enabled.');
  } else throw fail(409, 'Patient texting is turned off.');
  return route;
}
export function smsFooter(category) {
  const keyword = Object.entries(CATEGORY_COMMANDS).find(([, c]) => c === category)?.[0];
  return `${keyword ? ` Reply ${keyword} to stop ${category === 'links' ? 'session links' : category === 'forms' ? 'form texts' : 'appointment reminders'}.` : ''} Reply STOP to opt out of all SMS; HELP for help.`;
}
// Notifyre's official Node SDK signs timestamp + '.' + JSON.stringify(payload).
// https://github.com/GoLogic-Group/notifyre-nodejs-sdk/blob/master/src/utilities.ts
// Accept raw serialization too, for senders that preserve whitespace; both must
// authenticate the complete payload. No unsigned/partial-payload fallback.
export function verifyNotifyreSignature(raw, header, secret, now = Date.now()) {
  if (!secret || !Buffer.isBuffer(raw) || raw.length > 256 * 1024) throw fail(403, 'Invalid webhook signature.');
  const match = /^t=(\d{10}),v=([a-fA-F0-9]{64})$/.exec(String(header || '').replace(/\s/g, ''));
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) throw fail(403, 'Invalid webhook signature.');
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { throw fail(400, 'Invalid webhook body.'); }
  const supplied = Buffer.from(match[2], 'hex');
  const matches = [raw.toString('utf8'), JSON.stringify(event)].some(body => {
    const expected = crypto.createHmac('sha256', secret).update(`${match[1]}.${body}`).digest();
    return crypto.timingSafeEqual(expected, supplied);
  });
  if (!matches) throw fail(403, 'Invalid webhook signature.');
  return event;
}
export function normalizeNotifyreEvent(event) {
  const p = event?.Payload;
  if (!p || !['sms_received', 'sms_sent', 'mms_received'].includes(event.Event)) throw fail(400, 'Unsupported Notifyre event.');
  if (event.Event === 'sms_sent') {
    if (!p.ID) throw fail(400, 'Missing delivery ID.');
    const status = String(p.Recipient?.Status || p.Status || '').toLowerCase();
    return { type: 'delivery', id: String(p.ID), status,
      key: hash(JSON.stringify([event.Event, p.ID, p.Recipient?.ID, status, p.LastModifiedDateUtc || event.Timestamp])) };
  }
  const from = normalizeSessionPhone(p.SenderNumber), to = normalizeSessionPhone(p.RecipientNumber);
  const at = Number(p.ReceivedDateUtc || event.Timestamp) * 1000;
  if (!p.ReplyID || !from || !to || !Number.isFinite(at) || at <= 0 || at > Date.now() + 300000 || typeof p.Message !== 'string' || p.Message.length > 10000)
    throw fail(400, 'Invalid incoming message.');
  return { type: 'inbound', id: String(p.ReplyID), from, to, body: p.Message, at, attachment: event.Event === 'mms_received', key: hash(`notifyre:inbound:${p.ReplyID}`) };
}
export function parseRelayReply(body) {
  const m = /^([a-z0-9]{1,24})\s+([\s\S]+)$/i.exec(String(body || '').trim());
  return m ? { tag: m[1].toLowerCase(), body: m[2].trim(), close: m[2].trim().toUpperCase() === 'CLOSED' } : null;
}
export function onRelayShift(config, now = Date.now()) {
  if (!config.enabled || !config.consentConfirmed || !config.deviceApproved || !normalizeSessionPhone(config.phone)) return false;
  let parts;
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)); }
  catch { return false; }
  const part = k => parts.find(p => p.type === k)?.value;
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'));
  const time = `${part('hour')}:${part('minute')}`;
  return (config.shifts || []).some(s => s.day === day && /^\d\d:\d\d$/.test(s.start) && /^\d\d:\d\d$/.test(s.end) && s.start <= time && time < s.end);
}
