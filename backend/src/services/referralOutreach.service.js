import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import Entry from '../models/ReferralDirectoryEntry.model.js';
import Identity from '../models/EmailSenderIdentity.model.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { encryptSupportEmailText } from './supportEmailEncryption.js';
import { emailHash, classifySupportEmailResult } from './supportTicketEmailPolicy.js';
import { matchReferrals, referralEmailContent } from '../utils/referralMatching.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const directoryRoles = new Set(['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus']);
export const canSendReferralAsSupport = actor => actor?.role === 'super_admin' || ['admin', 'support'].includes(actor?.agency_role || actor?.role);
export async function authorizeReferralOutreach(agencyId, actorUserId, db = pool) {
  const [[actor]] = await db.execute(`SELECT u.id,u.role,ua.agency_role FROM users u
    LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
    AND (u.role='super_admin' OR ua.user_id IS NOT NULL)`, [agencyId, actorUserId]);
  if (!actor || !directoryRoles.has(actor.role)) {
    throw fail('Active agency membership and referral directory access are required.', 403);
  }
  return actor;
}
export async function referralOutreachOptions({ agencyId, actorUserId }) {
  const actor = await authorizeReferralOutreach(agencyId, actorUserId);
  const canSupport = canSendReferralAsSupport(actor);
  return { canSendAsSupport: canSupport, canEmailNewPerson: canSupport, defaultSenderMode: canSupport ? 'support' : 'personal' };
}
// Search and revalidation share Messages' current clinical/contact access scope.
export async function searchReferralRecipients({ agencyId, actorUserId, query }) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  if (q.length > 254) throw fail('Use a shorter name or email to search.');
  const { searchHubPeople } = await import('./messagesHub.service.js');
  const people = await searchHubPeople({ agencyId, userId: actorUserId, q, limit: 50 });
  return people.filter(p => Number(p.agencyId) === Number(agencyId) && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(p.email || ''))
    .map(p => ({ personKey: p.personKey, name: p.displayName, email: p.email.toLowerCase(), relationship: p.relationshipMeta || '' }));
}
async function recipientFor({ agencyId, actorUserId, actor, to, personKey, senderMode }) {
  const recipient = String(to || '').trim().toLowerCase();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(recipient) || recipient.length > 254) throw fail('Enter one valid recipient email.');
  if (!personKey) {
    if (!canSendReferralAsSupport(actor) || senderMode !== 'support') throw fail('Choose a person from the system. Support can email a new person using the support sender.', 403);
    return recipient;
  }
  const people = await searchReferralRecipients({ agencyId, actorUserId, query: recipient });
  if (!people.some(p => p.personKey === personKey && p.email === recipient)) throw fail('This recipient is no longer available in your directory. Choose them again.', 403);
  return recipient;
}
export async function findReferralOptions(agencyId, criteria) {
  return matchReferrals(await Entry.listForAgency(agencyId, { limit: 1000 }), criteria);
}
async function senderFor(agencyId) {
  const identity = await Identity.findByAgencyAndIdentityKey(agencyId, 'support');
  if (!identity || Number(identity.is_active) === 0 || !/^support@/i.test(identity.from_email || '') || Number(identity.agency_id) !== Number(agencyId)) {
    throw fail('Configure an active support sender for this agency first.', 409);
  }
  const [[route]] = await pool.execute('SELECT sender_identity_id FROM email_inbound_routes WHERE LOWER(email_address)=? AND is_active=1', [identity.from_email.toLowerCase()]);
  if (Number(route?.sender_identity_id) !== Number(identity.id)) throw fail('Configure inbound routing for this support address before sending.', 409);
  return identity;
}
async function outreachSender({ agencyId, actorUserId, actor, senderMode }) {
  if (!['support', 'personal'].includes(senderMode)) throw fail('Choose a sender.');
  if (senderMode === 'support') {
    if (!canSendReferralAsSupport(actor)) throw fail('Support sender access is required.', 403);
    const identity = await senderFor(agencyId);
    return { identity, from: identity.from_email.toLowerCase(), replyTo: identity.from_email.toLowerCase(), inboxId: null };
  }
  const { resolveEmailSendMailbox } = await import('./emailSendMailbox.service.js');
  const mailbox = await resolveEmailSendMailbox({ agencyId, userId: actorUserId });
  return { identity: mailbox.identity, from: mailbox.fromEmail.toLowerCase(), replyTo: mailbox.replyTo.toLowerCase(), inboxId: mailbox.inbox.id };
}
async function selectedEntries(agencyId, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 6 || ids.some(id => !Number.isSafeInteger(Number(id)))) throw fail('Select one to six referral entries.');
  const entries = await Promise.all([...new Set(ids.map(Number))].map(id => Entry.findById(id)));
  if (entries.some(e => !e || Number(e.agency_id) !== Number(agencyId) || !Number(e.is_active) || e.approval_status !== 'approved')) {
    throw fail('A selected referral is unavailable or belongs to another agency.', 409);
  }
  return entries;
}
export async function prepareReferralEmail({ agencyId, actorUserId, to, name = '', entryIds, personKey = null, senderMode }) {
  const actor = await authorizeReferralOutreach(agencyId, actorUserId);
  senderMode ||= canSendReferralAsSupport(actor) ? 'support' : 'personal';
  const recipient = await recipientFor({ agencyId, actorUserId, actor, to, personKey, senderMode });
  if (typeof name !== 'string' || name.length > 100 || /[\r\n]/.test(name)) throw fail('Enter a short recipient name.');
  const sender = await outreachSender({ agencyId, actorUserId, actor, senderMode });
  const entries = await selectedEntries(agencyId, entryIds);
  const content = referralEmailContent({ entries, name, support: senderMode === 'support' });
  const [[agency]] = await pool.execute('SELECT name FROM agencies WHERE id=?', [agencyId]);
  content.subject = `Your referral options | ${agency.name}`;
  const id = randomUUID();
  const payload = { to: recipient, ...content, entryIds: entries.map(e => e.id), senderIdentityId: sender.identity.id,
    from: sender.from, replyTo: sender.replyTo, inboxId: sender.inboxId, senderMode, personKey };
  const enc = encryptChatText(JSON.stringify(payload));
  await pool.execute(`INSERT INTO referral_outreach_drafts
    (id,agency_id,actor_user_id,payload_ciphertext,payload_iv,payload_auth_tag,encryption_key_id) VALUES (?,?,?,?,?,?,?)`,
  [id,agencyId,actorUserId,enc.ciphertextB64,enc.ivB64,enc.authTagB64,enc.keyId]);
  return { id, ...payload };
}

/** Reserve the reviewed draft once before transport. Unknown outcomes never auto-retry. */
export async function sendReferralEmail({ agencyId, actorUserId, draftId }, dependencies = {}) {
  const actor = await authorizeReferralOutreach(agencyId, actorUserId);
  const [[draft]] = await pool.execute('SELECT * FROM referral_outreach_drafts WHERE id=? AND agency_id=? AND actor_user_id=?', [draftId,agencyId,actorUserId]);
  if (!draft) throw fail('Referral draft not found.',404);
  if (draft.status !== 'draft') {
    const saved = draft.payload_ciphertext ? JSON.parse(decryptChatText({ ciphertextB64:draft.payload_ciphertext,ivB64:draft.payload_iv,authTagB64:draft.payload_auth_tag,keyId:draft.encryption_key_id })) : {};
    return { ...saved.receipt, status:draft.status, ticketId:draft.ticket_id, duplicate:true };
  }
  if (Date.now() - new Date(draft.created_at).getTime() > 24*60*60*1000) throw fail('This preview expired. Prepare a new email.',409);
  const payload = JSON.parse(decryptChatText({ ciphertextB64:draft.payload_ciphertext,ivB64:draft.payload_iv,authTagB64:draft.payload_auth_tag,keyId:draft.encryption_key_id }));
  const senderMode = payload.senderMode || 'support';
  await recipientFor({ agencyId, actorUserId, actor, to: payload.to, personKey: payload.personKey, senderMode });
  await selectedEntries(agencyId,payload.entryIds);
  const sender = await outreachSender({ agencyId, actorUserId, actor, senderMode });
  const identity = sender.identity;
  if (identity.id !== payload.senderIdentityId || sender.from !== payload.from || sender.replyTo !== (payload.replyTo || payload.from) || (senderMode === 'personal' && sender.inboxId !== payload.inboxId)) throw fail('Your sender changed. Prepare a new email.',409);
  if (senderMode === 'personal') return sendPersonalReferral({ agencyId, actorUserId, draft, payload }, dependencies);
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

async function sendPersonalReferral({ agencyId, actorUserId, draft, payload }, dependencies) {
  const [reserved] = await pool.execute("UPDATE referral_outreach_drafts SET status='sending' WHERE id=? AND status='draft'", [draft.id]);
  if (!reserved.affectedRows) return { status: 'sending', duplicate: true };
  const compose = dependencies.compose || (await import('./unifiedInbox.service.js')).composeNewEmail;
  try {
    const result = await compose({ agencyId, userId: actorUserId, inboxId: payload.inboxId,
      payload: { to: payload.to, subject: payload.subject, text: payload.text, html: payload.html,
        templateType: 'hub_email', undoDelaySeconds: 0, deferClientFiling: true } });
    const receipt = { status: result.sent ? 'sent' : 'queued', conversationId: result.id, messageId: result.messageId };
    const enc = encryptChatText(JSON.stringify({ ...payload, receipt }));
    await pool.execute(`UPDATE referral_outreach_drafts SET status=?,payload_ciphertext=?,payload_iv=?,payload_auth_tag=?,encryption_key_id=? WHERE id=?`,
      [receipt.status, enc.ciphertextB64, enc.ivB64, enc.authTagB64, enc.keyId, draft.id]);
    return receipt;
  } catch (error) {
    await pool.execute("UPDATE referral_outreach_drafts SET status='uncertain' WHERE id=?", [draft.id]);
    throw fail('Delivery could not be confirmed. Check Messages before sending another email.', 503);
  }
}
