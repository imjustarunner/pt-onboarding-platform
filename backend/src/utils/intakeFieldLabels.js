/** Admin-enabled per-question Spanish labels (stored on intake_links.custom_messages). */
export function spanishQuestionLabelsEnabled(link) {
  const cm = link?.custom_messages;
  if (!cm || typeof cm !== 'object') return false;
  return !!cm.spanishQuestionLabelsEnabled;
}

const ES_PROP = {
  label: 'labelEs',
  helperText: 'helperTextEs',
  placeholder: 'placeholderEs',
  description: 'descriptionEs'
};

/** Locale used for PDF / answer summaries: submission preference, then link language. */
export function resolveIntakeFormLocale(link, intakeData) {
  const fromSubmission = String(
    intakeData?.formLocale ||
      intakeData?.responses?.submission?.formLocale ||
      ''
  )
    .trim()
    .toLowerCase();
  if (fromSubmission.startsWith('es')) return 'es';
  const code = String(link?.language_code || 'en').trim().toLowerCase();
  return code.startsWith('es') ? 'es' : 'en';
}

export function resolveIntakeFieldLabel(field, locale, link) {
  if (!field) return '';
  const enabled = spanishQuestionLabelsEnabled(link);
  if (locale === 'es' && enabled) {
    const es = String(field.labelEs || '').trim();
    if (es) return es;
  }
  return String(field.label || field.key || '').trim();
}

export function resolveIntakeFieldText(field, prop, locale, link) {
  if (!field) return '';
  const enabled = spanishQuestionLabelsEnabled(link);
  const esKey = ES_PROP[prop] || `${prop}Es`;
  if (locale === 'es' && enabled) {
    const es = String(field[esKey] || '').trim();
    if (es) return es;
  }
  if (prop === 'label') return String(field.label || field.key || '').trim();
  return String(field[prop] || '').trim();
}

export function resolveOptionLabel(opt, locale, link) {
  if (!opt) return '';
  const enabled = spanishQuestionLabelsEnabled(link);
  if (locale === 'es' && enabled) {
    const es = String(opt.labelEs || '').trim();
    if (es) return es;
  }
  return String(opt.label || opt.value || '').trim();
}
