/**
 * Public "this email was sent to the wrong person" report links → support tickets.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import { SUPPORT_TICKET_SOURCE_KEYS } from '../constants/supportTicketSources.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

function publicAppBaseUrl() {
  return String(
    process.env.APP_PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      process.env.CORS_ORIGIN ||
      'https://plottwisthq.com'
  ).replace(/\/$/, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Create a report token and return the public URL for the signature / footer.
 */
export async function createMisdirectedEmailReportLink({
  agencyId = null,
  senderUserId = null,
  toEmail = null,
  subject = null,
  conversationId = null,
  messageId = null
} = {}) {
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180); // 180 days

  try {
    await pool.execute(
      `INSERT INTO misdirected_email_report_tokens
        (token_hash, agency_id, sender_user_id, to_email, subject, conversation_id, message_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tokenHash,
        agencyId ? Number(agencyId) : null,
        senderUserId ? Number(senderUserId) : null,
        normalizeEmail(toEmail) || null,
        subject ? String(subject).slice(0, 500) : null,
        conversationId ? Number(conversationId) : null,
        messageId ? Number(messageId) : null,
        expiresAt
      ]
    );
  } catch (e) {
    console.warn('[misdirectedEmailReport] token insert failed:', e?.message || e);
    return null;
  }

  return `${publicAppBaseUrl()}/report-misdirected-email/${encodeURIComponent(rawToken)}`;
}

export async function resolveMisdirectedReportToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const tokenHash = sha256(token);
  const [rows] = await pool.execute(
    `SELECT t.*, a.name AS agency_name
     FROM misdirected_email_report_tokens t
     LEFT JOIN agencies a ON a.id = t.agency_id
     WHERE t.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  const row = rows?.[0];
  if (!row) return null;
  if (row.used_at) return { ...row, expired: true, reason: 'already_used' };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ...row, expired: true, reason: 'expired' };
  }
  return { ...row, expired: false };
}

/**
 * Create a high-priority support ticket for a misdirected-email report.
 */
export async function submitMisdirectedEmailReport({
  rawToken,
  reporterName = null,
  reporterEmail = null,
  details = null
} = {}) {
  const row = await resolveMisdirectedReportToken(rawToken);
  if (!row) {
    const err = new Error('This report link is invalid.');
    err.status = 404;
    throw err;
  }
  if (row.expired) {
    const err = new Error(
      row.reason === 'already_used'
        ? 'This report was already submitted.'
        : 'This report link has expired.'
    );
    err.status = 400;
    err.code = row.reason;
    throw err;
  }

  const agencyId = row.agency_id ? Number(row.agency_id) : null;
  const subject = `Misdirected email report${row.subject ? `: ${String(row.subject).slice(0, 120)}` : ''}`;
  const questionParts = [
    'A recipient reported that an email was sent to the wrong person.',
    row.to_email ? `Original To: ${row.to_email}` : null,
    row.subject ? `Subject: ${row.subject}` : null,
    row.conversation_id ? `Conversation ID: ${row.conversation_id}` : null,
    row.message_id ? `Message ID: ${row.message_id}` : null,
    row.sender_user_id ? `Sender user ID: ${row.sender_user_id}` : null,
    reporterName ? `Reporter name: ${reporterName}` : null,
    reporterEmail ? `Reporter email: ${reporterEmail}` : null,
    details ? `Details: ${details}` : null,
    'Please investigate and follow incident / PHI breach response procedures as needed.'
  ].filter(Boolean);
  const question = questionParts.join('\n');

  let schoolOrganizationId = agencyId;
  if (agencyId) {
    try {
      const [orgRows] = await pool.execute(
        `SELECT id FROM agencies WHERE id = ? LIMIT 1`,
        [agencyId]
      );
      if (orgRows?.[0]?.id) schoolOrganizationId = orgRows[0].id;
    } catch {
      /* keep agencyId */
    }
  }

  const enc = prepareEncryptedTicketText(question);

  const sourceKey = SUPPORT_TICKET_SOURCE_KEYS.MISDIRECTED_EMAIL || 'misdirected_email';
  let ticketId = null;

  try {
    const [ins] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, subject, question, question_ciphertext, priority, status,
         source_key, target_scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'high', 'open', ?, 'agency', NOW(), NOW())`,
      [
        schoolOrganizationId,
        subject.slice(0, 255),
        enc.plain ?? question,
        enc.ciphertext || null,
        sourceKey
      ]
    );
    ticketId = ins.insertId;
  } catch (e) {
    // Fallback without ciphertext / source_key columns on older schemas
    try {
      const [ins] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, subject, question, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, 'high', 'open', NOW(), NOW())`,
        [schoolOrganizationId, subject.slice(0, 255), question]
      );
      ticketId = ins.insertId;
    } catch (e2) {
      console.warn('[misdirectedEmailReport] ticket insert failed:', e2?.message || e2);
      const err = new Error('Could not create support ticket.');
      err.status = 500;
      throw err;
    }
  }

  try {
    await pool.execute(
      `UPDATE misdirected_email_report_tokens
       SET used_at = NOW(), support_ticket_id = ?
       WHERE id = ?`,
      [ticketId, row.id]
    );
  } catch {
    /* ignore */
  }

  return {
    ticketId,
    agencyId,
    agencyName: row.agency_name || null
  };
}
