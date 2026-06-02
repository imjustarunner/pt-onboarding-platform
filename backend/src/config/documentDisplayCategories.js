/**
 * Employee document hub category ids (kept in sync with frontend/src/config/documentDisplayCategories.js).
 */

export const DOCUMENT_DISPLAY_CATEGORY_IDS = [
  'onboarding',
  'payroll_tax',
  'benefits',
  'policies',
  'licenses_credentials',
  'credentialing',
  'safety',
  'training_ce',
  'client_participant',
  'personal',
  'other',
];

export const LEGACY_CATEGORY_ALIASES = {
  signatures: 'other',
  reviews: 'other',
  compliance: 'policies',
  professional: 'training_ce',
};

const ALLOWED = new Set(DOCUMENT_DISPLAY_CATEGORY_IDS);

export function normalizeLegacyCategoryId(id) {
  const s = String(id || '').trim();
  if (!s) return null;
  if (LEGACY_CATEGORY_ALIASES[s]) return LEGACY_CATEGORY_ALIASES[s];
  return s;
}

export function normalizeEmployeeDisplayCategory(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null };
  }
  const normalized = normalizeLegacyCategoryId(raw);
  if (!normalized || !ALLOWED.has(normalized)) {
    return {
      error: `employeeDisplayCategory must be one of: ${DOCUMENT_DISPLAY_CATEGORY_IDS.join(', ')} (or empty)`,
    };
  }
  return { value: normalized };
}

export function sanitizeDocumentsCategoryOrder(raw) {
  const fallback = [...DOCUMENT_DISPLAY_CATEGORY_IDS];
  if (!Array.isArray(raw)) return fallback;
  const seen = new Set();
  const merged = [];
  for (const item of raw) {
    const id = normalizeLegacyCategoryId(item);
    if (id && ALLOWED.has(id) && !seen.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  for (const id of fallback) {
    if (!seen.has(id)) merged.push(id);
  }
  return merged;
}
