import crypto from 'node:crypto';

const invalid = message => Object.assign(new Error(message), { status: 400 });

/** Source attribution is historical evidence, never a signature by the importer. */
export function historicalImportDetails(value, sourceText) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.reviewed !== true) {
    throw invalid('Review the historical source before importing.');
  }
  const sourceSystem = String(value.sourceSystem || '').trim();
  const sourceAuthor = String(value.sourceAuthor || '').trim();
  const sourceDate = String(value.sourceDate || '').trim();
  const rawText = String(sourceText || '').trim();
  if (!sourceSystem || sourceSystem.length > 120 || !sourceAuthor || sourceAuthor.length > 200) {
    throw invalid('Enter the source EHR and original author, or explicitly record that the original author is unknown.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !Number.isFinite(Date.parse(sourceDate)) || new Date(sourceDate).toISOString().slice(0, 10) !== sourceDate) {
    throw invalid('Enter the original source date as YYYY-MM-DD.');
  }
  if (!rawText || Buffer.byteLength(rawText, 'utf8') > 48000) throw invalid('Paste historical source text up to 48 KB.');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ sourceSystem, sourceAuthor, sourceDate, rawText })).digest('hex');
  return { sourceSystem, sourceAuthor, sourceDate, fingerprint, reviewRequired: true };
}

export function historicalSourceNarrative(details) {
  return `Historical EHR import — clinical review required\nSource EHR: ${details.sourceSystem}\nOriginal source date: ${details.sourceDate}\nOriginal author: ${details.sourceAuthor}\nOriginal authorship is retained as source attribution. This import records no new clinical signature or approval.`;
}

export const historicalPlanSourceKey = details => `ehr_transition_import:${details.fingerprint.slice(0, 32)}`;
