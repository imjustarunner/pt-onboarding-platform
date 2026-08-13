/** Drop leftover "(English)" / "(ES)" tags and use Spanish packet naming when locale is es. */
export function localizePublicIntakeTitle(title, locale = 'en') {
  const raw = String(title || '').trim();
  const stripped = raw.replace(/\s*\((English|EN|ES|Español|Spanish)\)\s*$/i, '').trim() || raw;
  const lang = String(locale || 'en').trim().toLowerCase();
  if (!(lang === 'es' || lang.startsWith('es'))) return stripped;
  if (/school referral|referral packet|smart school|school referral master/i.test(stripped)) {
    return 'Paquete digital de referidos escolares';
  }
  return stripped;
}
