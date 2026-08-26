import CommunicationConversation from '../models/CommunicationConversation.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import {
  buildConversationContext,
  syncEmailTicketsToInbox
} from './ticketEmailInboxAdapter.service.js';

function snoozeUntilPreset(preset) {
  const d = new Date();
  const p = String(preset || '').toLowerCase();
  if (p === 'later_today') {
    d.setHours(d.getHours() + 3);
    return d;
  }
  if (p === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (p === 'next_week') {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return null;
}

export async function listInboxes({ agencyId, userId }) {
  await CommunicationInbox.ensureFromSenderIdentities(agencyId);
  const rows = await CommunicationInbox.listForAgency({ agencyId, userId });
  const personal = rows.find((r) => r.kind === 'personal' && Number(r.owner_user_id) === Number(userId));
  const shared = rows.filter((r) => r.kind === 'shared');
  const mapped = (r) => ({
    id: r.id,
    kind: r.kind,
    display_name: r.kind === 'personal' ? 'My Inbox' : r.display_name,
    from_email: r.from_email,
    identity_key: r.identity_key,
    sender_identity_id: r.sender_identity_id,
    reply_to: r.reply_to,
    signature_image_url: r.signature_image_url,
    owner_user_id: r.owner_user_id || null
  });
  return [
    personal
      ? mapped(personal)
      : { id: null, kind: 'virtual', display_name: 'My Inbox', from_email: null, identity_key: 'my_inbox' },
    { id: 'assigned', kind: 'virtual', display_name: 'All Assigned to Me', from_email: null, identity_key: 'assigned' },
    ...shared.map(mapped)
  ];
}

export async function listConversations(opts) {
  const { agencyId, syncTickets = true } = opts;
  if (syncTickets && agencyId) {
    await syncEmailTicketsToInbox({ agencyId, limit: 80 }).catch((e) => {
      console.warn('[unifiedInbox] ticket sync failed:', e?.message || e);
    });
  }
  return CommunicationConversation.list(opts);
}

export async function getAttentionSummary({ agencyId, userId }) {
  // Do not re-sync tickets here — listConversations already syncs on load.
  return CommunicationConversation.attentionSummary({ agencyId, userId });
}

export async function getConversationDetail(conversationId, { userId, markRead = true } = {}) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) return null;
  const messages = await CommunicationConversation.listMessages(conversationId);
  const context = await buildConversationContext(conv);
  if (markRead && userId) {
    await CommunicationConversation.markRead(conversationId, userId);
  }
  return { conversation: conv, messages, context };
}

export async function updateConversation(conversationId, patch, { userId } = {}) {
  const updates = {};
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.ownerUserId !== undefined) updates.ownerUserId = patch.ownerUserId;
  if (patch.dueAt !== undefined) updates.dueAt = patch.dueAt;
  if (patch.starred !== undefined) updates.starred = !!patch.starred;
  if (patch.archive === true) updates.archivedAt = new Date();
  if (patch.archive === false) updates.archivedAt = null;
  if (patch.snoozePreset) {
    const until = snoozeUntilPreset(patch.snoozePreset);
    if (until) updates.snoozedUntil = until;
  }
  if (patch.snoozedUntil !== undefined) updates.snoozedUntil = patch.snoozedUntil;
  if (patch.clearSnooze) updates.snoozedUntil = null;
  if (patch.draftBody !== undefined) {
    updates.draftBody = patch.draftBody;
    updates.draftUpdatedAt = new Date();
  }
  if (patch.markUnread && userId) {
    await CommunicationConversation.markUnread(conversationId, userId);
  }
  if (patch.markRead && userId) {
    await CommunicationConversation.markRead(conversationId, userId);
  }
  return CommunicationConversation.update(conversationId, updates);
}

function normalizeAddressList(list) {
  if (!list) return [];
  if (typeof list === 'string') {
    return list
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return { email: item.trim() };
      if (item?.email) return { email: String(item.email).trim(), name: item.name || null };
      return null;
    })
    .filter((x) => x?.email);
}

export async function replyToConversation(conversationId, payload, { userId } = {}) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');

  const mode = String(payload.mode || 'reply').toLowerCase(); // reply | reply_all | forward | internal
  const isInternal = mode === 'internal' || !!payload.isInternalNote;

  if (isInternal) {
    const msgId = await CommunicationConversation.addMessage({
      conversationId,
      channel: conv.channel || 'email',
      direction: 'internal',
      authorUserId: userId,
      bodyText: payload.text || '',
      bodyHtml: payload.html || null,
      isInternalNote: true,
      sentAt: new Date()
    });
    if (payload.setStatus) {
      await CommunicationConversation.update(conversationId, { status: payload.setStatus });
    }
    return { messageId: msgId, sent: false, internal: true };
  }

  const inbox = conv.inbox_id ? await CommunicationInbox.findById(conv.inbox_id) : null;
  const senderIdentityId = inbox?.sender_identity_id;
  if (!senderIdentityId) {
    throw new Error('No sender identity configured for this inbox. Select a shared inbox with a From address.');
  }

  const participants = await CommunicationConversation.listParticipants(conversationId);
  const primary = participants.find((p) => p.is_primary) || participants[0];
  const messages = await CommunicationConversation.listMessages(conversationId);
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound' && !m.is_internal_note);

  let to = normalizeAddressList(payload.to);
  let cc = normalizeAddressList(payload.cc);
  const bcc = normalizeAddressList(payload.bcc);

  if (!to.length && mode !== 'forward' && primary?.email) {
    to = [{ email: primary.email, name: primary.display_name }];
  }
  if (mode === 'reply_all' && lastInbound) {
    const extra = [
      ...(Array.isArray(lastInbound.to) ? lastInbound.to : []),
      ...(Array.isArray(lastInbound.cc) ? lastInbound.cc : [])
    ];
    const seen = new Set(to.map((t) => t.email.toLowerCase()));
    const inboxEmail = String(inbox.from_email || '').toLowerCase();
    for (const a of extra) {
      const email = String(a?.email || a || '').toLowerCase();
      if (!email || email === inboxEmail || seen.has(email)) continue;
      seen.add(email);
      cc.push({ email, name: a?.name || null });
    }
  }

  if (!to.length) throw new Error('Recipient (To) is required');

  const subjectBase = payload.subject || conv.subject || '';
  let subject = subjectBase;
  if (mode === 'forward' && !/^fwd:/i.test(subject)) subject = `Fwd: ${subjectBase}`;
  else if (mode !== 'forward' && !/^re:/i.test(subject)) subject = `Re: ${subjectBase}`;

  const sendResult = await sendEmailFromIdentity({
    senderIdentityId,
    to: to.map((t) => t.email).join(', '),
    cc: cc.length ? cc.map((c) => c.email).join(', ') : null,
    subject,
    text: payload.text || null,
    html: payload.html || null,
    attachments: payload.attachments || null,
    inReplyTo: lastInbound?.internet_message_id || null,
    references: lastInbound?.internet_message_id || null,
    threadId: conv.external_thread_id || null,
    source: 'manual',
    generatedByUserId: userId,
    userId: null,
    clientId: null
  });

  const msgId = await CommunicationConversation.addMessage({
    conversationId,
    channel: 'email',
    direction: 'outbound',
    authorUserId: userId,
    from: { email: inbox.from_email, name: inbox.display_name },
    to,
    cc,
    bcc,
    subject,
    bodyText: payload.text || '',
    bodyHtml: payload.html || null,
    internetMessageId: sendResult?.id || null,
    inReplyTo: lastInbound?.internet_message_id || null,
    sentAt: new Date()
  });

  const nextStatus = payload.setStatus || 'waiting_on_them';
  await CommunicationConversation.update(conversationId, { status: nextStatus });

  return { messageId: msgId, sent: true, provider: sendResult };
}

export async function composeNewEmail({ agencyId, inboxId, userId, payload }) {
  const inbox = inboxId ? await CommunicationInbox.findById(inboxId) : null;
  if (!inbox?.sender_identity_id) {
    throw new Error('Select an inbox with a configured From address');
  }
  const to = normalizeAddressList(payload.to);
  if (!to.length) throw new Error('Recipient (To) is required');
  const cc = normalizeAddressList(payload.cc);
  const bcc = normalizeAddressList(payload.bcc);
  const subject = payload.subject || '(no subject)';

  const conv = await CommunicationConversation.create({
    agencyId,
    inboxId: inbox.id,
    channel: 'email',
    subject,
    status: 'waiting_on_them',
    ownerUserId: userId,
    lastMessageAt: new Date(),
    lastMessagePreview: previewText(payload.text || payload.html)
  });

  await CommunicationConversation.upsertParticipant(conv.id, {
    kind: 'email',
    email: to[0].email,
    displayName: to[0].name || to[0].email,
    isPrimary: true
  });

  const sendResult = await sendEmailFromIdentity({
    senderIdentityId: inbox.sender_identity_id,
    to: to.map((t) => t.email).join(', '),
    cc: cc.length ? cc.map((c) => c.email).join(', ') : null,
    subject,
    text: payload.text || null,
    html: payload.html || null,
    attachments: payload.attachments || null,
    source: 'manual',
    generatedByUserId: userId
  });

  await CommunicationConversation.addMessage({
    conversationId: conv.id,
    channel: 'email',
    direction: 'outbound',
    authorUserId: userId,
    from: { email: inbox.from_email, name: inbox.display_name },
    to,
    cc,
    bcc,
    subject,
    bodyText: payload.text || '',
    bodyHtml: payload.html || null,
    internetMessageId: sendResult?.id || null,
    sentAt: new Date()
  });

  return conv;
}

function previewText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || null;
}
