import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { collectGmailAttachmentParts } from './unifiedEmail/ticketInboundAttachments.service.js';
import { parseSupportGmailMessage } from './supportTicketGmailReconciliation.service.js';

const json = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const email = value => String(value || '').trim().toLowerCase();
const addresses = value => (String(value || '').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(email);
const fail = code => Object.assign(new Error('The payroll report inbox copy could not be verified.'), { code });

/** Only verified, already-sent reports can enter this path. It never sends mail,
 * changes group memberships/subscriptions, or invents another payroll export. */
export function createPayrollReportInbox({ db = pool, getGmail = null, ingest = null, notify = null, syncInbox = null } = {}) {
  async function syncDelivery({ deliveryId, gmail = null, message = null }) {
    const [[report]] = await db.execute(`SELECT d.*,c.external_message_id,c.subject,c.template_type,c.metadata AS communication_metadata,
      c.agency_id AS communication_agency_id,c.recipient_address,c.delivery_status,c.sent_at AS communication_sent_at,
      p.status AS payroll_status,i.id AS inbox_id,i.from_email,i.sender_identity_id AS active_sender_identity_id
      FROM payroll_report_email_deliveries d
      JOIN user_communications c ON c.id=d.communication_id
      JOIN payroll_periods p ON p.id=d.payroll_period_id AND p.agency_id=d.agency_id
      JOIN communication_inboxes i ON i.agency_id=d.agency_id AND i.identity_key='payroll' AND i.kind='shared' AND i.is_active=1
      JOIN email_sender_identities e ON e.id=i.sender_identity_id AND e.agency_id=i.agency_id
        AND e.identity_key='payroll' AND e.is_active=1 AND LOWER(e.from_email)=LOWER(i.from_email)
      WHERE d.id=?`, [deliveryId]);
    if (!report || !report.external_message_id || !report.communication_sent_at
      || Number(report.communication_agency_id) !== Number(report.agency_id)
      || report.template_type !== 'payroll_posted_reconciliation'
      || !['posted', 'finalized'].includes(String(report.payroll_status).toLowerCase())
      || !['sent', 'sending', 'pending_approval', 'delivery_unknown'].includes(report.status)
      || Number(report.sender_identity_id) !== Number(report.active_sender_identity_id)
      || email(report.recipient_email) !== email(report.from_email)
      || email(report.recipient_address) !== email(report.from_email)) throw fail('PAYROLL_INBOX_RECEIPT_UNVERIFIED');
    let metadata;
    try { metadata = json(report.communication_metadata); } catch { throw fail('PAYROLL_INBOX_RECEIPT_UNVERIFIED'); }
    if (metadata.testInboxRedirect || metadata.testInboxRedirected
      || Number(metadata.senderIdentityId) !== Number(report.sender_identity_id)
      || email(metadata.fromEmail) !== email(report.from_email)) throw fail('PAYROLL_INBOX_RECEIPT_UNVERIFIED');

    const connection = await db.getConnection();
    const lockName = `payroll-report-inbox:${report.id}`;
    let locked = false;
    try {
      const [[lock]] = await connection.execute('SELECT GET_LOCK(?,5) AS acquired', [lockName]);
      if (Number(lock?.acquired) !== 1) throw fail('PAYROLL_INBOX_BUSY');
      locked = true;
      // Completed receipt is an inexpensive read; no Gmail fetch on each status refresh.
      const [[saved]] = await db.execute(`SELECT t.id AS ticket_id,c.id AS conversation_id,t.ai_draft_metadata_json
        FROM support_ticket_email_messages m JOIN support_tickets t ON t.id=m.ticket_id AND t.agency_id=m.agency_id
        JOIN communication_conversations c ON c.support_ticket_id=t.id AND c.inbox_id=?
        WHERE m.agency_id=? AND m.gmail_message_id=? LIMIT 1`, [report.inbox_id, report.agency_id, report.external_message_id]);
      let proof = {};
      try { proof = json(saved?.ai_draft_metadata_json).payrollReportReceipt || {}; } catch { /* Reverify incomplete copies. */ }
      if (saved && Number(proof.deliveryId) === Number(report.id) && proof.attachmentSha256 === report.attachment_sha256
        && proof.notificationsComplete === true) return { status: 'ready', ticketId: Number(saved.ticket_id), conversationId: Number(saved.conversation_id) };

      const client = gmail || await (getGmail ? getGmail() : (await import('./unifiedEmail/gmailClient.js')).getGmailClient());
      const receipt = message || (await client.users.messages.get({ userId: 'me', id: report.external_message_id, format: 'full' })).data;
      const headers = new Map((receipt?.payload?.headers || []).map(h => [String(h.name).toLowerCase(), String(h.value || '')]));
      if (receipt?.id !== report.external_message_id || !(receipt.labelIds || []).includes('SENT')
        || addresses(headers.get('from'))[0] !== email(report.from_email)
        || !addresses(headers.get('to')).includes(email(report.recipient_email))
        || headers.get('subject') !== report.subject) throw fail('PAYROLL_INBOX_GMAIL_RECEIPT_MISMATCH');
      const parts = collectGmailAttachmentParts(receipt.payload).filter(part => part.filename === report.attachment_filename);
      if (parts.length !== 1) throw fail('PAYROLL_INBOX_ATTACHMENT_MISMATCH');
      const part = parts[0];
      const encoded = part.inlineData || (await client.users.messages.attachments.get({ userId: 'me', messageId: receipt.id, id: part.attachmentId })).data?.data;
      const bytes = Buffer.from(encoded || '', 'base64url');
      if (!bytes.length || createHash('sha256').update(bytes).digest('hex') !== report.attachment_sha256) throw fail('PAYROLL_INBOX_ATTACHMENT_MISMATCH');
      const parsed = parseSupportGmailMessage(receipt);
      const result = await (ingest || (await import('./supportTicketEmailInbound.service.js')).ingestSupportTicketEmail)({
        ...parsed, agencyId: Number(report.agency_id), topic: 'payroll', gmail: client,
        staffCopy: false, staffUserId: null, createdByUserId: report.requested_by_user_id || null,
        recipients: [report.recipient_email], cc: [], generateDraft: false, autoPacketIntake: false
      });
      if (!result?.handled || !result.ticketId) throw fail('PAYROLL_INBOX_TICKET_PENDING');
      await (syncInbox || (await import('./ticketEmailInboxAdapter.service.js')).syncEmailTicketsToInbox)({ agencyId: report.agency_id, ticketId: result.ticketId, limit: 1 });
      const [[mirror]] = await db.execute('SELECT id FROM communication_conversations WHERE support_ticket_id=? AND agency_id=? AND inbox_id=?', [result.ticketId, report.agency_id, report.inbox_id]);
      if (!mirror) throw fail('PAYROLL_INBOX_MIRROR_PENDING');
      // A delayed receipt repair must not clear a draft for a later human reply.
      await db.execute(`UPDATE support_tickets SET ai_draft_response=NULL,ai_draft_status='suppressed'
        WHERE id=? AND agency_id=? AND ?=(SELECT e.ticket_message_id FROM support_ticket_email_messages e
          WHERE e.ticket_id=support_tickets.id AND e.direction='inbound'
          ORDER BY COALESCE(e.sent_at,e.created_at) DESC,e.id DESC LIMIT 1)`, [result.ticketId, report.agency_id, result.ticketMessageId]);
      await db.execute(`UPDATE support_tickets SET
        ai_draft_metadata_json=JSON_SET(COALESCE(ai_draft_metadata_json,JSON_OBJECT()),'$.payrollReportReceipt',CAST(? AS JSON))
        WHERE id=? AND agency_id=?`, [JSON.stringify({ deliveryId: Number(report.id), communicationId: Number(report.communication_id),
        attachmentSha256: report.attachment_sha256, notificationsComplete: false }), result.ticketId, report.agency_id]);
      await (notify || (await import('./payrollTicketNotifications.service.js')).notifyPayrollTicket)({ agencyId: report.agency_id,
        ticketId: result.ticketId, mailbox: report.recipient_email, actorUserId: report.requested_by_user_id || null });
      await db.execute(`UPDATE support_tickets SET ai_draft_metadata_json=JSON_SET(ai_draft_metadata_json,
        '$.payrollReportReceipt.notificationsComplete',CAST('true' AS JSON)) WHERE id=? AND agency_id=?`, [result.ticketId, report.agency_id]);
      return { status: 'ready', ticketId: Number(result.ticketId), conversationId: Number(mirror.id) };
    } finally {
      if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
      connection.release();
    }
  }

  async function syncGmailReceipt({ agencyId, gmail, message }) {
    const [[report]] = await db.execute(`SELECT d.id FROM payroll_report_email_deliveries d
      JOIN user_communications c ON c.id=d.communication_id AND c.agency_id=d.agency_id
      WHERE d.agency_id=? AND c.external_message_id=? LIMIT 1`, [agencyId, message?.id || '']);
    return report ? { handled: true, ...await syncDelivery({ deliveryId: report.id, gmail, message }) } : { handled: false };
  }
  return { syncDelivery, syncGmailReceipt };
}
export default createPayrollReportInbox();
