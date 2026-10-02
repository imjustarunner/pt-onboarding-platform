import { ensureTenantNotificationsMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

/** Guardian access links have an intentional tenant sender and a staffed reply mailbox. */
export async function sendGuardianNotificationEmail({ agencyId, ...message }) {
  const { notifications, domain } = await ensureTenantNotificationsMailbox(agencyId);
  if (Number(notifications?.is_active) !== 1 || Number(notifications.agency_id) !== Number(agencyId) ||
      String(notifications.from_email).toLowerCase() !== `notifications@${domain}`) {
    throw new Error('Configure the tenant notifications sender before sending guardian access emails.');
  }
  const result = await sendEmailFromIdentity({
    ...message,
    senderIdentityId: notifications.id,
    replyToOverride: `support@${domain}`,
    usedFallbackSender: false
  });
  const sent = !!result?.id && !result.queued && !result.skipped && !result.blocked && !result.redirected;
  return { ...result, sent, deliveryStatus: sent ? 'sent' : result?.queued ? 'pending' : 'not_sent' };
}
