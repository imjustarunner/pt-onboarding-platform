import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { messageReminderRecipient } from './messageReminderRecipient.service.js';

export const PRIORITY_EVENT_EMAILS = new Set(['meeting_invited', 'meeting_join_reminder', 'meeting_rescheduled', 'meeting_cancelled', 'hiring_interview_invite']);
const norm = value => String(value || '').trim().toLowerCase();

// Event invitations are immediate transactional mail, independent of the delay
// for ordinary unread-message alerts. Keep calendar identities on work addresses.
export async function priorityEventEmailRecipient({ agencyId, userId, templateType, to, subject }) {
  if (!userId || !agencyId || Array.isArray(to)) return { to, subject };
  const user = await User.findById(userId);
  if (!user) return { to, subject };
  const known = [user.email, user.work_email, user.personal_email].map(norm);
  if (!known.includes(norm(to))) return { to, subject };
  let recipient = to;
  let appOnly = false;
  if (PRIORITY_EVENT_EMAILS.has(templateType)) {
    const fallback = await messageReminderRecipient(user);
    appOnly = !!fallback;
    recipient = fallback || to;
  }
  const personal = norm(recipient) === norm(user.personal_email) && !!user.personal_email;
  if (!personal) return { to: recipient, subject };
  const agency = await Agency.findById(agencyId);
  const brand = /itsco/i.test(`${agency?.name} ${agency?.slug}`) ? 'ITSCO' : String(agency?.name || 'Your team').trim();
  return { to: recipient, subject: !subject || String(subject).toLowerCase().startsWith(brand.toLowerCase()) ? subject : `${brand}: ${subject}`, personal: true, appOnly };
}

export async function savePriorityEventInboxCopy(args) {
  const {messageId,templateType,userId}=args;
  if (!PRIORITY_EVENT_EMAILS.has(templateType) || !userId || !messageId) return;
  await pool.execute('INSERT IGNORE INTO priority_event_inbox_copies(message_id,payload_json) VALUES(?,?)',[messageId,JSON.stringify(args)]);
  await persistPriorityEventInboxCopy(args);
  await pool.execute('UPDATE priority_event_inbox_copies SET completed_at=UTC_TIMESTAMP() WHERE message_id=?',[messageId]);
}
async function persistPriorityEventInboxCopy({ agencyId, userId, templateType, messageId, threadId, fromEmail, replyToEmail, subject, text, attachments = [] }) {
  if (!PRIORITY_EVENT_EMAILS.has(templateType) || !userId || !messageId) return;
  const { ensurePersonalMailbox } = await import('./personalMailbox.service.js');
  const { persistInboundEmail } = await import('./inboundEmailPersistence.service.js');
  const { prepareInboundAttachments } = await import('./communicationAttachments.service.js');
  const box = await ensurePersonalMailbox({ agencyId, userId });
  const prepared = await prepareInboundAttachments({ gmailMessageId: `event-email:${messageId}`, inboxId: box.id, payload: { parts: (attachments || []).map((att, index) => ({ filename: att.filename || att.name, mimeType: att.contentType || 'application/octet-stream', partId: String(index), body: { data: att.contentBase64 || att.content } })) } });
  const saved = await persistInboundEmail({ attachments: prepared, inboxId: box.id, agencyId, ownerUserId: userId, deliveryId: `event-email:${messageId}`, threadId, fromEmail, replyToEmail, subject, bodyText: text, to: [{ email: box.from_email }] });
  return saved;
}

export async function retryPriorityEventInboxCopies() {
 const [rows]=await pool.execute('SELECT message_id,payload_json FROM priority_event_inbox_copies WHERE completed_at IS NULL ORDER BY created_at LIMIT 50');
 for(const row of rows){try{await savePriorityEventInboxCopy(typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload_json);}catch(error){console.warn('[event email] Inbox copy retry failed',row.message_id,error.code||'persistence_failed');}}
}
