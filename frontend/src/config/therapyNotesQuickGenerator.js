// Keep the setting ID and default in sync with the backend utility.
export const THERAPY_NOTES_QUICK_COPY_ID = 'temporary_therapy_notes_quick_copy';
export const THERAPY_NOTES_QUICK_COPY_TITLE = 'Therapy Notes AI Writer';

export function therapyNotesQuickGeneratorEnabled(agency, settings = []) {
  if (!agency?.id) return false;
  const setting = settings.find(row => (row.catalog_aid_id || row.catalogAidId) === THERAPY_NOTES_QUICK_COPY_ID);
  return !setting || [true, 1, '1'].includes(setting.enabled);
}

export function therapyNotesQuickGeneratorPath(slug = '') {
  return `${slug ? `/${slug}` : ''}/therapy-notes-generator`;
}
