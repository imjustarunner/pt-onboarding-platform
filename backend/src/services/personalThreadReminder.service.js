import { randomUUID, randomBytes, createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { resolveEmailSendMailbox } from './emailSendMailbox.service.js';
import { resolveMessagesSendMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildBrandedMessageEmailHtml } from './hubBrandedEmail.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { replyMessageIds } from '../utils/emailThreading.js';
import { personalReminderReplyText, personalReminderBody } from '../utils/personalReminderReply.js';
import { personalMessageDueAt, isMessageReminderWindow } from '../utils/messageReminderTiming.js';
import { personalMessagePreferences } from '../utils/personalMessagePreferences.js';
import { resolveAvailabilitySchedule } from './availabilityWindow.service.js';
import { messageReminderRecipient } from './messageReminderRecipient.service.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import { personalThreadCanReply } from './personalMessageThreadPolicy.service.js';
const normalize = value => String(value || '').trim().toLowerCase();
const hashToken = value => createHash('sha256').update(value).digest('hex');

/** One branded reminder per unread inbound message. Content/replies are opt-in. */
export async function runPersonalThreadReminders({ now = new Date() } = {}) {
  const [rows] = await pool.execute(`SELECT c.id AS conversation_id, c.subject, c.agency_id,
      m.id AS message_id, m.body_text, m.from_json, COALESCE(m.sent_at, m.created_at) AS received_at,
      i.id AS inbox_id, i.owner_user_id AS user_id, i.sender_identity_id, i.from_email,
      u.email, u.work_email, u.personal_email, u.first_name, u.role, u.has_provider_access,
      u.sso_password_override, u.login_is_group_email, u.is_demo, p.digest_hours, p.digest_business_hours,
      p.personal_email_notify, p.personal_email_delivery_mode, p.personal_email_delay_mode, p.personal_email_delay_hours
    FROM communication_conversations c
    JOIN communication_inboxes i ON i.id=c.inbox_id AND i.kind='personal' AND i.is_active=1
    JOIN users u ON u.id=i.owner_user_id AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING') AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
    JOIN communication_messages m ON m.id=(SELECT MAX(mi.id) FROM communication_messages mi WHERE mi.conversation_id=c.id AND mi.direction='inbound' AND COALESCE(mi.is_internal_note,0)=0)
    LEFT JOIN user_communication_prefs p ON p.user_id=u.id
    LEFT JOIN communication_conversation_reads r ON r.conversation_id=c.id AND r.user_id=u.id
    WHERE COALESCE(p.personal_email_notify,1)=1 AND NULLIF(TRIM(u.personal_email),'') IS NOT NULL
      AND u.sso_password_override=1 AND COALESCE(u.is_demo,0)=0
      AND LOWER(u.personal_email) COLLATE utf8mb4_unicode_ci <> LOWER(i.from_email) COLLATE utf8mb4_unicode_ci
      AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=c.agency_id AND ua.is_active=1)
      AND c.archived_at IS NULL AND COALESCE(c.is_spam,0)=0 AND COALESCE(c.is_unknown_sender,0)=0
      AND (c.visible_after IS NULL OR c.visible_after<=?) AND (c.snoozed_until IS NULL OR c.snoozed_until<=?)
      AND (r.last_read_at IS NULL OR r.last_read_at<COALESCE(m.sent_at,m.created_at))
      AND NOT EXISTS (SELECT 1 FROM communication_messages mo WHERE mo.conversation_id=c.id AND mo.direction='outbound' AND mo.id>m.id AND mo.send_status IN ('sent','scheduled','sending'))
      AND NOT EXISTS (SELECT 1 FROM communication_thread_reminders n WHERE n.conversation_id=c.id AND n.message_id=m.id AND n.user_id=u.id)
    ORDER BY m.id LIMIT 500`, [now, now]);
  let sent = 0;
  for (const row of rows) {
    let claimed = false;
    let messageId;
    try {
      const settings = await getAgencyEmailSettings(row.agency_id);
      if (settings?.personalEmailDigestEnabled === false) continue;
      const agency = await Agency.findById(row.agency_id);
      const schedule = await resolveAvailabilitySchedule(row.user_id, { agencyId: row.agency_id });
      if (!isMessageReminderWindow(now, schedule, agency?.timezone)) continue;
      const preferences = personalMessagePreferences({...row, digest_hours:row.digest_hours ?? settings?.personalEmailDigestBusinessHours ?? 24});
      if (!preferences.personalEmailNotify || !(personalMessageDueAt(row.received_at, { schedule, timeZone:agency?.timezone, preferences }) <= now)) continue;
      const recipient = await messageReminderRecipient(row);
      if (!recipient) continue;
      const inbox = {id:row.inbox_id, agency_id:row.agency_id, owner_user_id:row.user_id, from_email:row.from_email};
      const allowReply = preferences.personalEmailDeliveryMode === 'forward_one_to_one' && await personalThreadCanReply({conversationId:row.conversation_id,inbox});
      const mailbox = await resolveMessagesSendMailbox(row.agency_id);
      const token = randomBytes(24).toString('hex');
      const [local, domain] = mailbox.fromEmail.split('@');
      const replyTo = `${local}+p-${token}@${domain}`;
      messageId = `<${randomUUID()}@${domain}>`;
      const appUrl = buildPublicAppUrl(agency, `messages?conversationId=${row.conversation_id}&agencyId=${row.agency_id}`);
      let bodyText = 'You have messages waiting in your work inbox. Sign in to read and reply.';
      const sender=typeof row.from_json==='string'?JSON.parse(row.from_json):row.from_json;
      if (allowReply) bodyText = `A one-to-one email is waiting in your work inbox. Reply to this email to answer through Messages; your personal address is not shared.\n\nFrom: ${sender?.name || sender?.email || 'Your correspondent'}\nSubject: ${row.subject || '(no subject)'}\n\n${row.body_text || '(Open the app to view this email.)'}`;
      const footerNote = allowReply ? 'Only your new reply text is sent. Files stay in the app. Group replies and Reply all require the app.' : 'This is a notification only. Open the app to reply or reply all. Message content is not included.';
      const html = buildBrandedMessageEmailHtml({agencyName:agency?.name,senderDisplayName:mailbox.displayName,title:'You have messages waiting',bodyText,appUrl,history:[],footerNote});
      const [claim] = await pool.execute(`INSERT IGNORE INTO communication_thread_reminders (conversation_id,message_id,user_id,inbox_id,internet_message_id,reply_token_hash,reply_allowed) VALUES (?,?,?,?,?,?,?)`, [row.conversation_id,row.message_id,row.user_id,row.inbox_id,messageId,hashToken(token),allowReply ? 1 : 0]);
      if (!claim.affectedRows) continue;
      claimed = true;
      const result = await sendEmailFromIdentity({senderIdentityId:mailbox.identity.id,to:recipient,subject:'You have messages waiting',text:`${bodyText}\n\nOpen in Messages: ${appUrl}\n\n${footerNote}`,html,replyToOverride:replyTo,internetMessageIdOverride:messageId,source:'auto',userId:row.user_id,linkUrl:appUrl,templateType:allowReply?'personal_thread_forward':'personal_thread_reminder'});
      const delivered = result?.id && !result.blocked && !result.skipped && !result.pendingApproval && !result.queued && !result.redirected;
      await pool.execute('UPDATE communication_thread_reminders SET delivery_status=?, sent_at=?, internet_message_id=? WHERE internet_message_id=?', [delivered?'sent':'held',delivered?now:null,result?.internetMessageId||messageId,messageId]);
      if (delivered) sent++;
    } catch (e) {
      if (claimed) await pool.execute("UPDATE communication_thread_reminders SET delivery_status='review' WHERE internet_message_id=?", [messageId]).catch(()=>{});
      console.warn('[threadReminder] delivery needs review',row.conversation_id,e?.code || 'send_failed');
    }
  }
  return {sent,checked:rows.length};
}

/** Scope a private reply to the exact tenant, mailbox and reminder. Token routing
 * also works when a personal mail client strips In-Reply-To/References. */
export async function resolvePersonalReminderMailbox({identityId,fromEmail,addresses=[],inReplyTo,referencesHeader}) {
  const [[identity]] = await pool.execute("SELECT agency_id,from_email FROM email_sender_identities WHERE id=? AND identity_key IN ('messages','messages_at_tenant') AND is_active=1",[identityId]);
  if(!identity)return null;
  const tokens=addresses.map(normalize).filter(a=>a.replace(/\+[^@]+(?=@)/,'')===normalize(identity.from_email)).map(a=>/\+p-([a-f0-9]{48})@/.exec(a)?.[1]).filter(Boolean);
  const parents=replyMessageIds(inReplyTo,referencesHeader);
  if(!tokens.length&&!parents.length)return null;
  const clauses=[],params=[identity.agency_id,normalize(fromEmail)];
  if(tokens.length){clauses.push(`n.reply_token_hash IN (${tokens.map(()=>'?').join(',')})`);params.push(...tokens.map(hashToken));}
  if(parents.length){clauses.push(`n.internet_message_id IN (${parents.map(()=>'?').join(',')})`);params.push(...parents);}
  const [rows]=await pool.execute(`SELECT DISTINCT esi.*,i.id AS inbox_id,i.owner_user_id,n.id AS reminder_id
    FROM communication_thread_reminders n JOIN communication_inboxes i ON i.id=n.inbox_id
    JOIN email_sender_identities esi ON esi.id=i.sender_identity_id JOIN users u ON u.id=n.user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=i.agency_id AND ua.is_active=1
    WHERE i.agency_id=? AND LOWER(u.personal_email)=? AND i.kind='personal' AND i.is_active=1
      AND esi.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING') AND i.owner_user_id=n.user_id
      AND n.delivery_status='sent' AND (${clauses.join(' OR ')}) LIMIT 2`,params);
  return rows.length===1?rows[0]:null;
}

export function authenticatedPersonalReply(payload,fromEmail) {
  // Use the first receiving-Gmail authentication result, not a downstream
  // sender's appended Authentication-Results header or rewritten Reply-To.
  const result=(payload?.headers||[]).find(h=>/^authentication-results$/i.test(h.name)&&/^mx\.google\.com\s*;/i.test(h.value))?.value||'';
  const domain=normalize(fromEmail).split('@')[1];
  return result.split(';').some(part=>/\bdmarc=pass\b/i.test(part)&&part.toLowerCase().match(/header\.from=([a-z0-9.-]+)/)?.[1]===domain);
}

/** A private-mail reply is queued atomically as its author's work-mail reply. */
export async function queuePersonalReminderReply({ inbox, fromEmail, deliveryId, bodyText, gmailPayload = null, inReplyTo, referencesHeader, attachments = [], reminderId = null, to: replyTo = [], cc: replyCc = [] }) {
  if (!deliveryId) throw new Error('Missing reply delivery identifier');
  const ancestors = replyMessageIds(inReplyTo, referencesHeader);
  if (!ancestors.length && !reminderId) return null;
  const [matches] = await pool.execute(`SELECT n.*, u.email, u.work_email, u.personal_email, u.role, u.has_provider_access, u.sso_password_override, u.login_is_group_email, u.is_demo, u.is_archived, u.status AS user_status, u.is_active AS user_active, p.personal_email_notify, p.personal_email_delivery_mode, m.from_json, m.internet_message_id AS parent_id, m.references_header AS parent_references, m.subject
    FROM communication_thread_reminders n JOIN users u ON u.id=n.user_id
    JOIN communication_messages m ON m.id=n.message_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    LEFT JOIN user_communication_prefs p ON p.user_id=u.id
    WHERE n.inbox_id=? AND n.delivery_status='sent' AND ${reminderId ? 'n.id=?' : `n.internet_message_id IN (${ancestors.map(()=>'?').join(',')})`}
    ORDER BY n.id DESC LIMIT 1`, [inbox.agency_id,inbox.id,...(reminderId?[reminderId]:ancestors)]);
  const reminder = matches[0];
  if (!reminder) return null;
  // Knowledge of a thread reference alone never authorizes acting as its owner.
  if (String(fromEmail || '').trim().toLowerCase() !== String(reminder.personal_email || '').trim().toLowerCase() || !['ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING'].includes(String(reminder.user_status).toUpperCase()) || Number(reminder.user_active) === 0 || Number(reminder.is_archived) === 1 || Number(reminder.user_id) !== Number(inbox.owner_user_id)) throw new Error('Personal reminder reply does not match its mailbox owner');
  const text = personalReminderReplyText(await personalReminderBody(gmailPayload, bodyText), fromEmail, inbox.from_email);
  const preferences=personalMessagePreferences(reminder);
  const recipient=await messageReminderRecipient({...reminder,status:reminder.user_status,is_active:reminder.user_active},{allowPersonal:preferences.personalEmailNotify});
  const mailbox=await resolveMessagesSendMailbox(inbox.agency_id);
  const privateRecipients=[...replyTo,...replyCc].map(normalize).filter(a=>a && a.replace(/\+[^@]+(?=@)/,'')!==normalize(inbox.from_email) && a.replace(/\+[^@]+(?=@)/,'')!==normalize(mailbox.fromEmail));
  const permitted=Number(reminder.reply_allowed)===1 && preferences.personalEmailDeliveryMode==='forward_one_to_one'
    && normalize(recipient)===normalize(fromEmail) && authenticatedPersonalReply(gmailPayload,fromEmail)
    && !privateRecipients.length && !attachments.length && await personalThreadCanReply({conversationId:reminder.conversation_id,inbox});
  if(!permitted || !text){
    const {persistInboundEmail}=await import('./inboundEmailPersistence.service.js');
    const stored=await persistInboundEmail({inboxId:inbox.id,agencyId:inbox.agency_id,conversationId:reminder.conversation_id,
      deliveryId,ownerUserId:reminder.user_id,fromEmail:inbox.from_email,subject:'Personal-email reply was not sent',
      bodyText:`Your personal-email reply was saved here but was not sent. Open the conversation in the app to review and send it. Group replies, attachments, and notification-only messages require the app.\n\n${text}`,
      to:[{email:inbox.from_email}],internalNote:true,attachments});
    return {...stored,personalReplyHeld:true};
  }
  await resolveEmailSendMailbox({ agencyId: inbox.agency_id, userId: reminder.user_id, inbox });
  const sender = typeof reminder.from_json === 'string' ? JSON.parse(reminder.from_json) : reminder.from_json;
  const to = String(sender?.replyTo || sender?.email || '').trim();
  if (!to || [fromEmail, inbox.from_email].some((a) => normalize(a) === normalize(to))) throw new Error('Reminder has no external reply recipient');
  const { isAddressBlocked } = await import('./unifiedInbox.service.js');
  if (await isAddressBlocked(inbox.agency_id, to, { ownerUserId: reminder.user_id })) throw new Error('Reply recipient is blocked');
  const parentId = replyMessageIds(reminder.parent_id)[0] || null;
  const refs = [...new Set([...replyMessageIds(null, reminder.parent_references).reverse(), ...(parentId ? [parentId] : [])])].join(' ') || null;
  const hash = createHash('sha256').update(String(deliveryId)).digest('hex');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM communication_inboxes WHERE id=? FOR UPDATE', [inbox.id]);
    const [prior] = await db.execute('SELECT message_id FROM communication_email_receipts WHERE inbox_id=? AND delivery_hash=?', [inbox.id, hash]);
    if (prior.length) { await db.commit(); return { ingested: true, duplicate: true, conversationId: reminder.conversation_id, messageId: prior[0].message_id }; }
    const [result] = await db.execute(`INSERT INTO communication_messages (conversation_id,channel,direction,author_user_id,from_json,to_json,cc_json,bcc_json,subject,body_text,in_reply_to,references_header,personal_reply_reminder_id,send_status,scheduled_send_at,undo_expires_at)
      VALUES (?,'email','outbound',?,?,?,?,?,?,?, ?,?,?,'scheduled',DATE_ADD(NOW(),INTERVAL 20 SECOND),DATE_ADD(NOW(),INTERVAL 20 SECOND))`, [reminder.conversation_id, reminder.user_id, JSON.stringify({ email: mailbox.fromEmail }), JSON.stringify([{ email: to }]), '[]', '[]', reminder.subject?.match(/^re:/i) ? reminder.subject : `Re: ${reminder.subject || ''}`, text, parentId, refs, reminder.id]);
    for (const a of attachments) await db.execute('INSERT INTO communication_attachments (message_id,filename,content_type,size_bytes,storage_key) VALUES (?,?,?,?,?)', [result.insertId, a.filename, a.contentType, a.sizeBytes, a.storageKey]);
    await db.execute('INSERT INTO communication_email_receipts (inbox_id,delivery_hash,message_id) VALUES (?,?,?)', [inbox.id, hash, result.insertId]);
    await db.execute("UPDATE communication_conversations SET archived_at=NULL, status='waiting_on_them', last_message_at=NOW(), last_message_preview=? WHERE id=?", [text.slice(0,240), reminder.conversation_id]);
    await db.execute('INSERT INTO communication_conversation_reads (conversation_id,user_id,last_read_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE last_read_at=NOW()', [reminder.conversation_id,reminder.user_id]);
    await db.commit();
    return { ingested: true, conversationId: reminder.conversation_id, messageId: result.insertId, queuedPersonalReply: true };
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}

/** Recheck at actual delivery after the undo window, not just at ingestion. */
export async function personalReplySendMailbox({reminderId,conversationId,inbox,userId,to,cc=[],bcc=[]}) {
  const [[row]]=await pool.execute(`SELECT u.*,p.personal_email_notify,p.personal_email_delivery_mode,m.from_json
    FROM communication_thread_reminders n JOIN users u ON u.id=n.user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    JOIN communication_messages m ON m.id=n.message_id
    LEFT JOIN user_communication_prefs p ON p.user_id=u.id
    WHERE n.id=? AND n.conversation_id=? AND n.inbox_id=? AND n.user_id=? AND n.reply_allowed=1 AND n.delivery_status='sent'`,[inbox.agency_id,reminderId,conversationId,inbox.id,userId]);
  const prefs=personalMessagePreferences(row || {});
  const original=typeof row?.from_json==='string'?JSON.parse(row.from_json):row?.from_json;
  if(!row || !prefs.personalEmailNotify || prefs.personalEmailDeliveryMode!=='forward_one_to_one'
    || !await messageReminderRecipient(row) || to.length!==1 || cc.length || bcc.length
    || normalize(to[0]?.email)!==normalize(original?.replyTo || original?.email)
    || !await personalThreadCanReply({conversationId,inbox})) throw new Error('Personal reply permissions changed. Review this reply in the app.');
  return resolveMessagesSendMailbox(inbox.agency_id);
}
