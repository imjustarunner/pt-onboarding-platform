import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import Entry from '../models/ReferralDirectoryEntry.model.js';
import Identity from '../models/EmailSenderIdentity.model.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { encryptSupportEmailText } from './supportEmailEncryption.js';
import { emailHash, classifySupportEmailResult } from './supportTicketEmailPolicy.js';
import { matchReferrals, referralEmailContent } from '../utils/referralMatching.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function authorizeReferralOutreach(agencyId, actorUserId, db = pool) {
  const [[actor]] = await db.execute(`SELECT u.id,u.role,ua.agency_role FROM users u
    LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
    AND (u.role='super_admin' OR ua.user_id IS NOT NULL)`, [agencyId, actorUserId]);
  if (!actor || (actor.role !== 'super_admin' && !['admin','support'].includes(actor.agency_role || actor.role))) {
    throw fail('Referral emails are currently available to agency support and administrators.', 403);
  }
  return actor;
}
export async function findReferralOptions(agencyId, criteria) {
  return matchReferrals(await Entry.listForAgency(agencyId, { limit: 1000 }), criteria);
}
async function senderFor(agencyId) {
  const identity = await Identity.findByAgencyAndIdentityKey(agencyId, 'support');
  if (!identity || !/^support@/i.test(identity.from_email || '') || Number(identity.agency_id) !== Number(agencyId)) {
    throw fail('Configure an active support sender for this agency first.', 409);
  }
  const [[route]] = await pool.execute('SELECT sender_identity_id FROM email_inbound_routes WHERE LOWER(email_address)=? AND is_active=1', [identity.from_email.toLowerCase()]);
  if (Number(route?.sender_identity_id) !== Number(identity.id)) throw fail('Configure inbound routing for this support address before sending.', 409);
  return identity;
}
async function selectedEntries(agencyId, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 6 || ids.some(id => !Number.isSafeInteger(Number(id)))) throw fail('Select one to six referral entries.');
  const entries = await Promise.all([...new Set(ids.map(Number))].map(id => Entry.findById(id)));
  if (entries.some(e => !e || Number(e.agency_id) !== Number(agencyId) || !Number(e.is_active) || e.approval_status !== 'approved')) {
    throw fail('A selected referral is unavailable or belongs to another agency.', 409);
  }
  return entries;
}
export async function prepareReferralEmail({ agencyId, actorUserId, to, name = '', entryIds }) {
  await authorizeReferralOutreach(agencyId, actorUserId);
  const recipient = String(to || '').trim().toLowerCase();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(recipient) || recipient.length > 254) throw fail('Enter one valid recipient email.');
  if (typeof name !== 'string' || name.length > 100 || /[\r\n]/.test(name)) throw fail('Enter a short recipient name.');
  const identity = await senderFor(agencyId);
  const entries = await selectedEntries(agencyId, entryIds);
  const content = referralEmailContent({ entries, name });
  const [[agency]] = await pool.execute('SELECT name FROM agencies WHERE id=?', [agencyId]);
  content.subject = `Your referral options | ${agency.name}`;
  const id = randomUUID();
  const payload = { to: recipient, ...content, entryIds: entries.map(e => e.id), senderIdentityId: identity.id, from: identity.from_email.toLowerCase() };
  const enc = encryptChatText(JSON.stringify(payload));
  await pool.execute(`INSERT INTO referral_outreach_drafts
    (id,agency_id,actor_user_id,payload_ciphertext,payload_iv,payload_auth_tag,encryption_key_id) VALUES (?,?,?,?,?,?,?)`,
  [id,agencyId,actorUserId,enc.ciphertextB64,enc.ivB64,enc.authTagB64,enc.keyId]);
  return { id, ...payload, replyTo: payload.from };
}

/** Reserve the reviewed draft once before transport. Unknown outcomes never auto-retry. */
export async function sendReferralEmail({ agencyId, actorUserId, draftId }, dependencies = {}) {
  await authorizeReferralOutreach(agencyId, actorUserId);
  const [[draft]] = await pool.execute('SELECT * FROM referral_outreach_drafts WHERE id=? AND agency_id=? AND actor_user_id=?', [draftId,agencyId,actorUserId]);
  if (!draft) throw fail('Referral draft not found.',404);
  if (draft.status !== 'draft') return { status:draft.status, ticketId:draft.ticket_id, duplicate:true };
  if (Date.now() - new Date(draft.created_at).getTime() > 24*60*60*1000) throw fail('This preview expired. Prepare a new email.',409);
  const payload = JSON.parse(decryptChatText({ ciphertextB64:draft.payload_ciphertext,ivB64:draft.payload_iv,authTagB64:draft.payload_auth_tag,keyId:draft.encryption_key_id }));
  await selectedEntries(agencyId,payload.entryIds);
  const identity = await senderFor(agencyId);
  if (identity.id !== payload.senderIdentityId || identity.from_email.toLowerCase() !== payload.from) throw fail('Support sender changed. Prepare a new email.',409);
  const enc = encryptSupportEmailText(payload.text);
  const internetId = `<${draft.id}@${payload.from.split('@')[1]}>`;
  const db = await pool.getConnection();
  let ticketId, messageId, emailId;
  try {
    await db.beginTransaction();
    const [reserved] = await db.execute("UPDATE referral_outreach_drafts SET status='sending' WHERE id=? AND status='draft'",[draft.id]);
    if (!reserved.affectedRows) { await db.rollback(); return { status:'sending',duplicate:true }; }
    const [ticket] = await db.execute(`INSERT INTO support_tickets
      (agency_id,school_organization_id,created_by_user_id,created_by_source_key,source_channel,source_email_from,
       source_email_subject,subject,question,question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,status,topic)
      VALUES (?,?,?,'referral_outreach','email',?,?,?,NULL,?,?,?,?,'open','general')`,
    [agencyId,agencyId,actorUserId,payload.to,payload.subject,payload.subject,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
    ticketId = ticket.insertId;
    const [message] = await db.execute(`INSERT INTO support_ticket_messages
      (ticket_id,author_user_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal)
      VALUES (?,?,'system_email_outbound',NULL,?,?,?,?,0)`,[ticketId,actorUserId,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
    messageId = message.insertId;
    const [email] = await db.execute(`INSERT INTO support_ticket_email_messages
      (ticket_id,ticket_message_id,agency_id,direction,send_status,sender_identity_id,from_email,from_name,to_json,subject,internet_message_id,internet_message_id_hash,client_request_key)
      VALUES (?,?,?,'outbound','sending',?,?,?,?,?,?,?,?)`,
    [ticketId,messageId,agencyId,identity.id,payload.from,identity.display_name,JSON.stringify([payload.to]),payload.subject,internetId,emailHash(internetId),emailHash(draft.id)]);
    emailId = email.insertId;
    await db.execute('UPDATE referral_outreach_drafts SET ticket_id=? WHERE id=?',[ticketId,draft.id]);
    await db.commit();
  } catch(error) { await db.rollback(); throw error; } finally { db.release(); }
  const send = dependencies.send || (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity;
  let result, status;
  try {
    result = await send({ senderIdentityId:identity.id,to:payload.to,subject:payload.subject,text:payload.text,html:payload.html,
      replyToOverride:payload.from,source:'manual',generatedByUserId:actorUserId,templateType:'support_ticket_reply_team',internetMessageIdOverride:internetId });
    status = classifySupportEmailResult(result);
  } catch(error) {
    await pool.execute("UPDATE referral_outreach_drafts SET status='uncertain' WHERE id=?",[draft.id]);
    throw fail('Delivery could not be confirmed. Check the support ticket before sending another email.',503);
  }
  // If receipt persistence fails, the reserved draft remains non-retryable.
  const deliveredInternetId = /^<[^<>\s]+@[^<>\s]+>$/.test(result?.internetMessageId || '') ? result.internetMessageId : internetId;
  await pool.execute(`UPDATE support_ticket_email_messages SET send_status=?,communication_id=?,gmail_message_id=?,gmail_thread_id=?,sent_at=?,internet_message_id=?,internet_message_id_hash=? WHERE id=?`,
    [status,result?.communicationId || null,result?.id || null,result?.threadId || null,status==='sent'?new Date():null,deliveredInternetId,emailHash(deliveredInternetId),emailId]);
  await pool.execute('UPDATE support_tickets SET source_email_thread_id=? WHERE id=?',[result?.threadId || null,ticketId]);
  await pool.execute('UPDATE referral_outreach_drafts SET status=?,transport_message_id=?,communication_id=? WHERE id=?',
    [status,result?.id || null,result?.communicationId || null,draft.id]);
  const { syncEmailTicketsToInbox } = await import('./ticketEmailInboxAdapter.service.js');
  await syncEmailTicketsToInbox({agencyId,ticketId,limit:1,forceRefresh:true}).catch(() => {});
  const { notifyReferralSupport } = await import('./referralSupportNotifications.service.js');
  await notifyReferralSupport({agencyId,ticketId,actorUserId}).catch(error => console.warn('[referral support] notification pending',error.code));
  return { status,ticketId,messageId,transportMessageId:result?.id || null,reason:result?.reason || null };
}
