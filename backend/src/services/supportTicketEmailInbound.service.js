import pool from '../config/database.js';
import { decryptTicketRow, decryptTicketMessageRow } from '../utils/supportTicketCrypto.js';
import { encryptSupportEmailText as prepareEncryptedTicketText } from './supportEmailEncryption.js';
import { replyMessageIds } from '../utils/emailThreading.js';
import { emailHash, emailKey, parseEmailList, supportEmailError } from './supportTicketEmailPolicy.js';
import { preserveSupportTicketEmailCanonical, resolveSupportTicketEmailThread } from './supportTicketEmail.service.js';
import { listTicketAttachments, persistGmailAttachmentsForTicket } from './unifiedEmail/ticketInboundAttachments.service.js';

async function findThread({ agencyId, threadId, messageId, inReplyTo, referencesHeader, fromEmail, staffCopy, targetTicketId }, db) {
  const ids = [...new Set([messageId, ...replyMessageIds(inReplyTo, referencesHeader)].filter(Boolean))].slice(0, 40);
  const conditions = [], params = [agencyId];
  if (threadId) { conditions.push('t.source_email_thread_id=?'); params.push(threadId); }
  if (ids.length) {
    const binds = ids.map(() => '?').join(',');
    conditions.push(`t.source_email_message_id IN (${binds})`); params.push(...ids);
    conditions.push(`EXISTS (SELECT 1 FROM support_ticket_email_messages e WHERE e.ticket_id=t.id AND e.internet_message_id_hash IN (${binds}))`);
    params.push(...ids.map(emailHash));
    conditions.push(`EXISTS (SELECT 1 FROM communication_conversations c JOIN communication_messages m ON m.conversation_id=c.id
      WHERE c.support_ticket_id=t.id AND m.internet_message_id IN (${binds}))`); params.push(...ids);
  }
  if (!conditions.length) return null;
  const [candidates] = await db.execute(`SELECT t.* FROM support_tickets t WHERE t.agency_id=? AND t.source_channel='email'
    AND (${conditions.join(' OR ')}) ORDER BY (t.claimed_by_user_id IS NOT NULL) DESC,t.id DESC LIMIT 20 FOR UPDATE`, params);
  const parentIds = replyMessageIds(inReplyTo, referencesHeader).slice(0, 30);
  let exactParentTicketId = null;
  if (parentIds.length) {
    const [parents] = await db.execute(`SELECT ticket_id,internet_message_id FROM support_ticket_email_messages
      WHERE agency_id=? AND internet_message_id_hash IN (${parentIds.map(() => '?').join(',')})`, [agencyId, ...parentIds.map(emailHash)]);
    exactParentTicketId = parentIds.map((id) => parents.find((p) => p.internet_message_id === id)?.ticket_id).find(Boolean);
  }
  candidates.sort((a, b) => Number(b.id === exactParentTicketId) - Number(a.id === exactParentTicketId));
  for (const ticket of candidates.filter((t) => !targetTicketId || Number(t.id) === Number(targetTicketId))) {
    if (staffCopy || emailKey(ticket.source_email_from) === fromEmail) return ticket;
    const [addresses] = await db.execute('SELECT from_email,to_json,cc_json FROM support_ticket_email_messages WHERE ticket_id=?', [ticket.id]);
    if (addresses.some((a) => [emailKey(a.from_email), ...parseEmailList(a.to_json), ...parseEmailList(a.cc_json)].includes(fromEmail))) return ticket;
    const [[participant]] = await db.execute(`SELECT p.id FROM communication_participants p
      JOIN communication_conversations c ON c.id=p.conversation_id
      WHERE c.support_ticket_id=? AND LOWER(p.email)=? LIMIT 1`, [ticket.id, fromEmail]);
    if (participant) return ticket;
  }
  return null;
}

/** Save one provider email into its existing ticket, including staff copies.
 * Provider messages are acknowledged only after durable history and attachments. */
export async function ingestSupportTicketEmail(input, dependencies = {}) {
  const database = dependencies.database || pool;
  const persistAttachments = dependencies.persistAttachments || persistGmailAttachmentsForTicket;
  const { agencyId, schoolOrganizationId, threadId = null, inReplyTo = null, referencesHeader = null,
    gmailMessageId = null, gmail = null, payload = null, receivedAt = new Date(),
    staffCopy = false, staffUserId = null, createIfMissing = true, generateDraft = true, preserveTicketState = false } = input;
  const from = emailKey(input.fromEmail);
  const messageId = String(input.messageId || (gmailMessageId ? `gmail:${gmailMessageId}` : '')).trim();
  if (!agencyId || !messageId || !from) throw supportEmailError('Email receipt needs an agency, sender and message ID.', 400);
  const db = await database.getConnection();
  const lockName = `support-email:${agencyId}`;
  let locked = false, ticket, ticketMessageId, duplicate = false, ignored = false, appOriginReceipt = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,5) AS acquired', [lockName]);
    if (Number(lock?.acquired) !== 1) throw supportEmailError('Ticket email intake is busy. Retry this receipt.');
    locked = true;
    await db.beginTransaction();
    const [[receipt]] = await db.execute('SELECT * FROM support_ticket_email_messages WHERE agency_id=? AND internet_message_id_hash=?', [agencyId, emailHash(messageId)]);
    if (receipt) {
      [[ticket]] = await db.execute('SELECT * FROM support_tickets WHERE id=?', [receipt.ticket_id]);
      ticketMessageId = receipt.ticket_message_id;
      duplicate = true;
      // Group/Gmail echoes are observations of the app's existing delivery.
      // Its delivery review owns the claimant, selected draft and composed body;
      // recording an external reply would replace that provenance in the digest.
      appOriginReceipt = receipt.direction === 'outbound' && !!(receipt.communication_id || receipt.client_request_key);
    } else {
      ticket = await findThread({ agencyId, threadId, messageId, inReplyTo, referencesHeader, fromEmail: from, staffCopy, targetTicketId: input.targetTicketId }, db);
      if (ticket && !input.targetTicketId) {
        const canonical = await resolveSupportTicketEmailThread(ticket, db);
        if (canonical.canonicalTicketId !== Number(ticket.id)) {
          [[ticket]] = await db.execute('SELECT * FROM support_tickets WHERE id=? AND agency_id=? FOR UPDATE', [canonical.canonicalTicketId, agencyId]);
        }
      }
      if (!ticket && (staffCopy || !createIfMissing)) {
        ignored = true;
      } else {
        const enc = prepareEncryptedTicketText(String(input.bodyText || '').slice(0, 60000));
        if (!ticket) {
          const [created] = await db.execute(`INSERT INTO support_tickets
            (agency_id,school_organization_id,created_by_user_id,created_by_source_key,source_channel,
             source_email_from,source_email_subject,source_email_message_id,source_email_thread_id,source_email_received_at,
             email_ingested_at,source_email_recipients,subject,question,question_ciphertext,question_iv,question_auth_tag,
             question_encryption_key_id,status,ai_draft_status,ai_draft_review_state)
            VALUES (?,?,?,'inbound_email','email',?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,'open','needs_review','pending')`,
          [agencyId, schoolOrganizationId || agencyId, input.createdByUserId || null, from,
            String(input.subject || '').slice(0, 255), messageId.slice(0, 255), threadId, receivedAt,
            JSON.stringify(input.recipients || []), String(input.subject || 'School message').slice(0, 255),
            enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId]);
          [[ticket]] = await db.execute('SELECT * FROM support_tickets WHERE id=?', [created.insertId]);
        } else if (ticket.source_email_message_id === messageId) {
          // Register the existing original seed instead of duplicating old intake.
          const [[seed]] = await db.execute(`SELECT id FROM support_ticket_messages WHERE ticket_id=?
            AND author_role='system_email' AND COALESCE(is_deleted,0)=0 ORDER BY id ASC LIMIT 1`, [ticket.id]);
          ticketMessageId = seed?.id || null;
          duplicate = !!ticketMessageId;
        }
        if (!ticketMessageId) {
          const [saved] = await db.execute(`INSERT INTO support_ticket_messages
            (ticket_id,author_user_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal,created_at)
            VALUES (?,?,?,?,?,?,?,?,0,?)`, [ticket.id, staffCopy ? staffUserId : input.createdByUserId || null,
            staffCopy ? 'system_email_outbound' : 'system_email', enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId, receivedAt]);
          ticketMessageId = saved.insertId;
        }
        await preserveSupportTicketEmailCanonical(ticket, db);
        await db.execute(`INSERT INTO support_ticket_email_messages
          (ticket_id,ticket_message_id,agency_id,direction,send_status,from_email,from_name,to_json,cc_json,subject,
           internet_message_id,internet_message_id_hash,in_reply_to,references_header,gmail_message_id,gmail_thread_id,sent_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [ticket.id, ticketMessageId, agencyId, staffCopy ? 'outbound' : 'inbound', staffCopy ? 'sent' : 'received', from,
          input.fromDisplayName || null, JSON.stringify(input.recipients || []), JSON.stringify(input.cc || []),
          String(input.subject || '').slice(0, 998), messageId, emailHash(messageId), inReplyTo, referencesHeader,
          gmailMessageId, threadId, receivedAt]);
        if (!staffCopy && !preserveTicketState) {
          // Keep the person who claimed the conversation across follow-ups/reopens.
          await db.execute(`UPDATE support_tickets SET status='open',updated_at=CURRENT_TIMESTAMP,
            ai_draft_response=NULL,ai_draft_status='needs_review',ai_draft_review_state='pending',
            ai_draft_metadata_json=JSON_SET(COALESCE(ai_draft_metadata_json,JSON_OBJECT()),
              '$.inboundEmailHeaders',CAST(? AS JSON),'$.gmailMessageId',?,'$.fromDisplayName',?),
            source_email_thread_id=COALESCE(?,source_email_thread_id) WHERE id=?`,
          [JSON.stringify({ autoSubmitted: String(input.headers?.autoSubmitted || '').slice(0, 100),
            listId: String(input.headers?.listId || '').slice(0, 200), listUnsubscribe: !!input.headers?.listUnsubscribe }),
            gmailMessageId, input.fromDisplayName || null, threadId, ticket.id]);
        }
      }
    }
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    db.release();
  }
  if (ignored) return { handled: false, ignored: true };
  if (payload && gmailMessageId) {
    const attachments = await persistAttachments({ ticketId: ticket.id, ticketMessageId, gmail, gmailMessageId, payload, strict: true });
    if (attachments?.incomplete || attachments?.skipped === 'table_missing') {
      throw supportEmailError('Email attachments are still being saved. Retry before drafting.', 503, 'SUPPORT_EMAIL_ATTACHMENTS_PENDING');
    }
  }
  if (staffCopy && !appOriginReceipt) {
    const review = dependencies.review || await import('./supportReplyReview.service.js');
    const [[lastInbound]] = await database.execute(`SELECT ticket_message_id AS id FROM support_ticket_email_messages
      WHERE ticket_id=? AND direction='inbound' AND COALESCE(sent_at,created_at)<=?
      ORDER BY COALESCE(sent_at,created_at) DESC,id DESC LIMIT 1`, [ticket.id, receivedAt]);
    await review.captureExternalReplyReview({ ticketId: ticket.id, agencyId, actorUserId: staffUserId,
      body: String(input.bodyText || ''), deliveryStatus: 'sent', transportMessageId: gmailMessageId,
      internetMessageId: messageId, sourceMessageId: lastInbound?.id || null, ticketMessageId,
      occurredAt: receivedAt, idempotencyKey: `ticket-email:${ticketMessageId}` });
  }
  if (!staffCopy && !appOriginReceipt && generateDraft) {
    const generate = dependencies.generateDraft || generateInboundSupportDraft;
    await generate({ ticketId: ticket.id, sourceMessageId: ticketMessageId, agencyId, intakeComplete: true });
  }
  const sync = dependencies.syncInbox || (async () => {
    const { syncEmailTicketsToInbox } = await import('./ticketEmailInboxAdapter.service.js');
    await syncEmailTicketsToInbox({ agencyId, ticketId: ticket.id, limit: 1, forceRefresh: true });
  });
  await sync().catch((error) => console.warn('[support email] inbox mirror pending:', error?.code || 'sync_failed'));
  return { handled: true, ticketId: ticket.id, ticketMessageId, duplicate, staffCopy };
}

const missingSchema = (error) => ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)
  || /doesn't exist|Unknown column/.test(String(error?.message || ''));

/** Enrich an existing, explicitly linked client only. Never search email names. */
export async function loadLinkedSupportClientDraftFacts(ticket, dependencies = {}) {
  const empty = { client: null, verifiedFacts: [], participants: [], contextUnknowns: [] };
  if (!ticket?.client_id) return empty;
  const clientId = Number(ticket.client_id), agencyId = Number(ticket.agency_id), schoolId = Number(ticket.school_organization_id);
  const unknown = () => ({ ...empty, contextUnknowns: ['linked_client_context_unavailable', 'assigned_provider_unconfirmed'] });
  if (!clientId || !agencyId || !schoolId) return unknown();
  const database = dependencies.database || pool;
  let scoped;
  try {
    [[scoped]] = await database.execute(`SELECT id,agency_id,organization_id,provider_id,status FROM clients
      WHERE id=? AND agency_id=? LIMIT 1`, [clientId, agencyId]);
    if (!scoped || Number(scoped.agency_id) !== agencyId || String(scoped.status || '').toUpperCase() === 'ARCHIVED') return unknown();
    try {
      const [[membership]] = await database.execute(`SELECT 1 AS assigned FROM client_organization_assignments
        WHERE client_id=? AND organization_id=? AND is_active=TRUE LIMIT 1`, [clientId, schoolId]);
      if (!membership) return unknown();
    } catch (error) {
      if (!missingSchema(error) || Number(scoped.organization_id) !== schoolId) return unknown();
    }
  } catch { return unknown(); }

  const findClient = dependencies.findClient || (async (id) => {
    const { default: Client } = await import('../models/Client.model.js');
    return Client.findById(id, { includeSensitive: false });
  });
  const [clientResult, providerResult] = await Promise.allSettled([
    findClient(clientId),
    database.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name FROM client_provider_assignments cpa
      JOIN users u ON u.id=cpa.provider_user_id WHERE cpa.client_id=? AND cpa.organization_id=?
      AND cpa.is_active=TRUE AND COALESCE(u.is_active,1)=1
      AND COALESCE(u.is_archived,0)=0 AND UPPER(COALESCE(u.status,''))<>'ARCHIVED'`, [clientId, schoolId])
  ]);
  const result = { ...empty, contextUnknowns: [] };
  const client = clientResult.status === 'fulfilled' ? clientResult.value : null;
  if (Number(client?.id) === clientId && Number(client?.agency_id) === agencyId) {
    // Client.findById currently returns more fields than includeSensitive promises.
    // Explicit projection keeps clinical notes, contact details and stale provider names out.
    result.client = { id: clientId, initials: client.initials, identifier_code: client.identifier_code,
      client_status_label: client.client_status_label, status: client.status,
      paperwork_status_label: client.paperwork_status_label, document_status: client.document_status };
    if (Number(scoped.organization_id) === schoolId) result.client.service_day = client.service_day;
  } else result.contextUnknowns.push('linked_client_context_unavailable');

  let providers = providerResult.status === 'fulfilled' ? providerResult.value[0] : [];
  // Fall back only when the primary school matches and no active assignment was found.
  // An operational query failure must not turn a possibly stale legacy value into evidence.
  const canUseLegacy = providerResult.status === 'fulfilled' || missingSchema(providerResult.reason);
  if (!providers.length && canUseLegacy && scoped.provider_id && Number(scoped.organization_id) === schoolId) {
    try {
      [providers] = await database.execute(`SELECT id,first_name,last_name FROM users WHERE id=?
        AND COALESCE(is_active,1)=1 AND COALESCE(is_archived,0)=0
        AND UPPER(COALESCE(status,''))<>'ARCHIVED' LIMIT 1`, [scoped.provider_id]);
    } catch { providers = []; }
  }
  const names = [...new Set(providers.map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim()).filter(Boolean))].sort();
  const source = 'Current active client assignment in this school';
  result.verifiedFacts = names.map((value) => ({ key: 'assigned_provider', value, source, shareable: true }));
  result.participants = names.map((name) => ({ name, role: 'therapist/provider (not the client)', source }));
  if (!names.length) result.contextUnknowns.push('assigned_provider_unconfirmed');
  return result;
}

export async function generateInboundSupportDraft({ ticketId, sourceMessageId, agencyId, intakeComplete }) {
  const { generateSupportEmailDraft } = await import('./supportEmailDraft.service.js');
  const { recordDraftSnapshot, getLatestDraftSnapshot } = await import('./supportReplyReview.service.js');
  const [[raw]] = await pool.execute('SELECT * FROM support_tickets WHERE id=? AND agency_id=?', [ticketId, agencyId]);
  if (!raw || raw.topic === 'technology') return null;
  const [messages] = await pool.execute(`SELECT m.*,e.direction AS email_direction,e.from_email AS email_from,
    e.send_status AS email_delivery_status FROM support_ticket_messages m
    LEFT JOIN support_ticket_email_messages e ON e.ticket_message_id=m.id
    WHERE m.ticket_id=? AND COALESCE(m.is_deleted,0)=0 ORDER BY m.id ASC`, [ticketId]);
  const revision = String(messages.at(-1)?.id || 0);
  const existing = await getLatestDraftSnapshot({ ticketId, agencyId, sourceMessageId, threadRevision: revision });
  if (existing) return existing;
  const attachments = await listTicketAttachments(ticketId);
  let intakeMetadata = raw.ai_draft_metadata_json || {};
  if (typeof intakeMetadata === 'string') { try { intakeMetadata = JSON.parse(intakeMetadata); } catch { intakeMetadata = {}; } }
  let claimant = null;
  if (raw.claimed_by_user_id) {
    [[claimant]] = await pool.execute('SELECT id,first_name,last_name FROM users WHERE id=?', [raw.claimed_by_user_id]);
  }
  const linkedClientFacts = await loadLinkedSupportClientDraftFacts(raw);
  const generated = await generateSupportEmailDraft({ ticket: decryptTicketRow(raw), ...linkedClientFacts,
    messages: messages.map(decryptTicketMessageRow), attachments, claimant, intakeComplete,
    headers: intakeMetadata.inboundEmailHeaders || {} });
  if (!generated?.text) {
    if (generated?.suppressed) return generated;
    throw supportEmailError('Reply draft generation is pending. The email has been saved.', 503, 'SUPPORT_DRAFT_PENDING');
  }
  const snapshot = await recordDraftSnapshot({ ticketId, agencyId, actorUserId: null, body: generated.text,
    sourceMessageId, threadRevision: revision, model: generated.modelName, provider: generated.provider,
    sourceEvidence: generated.metadata, requestKey: `inbound:${sourceMessageId}:${revision}` });
  // A slow generator must not replace a draft after a new inbound or sent reply.
  await pool.execute(`UPDATE support_tickets t SET ai_draft_response=?,ai_draft_status='needs_review',
    ai_draft_generated_at=CURRENT_TIMESTAMP,draft_generated_at=CURRENT_TIMESTAMP,ai_draft_review_state='pending',
    ai_draft_metadata_json=? WHERE t.id=? AND ?=(SELECT COALESCE(MAX(m.id),0) FROM support_ticket_messages m
      WHERE m.ticket_id=t.id AND COALESCE(m.is_deleted,0)=0)`,
  [generated.text, JSON.stringify({ ...intakeMetadata, ...generated.metadata, draftSnapshotId: snapshot.id || snapshot.draftSnapshotId,
    threadRevision: revision, sourceMessageId }), ticketId, Number(revision)]);
  return generated;
}
