// Very small v1 address parser for US-style addresses.
// Goal: best-effort split of a single-line string into street/city/state/zip.

export function parseUsAddressLoose(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();

  // Common formats:
  // "123 Main St, Denver, CO 80202"
  // "123 Main St Denver CO 80202"
  // "123 Main St, Denver CO, 80202"
  const zipMatch = normalized.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[0] : null;

  // State: 2-letter code
  const stateMatch = normalized.match(/\b([A-Z]{2})\b/);
  const state = stateMatch ? stateMatch[1] : null;

  // If we have commas, prefer splitting by commas.
  const parts = normalized.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const street = parts[0] || null;
    const city = parts[1] || null;
    return { street, city, state, postalCode: zip };
  }

  // Fallback heuristic: last tokens contain state + zip; city before that; rest is street.
  const tokens = normalized.split(' ').filter(Boolean);
  let zipIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^\d{5}(?:-\d{4})?$/.test(tokens[i])) {
      zipIdx = i;
      break;
    }
  }
  let stateIdx = -1;
  for (let i = (zipIdx > 0 ? zipIdx - 1 : tokens.length - 1); i >= 0; i--) {
    if (/^[A-Z]{2}$/.test(tokens[i])) {
      stateIdx = i;
      break;
    }
  }

  if (stateIdx > 0) {
    const cityTokens = tokens.slice(Math.max(1, stateIdx - 2), stateIdx); // 1-2 tokens for city
    const city = cityTokens.join(' ') || null;
    const street = tokens.slice(0, Math.max(1, stateIdx - cityTokens.length)).join(' ') || null;
    return { street, city, state: tokens[stateIdx] || state, postalCode: zip };
  }

  // If we can’t split, at least return street as the full string.
  return { street: normalized, city: null, state, postalCode: zip };
}

