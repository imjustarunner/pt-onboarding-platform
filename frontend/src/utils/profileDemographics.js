export const BIRTHDATE_FIELD_KEYS = Object.freeze(['date_of_birth', 'provider_birthdate', 'birthdate']);

export const isBirthdateField = (key) => BIRTHDATE_FIELD_KEYS.includes(String(key || '').trim());

// Use the same canonical-first preference as the roster. Keep the canonical
// definition ID for edits while accepting values from older onboarding forms.
export function consolidateBirthdateFields(fields) {
  const candidates = fields.filter((field) => isBirthdateField(field.field_key));
  if (!candidates.length) return fields;
  const ordered = [...candidates].sort((a, b) =>
    BIRTHDATE_FIELD_KEYS.indexOf(a.field_key) - BIRTHDATE_FIELD_KEYS.indexOf(b.field_key)
    || (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)
  );
  const saved = ordered.find((field) => field.value != null && String(field.value).trim() !== '');
  const birthdate = {
    ...ordered[0],
    field_label: 'Birthdate',
    field_type: 'date',
    value: saved?.value ? String(saved.value).slice(0, 10) : '',
    hasValue: !!saved
  };
  return fields.flatMap((field) => field === candidates[0] ? [birthdate] : isBirthdateField(field.field_key) ? [] : [field]);
}

// Calendar dates are not instants. Never apply the viewer's timezone to them.
export function formatProfileDate(raw) {
  if (!raw) return '';
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (match) return `${match[2]}/${match[3]}/${match[1]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric'
  });
}
