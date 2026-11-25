// Use the clinical context captured for this encounter. A missing rationale must
// never be supplied by the writer or copied from a different diagnosis.
export function progressContextSections(context = {}) {
  const rows = (Array.isArray(context.diagnoses) ? context.diagnoses : []).map(row =>
    typeof row === 'string' ? { code: row } : row || {});
  const diagnoses = rows.map(row => [row.code || row.icd10_code, row.description || row.diagnosis]
    .filter(Boolean).join(' — ')).filter(Boolean);
  const justifications = rows.filter(row => row.justification?.trim()).map(row =>
    [row.code || row.icd10_code, row.justification.trim()].filter(Boolean).join(': '));
  const general = context.diagnosticJustification?.trim();
  if (general && !justifications.includes(general) && !rows.some(row => row.justification?.trim() === general)
    && general !== justifications.join('\n')) justifications.unshift(general);
  return Object.fromEntries(Object.entries({
    'Presenting Problem': context.presentingProblem?.trim(),
    [context.diagnosesReferenceOnly ? 'Diagnoses on file' : 'Diagnosis']: diagnoses.join('\n'),
    'Diagnostic Justification': justifications.join('\n')
  }).filter(([, value]) => value));
}

export function encounterConsentStatement(encounter = {}) {
  if (!encounter.consentConfirmed) return '';
  const party = encounter.clientPresent === false ? 'The attending participant(s)' : 'The participant(s)';
  const pos = String(encounter.placeOfService || '').padStart(2,'0');
  const remote = ['02','10'].includes(pos) || /video|phone|virtual|telehealth|audio/i.test(encounter.modality || '');
  const modality = remote ? 'telehealth' : 'in-person';
  const site = encounter.clientPresent===false ? '' : pos === '10' ? 'at home' : String(encounter.clientLocationDescription || (!remote && (encounter.locationLabel || encounter.location)) || '').trim();
  const setting = site ? (pos === '10' ? ' at home' : ' (' + site + ')') : '';
  return party + ' consented to ' + modality + ' services and participated from a private setting' + setting + '.';
}
