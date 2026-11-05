import pool from '../config/database.js';

const positiveId = (value) => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
  && Number.isSafeInteger(Number(value)) && Number(value) > 0;

// Pulse is shared by participants of ordinary team conversations. Secure care
// conversations keep their separate activity log and disclosure rules.
async function assertPulseAccess(userId, threadId) {
  const [rows] = await pool.execute(
    `SELECT t.id FROM chat_threads t
     JOIN chat_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
     WHERE t.id = ? AND t.message_channel = 'internal'
       AND t.thread_type IN ('direct', 'group', 'channel', 'team', 'club') LIMIT 1`,
    [userId, threadId]
  );
  if (!rows.length) throw Object.assign(new Error('Access denied to this conversation’s Pulse'), { status: 403 });
}

export async function recordMessageViews(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    const rawIds = req.body?.messageIds;
    if (!positiveId(threadId) || !Array.isArray(rawIds) || !rawIds.length || rawIds.length > 200 || !rawIds.every(positiveId)) {
      return res.status(400).json({ error: { message: 'A thread and 1–200 valid message IDs are required' } });
    }
    await assertPulseAccess(req.user.id, threadId);
    const ids = [...new Set(rawIds.map(Number))];
    // The server supplies the viewer and timestamp. Cross-thread, hidden, and
    // outbound messages cannot become receipts through this endpoint.
    await pool.execute(
      `INSERT IGNORE INTO chat_message_views (message_id, user_id)
       SELECT m.id, ? FROM chat_messages m
       JOIN chat_threads t ON t.id = m.thread_id AND t.message_channel = 'internal'
       JOIN chat_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
       LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
       WHERE m.thread_id = ? AND m.id IN (${ids.map(() => '?').join(',')})
         AND m.sender_user_id <> ? AND d.message_id IS NULL`,
      [req.user.id, req.user.id, req.user.id, threadId, ...ids, req.user.id]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function getMessagePulse(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    const messageId = Number(req.params.messageId);
    if (!positiveId(threadId) || !positiveId(messageId)) {
      return res.status(400).json({ error: { message: 'Valid thread and message IDs are required' } });
    }
    await assertPulseAccess(req.user.id, threadId);
    const [[message]] = await pool.execute(
      `SELECT m.id, m.sender_user_id, m.created_at FROM chat_messages m
       LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
       WHERE m.id = ? AND m.thread_id = ? AND d.message_id IS NULL LIMIT 1`,
      [req.user.id, messageId, threadId]
    );
    if (!message) return res.status(404).json({ error: { message: 'Message not found' } });
    const [people] = await pool.execute(
      `SELECT p.user_id, u.first_name, u.last_name, v.first_seen_at
       FROM chat_thread_participants p JOIN users u ON u.id = p.user_id
       LEFT JOIN chat_message_views v ON v.message_id = ? AND v.user_id = p.user_id
       WHERE p.thread_id = ? AND p.user_id <> ?
       ORDER BY u.first_name, u.last_name, p.user_id`,
      [messageId, threadId, message.sender_user_id]
    );
    const [[replyCounts]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM chat_messages WHERE thread_id = ? AND parent_message_id = ?',
      [threadId, messageId]
    );
    const [reactionCounts] = await pool.execute(
      `SELECT reaction_code AS code, COUNT(*) AS count FROM chat_message_reactions
       WHERE message_id = ? GROUP BY reaction_code ORDER BY count DESC, reaction_code`,
      [messageId]
    );
    const recipients = people.map(person => ({
      userId: Number(person.user_id),
      name: [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Team member',
      firstSeenAt: person.first_seen_at || null
    }));
    const seenCount = recipients.filter(person => person.firstSeenAt).length;
    res.set('Cache-Control', 'no-store');
    res.json({
      messageId, sentAt: message.created_at,
      recipientCount: recipients.length, seenCount,
      noViewRecordedCount: recipients.length - seenCount,
      replyCount: Number(replyCounts.count),
      reactionCount: reactionCounts.reduce((sum, reaction) => sum + Number(reaction.count), 0),
      reactions: reactionCounts.map(reaction => ({ code: reaction.code, count: Number(reaction.count) })),
      recipients
    });
  } catch (error) { next(error); }
}
