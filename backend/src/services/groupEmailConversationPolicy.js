const safeIds = (values) => [...new Set((values || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];

/** SQL uses the inbox (i), conversation (c), and canonical ticket (t) aliases. */
export function groupEmailConversationSql({ groupInboxIds = [], allowedGroupInboxIds = [] } = {}) {
  const ids = safeIds(groupInboxIds), allowed = safeIds(allowedGroupInboxIds).filter((id) => ids.includes(id));
  const isGroup = ids.length ? `COALESCE(c.inbox_id,0) IN (${ids.join(',')})` : '0=1';
  const allowedGroup = allowed.length ? `COALESCE(c.inbox_id,0) IN (${allowed.join(',')})` : '0=1';
  const unclaimed = `(${isGroup} AND t.id IS NOT NULL AND t.claimed_by_user_id IS NULL AND t.status NOT IN ('closed','resolved','done'))`;
  const unread = `(${unclaimed} AND t.status NOT IN ('answered','waiting','pending_external')
    AND COALESCE((SELECT group_reply.direction FROM support_ticket_email_messages group_reply
      WHERE group_reply.ticket_id=t.id AND (group_reply.direction='inbound' OR group_reply.send_status='sent')
      ORDER BY COALESCE(group_reply.sent_at,group_reply.created_at) DESC,group_reply.id DESC LIMIT 1),'inbound')='inbound')`;
  const ticketedGroup = `(${isGroup} AND t.id IS NOT NULL)`;
  return { isGroup, ticketedGroup, allowedGroup, unclaimed, unread,
    access: `(NOT (${isGroup}) OR (${allowedGroup}))`,
    personalScopeExtension: `OR (${allowedGroup} AND (t.id IS NULL OR ${unclaimed}))`,
    sharedQueue: `(NOT (${isGroup}) OR t.id IS NULL OR ${unclaimed})` };
}
