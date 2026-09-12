export function emailThreadKey(message) {
  const id = Number(message?.meta?.conversationId);
  // Missing IDs must not collapse unrelated legacy messages into one subject bucket.
  return id > 0 ? `email:${id}` : `email-message:${message.id}`;
}

export function groupEmailThreads(messages = []) {
  const groups = new Map();
  for (const msg of messages) {
    if (msg.channel !== 'email') continue;
    const key = emailThreadKey(msg);
    if (!groups.has(key)) groups.set(key, {
      key, conversationId: Number(msg.meta?.conversationId) || null,
      subject: String(msg.meta?.subject || '').trim() || '(No subject)', messages: []
    });
    groups.get(key).messages.push(msg);
  }
  const time = (m) => new Date(m?.createdAt || 0).getTime();
  return [...groups.values()].map((t) => ({
    ...t, messages: t.messages.sort((a, b) => time(a) - time(b))
  })).sort((a, b) => time(b.messages.at(-1)) - time(a.messages.at(-1)));
}

export function emailComposeTarget({ mode, activeThread }) {
  if (mode === 'new') return { mode: 'new' };
  const conversationId = Number(activeThread?.conversationId);
  if (!conversationId) throw new Error('Open a conversation to reply, or start a new email.');
  return { mode, conversationId };
}

export function groupSecureTopics(messages = []) {
  const groups = new Map();
  for (const msg of messages) {
    if (msg.channel !== 'secure') continue;
    const topicId = msg.meta?.topicId;
    const rootId = msg.meta?.legacyRootMessageId || msg.meta?.messageId;
    const key = topicId ? `topic:${topicId}` : `legacy:${msg.meta?.threadId}:${rootId || msg.id}`;
    if (!groups.has(key)) groups.set(key, { key, topicId, legacyRootMessageId: topicId ? null : rootId, threadId: msg.meta?.threadId, subject: msg.meta?.subject || msg.subject || '(No subject)', messages: [] });
    groups.get(key).messages.push(msg);
  }
  return [...groups.values()].map((t) => ({ ...t, messages: t.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }))
    .sort((a, b) => new Date(b.messages.at(-1).createdAt) - new Date(a.messages.at(-1).createdAt));
}

export function emailReplyRecipients(messages = [], { mode = 'reply', inboxEmail = '', fallbackEmail = '' } = {}) {
  if (mode === 'forward' || mode === 'new') return { to: [], cc: [] };
  const sent = messages.filter((m) => !m.is_internal_note && (m.send_status || m.meta?.sendStatus || 'sent') === 'sent');
  const parent = [...sent].reverse().find((m) => m.direction === 'inbound') || sent.at(-1);
  const seen = new Set([String(inboxEmail).toLowerCase()]);
  const unique = (list) => (list || []).flatMap((a) => {
    const email = String(a?.email || a || '').trim().toLowerCase();
    if (!email || seen.has(email)) return [];
    seen.add(email);
    return [email];
  });
  const to = unique(parent?.direction === 'inbound' ? [parent.from] : parent?.to);
  if (!to.length) to.push(...unique([fallbackEmail]));
  return { to, cc: mode === 'reply_all' ? unique([...(parent?.to || []), ...(parent?.cc || [])]) : [] };
}
