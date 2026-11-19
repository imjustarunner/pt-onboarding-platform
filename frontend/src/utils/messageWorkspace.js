export function mergeInboxSummaries(summaries) {
  const merged = { unread: 0, snoozed: 0, unknownSenders: 0 };
  for (const summary of summaries) {
    for (const key of ['unread', 'snoozed', 'unknownSenders']) merged[key] += Number(summary[key] || 0);
    for (const key of ['unreadByChannel', 'unreadByInbox', 'unknownByChannel', 'unknownByInbox', 'reviewByCategory', 'claimedTicketNoticesByInbox', 'claimedTicketNoticesByChannel']) {
      merged[key] ||= {};
      for (const [id, count] of Object.entries(summary[key] || {})) merged[key][id] = Number(merged[key][id] || 0) + Number(count || 0);
    }
  }
  return merged;
}

export function uniqueMessageRows(rows) {
  return [...new Map(rows.map(row => [row.hubKind === 'ticket' ? `ticket:${row.support_ticket_id}`
    : row.threadId ? `chat:${row.threadId}` : `conversation:${row.conversationId || row.id}`, row])).values()];
}

export function groupMailboxes(inboxes) {
  const groups = new Map();
  for (const box of inboxes) {
    const key = box.group_key || `inbox:${box.id}`;
    const group = groups.get(key) || { ...box, id: key, mailboxes: [] };
    if (!group.mailboxes.some(existing => String(existing.id) === String(box.id))) group.mailboxes.push(box);
    groups.set(key, group);
  }
  return [...groups.values()];
}
