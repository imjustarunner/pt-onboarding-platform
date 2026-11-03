import { randomBytes, createHash } from 'node:crypto';
import pool from '../config/database.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { publicAppBaseUrl } from './contactReminderToken.service.js';
import { escapeNoticeHtml } from './scheduleNoticeMessage.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const needsCancellationReceipt = facts => facts?.absenceSource === 'cancel_day' && facts.urgent !== false && facts.emailOnly === true;
const hash = token => createHash('sha256').update(token).digest('hex');
const fail = (message, status) => Object.assign(new Error(message), { status });
export function appendCancellationReceipt(message, url) {
  const explanation = 'Please confirm you received this cancellation notice so we know you are aware and do not need to contact you another way.';
  return { ...message, text: `${message.text}\n\n${explanation}\nI received this: ${url}`,
    html: `${message.html || `<p>${escapeNoticeHtml(message.text).replaceAll('\n','<br>')}</p>`}<p>${explanation}</p><p><a href="${escapeNoticeHtml(url)}" style="display:inline-block;background:#16457c;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">I received this</a></p>` };
}

export function createCancellationEmailReceipts(overrides = {}) {
  const d = { database: pool, now: () => new Date(), encrypt: maybeEncryptNotePayload, decrypt: maybeDecryptNotePayload,
    baseUrl: publicAppBaseUrl, randomToken: () => randomBytes(32).toString('base64url'), ...overrides };
  async function issue({ agencyId, clientId, providerId, actorUserId, appointmentId = null, schoolHistoryId = null, deliveryType, deliveryKey, recipient, recipientUserId = null, communicationId = null }) {
    if (![agencyId, clientId, providerId, actorUserId].every(n => Number.isSafeInteger(Number(n)) && Number(n) > 0)
      || !['appointment', 'school_roster'].includes(deliveryType) || !recipient || !deliveryKey) throw fail('A scoped cancellation delivery is required.', 400);
    const token = d.randomToken();
    await d.database.execute(`INSERT IGNORE INTO cancellation_email_receipts
      (agency_id,client_id,provider_id,actor_user_id,appointment_id,school_history_id,communication_id,delivery_type,delivery_key,token_hash,token_payload,recipient_payload,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 90 DAY))`,
    [agencyId,clientId,providerId,actorUserId,appointmentId,schoolHistoryId,communicationId,deliveryType,String(deliveryKey),hash(token),d.encrypt(token),d.encrypt(JSON.stringify({ address:recipient,userId:recipientUserId }))]);
    const [[row]] = await d.database.execute('SELECT id,token_payload FROM cancellation_email_receipts WHERE agency_id=? AND delivery_type=? AND delivery_key=?', [agencyId,deliveryType,String(deliveryKey)]);
    if (!row) throw new Error('Cancellation receipt could not be saved.');
    const base = new URL(d.baseUrl());
    if (base.protocol !== 'https:') throw new Error('A secure public URL is required for cancellation receipts.');
    return { id:Number(row.id), url:`${base.origin}/api/public/cancellation-receipt/${d.decrypt(row.token_payload)}` };
  }
  async function sent(id, status, communicationId = null) {
    await d.database.execute('UPDATE cancellation_email_receipts SET delivery_status=?,communication_id=COALESCE(?,communication_id) WHERE id=?', [status,communicationId,id]);
    if (communicationId) await d.database.execute("UPDATE user_communications SET metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.cancellationReceiptId',?) WHERE id=?", [id,communicationId]);
  }
  async function inspect(token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(String(token))) throw fail('This receipt link is unavailable. Please use the link in your cancellation email.', 404);
    const [[row]] = await d.database.execute('SELECT id,delivery_status,confirmed_at,expires_at FROM cancellation_email_receipts WHERE token_hash=?', [hash(token)]);
    if (!row) throw fail('This receipt link is unavailable. Please use the link in your cancellation email.', 404);
    if (row.confirmed_at) return { confirmed:true };
    const expires = parseUtcDate(row.expires_at);
    if (!expires || +expires <= +d.now()) throw fail('This receipt link has expired. Please reply to your care team to confirm receipt.', 410);
    if (row.delivery_status !== 'sent') throw fail('This notification is still under review. Please try again shortly or reply to your care team.', 409);
    return { confirmed:false };
  }
  async function confirm(token) {
    const state = await inspect(token);
    if (state.confirmed) return state;
    // GET never updates this row. A deliberate POST records one recipient action,
    // not an authenticated identity, clinical signature, read pixel, or RSVP.
    await d.database.execute("UPDATE cancellation_email_receipts SET confirmed_at=UTC_TIMESTAMP() WHERE token_hash=? AND confirmed_at IS NULL AND delivery_status='sent' AND expires_at>UTC_TIMESTAMP()", [hash(token)]);
    const [[row]] = await d.database.execute('SELECT id,confirmed_at,communication_id FROM cancellation_email_receipts WHERE token_hash=?', [hash(token)]);
    if (!row?.confirmed_at) throw fail('We could not record receipt. Please try again.', 409);
    if (row.communication_id) await d.database.execute("UPDATE user_communications SET metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.cancellationReceiptConfirmedAt',?,'$.cancellationReceiptMethod','recipient_button') WHERE id=?", [row.confirmed_at,row.communication_id]);
    return { confirmed:true };
  }
  return { issue, sent, inspect, confirm };
}
export const cancellationEmailReceipts = createCancellationEmailReceipts();
