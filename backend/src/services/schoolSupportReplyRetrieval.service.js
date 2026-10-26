import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import {
  embedDocumentForRetrieval,
  embedQueryForRetrieval,
  hashEmbeddingContent
} from './geminiEmbedding.service.js';
import {
  buildLibraryEmbeddingDocument,
  buildTicketAnswerEmbeddingDocument,
  buildTicketSearchQuery,
  collectScrubTermsFromClient,
  deidentifySchoolReplyText,
  mapRetrievalMatchesToLibraryEntries,
  rankHybridReplyMatches,
  rankHistoricalReplyCandidates,
  REPLY_EMBEDDING_SOURCE_TYPES,
  hashReplyEmbeddingContent
} from '../utils/schoolSupportReplyRetrieval.shared.js';
import {
  inferIntentFromTicket,
  normalizeIntentKey,
  tokenizeReplyLibraryQuery,
  scoreReplyLibraryEntry,
  getIntentKeywords
} from '../utils/schoolSupportReplyLibrary.shared.js';
import { listReplyLibraryEntries } from './schoolSupportReplyLibrary.service.js';
import { decryptTicketMessageRow, decryptTicketRow } from '../utils/supportTicketCrypto.js';

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function hasEmbeddingsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'school_support_reply_embeddings'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

function mapEmbeddingRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    schoolOrganizationId: row.school_organization_id ? Number(row.school_organization_id) : null,
    intentKey: normalizeIntentKey(row.intent_key),
    sourceType: row.source_type,
    sourceId: row.source_id ? Number(row.source_id) : null,
    sourceRef: row.source_ref || null,
    title: row.title,
    searchText: row.search_text,
    replyExcerpt: row.reply_excerpt,
    embedding: parseJson(row.embedding_json, []) || [],
    embeddingModel: row.embedding_model,
    contentHash: row.content_hash,
    isActive: row.is_active === 1 || row.is_active === true
  };
}

function buildSourceRef(sourceType, sourceId = null, explicitRef = null) {
  if (explicitRef) return String(explicitRef);
  if (sourceId != null && sourceId !== '') return `${sourceType}:${sourceId}`;
  return null;
}

async function upsertEmbeddingRow({
  agencyId,
  schoolOrganizationId = null,
  intentKey = 'general',
  sourceType,
  sourceId = null,
  sourceRef = null,
  title,
  searchText,
  replyExcerpt,
  embedding,
  embeddingModel
}) {
  const resolvedRef = buildSourceRef(sourceType, sourceId, sourceRef);
  if (!resolvedRef) {
    throw new Error('sourceRef is required for embedding upsert');
  }
  const contentHash = hashReplyEmbeddingContent(searchText);
  const [existing] = await pool.execute(
    `SELECT id, content_hash
     FROM school_support_reply_embeddings
     WHERE agency_id = ? AND source_ref = ?
     LIMIT 1`,
    [Number(agencyId), resolvedRef]
  );
  const numericSourceId = sourceId != null && sourceId !== '' ? Number(sourceId) || null : null;

  if (existing?.[0]?.id) {
    if (existing[0].content_hash === contentHash) {
      await pool.execute(
        `UPDATE school_support_reply_embeddings
         SET is_active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [existing[0].id]
      );
      return existing[0].id;
    }
    await pool.execute(
      `UPDATE school_support_reply_embeddings
       SET school_organization_id = ?,
           intent_key = ?,
           source_type = ?,
           source_id = ?,
           title = ?,
           search_text = ?,
           reply_excerpt = ?,
           embedding_json = ?,
           embedding_model = ?,
           content_hash = ?,
           is_active = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        schoolOrganizationId ? Number(schoolOrganizationId) : null,
        normalizeIntentKey(intentKey),
        sourceType,
        numericSourceId,
        String(title || '').slice(0, 255),
        searchText,
        replyExcerpt,
        JSON.stringify(embedding || []),
        String(embeddingModel || 'unknown').slice(0, 64),
        contentHash,
        existing[0].id
      ]
    );
    return existing[0].id;
  }

  const [result] = await pool.execute(
    `INSERT INTO school_support_reply_embeddings
      (agency_id, school_organization_id, intent_key, source_type, source_id, source_ref, title,
       search_text, reply_excerpt, embedding_json, embedding_model, content_hash, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(agencyId),
      schoolOrganizationId ? Number(schoolOrganizationId) : null,
      normalizeIntentKey(intentKey),
      sourceType,
      numericSourceId,
      resolvedRef,
      String(title || '').slice(0, 255),
      searchText,
      replyExcerpt,
      JSON.stringify(embedding || []),
      String(embeddingModel || 'unknown').slice(0, 64),
      contentHash,
      1
    ]
  );
  return Number(result?.insertId || 0);
}

export async function deactivateReplyEmbedding({ agencyId, sourceType, sourceId = null, sourceRef = null }) {
  if (!(await hasEmbeddingsTable())) return;
  const resolvedRef = buildSourceRef(sourceType, sourceId, sourceRef);
  if (!resolvedRef) return;
  await pool.execute(
    `UPDATE school_support_reply_embeddings
     SET is_active = 0, updated_at = CURRENT_TIMESTAMP
     WHERE agency_id = ? AND source_ref = ?`,
    [Number(agencyId), resolvedRef]
  );
}

export async function indexReplyLibraryEntry(entry) {
  if (!(await hasEmbeddingsTable())) return { skipped: 'table_missing' };
  const agencyId = safeInt(entry?.agencyId || entry?.agency_id);
  const entryId = safeInt(entry?.id);
  if (!agencyId || !entryId) return { skipped: 'invalid_entry' };
  if (entry.isActive === false || entry.is_active === 0 || entry.is_active === false) {
    await deactivateReplyEmbedding({
      agencyId,
      sourceType: REPLY_EMBEDDING_SOURCE_TYPES.LIBRARY,
      sourceId: entryId
    });
    return { deactivated: true };
  }

  const searchText = buildLibraryEmbeddingDocument(entry);
  const replyExcerpt = deidentifySchoolReplyText(entry.bodyTemplate || entry.body_template || '');
  if (!searchText.trim() || !replyExcerpt.trim()) return { skipped: 'empty_content' };

  const { values, modelName } = await embedDocumentForRetrieval(searchText, { vertexOnly: true, sensitive: true });
  await upsertEmbeddingRow({
    agencyId,
    schoolOrganizationId: entry.schoolOrganizationId || entry.school_organization_id || null,
    intentKey: entry.intentKey || entry.intent_key,
    sourceType: REPLY_EMBEDDING_SOURCE_TYPES.LIBRARY,
    sourceId: entryId,
    title: entry.title,
    searchText,
    replyExcerpt,
    embedding: values,
    embeddingModel: modelName
  });
  return { indexed: true };
}

export async function indexTicketAnswerForRetrieval(ticket, { answer = null, client = null } = {}) {
  if (!(await hasEmbeddingsTable())) return { skipped: 'table_missing' };
  const agencyId = safeInt(ticket?.agency_id);
  const ticketId = safeInt(ticket?.id);
  if (!agencyId || !ticketId) return { skipped: 'invalid_ticket' };
  if (String(ticket?.source_channel || '').toLowerCase() !== 'email') return { skipped: 'not_email_ticket' };

  // Closing a ticket used to populate answer/answered_at without sending email.
  // Only the provider-confirmed ledger can establish a reusable sent response.
  let delivered;
  try {
    const [rows] = await pool.execute(
      `SELECT m.* FROM support_ticket_email_messages e
       JOIN support_ticket_messages m ON m.id = e.ticket_message_id
       WHERE e.ticket_id = ? AND e.direction = 'outbound' AND e.send_status = 'sent'
         AND e.gmail_message_id IS NOT NULL AND COALESCE(m.is_internal, 0) = 0
         AND COALESCE(m.is_deleted, 0) = 0
       ORDER BY e.sent_at DESC, e.id DESC LIMIT 1`, [ticketId]
    );
    delivered = rows?.[0] ? decryptTicketMessageRow(rows[0]) : null;
  } catch { return { skipped: 'delivery_evidence_unavailable' }; }
  if (!delivered?.body || delivered.body.includes('[Unable to decrypt]')) return { skipped: 'no_confirmed_email_delivery' };
  ticket = decryptTicketRow(ticket);

  const finalAnswer = String(delivered.body).trim();
  if (answer && String(answer).trim() !== finalAnswer) return { skipped: 'answer_not_confirmed_sent' };
  if (!finalAnswer) return { skipped: 'empty_answer' };

  let scrubClient = client;
  if (!scrubClient && ticket?.client_id) {
    try {
      scrubClient = await Client.findById(ticket.client_id, { includeSensitive: false });
    } catch {
      scrubClient = null;
    }
  }
  const scrubTerms = collectScrubTermsFromClient(scrubClient);
  const intentKey = inferIntentFromTicket(ticket);
  const searchText = buildTicketAnswerEmbeddingDocument({
    subject: ticket?.source_email_subject || ticket?.subject || '',
    question: ticket?.question || '',
    answer: finalAnswer,
    intentKey,
    scrubTerms
  });
  const replyExcerpt = deidentifySchoolReplyText(finalAnswer, scrubTerms);
  if (!searchText.trim() || !replyExcerpt.trim()) return { skipped: 'empty_content' };

  const { values, modelName } = await embedDocumentForRetrieval(searchText, { vertexOnly: true, sensitive: true });
  await upsertEmbeddingRow({
    agencyId,
    schoolOrganizationId: ticket?.school_organization_id || null,
    intentKey,
    sourceType: REPLY_EMBEDDING_SOURCE_TYPES.TICKET_ANSWER,
    sourceId: ticketId,
    title: `Past reply: ${String(ticket?.source_email_subject || ticket?.subject || `Ticket #${ticketId}`).slice(0, 200)}`,
    searchText,
    replyExcerpt,
    embedding: values,
    embeddingModel: modelName
  });
  return { indexed: true };
}

export async function indexGmailSentPairForRetrieval({
  agencyId,
  schoolOrganizationId = null,
  intentKey = 'general',
  gmailMessageId,
  title,
  searchText,
  replyExcerpt
} = {}) {
  if (!(await hasEmbeddingsTable())) return { skipped: 'table_missing' };
  const aid = safeInt(agencyId);
  const messageId = String(gmailMessageId || '').trim();
  if (!aid || !messageId || !String(searchText || '').trim() || !String(replyExcerpt || '').trim()) {
    return { skipped: 'invalid_payload' };
  }

  const { values, modelName } = await embedDocumentForRetrieval(searchText, { vertexOnly: true, sensitive: true });
  await upsertEmbeddingRow({
    agencyId: aid,
    schoolOrganizationId,
    intentKey,
    sourceType: REPLY_EMBEDDING_SOURCE_TYPES.GMAIL_SENT,
    sourceRef: `gmail:${messageId}`,
    title,
    searchText,
    replyExcerpt,
    embedding: values,
    embeddingModel: modelName
  });
  return { indexed: true };
}

export async function indexUserCommunicationForRetrieval(row, { agencyId = null } = {}) {
  if (!(await hasEmbeddingsTable())) return { skipped: 'table_missing' };
  const commId = safeInt(row?.id);
  const aid = safeInt(agencyId || row?.agency_id);
  if (!aid || !commId) return { skipped: 'invalid_communication' };

  let metadata = row?.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  const fromEmail = String(metadata?.fromEmail || '').toLowerCase();
  const isSchoolReply = fromEmail.includes('schoolreply') || fromEmail.includes('schools@itsco');
  if (!isSchoolReply && String(row?.template_type || '') !== 'identity_send') {
    return { skipped: 'not_school_reply' };
  }

  const subject = String(row?.subject || '').trim();
  const answer = String(row?.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!answer || answer.length < 20) return { skipped: 'empty_body' };

  const intentKey = inferIntentFromTicket({ subject, question: subject });
  const searchText = buildTicketAnswerEmbeddingDocument({
    subject,
    question: subject,
    answer,
    intentKey,
    scrubTerms: []
  });
  const replyExcerpt = deidentifySchoolReplyText(answer);
  const { values, modelName } = await embedDocumentForRetrieval(searchText, { vertexOnly: true, sensitive: true });
  await upsertEmbeddingRow({
    agencyId: aid,
    schoolOrganizationId: null,
    intentKey,
    sourceType: REPLY_EMBEDDING_SOURCE_TYPES.USER_COMMUNICATION,
    sourceId: commId,
    sourceRef: `comm:${commId}`,
    title: `Sent email: ${subject || `Communication #${commId}`}`.slice(0, 255),
    searchText,
    replyExcerpt,
    embedding: values,
    embeddingModel: modelName
  });
  return { indexed: true };
}

async function listActiveEmbeddingsForAgency({ agencyId, schoolOrganizationId = null, limit = 500 } = {}) {
  if (!(await hasEmbeddingsTable())) return [];
  const aid = safeInt(agencyId);
  if (!aid) return [];
  const params = [aid];
  let schoolClause = 'AND school_organization_id IS NULL';
  if (schoolOrganizationId) {
    schoolClause = "AND ((source_type = 'library' AND school_organization_id IS NULL) OR school_organization_id = ?)";
    params.push(Number(schoolOrganizationId));
  }
  const lim = Math.max(1, Math.min(Number(limit) || 500, 1000));
  const [rows] = await pool.execute(
    `SELECT *
     FROM school_support_reply_embeddings
     WHERE agency_id = ?
       AND is_active = 1
       AND source_type <> 'ticket_answer'
       ${schoolClause}
     ORDER BY updated_at DESC
     LIMIT ${lim}`,
    params
  );
  return (rows || []).map(mapEmbeddingRow).filter(Boolean);
}

export async function searchReplyKnowledgeSemantically({
  agencyId,
  schoolOrganizationId = null,
  subject = '',
  question = '',
  intentKey = null,
  limit = 4
} = {}) {
  const aid = safeInt(agencyId);
  if (!aid) return [];

  const inferredIntent = normalizeIntentKey(intentKey || 'general');
  const terms = tokenizeReplyLibraryQuery(`${subject} ${question}`);
  for (const w of getIntentKeywords(inferredIntent)) terms.push(w);

  const libraryEntries = await listReplyLibraryEntries({
    agencyId: aid,
    schoolOrganizationId,
    includeInactive: false,
    limit: 120
  }).catch(() => []);
  const embeddingRows = await listActiveEmbeddingsForAgency({ agencyId: aid, schoolOrganizationId });

  if (!embeddingRows.length) {
    return libraryEntries
      .map((entry) => ({
        entry,
        keywordScore: scoreReplyLibraryEntry(entry, terms, {
          intentKey: inferredIntent,
          schoolOrganizationId
        }),
        semanticScore: 0,
        hybridScore: 0,
        sourceType: REPLY_EMBEDDING_SOURCE_TYPES.LIBRARY
      }))
      .filter((row) => row.keywordScore > 0)
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, Math.max(1, Math.min(Number(limit) || 4, 8)));
  }

  let queryVector = null;
  try {
    const queryText = buildTicketSearchQuery({
      subject,
      question,
      intentKey: inferredIntent
    });
    const embedded = await embedQueryForRetrieval(queryText, { vertexOnly: true, sensitive: true });
    queryVector = embedded.values;
  } catch (err) {
    console.warn('[schoolSupportReplyRetrieval] query embedding failed:', err?.message || err);
  }

  return rankHybridReplyMatches({
    libraryEntries,
    embeddingRows,
    queryTerms: terms,
    queryVector,
    intentKey: inferredIntent,
    schoolOrganizationId,
    limit
  });
}

export async function matchReplyKnowledgeForTicket({
  agencyId,
  schoolOrganizationId = null,
  subject = '',
  question = '',
  intentKey = null,
  limit = 4,
  excludeTicketId = null
} = {}) {
  const [ranked, deliveredHistory] = await Promise.all([
    searchReplyKnowledgeSemantically({
    agencyId,
    schoolOrganizationId,
    subject,
    question,
    intentKey,
    limit
    }).catch(() => []),
    listDeliveredReplyHistory({ agencyId, schoolOrganizationId, excludeTicketId }).catch(() => [])
  ]);
  const matches = mapRetrievalMatchesToLibraryEntries(ranked)
    .filter((entry) => !excludeTicketId || Number(entry.sourceTicketId) !== Number(excludeTicketId));
  const history = rankHistoricalReplyCandidates({ candidates: deliveredHistory, subject, question, intentKey, limit });
  return [...matches, ...history]
    .sort((a, b) => (Number(b.retrievalScore) || 0) - (Number(a.retrievalScore) || 0))
    .filter((entry, i, all) => all.findIndex((other) => other.id === entry.id || (other.sourceTicketId && other.sourceTicketId === entry.sourceTicketId)) === i)
    .slice(0, Math.max(1, Math.min(Number(limit) || 4, 8)));
}

/** Same-school, provider-confirmed email pairs. Never use closure notes or internal messages. */
export async function listDeliveredReplyHistory({ agencyId, schoolOrganizationId = null, excludeTicketId = null } = {}) {
  const aid = safeInt(agencyId);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT e.ticket_id, e.ticket_message_id, t.source_email_subject, t.subject,
            t.ai_draft_metadata_json, c.full_name AS client_full_name,
            c.initials AS client_initials, c.identifier_code AS client_identifier_code,
            m.body, m.body_ciphertext, m.body_iv, m.body_auth_tag, m.encryption_key_id,
            inbound.body AS inbound_body, inbound.body_ciphertext AS inbound_ciphertext,
            inbound.body_iv AS inbound_iv, inbound.body_auth_tag AS inbound_auth_tag,
            inbound.encryption_key_id AS inbound_key_id
     FROM support_ticket_email_messages e
     JOIN support_tickets t ON t.id = e.ticket_id AND t.agency_id = e.agency_id
     LEFT JOIN clients c ON c.id = t.client_id AND c.agency_id = t.agency_id
     JOIN support_ticket_messages m ON m.id = e.ticket_message_id
     JOIN support_ticket_messages inbound ON inbound.id = (
       SELECT prior.ticket_message_id FROM support_ticket_email_messages prior
       WHERE prior.ticket_id = e.ticket_id AND prior.direction = 'inbound'
         AND COALESCE(prior.sent_at, prior.created_at) <= COALESCE(e.sent_at, e.created_at)
       ORDER BY COALESCE(prior.sent_at, prior.created_at) DESC, prior.id DESC LIMIT 1
     )
     WHERE e.agency_id = ? AND t.school_organization_id <=> ?
       AND (? IS NULL OR t.id <> ?) AND e.direction = 'outbound' AND e.send_status = 'sent'
       AND e.gmail_message_id IS NOT NULL AND COALESCE(m.is_internal, 0) = 0
       AND COALESCE(m.is_deleted, 0) = 0 AND COALESCE(inbound.is_internal, 0) = 0
       AND COALESCE(inbound.is_deleted, 0) = 0
     ORDER BY COALESCE(e.sent_at, e.created_at) DESC, e.id DESC LIMIT 80`,
    [aid, safeInt(schoolOrganizationId), safeInt(excludeTicketId), safeInt(excludeTicketId)]
  );
  return (rows || []).map((row) => {
    const question = decryptTicketMessageRow({ body: row.inbound_body, body_ciphertext: row.inbound_ciphertext, body_iv: row.inbound_iv, body_auth_tag: row.inbound_auth_tag, encryption_key_id: row.inbound_key_id }).body;
    const answer = decryptTicketMessageRow(row).body;
    const subject = row.source_email_subject || row.subject || '';
    const metadata = parseJson(row.ai_draft_metadata_json, {}) || {};
    const scrubTerms = [
      ...collectScrubTermsFromClient({ full_name: row.client_full_name, initials: row.client_initials, identifier_code: row.client_identifier_code }),
      ...String(row.client_full_name || '').split(/\s+/).filter((part) => part.length >= 3),
      ...(Array.isArray(metadata.extractedClientReferences) ? metadata.extractedClientReferences.filter((value) => typeof value === 'string') : [])
    ];
    return { ticketId: row.ticket_id, messageId: row.ticket_message_id, subject, question, answer, scrubTerms, intentKey: inferIntentFromTicket({ subject, question }) };
  }).filter((pair) => pair.question && pair.answer && !`${pair.question} ${pair.answer}`.includes('[Unable to decrypt]'));
}

export async function reindexAgencyReplyEmbeddings(agencyId, { limit = 300 } = {}) {
  if (!(await hasEmbeddingsTable())) return { skipped: 'table_missing', indexed: 0, failed: 0 };
  const aid = safeInt(agencyId);
  if (!aid) return { skipped: 'invalid_agency', indexed: 0, failed: 0 };

  const entries = await listReplyLibraryEntries({
    agencyId: aid,
    includeInactive: false,
    limit: Math.max(1, Math.min(Number(limit) || 300, 500))
  });

  let indexed = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      const result = await indexReplyLibraryEntry(entry);
      if (result?.indexed) indexed += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[schoolSupportReplyRetrieval] library index failed #${entry.id}:`, err?.message || err);
    }
  }

  const [ticketRows] = await pool.execute(
    `SELECT *
     FROM support_tickets
     WHERE agency_id = ?
       AND source_channel = 'email'
       AND school_organization_id IS NOT NULL
       AND answer IS NOT NULL
       AND TRIM(answer) <> ''
     ORDER BY answered_at DESC, id DESC
     LIMIT ${Math.max(1, Math.min(Number(limit) || 300, 500))}`,
    [aid]
  );

  for (const ticket of ticketRows || []) {
    try {
      const result = await indexTicketAnswerForRetrieval(ticket);
      if (result?.indexed) indexed += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[schoolSupportReplyRetrieval] ticket index failed #${ticket.id}:`, err?.message || err);
    }
  }

  const [commRows] = await pool.execute(
    `SELECT *
     FROM user_communications
     WHERE agency_id = ?
       AND channel = 'email'
       AND delivery_status IN ('sent', 'delivered')
       AND body IS NOT NULL
       AND TRIM(body) <> ''
     ORDER BY COALESCE(sent_at, generated_at) DESC, id DESC
     LIMIT ${Math.max(1, Math.min(Number(limit) || 300, 500))}`,
    [aid]
  );

  for (const comm of commRows || []) {
    try {
      const result = await indexUserCommunicationForRetrieval(comm, { agencyId: aid });
      if (result?.indexed) indexed += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[schoolSupportReplyRetrieval] communication index failed #${comm.id}:`, err?.message || err);
    }
  }

  let gmailResult = { indexed: 0, scanned: 0, skipped: 0, failed: 0 };
  try {
    const { backfillSchoolReplyGmailHistory } = await import('./schoolSupportGmailHistory.service.js');
    gmailResult = await backfillSchoolReplyGmailHistory({
      agencyId: aid,
      maxMessages: Math.max(1, Math.min(Number(limit) || 300, 500)),
      maxThreads: Math.max(1, Math.min(Number(limit) || 300, 500)),
      skipExisting: true
    });
    indexed += Number(gmailResult?.indexed || 0);
    failed += Number(gmailResult?.failed || 0);
  } catch (err) {
    failed += 1;
    console.warn('[schoolSupportReplyRetrieval] gmail backfill failed:', err?.message || err);
  }

  return {
    indexed,
    failed,
    libraryCount: entries.length,
    ticketCount: (ticketRows || []).length,
    communicationCount: (commRows || []).length,
    gmail: gmailResult
  };
}

// Fire-and-forget helpers for write paths.
export function queueReplyLibraryEmbeddingIndex(entry) {
  indexReplyLibraryEntry(entry).catch((err) => {
    console.warn('[schoolSupportReplyRetrieval] async library index failed:', err?.message || err);
  });
}

export function queueTicketAnswerEmbeddingIndex(ticket, { answer = null } = {}) {
  indexTicketAnswerForRetrieval(ticket, { answer }).catch((err) => {
    console.warn('[schoolSupportReplyRetrieval] async ticket index failed:', err?.message || err);
  });
}

export { hashEmbeddingContent };
