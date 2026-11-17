import pool from '../config/database.js';
import Inbox from '../models/CommunicationInbox.model.js';
import { groupKeyForIdentity } from './departmentalGroupPolicy.js';
import { operationalNoticeCategory } from './messageInboxPolicy.js';
import { persistInboundEmail } from './inboundEmailPersistence.service.js';
import { prepareInboundAttachments } from './communicationAttachments.service.js';
import { readGmailBodyHtml } from '../utils/gmailMessageParse.shared.js';

/** Keep actual system mail and attachments in the review queue. The existing
 * receipt transaction makes retries idempotent; this path creates no ticket,
 * AI draft, app notification, or outgoing email. */
export async function captureGroupOperationalNotice(input, dependencies = {}) {
  const { identity, fromEmail, subject, messageId, threadId, receivedAt, bodyText, gmail, gmailMessageId, payload } = input;
  const category = operationalNoticeCategory(subject);
  if (!category || !['schools','school_groups'].includes(groupKeyForIdentity(identity)) || !messageId) return { ingested: false };
  const db = dependencies.database || pool, inboxes = dependencies.inboxes || Inbox;
  const [[sender]] = await db.execute('SELECT id FROM email_sender_identities WHERE agency_id=? AND LOWER(from_email)=? AND is_active=1 LIMIT 1', [identity.agency_id, String(fromEmail || '').toLowerCase()]);
  if (!sender) return { ingested: false };
  await inboxes.ensureFromSenderIdentities(identity.agency_id);
  const inbox = (await inboxes.listForAgency({ agencyId: identity.agency_id })).find(box => Number(box.sender_identity_id) === Number(identity.id));
  if (!inbox) throw new Error('School notice inbox is unavailable');
  const prepare = dependencies.prepareAttachments || prepareInboundAttachments;
  const persist = dependencies.persist || persistInboundEmail;
  const html = dependencies.readHtml || readGmailBodyHtml;
  const attachments = await prepare({ gmail, gmailMessageId, payload, inboxId: inbox.id });
  const result = await persist({ inboxId: inbox.id, agencyId: identity.agency_id, ownerUserId: null,
    deliveryId: messageId, threadId: threadId || messageId, fromEmail, subject, bodyText,
    bodyHtml: await html(payload, { gmail, gmailMessageId }),
    to: (input.to || []).map(email => ({ email })), cc: (input.cc || []).map(email => ({ email })),
    receivedAt, attachments, isGroupEmail: true, suppressPush: true });
  return { ...result, category };
}
