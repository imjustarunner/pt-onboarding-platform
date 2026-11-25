const diagnosisCode = value => String(value?.icd10_code || value?.icd10Code || value?.code || '').trim().toUpperCase();

/** Apply an explicitly selected diagnosis to this note, preserving other diagnoses. */
export function mergeSessionDiagnosis(existing = [], selected) {
  const code = diagnosisCode(selected);
  const justification = String(selected?.justification || '').trim();
  if (!/^[A-Z][0-9]{2}(?:\.[A-Z0-9]{1,4})?$/.test(code) || !justification) return existing;
  const index = existing.findIndex(row => diagnosisCode(row) === code);
  const current = index >= 0 ? existing[index] : null;
  const next = { ...current,...(selected.id?{id:selected.id}:{}),...(selected.source?{source:selected.source}:{}), icd10_code: code, description: String(selected.description || current?.description || '').trim(), justification, is_active: 1,
    is_primary: current?.is_primary ?? (existing.some(row => Number(row?.is_primary) === 1) ? 0 : 1) };
  return index >= 0 ? existing.map((row, i) => i === index ? next : row) : [...existing, next];
}

export function sessionDiagnosisEntryMode(mode, credentialTier) {
  const value = ['full', 'zr_only', 'chart', 'none'].includes(mode) ? mode : 'none';
  const tier = String(credentialTier || '').toLowerCase();
  if (['full', 'zr_only'].includes(value) && !['intern_plus', 'provider', 'provider_plus', 'bachelors', 'qbha'].includes(tier)) return 'none';
  if (value === 'full' && !['intern_plus', 'provider', 'provider_plus'].includes(tier)) return ['bachelors', 'qbha'].includes(tier) ? 'zr_only' : 'none';
  return value;
}
export function canSelectSessionDiagnosis(mode, value) {
  const code = diagnosisCode(value);
  return /^[A-Z][0-9]{2}(?:\.[A-Z0-9]{1,4})?$/.test(code) && (mode === 'full' || mode === 'zr_only' && /^[ZR]/.test(code));
}
