import { linkLooksLikeOfficeIntake } from './officeIntakeLink.js';

export const OFFICE_REFERRAL_SOURCE_KEY = 'office_referral_source';

/** One optional, household-level question on ITSCO's opening office intake page. */
export function withOfficeReferralSource(link, agency) {
  if (String(agency?.slug || '').trim().toLowerCase() !== 'itsco'
    || !linkLooksLikeOfficeIntake(link)
    || String(link?.form_type || 'intake').toLowerCase() !== 'intake'
    || (link.master_channel && !['office', 'counseling'].includes(link.master_channel))) return link;
  const fields = Array.isArray(link.intake_fields) ? link.intake_fields : [];
  if (fields.some(field => field?.key === OFFICE_REFERRAL_SOURCE_KEY)) return link;
  const es = String(link.language_code || '').toLowerCase().startsWith('es');
  const label = 'How did you hear about the agency? (Optional)';
  const labelEs = '¿Cómo se enteró de la agencia? (Opcional)';
  const helperText = 'For example: an event, an online search, social media, a friend, or a referral. If it was an event, please include its name.';
  const helperTextEs = 'Por ejemplo: un evento, una búsqueda en línea, redes sociales, una amistad o una recomendación. Si fue un evento, incluya su nombre.';
  return {
    ...link,
    intake_fields: [...fields, {
      key: OFFICE_REFERRAL_SOURCE_KEY,
      type: 'text',
      scope: 'submission',
      category: 'administrative',
      required: false,
      optional: true,
      visibility: 'always',
      label: es ? labelEs : label,
      labelEs,
      helperText: es ? helperTextEs : helperText,
      helperTextEs
    }]
  };
}
