import { createHash, randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import StorageService from './storage.service.js';

export const MAX_EMAIL_BYTES = 25 * 1024 * 1024;
const filenameFor = (v) => String(v || 'attachment').replace(/[\r\n/\\\x00-\x1f]/g, '_').slice(0, 180);

export function collectEmailAttachmentParts(payload) {
  const out = [];
  function visit(part) {
    if (!part) return;
    for (const child of part.parts || []) visit(child);
    if (!part.filename || String(part.mimeType || '').startsWith('multipart/')) return;
    out.push({ filename: filenameFor(part.filename), contentType: part.mimeType || 'application/octet-stream', partId: part.partId || String(out.length), size: Number(part.body?.size || 0), attachmentId: part.body?.attachmentId, data: part.body?.data });
  }
  visit(payload);
  if (out.reduce((n, p) => n + p.size, 0) > MAX_EMAIL_BYTES) throw new Error('Email attachments exceed 25 MB');
  return out;
}

export async function prepareInboundAttachments({ gmail, gmailMessageId, payload, inboxId }) {
  const parts = collectEmailAttachmentParts(payload);
  if (!parts.length) return [];
  const bucket = await StorageService.getGCSBucket();
  const result = [];
  let total = 0;
  for (const part of parts) {
    const encoded = part.data ?? (await gmail.users.messages.attachments.get({ userId: 'me', messageId: gmailMessageId, id: part.attachmentId })).data?.data;
    if (!encoded) throw new Error(`Attachment could not be downloaded: ${part.filename}`);
    const buffer = Buffer.from(encoded, 'base64url');
    total += buffer.length;
    if (total > MAX_EMAIL_BYTES) throw new Error('Email attachments exceed 25 MB');
    const hash = createHash('sha256').update(`${gmailMessageId}:${part.partId}`).digest('hex');
    const key = `communication-attachments/inbox-${inboxId}/${hash}/${part.filename}`;
    await bucket.file(key).save(buffer, { resumable: false, contentType: part.contentType });
    result.push({ filename: part.filename, contentType: part.contentType, sizeBytes: buffer.length, storageKey: key });
  }
  return result;
}

export async function persistOutboundAttachments(messageId, attachments = []) {
  if (!attachments?.length) return;
  if (!Array.isArray(attachments) || attachments.length > 50) throw new Error('Too many email attachments');
  let total = 0;
  const prepared = attachments.map((att) => {
    const buffer = Buffer.from(String(att.contentBase64 || att.content || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
    total += buffer.length;
    if (!buffer.length || total > MAX_EMAIL_BYTES) throw new Error('Invalid attachment or email attachments exceed 25 MB');
    return { att, buffer };
  });
  const bucket = await StorageService.getGCSBucket();
  for (const { att, buffer } of prepared) {
    const filename = filenameFor(att.filename || att.name);
    const key = `communication-attachments/message-${messageId}/${randomUUID()}/${filename}`;
    await bucket.file(key).save(buffer, { resumable: false, contentType: att.contentType || 'application/octet-stream' });
    await pool.execute(`INSERT INTO communication_attachments (message_id, filename, content_type, size_bytes, storage_key) VALUES (?, ?, ?, ?, ?)`,
      [messageId, filename, att.contentType || 'application/octet-stream', buffer.length, key]);
  }
}

export async function readCommunicationAttachment(row) {
  const key = String(row?.storage_key || '');
  if (key.startsWith('communication-attachments/')) {
    const bucket = await StorageService.getGCSBucket();
    const [buffer] = await bucket.file(key).download();
    return buffer;
  }
  // Compatibility for mail queued by old revisions. Never accept arbitrary paths.
  if (/^scheduled-email\/\d+\/[^/\\]+$/.test(key)) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const root = await fs.realpath(path.resolve('uploads/scheduled-email'));
    const file = await fs.realpath(path.resolve('uploads', key));
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Invalid attachment path');
    return fs.readFile(file);
  }
  throw new Error('Attachment storage is unavailable');
}

export async function loadOutboundAttachments(messageId) {
  const [rows] = await pool.execute('SELECT * FROM communication_attachments WHERE message_id = ? ORDER BY id', [messageId]);
  const out = [];
  for (const row of rows) out.push({ filename: row.filename, contentType: row.content_type, contentBase64: (await readCommunicationAttachment(row)).toString('base64') });
  return out;
}

export async function downloadCommunicationAttachment(req, res, next) {
  try {
    const [rows] = await pool.execute(`SELECT a.* FROM communication_attachments a JOIN communication_messages m ON m.id = a.message_id WHERE a.id = ? AND m.conversation_id = ? LIMIT 1`, [req.params.attachmentId, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: { message: 'Attachment not found' } });
    const row = rows[0];
    const buffer = await readCommunicationAttachment(row);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.attachment(filenameFor(row.filename));
    res.type('application/octet-stream').send(buffer);
  } catch (e) { next(e); }
}
