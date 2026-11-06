import { readFileSync } from 'node:fs';

const source = JSON.parse(readFileSync(new URL('../content/clinical-service-reference-2026-10.json', import.meta.url), 'utf8'));
const normalize = value => String(value || '').trim().toUpperCase();
const reviewNotice = source.sourceNotice;

/** Reference data only. Never use a descriptive page as payer authorization. */
export function getClinicalServiceReference(serviceCode) {
  const code = normalize(serviceCode);
  const record = source.records[code];
  if (!record) return null;
  const { sourcePages, sourceText, ...details } = record;
  return {
    ...structuredClone(details),
    source: { title: source.sourceTitle, edition: source.edition, effectiveDate: source.effectiveDate,
      sha256: source.sourceSha256, pages: [...sourcePages] },
    manualText: sourceText || '', reviewNotice,
    unitMinutes: code === 'H2011' ? 15 : null,
    crisisReview: code === 'H2011' ? { maxEncounterMinutes: 247, reviewAtMinutes: 248,
      suggestedServiceCode: 'S9485', automaticSubstitution: false,
      message: 'At 248 minutes or more, review S9485 with billing. Do not submit this encounter as H2011 or automatically substitute an unverified service.' } : null
  };
}

export function listClinicalServiceReferences() {
  return Object.keys(source.records).map(getClinicalServiceReference);
}
