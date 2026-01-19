import { getGmailClient, getImpersonatedUser } from './gmailClient.js';
import { base64UrlEncode, buildMimeMessage } from './mime.js';
import EmailSenderIdentity from '../../models/EmailSenderIdentity.model.js';
import NotificationTrigger from '../../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../../models/AgencyNotificationTriggerSetting.model.js';
import CommunicationLoggingService from '../communicationLogging.service.js';

function pickFromHeader({ displayName, fromEmail }) {
  const email = String(fromEmail || '').trim();
  if (!email) throw new Error('Missing fromEmail');
  const name = String(displayName || '').trim();
  return name ? `${name} <${email}>` : email;
}

async function resolveSenderIdentityForTrigger({ agencyId, triggerKey }) {
  const a = Number(agencyId);
  const key = String(triggerKey || '').trim();
  if (!a) throw new Error('agencyId is required');
  if (!key) throw new Error('triggerKey is required');

  const trigger = await NotificationTrigger.findByKey(key);
  if (!trigger) return null;

  const settings = await AgencyNotificationTriggerSetting.listForAgency(a);
  const s = (settings || []).find((x) => x.triggerKey === key) || null;

  const senderIdentityId =
    s?.senderIdentityId !== null && s?.senderIdentityId !== undefined
      ? s.senderIdentityId
      : (trigger.defaultSenderIdentityId || null);

  if (!senderIdentityId) return null;
  return await EmailSenderIdentity.findById(senderIdentityId);
}

/**
 * Send a notification email using the trigger matrix to select the correct From/Reply-To.
 *
 * @param {Object} params
 * @param {number} params.agencyId
 * @param {string} params.triggerKey - notification trigger key
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string|null} params.text
 * @param {string|null} params.html
 * @param {number|null} params.generatedByUserId - for user_communications log (optional)
 * @param {number|null} params.userId - recipient userId for user_communications (optional)
 * @param {string|null} params.templateType - user_communications.template_type (optional)
 * @param {number|null} params.templateId - user_communications.template_id (optional)
 */
export async function sendNotificationEmail({
  agencyId,
  triggerKey,
  to,
  subject,
  text = null,
  html = null,
  generatedByUserId = null,
  userId = null,
  templateType = null,
  templateId = null
}) {
  const identity = await resolveSenderIdentityForTrigger({ agencyId, triggerKey });
  if (!identity) {
    throw new Error(`No sender identity configured for trigger "${triggerKey}" (agency ${agencyId})`);
  }

  const from = pickFromHeader({ displayName: identity.display_name, fromEmail: identity.from_email });
  const replyTo = identity.reply_to || null;

  // Log before sending (best effort)
  let comm = null;
  if (generatedByUserId && userId) {
    comm = await CommunicationLoggingService.logGeneratedCommunication({
      userId,
      agencyId,
      templateType: templateType || `trigger:${triggerKey}`,
      templateId: templateId || null,
      subject,
      body: html || text || '',
      generatedByUserId,
      channel: 'email',
      recipientAddress: to
    }).catch(() => null);
  }

  const gmail = getGmailClient();
  const mime = buildMimeMessage({ to, subject, text, html, from, replyTo });
  const raw = base64UrlEncode(mime);

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  const messageId = result.data?.id || null;
  const threadId = result.data?.threadId || null;

  if (comm?.id && messageId) {
    await CommunicationLoggingService.markAsSent(comm.id, messageId, {
      threadId,
      impersonatedUser: getImpersonatedUser(),
      senderIdentityId: identity.id,
      fromEmail: identity.from_email,
      replyTo: identity.reply_to || null
    }).catch(() => {});
  }

  return { id: messageId, threadId, senderIdentityId: identity.id };
}

/**
 * Send a reply using an explicit sender identity (used by the inbound agent).
 */
export async function sendEmailFromIdentity({
  senderIdentityId,
  to,
  subject,
  text = null,
  html = null,
  inReplyTo = null,
  references = null,
  threadId = null
}) {
  const identity = await EmailSenderIdentity.findById(senderIdentityId);
  if (!identity) throw new Error('Sender identity not found');

  const from = pickFromHeader({ displayName: identity.display_name, fromEmail: identity.from_email });
  const replyTo = identity.reply_to || null;

  const gmail = getGmailClient();
  const mime = buildMimeMessage({ to, subject, text, html, from, replyTo, inReplyTo, references });
  const raw = base64UrlEncode(mime);

  const requestBody = threadId ? { raw, threadId } : { raw };
  const result = await gmail.users.messages.send({ userId: 'me', requestBody });

  return { id: result.data?.id || null, threadId: result.data?.threadId || threadId || null };
}

