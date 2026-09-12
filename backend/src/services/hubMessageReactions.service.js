import pool from '../config/database.js';

export async function listMessageReactions(messageIds, userId) {
  const map = new Map();
  if (!messageIds.length) return map;
  const [rows] = await pool.execute(
    `SELECT message_id, emoji, COUNT(*) AS count, MAX(user_id = ?) AS reacted_by_me
     FROM communication_message_reactions
     WHERE message_id IN (${messageIds.map(() => '?').join(',')})
     GROUP BY message_id, emoji`, [userId, ...messageIds]
  );
  for (const r of rows || []) {
    const id = Number(r.message_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push({ emoji: r.emoji, count: Number(r.count), reactedByMe: !!Number(r.reacted_by_me) });
  }
  return map;
}

export async function reactToHubMessage({
  agencyId,
  userId,
  conversationId,
  messageId = null,
  emoji = '❤️',
  notifyEmail = true,
  active = true
}) {
  const cid = Number(conversationId);
  if (!cid) {
    const err = new Error('conversationId is required');
    err.status = 400;
    throw err;
  }
  const mid = Number(messageId);
  if (!mid || !Number.isInteger(mid)) {
    throw Object.assign(new Error('messageId is required'), { status: 400 });
  }
  // Validate the exact message and conversation before writing a reaction.
  const [msgRows] = await pool.execute(
    `SELECT m.*, c.agency_id, c.subject, c.snoozed_until
     FROM communication_messages m
     JOIN communication_conversations c ON c.id = m.conversation_id
     LEFT JOIN communication_inboxes i ON i.id = c.inbox_id
     WHERE m.id = ? AND m.conversation_id = ? AND c.agency_id = ?
       AND COALESCE(m.send_status, 'sent') = 'sent'
       AND COALESCE(m.is_internal_note, 0) = 0
       AND (c.owner_user_id = ? OR m.author_user_id = ?
         OR (i.kind = 'personal' AND i.owner_user_id = ?))
     LIMIT 1`,
    [mid, cid, agencyId, userId, userId, userId]
  );
  const msg = msgRows?.[0];
  if (!msg) throw Object.assign(new Error('Message not found'), { status: 404 });
  const emojiSafe = String(emoji || '❤️').slice(0, 32);
  const [result] = active
    ? await pool.execute(
      `INSERT IGNORE INTO communication_message_reactions (message_id, conversation_id, user_id, emoji)
       VALUES (?, ?, ?, ?)`, [mid, cid, userId, emojiSafe])
    : await pool.execute(
      `DELETE FROM communication_message_reactions WHERE message_id = ? AND conversation_id = ? AND user_id = ? AND emoji = ?`,
      [mid, cid, userId, emojiSafe]);
  const response = async () => ({
    ok: true, messageId: mid, conversationId: cid, emoji: emojiSafe, active,
    reactions: (await listMessageReactions([mid], userId)).get(mid) || []
  });
  // Retries and removing a like must not send another email.
  if (!active || !result?.affectedRows || !notifyEmail) return response();

  const aid = Number(msg.agency_id || agencyId);
  const [reactorRows] = await pool.execute(
    `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const reactorName =
    [reactorRows?.[0]?.first_name, reactorRows?.[0]?.last_name].filter(Boolean).join(' ') || 'Someone';

  // Skip notify while conversation is actively snoozed / availability-held.
  let activelySnoozed = false;
  try {
    const [snoozeRows] = await pool.execute(
      `SELECT snoozed_until FROM communication_conversations WHERE id = ? LIMIT 1`,
      [cid]
    );
    const until = snoozeRows?.[0]?.snoozed_until ? new Date(snoozeRows[0].snoozed_until) : null;
    activelySnoozed = !!(until && until.getTime() > Date.now());
  } catch {
    activelySnoozed = false;
  }

  // Email ping is the primary notify channel for reactions (in-app table types are constrained).
  if (notifyEmail && !activelySnoozed && msg.direction === 'inbound') {
    try {
      const { ensureTenantMessageMailboxes } = await import('./tenantMessageMailboxes.service.js');
      const { buildLikedMessageEmailHtml } = await import('./hubBrandedEmail.service.js');
      const mailboxes = await ensureTenantMessageMailboxes(aid);
      let from = msg.from_json;
      if (typeof from === 'string') {
        try { from = JSON.parse(from); } catch { from = null; }
      }
      const toEmail = String(from?.email || '').trim();
      if (toEmail && mailboxes.messages?.id) {
        const [agencyRows] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [aid]);
        const agencyName = agencyRows?.[0]?.name || 'Your care team';
        const html = buildLikedMessageEmailHtml({
          agencyName,
          actorName: reactorName,
          preview: msg.body_text || msg.subject || '',
          appUrl: process.env.APP_PUBLIC_URL ? `${process.env.APP_PUBLIC_URL}/messages` : null
        });
        const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
        await sendEmailFromIdentity({
          senderIdentityId: mailboxes.messages.id,
          to: toEmail,
          subject: `${reactorName} liked your message`,
          html,
          text: `${reactorName} liked your message (${emojiSafe}). Open Messages in the app to reply.`,
          replyToOverride: mailboxes.messages.from_email,
          source: 'auto',
          generatedByUserId: userId,
          templateType: 'hub_message_reaction',
          clientId: msg.client_id || null
        });
      }
    } catch (e) {
      console.warn('[reactToHubMessage] email ping:', e?.message || e);
    }
  }

  return response();
}
