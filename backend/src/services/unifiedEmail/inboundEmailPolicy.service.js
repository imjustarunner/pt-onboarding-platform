export const EMAIL_AI_POLICY_MODES = {
  HUMAN_ONLY: 'human_only',
  DRAFT_KNOWN_CONTACTS_ONLY: 'draft_known_contacts_only',
  DRAFT_KNOWN_ACCOUNTS_ONLY: 'draft_known_accounts_only',
  DRAFT_KNOWN_CONTACTS_OR_ACCOUNTS: 'draft_known_contacts_or_accounts'
};

export function normalizeEmailAiPolicyMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_CONTACTS_ONLY) return v;
  if (v === EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_ACCOUNTS_ONLY) return v;
  if (v === EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_CONTACTS_OR_ACCOUNTS) return v;
  return EMAIL_AI_POLICY_MODES.HUMAN_ONLY;
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeAlphaNum(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(value) {
  return normalizeSpace(String(value || '').toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function isStatusIntentHeuristic({ subject, bodyText }) {
  const text = `${String(subject || '')}\n${String(bodyText || '')}`.toLowerCase();
  const patterns = [
    /\bstatus\b/,
    /\bstatus update\b/,
    /\bwhere are we at\b/,
    /\bwhen is\b.+\bready\b/,
    /\bjust wondering\b/,
    /\bupdate on\b/
  ];
  return patterns.some((re) => re.test(text));
}

const STOP_NAME_PHRASES = new Set([
  'status update',
  'status request',
  'thank you',
  'good morning',
  'good afternoon',
  'dear team',
  'hello team',
  'please advise',
  'can you',
  'would you',
  'let me know',
  'request',
  'these',
  'those',
  'them',
  'student',
  'students',
  'client',
  'clients',
  'update',
  'russell',
  'thanks',
  'please',
  'hello',
  'hi team'
]);

function cleanExtractedName(raw) {
  let s = normalizeSpace(String(raw || '').replace(/[*_]+/g, ' ').replace(/\s+/g, ' '));
  // Strip trailing em-dash school tags: "request — Russell"
  s = s.replace(/\s+[—–-]\s+.*$/, '').trim();
  s = s.replace(/[?.!,;:]+$/g, '').trim();
  if (!s) return null;
  if (STOP_NAME_PHRASES.has(s.toLowerCase())) return null;
  // Require at least a first + last token (or a compact initials-like token).
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const compact = normalizeAlphaNum(parts[0]);
    if (compact.length < 4 || compact.length > 12) return null;
    // Single token must look like a name/initials blob, not a common word
    if (STOP_NAME_PHRASES.has(parts[0].toLowerCase())) return null;
    return s;
  }
  if (parts.length > 4) return null;
  // Drop leading greetings / labels
  if (/^(re|fw|fwd|status|update|regarding|need|please)$/i.test(parts[0])) return null;
  // Each name token should start with a letter and look name-like
  if (!parts.every((p) => /^[A-Za-z][A-Za-z'.\-]*$/.test(p))) return null;
  return s;
}

/**
 * Extract one or more likely client name references from a status email.
 * Supports:
 *  - "status on Destiny Roberts"
 *  - Bullet / starred privacy-truncated lists: "* Jazmine Sant*" / "• Aedan Raymo"
 *  - Capitalized First Last phrases
 */
export function extractClientReferencesHeuristic({ subject, bodyText }) {
  const rawBody = String(bodyText || '');
  const rawSubject = String(subject || '');
  const found = [];
  const seen = new Set();

  const push = (raw) => {
    const cleaned = cleanExtractedName(raw);
    if (!cleaned) return;
    const key = normalizeAlphaNum(cleaned);
    if (!key || key.length < 4 || seen.has(key)) return;
    seen.add(key);
    found.push(cleaned);
  };

  // 1) Explicit status phrasing — require "on/for/update on" so "Status request" does not match
  const text = normalizeSpace(`${rawSubject} ${rawBody}`);
  const patterns = [
    /status(?:\s+update)?\s+(?:on|for)\s+([A-Za-z][A-Za-z0-9'.\- ]{1,40})\??/gi,
    /when is\s+([A-Za-z][A-Za-z0-9'.\- ]{1,40})\s+going to be ready\??/gi,
    /where are we at with\s+([A-Za-z][A-Za-z0-9'.\- ]{1,40})\??/gi,
    /(?:update)\s+(?:for|on)\s+([A-Za-z][A-Za-z0-9'.\- ]{1,40})\??/gi
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(text)) !== null) {
      push(m[1]);
    }
  }

  // 2) Line / bullet list of names (common in school roster emails)
  const lines = rawBody.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    const bullet = trimmed.match(/^(?:[-*•]|\d+[.)])\s*([A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*){0,3})\s*\*?$/);
    if (bullet?.[1]) {
      push(bullet[1]);
      continue;
    }
    // Privacy-truncated trailing asterisks: "Jazmine Sant*"
    const starred = trimmed.match(/^[*•\-\d.)\s]*([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){0,2})\*+\s*$/);
    if (starred?.[1]) push(starred[1]);
  }

  // 3) Fallback: capitalized First Last phrases (require 2+ tokens)
  if (!found.length) {
    const caps = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b/g) || [];
    for (const cap of caps) push(cap);
  }

  // 4) Last resort: last two tokens of the whole text if they look like a name
  if (!found.length) {
    const tokens = tokenize(text);
    if (tokens.length >= 2) push(tokens.slice(-2).join(' '));
  }

  return found;
}

/** Back-compat: first extracted reference, or null. */
export function extractClientReferenceHeuristic({ subject, bodyText }) {
  const refs = extractClientReferencesHeuristic({ subject, bodyText });
  return refs[0] || null;
}

function buildClientSearchKeys(client) {
  const keys = [];
  const push = (value) => {
    const raw = normalizeSpace(value);
    if (!raw) return;
    keys.push(raw);
    keys.push(normalizeAlphaNum(raw));
  };
  push(client?.full_name);
  push(client?.first_name);
  push(client?.last_name);
  push(client?.initials);
  push(client?.identifier_code);
  // Fuzzy shorthand aliases such as "JohDon" for "John Donahue".
  const first = normalizeSpace(client?.first_name || '');
  const last = normalizeSpace(client?.last_name || '');
  if (first && last) {
    push(`${first.slice(0, 3)}${last.slice(0, 3)}`);
    push(`${first.slice(0, 4)}${last.slice(0, 3)}`);
  } else if (client?.full_name) {
    const parts = normalizeSpace(client.full_name).split(' ').filter(Boolean);
    if (parts.length >= 2) {
      push(`${parts[0].slice(0, 3)}${parts[parts.length - 1].slice(0, 3)}`);
      push(`${parts[0].slice(0, 4)}${parts[parts.length - 1].slice(0, 3)}`);
    }
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

function overlapScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const b = new Set(bTokens);
  let hit = 0;
  for (const t of aTokens) if (b.has(t)) hit += 1;
  return hit / Math.max(aTokens.length, bTokens.length);
}

function scoreClientMatch(query, client) {
  const q = normalizeSpace(query);
  const qNorm = normalizeAlphaNum(q);
  if (!qNorm) return { score: 0, reason: 'empty_query' };

  const keys = buildClientSearchKeys(client);
  // Also score against initials derived from the query itself (handles truncated
  // last names like "Jazmine Sant" → JAZSAN matching stored "Jazmine Santiago").
  try {
    // Lazy import avoided — derive inline to keep this module free of circular deps.
    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const take3 = (token) => String(token || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
      const derived = `${take3(parts[0])}${take3(parts[parts.length - 1])}`;
      if (derived.length === 6) {
        keys.push(derived);
        keys.push(derived.toLowerCase());
      }
    }
  } catch { /* ignore */ }

  let best = 0;
  let reason = 'none';
  for (const key of keys) {
    if (!key) continue;
    const keyNorm = normalizeAlphaNum(key);
    if (!keyNorm) continue;
    if (keyNorm === qNorm) return { score: 1, reason: 'exact' };
    if (keyNorm.includes(qNorm) || qNorm.includes(keyNorm)) {
      best = Math.max(best, 0.9);
      reason = 'substring';
    }
    // Exact initials match (6-letter school initials)
    if (keyNorm.length === 6 && qNorm.length >= 4 && (keyNorm === qNorm || keyNorm.startsWith(qNorm) || qNorm.startsWith(keyNorm))) {
      const initialsBoost = keyNorm === qNorm ? 0.98 : 0.88;
      if (initialsBoost > best) {
        best = initialsBoost;
        reason = 'initials';
      }
    }
    const prefixMatch = keyNorm.startsWith(qNorm) || qNorm.startsWith(keyNorm);
    if (prefixMatch) {
      best = Math.max(best, 0.82);
      reason = reason === 'none' ? 'prefix' : reason;
    }
    const score = overlapScore(tokenize(q), tokenize(key));
    if (score > best) {
      best = score;
      reason = 'token_overlap';
    }
  }
  return { score: Math.min(1, best), reason };
}

export function matchSchoolClient({ query, clients }) {
  const list = Array.isArray(clients) ? clients : [];
  if (!query || list.length === 0) return { match: null, confidence: 0, reason: 'no_query_or_clients', candidates: [] };

  const scored = list.map((client) => {
    const { score, reason } = scoreClientMatch(query, client);
    return { client, score, reason };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0] || null;
  const second = scored[1] || null;
  if (!top || top.score < 0.6) {
    return {
      match: null,
      confidence: top?.score || 0,
      reason: 'low_confidence',
      candidates: scored.slice(0, 3)
    };
  }
  if (second && second.score >= Math.max(0.7, top.score - 0.08)) {
    return {
      match: null,
      confidence: top.score,
      reason: 'ambiguous',
      candidates: scored.slice(0, 3)
    };
  }
  return {
    match: top.client,
    confidence: top.score,
    reason: top.reason,
    candidates: scored.slice(0, 3)
  };
}

export function isSenderAllowedForPolicy({
  policyMode,
  isKnownContact,
  isKnownAccount
}) {
  const mode = normalizeEmailAiPolicyMode(policyMode);
  if (mode === EMAIL_AI_POLICY_MODES.HUMAN_ONLY) return false;
  if (mode === EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_CONTACTS_ONLY) return !!isKnownContact;
  if (mode === EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_ACCOUNTS_ONLY) return !!isKnownAccount;
  if (mode === EMAIL_AI_POLICY_MODES.DRAFT_KNOWN_CONTACTS_OR_ACCOUNTS) return !!isKnownContact || !!isKnownAccount;
  return false;
}
