import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import Directory from './googleWorkspaceDirectory.service.js';
import Conversation from '../models/CommunicationConversation.model.js';
import { resolveGroupEmailForSchool } from './schoolGroupSubscription.service.js';
import { resolveMessagesSendMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const escapeHtml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = (value, fallback) => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } };
const address = value => String(value || '').trim().toLowerCase();

export async function schoolEmailContext({ organizationId, user, checkAccess }) {
  const orgId = Number(organizationId);
  if (!Number.isSafeInteger(orgId) || orgId <= 0 || !await checkAccess({ userId: user.id, role: user.role, user, schoolOrganizationId: orgId })) throw fail('School email is not available to this account.', 403);
  const [[school]] = await pool.execute('SELECT name, organization_type FROM agencies WHERE id = ?', [orgId]);
  if (!school || !['school', 'program', 'learning'].includes(school.organization_type)) throw fail('School not found.', 404);
  const agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
  const groupEmail = await resolveGroupEmailForSchool(orgId);
  if (!agencyId || !groupEmail) throw fail('This school does not have a configured group email.', 409);
  const [[actor]] = await pool.execute('SELECT id,email,first_name,last_name FROM users WHERE id = ?', [user.id]);
  if (!actor?.email) throw fail('Your email address is not configured.', 409);
  // Portal roster access alone must not grant access to the group's correspondence.
  if (!['super_admin', 'admin', 'support'].includes(String(user.role).toLowerCase())) {
    try {
      const admin = await Directory.getClient();
      await admin.members.get({ groupKey: groupEmail, memberKey: actor.email }, { timeout: 8000 });
    } catch (e) {
      if (Number(e.code) === 404) throw fail('School group membership is required to view these emails.', 403);
      throw fail('Could not verify school group access. Please try again.', 503);
    }
  }
  return { orgId, agencyId: Number(agencyId), groupEmail: address(groupEmail), email: address(actor.email), userId: Number(user.id), name: [actor.first_name, actor.last_name].filter(Boolean).join(' '), schoolName: school.name };
}

// The school Email tab is ONLY group correspondence. Apply the exact envelope
// check to EACH message: private replies in a shared thread must remain private.
export function schoolEmailScope(ctx) {
  return {
    sql: `c.agency_id = ? AND m.channel = 'email'
      AND COALESCE(m.is_internal_note,0) = 0 AND m.direction <> 'internal'
      AND COALESCE(m.send_status,'sent') = 'sent'
      AND COALESCE(c.is_spam,0) = 0 AND COALESCE(c.is_unknown_sender,0) = 0
      AND (
        JSON_CONTAINS(LOWER(COALESCE(m.to_json,JSON_ARRAY())),JSON_OBJECT('email',?))
        OR JSON_CONTAINS(LOWER(COALESCE(m.cc_json,JSON_ARRAY())),JSON_OBJECT('email',?))
        OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(m.from_json,'$.email'))) = ?
      )`,
    params: [ctx.agencyId, ctx.groupEmail, ctx.groupEmail, ctx.groupEmail]
  };
}
const messageKey = "SHA2(COALESCE(NULLIF(m.internet_message_id,''),CONCAT('message-',m.id)),256)";
const joins = `FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id`;
const publicMessage = row => ({
  id: row.id, conversationId: row.conversation_id, subject: row.subject || '(no subject)',
  from: parse(row.from_json, {}), to: parse(row.to_json, []), cc: parse(row.cc_json, []),
  sentAt: row.sent_at || row.created_at, unread: !!row.unread,
  preview: String(row.body_text || '').replace(/\s+/g,' ').slice(0,220),
  ...(row.body_html !== undefined ? { text: row.body_text, html: row.body_html } : {})
});

export async function listSchoolEmails(ctx, { offset = 0, unreadOnly = false } = {}) {
  const scope = schoolEmailScope(ctx);
  const start = Math.max(0, Math.min(10000, Number(offset) || 0));
  const base = `WITH visible AS (
    SELECT m.id,m.conversation_id,m.subject,m.from_json,m.to_json,m.cc_json,m.sent_at,m.created_at,m.body_text,
      CASE WHEN m.author_user_id = ? OR r.read_at IS NOT NULL THEN 0 ELSE 1 END AS unread,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(m.internet_message_id,''),CONCAT('message-',m.id)) ORDER BY m.id) AS copy_rank
    ${joins} LEFT JOIN school_portal_email_reads r ON r.school_organization_id=? AND r.user_id=? AND r.message_key=${messageKey} WHERE ${scope.sql}
  )`;
  const params = [ctx.userId, ctx.orgId, ctx.userId, ...scope.params];
  const [[counts]] = await pool.query(`${base} SELECT COUNT(*) AS total,COALESCE(SUM(unread),0) AS unread FROM visible WHERE copy_rank=1`, params);
  const [rows] = await pool.query(`${base} SELECT * FROM visible WHERE copy_rank=1 ${unreadOnly ? 'AND unread=1' : ''} ORDER BY COALESCE(sent_at,created_at) DESC,id DESC LIMIT 51 OFFSET ${Math.floor(start)}`, params);
  return { groupEmail: ctx.groupEmail, messages: rows.slice(0,50).map(publicMessage), hasMore: rows.length>50, unreadCount: Number(counts.unread), total: Number(counts.total) };
}

export async function getSchoolEmail(ctx, messageId) {
  const id = Number(messageId);
  if (!Number.isSafeInteger(id) || id <= 0) throw fail('Email not found.',404);
  const scope = schoolEmailScope(ctx);
  const [rows] = await pool.query(`SELECT m.* ${joins} WHERE m.id=? AND ${scope.sql} LIMIT 1`,[id,...scope.params]);
  if (!rows[0]) throw fail('Email not found.',404);
  const row = rows[0];
  const [attachments] = await pool.execute('SELECT id,filename,content_type,size_bytes FROM communication_attachments WHERE message_id=? ORDER BY id',[id]);
  return { ...publicMessage(row), attachments, internetMessageId: row.internet_message_id, conversationId: row.conversation_id };
}

export async function markSchoolEmailRead(ctx, messageId) {
  const message = await getSchoolEmail(ctx, messageId);
  // Message-specific reads do not silently mark older or newer emails as seen.
  const { createHash } = await import('node:crypto');
  const key = createHash('sha256').update(message.internetMessageId || `message-${message.id}`).digest('hex');
  await pool.execute('INSERT IGNORE INTO school_portal_email_reads (school_organization_id,user_id,message_key) VALUES (?,?,?)',[ctx.orgId,ctx.userId,key]);
}

export async function sendSchoolEmail(ctx, { to, subject, body, replyMessageId } = {}) {
  const recipient = address(to);
  const title = String(subject || '').trim();
  const text = String(body || '').trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient) || !title || title.length>250 || /[\r\n]/.test(title) || !text || text.length>20000) throw fail('Enter one recipient, a subject, and a message (up to 20,000 characters).');
  const cc = recipient === ctx.groupEmail ? [] : [{email:ctx.groupEmail}];
  const original = replyMessageId ? await getSchoolEmail(ctx, replyMessageId) : null;
  const mailbox = await resolveMessagesSendMailbox(ctx.agencyId);
  if (!mailbox.identity?.id || !/^messages@/i.test(mailbox.identity.from_email)) throw fail('School email sending is not configured.',409);
  const conversation = await Conversation.create({agencyId:ctx.agencyId,inboxId:mailbox.inbox.id,channel:'email',subject:title,ownerUserId:ctx.userId,status:'waiting_on_them'});
  await Conversation.upsertLink(conversation.id,'school',ctx.orgId,ctx.schoolName);
  await Conversation.upsertParticipant(conversation.id,{kind:'email',email:recipient,isPrimary:true});
  const replyTo = ctx.groupEmail;
  const messageId = await Conversation.addMessage({conversationId:conversation.id,channel:'email',direction:'outbound',authorUserId:ctx.userId,from:{email:mailbox.identity.from_email,name:ctx.name,replyTo},to:[{email:recipient}],cc,subject:title,bodyText:text,sendStatus:'preparing'});
  let delivered = false;
  try {
    const receipt = await sendEmailFromIdentity({senderIdentityId:mailbox.identity.id,to:recipient,cc:cc.length?ctx.groupEmail:null,subject:title,text,html:`<div style="font:15px/1.6 Arial,sans-serif">${escapeHtml(text).replaceAll('\n','<br>')}</div>`,source:'manual',templateType:'school_portal_email',generatedByUserId:ctx.userId,fromDisplayNameOverride:`${ctx.name} · ${ctx.schoolName}`,replyToOverride:replyTo,inReplyTo:original?.internetMessageId||null,references:original?.internetMessageId||null});
    if (!receipt.id || receipt.redirected || receipt.pendingApproval || receipt.queued) throw fail('Email was not delivered. Please contact the school support team.',502);
    delivered = true;
    await Conversation.updateMessage(messageId,{sendStatus:'sent',sentAt:new Date(),internetMessageId:receipt.internetMessageId});
    await Conversation.update(conversation.id,{externalThreadId:receipt.threadId,lastMessageAt:new Date(),lastMessagePreview:text.slice(0,220)});
    return {sent:true,messageId};
  } catch(e) {
    if (delivered) {
      console.error('[school email] Sent message needs record reconciliation', messageId, e.code || e.message);
      return {sent:true,messageId,recordPending:true};
    }
    await Conversation.updateMessage(messageId,{sendStatus:'failed'});
    throw e;
  }
}
