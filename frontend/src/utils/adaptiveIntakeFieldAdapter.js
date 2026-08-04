/**
 * Adapt existing intake_links field definitions into Adaptive shell-friendly
 * section groups. Does not invent new storage — keys stay identical so
 * PublicIntakeSigningView / finalize payloads remain compatible.
 */

const SECTION_HINTS = [
  { id: 'guardian', match: /guardian|parent|responsible|contact/i, title: 'Parent / Guardian Information' },
  { id: 'client', match: /client|child|student|patient|dependent/i, title: 'Client Information' },
  { id: 'referral', match: /referral|concern|reason|presenting|goal/i, title: 'Reason for Referral' },
  { id: 'medical', match: /medical|medication|diagnos|allerg|develop|history/i, title: 'Medical & History' },
  { id: 'family', match: /family|household|sibling|custody|home/i, title: 'Family & Home' },
  { id: 'preferences', match: /prefer|availability|modality|format|schedule/i, title: 'Preferences' },
  { id: 'insurance', match: /insurance|payer|medicaid|self.?pay/i, title: 'Insurance & Billing' },
  { id: 'other', match: /.*/, title: 'Additional Information' }
];

function fieldSection(field) {
  const hay = [field.key, field.label, field.group, field.section, field.category]
    .filter(Boolean)
    .join(' ');
  return SECTION_HINTS.find((s) => s.match.test(hay)) || SECTION_HINTS[SECTION_HINTS.length - 1];
}

/**
 * @param {Array<object>} fields - intake_fields from an intake link
 * @returns {Array<{ id: string, title: string, fields: object[] }>}
 */
export function groupIntakeFieldsForAdaptiveShell(fields = []) {
  const list = Array.isArray(fields) ? fields : [];
  const map = new Map();
  for (const field of list) {
    if (!field || field.hidden) continue;
    const section = fieldSection(field);
    if (!map.has(section.id)) {
      map.set(section.id, { id: section.id, title: section.title, fields: [] });
    }
    map.get(section.id).fields.push({
      ...field,
      uiControl: mapFieldToControl(field)
    });
  }
  return Array.from(map.values()).filter((g) => g.fields.length);
}

export function mapFieldToControl(field) {
  const t = String(field?.type || 'text').toLowerCase();
  if (t === 'textarea') return 'textarea';
  if (t === 'select') return 'select';
  if (t === 'radio' || t === 'yes_no' || t === 'boolean') return 'choice';
  if (t === 'checkbox' || t === 'multi_select' || t === 'multiselect') return 'multi';
  if (t === 'date') return 'date';
  if (t === 'phone' || t === 'tel') return 'phone';
  if (t === 'email') return 'email';
  if (t === 'scale' || t === 'likert') return 'scale';
  return 'text';
}

/**
 * Practitioner-vertical starter field templates (basic info + goals).
 * Used when seeding frames; also available client-side for previews.
 */
export function practitionerBasicIntakeFields({ vertical = 'life_coach' } = {}) {
  const goalLabel =
    vertical === 'consultant'
      ? 'What outcomes are you hoping for?'
      : vertical === 'tutoring'
        ? 'What subjects or skills do you want support with?'
        : 'What support are you looking for?';

  return [
    { key: 'respondent_first_name', label: 'Your first name', type: 'text', required: true, section: 'guardian' },
    { key: 'respondent_last_name', label: 'Your last name', type: 'text', required: true, section: 'guardian' },
    { key: 'respondent_email', label: 'Email', type: 'email', required: true, section: 'guardian' },
    { key: 'respondent_phone', label: 'Phone', type: 'phone', required: true, section: 'guardian' },
    { key: 'client_first_name', label: 'Client first name', type: 'text', required: true, section: 'client' },
    { key: 'client_last_name', label: 'Client last name', type: 'text', required: true, section: 'client' },
    { key: 'client_dob', label: 'Date of birth (optional)', type: 'date', required: false, section: 'client' },
    {
      key: 'support_goals',
      label: goalLabel,
      type: 'textarea',
      required: true,
      section: 'referral'
    },
    {
      key: 'preferred_modality',
      label: 'Preferred format',
      type: 'select',
      required: false,
      section: 'preferences',
      options: [
        { value: 'virtual', label: 'Virtual' },
        { value: 'in_person', label: 'In person' },
        { value: 'either', label: 'No preference' }
      ]
    },
    {
      key: 'preferred_time_of_day',
      label: 'Preferred time of day',
      type: 'select',
      required: false,
      section: 'preferences',
      options: [
        { value: 'morning', label: 'Morning' },
        { value: 'afternoon', label: 'Afternoon' },
        { value: 'evening', label: 'Evening' },
        { value: 'flexible', label: 'Flexible' }
      ]
    }
  ];
}

export function documentsToConsentCards(templates = []) {
  return (Array.isArray(templates) ? templates : []).map((t, i) => ({
    id: t.id || t.template_id || `doc_${i}`,
    title: t.name || t.title || 'Consent document',
    description: t.description || t.summary || 'Please review this document carefully before agreeing.',
    icon: t.icon || (i % 2 === 0 ? '🛡️' : '📄'),
    canView: true,
    raw: t
  }));
}
