import pool from '../config/database.js';
import { getGmailClient } from './unifiedEmail/gmailClient.js';
import { parseGuardianDeliveryReport } from '../utils/guardianDeliveryReport.js';

export async function reconcileGuardianDeliveryReport(payload) {
  for (const report of parseGuardianDeliveryReport(payload)) {
    // Unpredictable RFC Message-ID AND exact recipient must match a logged invite.
    // No account/contact is updated by an incoming delivery report.
    await pool.execute(`UPDATE co_guardian_invite_deliveries d JOIN user_communications c ON c.id=d.communication_id
      SET d.delivery_status='bounced', d.failure_kind='mailbox_rejected', c.delivery_status='bounced', c.error_message='Receiving email service rejected the invitation'
      WHERE COALESCE(d.internet_message_id,JSON_UNQUOTE(JSON_EXTRACT(c.metadata,'$.internetMessageId')))=?
      AND LOWER(d.recipient_email)=? AND d.delivery_status IN ('sent','delivered')`, [report.messageId, report.recipient]);
    await pool.execute(`UPDATE co_guardian_invite_deliveries d JOIN user_communications c ON c.id=d.parent_notice_communication_id
      SET d.parent_notice_status='failed', c.delivery_status='bounced'
      WHERE JSON_UNQUOTE(JSON_EXTRACT(c.metadata,'$.internetMessageId'))=? AND LOWER(c.recipient_address)=?`, [report.messageId, report.recipient]);
  }
}

export async function pollGuardianInvitationBounces() {
  const [active] = await pool.execute(`SELECT 1 FROM co_guardian_invite_deliveries WHERE created_at>DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT 1`);
  if (!active.length) return;
  const gmail = await getGmailClient();
  // Independent of the optional AI inbox agent; reading reports never sends email.
  let pageToken;
  for (let page=0; page<4; page++) {
    const list = await gmail.users.messages.list({ userId:'me', q:'newer_than:30d {from:mailer-daemon from:postmaster} -in:trash', maxResults:100, ...(pageToken ? {pageToken} : {}) });
    for (const item of list.data.messages || []) {
      const [seen] = await pool.execute('SELECT 1 FROM co_guardian_delivery_reports WHERE gmail_message_id=?', [item.id]);
      if (seen.length) continue;
      const full = await gmail.users.messages.get({ userId:'me', id:item.id, format:'full' });
      await reconcileGuardianDeliveryReport(full.data.payload);
      // Allow a short overlap for a send that has not saved its provider metadata yet.
      if (Number(full.data.internalDate) < Date.now()-3600000) await pool.execute('INSERT IGNORE INTO co_guardian_delivery_reports (gmail_message_id) VALUES (?)', [item.id]);
    }
    pageToken = list.data.nextPageToken;
    if (!pageToken) break;
  }
}
