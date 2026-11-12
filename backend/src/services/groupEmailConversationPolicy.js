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
    personalScopeExtension: `OR (${allowedGroup})`,
    sharedQueue: `(NOT (${isGroup}) OR t.id IS NULL OR ${unclaimed})` };
}

/** School-group correspondence includes mirrored support mail and the original
 * automated school notices. Department access still applies independently. */
export const schoolGroupConversationSql = `(c.channel='email' AND (
  i.identity_key IN ('schoolreply','school_reply')
  OR EXISTS (SELECT 1 FROM agencies school WHERE school.id=t.school_organization_id AND school.organization_type='school')
  OR EXISTS (SELECT 1 FROM communication_links school_link WHERE school_link.conversation_id=c.id AND school_link.entity_type='school')
  OR EXISTS (SELECT 1 FROM communication_messages notice WHERE notice.conversation_id=c.id AND notice.auto_reply_kind='school_group_notification')
))`;

export function personalConversationUnreadSql(userId) {
 const uid = Number(userId);
 if (!Number.isSafeInteger(uid) || uid < 1) return '0=1';
 return `(EXISTS (SELECT 1 FROM communication_conversation_reads r WHERE r.conversation_id=c.id AND r.user_id=${uid} AND r.forced_unread=1)
  OR EXISTS (SELECT 1 FROM communication_messages m LEFT JOIN communication_conversation_reads r ON r.conversation_id=c.id AND r.user_id=${uid}
    WHERE m.conversation_id=c.id AND m.direction='inbound' AND COALESCE(m.is_internal_note,0)=0
      AND COALESCE(m.send_status,'received') <> 'cancelled' AND (r.last_read_at IS NULL OR r.last_read_at < COALESCE(m.sent_at,m.created_at))))`;
}
