/** Client-side scan used to prompt a quick form / portal login. Keep in sync with the backend scanner. */
export function scanPublicSupportContent(message) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const flags = [];
  let block = false;
  if (/\b\d{3}-?\d{2}-?\d{4}\b/.test(text) || lower.includes('social security')) {
    flags.push('possible_ssn');
    block = true;
  }
  if (/(?:\d[ -]?){13,19}/.test(text)) {
    flags.push('possible_card');
    block = true;
  }
  const medicalHits = [
    'diagnosis', 'diagnosed', 'medication', 'prescription', 'hipaa',
    'therapy notes', 'treatment plan', 'medicaid', 'medical record',
    'phi', 'depression', 'anxiety', 'adhd', 'autism'
  ].filter((term) => lower.includes(term));
  if (medicalHits.length) flags.push('possible_phi');
  return { flags, block, medicalHits };
}
