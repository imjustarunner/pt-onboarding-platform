/** Drop leftover "(English)" / "(ES)" tags and use enrollment packet naming for school titles. */
export function localizePublicIntakeTitle(title, locale = 'en') {
  const raw = String(title || '').trim();
  const stripped = raw.replace(/\s*\((English|EN|ES|Español|Spanish)\)\s*$/i, '').trim() || raw;
  const lang = String(locale || 'en').trim().toLowerCase();
  if (/school referral|referral packet|smart school|school referral master/i.test(stripped)) {
    if (lang === 'es' || lang.startsWith('es')) {
      return 'Paquete digital de inscripción escolar';
    }
    return 'Digital Enrollment Packet';
  }
  return stripped;
}
