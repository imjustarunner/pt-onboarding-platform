import { ITSCO_AGENCY_ID, NLU_AGENCY_ID } from './sessionRecordingAccess.js';

// Keep the setting ID and tenant scope in sync with the backend utility.
export const THERAPY_NOTES_QUICK_COPY_ID = 'temporary_therapy_notes_quick_copy';
export const THERAPY_NOTES_QUICK_COPY_TITLE = 'THERAPY NOTES AI NOTE GENERATOR';

export function supportsTherapyNotesQuickGenerator(agency) {
  if ([ITSCO_AGENCY_ID, NLU_AGENCY_ID].includes(Number(agency?.id))) return true;
  const slug = String(agency?.slug || '').trim().toLowerCase();
  if (slug) return ['itsco', 'nlu'].includes(slug);
  return /^(itsco|next level up(?:,? llc)?|nlu)$/i.test(String(agency?.name || '').trim());
}

export function therapyNotesQuickGeneratorEnabled(agency, settings = []) {
  if (!supportsTherapyNotesQuickGenerator(agency)) return false;
  const setting = settings.find(row => (row.catalog_aid_id || row.catalogAidId) === THERAPY_NOTES_QUICK_COPY_ID);
  return !setting || [true, 1, '1'].includes(setting.enabled);
}

export function therapyNotesQuickGeneratorPath(slug = '') {
  return `${slug ? `/${slug}` : ''}/therapy-notes-generator`;
}
