const LIST_KEYS = ['recent_symptoms', 'diagnoses_given'];

const DEPRESSION_SYMPTOMS = new Set([
  'feeling_down',
  'losing_interest',
  'sleeping_too_much',
  'low_energy',
  'low_motivation',
  'appetite_changes'
]);

const ANXIETY_SYMPTOMS = new Set([
  'worry_on_edge',
  'panic',
  'stress_overwhelmed',
  'thoughts_wont_shut_off',
  'irritability_anger'
]);

const PTSD_SYMPTOMS = new Set([
  'disturbing_memories',
  'avoiding',
  'feeling_disconnected',
  'intrusive_thoughts'
]);

const ALCOHOL_YES = new Set(['occasionally', 'weekly', 'several_times_week', 'daily']);
const DRUG_FREQ_YES = new Set(['occasionally', 'weekly', 'several_times_week', 'daily']);

export const OFFICE_INSTRUMENT_META = {
  phq9: {
    id: 'phq9',
    title: 'PHQ-9',
    subtitle: 'Depression screening',
    skipKey: 'skip_phq9'
  },
  gad7: {
    id: 'gad7',
    title: 'GAD-7',
    subtitle: 'Anxiety screening',
    skipKey: 'skip_gad7'
  },
  auditc: {
    id: 'auditc',
    title: 'AUDIT-C',
    subtitle: 'Alcohol use screening',
    skipKey: 'skip_auditc'
  },
  dast10: {
    id: 'dast10',
    title: 'DAST-10',
    subtitle: 'Drug use screening',
    skipKey: 'skip_dast10'
  },
  pcptsd5: {
    id: 'pcptsd5',
    title: 'PC-PTSD-5',
    subtitle: 'Trauma / PTSD screening',
    skipKey: 'skip_pcptsd5'
  },
  psc17: {
    id: 'psc17',
    title: 'PSC-17',
    subtitle: 'How your child has been doing',
    skipKey: 'skip_psc17'
  }
};

function asList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return [];
  if (raw.includes(',')) return raw.split(',').map((v) => v.trim()).filter(Boolean);
  return [raw];
}

function textBlob(values) {
  return [
    values?.main_reason_for_therapy,
    values?.bothering_most,
    values?.diagnoses_given,
    values?.help_with_first
  ].map((v) => String(v || '').toLowerCase()).join(' ');
}

function yesish(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'yes' || v === 'not_sure';
}

export function instrumentIdForField(field) {
  const instrument = String(field?.instrument || '').toLowerCase();
  if (OFFICE_INSTRUMENT_META[instrument]) return instrument;
  const key = String(field?.key || '').toLowerCase();
  if (/^phq/.test(key)) return 'phq9';
  if (/^gad/.test(key)) return 'gad7';
  if (/^audit/.test(key)) return 'auditc';
  if (/^dast/.test(key)) return 'dast10';
  if (/^(pc_?ptsd|pcptsd)/.test(key)) return 'pcptsd5';
  if (/^psc/.test(key)) return 'psc17';
  return '';
}

export function indicatedOfficeInstruments(values = {}, { forDependent = false } = {}) {
  if (forDependent) {
    return { psc17: true };
  }
  const symptoms = new Set(asList(values.recent_symptoms));
  const blob = textBlob(values);
  const depression = [...DEPRESSION_SYMPTOMS].some((k) => symptoms.has(k))
    || /\bdepress/.test(blob);
  const anxiety = [...ANXIETY_SYMPTOMS].some((k) => symptoms.has(k))
    || /\banxi/.test(blob);
  const alcohol = ALCOHOL_YES.has(String(values.alcohol_use || '').toLowerCase());
  const drugs = yesish(values.other_substances)
    || yesish(values.nonprescribed_meds)
    || DRUG_FREQ_YES.has(String(values.cannabis_use || '').toLowerCase());
  const ptsd = yesish(values.trauma_experienced)
    || yesish(values.trauma_still_affecting)
    || [...PTSD_SYMPTOMS].some((k) => symptoms.has(k))
    || /\bptsd\b|\btrauma\b/.test(blob);
  return {
    phq9: depression,
    gad7: anxiety,
    auditc: alcohol,
    dast10: drugs,
    pcptsd5: ptsd
  };
}

export function isOfficeHardRequiredField(field) {
  const key = String(field?.key || '').trim().toLowerCase();
  return [
    'legal_first_name',
    'legal_last_name',
    'email_address',
    'date_of_birth',
    'guardian_legal_first',
    'guardian_legal_last',
    'guardian_email',
    'child_legal_first',
    'child_legal_last',
    'child_dob',
    'child_date_of_birth',
    'feel_physically_safe',
    'safety_immediate_danger'
  ].includes(key);
}

export { LIST_KEYS };
