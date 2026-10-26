/**
 * Persist Gmail inbound attachments onto support tickets and stream them back.
 */
import pool from '../../config/database.js';
import { createHash } from 'node:crypto';
import StorageService from '../storage.service.js';
import { getGmailClient } from './gmailClient.js';

function decodeBase64UrlToBuffer(data) {
  if (!data) return null;
  const s = String(data).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

export function isPdfAttachment({ filename = '', mimeType = '' } = {}) {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  return mime === 'application/pdf' || mime === 'application/x-pdf' || name.endsWith('.pdf');
}

export function collectGmailAttachmentParts(payload) {
  const out = [];
  const stack = [payload].filter(Boolean);
  while (stack.length) {
    const node = stack.pop();
    const parts = Array.isArray(node?.parts) ? node.parts : [];
    for (const p of parts) stack.push(p);

    const filename = String(node?.filename || '').trim();
    const mimeType = String(node?.mimeType || '').trim().toLowerCase();
    const attachmentId = node?.body?.attachmentId || null;
    const size = Number(node?.body?.size || 0);
    const inlineData = node?.body?.data || null;
    if (!filename && !attachmentId && !inlineData) continue;
    if (mimeType.startsWith('multipart/')) continue;
    if (mimeType === 'text/plain' || mimeType === 'text/html') continue;

    // Skip tiny inline signature images.
    const disposition = String(
      (node?.headers || []).find((h) => String(h?.name || '').toLowerCase() === 'content-disposition')?.value || ''
    ).toLowerCase();
    const isInline = disposition.includes('inline') || (!filename && mimeType.startsWith('image/'));
    if (isInline && size > 0 && size < 40 * 1024 && !isPdfAttachment({ filename, mimeType })) {
      continue;
    }
    if (!filename && !isPdfAttachment({ filename, mimeType }) && mimeType.startsWith('image/') && size < 40 * 1024) {
      continue;
    }

    out.push({
      partId: node?.partId || null,
      filename: filename || (isPdfAttachment({ filename, mimeType }) ? 'attachment.pdf' : 'attachment'),
      mimeType: mimeType || 'application/octet-stream',
      attachmentId,
      size,
      inlineData
    });
  }
  return out;
}

async function hasAttachmentsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_attachments'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

export async function listTicketAttachments(ticketId) {
  if (!(await hasAttachmentsTable())) return [];
  const tid = Number(ticketId || 0);
  if (!tid) return [];
  const [rows] = await pool.execute(
    `SELECT a.id, a.ticket_id, a.support_ticket_message_id, a.file_name, a.file_path, a.mime_type, a.file_size, a.created_at,
       t.client_id AS client_document_client_id,
       (SELECT d.id FROM client_phi_documents d
        WHERE d.client_id = t.client_id AND d.removed_at IS NULL
          AND d.storage_path = CONCAT('phi-documents/', t.agency_id, '/', t.client_id, '/ticket-', t.id, '-attachment-', a.id)
        LIMIT 1) AS client_document_id
     FROM support_ticket_attachments a
     JOIN support_tickets t ON t.id = a.ticket_id
     WHERE a.ticket_id = ?
     ORDER BY a.id ASC`,
    [tid]
  );
  return (rows || []).map((row) => ({
    ...row,
    is_pdf: isPdfAttachment({ filename: row.file_name, mimeType: row.mime_type })
  }));
}

export async function getTicketAttachmentRow(ticketId, attachmentId) {
  if (!(await hasAttachmentsTable())) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM support_ticket_attachments WHERE id = ? AND ticket_id = ? LIMIT 1`,
    [Number(attachmentId), Number(ticketId)]
  );
  return rows?.[0] || null;
}

export async function readTicketAttachmentBuffer(row) {
  if (!row?.file_path) return null;
  const bucket = await StorageService.getGCSBucket();
  const file = bucket.file(row.file_path);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`Attachment file not found: ${row.file_path}`);
  const [buffer] = await file.download();
  if(String(row.file_path).endsWith('.guardian.enc')){
    const {decryptGuardianScreenshot}=await import('../guardianPortalScreenshotEncryption.service.js');
    return decryptGuardianScreenshot(buffer,{ticketId:row.ticket_id});
  }
  return buffer;
}

async function insertAttachmentRow({ ticketId, ticketMessageId = null, filename, path, mimeType, size }) {
  const [result] = await pool.execute(
    `INSERT INTO support_ticket_attachments
      (ticket_id, support_ticket_message_id, uploaded_by_user_id, file_name, file_path, mime_type, file_size)
     VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    [Number(ticketId), ticketMessageId, String(filename).slice(0, 255), path, mimeType || null, Number(size) || null]
  );
  return Number(result?.insertId || 0);
}

async function downloadGmailPartBuffer(gmail, gmailMessageId, part) {
  if (part.inlineData) return decodeBase64UrlToBuffer(part.inlineData);
  if (!part.attachmentId) return null;
  const att = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: gmailMessageId,
    id: part.attachmentId
  });
  return decodeBase64UrlToBuffer(att.data?.data);
}

export async function persistGmailAttachmentsForTicket({
  ticketId,
  ticketMessageId = null,
  gmail = null,
  gmailMessageId = null,
  payload = null,
  strict = false
} = {}) {
  if (!(await hasAttachmentsTable())) return { saved: 0, skipped: 'table_missing', complete: false, incomplete: true };
  const tid = Number(ticketId || 0);
  if (!tid || !payload) return { saved: 0, skipped: 'missing_payload', complete: false, incomplete: true };

  const existing = await listTicketAttachments(tid);
  const existingNames = new Set((existing || []).map((a) => String(a.file_name || '').toLowerCase()));
  const existingPaths = new Set((existing || []).map((a) => String(a.file_path || '')));
  const parts = collectGmailAttachmentParts(payload);
  if (!parts.length) return { saved: 0, skipped: 'no_parts', complete: true, incomplete: false };

  const client = gmail || (await getGmailClient());
  let saved = 0;
  let failed = 0;
  for (const [partIndex, part] of parts.entries()) {
    const key = String(part.filename || '').toLowerCase();
    const sanitized = StorageService.sanitizeFilename(part.filename || 'attachment');
    const sourceKey = gmailMessageId ? createHash('sha256').update(`${gmailMessageId}:${part.partId || part.attachmentId || partIndex}:${part.filename}`).digest('hex') : null;
    const stablePath = sourceKey ? `uploads/ticket_attachments/ticket_${tid}/gmail-${sourceKey}-${sanitized}` : null;
    if (stablePath && existingPaths.has(stablePath)) continue;
    if (!strict && key && existingNames.has(key)) continue;
    let buffer = null;
    try {
      buffer = await downloadGmailPartBuffer(client, gmailMessageId, part);
    } catch (err) {
      console.warn('[ticketInboundAttachments] download failed:', err?.message || err);
      failed += 1;
      continue;
    }
    if (!buffer?.length) { failed += 1; continue; }
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const gcsPath = stablePath || `uploads/ticket_attachments/ticket_${tid}/${unique}-${sanitized}`;
    try {
      const bucket = await StorageService.getGCSBucket();
      await bucket.file(gcsPath).save(buffer, {
        contentType: part.mimeType || 'application/octet-stream',
        metadata: {
          uploadedAt: new Date().toISOString(),
          ticketId: String(tid),
          source: 'inbound_email'
        }
      });
      await insertAttachmentRow({
        ticketId: tid,
        ticketMessageId,
        filename: part.filename || sanitized,
        path: gcsPath,
        mimeType: part.mimeType,
        size: buffer.length
      });
      existingNames.add(key);
      existingPaths.add(gcsPath);
      saved += 1;
    } catch (err) {
      console.warn('[ticketInboundAttachments] save failed:', err?.message || err);
      failed += 1;
    }
  }
  return { saved, failed, complete: failed === 0, incomplete: failed > 0 };
}

function normalizeRfc822MessageId(value) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}

export async function ingestTicketAttachmentsFromGmail({ ticket } = {}) {
  if (!ticket?.id) return { saved: 0, skipped: 'no_ticket', complete: false, incomplete: true };
  const existing = await listTicketAttachments(ticket.id);

  let metadata = ticket.ai_draft_metadata_json;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }
  if (metadata?.attachmentsIngested) {
    return { saved: 0, skipped: 'already_ingested', attachments: existing, complete: true };
  }
  const gmailMessageId = metadata?.gmailMessageId || metadata?.gmail_message_id || null;
  const rfcId = normalizeRfc822MessageId(ticket.source_email_message_id);
  if (!gmailMessageId && !rfcId) return { saved: 0, skipped: 'no_gmail_id', complete: false, incomplete: true };

  const gmail = await getGmailClient();
  let gmailId = gmailMessageId;
  if (!gmailId && rfcId) {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `rfc822msgid:${rfcId}`,
      maxResults: 1
    });
    gmailId = list.data?.messages?.[0]?.id || null;
  }
  if (!gmailId) return { saved: 0, skipped: 'gmail_not_found', complete: false, incomplete: true };

  const full = await gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' });
  const result = await persistGmailAttachmentsForTicket({
    ticketId: ticket.id,
    gmail,
    gmailMessageId: gmailId,
    payload: full.data?.payload || null,
    strict: true
  });
  if (result.complete) await markAttachmentsIngested(ticket.id, { ...metadata, gmailMessageId: gmailId });
  const attachments = await listTicketAttachments(ticket.id);
  return { ...result, attachments };
}

async function markAttachmentsIngested(ticketId, metadata) {
  try {
    const next = { ...(metadata && typeof metadata === 'object' ? metadata : {}), attachmentsIngested: true };
    await pool.execute(
      `UPDATE support_tickets SET ai_draft_metadata_json = ? WHERE id = ?`,
      [JSON.stringify(next), Number(ticketId)]
    );
  } catch {
    // best-effort
  }
}

export function parseLikelyClientName(subject, bodyText = '') {
  const subjectStr = String(subject || '').trim();
  const lastFirst = subjectStr.match(/^([A-Za-z][A-Za-z'\-]+),\s*([A-Za-z][A-Za-z'\-]+)(?:\s|$)/);
  if (lastFirst) return { lastName: lastFirst[1], firstName: lastFirst[2] };
  const firstLast = subjectStr.match(/\b([A-Z][a-zA-Z'\-]+)\s+([A-Z][a-zA-Z'\-]+)\b/);
  if (firstLast && !/re:|fwd:/i.test(subjectStr)) {
    return { firstName: firstLast[1], lastName: firstLast[2] };
  }
  const body = String(bodyText || '');
  const bodyLastFirst = body.match(/\b([A-Za-z][A-Za-z'\-]+),\s*([A-Za-z][A-Za-z'\-]+)\b/);
  if (bodyLastFirst) return { lastName: bodyLastFirst[1], firstName: bodyLastFirst[2] };
  return { firstName: '', lastName: '' };
}
