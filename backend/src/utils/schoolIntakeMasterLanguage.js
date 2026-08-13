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
