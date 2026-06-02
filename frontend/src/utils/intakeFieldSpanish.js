/** Whether admin enabled per-question Spanish labels on this intake link. */
export function spanishQuestionLabelsEnabledFromLink(link) {
  const cm = link?.custom_messages || link?.customMessages || null;
  return !!(cm && cm.spanishQuestionLabelsEnabled);
}

const ES_PROP = {
  label: 'labelEs',
  helperText: 'helperTextEs',
  placeholder: 'placeholderEs',
  description: 'descriptionEs'
};

/**
 * Returns true only when `stored` is a real Spanish translation —
 * i.e. it is non-empty AND different from the English source (case-insensitive).
 * Guards against the case where the AI translation was run but returned the
 * original English text and that got saved into the *Es field.
 */
export function isActuallyTranslated(stored, en) {
  const s = String(stored || '').trim();
  if (!s) return false;
  const e = String(en || '').trim();
  if (!e) return true; // No English to compare — treat stored value as valid.
  return s.toLowerCase() !== e.toLowerCase();
}

/** Resolved Spanish override for a field property, or empty if none. */
export function storedSpanishFieldText(field, prop = 'label', locale = 'en', enabled = false) {
  if (!field || locale !== 'es' || !enabled) return '';
  const key = ES_PROP[prop] || `${prop}Es`;
  const stored = String(field[key] || '').trim();
  if (!stored) return '';
  // Derive the English source for this property so we can detect untranslated values.
  const en = prop === 'label'
    ? String(field.label || field.key || '').trim()
    : String(field[prop] || '').trim();
  return isActuallyTranslated(stored, en) ? stored : '';
}

/** English display text for a field property. */
export function englishFieldText(field, prop = 'label') {
  if (!field) return '';
  if (prop === 'label') return String(field.label || field.key || '').trim();
  return String(field[prop] || '').trim();
}

/** Copy Spanish label fields into intake_fields payload rows. */
export function spanishExtrasForIntakeField(f) {
  if (!f || typeof f !== 'object') return {};
  const out = {};
  for (const [en, es] of Object.entries(ES_PROP)) {
    const v = String(f[es] || '').trim();
    if (v) out[es] = v;
  }
  const opts = Array.isArray(f.options) ? f.options : [];
  const mapped = opts
    .map((o) => {
      if (!o || typeof o !== 'object') return o;
      const labelEs = String(o.labelEs || '').trim();
      if (!labelEs) return o;
      return { ...o, labelEs };
    })
    .filter(Boolean);
  if (mapped.some((o) => o?.labelEs)) out.options = mapped;
  return out;
}

/** Collect strings + mutation targets for bulk AI translation. */
export function collectSpanishTranslationTargets(steps, getStepFields) {
  const strings = new Set();
  const targets = [];

  const add = (field, prop, text) => {
    const t = String(text || '').trim();
    if (!t) return;
    strings.add(t);
    targets.push({ field, prop, source: t });
  };

  for (const step of steps || []) {
    const type = String(step?.type || '').trim();
    if (!['questions', 'clinical_questions', 'demographics'].includes(type)) continue;
    const fields = typeof getStepFields === 'function' ? getStepFields(step) : step.fields || [];
    for (const field of fields) {
      if (!field || field.type === 'info') continue;
      add(field, 'labelEs', field.label);
      add(field, 'helperTextEs', field.helperText);
      add(field, 'placeholderEs', field.placeholder);
      add(field, 'descriptionEs', field.description);
      for (const opt of field.options || []) {
        if (!opt) continue;
        add(opt, 'labelEs', opt.label || opt.value);
      }
    }
  }

  return { strings: [...strings], targets };
}
