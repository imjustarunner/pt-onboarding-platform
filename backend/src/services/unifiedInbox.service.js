import CommunicationConversation from '../models/CommunicationConversation.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
import pool from '../config/database.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import {
  buildConversationContext,
  syncEmailTicketsToInbox
} from './ticketEmailInboxAdapter.service.js';
import {
  syncSmsAndCallsToInbox,
  hydrateChannelMessages
} from './channelInboxAdapter.service.js';
import { computeResponseTimeMetrics } from './unifiedInboxAi.service.js';
import { sendClinicalSms, parseSmsConversationTarget } from './clinicalSmsSend.service.js';

const UNDO_WINDOW_MS = 20 * 1000;

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
  const mapped = (r) => {
    const isPersonal = r.kind === 'personal';
    return {
      id: r.id,
      kind: r.kind,
      display_name: isPersonal ? 'App inbox' : r.display_name,
      from_email: r.from_email,
      identity_key: r.identity_key,
      sender_identity_id: r.sender_identity_id,
      reply_to: r.reply_to,
      signature_image_url: r.signature_image_url,
      owner_user_id: r.owner_user_id || null,
      routing: isPersonal ? 'app_group_alias' : (r.kind === 'shared' ? 'shared_team' : null)
    };
  };
  return [
    {
      id: null,
      kind: 'virtual',
      display_name: 'All inboxes',
      from_email: null,
      identity_key: 'all_inboxes',
      routing: null
    },
    personal
      ? mapped(personal)
      : {
          id: 'my_inbox',
          kind: 'virtual',
          display_name: 'App inbox',
          from_email: null,
          identity_key: 'my_inbox',
          routing: 'app_group_alias'
        },
    { id: 'assigned', kind: 'virtual', display_name: 'All Assigned to Me', from_email: null, identity_key: 'assigned' },
    ...shared.map(mapped)
  ];
}

export async function listConversations(opts) {
  const { agencyId, syncTickets = true, channel = null } = opts;
  if (syncTickets && agencyId) {
    await syncEmailTicketsToInbox({ agencyId, limit: 80 }).catch((e) => {
      console.warn('[unifiedInbox] ticket sync failed:', e?.message || e);
    });
    const ch = String(channel || 'all');
    if (ch === 'all' || ch === 'sms' || ch === 'call' || ch === 'voicemail') {
      await syncSmsAndCallsToInbox({ agencyId, limit: 50 }).catch((e) => {
        console.warn('[unifiedInbox] sms/call sync failed:', e?.message || e);
      });
    }
  }
  return CommunicationConversation.list(opts);
}

export async function getAttentionSummary({ agencyId, userId } = {}) {
  // Do not re-sync tickets here — listConversations already syncs on load.
  const summary = await CommunicationConversation.attentionSummary({ agencyId, userId });
  const responseTime = await computeResponseTimeMetrics({ agencyId, days: 7 }).catch(() => null);
  return { ...summary, responseTime };
}

export async function getConversationDetail(conversationId, { userId, markRead = true } = {}) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) return null;
  let messages = await CommunicationConversation.listMessages(conversationId);
  const hydrated = await hydrateChannelMessages(conv);
  if (hydrated) messages = hydrated;
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
  if (patch.isSpam !== undefined) updates.isSpam = !!patch.isSpam;
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

  if (['sms', 'call', 'voicemail'].includes(String(conv.channel || ''))) {
    const isInternal = String(payload.mode || '').toLowerCase() === 'internal' || !!payload.isInternalNote;
    if (String(conv.channel) === 'sms' && !isInternal) {
      return replySmsConversation(conversationId, conv, payload, { userId });
    }
    if (!isInternal) {
      throw new Error('External reply is only available for email and SMS. Use Internal note for call/voicemail threads.');
    }
  }

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

  // Blocked sender/recipient guard (agency + personal contact blocks)
  for (const addr of [...to, ...cc, ...bcc]) {
    const blocked = await isAddressBlocked(conv.agency_id, addr.email, { ownerUserId: userId });
    if (blocked) throw new Error(`Blocked address: ${addr.email}`);
  }

  const subjectBase = payload.subject || conv.subject || '';
  let subject = subjectBase;
  if (mode === 'forward' && !/^fwd:/i.test(subject)) subject = `Fwd: ${subjectBase}`;
  else if (mode !== 'forward' && !/^re:/i.test(subject)) subject = `Re: ${subjectBase}`;

  const scheduleAt = resolveScheduleAt(payload);
  const useDelayUndo = !scheduleAt && payload.skipUndo !== true;

  if (scheduleAt || useDelayUndo) {
    const when = scheduleAt || new Date(Date.now() + UNDO_WINDOW_MS);
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
      inReplyTo: lastInbound?.internet_message_id || null,
      sendStatus: 'scheduled',
      scheduledSendAt: when,
      sentAt: null
    });
    const nextStatus = payload.setStatus || 'waiting_on_them';
    await CommunicationConversation.update(conversationId, { status: nextStatus });
    return {
      messageId: msgId,
      sent: false,
      scheduled: true,
      scheduledSendAt: when,
      undoExpiresAt: useDelayUndo ? when : null
    };
  }

  const sendResult = await deliverOutboundEmail({
    conv,
    inbox,
    senderIdentityId,
    userId,
    to,
    cc,
    bcc,
    subject,
    text: payload.text,
    html: payload.html,
    attachments: payload.attachments,
    inReplyTo: lastInbound?.internet_message_id || null
  });

  const undoExpiresAt = new Date(Date.now() + UNDO_WINDOW_MS);
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
    sendStatus: 'sent',
    undoExpiresAt,
    sentAt: new Date()
  });

  const nextStatus = payload.setStatus || 'waiting_on_them';
  await CommunicationConversation.update(conversationId, { status: nextStatus });

  return { messageId: msgId, sent: true, provider: sendResult, undoExpiresAt };
}

function resolveScheduleAt(payload) {
  if (payload.scheduledSendAt) {
    const d = new Date(payload.scheduledSendAt);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() + 5000) return d;
  }
  const preset = String(payload.schedulePreset || '').toLowerCase();
  if (!preset) return null;
  const d = new Date();
  if (preset === 'in_1_hour') {
    d.setHours(d.getHours() + 1);
    return d;
  }
  if (preset === 'tomorrow_9am') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (preset === 'monday_9am') {
    const day = d.getDay();
    const add = day === 1 ? 7 : (8 - day) % 7 || 7;
    d.setDate(d.getDate() + add);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return null;
}

async function deliverOutboundEmail({
  conv,
  inbox,
  senderIdentityId,
  userId,
  to,
  cc,
  bcc,
  subject,
  text,
  html,
  attachments,
  inReplyTo
}) {
  return sendEmailFromIdentity({
    senderIdentityId,
    to: to.map((t) => t.email).join(', '),
    cc: cc.length ? cc.map((c) => c.email).join(', ') : null,
    subject,
    text: text || null,
    html: html || null,
    attachments: attachments || null,
    inReplyTo: inReplyTo || null,
    references: inReplyTo || null,
    threadId: conv.external_thread_id || null,
    source: 'manual',
    generatedByUserId: userId,
    userId: null,
    clientId: null
  });
}

export async function undoOutboundMessage(conversationId, messageId, { userId } = {}) {
  const msg = await CommunicationConversation.findMessageById(messageId);
  if (!msg || Number(msg.conversation_id) !== Number(conversationId)) {
    throw new Error('Message not found');
  }
  if (msg.direction !== 'outbound' || msg.is_internal_note) {
    throw new Error('Only outbound messages can be undone');
  }
  if (msg.send_status === 'scheduled') {
    await CommunicationConversation.updateMessage(messageId, { sendStatus: 'cancelled' });
    return { cancelled: true, scheduled: true };
  }
  if (msg.send_status === 'sent') {
    // Already delivered — cannot recall from remote mailbox; reject if past window.
    throw new Error('Message already sent. Use Undo within the delay window before delivery.');
  }
  throw new Error('Message cannot be undone');
}

export async function processScheduledOutboundSends({ limit = 40 } = {}) {
  const due = await CommunicationConversation.listDueScheduledMessages({ limit });
  let sent = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const conv = await CommunicationConversation.findById(row.conversation_id);
      const inbox = conv?.inbox_id ? await CommunicationInbox.findById(conv.inbox_id) : null;
      if (!inbox?.sender_identity_id) {
        await CommunicationConversation.updateMessage(row.id, { sendStatus: 'failed' });
        failed += 1;
        continue;
      }
      const to = typeof row.to_json === 'string' ? JSON.parse(row.to_json || '[]') : row.to_json || [];
      const cc = typeof row.cc_json === 'string' ? JSON.parse(row.cc_json || '[]') : row.cc_json || [];
      const bcc = typeof row.bcc_json === 'string' ? JSON.parse(row.bcc_json || '[]') : row.bcc_json || [];
      const sendResult = await deliverOutboundEmail({
        conv,
        inbox,
        senderIdentityId: inbox.sender_identity_id,
        userId: row.author_user_id,
        to,
        cc,
        bcc,
        subject: row.subject,
        text: row.body_text,
        html: row.body_html,
        attachments: null,
        inReplyTo: row.in_reply_to
      });
      await CommunicationConversation.updateMessage(row.id, {
        sendStatus: 'sent',
        sentAt: new Date(),
        scheduledSendAt: null,
        undoExpiresAt: null,
        internetMessageId: sendResult?.id || null
      });
      sent += 1;
    } catch (e) {
      console.warn('[unifiedInbox] scheduled send failed:', e?.message || e);
      await CommunicationConversation.updateMessage(row.id, { sendStatus: 'failed' }).catch(() => {});
      failed += 1;
    }
  }
  return { processed: due.length, sent, failed };
}

export async function markConversationSpam(conversationId, { userId, blockSender = true } = {}) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const participants = await CommunicationConversation.listParticipants(conversationId);
  const primary = participants.find((p) => p.is_primary) || participants[0];
  if (blockSender && primary?.email && conv.agency_id) {
    await blockAddress({
      agencyId: conv.agency_id,
      address: primary.email,
      addressKind: 'email',
      reason: `Spam from conversation #${conversationId}`,
      createdByUserId: userId
    });
  }
  return CommunicationConversation.update(conversationId, {
    isSpam: true,
    archivedAt: new Date(),
    status: 'resolved'
  });
}

export async function blockAddress({ agencyId, address, addressKind = 'email', reason, createdByUserId } = {}) {
  const addr = String(address || '').trim().toLowerCase();
  if (!agencyId || !addr) throw new Error('agencyId and address are required');
  await pool.execute(
    `INSERT INTO communication_blocked_addresses
     (agency_id, address, address_kind, reason, created_by_user_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reason = COALESCE(VALUES(reason), reason)`,
    [agencyId, addr, addressKind === 'phone' ? 'phone' : 'email', reason || null, createdByUserId || null]
  );
  return { ok: true, address: addr };
}

export async function isAddressBlocked(agencyId, address, { ownerUserId = null } = {}) {
  if (!agencyId || !address) return false;
  const email = String(address).trim().toLowerCase();
  const [rows] = await pool.execute(
    `SELECT id FROM communication_blocked_addresses
     WHERE agency_id = ? AND address_kind = 'email' AND address = ?
     LIMIT 1`,
    [agencyId, email]
  ).catch(() => [[]]);
  if (rows && rows[0]) return true;
  if (ownerUserId) {
    try {
      const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
      const blocked = await UserCommunicationContact.isBlocked({
        ownerUserId,
        agencyId,
        email
      });
      if (blocked) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export async function exportConversation(conversationId, { format = 'html' } = {}) {
  const detail = await getConversationDetail(conversationId, { markRead: false });
  if (!detail) throw new Error('Conversation not found');
  const { conversation: conv, messages } = detail;
  const title = conv.subject || `Conversation #${conv.id}`;
  if (format === 'txt') {
    const lines = [
      title,
      `Channel: ${conv.channel}`,
      `Status: ${conv.status}`,
      ''
    ];
    for (const m of messages || []) {
      const when = m.sent_at || m.created_at || '';
      const who = m.from?.name || m.from?.email || (m.is_internal_note ? 'Internal' : m.direction);
      lines.push(`--- ${when} · ${who} ---`);
      lines.push(m.body_text || String(m.body_html || '').replace(/<[^>]+>/g, ' '));
      lines.push('');
    }
    return { contentType: 'text/plain; charset=utf-8', filename: `conversation-${conv.id}.txt`, body: lines.join('\n') };
  }

  const parts = (messages || [])
    .map((m) => {
      const when = m.sent_at || m.created_at || '';
      const who = m.from?.name || m.from?.email || (m.is_internal_note ? 'Internal note' : m.direction);
      const body = m.body_html || `<pre>${escapeHtml(m.body_text || '')}</pre>`;
      return `<section style="margin:16px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px">
        <header style="font-size:12px;color:#64748b;margin-bottom:8px"><strong>${escapeHtml(who)}</strong> · ${escapeHtml(String(when))}</header>
        <div>${body}</div>
      </section>`;
    })
    .join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:24px auto;color:#0f172a}</style>
    </head><body>
    <h1>${escapeHtml(title)}</h1>
    <p style="color:#64748b">Channel: ${escapeHtml(conv.channel || '')} · Status: ${escapeHtml(conv.status || '')}</p>
    ${parts}
    <script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
    </body></html>`;
  return { contentType: 'text/html; charset=utf-8', filename: `conversation-${conv.id}.html`, body: html };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  for (const addr of [...to, ...cc, ...bcc]) {
    const blocked = await isAddressBlocked(agencyId, addr.email, { ownerUserId: userId });
    if (blocked) throw new Error(`Blocked address: ${addr.email}`);
  }

  // Auto-save outbound recipients as safe contacts for this user
  try {
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    for (const addr of to) {
      await UserCommunicationContact.upsertSafe({
        agencyId,
        ownerUserId: userId,
        email: addr.email,
        displayName: addr.name || null,
        source: 'outbound'
      });
    }
  } catch (e) {
    console.warn('[unifiedInbox] contact upsert failed:', e?.message || e);
  }

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

  const scheduleAt = resolveScheduleAt(payload);
  if (scheduleAt || payload.skipUndo !== true) {
    const when = scheduleAt || new Date(Date.now() + UNDO_WINDOW_MS);
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
      sendStatus: 'scheduled',
      scheduledSendAt: when,
      sentAt: null
    });
    return conv;
  }

  const sendResult = await sendEmailFromIdentity({
    senderIdentityId: inbox.sender_identity_id,
    to: to.map((t) => t.email).join(', '),
    cc: cc.length ? cc.map((c) => c.email).join(', ') : null,
    bcc: bcc.length ? bcc.map((c) => c.email).join(', ') : null,
    subject,
    text: payload.text || null,
    html: payload.html || null,
    attachments: payload.attachments || null,
    replyToOverride: payload.replyTo || null,
    fromDisplayNameOverride: payload.fromDisplayName || null,
    source: 'manual',
    generatedByUserId: userId,
    clientId: payload.clientId || null,
    templateType: payload.templateType || 'hub_email'
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

async function replySmsConversation(conversationId, conv, payload, { userId } = {}) {
  const text = String(payload.text || '').trim();
  if (!text) throw new Error('Message text is required');

  let { clientId, contactId } = parseSmsConversationTarget(conv);
  if (!clientId && !contactId) {
    const links = await CommunicationConversation.listLinks(conversationId);
    const clientLink = links.find((l) => l.entity_type === 'client');
    if (clientLink) clientId = Number(clientLink.entity_id);
  }
  if (!clientId && !contactId) {
    throw new Error('Cannot determine SMS recipient for this conversation');
  }

  const result = await sendClinicalSms({
    userId,
    clientId,
    contactId,
    body: text,
    numberId: payload.numberId
  });

  const preview = previewText(text);
  await CommunicationConversation.update(conversationId, {
    lastMessageAt: new Date(),
    lastMessagePreview: preview,
    status: payload.setStatus || 'waiting_on_them'
  });

  if (conv.agency_id) {
    await syncSmsAndCallsToInbox({ agencyId: conv.agency_id, limit: 5 }).catch(() => {});
  }

  return {
    sent: true,
    channel: 'sms',
    messageLogId: result.messageLog?.id || null,
    clientId: result.clientId,
    contactId: result.contactId
  };
}
