import {SPECIALTIES,POPULATIONS,CLIENT_AGES,THERAPY_APPROACHES} from '../constants/providerClinicalTaxonomy.js';
import pool from '../config/database.js';

async function getActiveOfficeLocationNames() {
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT name
       FROM office_locations
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );
    return (rows || []).map((r) => String(r?.name || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// NOTE: Options are stored as simple arrays of strings because the current module form
// runner (`frontend/src/views/ModuleView.vue`) expects `field.options` to be a string array.
export const formOptionSources = {
  // Work location options: best-effort from office scheduling locations.
  itsco_locations: getActiveOfficeLocationNames,

  provider_specialties: SPECIALTIES,
  provider_populations_served: POPULATIONS,
  provider_client_ages: CLIENT_AGES,
  provider_therapy_approaches: THERAPY_APPROACHES,

  // Module 4 (general specialties)
  specialties_general_list: SPECIALTIES,

  // Psychology Today lists (Module 6)
  psych_today_issues_list: SPECIALTIES,
  psych_today_mental_health_categories: [
    'Dissociative Disorders (DID)',
    'Elderly Persons Disorders',
    'Impulse Control Disorders',
    'Mood Disorders',
    'Personality Disorders',
    'Psychosis',
    'Thinking Disorders'
  ],
  psych_today_sexuality_categories: ['Bisexual', 'Lesbian', 'LGBTQ+'],
  psych_today_focus: POPULATIONS,
  psych_today_age_specialty: CLIENT_AGES,
  psych_today_communities_allied: [
    'Aviation Professionals',
    'Bisexual Allied',
    'Blind Allied',
    'Body Positivity',
    'Cancer',
    'Deaf Allied',
    'Gay Allied',
    'HIV/AIDS Allied',
    'Immuno-disorders',
    'Intersex Allied',
    'Lesbian Allied',
    'Little Person Allied',
    'Non-Binary Allied',
    'Open Relationships Non-Monogamy',
    'Queer Allied',
    'Racial Justice Allied',
    'Sex Worker Allied',
    'Sex-Positive/Kink Allied',
    'Single Mother',
    'Transgender Allied',
    'Veterans'
  ],
  psych_today_modalities_list: THERAPY_APPROACHES,

  // Culture / team activities
  team_activities_list: [
    'Top Golf',
    'Hiking',
    'Road Trips',
    'Camping',
    'Paddle Boarding',
    'UFC nights (Saturdays)',
    'Switchbacks (Soccer)',
    'Dinners/Evening events',
    'Running',
    'Fitness',
    'Aerobic activities (swimming/cycling)'
  ]
};

export async function resolveOptionSource(sourceKey) {
  const v = formOptionSources[sourceKey];
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'function') {
    const out = await v();
    return Array.isArray(out) ? out : [];
  }
  return [];
}

