function looksLikeNameToken(tok) {
  // Require letters only and at least 2 chars. Reject common small words.
  if (!/^[A-Za-z]{2,}$/.test(tok)) return false;
  const lower = tok.toLowerCase();
  const stop = new Set([
    'the','and','for','with','from','this','that','please','thanks','hello','hi','team','school','student','client','parent',
    'billing','admin','administrative','clinical','status','question','update','re','fw'
  ]);
  return !stop.has(lower);
}

function toClientCode(first, last) {
  const a = String(first || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const b = String(last || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  if (!a || !b) return null;
  return `${a}${b}`;
}

/**
 * Scrub obvious "Name: First Last" patterns into a short code.
 *
 * Example:
 *  "Student: John Doe called" -> "Student: JOHDOE called"
 *
 * This is intentionally conservative; it will not attempt to rewrite all capitalized words.
 */
/**
 * Scrub intake free-text before sending to Gemini/Note Aid.
 *
 * Removes / replaces:
 *  - Email addresses
 *  - US phone numbers (various formats)
 *  - DOB patterns (MM/DD/YYYY, YYYY-MM-DD, "born MM/DD/YYYY", etc.)
 *  - Member-ID-like runs of 7–12 digits (insurance IDs, SSN fragments, etc.)
 *  - "Name: First Last" patterns via scrubClientNamesToCode
 *  - Any extra known names passed in extraNames[]
 *
 * Clinical content (diagnoses, symptom descriptions, service codes, etc.) is preserved.
 */
export function scrubIntakeTextForNoteWriter(text, { extraNames = [] } = {}) {
  let s = String(text || '');

  // Email addresses
  s = s.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // US phone numbers — (555) 123-4567, 555-123-4567, 5551234567, +1-555-123-4567, etc.
  s = s.replace(
    /(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/g,
    '[PHONE]'
  );

  // DOB patterns: "DOB: MM/DD/YYYY", "born 01/01/2000", "date of birth: YYYY-MM-DD", bare MM/DD/YYYY
  s = s.replace(
    /(?:(?:dob|d\.o\.b|date of birth|born)[:\s]+)?\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/gi,
    '[DOB]'
  );
  s = s.replace(
    /(?:dob|d\.o\.b|date of birth)[:\s]+(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/gi,
    '[DOB]'
  );
  // ISO DOB when explicitly labelled
  s = s.replace(
    /\b(?:born|dob)[:\s]+(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/gi,
    '[DOB]'
  );

  // Member-ID-like runs: 7–12 standalone digits (insurance IDs, SSNs, etc.)
  // Exclude 4-digit years and plain short integers used in clinical text.
  s = s.replace(/\b\d{7,12}\b/g, '[ID]');

  // Name: patterns
  s = scrubClientNamesToCode(s);

  // Extra known names — tokenize each name and replace every token ≥ 4 chars
  for (const name of extraNames) {
    const tokens = String(name || '')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const token of tokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[NAME]');
    }
  }

  return s;
}

/**
 * Detect known person-name tokens in free text (client / guardian names).
 * Conservative: only tokens ≥ 4 letters from the provided name list.
 * @returns {Array<{ token: string, matched: string }>}
 */
export function detectKnownNamesInText(text, { extraNames = [] } = {}) {
  const hay = String(text || '');
  if (!hay.trim() || !Array.isArray(extraNames) || !extraNames.length) return [];

  const found = new Map();
  for (const name of extraNames) {
    const full = String(name || '').trim();
    if (!full) continue;
    const tokens = full.split(/\s+/).filter((t) => t.length >= 4 && looksLikeNameToken(t));
    // Prefer matching the full multi-word name first when present
    if (tokens.length >= 2) {
      const escapedFull = full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp(`\\b${escapedFull}\\b`, 'i').test(hay)) {
        found.set(full.toLowerCase(), { token: full, matched: full });
        continue;
      }
    }
    for (const token of tokens) {
      const key = token.toLowerCase();
      if (found.has(key)) continue;
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(hay)) {
        found.set(key, { token, matched: full });
      }
    }
  }
  return [...found.values()];
}

export function scrubClientNamesToCode(text) {
  const s = String(text || '');
  // Capture label + up to 4 tokens; use first and last token as name parts.
  return s.replace(
    /\b(Name|Student|Client|Parent)\s*:\s*([A-Za-z]{2,})(?:\s+([A-Za-z]{2,}))?(?:\s+([A-Za-z]{2,}))?(?:\s+([A-Za-z]{2,}))?/g,
    (match, label, t1, t2, t3, t4) => {
      const tokens = [t1, t2, t3, t4].filter(Boolean);
      const clean = tokens.filter(looksLikeNameToken);
      if (clean.length < 2) return match; // not enough to safely transform
      const code = toClientCode(clean[0], clean[clean.length - 1]);
      if (!code) return match;
      return `${label}: ${code}`;
    }
  );
}

