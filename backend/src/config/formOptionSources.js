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

  // Module 4 (general specialties)
  specialties_general_list: [
    'ADHD',
    'Adoption',
    'Anger Management',
    'Anxiety',
    "Asperger's Syndrome",
    'Autism',
    'Behavioral Issues',
    'Bipolar Disorder',
    'Eating Disorders',
    'Education and Learning Disabilities',
    'Family Conflict',
    'Mood Disorders',
    'LGBTQ+',
    'Obesity',
    'Obsessive-Compulsive (OCD)',
    'Peer Relationships',
    'Racial Identity',
    'School Issues',
    'Self Esteem',
    'Self-Harming',
    'Sports Performance',
    'Stress',
    'Teen Violence',
    'Transgender',
    'Trauma and PTSD',
    'Traumatic Brain Injury (TBI)',
    'Video Game Addiction'
  ],

  // Psychology Today lists (Module 6)
  psych_today_issues_list: [
    'Addiction',
    'ADHD',
    'Adoption',
    'Alcohol Use',
    "Alzheimer's",
    'Anger Management',
    'Antisocial Personality',
    'Anxiety',
    "Asperger's Syndrome",
    'Autism',
    'Behavioral Issues',
    'Bipolar Disorder',
    'Borderline Personality (BPD)',
    'Career Counseling',
    'Child',
    'Chronic Illness',
    'Chronic Impulsivity',
    'Chronic Pain',
    'Codependency',
    'Coping Skills',
    'Depression',
    'Developmental Disorders',
    'Divorce',
    'Domestic Violence/Abuse',
    'Drug Abuse',
    'Eating Disorders',
    'Education/Learning Disabilities',
    'Family Conflict',
    'Gambling',
    'Grief',
    'Hoarding',
    'Infertility',
    'Infidelity',
    'Mood Disorders',
    'LGBTQ+',
    'Life Coaching',
    'Life Transitions',
    "Men's Issues",
    'Narcissistic Personality (NPD)',
    'Obesity',
    'OCD',
    'ODD',
    'Parenting',
    'Peer Relationships',
    'Pregnancy/Prenatal/Postpartum',
    'Racial Identity',
    'Relationship Issues',
    'School Issues',
    'Self Esteem',
    'Self-Harming',
    'Sex Therapy',
    'Sexual Abuse',
    'Sexual Addiction',
    'Sleep/Insomnia',
    'Spirituality',
    'Sports Performance',
    'Stress',
    'Substance Use',
    'Teen Violence',
    'Transgender',
    'Trauma and PTSD',
    'TBI',
    'Video Game Addiction',
    'Weight Loss',
    "Women's Issues"
  ],
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
  psych_today_focus: ['Couples', 'Families', 'Groups', 'Individuals'],
  psych_today_age_specialty: [
    'Toddler (0-5)',
    'Children (6-10)',
    'Preteen (11-13)',
    'Teen (14-18)',
    'Adults (18+)',
    'Seniors (65+)'
  ],
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
  psych_today_modalities_list: [
    'Acceptance and Commitment (ACT)',
    'Adlerian',
    'AEDP',
    'Applied Behavioral Analysis (ABA)',
    'Art Therapy',
    'Attachment-Based',
    'Biofeedback',
    'Brainspotting',
    'Christian Counseling',
    'Clinical Supervision',
    'Coaching',
    'CBT',
    'CPT',
    'Compassion Focused',
    'Culturally Sensitive',
    'Dance Movement Therapy',
    'DBT',
    'Eclectic',
    'EMDR',
    'Emotionally Focused',
    'Energy Psychology',
    'Existential',
    'Experiential Therapy',
    'Exposure Response Prevention (ERP)',
    'Family/Marital',
    'Family Systems',
    'Feminist',
    'Forensic Psychology',
    'Gestalt',
    'Gottman Method',
    'Humanistic',
    'Hypnotherapy',
    'Integrative',
    'IFS',
    'Interpersonal',
    'Intervention',
    'Jungian',
    'Mindfulness-Based (MBCT)',
    'Motivational Interviewing',
    'Multicultural',
    'Music Therapy',
    'Narrative',
    'Neuro-Linguistic (NLP)',
    'Neurofeedback',
    'Parent-Child Interaction (PCIT)',
    'Person-Centered',
    'Play Therapy',
    'Positive Psychology',
    'Prolonged Exposure Therapy',
    'Psychoanalytic',
    'Psychobiological Approach Couple Therapy',
    'Psychodynamic',
    'Psychological Testing and Evaluation',
    'REBT',
    'Reality Therapy',
    'Relational',
    'Sandplay',
    'Schema Therapy',
    'Solution Focused Brief (SFBT)',
    'Somatic',
    'Strength-Based',
    'Structural Family Therapy',
    'Transpersonal',
    'Trauma Focused',
    'Synergetic Play Therapy'
  ],

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

