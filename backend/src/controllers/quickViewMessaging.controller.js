import { requireConversationAccess } from '../services/communicationAccess.service.js';
import Conversation from '../models/CommunicationConversation.model.js';
import { getConversationDetail, replyToConversation, composeNewEmail, undoOutboundMessage } from '../services/unifiedInbox.service.js';
import { findPersonalInbox, ensurePersonalMailbox } from '../services/personalMailbox.service.js';
import { downloadCommunicationAttachment } from '../services/communicationAttachments.service.js';
import { listMessageReactions, reactToHubMessage } from '../services/hubMessageReactions.service.js';

async function authorize(req) {
  // QV is an employee's own workspace; an admin's PIN never opens all agency mail.
  return requireConversationAccess({ id: req.quickView.userId, role: 'provider' }, req.params.id);
}
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getQuickConversation = handle(async (req, res) => {
  await authorize(req);
  const beforeId = req.query.beforeId == null ? null : Number(req.query.beforeId);
  if (beforeId != null && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) throw Object.assign(new Error('Invalid history cursor'), { status: 400 });
  const detail = await getConversationDetail(req.params.id, { userId: req.quickView.userId, markRead: !beforeId });
  if (beforeId) detail.messages = await Conversation.listMessages(req.params.id, { beforeId });
  const reactions = await listMessageReactions(detail.messages.map((m) => Number(m.id)).filter(Number.isSafeInteger), req.quickView.userId);
  detail.messages = detail.messages.map((m) => ({ ...m, reactions: reactions.get(Number(m.id)) || [] }));
  res.json({ ok: true, conversation: detail.conversation, messages: detail.messages, nextBeforeId: detail.conversation.channel === 'email' && detail.messages.length === 200 ? Math.min(...detail.messages.map((m) => Number(m.id))) : null });
});

export const postQuickReply = handle(async (req, res) => {
  const conv = await authorize(req);
  const mode = req.body?.mode || 'reply';
  if (!['reply', 'reply_all', 'forward'].includes(mode)) throw Object.assign(new Error('Invalid reply action'), { status: 400 });
  if (!String(req.body?.text || '').trim() && !req.body?.attachments?.length) throw Object.assign(new Error('Reply text or attachments required'), { status: 400 });
  if (!['email', 'sms'].includes(conv.channel)) throw Object.assign(new Error('This conversation is read-only'), { status: 400 });
  const result = await replyToConversation(conv.id, {
    text: String(req.body.text || ''), mode, to: req.body.to, cc: req.body.cc, bcc: req.body.bcc,
    subject: req.body.subject, attachments: req.body.attachments,
    undoDelaySeconds: 20
  }, { userId: req.quickView.userId });
  res.json({ ok: true, ...result });
});

export const postQuickCompose = handle(async (req, res) => {
  const userId = req.quickView.userId;
  const agencyId = req.quickView.agencyId;
  const inbox = await findPersonalInbox({ agencyId, userId }) || await ensurePersonalMailbox({ agencyId, userId });
  if (!inbox?.id) throw Object.assign(new Error('Your work mailbox is not configured'), { status: 400 });
  if (!String(req.body?.to || '').trim() || (!String(req.body?.text || '').trim() && !req.body?.attachments?.length)) throw Object.assign(new Error('Recipient and message text or attachment are required'), { status: 400 });
  const conversation = await composeNewEmail({ agencyId, inboxId: inbox.id, userId, payload: {
    to: req.body.to, cc: req.body.cc, bcc: req.body.bcc, subject: req.body.subject,
    text: req.body.text, attachments: req.body.attachments, undoDelaySeconds: 20
  } });
  res.json({ ok: true, conversation });
});

export const getQuickAttachment = handle(async (req, res, next) => {
  await authorize(req);
  await downloadCommunicationAttachment(req, res, next);
});
export const postQuickReaction = handle(async (req, res) => {
  const conv = await authorize(req);
  res.json(await reactToHubMessage({ agencyId: conv.agency_id, userId: req.quickView.userId, conversationId: conv.id, messageId: req.params.messageId, active: req.body.active !== false, emoji: '❤️', notifyEmail: false }));
});
export const postQuickUndo = handle(async (req, res) => {
  await authorize(req);
  res.json(await undoOutboundMessage(req.params.id, req.params.messageId, { userId: req.quickView.userId }));
});
