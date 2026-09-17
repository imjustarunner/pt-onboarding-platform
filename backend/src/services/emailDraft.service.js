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
export async function listEmailDrafts(actor, agencyId) {
  await agencyAccess(actor,agencyId);
  // Never return attachments in a list response.
  const [rows] = await pool.execute(`SELECT id,agency_id,conversation_id,mode,version,state,updated_at,
    JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.subject')) AS subject,
    JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.to')) AS recipient,
    LEFT(JSON_UNQUOTE(JSON_EXTRACT(draft_json,'$.text')),400) AS preview
    FROM communication_email_drafts WHERE user_id=? AND agency_id=? AND state IN ('editing','sending') ORDER BY updated_at DESC LIMIT 200`, [actor.id,agencyId]);
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
  const id = randomUUID(); const data = validateEmailDraft(input.draft);
  await pool.execute(`INSERT INTO communication_email_drafts(id,user_id,agency_id,conversation_id,mode,draft_json) VALUES(?,?,?,?,?,?)`,[id,actor.id,agencyId,cid,mode,JSON.stringify(data)]);
  return getEmailDraft(actor,id);
}
export async function saveEmailDraft(actor,id,input) {
  const draft = await getEmailDraft(actor,id);
  if (draft.state !== 'editing') throw fail('This draft has already been submitted',409);
  const data = validateEmailDraft(input.draft);
  const [result] = await pool.execute(`UPDATE communication_email_drafts SET draft_json=?,version=version+1 WHERE id=? AND user_id=? AND version=? AND state='editing'`,[JSON.stringify(data),id,actor.id,Number(input.version)||0]);
  if (!result.affectedRows) throw fail('This draft changed in another window. Reopen it before editing.',409);
  return { version: draft.version + 1 };
}
export async function deleteEmailDraft(actor,id) {
  const draft = await getEmailDraft(actor,id);
  if (draft.state !== 'editing') throw fail('Submitted email cannot be discarded as a draft',409);
  await pool.execute("DELETE FROM communication_email_drafts WHERE id=? AND user_id=? AND state='editing'",[id,actor.id]);
}
export async function sendEmailDraft(actor,id,version) {
  const draft = await getEmailDraft(actor,id);
  if (draft.state === 'sent') return draft.result;
  if (draft.state !== 'editing') throw fail('Submission is awaiting confirmation. Check the conversation before sending another copy.',409);
  if (!draft.draft.to.trim() || (!draft.draft.text.trim() && !draft.draft.attachments.length && draft.mode !== 'forward')) throw fail('Add a recipient and a message or attachment');
  const recipients = [draft.draft.to,draft.draft.cc,draft.draft.bcc].flatMap(value => String(value || '').split(/[,;]/).map(s=>s.trim()).filter(Boolean));
  if (recipients.some(email=>! /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))) throw fail('Use complete email addresses separated by commas');
  const [claim] = await pool.execute("UPDATE communication_email_drafts SET state='sending' WHERE id=? AND user_id=? AND version=? AND state='editing'",[id,actor.id,Number(version)||0]);
  if (!claim.affectedRows) throw fail('This draft is already being submitted or changed in another window',409);
  const payload = { ...draft.draft, text: [draft.draft.text,draft.draft.quotedText].filter(Boolean).join('\n\n'), mode:draft.mode, undoDelaySeconds:20 };
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
