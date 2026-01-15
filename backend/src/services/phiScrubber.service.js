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

