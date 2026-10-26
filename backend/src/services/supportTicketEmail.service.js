import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { encryptSupportEmailText as prepareEncryptedTicketText } from './supportEmailEncryption.js';
import { chooseCanonicalSupportTicket, classifySupportEmailResult, emailHash, emailKey, isManagedSupportIdentity, supportEmailError,
  supportReplyHeaders } from './supportTicketEmailPolicy.js';

async function senderOptions({ ticket, actorUserId }, db) {
  const [identities] = await db.execute(`SELECT e.*, i.owner_user_id
    FROM email_sender_identities e LEFT JOIN communication_inboxes i ON i.sender_identity_id=e.id
    WHERE e.agency_id=? AND e.is_active=1`, [ticket.agency_id]);
  const [schools] = await db.execute('SELECT itsco_email FROM school_profiles WHERE school_organization_id=?', [ticket.school_organization_id]);
  const [[actor]] = await db.execute(`SELECT u.id,u.first_name,u.last_name,a.name AS agency_name
    FROM users u JOIN agencies a ON a.id=? WHERE u.id=?`, [ticket.agency_id, actorUserId]);
  if (!actor) throw supportEmailError('Staff sender not found.', 403);
  const staffName = [actor.first_name, actor.last_name].filter(Boolean).join(' ').trim();
  const agencyName = String(actor.agency_name || '').replace(/[\r\n<>]/g, ' ').trim();
  const seen = new Set();
  return identities.filter((i) => isManagedSupportIdentity(i, { agencyId: ticket.agency_id, topic: ticket.topic,
    schoolAddresses: schools.map((s) => s.itsco_email) })).filter((i) => !seen.has(i.id) && seen.add(i.id)).map((i) => ({
    id: Number(i.id), identityKey: i.identity_key, fromEmail: emailKey(i.from_email),
    teamDisplayName: String(i.display_name || agencyName || 'School support').replace(/[\r\n<>]/g, ' ').trim(),
    staffDisplayName: [staffName, agencyName].filter(Boolean).join(' · ').replace(/[\r\n<>]/g, ' ').trim()
  }));
}

export async function listSupportTicketSenderOptions(input, db = pool) {
  return senderOptions(input, db);
}

export async function listTicketEmailDeliveryMetadata(ticketId, db = pool) {
  const [rows] = await db.execute('SELECT * FROM support_ticket_email_messages WHERE ticket_id=? ORDER BY COALESCE(sent_at,created_at) ASC,id ASC', [ticketId]);
  return rows;
}

/** Read-only alias for historical duplicate tickets, never a record merge. */
export async function resolveSupportTicketEmailThread(ticket, db = pool) {
  if (ticket?.source_channel !== 'email' || !ticket.source_email_thread_id || !ticket.agency_id) return { canonicalTicketId: Number(ticket?.id) || null };
  const [rows] = await db.execute(`SELECT t.id,t.claimed_by_user_id,s.canonical_ticket_id,
      (SELECT MIN(e.id) FROM support_ticket_email_messages e WHERE e.ticket_id=t.id) AS first_email_id FROM support_tickets t
    LEFT JOIN support_ticket_email_thread_sync s ON s.agency_id=t.agency_id
      AND BINARY s.gmail_thread_id=BINARY t.source_email_thread_id
    WHERE t.source_channel='email' AND t.agency_id=? AND t.source_email_thread_id=?
      AND t.school_organization_id <=> ? AND t.client_id <=> ? AND t.topic <=> ?`,
  [ticket.agency_id, ticket.source_email_thread_id, ticket.school_organization_id || null, ticket.client_id || null, ticket.topic || null]);
  return { canonicalTicketId: Number(chooseCanonicalSupportTicket(rows)?.id || ticket.id), originalTicketId: Number(ticket.id) };
}

export async function preserveSupportTicketEmailCanonical(ticket, db = pool) {
  if (!ticket?.source_email_thread_id) return;
  await db.execute(`INSERT INTO support_ticket_email_thread_sync (agency_id,gmail_thread_id,canonical_ticket_id)
    VALUES (?,?,?) ON DUPLICATE KEY UPDATE canonical_ticket_id=COALESCE(canonical_ticket_id,VALUES(canonical_ticket_id))`,
  [ticket.agency_id, ticket.source_email_thread_id, ticket.id]);
}

function resultFor(row, extra = {}) {
  return { messageId: Number(row.ticket_message_id), status: row.send_status, sent: row.send_status === 'sent',
    communicationId: row.communication_id || null, reason: row.error_code || null,
    fromEmail: row.from_email, fromName: row.from_name, ...extra };
}

async function refreshInbox(ticketId, agencyId) {
  const { syncEmailTicketsToInbox } = await import('./ticketEmailInboxAdapter.service.js');
  await syncEmailTicketsToInbox({ ticketId, agencyId, limit: 1, forceRefresh: true });
}

/** A single send path for the ticket desk and the shared inbox. The ticket lock
 * reserves ownership and an idempotent message before any provider call. */
export async function sendSupportTicketEmailReply(input, dependencies = {}) {
  const database = dependencies.database || pool;
  const send = dependencies.sendEmail || (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity;
  const review = dependencies.review || await import('./supportReplyReview.service.js');
  const sync = dependencies.syncInbox || refreshInbox;
  const { ticketId, actorUserId, parentMessageId = null, senderIdentityId = null,
    senderMode = 'staff', draftSnapshotId = null, expectedLastMessageId = null } = input;
  const body = String(input.body || '').trim();
  if (!body || body.length > 60000) throw supportEmailError('A reply of at most 60,000 characters is required.', 400);
  if (!['staff', 'team'].includes(senderMode)) throw supportEmailError('Choose a staff or school/team sender.', 400);
  if (expectedLastMessageId == null) throw supportEmailError('Reload the current conversation before sending.', 409, 'SUPPORT_EMAIL_STALE_THREAD');
  const requestId = String(input.clientRequestId || '').trim();
  if (!requestId || requestId.length > 200) throw supportEmailError('A reply request ID is required. Reload and try again.', 400);
  const requestKey = emailHash(`${actorUserId}:${requestId}`);
  const db = await database.getConnection();
  let ticket, delivery, headers, snapshot, sourceMessageId, revision, existing = false;
  try {
    await db.beginTransaction();
    [[ticket]] = await db.execute('SELECT * FROM support_tickets WHERE id=? FOR UPDATE', [ticketId]);
    if (!ticket || ticket.source_channel !== 'email') throw supportEmailError('Email ticket not found.', 404);
    const canonical = await resolveSupportTicketEmailThread(ticket, db);
    if (canonical.canonicalTicketId !== Number(ticket.id)) {
      throw Object.assign(supportEmailError('Open the current email conversation before replying.', 409, 'SUPPORT_EMAIL_CANONICAL_TICKET'), canonical);
    }
    const [[actor]] = await db.execute(`SELECT u.id,u.role FROM users u WHERE u.id=? AND COALESCE(u.is_active,1)=1
      AND COALESCE(u.is_archived,0)=0 AND (u.role='super_admin' OR EXISTS
        (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1))`,
    [actorUserId, ticket.agency_id]);
    if (!actor || ['school_staff', 'client_guardian'].includes(actor.role)) throw supportEmailError('Only agency staff can send this reply.', 403);
    if (ticket.claimed_by_user_id && Number(ticket.claimed_by_user_id) !== Number(actorUserId)) {
      throw supportEmailError('This ticket is claimed by another staff member. Reassign it before replying.');
    }
    [[delivery]] = await db.execute(`SELECT * FROM support_ticket_email_messages WHERE ticket_id=? AND client_request_key=?`, [ticketId, requestKey]);
    if (delivery) {
      existing = true;
      await db.commit();
    } else {
      const [[last]] = await db.execute('SELECT MAX(id) AS id FROM support_ticket_messages WHERE ticket_id=? AND COALESCE(is_deleted,0)=0', [ticketId]);
      revision = String(last?.id || 0);
      if (expectedLastMessageId != null && String(expectedLastMessageId) !== revision) {
        throw supportEmailError('A new message arrived. Review the latest conversation before sending.', 409, 'SUPPORT_EMAIL_STALE_THREAD');
      }
      const [[latestInbound]] = await db.execute(`SELECT m.id FROM support_ticket_messages m
        LEFT JOIN support_ticket_email_messages e ON e.ticket_message_id=m.id
        WHERE m.ticket_id=? AND COALESCE(m.is_deleted,0)=0 AND COALESCE(m.is_internal,0)=0
          AND (e.direction='inbound' OR (e.id IS NULL AND m.author_role IN ('system_email','school_staff')))
        ORDER BY COALESCE(e.sent_at,m.created_at) DESC,m.id DESC LIMIT 1`, [ticketId]);
      sourceMessageId = latestInbound?.id || null;
      snapshot = await review.resolveDraftSnapshotForSend({ ticketId, agencyId: ticket.agency_id, actorUserId,
        draftSnapshotId, sourceMessageId, threadRevision: revision });
      const options = await senderOptions({ ticket, actorUserId }, db);
      const selected = senderIdentityId ? options.find((o) => o.id === Number(senderIdentityId))
        : options.find((o) => ['schoolreply', 'school_reply', 'schools'].includes(o.identityKey)) || options[0];
      if (!selected) throw supportEmailError('No approved shared sender is available for this ticket.', 400, 'SUPPORT_EMAIL_SENDER_REQUIRED');
      const metadata = await listTicketEmailDeliveryMetadata(ticketId, db);
      await preserveSupportTicketEmailCanonical(ticket, db);
      headers = supportReplyHeaders(ticket, metadata);
      const latestReceived = [...metadata].reverse().find((m) => m.direction === 'inbound');
      const to = emailKey(latestReceived?.from_email || ticket.source_email_from);
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to)) throw supportEmailError('The original sender does not have a valid reply address.', 400);
      const name = senderMode === 'team' ? selected.teamDisplayName : selected.staffDisplayName;
      let parentId = null;
      if (parentMessageId) {
        const [[parent]] = await db.execute('SELECT id FROM support_ticket_messages WHERE id=? AND ticket_id=? AND COALESCE(is_deleted,0)=0', [parentMessageId, ticketId]);
        parentId = parent?.id || null;
      }
      const enc = prepareEncryptedTicketText(body);
      const [created] = await db.execute(`INSERT INTO support_ticket_messages
        (ticket_id,parent_message_id,author_user_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal)
        VALUES (?,?,?,?,?,?,?,?,?,0)`, [ticketId, parentId, actorUserId, actor.role,
        enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId]);
      const internetId = `<${randomUUID()}@${selected.fromEmail.split('@')[1]}>`;
      const [saved] = await db.execute(`INSERT INTO support_ticket_email_messages
        (ticket_id,ticket_message_id,agency_id,direction,send_status,sender_identity_id,from_email,from_name,to_json,
         subject,internet_message_id,internet_message_id_hash,in_reply_to,references_header,gmail_thread_id,client_request_key,draft_snapshot_id)
        VALUES (?,?,?,'outbound','sending',?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ticketId, created.insertId, ticket.agency_id, selected.id, selected.fromEmail, name, JSON.stringify([to]),
        headers.subject, internetId, emailHash(internetId), headers.inReplyTo, headers.references, headers.threadId,
        requestKey, snapshot?.id || snapshot?.draftSnapshotId || null]);
      await db.execute('UPDATE support_tickets SET claimed_by_user_id=?,claimed_at=COALESCE(claimed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?', [actorUserId, ticketId]);
      delivery = { id: saved.insertId, ticket_message_id: created.insertId, sender_identity_id: selected.id,
        from_email: selected.fromEmail, from_name: name, to_json: [to], internet_message_id: internetId, send_status: 'sending' };
      await db.commit();
    }
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
  // An uncertain or failed delivery is never automatically submitted twice.
  if (existing) return resultFor(delivery, { duplicate: true });

  // Preserve the accepted composition before transport changes it with a signature.
  // A later receipt-capture outage can then be repaired without guessing the draft
  // or resending an email that the provider already accepted.
  try {
    await review.captureSentReview({ ticketId, agencyId: ticket.agency_id, actorUserId,
      draftSnapshotId: snapshot?.id || snapshot?.draftSnapshotId || null, body, composedBody: body,
      deliveryStatus: 'sending', internetMessageId: delivery.internet_message_id,
      sourceMessageId, ticketMessageId: delivery.ticket_message_id, threadRevision: revision,
      idempotencyKey: `ticket-email:${delivery.ticket_message_id}` });
  } catch {
    await database.execute(`UPDATE support_ticket_email_messages SET send_status=?,error_code=?,error_message=? WHERE id=?`,
      ['failed', 'review_capture_failed_before_send', 'The reply was not sent because its review record could not be saved.', delivery.id]);
    throw supportEmailError('The reply was not sent because its review record could not be saved. Please retry with a new reply request.', 503, 'SUPPORT_EMAIL_REVIEW_UNAVAILABLE');
  }

  let sent, sendError;
  try {
    sent = await send({ senderIdentityId: delivery.sender_identity_id, to: delivery.to_json[0],
      subject: headers.subject, text: body, source: 'manual', generatedByUserId: actorUserId,
      fromDisplayNameOverride: delivery.from_name, replyToOverride: delivery.from_email,
      templateType: senderMode === 'team' ? 'support_ticket_reply_team' : 'support_ticket_reply',
      clientId: ticket.client_id || null, schoolOrganizationId: ticket.school_organization_id,
      inReplyTo: headers.inReplyTo, references: headers.references, threadId: headers.threadId,
      internetMessageIdOverride: delivery.internet_message_id, attachments: input.attachments || null });
  } catch (error) { sendError = error; }
  const status = sendError ? 'failed' : classifySupportEmailResult(sent);
  const reason = sendError ? 'delivery_unconfirmed' : sent?.redirected ? 'test_redirect_not_delivered_to_school'
    : status === 'failed' ? sent?.reason || 'provider_did_not_confirm_delivery' : sent?.reason || null;
  const actualInternetId = sent?.internetMessageId || delivery.internet_message_id;
  const deliveredBody = String(sent?.bodyText || body);
  if (deliveredBody !== body) {
    const enc = prepareEncryptedTicketText(deliveredBody);
    await database.execute(`UPDATE support_ticket_messages SET body=?,body_ciphertext=?,body_iv=?,body_auth_tag=?,encryption_key_id=? WHERE id=?`,
      [enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId, delivery.ticket_message_id]);
  }
  // Keep provider proof separate from UI state. A failed persistence call must
  // never lead to another provider send on the same request ID.
  await database.execute(`UPDATE support_ticket_email_messages SET send_status=?,communication_id=?,
    gmail_message_id=?,gmail_thread_id=COALESCE(?,gmail_thread_id),internet_message_id=?,internet_message_id_hash=?,
    error_code=?,error_message=?,sent_at=? WHERE id=?`,
  [status, sent?.communicationId || sendError?.communicationId || null, sent?.id || null, sent?.threadId || null,
    actualInternetId, emailHash(actualInternetId), reason,
    sendError ? 'Delivery could not be confirmed. Check the delivery log before trying a new send.' : null,
    status === 'sent' ? new Date() : null, delivery.id]);
  if (status === 'sent') {
    const enc = prepareEncryptedTicketText(deliveredBody);
    await database.execute(`UPDATE support_tickets SET status=CASE WHEN status='closed' THEN status WHEN EXISTS
      (SELECT 1 FROM support_ticket_email_messages newer WHERE newer.ticket_id=support_tickets.id
       AND newer.direction='inbound' AND newer.ticket_message_id>?) THEN status ELSE ? END,
      answer=?,answer_ciphertext=?,answer_iv=?,answer_auth_tag=?,
      answer_encryption_key_id=?,answered_by_user_id=?,answered_at=CURRENT_TIMESTAMP,sent_at=CURRENT_TIMESTAMP,
      source_email_thread_id=COALESCE(?,source_email_thread_id),ai_draft_review_state=CASE WHEN EXISTS
      (SELECT 1 FROM support_ticket_email_messages newer WHERE newer.ticket_id=support_tickets.id
       AND newer.direction='inbound' AND newer.ticket_message_id>?) THEN ai_draft_review_state ELSE 'sent' END WHERE id=?`,
    [delivery.ticket_message_id, input.desiredStatus === 'closed' ? 'closed' : 'answered', enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId,
      actorUserId, sent.threadId || null, delivery.ticket_message_id, ticketId]);
  }
  let reviewPending = false;
  try {
    await review.captureSentReview({ ticketId, agencyId: ticket.agency_id, actorUserId,
      draftSnapshotId: snapshot?.id || snapshot?.draftSnapshotId || null, body: deliveredBody, composedBody: body, deliveryStatus: status,
      transportMessageId: sent?.id || null, internetMessageId: actualInternetId,
      communicationId: sent?.communicationId || sendError?.communicationId || null,
      sourceMessageId, ticketMessageId: delivery.ticket_message_id, threadRevision: revision,
      idempotencyKey: `ticket-email:${delivery.ticket_message_id}`, errorCode: reason });
  } catch {
    // Delivery remains truthful even if its terminal immutable review is delayed.
    // The receipt reconciler repairs it from provider proof and the sending snapshot.
    reviewPending = true;
    await database.execute(`UPDATE support_ticket_email_messages SET error_code=COALESCE(error_code,?),
      error_message=? WHERE id=?`, ['review_capture_pending', 'Delivery review capture is pending reconciliation.', delivery.id]);
  }
  await sync(ticketId, ticket.agency_id).catch((error) => console.warn('[support email] inbox mirror pending:', error?.code || 'sync_failed'));
  return resultFor({ ...delivery, send_status: status, communication_id: sent?.communicationId || null,
    error_code: reason || (reviewPending ? 'review_capture_pending' : null) });
}
