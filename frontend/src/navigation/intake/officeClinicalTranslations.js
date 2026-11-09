import { asqFieldCopy } from './asqRespondentCopy.js';
import { OFFICE_SCREEN_FIELDS_ES } from './officeClinicalSpanish.js';

/** Published editions for scored tools; ASQ parent observations are a separately identified adaptation. */
export function officeSpanishScreenField(field) {
  if (!field?.instrument) return null;
  if (field.instrument === 'asq') return asqFieldCopy(field, {locale:'es'});
  const key = String(field.key || '');
  const match = OFFICE_SCREEN_FIELDS_ES[key]
    || Object.entries(OFFICE_SCREEN_FIELDS_ES).find(([base]) => key.endsWith(`_${base}`))?.[1];
  return match?.instrument === field.instrument ? match : null;
}

export function preserveOriginalOfficeInstrument(field, locale) {
  return locale === 'es' && Boolean(field?.instrument)
    && !['info', 'deny_all'].includes(String(field.type || ''))
    && !officeSpanishScreenField(field);
}
