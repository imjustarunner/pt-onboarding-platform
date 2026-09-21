import { SPECIALTIES, CLIENT_AGES, POPULATIONS, THERAPY_APPROACHES } from '../constants/providerClinicalTaxonomy.js';

export const CLINICAL_PROFILE_FIELDS = Object.freeze([
  { key: 'specialties_general', group: 'specialties', label: 'Specialties', description: 'What I help with', options: SPECIALTIES },
  { key: 'age_specialty', group: 'ageGroups', label: 'Client Ages', description: 'Who I see by age', options: CLIENT_AGES },
  { key: 'groups', group: 'populations', label: 'Populations Served', description: 'Communities and client types I have experience serving', options: POPULATIONS },
  { key: 'modality', group: 'modalities', label: 'Therapy Approaches', description: 'How I provide treatment', options: THERAPY_APPROACHES }
]);

export function needsClinicalProfile(user) {
  if ([false, 0, '0'].includes(user?.sees_clients)) return false;
  if (['client', 'guardian', 'family', 'child'].includes(String(user?.role || '').toLowerCase())) return false;
  return ['provider', 'provider_plus', 'intern', 'intern_plus', 'facilitator', 'supervisor'].includes(String(user?.role || '').toLowerCase())
    || [true, 1, '1'].includes(user?.sees_clients) || [true, 1, '1'].includes(user?.has_provider_access);
}

export function clinicalProfileForm(facets) {
  return {
    fields: CLINICAL_PROFILE_FIELDS.map(field => ({ ...field, options: [...new Set([...field.options, ...(facets?.[field.group] || [])])] })),
    values: Object.fromEntries(CLINICAL_PROFILE_FIELDS.map(field => [field.key, facets?.[field.group] || []])),
    reviewNeeded: facets?.reviewNeeded || []
  };
}

export function validateClinicalProfile(values, fields = CLINICAL_PROFILE_FIELDS) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Object.assign(new Error('Review all four clinical profile sections.'), { status: 400 });
  return Object.fromEntries(CLINICAL_PROFILE_FIELDS.map(field => {
    const selected = values[field.key];
    const options = fields.find(f => f.key === field.key)?.options || field.options;
    if (!Array.isArray(selected) || selected.length > options.length || selected.some(value => typeof value !== 'string' || !options.includes(value))) {
      throw Object.assign(new Error(`Choose from the available ${field.label.toLowerCase()} options.`), { status: 400 });
    }
    return [field.key, [...new Set(selected)]];
  }));
}
