import crypto from 'crypto';
import {
  normalizeIntentKey,
  scoreReplyLibraryEntry,
  tokenizeReplyLibraryQuery,
  SCHOOL_REPLY_INTENT_LABELS
} from './schoolSupportReplyLibrary.shared.js';

export const REPLY_EMBEDDING_SOURCE_TYPES = Object.freeze({
  LIBRARY: 'library',
  TICKET_ANSWER: 'ticket_answer',
  GMAIL_SENT: 'gmail_sent',
  USER_COMMUNICATION: 'user_communication'
});

const HYBRID_KEYWORD_WEIGHT = 0.35;
const HYBRID_SEMANTIC_WEIGHT = 0.65;
const DEFAULT_SEMANTIC_MIN_SCORE = 0.62;

export function deidentifySchoolReplyText(text, scrubTerms = []) {
  let out = String(text || '');
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
  out = out.replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ID]');

  const terms = [...new Set((scrubTerms || []).map((t) => String(t || '').trim()).filter((t) => t.length >= 2))]
    .sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), '[CLIENT]');
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function collectScrubTermsFromClient(client = null) {
  if (!client) return [];
  return [
    client.full_name,
    client.first_name,
    client.last_name,
    client.initials,
    client.identifier_code,
    client.preferred_name
  ].filter(Boolean);
}

export function buildLibraryEmbeddingDocument(entry = {}) {
  const parts = [
    entry.title,
    entry.intentKey || entry.intent_key,
    ...(entry.tags || []),
    ...(entry.keywords || []),
    entry.subjectTemplate || entry.subject_template,
    entry.bodyTemplate || entry.body_template
  ];
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join('\n');
}

export function buildTicketAnswerEmbeddingDocument({
  subject = '',
  question = '',
  answer = '',
  intentKey = 'general',
  scrubTerms = []
} = {}) {
  const subjectClean = deidentifySchoolReplyText(subject, scrubTerms);
  const questionClean = deidentifySchoolReplyText(question, scrubTerms);
  const answerClean = deidentifySchoolReplyText(answer, scrubTerms);
  return [
    `Intent: ${normalizeIntentKey(intentKey)}`,
    subjectClean ? `Subject: ${subjectClean}` : '',
    questionClean ? `School asked: ${questionClean}` : '',
    answerClean ? `ITSCO replied: ${answerClean}` : ''
  ].filter(Boolean).join('\n');
}

export function buildTicketSearchQuery({ subject = '', question = '', intentKey = 'general' } = {}) {
  return [
    `Intent: ${normalizeIntentKey(intentKey)}`,
    subject ? `Subject: ${subject}` : '',
    question ? `School asked: ${question}` : ''
  ].filter(Boolean).join('\n');
}

export function hashReplyEmbeddingContent(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

export function cosineSimilarity(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeKeywordScore(score, maxScore = 24) {
  const raw = Number(score) || 0;
  if (raw <= 0) return 0;
  return Math.min(1, raw / Math.max(1, Number(maxScore) || 24));
}

export function combineHybridRetrievalScore({ keywordScore = 0, semanticScore = 0 } = {}) {
  const keyword = normalizeKeywordScore(keywordScore);
  const semantic = Math.max(0, Math.min(1, Number(semanticScore) || 0));
  if (!semantic) return keyword;
  if (!keyword) return semantic;
  return (HYBRID_KEYWORD_WEIGHT * keyword) + (HYBRID_SEMANTIC_WEIGHT * semantic);
}

export function rankHybridReplyMatches({
  libraryEntries = [],
  embeddingRows = [],
  queryTerms = [],
  queryVector = null,
  intentKey = null,
  schoolOrganizationId = null,
  limit = 4,
  semanticMinScore = DEFAULT_SEMANTIC_MIN_SCORE
} = {}) {
  const byLibraryId = new Map((libraryEntries || []).map((entry) => [Number(entry.id), entry]));
  const keywordScores = new Map();
  for (const entry of libraryEntries || []) {
    const score = scoreReplyLibraryEntry(entry, queryTerms, { intentKey, schoolOrganizationId });
    if (score > 0) keywordScores.set(Number(entry.id), score);
  }

  const ranked = [];
  for (const row of embeddingRows || []) {
    const sourceType = String(row.sourceType || row.source_type || '').toLowerCase();
    const sourceId = Number(row.sourceId || row.source_id || 0) || null;
    const sourceRef = row.sourceRef || row.source_ref || null;
    const semanticScore = queryVector
      ? cosineSimilarity(queryVector, row.embedding || row.embedding_json || [])
      : 0;
    const keywordScore = sourceType === REPLY_EMBEDDING_SOURCE_TYPES.LIBRARY
      ? (keywordScores.get(sourceId) || 0)
      : 0;
    const hybridScore = combineHybridRetrievalScore({ keywordScore, semanticScore });
    if (hybridScore <= 0) continue;
    if (!keywordScore && semanticScore < semanticMinScore) continue;

    let entry = null;
    if (sourceType === REPLY_EMBEDDING_SOURCE_TYPES.LIBRARY) {
      entry = byLibraryId.get(sourceId) || {
        id: sourceId,
        title: row.title,
        bodyTemplate: row.replyExcerpt || row.reply_excerpt,
        intentKey: row.intentKey || row.intent_key,
        retrievalSource: 'library'
      };
    } else if (sourceType === REPLY_EMBEDDING_SOURCE_TYPES.TICKET_ANSWER
      || sourceType === REPLY_EMBEDDING_SOURCE_TYPES.GMAIL_SENT
      || sourceType === REPLY_EMBEDDING_SOURCE_TYPES.USER_COMMUNICATION) {
      entry = {
        id: `past-${sourceType}-${sourceId || sourceRef || ''}`,
        title: row.title || 'Similar past reply',
        bodyTemplate: row.replyExcerpt || row.reply_excerpt,
        intentKey: normalizeIntentKey(row.intentKey || row.intent_key),
        retrievalSource: sourceType === REPLY_EMBEDDING_SOURCE_TYPES.GMAIL_SENT
          ? 'gmail_sent'
          : (sourceType === REPLY_EMBEDDING_SOURCE_TYPES.USER_COMMUNICATION ? 'user_communication' : 'ticket_answer'),
        sourceTicketId: sourceType === REPLY_EMBEDDING_SOURCE_TYPES.TICKET_ANSWER ? sourceId : null
      };
    }

    ranked.push({
      entry,
      keywordScore,
      semanticScore,
      hybridScore,
      sourceType
    });
  }

  // Keyword-only library hits without embeddings still matter.
  for (const [id, keywordScore] of keywordScores.entries()) {
    if (ranked.some((r) => Number(r.entry?.id) === id)) continue;
    const entry = byLibraryId.get(id);
    if (!entry) continue;
    ranked.push({
      entry,
      keywordScore,
      semanticScore: 0,
      hybridScore: normalizeKeywordScore(keywordScore),
      sourceType: REPLY_EMBEDDING_SOURCE_TYPES.LIBRARY
    });
  }

  return ranked
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, Math.max(1, Math.min(Number(limit) || 4, 8)));
}

export function mapRetrievalMatchesToLibraryEntries(ranked = []) {
  return ranked.map((row) => ({
    ...row.entry,
    intentLabel: SCHOOL_REPLY_INTENT_LABELS[row.entry?.intentKey] || 'General',
    retrievalScore: row.hybridScore,
    semanticScore: row.semanticScore,
    keywordScore: row.keywordScore,
    retrievalSource: row.sourceType === REPLY_EMBEDDING_SOURCE_TYPES.TICKET_ANSWER
      ? 'ticket_answer'
      : row.sourceType === REPLY_EMBEDDING_SOURCE_TYPES.GMAIL_SENT
        ? 'gmail_sent'
        : row.sourceType === REPLY_EMBEDDING_SOURCE_TYPES.USER_COMMUNICATION
          ? 'user_communication'
          : (row.entry?.retrievalSource || 'library')
  }));
}
