import { notificationDismissPayload } from './notificationActions';

// Explicit row IDs keep page/selection actions separate from filter-wide actions.
export async function updateNotificationBatch(items, action, update, now = Date.now()) {
  const payloads = {
    read: { read: true }, unread: { read: false },
    follow: { followUp: true }, unfollow: { followUp: false },
    restore: { dismissed: false }, unsnooze: { snoozedUntil: null },
    snooze1: { snoozedUntil: new Date(now + 3600000).toISOString() },
    snooze24: { snoozedUntil: new Date(now + 86400000).toISOString() }
  };
  if (action !== 'dismiss' && !payloads[action]) throw new Error('Unknown notification action');
  const queue = [...new Map(items.map((item) => [item.id, item])).values()];
  const failedIds = [];
  let updated = 0;
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await update(item.id, action === 'dismiss' ? notificationDismissPayload(item) : payloads[action]);
        updated++;
      } catch { failedIds.push(item.id); }
    }
  }));
  return { updated, failedIds };
}
