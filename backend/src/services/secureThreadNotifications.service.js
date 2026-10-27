import pool from '../config/database.js';
import { refreshClientSecureAccess } from './clientSecureConversation.service.js';
import { sendSecureMessageNotification } from './secureMessageNotify.service.js';
import { recordSecureMessageEvent } from './secureMessageBoundary.service.js';

// Notify every other current participant, including the other guardian when a
// parent posts. One recipient's delivery failure must not suppress the others.
export async function notifySecureThreadParticipants({ agencyId, threadId, clientId, senderUserId, messageId }, overrides = {}) {
  const d = { database: pool, refresh: refreshClientSecureAccess,
    send: sendSecureMessageNotification, audit: recordSecureMessageEvent, ...overrides };
  await d.refresh(threadId, senderUserId);
  const [participants] = await d.database.execute(
    `SELECT u.id, u.email, u.personal_email FROM chat_thread_participants p
     JOIN users u ON u.id = p.user_id JOIN chat_threads t ON t.id = p.thread_id
     WHERE p.thread_id = ? AND t.agency_id = ? AND t.message_channel = 'secure'
       AND t.client_id <=> ? AND p.user_id <> ?
       AND LOWER(u.status) IN ('active', 'active_employee')`,
    [threadId, agencyId, clientId || null, senderUserId]
  );
  const results = [];
  for (const recipient of participants) {
    // Keep individual links even when two accounts share an email address.
    if (Number(recipient.id) === Number(senderUserId)) continue;
    const email = recipient.email || recipient.personal_email;
    if (!email) { results.push({ userId: recipient.id, sent: false, reason: 'no_email' }); continue; }
    try {
      const result = await d.send({ agencyId, senderUserId, recipientUserId: recipient.id,
        recipientEmail: email, clientId, chatThreadId: threadId, messageId });
      results.push({ userId: recipient.id, sent: result.sent, reason: result.reason || null });
    } catch {
      results.push({ userId: recipient.id, sent: false, reason: 'delivery_failed' });
      // Do not record message contents or addresses, or retry an uncertain send.
      try { await d.audit({ agencyId, threadId, messageId, userId: recipient.id, eventType: 'notification_failed' }); }
      catch { console.warn('[secureThreadNotifications] Failed to record notification failure', { threadId, messageId, recipientUserId: recipient.id }); }
    }
  }
  return results;
}
