/**
 * Maps provider profile field_keys (from pre-hire / onboarding form modules)
 * into the Clinical Information sub-tab structure.
 */

export const CLINICAL_SUB_TABS = Object.freeze([
  { id: 'overview', label: 'Clinical Overview', overviewOnly: true },
  {
    id: 'populations_client_focus',
    label: 'Populations & Client Focus',
    emptyMeansOpenToAll: true,
    panelHint:
      'Ages, demographics, communities, and who they serve. Leave multi-select fields blank to include this provider for all clients (when they have availability).',
    fieldKeys: [
      'age_specialty',
      'provider_marketing_age_specialty',
      'mental_health',
      'sexuality',
      'other_issues',
      'groups',
      'pt_gender_ethnicity',
      'work_location',
      'provider_service_settings_in_school',
      'provider_service_settings_in_office',
      'provider_service_settings_telehealth',
      'provider_service_settings_community',
      'ideal_client_general',
      'ideal_client_clinical',
      'how_help_general',
      'how_help_clinical',
      'build_empathy_general',
      'build_empathy_clinical',
      'top3_specialties_general',
      'top3_specialties_clinical',
      'pt_top3_specialties',
      'avoid_clients_general',
      'avoid_clients_clinical',
      'languages_spoken'
    ],
    fieldGroups: [
      {
        id: 'ages_demographics',
        label: 'Ages & demographics',
        fieldKeys: [
          'age_specialty',
          'provider_marketing_age_specialty',
          'pt_gender_ethnicity',
          'mental_health',
          'sexuality',
          'other_issues',
          'groups'
        ]
      },
      {
        id: 'service_settings',
        label: 'Service settings',
        fieldKeys: [
          'work_location',
          'provider_service_settings_in_school',
          'provider_service_settings_in_office',
          'provider_service_settings_telehealth',
          'provider_service_settings_community'
        ]
      },
      {
        id: 'client_approach',
        label: 'Ideal client & approach',
        fieldKeys: [
          'ideal_client_general',
          'ideal_client_clinical',
          'how_help_general',
          'how_help_clinical',
          'build_empathy_general',
          'build_empathy_clinical',
          'top3_specialties_general',
          'top3_specialties_clinical',
          'pt_top3_specialties',
          'languages_spoken'
        ]
      },
      {
        id: 'exclusions',
        label: 'Scheduling exclusions',
        fieldKeys: ['avoid_clients_general', 'avoid_clients_clinical']
      }
    ]
  },
  {
    id: 'therapeutic_approaches',
    label: 'Therapeutic Approaches',
    fieldKeys: [
      'modality',
      'provider_marketing_treatment_modalities',
      'provider_marketing_focus',
      'provider_primary_modality'
    ]
  },
  {
    id: 'interventions_techniques',
    label: 'Interventions & Techniques',
    fieldKeys: ['treatment_prefs_max15', 'provider_interventions_techniques']
  },
  {
    id: 'groups_programs',
    label: 'Groups & Programs',
    fieldKeys: ['group_interest', 'provider_groups_programs']
  },
  {
    id: 'supervision_notes',
    label: 'Supervision & Notes',
    fieldKeys: ['provider_clinician_notes', 'supervision_notes']
  },
  {
    id: 'specialties',
    label: 'Specialties',
    fieldKeys: [
      'specialties_general',
      'pt_specialties_max25',
      'provider_marketing_specialties'
    ]
  },
  {
    id: 'administrative',
    label: 'Administrative & Schedule',
    fieldKeys: [
      'first_name',
      'last_name',
      'date_of_birth',
      'provider_birthdate',
      'birthdate',
      'personal_email',
      'email_address',
      'cell_number',
      'mailing_address',
      'previous_addresses',
      'itsco_position',
      'npi_status',
      'npi_number',
      'taxonomy_code',
      'research_past_topics',
      'research_interest',
      'availability_mon',
      'availability_tue',
      'availability_wed',
      'availability_thu',
      'availability_fri',
      'availability_sat',
      'availability_sun',
      'languages_spoken',
      'provider_session_length',
      'provider_typical_caseload',
      'provider_accepting_new_clients_note',
      'provider_availability_hours',
      'provider_referral_sources',
      'provider_clinical_notes'
    ]
  },
  {
    id: 'personal_bio',
    label: 'Personal & Bio',
    fieldKeys: [
      'clients_expectations',
      'inspires_concerns',
      'challenges_finished',
      'fun_questions',
      'philosophies',
      'why_counselor_itsco',
      'personal_info',
      'goals_aspirations',
      'passions',
      'favorite_quotes',
      'team_activities',
      'other_info'
    ]
  },
  { id: 'all_fields', label: 'All Profile Fields', showAll: true }
]);

/** Overview dashboard cards (read-first layout). */
export const CLINICAL_OVERVIEW_CARDS = Object.freeze([
  {
    id: 'about_me',
    title: 'About Me',
    editSubTab: 'personal_bio',
    fieldKeys: ['provider_description', 'personal_info', 'clients_expectations', 'why_counselor_itsco']
  },
  {
    id: 'education',
    title: 'Education & Background',
    editSubTab: 'administrative',
    fieldKeys: ['education_history', 'grad_program_info', 'work_exp_general', 'work_exp_clinical']
  },
  {
    id: 'license_certs',
    title: 'License & Certifications',
    editSubTab: 'administrative',
    fieldKeys: [
      'license_type_number',
      'provider_credential_license_type_number',
      'license_issued',
      'license_expires',
      'license_upload',
      'certs_general',
      'certs_clinical',
      'provider_credential',
      'npi_number'
    ]
  },
  {
    id: 'specialties',
    title: 'Specialties',
    editSubTab: 'specialties',
    fieldKeys: ['specialties_general', 'pt_specialties_max25', 'top3_specialties_general', 'top3_specialties_clinical'],
    displayAs: 'pills'
  },
  {
    id: 'populations',
    title: 'Populations Served',
    editSubTab: 'populations_client_focus',
    fieldKeys: ['age_specialty', 'mental_health', 'sexuality', 'other_issues', 'groups', 'pt_gender_ethnicity'],
    displayAs: 'pills'
  },
  {
    id: 'approaches',
    title: 'Therapeutic Approaches',
    editSubTab: 'therapeutic_approaches',
    fieldKeys: ['modality', 'provider_marketing_treatment_modalities'],
    displayAs: 'pills'
  },
  {
    id: 'interventions',
    title: 'Interventions & Techniques',
    editSubTab: 'interventions_techniques',
    fieldKeys: ['treatment_prefs_max15'],
    displayAs: 'pills'
  },
  {
    id: 'client_communication',
    title: 'Client Communication & Preferences',
    editSubTab: 'populations_client_focus',
    fieldKeys: [
      'ideal_client_general',
      'how_help_general',
      'build_empathy_general',
      'languages_spoken',
      'avoid_clients_general'
    ]
  },
  {
    id: 'additional',
    title: 'Additional Information',
    editSubTab: 'administrative',
    fieldKeys: [
      'provider_session_length',
      'provider_typical_caseload',
      'provider_availability_hours',
      'provider_accepting_new_clients_note',
      'provider_referral_sources',
      'other_info'
    ]
  }
]);

/** Snapshot sidebar metrics pulled from profile fields when present. */
export const CLINICAL_SNAPSHOT_SPECS = Object.freeze([
  {
    id: 'credential',
    label: 'Credential',
    fieldKeys: ['provider_credential', 'license_type_number', 'preferred_name_credentials']
  },
  {
    id: 'primary_modality',
    label: 'Primary Modality',
    fieldKeys: ['provider_primary_modality', 'modality', 'provider_marketing_treatment_modalities', 'treatment_prefs_max15']
  },
  {
    id: 'population_focus',
    label: 'Population Focus',
    fieldKeys: ['age_specialty', 'groups', 'mental_health', 'specialties_general', 'top3_specialties_general']
  },
  {
    id: 'age_range',
    label: 'Age Range',
    fieldKeys: ['age_specialty', 'provider_marketing_age_specialty']
  },
  {
    id: 'service_settings',
    label: 'Service Settings',
    fieldKeys: ['work_location', 'provider_service_settings_in_school', 'provider_service_settings_in_office', 'provider_service_settings_telehealth']
  },
  { id: 'session_length', label: 'Avg Session Length', fieldKeys: ['provider_session_length'] },
  { id: 'caseload', label: 'Typical Caseload', fieldKeys: ['provider_typical_caseload'] }
]);

export const EXCLUDED_CLINICAL_CATEGORY_KEYS = new Set(['credentialing', 'gear_tracking']);

const SUB_TAB_FIELD_SETS = CLINICAL_SUB_TABS.filter((t) => t.fieldKeys?.length).map((t) => ({
  id: t.id,
  keys: new Set(t.fieldKeys)
}));

const ALL_MAPPED_KEYS = new Set(
  CLINICAL_SUB_TABS.flatMap((t) => t.fieldKeys || []).concat(
    CLINICAL_OVERVIEW_CARDS.flatMap((c) => c.fieldKeys || [])
  )
);

export function fieldKeysForSubTab(subTabId) {
  const tab = CLINICAL_SUB_TABS.find((t) => t.id === subTabId);
  if (!tab || tab.showAll || tab.overviewOnly) return null;
  return tab.fieldKeys || [];
}

export function fieldGroupsForSubTab(subTabId) {
  const tab = CLINICAL_SUB_TABS.find((t) => t.id === subTabId);
  return Array.isArray(tab?.fieldGroups) ? tab.fieldGroups : null;
}

export function panelHintForSubTab(subTabId) {
  const tab = CLINICAL_SUB_TABS.find((t) => t.id === subTabId);
  return tab?.panelHint || '';
}

export function subTabForFieldKey(fieldKey) {
  const k = String(fieldKey || '').trim();
  if (!k) return 'all_fields';
  for (const { id, keys } of SUB_TAB_FIELD_SETS) {
    if (keys.has(k)) return id;
  }
  return 'all_fields';
}

export function isClinicalProfileField(field) {
  const cat = String(field?.category_key || '').trim();
  if (cat && EXCLUDED_CLINICAL_CATEGORY_KEYS.has(cat)) return false;
  const fk = String(field?.field_key || '').trim();
  if (!fk) return false;
  if (fk.startsWith('provider_accepts_') || fk.startsWith('provider_background_')) return false;
  if (fk.startsWith('provider_risk_')) return false;
  return true;
}

export function isMappedClinicalField(fieldKey) {
  return ALL_MAPPED_KEYS.has(String(fieldKey || '').trim());
}
