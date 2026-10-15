import pool from '../config/database.js';
import { resolveWaitlistMailboxes } from './providerWaitlistEmail.service.js';
import { sendNotificationEmail, sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

/** Require the tenant's configured notifications sender and staffed support reply mailbox. */
export async function sendScheduleNotificationEmail({ agencyId, ...message }) {
  const mailboxes = await resolveWaitlistMailboxes(pool, agencyId);
  const send = message.existingCommunicationId ? sendEmailFromIdentity : sendNotificationEmail;
  return send({ ...message, agencyId, senderIdentityId: mailboxes.senderIdentityId,
    replyToOverride: mailboxes.support });
}
