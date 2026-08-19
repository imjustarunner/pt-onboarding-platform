/**
 * School support reply library — curated templates for school-facing ticket/email replies.
 * Phase 1: CRUD, keyword match, prompt injection, promote-from-ticket.
 */
import pool from '../config/database.js';
import {
  SCHOOL_REPLY_INTENT_KEYS,
  SCHOOL_REPLY_INTENT_LABELS,
  buildReplyLibraryPromptBlock,
  getIntentKeywords,
  inferIntentFromTicket,
  normalizeIntentKey,
  scoreReplyLibraryEntry,
  summarizeLibrarySources,
  tokenizeReplyLibraryQuery
} from '../utils/schoolSupportReplyLibrary.shared.js';

export {
  SCHOOL_REPLY_INTENT_KEYS,
  SCHOOL_REPLY_INTENT_LABELS,
  buildReplyLibraryPromptBlock,
  inferIntentFromTicket,
  summarizeLibrarySources,
  tokenizeReplyLibraryQuery
};

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

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    schoolOrganizationId: row.school_organization_id ? Number(row.school_organization_id) : null,
    intentKey: normalizeIntentKey(row.intent_key),
    intentLabel: SCHOOL_REPLY_INTENT_LABELS[normalizeIntentKey(row.intent_key)] || 'General',
    title: row.title,
    subjectTemplate: row.subject_template || null,
    bodyTemplate: row.body_template,
    tags: parseJson(row.tags_json, []) || [],
    keywords: parseJson(row.keywords_json, []) || [],
    sourceTicketId: row.source_ticket_id ? Number(row.source_ticket_id) : null,
    usageCount: Number(row.usage_count || 0),
    isActive: row.is_active === 1 || row.is_active === true,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updatedByUserId: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listReplyLibraryEntries({
  agencyId,
  schoolOrganizationId = null,
  intentKey = null,
  includeInactive = false,
  search = null,
  limit = 200
} = {}) {
  const aid = safeInt(agencyId);
  if (!aid) return [];

  const where = ['agency_id = ?'];
  const params = [aid];
  if (!includeInactive) {
    where.push('is_active = TRUE');
  }
  if (intentKey) {
    where.push('intent_key = ?');
    params.push(normalizeIntentKey(intentKey));
  }
  if (schoolOrganizationId) {
    where.push('(school_organization_id IS NULL OR school_organization_id = ?)');
    params.push(Number(schoolOrganizationId));
  }

  const lim = Math.max(1, Math.min(Number(limit) || 200, 500));
  const [rows] = await pool.execute(
    `SELECT *
     FROM school_support_reply_library
     WHERE ${where.join(' AND ')}
     ORDER BY usage_count DESC, updated_at DESC, id DESC
     LIMIT ${lim}`,
    params
  );

  let entries = (rows || []).map(mapRow).filter(Boolean);
  const q = String(search || '').trim();
  if (q) {
    const terms = tokenizeReplyLibraryQuery(q);
    entries = entries
      .map((entry) => ({ entry, score: scoreReplyLibraryEntry(entry, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.entry);
  }
  return entries;
}

export async function getReplyLibraryEntry(id) {
  const entryId = safeInt(id);
  if (!entryId) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM school_support_reply_library WHERE id = ? LIMIT 1`,
    [entryId]
  );
  return mapRow(rows?.[0]);
}

export async function createReplyLibraryEntry({
  agencyId,
  schoolOrganizationId = null,
  intentKey = 'general',
  title,
  subjectTemplate = null,
  bodyTemplate,
  tags = [],
  keywords = [],
  sourceTicketId = null,
  createdByUserId = null
} = {}) {
  const aid = safeInt(agencyId);
  const body = String(bodyTemplate || '').trim();
  const label = String(title || '').trim();
  if (!aid || !body || !label) {
    throw Object.assign(new Error('agencyId, title, and bodyTemplate are required'), { status: 400 });
  }

  const [result] = await pool.execute(
    `INSERT INTO school_support_reply_library
      (agency_id, school_organization_id, intent_key, title, subject_template, body_template,
       tags_json, keywords_json, source_ticket_id, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      aid,
      schoolOrganizationId ? Number(schoolOrganizationId) : null,
      normalizeIntentKey(intentKey),
      label.slice(0, 255),
      subjectTemplate ? String(subjectTemplate).slice(0, 500) : null,
      body,
      JSON.stringify(Array.isArray(tags) ? tags : []),
      JSON.stringify(Array.isArray(keywords) ? keywords : []),
      sourceTicketId ? Number(sourceTicketId) : null,
      createdByUserId ? Number(createdByUserId) : null,
      createdByUserId ? Number(createdByUserId) : null
    ]
  );
  const created = await getReplyLibraryEntry(result.insertId);
  try {
    const { queueReplyLibraryEmbeddingIndex } = await import('./schoolSupportReplyRetrieval.service.js');
    queueReplyLibraryEmbeddingIndex(created);
  } catch {
    // best-effort
  }
  return created;
}

export async function updateReplyLibraryEntry(id, {
  schoolOrganizationId,
  intentKey,
  title,
  subjectTemplate,
  bodyTemplate,
  tags,
  keywords,
  isActive,
  updatedByUserId = null
} = {}) {
  const entryId = safeInt(id);
  if (!entryId) throw Object.assign(new Error('Invalid entry id'), { status: 400 });

  const fields = [];
  const params = [];
  if (schoolOrganizationId !== undefined) {
    fields.push('school_organization_id = ?');
    params.push(schoolOrganizationId ? Number(schoolOrganizationId) : null);
  }
  if (intentKey !== undefined) {
    fields.push('intent_key = ?');
    params.push(normalizeIntentKey(intentKey));
  }
  if (title !== undefined) {
    fields.push('title = ?');
    params.push(String(title || '').slice(0, 255));
  }
  if (subjectTemplate !== undefined) {
    fields.push('subject_template = ?');
    params.push(subjectTemplate ? String(subjectTemplate).slice(0, 500) : null);
  }
  if (bodyTemplate !== undefined) {
    fields.push('body_template = ?');
    params.push(String(bodyTemplate || ''));
  }
  if (tags !== undefined) {
    fields.push('tags_json = ?');
    params.push(JSON.stringify(Array.isArray(tags) ? tags : []));
  }
  if (keywords !== undefined) {
    fields.push('keywords_json = ?');
    params.push(JSON.stringify(Array.isArray(keywords) ? keywords : []));
  }
  if (isActive !== undefined) {
    fields.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }
  if (updatedByUserId) {
    fields.push('updated_by_user_id = ?');
    params.push(Number(updatedByUserId));
  }
  if (!fields.length) return getReplyLibraryEntry(entryId);

  params.push(entryId);
  await pool.execute(
    `UPDATE school_support_reply_library SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  const updated = await getReplyLibraryEntry(entryId);
  try {
    const { queueReplyLibraryEmbeddingIndex } = await import('./schoolSupportReplyRetrieval.service.js');
    queueReplyLibraryEmbeddingIndex(updated);
  } catch {
    // best-effort
  }
  return updated;
}

export async function deactivateReplyLibraryEntry(id, { updatedByUserId = null } = {}) {
  const entry = await updateReplyLibraryEntry(id, { isActive: false, updatedByUserId });
  try {
    const { deactivateReplyEmbedding } = await import('./schoolSupportReplyRetrieval.service.js');
    await deactivateReplyEmbedding({
      agencyId: entry?.agencyId,
      sourceType: 'library',
      sourceId: entry?.id
    });
  } catch {
    // best-effort
  }
  return entry;
}

export async function matchReplyLibraryForTicket({
  agencyId,
  schoolOrganizationId = null,
  subject = '',
  question = '',
  intentKey = null,
  limit = 4
} = {}) {
  const aid = safeInt(agencyId);
  if (!aid) return [];

  try {
    const { matchReplyKnowledgeForTicket } = await import('./schoolSupportReplyRetrieval.service.js');
    const matches = await matchReplyKnowledgeForTicket({
      agencyId: aid,
      schoolOrganizationId,
      subject,
      question,
      intentKey,
      limit
    });
    if (matches.length) return matches;
  } catch (err) {
    console.warn('[schoolSupportReplyLibrary] semantic retrieval failed, using keyword fallback:', err?.message || err);
  }

  const inferredIntent = normalizeIntentKey(intentKey || 'general');
  const terms = tokenizeReplyLibraryQuery(`${subject} ${question}`);
  for (const w of getIntentKeywords(inferredIntent)) terms.push(w);

  const entries = await listReplyLibraryEntries({
    agencyId: aid,
    schoolOrganizationId,
    intentKey: null,
    includeInactive: false,
    limit: 120
  });

  return entries
    .map((entry) => ({
      entry,
      score: scoreReplyLibraryEntry(entry, terms, { intentKey: inferredIntent, schoolOrganizationId })
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || 4, 8)))
    .map((x) => x.entry);
}

export async function recordReplyLibraryUsage(entryIds = []) {
  const ids = [...new Set((entryIds || []).map((id) => safeInt(id)).filter(Boolean))];
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await pool.execute(
    `UPDATE school_support_reply_library
     SET usage_count = usage_count + 1
     WHERE id IN (${placeholders})`,
    ids
  );
}

export async function promoteTicketAnswerToLibrary({
  ticket,
  answer,
  title,
  intentKey = null,
  schoolOrganizationId = null,
  createdByUserId = null
} = {}) {
  const aid = safeInt(ticket?.agency_id);
  const ticketId = safeInt(ticket?.id);
  const body = String(answer || ticket?.answer || '').trim();
  const label = String(title || '').trim()
    || String(ticket?.subject || ticket?.source_email_subject || 'School reply').trim()
    || 'School reply';
  if (!aid || !body) {
    throw Object.assign(new Error('Ticket agency and answer text are required'), { status: 400 });
  }

  const inferredIntent = normalizeIntentKey(intentKey || inferIntentFromTicket(ticket));
  const schoolId = schoolOrganizationId || ticket?.school_organization_id || null;
  const subjectTemplate = ticket?.source_email_subject || ticket?.subject || null;

  return createReplyLibraryEntry({
    agencyId: aid,
    schoolOrganizationId: schoolId,
    intentKey: inferredIntent,
    title: label,
    subjectTemplate,
    bodyTemplate: body,
    tags: [inferredIntent],
    keywords: tokenizeReplyLibraryQuery(`${ticket?.subject || ''} ${ticket?.question || ''}`).slice(0, 12),
    sourceTicketId: ticketId,
    createdByUserId
  });
}
