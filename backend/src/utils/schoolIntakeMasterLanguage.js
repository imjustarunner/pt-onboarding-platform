/** Public ?locale= / formLocale → en|es, else the link's language. */
export function resolveRequestedMasterLanguage(queryOrCode, fallback = 'en') {
  const raw = (queryOrCode && typeof queryOrCode === 'object')
    ? String(queryOrCode.locale || queryOrCode.lang || queryOrCode.formLocale || '').trim()
    : String(queryOrCode || '').trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('en')) return 'en';
  const fb = String(fallback || 'en').trim().toLowerCase();
  return fb === 'es' || fb.startsWith('es') ? 'es' : 'en';
}

export const DEFAULT_SPANISH_CLARIFICATION_STEP = {
  id: 'spanish_clarification',
  type: 'spanish_clarification',
  label: 'Aclaración de idioma',
  visibility: 'always'
};

function langCode(languageCode) {
  const raw = String(languageCode || 'en').trim().toLowerCase();
  return raw === 'es' || raw.startsWith('es') ? 'es' : 'en';
}

/** Spanish clarification is first on ES masters; stripped from EN. */
export function ensureSpanishClarificationFirst(steps, languageCode = 'en') {
  const lang = langCode(languageCode);
  const list = Array.isArray(steps) ? [...steps] : [];
  if (lang !== 'es') {
    return list.filter((s) => String(s?.type || '').toLowerCase() !== 'spanish_clarification');
  }
  const idx = list.findIndex((s) => String(s?.type || '').toLowerCase() === 'spanish_clarification');
  if (idx < 0) {
    list.unshift({ ...DEFAULT_SPANISH_CLARIFICATION_STEP });
    return list;
  }
  if (idx > 0) {
    const [sc] = list.splice(idx, 1);
    list.unshift(sc);
  }
  return list;
}

/** Drop leftover "(English)" / "(ES)" tags and use Spanish packet naming when locale is es. */
export function localizeSchoolReferralPacketTitle(title, languageCode = 'en') {
  const raw = String(title || '').trim();
  const stripped = raw.replace(/\s*\((English|EN|ES|Español|Spanish)\)\s*$/i, '').trim() || raw;
  if (langCode(languageCode) !== 'es') return stripped;
  if (/school referral|referral packet|smart school|school referral master/i.test(stripped)) {
    return 'Paquete digital de referidos escolares';
  }
  return stripped;
}
