/**
 * Clinical profile field keys used for provider matching (manual assignment,
 * provider directory search, public finder filters/sorting).
 * Values are indexed in provider_search_index when user_info_values change.
 */

export const CLINICAL_FACET_GROUPS = Object.freeze({
  specialties: Object.freeze([
    'specialties_general',
    'provider_marketing_specialties',
    'provider_counseling_specialties',
    'pt_specialties_max25',
    'top3_specialties_general',
    'top3_specialties_clinical',
    'pt_top3_specialties',
    'mental_health'
  ]),
  modalities: Object.freeze([
    'modality',
    'provider_marketing_treatment_modalities',
    'provider_primary_modality',
    'treatment_prefs_max15'
  ]),
  ageGroups: Object.freeze([
    'age_specialty',
    'provider_marketing_age_specialty'
  ]),
  populations: Object.freeze([
    'sexuality',
    'other_issues',
    'groups',
    'provider_marketing_focus',
    'provider_marketing_groups'
  ]),
  interventions: Object.freeze(['provider_interventions_techniques']),
  serviceSettings: Object.freeze([
    'work_location',
    'provider_service_settings_in_school',
    'provider_service_settings_in_office',
    'provider_service_settings_telehealth',
    'provider_service_settings_community'
  ])
});

export const ALL_CLINICAL_FACET_FIELD_KEYS = Object.freeze(
  Array.from(new Set(Object.values(CLINICAL_FACET_GROUPS).flat()))
);

/** Map legacy / duplicate index keys to canonical facet buckets. */
export const FACET_FIELD_ALIASES = Object.freeze({
  provider_specialties: 'specialties_general',
  provider_top_three_specialties: 'top3_specialties_general',
  provider_mental_health_categories: 'mental_health',
  provider_marketing_mental_health_categories: 'mental_health',
  provider_sexuality: 'sexuality',
  provider_other_issues: 'other_issues',
  provider_modality: 'modality',
  provider_client_focus: 'groups',
  provider_age_specialty: 'age_specialty',
  provider_marketing_specialties: 'specialties_general',
  provider_marketing_treatment_modalities: 'modality',
  provider_marketing_age_specialty: 'age_specialty',
  provider_marketing_groups: 'groups',
  provider_marketing_focus: 'groups',
  provider_marketing_sexuality: 'sexuality'
});

export function normalizeFacetFieldKey(raw) {
  const k = String(raw || '').trim();
  return FACET_FIELD_ALIASES[k] || k;
}
