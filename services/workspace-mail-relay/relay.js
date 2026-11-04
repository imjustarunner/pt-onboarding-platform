import { createHash } from 'node:crypto';

export const failure = (status, code) => Object.assign(new Error(code), { status, code });
const digest = value => createHash('sha256').update(value).digest('hex');
const emailPattern = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i;

export function prepareMessage(input, { domains, parseAddresses, maxBytes = 10 * 1024 * 1024 }) {
  if (!/^communication:[1-9][0-9]{0,15}$/.test(input?.key || '')) throw failure(400, 'invalid_delivery_key');
  const from = String(input.from || '').trim().toLowerCase();
  if (!emailPattern.test(from) || from.startsWith('ai@') || !domains.includes(from.split('@')[1])) throw failure(403, 'sender_not_allowed');
  if (typeof input.raw !== 'string' || input.raw.length > Math.ceil(maxBytes * 4 / 3) + 4 || !/^[a-zA-Z0-9_-]+$/.test(input.raw)) throw failure(400, 'invalid_message');
  const bytes = Buffer.from(input.raw, 'base64url');
  if (bytes.length > maxBytes) throw failure(413, 'message_too_large');
  const raw = bytes.toString('utf8');
  const separator = raw.indexOf('\r\n\r\n');
  if (separator < 0 || separator > 65536) throw failure(400, 'invalid_headers');
  const headerText = raw.slice(0, separator);
  if (/(^|[^\r])\n|\r(?!\n)/.test(headerText)) throw failure(400, 'invalid_headers');
  const headers = new Map();
  const lines = headerText.replace(/\r\n[ \t]+/g, ' ').split('\r\n');
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9-]+):[ \t]*(.*)$/);
    if (!match) throw failure(400, 'invalid_headers');
    const key = match[1].toLowerCase();
    if (['from', 'sender', 'return-path', 'message-id', 'to', 'cc', 'bcc'].includes(key) && headers.has(key)) throw failure(400, 'duplicate_address_header');
    headers.set(key, match[2]);
  }
  const addresses = value => {
    const parsed = parseAddresses(value || '', { flatten: true });
    if (parsed.some(a => !emailPattern.test(a.address || ''))) throw failure(400, 'invalid_address');
    return parsed.map(a => a.address.toLowerCase());
  };
  const visibleFrom = addresses(headers.get('from'));
  if (visibleFrom.length !== 1 || visibleFrom[0] !== from || headers.has('sender') || headers.has('return-path')) throw failure(403, 'sender_mismatch');
  const messageId = `<comm-${input.key.split(':')[1]}@${from.split('@')[1]}>`;
  if (headers.get('message-id') !== messageId) throw failure(400, 'message_id_mismatch');
  const recipients = [...new Set(['to', 'cc', 'bcc'].flatMap(key => addresses(headers.get(key))))].sort();
  if (!recipients.length || recipients.length > 100) throw failure(400, 'invalid_recipient_count');
  // Bcc remains only in the private envelope; it must not reach recipient headers.
  const wire = headerText.replace(/^Bcc:[^\r\n]*(?:\r\n[ \t][^\r\n]*)*(?:\r\n|$)/gim, '') + raw.slice(separator);
  return { key: digest(input.key), scope: digest(JSON.stringify({ from, recipients, messageId })),
    id: `relay-${digest(input.key).slice(0, 32)}`, messageId, from, recipients, raw: wire };
}

function definitelyRejected(error) {
  const responseCode = Number(error.responseCode);
  return (responseCode >= 400 && responseCode <= 599)
    || ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO'].includes(error.command);
}

/** Storage contains hashes/status only, never MIME, addresses, subjects or bodies.
 * The pre-send lock is durable. An interrupted DATA phase stays held for review. */
export async function dispatchMessage(message, { store, smtp }) {
  let lock = await store.read(message.key);
  if (lock && lock.value.scope !== message.scope) throw failure(409, 'delivery_scope_changed');
  if (lock?.value.status === 'accepted') return { ...lock.value.result, duplicate: true };
  if (lock && lock.value.status !== 'rejected') throw failure(409, 'delivery_requires_review');
  try {
    lock = await store.write(message.key, { scope: message.scope, status: 'sending', at: new Date().toISOString() }, lock?.generation || 0);
  } catch (error) {
    if (Number(error.code) === 412) throw failure(409, 'delivery_in_progress');
    throw failure(503, 'delivery_storage_unavailable');
  }
  let sent;
  try {
    sent = await smtp.sendMail({ envelope: { from: message.from, to: message.recipients }, raw: Buffer.from(message.raw) });
  } catch (error) {
    const status = definitelyRejected(error) ? 'rejected' : 'unknown';
    await store.write(message.key, { scope: message.scope, status, at: new Date().toISOString() }, lock.generation).catch(() => {});
    throw failure(status === 'rejected' ? 502 : 409, status === 'rejected' ? 'smtp_rejected' : 'delivery_requires_review');
  }
  if (!sent.accepted?.length) {
    await store.write(message.key, { scope: message.scope, status: 'unknown', at: new Date().toISOString() }, lock.generation).catch(() => {});
    throw failure(409, 'delivery_requires_review');
  }
  const result = { status: 'accepted', id: message.id, messageId: message.messageId,
    partial: !!sent.rejected?.length, rejectedCount: sent.rejected?.length || 0 };
  // SMTP has accepted the message. Even if this storage write fails, report that
  // acceptance. The retained sending lock prevents a duplicate after a lost reply.
  await store.write(message.key, { scope: message.scope, status: 'accepted', result, at: new Date().toISOString() }, lock.generation).catch(() => {});
  return result;
}
