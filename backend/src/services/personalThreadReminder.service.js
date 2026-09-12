import { randomUUID, createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { resolveEmailSendMailbox } from './emailSendMailbox.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildBrandedMessageEmailHtml } from './hubBrandedEmail.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { replyMessageIds } from '../utils/emailThreading.js';
import { personalReminderReplyText, personalReminderBody } from '../utils/personalReminderReply.js';
import { resolveAvailabilitySchedule, addBusinessHours } from './availabilityWindow.service.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';

/** One branded reminder per unread inbound message, scoped to its work mailbox owner. */
export async function runPersonalThreadReminders({ now = new Date() } = {}) {
  const [rows] = await pool.execute(`SELECT c.id AS conversation_id, c.subject, c.agency_id,
      m.id AS message_id, COALESCE(m.sent_at, m.created_at) AS received_at,
      i.id AS inbox_id, i.owner_user_id AS user_id, i.sender_identity_id, i.from_email,
      u.personal_email, u.first_name, p.digest_hours, p.digest_business_hours, p.availability_hours_enabled
    FROM communication_conversations c
    JOIN communication_inboxes i ON i.id=c.inbox_id AND i.kind='personal' AND i.is_active=1
    JOIN users u ON u.id=i.owner_user_id AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE') AND COALESCE(u.is_active,1)=1
    JOIN communication_messages m ON m.id=(SELECT MAX(mi.id) FROM communication_messages mi WHERE mi.conversation_id=c.id AND mi.direction='inbound')
    LEFT JOIN user_communication_prefs p ON p.user_id=u.id
    LEFT JOIN communication_conversation_reads r ON r.conversation_id=c.id AND r.user_id=u.id
    WHERE COALESCE(p.personal_email_notify,1)=1 AND NULLIF(TRIM(u.personal_email),'') IS NOT NULL
      AND LOWER(u.personal_email) COLLATE utf8mb4_unicode_ci <> LOWER(i.from_email) COLLATE utf8mb4_unicode_ci
      AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=c.agency_id AND (ua.is_active=1 OR ua.is_active IS NULL))
      AND c.archived_at IS NULL AND COALESCE(c.is_spam,0)=0 AND COALESCE(c.is_unknown_sender,0)=0
      AND (c.visible_after IS NULL OR c.visible_after<=?) AND (c.snoozed_until IS NULL OR c.snoozed_until<=?)
      AND (r.last_read_at IS NULL OR r.last_read_at<COALESCE(m.sent_at,m.created_at))
      AND NOT EXISTS (SELECT 1 FROM communication_messages mo WHERE mo.conversation_id=c.id AND mo.direction='outbound' AND mo.id>m.id AND mo.send_status IN ('sent','scheduled','sending'))
      AND NOT EXISTS (SELECT 1 FROM communication_thread_reminders n WHERE n.conversation_id=c.id AND n.message_id=m.id AND n.user_id=u.id)
    ORDER BY m.id LIMIT 500`, [now, now]);
  let sent = 0;
  for (const row of rows) {
    let claimed = false;
    const messageId = `<${randomUUID()}@${row.from_email.split('@').pop()}>`;
    try {
      const settings = await getAgencyEmailSettings(row.agency_id);
      if (settings?.personalEmailDigestEnabled === false) continue;
      const hours = Math.min(168, Math.max(1, Number(row.digest_business_hours ?? row.digest_hours ?? settings?.personalEmailDigestBusinessHours ?? 24)));
      const received = new Date(row.received_at);
      const due = row.availability_hours_enabled === 0
        ? new Date(received.getTime() + hours * 3600000)
        : addBusinessHours(await resolveAvailabilitySchedule(row.user_id, { agencyId: row.agency_id }), received, hours);
      if (due > now) continue;
      const mailbox = await resolveEmailSendMailbox({ agencyId: row.agency_id, userId: row.user_id, inbox: { id: row.inbox_id, agency_id: row.agency_id, kind: 'personal', owner_user_id: row.user_id, sender_identity_id: row.sender_identity_id, from_email: row.from_email } });
      const agency = await Agency.findById(row.agency_id);
      const appUrl = buildPublicAppUrl(agency, `messages?conversationId=${row.conversation_id}`);
      const bodyText = `You have an unread email in “${row.subject || '(no subject)'}”. Reply directly to this email to answer its sender using your work address, ${row.from_email}, or sign in to read the conversation and use Reply all.`;
      const html = buildBrandedMessageEmailHtml({ agencyName: agency?.name, senderDisplayName: mailbox.displayName, title: row.subject || 'Unread email', bodyText, appUrl, history: [], footerNote: 'Your personal address is kept out of the work conversation. Only your new reply text and attachments are sent. Use the app to include everyone with Reply all.' });
      const [claim] = await pool.execute(`INSERT IGNORE INTO communication_thread_reminders (conversation_id,message_id,user_id,inbox_id,internet_message_id) VALUES (?,?,?,?,?)`, [row.conversation_id, row.message_id, row.user_id, row.inbox_id, messageId]);
      if (!claim.affectedRows) continue;
      claimed = true;
      const result = await sendEmailFromIdentity({ senderIdentityId: mailbox.identity.id, to: row.personal_email, subject: `Unread: ${row.subject || '(no subject)'}`, text: `${bodyText}\n\nOpen in Messages: ${appUrl}`, html, replyToOverride: row.from_email, internetMessageIdOverride: messageId, source: 'auto', userId: row.user_id, templateType: 'personal_thread_reminder' });
      const delivered = result?.id && !result.blocked && !result.skipped && !result.pendingApproval && !result.queued;
      await pool.execute('UPDATE communication_thread_reminders SET delivery_status=?, sent_at=? WHERE internet_message_id=?', [delivered ? 'sent' : 'held', delivered ? now : null, messageId]);
      if (delivered) sent += 1;
    } catch (e) {
      // Delivery may have occurred before a network timeout. Preserve the claim to avoid duplicates.
      if (claimed) await pool.execute("UPDATE communication_thread_reminders SET delivery_status='review' WHERE internet_message_id=?", [messageId]).catch(() => {});
      console.warn('[threadReminder] delivery needs review', row.conversation_id, e?.message);
    }
  }
  return { sent, checked: rows.length };
}

/** A private-mail reply is queued atomically as its author's work-mail reply. */
export async function queuePersonalReminderReply({ inbox, fromEmail, deliveryId, bodyText, gmailPayload = null, inReplyTo, referencesHeader, attachments = [] }) {
  if (!deliveryId) throw new Error('Missing reply delivery identifier');
  const ancestors = replyMessageIds(inReplyTo, referencesHeader);
  if (!ancestors.length) return null;
  const [matches] = await pool.execute(`SELECT n.*, u.personal_email, u.status AS user_status, u.is_active AS user_active, m.from_json, m.internet_message_id AS parent_id, m.references_header AS parent_references, m.subject
    FROM communication_thread_reminders n JOIN users u ON u.id=n.user_id
    JOIN communication_messages m ON m.id=n.message_id
    WHERE n.inbox_id=? AND n.internet_message_id IN (${ancestors.map(() => '?').join(',')})
    ORDER BY n.id DESC LIMIT 1`, [inbox.id, ...ancestors]);
  const reminder = matches[0];
  if (!reminder) return null;
  // Knowledge of a thread reference alone never authorizes acting as its owner.
  if (String(fromEmail || '').trim().toLowerCase() !== String(reminder.personal_email || '').trim().toLowerCase() || !['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(reminder.user_status).toUpperCase()) || reminder.user_active === 0 || Number(reminder.user_id) !== Number(inbox.owner_user_id)) throw new Error('Personal reminder reply does not match its mailbox owner');
  await resolveEmailSendMailbox({ agencyId: inbox.agency_id, userId: reminder.user_id, inbox });
  const sender = typeof reminder.from_json === 'string' ? JSON.parse(reminder.from_json) : reminder.from_json;
  const to = String(sender?.email || '').trim();
  if (!to || [fromEmail, inbox.from_email].some((a) => String(a || '').toLowerCase() === to.toLowerCase())) throw new Error('Reminder has no external reply recipient');
  const { isAddressBlocked } = await import('./unifiedInbox.service.js');
  if (await isAddressBlocked(inbox.agency_id, to, { ownerUserId: reminder.user_id })) throw new Error('Reply recipient is blocked');
  const text = personalReminderReplyText(await personalReminderBody(gmailPayload, bodyText), fromEmail, inbox.from_email);
  if (!text && !attachments.length) throw new Error('No new reply content found; reply in the app');
  const parentId = replyMessageIds(reminder.parent_id)[0] || null;
  const refs = [...new Set([...replyMessageIds(null, reminder.parent_references).reverse(), ...(parentId ? [parentId] : [])])].join(' ') || null;
  const hash = createHash('sha256').update(String(deliveryId)).digest('hex');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM communication_inboxes WHERE id=? FOR UPDATE', [inbox.id]);
    const [prior] = await db.execute('SELECT message_id FROM communication_email_receipts WHERE inbox_id=? AND delivery_hash=?', [inbox.id, hash]);
    if (prior.length) { await db.commit(); return { ingested: true, duplicate: true, conversationId: reminder.conversation_id, messageId: prior[0].message_id }; }
    const [result] = await db.execute(`INSERT INTO communication_messages (conversation_id,channel,direction,author_user_id,from_json,to_json,cc_json,bcc_json,subject,body_text,in_reply_to,references_header,send_status,scheduled_send_at,undo_expires_at)
      VALUES (?,'email','outbound',?,?,?,?,?,?,?, ?,?,'scheduled',DATE_ADD(NOW(),INTERVAL 20 SECOND),DATE_ADD(NOW(),INTERVAL 20 SECOND))`, [reminder.conversation_id, reminder.user_id, JSON.stringify({ email: inbox.from_email }), JSON.stringify([{ email: to }]), '[]', '[]', reminder.subject?.match(/^re:/i) ? reminder.subject : `Re: ${reminder.subject || ''}`, text, parentId, refs]);
    for (const a of attachments) await db.execute('INSERT INTO communication_attachments (message_id,filename,content_type,size_bytes,storage_key) VALUES (?,?,?,?,?)', [result.insertId, a.filename, a.contentType, a.sizeBytes, a.storageKey]);
    await db.execute('INSERT INTO communication_email_receipts (inbox_id,delivery_hash,message_id) VALUES (?,?,?)', [inbox.id, hash, result.insertId]);
    await db.execute("UPDATE communication_conversations SET archived_at=NULL, status='waiting_on_them', last_message_at=NOW(), last_message_preview=? WHERE id=?", [text.slice(0,240), reminder.conversation_id]);
    await db.commit();
    return { ingested: true, conversationId: reminder.conversation_id, messageId: result.insertId, queuedPersonalReply: true };
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
