export const SCHOOL_REPLY_INTENT_KEYS = Object.freeze([
  'school_status_request',
  'school_reinit_update',
  'new_staff_contact',
  'packet_received',
  'scheduling',
  'general'
]);

export const SCHOOL_REPLY_INTENT_LABELS = Object.freeze({
  school_status_request: 'Client status update',
  school_reinit_update: 'Year reinit / roster update',
  new_staff_contact: 'New school staff / contact',
  packet_received: 'Packet / referral received',
  scheduling: 'Scheduling / service day',
  general: 'General'
});

const INTENT_KEYWORDS = Object.freeze({
  school_status_request: ['status', 'update', 'progress', 'where', 'checklist', 'paperwork', 'roi', 'intake'],
  school_reinit_update: ['reinit', 're-init', 'returning', 'fall', 'roster', 'continuation', 'year update'],
  new_staff_contact: ['add', 'contact', 'staff', 'listserv', 'portal', 'account', 'password', 'counselor'],
  packet_received: ['packet', 'referral', 'pdf', 'attachment', 'enrollment', 'intake form'],
  scheduling: ['schedule', 'day', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'provider', 'assigned'],
  general: []
});

const QUERY_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'our', 'out', 'has',
  'have', 'been', 'what', 'when', 'who', 'how', 'why', 'does', 'did', 'about', 'with', 'from', 'this', 'that',
  'they', 'them', 'their', 'your', 'into', 'please', 'school', 'itsco', 'hello', 'hi', 'thanks', 'thank'
]);

export function normalizeIntentKey(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return SCHOOL_REPLY_INTENT_KEYS.includes(key) ? key : 'general';
}

export function tokenizeReplyLibraryQuery(text) {
  const raw = String(text || '').toLowerCase()
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 48);
  const preferred = raw.filter((t) => t.length >= 3 || /^(roi|pdf)$/.test(t));
  const filtered = preferred.filter((t) => !QUERY_STOPWORDS.has(t));
  const terms = filtered.length ? filtered : preferred;
  return Array.from(new Set(terms)).slice(0, 24);
}

export function scoreReplyLibraryEntry(entry, terms, { intentKey = null, schoolOrganizationId = null } = {}) {
  if (!entry?.isActive && entry?.isActive !== undefined) return 0;
  let score = 0;
  const hay = [
    entry.title,
    entry.bodyTemplate,
    entry.subjectTemplate,
    ...(entry.tags || []),
    ...(entry.keywords || []),
    ...(INTENT_KEYWORDS[entry.intentKey] || [])
  ].join(' ').toLowerCase();

  for (const term of terms) {
    if (!term) continue;
    if (hay.includes(term)) score += term.length >= 4 ? 3 : 2;
  }

  if (intentKey && entry.intentKey === intentKey) score += 8;
  if (schoolOrganizationId && entry.schoolOrganizationId === schoolOrganizationId) score += 6;
  else if (!entry.schoolOrganizationId) score += 1;
  score += Math.min(5, Number(entry.usageCount || 0));
  return score;
}

export function inferIntentFromTicket(ticket = {}) {
  let meta = null;
  try {
    meta = typeof ticket.ai_draft_metadata_json === 'string'
      ? JSON.parse(ticket.ai_draft_metadata_json)
      : (ticket.ai_draft_metadata_json || null);
  } catch {
    meta = null;
  }

  const detected = []
    .concat(meta?.detectedIntentClasses || [])
    .concat(meta?.allowedDetectedIntents || [])
    .concat(meta?.allowedIntentClasses || [])
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean);

  for (const key of SCHOOL_REPLY_INTENT_KEYS) {
    if (detected.includes(key)) return key;
  }

  const blob = `${ticket?.subject || ''} ${ticket?.question || ''} ${ticket?.source_email_subject || ''}`.toLowerCase();
  let best = 'general';
  let bestScore = 0;
  for (const key of SCHOOL_REPLY_INTENT_KEYS) {
    if (key === 'general') continue;
    const words = INTENT_KEYWORDS[key] || [];
    let hits = 0;
    for (const w of words) {
      if (blob.includes(w)) hits += 1;
    }
    if (hits > bestScore) {
      bestScore = hits;
      best = key;
    }
  }
  return bestScore > 0 ? best : 'general';
}

export function buildReplyLibraryPromptBlock(matches = []) {
  const list = Array.isArray(matches) ? matches.filter(Boolean) : [];
  if (!list.length) return '';

  const lines = [
    '',
    'Approved reply examples (adapt tone/details; do not copy PHI placeholders literally):'
  ];
  for (const entry of list.slice(0, 4)) {
    const label = entry.retrievalSource === 'ticket_answer'
      || entry.retrievalSource === 'gmail_sent'
      || entry.retrievalSource === 'user_communication'
      ? 'Similar past reply'
      : (entry.intentLabel || entry.intentKey || 'Library');
    lines.push(
      `- [${label}] ${entry.title}:`,
      String(entry.bodyTemplate || '').trim()
    );
  }
  lines.push('', 'Prefer adapting a matching example when appropriate.');
  return lines.join('\n');
}

export function summarizeLibrarySources(matches = []) {
  return (matches || []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    intentKey: entry.intentKey,
    intentLabel: entry.intentLabel || SCHOOL_REPLY_INTENT_LABELS[entry.intentKey],
    retrievalSource: entry.retrievalSource || 'library',
    sourceTicketId: entry.sourceTicketId || null,
    retrievalScore: entry.retrievalScore || null
  }));
}

export function getIntentKeywords(intentKey) {
  return INTENT_KEYWORDS[normalizeIntentKey(intentKey)] || [];
}
