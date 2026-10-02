import { resolveEmailClientFiling } from './clientConversationRecord.service.js';
import { planEmailDelivery } from './emailDeliveryChoice.service.js';
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { requireConversationAccess } from './communicationAccess.service.js';
import { composeNewEmail, replyToConversation } from './unifiedInbox.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const map = (r) => ({ ...r, draft: parse(r.draft_json), result: r.send_result_json ? parse(r.send_result_json) : null, draft_json: undefined, send_result_json: undefined });
export function validateEmailDraft(raw = {}) {
  const data = Object.fromEntries(['to','cc','bcc','subject','text','quotedText'].map((key) => [key, String(raw[key] || '')]));
  if (data.subject.length > 998 || ['to','cc','bcc'].some((k) => /[\r\n]/.test(data[k]))) throw fail('Invalid email headers');
  if (data.text.length + data.quotedText.length > 1_000_000) throw fail('Message is too long');
  data.clientIds = [...new Set((Array.isArray(raw.clientIds) ? raw.clientIds : []).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))];
  if(data.clientIds.length>50) throw fail('Too many client records selected');
  data.deferClientFiling = raw.deferClientFiling === true;
  const attachments = raw.attachments || [];
  if (!Array.isArray(attachments) || attachments.length > 50) throw fail('Too many attachments');
  let bytes = 0;
  data.attachments = attachments.map((a) => {
    const contentBase64 = String(a.contentBase64 || '');
    const content = Buffer.from(contentBase64, 'base64'); bytes += content.length;
    if (!content.length || bytes > 25 * 1024 * 1024) throw fail('Attachments must total 25 MB or less');
    return { filename: String(a.filename || 'attachment').replace(/[\r\n/\\]/g,'_').slice(0,180), contentType: String(a.contentType || 'application/octet-stream'), contentBase64 };
  });
  return data;
}
// Metadata is server-owned. Old drafts remain visible when they contain writing/files.
export const meaningfulDraftSql = `(JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$._hasContent')) IN ('true','1') OR
 (JSON_EXTRACT(draft_json,'$._hasContent') IS NULL AND (
 CHAR_LENGTH(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.text')),'')))>0 OR
 COALESCE(JSON_LENGTH(JSON_EXTRACT(draft_json,'$.attachments')),0)>0 OR
 (mode='new' AND CHAR_LENGTH(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.subject')),'')))>0))))`;
const headerKeys = ['to','cc','bcc','subject'];
export function draftWithMetadata(data, previous = null) {
  const baseline = previous?._baseline || Object.fromEntries(headerKeys.map(k => [k, data[k] || '']));
  return {...data, _baseline:baseline, _hasContent:!!(data.text.trim() || data.attachments.length ||
    (previous && headerKeys.some(k => String(data[k] || '').trim() !== String(baseline[k] || '').trim())))};
}

async function agencyAccess(actor, agencyId) {
  if (actor.scopedAgencyId && Number(actor.scopedAgencyId) !== Number(agencyId)) throw fail('Mailbox not found',404);
  const agencies = await User.getAgencies(actor.id);
  if (!(agencies || []).some((a) => Number(a.id) === Number(agencyId))) throw fail('Mailbox not found',404);
}
export async function getEmailDraft(actor, id) {
  const [rows] = await pool.execute(`SELECT d.*, COALESCE((SELECT i.from_email FROM communication_conversations c JOIN communication_inboxes i ON i.id=c.inbox_id WHERE c.id=d.conversation_id), (SELECT i.from_email FROM communication_inboxes i WHERE i.agency_id=d.agency_id AND i.owner_user_id=d.user_id AND i.kind='personal' AND i.is_active=1 LIMIT 1)) AS from_email FROM communication_email_drafts d WHERE d.id=? AND d.user_id=?`, [id,actor.id]);
  if (!rows[0]) throw fail('Draft not found',404);
  await agencyAccess(actor, rows[0].agency_id);
  if (rows[0].conversation_id) await requireConversationAccess(actor,rows[0].conversation_id);
  return map(rows[0]);
}
/** Separate from saving/opening drafts: a sender lookup must not block autosave. */
export async function getEmailDraftSender(actor, id) {
  const draft = await getEmailDraft(actor, id);
  let inbox = null;
  if (draft.conversation_id) {
    const conv = await requireConversationAccess(actor, draft.conversation_id);
    const Inbox = (await import('../models/CommunicationInbox.model.js')).default;
    inbox = await Inbox.findById(conv.inbox_id);
    if (!inbox) throw fail('Work mailbox unavailable');
  }
  const { resolveEmailSendMailbox } = await import('./emailSendMailbox.service.js');
  const sender = await resolveEmailSendMailbox({ agencyId: draft.agency_id, userId: actor.id, inbox });
  return { fromEmail: sender.fromEmail, replyTo: sender.replyTo };
}
export async function listEmailDrafts(actor, agencyId) {
  await agencyAccess(actor,agencyId);
  // Never return attachments in a list response.
  const [rows] = await pool.execute(`SELECT id,agency_id,conversation_id,mode,version,state,updated_at,
    JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.subject')) AS subject,
    JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.to')) AS recipient,
    LEFT(JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.text')),400) AS preview
    FROM communication_email_drafts WHERE user_id=? AND agency_id=? AND state='editing' AND ${meaningfulDraftSql} ORDER BY updated_at DESC LIMIT 200`, [actor.id,agencyId]);
  return rows;
}
export async function createEmailDraft(actor, input) {
  const mode = String(input.mode || 'new');
  if (!['new','reply','reply_all','forward'].includes(mode)) throw fail('Invalid email action');
  let agencyId = Number(input.agencyId); let cid = null;
  if (mode !== 'new') {
    const conv = await requireConversationAccess(actor,input.conversationId);
    if (conv.channel !== 'email') throw fail('Email conversation required');
    agencyId = Number(conv.agency_id); cid = conv.id;
  }
  await agencyAccess(actor,agencyId);
  const data = draftWithMetadata(validateEmailDraft(input.draft));
  let id = randomUUID(), resumed = false;
  const insert = db => db.execute(`INSERT INTO communication_email_drafts(id,user_id,agency_id,conversation_id,mode,draft_json) VALUES(?,?,?,?,?,?)`,[id,actor.id,agencyId,cid,mode,JSON.stringify(data)]);
  if (cid) {
    // Serialize reply creation for this author; two windows must not create two competing drafts.
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[actor.id]);
      const [existing] = await connection.execute(`SELECT id, ${meaningfulDraftSql} AS hasContent FROM communication_email_drafts WHERE user_id=? AND agency_id=? AND conversation_id=? AND state='editing' AND mode=? ORDER BY ${meaningfulDraftSql} DESC, updated_at DESC LIMIT 1 FOR UPDATE`,[actor.id,agencyId,cid,mode]);
      if (existing[0]) {
        id=existing[0].id; resumed=!!existing[0].hasContent;
        // An untouched shell should quote the latest email, not an old reply.
        if (!resumed) await connection.execute("UPDATE communication_email_drafts SET draft_json=?,version=version+1 WHERE id=? AND user_id=? AND state='editing'",[JSON.stringify(data),id,actor.id]);
      } else await insert(connection);
      await connection.commit();
    } catch(error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else await insert(pool);
  return {...await getEmailDraft(actor,id), resumed};
}

export async function saveEmailDraft(actor,id,input) {
  const draft = await getEmailDraft(actor,id);
  if (draft.state !== 'editing') throw fail('This draft has already been submitted',409);
  const data = draftWithMetadata(validateEmailDraft(input.draft), draft.draft);
  const [result] = await pool.execute(`UPDATE communication_email_drafts SET draft_json=?,version=version+1 WHERE id=? AND user_id=? AND version=? AND state='editing'`,[JSON.stringify(data),id,actor.id,Number(input.version)||0]);
  if (!result.affectedRows) throw fail('This draft changed in another window. Reopen it before editing.',409);
  return { version: draft.version + 1 };
}
export async function deleteEmailDraft(actor,id) {
  const draft = await getEmailDraft(actor,id);
  if (draft.state !== 'editing') throw fail('Submitted email cannot be discarded as a draft',409);
  await pool.execute("DELETE FROM communication_email_drafts WHERE id=? AND user_id=? AND state='editing'",[id,actor.id]);
}
export async function sendEmailDraft(actor,id,version,deliveryChoice=null) {
  const draft = await getEmailDraft(actor,id);
  if (draft.state === 'sent') return draft.result;
  if (draft.state !== 'editing') throw fail('Submission is awaiting confirmation. Check the conversation before sending another copy.',409);
  if (!draft.draft.to.trim() || (!draft.draft.text.trim() && !draft.draft.attachments.length && draft.mode !== 'forward')) throw fail('Add a recipient and a message or attachment');
  const recipients = [draft.draft.to,draft.draft.cc,draft.draft.bcc].flatMap(value => String(value || '').split(/[,;]/).map(s=>s.trim()).filter(Boolean));
  if (recipients.some(email=>! /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))) throw fail('Use complete email addresses separated by commas');
  const deliveryPlan = await planEmailDelivery({agencyId:draft.agency_id,userId:actor.id,...draft.draft,choice:deliveryChoice,requireChoice:true});
  if (['new','forward'].includes(draft.mode)) await resolveEmailClientFiling({agencyId:draft.agency_id,userId:actor.id,...draft.draft,defer:draft.draft.deferClientFiling});
  const [claim] = await pool.execute("UPDATE communication_email_drafts SET state='sending' WHERE id=? AND user_id=? AND version=? AND state='editing'",[id,actor.id,Number(version)||0]);
  if (!claim.affectedRows) throw fail('This draft is already being submitted or changed in another window',409);
  const payload = { ...draft.draft, text: [draft.draft.text,draft.draft.quotedText].filter(Boolean).join('\n\n'), mode:draft.mode, undoDelaySeconds:20, deliveryPlan };
  try {
    const result = draft.mode === 'new'
      ? await composeNewEmail({ agencyId:draft.agency_id,userId:actor.id,payload })
      : await replyToConversation(draft.conversation_id,payload,{userId:actor.id});
    const receipt = { ...result, conversationId: result.forwardedConversationId || result.id || draft.conversation_id };
    await pool.execute("UPDATE communication_email_drafts SET state='sent',send_result_json=?,draft_json='{}' WHERE id=? AND user_id=?",[JSON.stringify(receipt),id,actor.id]);
    return receipt;
  } catch (e) {
    // An ambiguous failure after queuing must never silently offer a duplicate send.
    // Validation failures are safe to edit/retry; transport/storage failures retain
    // the draft in 'sending' so the user can check the conversation's delivery status.
    if ((e.status >= 400 && e.status < 500) || /^(Blocked address:|Recipient \(To\) is required|No sender|Select an inbox)/.test(e.message || '')) await pool.execute("UPDATE communication_email_drafts SET state='editing' WHERE id=? AND user_id=?",[id,actor.id]);
    throw e;
  }
}


export async function getEmailDraftSummary(actor, agencyId) {
  await agencyAccess(actor, agencyId);
  const [[counts]] = await pool.execute(`SELECT SUM(state='editing' AND ${meaningfulDraftSql}) AS draftCount,
    SUM(state='sending') AS pendingCount FROM communication_email_drafts WHERE user_id=? AND agency_id=?`,[actor.id,agencyId]);
  const [threads] = await pool.execute(`SELECT id,conversation_id FROM communication_email_drafts WHERE user_id=? AND agency_id=? AND state='editing' AND conversation_id IS NOT NULL AND ${meaningfulDraftSql} ORDER BY updated_at DESC LIMIT 500`,[actor.id,agencyId]);
  const [[failed]] = await pool.execute(`SELECT COUNT(*) AS n FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id WHERE c.agency_id=? AND m.author_user_id=? AND m.channel='email' AND m.direction='outbound' AND m.send_status='failed'`,[agencyId,actor.id]);
  return {draftCount:Number(counts?.draftCount)||0,attentionCount:(Number(counts?.pendingCount)||0)+(Number(failed?.n)||0),conversationDrafts:threads};
}

export async function listEmailAttention(actor, agencyId) {
  await agencyAccess(actor, agencyId);
  const [drafts] = await pool.execute(`SELECT id AS draftId,conversation_id AS conversationId,updated_at AS updatedAt,
    JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.subject')) AS subject,'Confirmation pending' AS deliveryLabel
    FROM communication_email_drafts WHERE user_id=? AND agency_id=? AND state='sending' ORDER BY updated_at DESC LIMIT 100`,[actor.id,agencyId]);
  const [failed] = await pool.execute(`SELECT m.id AS messageId,c.id AS conversationId,m.subject,m.created_at AS updatedAt,'Send failed' AS deliveryLabel
    FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id
    WHERE c.agency_id=? AND m.author_user_id=? AND m.channel='email' AND m.direction='outbound' AND m.send_status='failed' ORDER BY m.id DESC LIMIT 100`,[agencyId,actor.id]);
  const [filing]=await pool.execute(`SELECT c.id AS conversationId,c.subject,c.updated_at AS updatedAt,'Choose client for filing' AS deliveryLabel FROM communication_conversations c JOIN communication_links l ON l.conversation_id=c.id AND l.entity_type='client_filing_review'
    WHERE c.agency_id=? AND (c.owner_user_id=? OR EXISTS (SELECT 1 FROM communication_inboxes i WHERE i.id=c.inbox_id AND i.kind='personal' AND i.owner_user_id=?)) ORDER BY c.updated_at DESC LIMIT 100`,[agencyId,actor.id,actor.id]);
  return [...drafts,...failed,...filing].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
}
