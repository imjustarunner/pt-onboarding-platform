import { readFileSync } from 'node:fs';

// CMS public ICD-10-CM tabular-order releases. Only billable leaf codes are included.
// Kept server-side; this catalog is not part of the browser bundle.
const source = JSON.parse(readFileSync(new URL('../data/icd10cm-diagnosis-catalog.json', import.meta.url), 'utf8'));
const catalogs = source.releases.map(release => ({
  ...release,
  codes: new Set([...source.baseCodes.filter(code => !release.removedCodes.includes(code)), ...release.addedCodes]),
  unspecified: new Set([...source.baseUnspecifiedCodes.filter(code => !release.removedUnspecifiedCodes.includes(code)), ...release.addedUnspecifiedCodes])
}));
const normalized = value => String(value || '').trim().toUpperCase();
export function diagnosisCatalogForDate(date = new Date().toISOString().slice(0, 10)) {
  const value = String(date || '').slice(0, 10);
  return catalogs.find(catalog => value >= catalog.effectiveFrom && value <= catalog.effectiveThrough) || null;
}
export function isBillableDiagnosisCode(code, date) {
  return diagnosisCatalogForDate(date)?.codes.has(normalized(code)) === true;
}
export function isUnspecifiedDiagnosisCode(code, date) {
  // Historic unresolved diagnoses still need review even when their original code edition expired.
  const catalog = diagnosisCatalogForDate(date) || catalogs[catalogs.length - 1];
  return catalog.unspecified.has(normalized(code));
}
