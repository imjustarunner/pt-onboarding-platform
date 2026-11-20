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
