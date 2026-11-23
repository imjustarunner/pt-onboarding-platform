import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import { readCaseloadEmailClients } from './myClientCaseload.service.js';
import { resolveEmailSendMailbox } from './emailSendMailbox.service.js';
import { linkConversationClients } from './clientConversationRecord.service.js';
import { assertInternalEmailRecipients } from './internalEmailRecipients.service.js';
import { managedGroupEnvelope } from './managedWorkspaceGroupAccess.service.js';
import { cancellationRecipients } from './cancellationRecipients.service.js';

const emailAddress = value => String(value || '').trim().toLowerCase();
const validEmail = /^[^\s<>,;@"]+@[^\s<>,;@"]+\.[^\s<>,;@"]+$/;
const fail = (message, status = 400, code) => Object.assign(new Error(message), { status, code });

async function eligibleClientEmails(agencyId, userId, clientId) {
  let reviewed;
  try {
    reviewed = await cancellationRecipients.review(clientId, agencyId, { channels: ['email'] }, { allowMissingEmail: true });
  } catch (error) {
    if (error.status === 400 || error.status === 404) return [];
    throw error;
  }
  const emails = new Set();
  for (const recipient of reviewed.recipients || []) {
    const email = emailAddress(recipient.email);
    if (validEmail.test(email) && await cancellationRecipients.permitted(clientId, agencyId, recipient, 'email', { actorUserId: userId })) {
      emails.add(email);
    }
  }
  return [...emails].sort();
}

export async function listCaseloadEmailAgencies(actor) {
  const rows = await readCaseloadEmailClients(actor.id, { agencyId: actor.scopedAgencyId });
  return [...Map.groupBy(rows, row => Number(row.agency_id))].map(([id, clients]) => ({
    id, name: clients[0].agency_name, count: clients.length
  }));
}

export async function caseloadEmailAudience(userId, agencyId) {
  const rows = await readCaseloadEmailClients(userId, { agencyId });
  const recipients = new Map();
  let missing = 0;
  for (let offset = 0; offset < rows.length; offset += 8) {
    const batch = rows.slice(offset, offset + 8);
    const candidates = await Promise.all(batch.map(async ({ id }) => ({
      id: Number(id), emails: await eligibleClientEmails(agencyId, userId, Number(id))
    })));
    for (const { id, emails } of candidates) {
      if (!emails.length) missing++;
      for (const email of emails) {
        if (!recipients.has(email)) recipients.set(email, []);
        recipients.get(email).push(id);
      }
    }
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([...recipients])).digest('hex');
  return {
    recipients,
    summary: { total: rows.length, missing, count: recipients.size, fingerprint, agencyName: rows[0]?.agency_name || null }
  };
}

async function assertCaseloadAddresses(agencyId, userId, addresses) {
  for (let i = 0; i < addresses.length; i += 100) {
    const to = addresses.slice(i, i + 100).join(', ');
    const expanded = await managedGroupEnvelope({ to, actorUserId: userId });
    if (expanded.to !== to || expanded.cc || expanded.bcc) {
      throw fail('A client has a group email address on file. Update that address before sending.');
    }
    await assertInternalEmailRecipients({ agencyId, to });
  }
  const { isAddressBlocked } = await import('./unifiedInbox.service.js');
  for (let i = 0; i < addresses.length; i += 8) {
    const blocked = await Promise.all(addresses.slice(i, i + 8).map(email =>
      isAddressBlocked(agencyId, email, { ownerUserId: userId })
    ));
    if (blocked.some(Boolean)) {
      throw fail('A client has a blocked email address on file. Review your blocked addresses before sending.');
    }
  }
}

export async function validateQueuedCaseloadRecipient({ agencyId, userId, to, cc, bcc, clientIds }) {
  const changed = () => fail('The client assignment or email address changed before delivery.', 409);
  if (to.length || cc.length || bcc.length !== 1 || !clientIds?.length) throw changed();
  const email = bcc[0].email;
  const current = await readCaseloadEmailClients(userId, { agencyId, clientIds });
  if (current.length !== clientIds.length) throw changed();
  const eligible = await Promise.all(current.map(row => eligibleClientEmails(agencyId, userId, Number(row.id))));
  if (eligible.some(emails => !emails.includes(email))) throw changed();
  await assertCaseloadAddresses(agencyId, userId, [email]);
}

export async function queueCaseloadEmail({ actor, draft, version, fingerprint }) {
  const agencyId = Number(draft.agency_id);
  const { recipients, summary } = await caseloadEmailAudience(actor.id, agencyId);
  if (fingerprint !== summary.fingerprint) {
    throw fail('Your caseload changed. Review the updated recipient count before sending.', 409, 'CASELOAD_EMAIL_CHANGED');
  }
  if (!recipients.size) throw fail('No eligible client or guardian email addresses are available.');
  const { subject, text, undoDelaySeconds } = draft.draft;
  if (!subject.trim() || !text.trim()) throw fail('Add a subject and message.');
  const mailbox = await resolveEmailSendMailbox({ agencyId, userId: actor.id });
  if (!mailbox.inbox?.id || !mailbox.identity?.id) throw fail('A work mailbox is required to send email.');
  await assertCaseloadAddresses(agencyId, actor.id, [...recipients.keys()]);

  const executor = await pool.getConnection();
  try {
    await executor.beginTransaction();
    const [claim] = await executor.execute(`UPDATE communication_email_drafts SET state = 'sending'
      WHERE id = ? AND user_id = ? AND version = ? AND state = 'editing'`, [draft.id, actor.id, version]);
    if (!claim.affectedRows) throw fail('This draft was submitted or changed in another window.', 409);

    const messageIds = [];
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    for (const [email, clientIds] of recipients) {
      const conversation = await CommunicationConversation.create({
        agencyId, inboxId: mailbox.inbox.id, subject, status: 'waiting_on_them',
        ownerUserId: actor.id, lastMessageAt: new Date(), lastMessagePreview: preview
      }, executor);
      await CommunicationConversation.upsertParticipant(conversation.id, { email, isPrimary: true }, executor);
      const messageId = await CommunicationConversation.addMessage({
        conversationId: conversation.id, direction: 'outbound', authorUserId: actor.id,
        from: { email: mailbox.fromEmail, replyTo: mailbox.replyTo, name: mailbox.displayName, caseloadClientIds: clientIds, caseloadDraftId: draft.id },
        bcc: [{ email }], subject, bodyText: text, sendStatus: 'preparing'
      }, executor);
      await linkConversationClients(conversation.id, clientIds, { executor });
      messageIds.push(messageId);
    }

    const scheduledSendAt = new Date(Date.now() + undoDelaySeconds * 1000);
    const marks = messageIds.map(() => '?').join(',');
    await executor.execute(`UPDATE communication_messages
      SET send_status = 'scheduled', scheduled_send_at = ?, undo_expires_at = ? WHERE id IN (${marks})`,
    [scheduledSendAt, scheduledSendAt, ...messageIds]);
    const receipt = {
      batchCount: messageIds.length, messageId: messageIds[0], scheduled: true, sent: false,
      scheduledSendAt, undoExpiresAt: scheduledSendAt
    };
    await executor.execute(`UPDATE communication_email_drafts SET state = 'sent', send_result_json = ?
      WHERE id = ? AND user_id = ?`, [JSON.stringify({ ...receipt, messageIds }), draft.id, actor.id]);
    await executor.commit();
    return receipt;
  } catch (error) {
    await executor.rollback();
    throw error;
  } finally {
    executor.release();
  }
}

export async function caseloadEmailStatus(actor, draft) {
  const messageIds = draft.result?.messageIds;
  if (!draft.draft?._myClients || draft.state !== 'sent' || !messageIds?.length) throw fail('Delivery not found.', 404);
  const [rows] = await pool.execute(`SELECT send_status, COUNT(*) AS count FROM communication_messages
    WHERE author_user_id = ? AND id IN (${messageIds.map(() => '?').join(',')}) GROUP BY send_status`,
  [actor.id, ...messageIds]);
  const counts = Object.fromEntries(rows.map(row => [row.send_status, Number(row.count)]));
  const sent = counts.sent || 0;
  const cancelled = counts.cancelled || 0;
  const failed = counts.failed || 0;
  const remaining = messageIds.length - sent - failed - cancelled;
  const send_status = counts.scheduled === messageIds.length ? 'scheduled' : remaining ? 'sending'
    : failed ? 'failed' : sent ? 'sent' : 'cancelled';
  return { send_status, batch: { sent, failed, remaining, cancelled }, scheduled_send_at: draft.result.scheduledSendAt };
}

export async function cancelCaseloadEmail(actor, draft) {
  const messageIds = draft.result?.messageIds;
  if (!draft.draft?._myClients || draft.state !== 'sent' || !messageIds?.length) throw fail('Delivery not found.', 404);

  const executor = await pool.getConnection();
  try {
    await executor.beginTransaction();
    const [claim] = await executor.execute(`UPDATE communication_email_drafts
      SET state = 'editing', send_result_json = NULL, version = version + 1
      WHERE id = ? AND user_id = ? AND state = 'sent' AND version = ?`, [draft.id, actor.id, draft.version]);
    if (!claim.affectedRows) throw fail('This delivery changed. Reopen the draft.', 409);
    const [cancelled] = await executor.execute(`UPDATE communication_messages SET send_status = 'cancelled'
      WHERE author_user_id = ? AND send_status = 'scheduled' AND id IN (${messageIds.map(() => '?').join(',')})`,
    [actor.id, ...messageIds]);
    if (cancelled.affectedRows !== messageIds.length) throw fail('Delivery has started. The batch can no longer be undone.', 409);
    await executor.commit();
  } catch (error) {
    await executor.rollback();
    throw error;
  } finally {
    executor.release();
  }
}
