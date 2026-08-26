/**
 * Frontend PHI guard helpers for Note Aid dictation / typing.
 * Backend still scrubs before Gemini; this prompts clinicians to use roles.
 */

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'client', 'patient',
  'mother', 'father', 'parent', 'guardian', 'child', 'session', 'today'
]);

function looksLikeNameToken(tok) {
  if (!/^[A-Za-z]{2,}$/.test(tok)) return false;
  return !STOP.has(tok.toLowerCase());
}

export const PHI_ROLE_HINTS = [
  { label: 'Client / patient', examples: ['client', 'patient', 'the client'] },
  { label: 'Mother of client (MOC)', examples: ['MOC', 'mother of client', "client's mother"] },
  { label: 'Father of client (FOC)', examples: ['FOC', 'father of client', "client's father"] },
  { label: 'Guardian / caregiver', examples: ['guardian', 'caregiver', 'grandmother of client'] }
];

/**
 * Build name strings from a client row (and optional guardians).
 */
export function collectFrontendPhiNames(client, guardians = []) {
  const names = new Set();
  const add = (v) => {
    const s = String(v || '').trim();
    if (s) names.add(s);
  };
  if (!client) return [];
  add(client.full_name || client.name);
  add(client.first_name || client.firstName);
  add(client.last_name || client.lastName);
  const full = String(client.full_name || client.name || '').trim();
  if (full) full.split(/\s+/).forEach(add);
  for (const g of guardians || []) {
    add(`${g.first_name || g.firstName || ''} ${g.last_name || g.lastName || ''}`.trim());
    add(g.first_name || g.firstName);
    add(g.last_name || g.lastName);
  }
  return [...names];
}

/**
 * @returns {Array<{ token: string, matched: string }>}
 */
export function detectKnownNamesInText(text, extraNames = []) {
  const hay = String(text || '');
  if (!hay.trim() || !extraNames?.length) return [];
  const found = new Map();
  for (const name of extraNames) {
    const full = String(name || '').trim();
    if (!full) continue;
    const tokens = full.split(/\s+/).filter((t) => t.length >= 4 && looksLikeNameToken(t));
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

export const PHI_PRIVACY_BANNER =
  'Do not include protected health information (PHI) such as names, addresses, phone numbers, or dates of birth in typed or dictated text. Use roles instead: client/patient, MOC (mother of client), FOC (father of client), guardian, caregiver, etc. Identifiers are scrubbed before AI, but role language keeps notes privacy-safe.';
