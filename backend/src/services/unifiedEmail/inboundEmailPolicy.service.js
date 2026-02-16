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

export function extractClientReferenceHeuristic({ subject, bodyText }) {
  const text = normalizeSpace(`${subject || ''} ${bodyText || ''}`);
  if (!text) return null;

  const patterns = [
    /status(?:\s+on|\s+for|\s+update on)?\s+([A-Za-z][A-Za-z0-9'.\- ]{1,40})\??/i,
    /when is\s+([A-Za-z][A-Za-z0-9'.\- ]{1,40})\s+going to be ready\??/i,
    /where are we at with\s+([A-Za-z][A-Za-z0-9'.\- ]{1,40})\??/i
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return normalizeSpace(m[1]);
  }

  const tokens = tokenize(text);
  const caps = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g) || [];
  if (caps.length) return normalizeSpace(caps[caps.length - 1]);
  if (tokens.length) return normalizeSpace(tokens.slice(-2).join(' '));
  return null;
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
