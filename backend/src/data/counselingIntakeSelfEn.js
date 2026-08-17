/**
 * Master English counseling intake — self-completer (pages 1–14).
 * Question labels are verbatim from the clinical interview spec.
 */
import {
  buildCssrsScreenerFields,
  buildStandardQuestionnaireFields
} from './validatedClinicalScreens.en.js';

export const COUNSELING_SELF_STEP_PREFIX = 'counseling_self_';

function opt(value, label) {
  return { value, label };
}

function yesNo() {
  return [opt('yes', 'Yes'), opt('no', 'No')];
}

function yesNoNotSure() {
  return [opt('yes', 'Yes'), opt('no', 'No'), opt('not_sure', 'Not sure')];
}

function field({
  key,
  label,
  type = 'textarea',
  required = false,
  optional = true,
  options = [],
  showIf = null,
  helperText = '',
  placeholder = '',
  exclusiveValue = '',
  section = '',
  layout = '',
  maxLength = 0,
  defaultValue = undefined,
  denyAllKeys,
  denyAllValue,
  denyAllOverrides
}) {
  const hasShowIf = showIf && (showIf.fieldKey || showIf.any || showIf.all);
  const resolvedHelper = helperText
    || (optional && hasShowIf ? 'Optional' : '');
  return {
    id: `field_${key}`,
    key,
    label,
    type,
    required: optional ? false : required,
    helperText: resolvedHelper,
    placeholder,
    scope: 'self',
    visibility: 'always',
    showIf: showIf || { fieldKey: '', equals: '' },
    options,
    exclusiveValue: exclusiveValue || undefined,
    section,
    layout: layout || undefined,
    maxLength: maxLength || undefined,
    defaultValue,
    denyAllKeys: Array.isArray(denyAllKeys) ? denyAllKeys : undefined,
    denyAllValue: denyAllValue || undefined,
    denyAllOverrides:
      denyAllOverrides && typeof denyAllOverrides === 'object' ? denyAllOverrides : undefined,
    category: 'clinical'
  };
}

function step({ id, label, helperText, whyWeAsk, type = 'questions', fields }) {
  return {
    id: `${COUNSELING_SELF_STEP_PREFIX}${id}`,
    type,
    label,
    helperText,
    whyWeAsk,
    audience: 'self',
    visibility: 'always',
    fields
  };
}

function combineSteps(id, label, helperText, whyWeAsk, parts) {
  const fields = [];
  for (const part of parts || []) {
    for (const f of part.fields || []) {
      fields.push({ ...f, section: f.section || part.label });
    }
  }
  return step({
    id,
    label,
    helperText,
    whyWeAsk,
    type: parts?.[0]?.type || 'questions',
    fields
  });
}

const FREQUENCY = [
  opt('occasionally', 'Occasionally'),
  opt('several_days_month', 'Several days a month'),
  opt('several_days_week', 'Several days a week'),
  opt('most_days', 'Most days'),
  opt('nearly_constantly', 'Nearly constantly')
];

const LIFE_AREA = [
  opt('going_well', 'Going well'),
  opt('some_difficulty', 'Some difficulty'),
  opt('significant_difficulty', 'Significant difficulty'),
  opt('not_applicable', 'Not applicable')
];

const SUBSTANCE_FREQ = [
  opt('never', 'Never'),
  opt('occasionally', 'Occasionally'),
  opt('weekly', 'Weekly'),
  opt('several_times_week', 'Several times a week'),
  opt('daily', 'Daily or almost daily')
];

const SYMPTOM_ANY = { fieldKey: 'recent_symptoms', notEquals: 'none' };
const SUBSTANCE_USE_ACTIVE = ['occasionally', 'weekly', 'several_times_week', 'daily'];
const SUBSTANCE_REPORTED = {
  any: [
    { fieldKey: 'alcohol_use', includesAny: SUBSTANCE_USE_ACTIVE },
    { fieldKey: 'cannabis_use', includesAny: SUBSTANCE_USE_ACTIVE },
    { fieldKey: 'other_substances', equals: 'yes' },
    { fieldKey: 'nonprescribed_meds', equals: 'yes' }
  ]
};
const SUBSTANCE_WHICH_OPTIONS = [
  opt('alcohol', 'Alcohol'),
  opt('cannabis', 'Cannabis'),
  opt('recreational', 'Recreational drugs'),
  opt('prescription', 'Prescription drugs')
];
const SUBSTANCE_WHICH_WHEN_PROBLEMS = {
  all: [
    SUBSTANCE_REPORTED,
    { fieldKey: 'substance_causes_problems', equals: ['yes', 'maybe'] },
    { fieldKey: '_substance_active_count', equals: ['2', '3', '4'] }
  ]
};
const SUBSTANCE_WHICH_WHEN_CONCERNED = {
  all: [
    SUBSTANCE_REPORTED,
    { fieldKey: 'substance_others_concerned', equals: 'yes' },
    { fieldKey: '_substance_active_count', equals: ['2', '3', '4'] }
  ]
};
const SUBSTANCE_WHICH_WHEN_HELP = {
  all: [
    SUBSTANCE_REPORTED,
    { fieldKey: 'substance_want_help', equals: ['yes', 'not_sure'] },
    { fieldKey: '_substance_active_count', equals: ['2', '3', '4'] }
  ]
};
const SAFETY_SCREEN_POSITIVE = {
  any: [
    { fieldKey: 'safety_immediate_danger', equals: 'yes' },
    { fieldKey: 'self_harm_urges_now', equals: 'yes' },
    { fieldKey: 'cssrs_1', equals: 'yes' },
    { fieldKey: 'cssrs_2', equals: 'yes' },
    { fieldKey: 'cssrs_3', equals: 'yes' },
    { fieldKey: 'cssrs_4', equals: 'yes' },
    { fieldKey: 'cssrs_5', equals: 'yes' },
    { fieldKey: 'cssrs_6', equals: 'yes' }
  ]
};

function aboutYou() {
  return step({
    id: 'about_you',
    label: 'About You',
    helperText: 'Start with the basics. Tell us enough to know who you are and how to reach you.',
    whyWeAsk: 'These details help your therapist know who you are and how to reach you before the first session.',
    fields: [
      field({ key: 'legal_first_name', label: 'Legal first name (i.e. Johnathan ; Rebecca)', type: 'text' }),
      field({ key: 'legal_last_name', label: 'Legal last name', type: 'text' }),
      field({
        key: 'preferred_name',
        label: 'If you prefer a different name, please enter it here.',
        type: 'text',
        optional: true,
        helperText: 'Optional'
      }),
      field({ key: 'date_of_birth', label: 'Date of birth', type: 'date' }),
      field({ key: 'phone_number', label: 'Phone number', type: 'tel' }),
      field({ key: 'email_address', label: 'Email address', type: 'email' }),
      field({
        key: 'sex',
        label: 'Sex',
        type: 'radio',
        layout: 'cards',
        options: [
          opt('female', 'Female'),
          opt('male', 'Male')
        ]
      }),
      field({
        key: 'preferred_called',
        label: 'If you want to be called something different, write it here',
        type: 'text',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'preferred_language',
        label: 'Preferred language',
        type: 'text',
        placeholder: 'e.g. English, Spanish'
      }),
      field({ key: 'address_street', label: 'Street address', type: 'text' }),
      field({ key: 'address_zip', label: 'ZIP code', type: 'text' }),
      field({ key: 'address_city', label: 'City', type: 'text' }),
      field({ key: 'address_state', label: 'State', type: 'text' }),
      field({
        key: 'preferred_contact_method',
        label: 'Preferred contact method',
        type: 'radio',
        options: [
          opt('text', 'Text'),
          opt('email', 'Email'),
          opt('phone', 'Phone'),
          opt('any', 'Any')
        ]
      }),
      field({
        key: 'best_time_to_contact',
        label: 'Best time to contact you',
        type: 'checkbox',
        layout: 'cards',
        options: [
          opt('morning', 'Morning (8am–12pm)'),
          opt('afternoon', 'Afternoon (12–5pm)'),
          opt('evening', 'Evening (5–8pm)'),
          opt('anytime', 'Anytime')
        ]
      }),
      field({
        key: 'describe_yourself',
        label: 'In a few sentences, how would you describe yourself — and anything useful for your therapist to know from the beginning?',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'want_emergency_contact',
        label: 'Would you like to add an emergency contact?',
        type: 'radio',
        options: yesNo(),
        optional: true,
        helperText: 'Optional',
        section: 'Emergency contact'
      }),
      field({
        key: 'emergency_contact_name',
        label: 'Emergency contact name',
        type: 'text',
        optional: true,
        helperText: 'Optional',
        showIf: { fieldKey: 'want_emergency_contact', equals: 'yes' },
        section: 'Emergency contact'
      }),
      field({
        key: 'emergency_contact_relationship',
        label: 'Relationship to you',
        type: 'text',
        optional: true,
        helperText: 'Optional',
        showIf: { fieldKey: 'want_emergency_contact', equals: 'yes' },
        section: 'Emergency contact'
      }),
      field({
        key: 'emergency_contact_phone',
        label: 'Emergency contact phone',
        type: 'tel',
        optional: true,
        helperText: 'Optional',
        showIf: { fieldKey: 'want_emergency_contact', equals: 'yes' },
        section: 'Emergency contact'
      })
    ]
  });
}

function whatBringsYou() {
  return step({
    id: 'what_brings_you',
    label: 'What Brings You Here?',
    helperText: 'Tell us what is happening and why now. Your own words are more useful than the “right” words.',
    whyWeAsk: 'Your own words about why you are here now help your therapist start in the right place.',
    fields: [
      field({ key: 'main_reason_for_therapy', label: 'What is the main reason you are looking for therapy?' }),
      field({
        key: 'why_looking_now',
        label: 'Why are you looking for help now instead of six months ago or six months from now?'
      }),
      field({
        key: 'how_long_problem',
        label: 'How long has this been a problem?',
        type: 'radio',
        layout: 'cards',
        options: [
          opt('less_than_2_weeks', 'Less than 2 weeks'),
          opt('2_weeks_2_months', '2 weeks–2 months'),
          opt('2_6_months', '2–6 months'),
          opt('6_12_months', '6–12 months'),
          opt('more_than_a_year', 'More than a year'),
          opt('comes_and_goes', 'Comes and goes')
        ]
      }),
      field({
        key: 'something_specific_happened',
        label: 'Did something specific happen around the time this started?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'what_happened',
        label: 'What happened?',
        showIf: { fieldKey: 'something_specific_happened', equals: 'yes' }
      }),
      field({ key: 'what_makes_worse', label: 'What tends to make it worse?' }),
      field({ key: 'what_makes_better', label: 'What tends to make it better?' }),
      field({ key: 'already_tried', label: 'What have you already tried to deal with it?' }),
      field({
        key: 'how_much_affecting',
        label: 'How much is this affecting your life right now?',
        type: 'radio',
        layout: 'pills',
        options: Array.from({ length: 11 }, (_, i) => opt(String(i), String(i)))
      }),
      field({
        key: 'readiness_0_10',
        label: 'How ready are you to work on this right now?',
        type: 'radio',
        layout: 'pills',
        options: Array.from({ length: 11 }, (_, i) => opt(String(i), String(i)))
      }),
      field({
        key: 'what_would_need_to_change_for_ready',
        label: 'What would need to change for you to feel more ready?',
        optional: true,
        helperText: 'Optional',
        showIf: { fieldKey: 'readiness_0_10', equals: ['0', '1', '2', '3', '4'] }
      }),
      field({
        key: 'know_before_first_session',
        label: 'Is there anything you want your therapist to know before you walk into the first session?',
        optional: true,
        helperText: 'Optional'
      })
    ]
  });
}

function howFeeling() {
  return step({
    id: 'how_feeling',
    label: 'How You Have Been Feeling',
    helperText:
      'Select anything that has been a real problem recently. You do not need to select something just because you have experienced it occasionally.',
    whyWeAsk: 'A clear picture of recent symptoms helps your therapist know what to assess first.',
    fields: [
      field({
        key: 'recent_symptoms',
        label: 'Which have been affecting you recently? Select all that apply.',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('feeling_down', 'Feeling down, depressed, or emotionally flat'),
          opt('losing_interest', 'Losing interest or enjoyment'),
          opt('worry_on_edge', 'Worry or feeling on edge'),
          opt('panic', 'Panic'),
          opt('stress_overwhelmed', 'Stress or feeling overwhelmed'),
          opt('irritability_anger', 'Irritability or anger'),
          opt('mood_changing_quickly', 'Mood changing quickly'),
          opt('trouble_sleeping', 'Trouble sleeping'),
          opt('sleeping_too_much', 'Sleeping too much'),
          opt('low_energy', 'Low energy'),
          opt('trouble_concentrating', 'Trouble concentrating'),
          opt('low_motivation', 'Low motivation'),
          opt('appetite_changes', 'Changes in appetite or eating'),
          opt('feeling_disconnected', 'Feeling disconnected or numb'),
          opt('thoughts_wont_shut_off', 'Thoughts that will not shut off'),
          opt('intrusive_thoughts', 'Unwanted or intrusive thoughts'),
          opt('repetitive_behaviors', 'Repetitive behaviors or checking'),
          opt('disturbing_memories', 'Disturbing memories or nightmares'),
          opt('avoiding', 'Avoiding people, places, or situations'),
          opt('feeling_unusually_energetic', 'Feeling unusually energetic or needing very little sleep'),
          opt('unusual_experiences', 'Hearing, seeing, or experiencing things other people do not seem to'),
          opt('physical_stress_symptoms', 'Physical symptoms that seem connected to stress'),
          opt('sexual_intimacy', 'Sexual or intimacy concerns'),
          opt('chronic_pain', 'Chronic pain'),
          opt('something_else', 'Something else'),
          opt('none', 'None of these')
        ]
      }),
      field({
        key: 'recent_symptoms_other',
        label: 'What else has been affecting you recently?',
        type: 'text',
        showIf: { fieldKey: 'recent_symptoms', includes: 'something_else' }
      }),
      field({
        key: 'unusual_experiences_current',
        label: 'About hearing, seeing, or experiencing things other people do not — is this happening currently?',
        type: 'radio',
        options: yesNo(),
        showIf: { fieldKey: 'recent_symptoms', includes: 'unusual_experiences' }
      }),
      field({
        key: 'unusual_experiences_unsafe',
        label: 'Do those experiences ever make you feel unsafe, or tell you to hurt yourself or someone else?',
        type: 'radio',
        options: yesNo(),
        showIf: { fieldKey: 'recent_symptoms', includes: 'unusual_experiences' }
      }),
      field({
        key: 'bothering_most',
        label: 'Which of these is bothering you the most?',
        type: 'textarea',
        showIf: { fieldKey: 'recent_symptoms', notEquals: 'none', minSelected: 2 }
      }),
      field({
        key: 'how_often_happens',
        label: 'How often does the one bothering you most happen?',
        type: 'radio',
        layout: 'cards',
        options: FREQUENCY,
        showIf: { fieldKey: 'recent_symptoms', notEquals: 'none', minSelected: 2 }
      }),
      field({
        key: 'high_energy_duration',
        label: 'When you feel unusually energetic or need very little sleep, how long do those periods usually last?',
        showIf: { fieldKey: 'recent_symptoms', includes: 'feeling_unusually_energetic' }
      }),
      field({
        key: 'high_energy_impulsive',
        label:
          'During those high-energy times, do you become more impulsive, take more risks, spend more money, talk more, or behave noticeably differently?',
        type: 'radio',
        options: yesNoNotSure(),
        showIf: { fieldKey: 'recent_symptoms', includes: 'feeling_unusually_energetic' }
      })
    ]
  });
}

function lifeArea(key, label) {
  return field({
    key,
    label,
    type: 'radio',
    options: LIFE_AREA,
    section: 'How are things going in each area?',
    defaultValue: 'going_well'
  });
}

function howLifeGoing() {
  return step({
    id: 'how_life_going',
    label: 'How Life Is Going',
    helperText: 'Symptoms matter, but so does what they are doing to your life.',
    whyWeAsk: 'How symptoms show up in daily life tells us where support will matter most.',
    fields: [
      lifeArea('life_work_school', 'Work or school'),
      lifeArea('life_relationships', 'Relationships'),
      lifeArea('life_family', 'Family life'),
      lifeArea('life_parenting', 'Parenting/caregiving'),
      lifeArea('life_sleep', 'Sleep'),
      lifeArea('life_self_care', 'Taking care of yourself'),
      lifeArea('life_responsibilities', 'Managing responsibilities'),
      lifeArea('life_money', 'Money/financial responsibilities'),
      lifeArea('life_social', 'Social life'),
      lifeArea('life_physical_health', 'Physical health'),
      field({
        key: 'area_affected_more',
        label: 'Is there an area of your life that is being affected more than the others?'
      }),
      field({
        key: 'missing_responsibilities',
        label: 'Are you currently missing work, school, appointments, or responsibilities because of what you are experiencing?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'missing_responsibilities_what',
        label: 'What has been happening?',
        showIf: { fieldKey: 'missing_responsibilities', equals: 'yes' }
      }),
      field({
        key: 'practical_difficulties',
        label: 'Is there anything practical making life especially difficult right now?',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'nothing_significant',
        options: [
          opt('housing', 'Housing'),
          opt('money', 'Money'),
          opt('transportation', 'Transportation'),
          opt('work', 'Work'),
          opt('school', 'School'),
          opt('childcare_caregiving', 'Childcare/caregiving'),
          opt('legal_issues', 'Legal issues'),
          opt('relationship_problems', 'Relationship problems'),
          opt('health', 'Health'),
          opt('other', 'Other'),
          opt('nothing_significant', 'Nothing significant')
        ]
      }),
      field({
        key: 'practical_difficulties_what',
        label: 'Tell us briefly what is happening.',
        showIf: { fieldKey: 'practical_difficulties', notEquals: 'nothing_significant' }
      })
    ]
  });
}

function treatmentHistory() {
  return step({
    id: 'treatment_history',
    label: 'Mental Health & Treatment History',
    helperText: 'Knowing what you have already tried helps us avoid starting from zero.',
    whyWeAsk: 'Prior treatment — what helped and what did not — keeps us from repeating unhelpful work.',
    fields: [
      field({
        key: 'therapy_before',
        label: 'Have you ever been in therapy or counseling before?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'therapy_about_when',
        label: 'About when?',
        type: 'text',
        showIf: { fieldKey: 'therapy_before', equals: 'yes' }
      }),
      field({
        key: 'therapy_working_on',
        label: 'What were you working on?',
        showIf: { fieldKey: 'therapy_before', equals: 'yes' }
      }),
      field({
        key: 'therapy_what_helped',
        label: 'What helped?',
        showIf: { fieldKey: 'therapy_before', equals: 'yes' }
      }),
      field({
        key: 'therapy_what_did_not_help',
        label: 'What did not help?',
        showIf: { fieldKey: 'therapy_before', equals: 'yes' }
      }),
      field({
        key: 'diagnosed_before',
        label: 'Have you ever been diagnosed with a mental health condition?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'diagnoses_given',
        label: 'What diagnoses have you been given?',
        showIf: { fieldKey: 'diagnosed_before', equals: 'yes' }
      }),
      field({
        key: 'agree_with_diagnoses',
        label: 'Do you agree with those diagnoses?',
        type: 'radio',
        options: [
          opt('yes', 'Yes'),
          opt('some', 'Some of them'),
          opt('no', 'No'),
          opt('not_sure', 'Not sure')
        ],
        showIf: { fieldKey: 'diagnosed_before', equals: 'yes' }
      }),
      field({
        key: 'psychiatrist_before',
        label: 'Have you ever seen a psychiatrist or another provider for psychiatric medication?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'hospitalized_before',
        label: 'Have you ever been hospitalized or received emergency/crisis care for mental health?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'hospitalized_when',
        label: 'When?',
        type: 'text',
        showIf: { fieldKey: 'hospitalized_before', equals: 'yes' }
      }),
      field({
        key: 'hospitalized_what_happening',
        label: 'What was happening at the time?',
        showIf: { fieldKey: 'hospitalized_before', equals: 'yes' }
      }),
      field({
        key: 'current_other_provider',
        label: 'Are you currently working with another mental health provider?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'current_other_provider_who',
        label: 'Who are you seeing and what are they helping you with?',
        showIf: { fieldKey: 'current_other_provider', equals: 'yes' }
      }),
      field({
        key: 'previous_treatment_repeat',
        label: 'Is there anything from previous treatment that you definitely do or do not want repeated?'
      })
    ]
  });
}

function healthMedsSubstances() {
  return step({
    id: 'health_meds_substances',
    label: 'Health, Medications & Substance Use',
    helperText:
      'Physical health, medication, sleep, alcohol, and other substances can affect how you feel. Straight answers are more useful than perfect answers.',
    whyWeAsk: 'Health, sleep, and substance use often change how symptoms show up and how treatment should start.',
    fields: [
      field({
        key: 'medical_conditions',
        label:
          'Do you have any medical conditions that affect your mood, sleep, energy, concentration, or day-to-day life?',
        type: 'radio',
        options: yesNo(),
        section: 'Health'
      }),
      field({
        key: 'medical_conditions_what',
        label: 'What should your therapist know?',
        showIf: { fieldKey: 'medical_conditions', equals: 'yes' },
        section: 'Health'
      }),
      field({
        key: 'currently_taking_medications',
        label: 'Are you currently taking medications?',
        type: 'radio',
        options: yesNo(),
        section: 'Health'
      }),
      field({
        key: 'medications_list',
        label: 'List medication, dose if known, and what you take it for.',
        showIf: { fieldKey: 'currently_taking_medications', equals: 'yes' },
        section: 'Health'
      }),
      field({
        key: 'major_injuries',
        label: 'Have you had any major injuries, illnesses, surgeries, or neurological problems that you think are relevant?',
        type: 'radio',
        options: yesNo(),
        section: 'Health'
      }),
      field({
        key: 'major_injuries_describe',
        label: 'Please describe.',
        showIf: { fieldKey: 'major_injuries', equals: 'yes' },
        section: 'Health'
      }),
      field({
        key: 'hours_sleep',
        label: 'About how many hours do you usually sleep?',
        type: 'text',
        section: 'Sleep'
      }),
      field({
        key: 'sleep_quality',
        label: 'How would you describe your sleep?',
        type: 'radio',
        options: [
          opt('good', 'Good'),
          opt('okay', 'Okay'),
          opt('poor', 'Poor'),
          opt('very_poor', 'Very poor')
        ],
        section: 'Sleep'
      }),
      field({
        key: 'alcohol_use',
        label: 'Do you currently drink alcohol?',
        type: 'radio',
        layout: 'cards',
        options: SUBSTANCE_FREQ,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'cannabis_use',
        label: 'Do you currently use cannabis?',
        type: 'radio',
        layout: 'cards',
        options: SUBSTANCE_FREQ,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'other_substances',
        label: 'Do you currently use any other recreational substances?',
        type: 'radio',
        options: yesNo(),
        section: 'Alcohol and substances'
      }),
      field({
        key: 'nonprescribed_meds',
        label: 'Have you used prescription medication differently than prescribed?',
        type: 'radio',
        options: yesNo(),
        section: 'Alcohol and substances'
      }),
      field({
        key: 'substance_causes_problems',
        label: 'Do you think your use causes problems for you?',
        type: 'radio',
        options: [opt('no', 'No'), opt('maybe', 'Maybe'), opt('yes', 'Yes')],
        showIf: SUBSTANCE_REPORTED,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'substance_causes_problems_which',
        label: 'Which substance(s)?',
        type: 'checkbox',
        layout: 'pills',
        options: SUBSTANCE_WHICH_OPTIONS,
        optional: true,
        helperText: 'Optional',
        showIf: SUBSTANCE_WHICH_WHEN_PROBLEMS,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'substance_others_concerned',
        label: 'Have other people expressed concern about it?',
        type: 'radio',
        options: yesNo(),
        showIf: SUBSTANCE_REPORTED,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'substance_others_concerned_which',
        label: 'Which substance(s)?',
        type: 'checkbox',
        layout: 'pills',
        options: SUBSTANCE_WHICH_OPTIONS,
        optional: true,
        helperText: 'Optional',
        showIf: SUBSTANCE_WHICH_WHEN_CONCERNED,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'substance_want_help',
        label: 'Would you like help changing your use?',
        type: 'radio',
        options: yesNoNotSure(),
        showIf: SUBSTANCE_REPORTED,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'substance_want_help_which',
        label: 'Which substance(s)?',
        type: 'checkbox',
        layout: 'pills',
        options: SUBSTANCE_WHICH_OPTIONS,
        optional: true,
        helperText: 'Optional',
        showIf: SUBSTANCE_WHICH_WHEN_HELP,
        section: 'Alcohol and substances'
      }),
      field({
        key: 'nicotine_use',
        label: 'Do you currently use nicotine?',
        type: 'radio',
        options: yesNo(),
        section: 'Alcohol and substances'
      })
    ]
  });
}

function lifeAndPeople() {
  return step({
    id: 'life_and_people',
    label: 'Your Life & Your People',
    helperText: 'Help your therapist understand the life you are actually living.',
    whyWeAsk: 'Who you live with, work with, and rely on shapes both stress and support.',
    fields: [
      field({ key: 'live_with', label: 'Who do you currently live with?' }),
      field({ key: 'important_people', label: 'Who are the most important people in your life?' }),
      field({
        key: 'people_you_can_rely_on',
        label: 'Do you feel like you have people you can rely on?',
        type: 'radio',
        options: [opt('yes', 'Yes'), opt('somewhat', 'Somewhat'), opt('no', 'No')]
      }),
      field({
        key: 'day_to_day_role',
        label: 'What do you do for work, school, or your primary day-to-day role?'
      }),
      field({ key: 'feel_about_role', label: 'How do you feel about that part of your life?' }),
      field({
        key: 'military_service',
        label: 'Have you served in the military?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'service_connected_to_therapy',
        label: 'Is anything from that experience connected to why you are seeking therapy?',
        type: 'radio',
        options: [opt('yes', 'Yes'), opt('no', 'No'), opt('maybe', 'Maybe')],
        showIf: { fieldKey: 'military_service', equals: 'yes' }
      }),
      field({
        key: 'service_connected_what',
        label: 'What would be useful for your therapist to understand?',
        showIf: { fieldKey: 'service_connected_to_therapy', equals: ['yes', 'maybe'] }
      }),
      field({
        key: 'legal_court_issues',
        label: 'Are there current legal or court issues affecting your life?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'legal_court_what',
        label: 'What does your therapist need to know?',
        showIf: { fieldKey: 'legal_court_issues', equals: 'yes' }
      })
    ]
  });
}

function yourHistory() {
  return step({
    id: 'your_history',
    label: 'Your History',
    helperText: 'You do not need to tell your whole life story here. Tell us what still matters now.',
    whyWeAsk: 'What still affects you from the past helps your therapist go carefully and not miss important context.',
    fields: [
      field({
        key: 'how_you_grew_up',
        label: 'Is there anything about how you grew up that would help your therapist understand you today?',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'major_loss',
        label: 'Have you experienced a major loss that still affects you?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'major_loss_what',
        label: 'What should your therapist know?',
        showIf: { fieldKey: 'major_loss', equals: 'yes' }
      }),
      field({
        key: 'trauma_experienced',
        label:
          'Have you experienced something you consider traumatic, frightening, violent, abusive, or deeply distressing?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'trauma_still_affecting',
        label: 'Is it still affecting you now?',
        type: 'radio',
        options: yesNoNotSure(),
        showIf: { fieldKey: 'trauma_experienced', equals: ['yes', 'not_sure'] }
      }),
      field({
        key: 'trauma_effects_now',
        label: 'You do not need to describe the event here. What effects are you noticing now?',
        showIf: { fieldKey: 'trauma_still_affecting', equals: 'yes' }
      }),
      field({
        key: 'past_experiences_not_on_form',
        label:
          'Are there experiences from your past that you do not want to describe on a form but want your therapist to know exist?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'family_mental_illness_history',
        label: 'Does mental illness, addiction, or suicide have a significant history in your immediate family?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'family_history_what',
        label: 'What would be useful for your therapist to know?',
        showIf: { fieldKey: 'family_mental_illness_history', equals: 'yes' }
      }),
      field({
        key: 'repeating_patterns',
        label: 'Are there patterns in your life that seem to keep repeating even when you want them to change?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'repeating_patterns_what',
        label: 'What pattern do you notice?',
        showIf: { fieldKey: 'repeating_patterns', equals: 'yes' }
      })
    ]
  });
}

function safety() {
  return step({
    id: 'safety',
    label: 'Safety',
    helperText:
      'We ask the same basic safety questions so your therapist knows whether anything needs attention right away.',
    whyWeAsk: 'These questions help us know whether anything needs attention before the first session.',
    fields: [
      field({
        key: 'safety_deny_all',
        type: 'deny_all',
        label: 'Deny all — none of these safety concerns apply',
        helperText: 'Sets every safety question below to the no-concern answer.',
        denyAllValue: 'no',
        denyAllOverrides: { feel_physically_safe: 'yes' },
        denyAllKeys: [
          'feel_physically_safe',
          'afraid_someone_may_hurt_you',
          'safety_immediate_danger',
          'hurt_yourself_past',
          'suicide_attempt_ever',
          'cssrs_1',
          'cssrs_2',
          'cssrs_3',
          'cssrs_4',
          'cssrs_5',
          'cssrs_6'
        ]
      }),
      field({
        key: 'feel_physically_safe',
        label: 'Do you feel physically safe where you live?',
        type: 'radio',
        required: true,
        optional: false,
        options: yesNoNotSure()
      }),
      field({
        key: 'feel_unsafe_what',
        label: 'What is making you feel unsafe?',
        showIf: { fieldKey: 'feel_physically_safe', equals: ['no', 'not_sure'] }
      }),
      field({
        key: 'afraid_someone_may_hurt_you',
        label: 'Are you currently afraid that another person may hurt you?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'safety_immediate_danger',
        label: 'Are you currently in immediate danger of hurting yourself or someone else?',
        type: 'radio',
        required: true,
        optional: false,
        options: yesNo()
      }),
      field({
        key: 'hurt_yourself_past',
        label: 'Have you intentionally hurt yourself in the past?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'hurt_yourself_when',
        label: 'When was the most recent time?',
        type: 'text',
        showIf: { fieldKey: 'hurt_yourself_past', equals: 'yes' }
      }),
      field({
        key: 'self_harm_urges_now',
        label: 'Are you having urges to hurt yourself now?',
        type: 'radio',
        options: yesNo(),
        showIf: { fieldKey: 'hurt_yourself_past', equals: 'yes' }
      }),
      field({
        key: 'suicide_attempt_ever',
        label: 'Have you ever attempted suicide?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'suicide_attempt_when',
        label: 'When was the most recent attempt?',
        type: 'text',
        showIf: { fieldKey: 'suicide_attempt_ever', equals: 'yes' }
      }),
      ...buildCssrsScreenerFields(),
      field({
        key: 'lethal_means_accessible',
        label: 'Are firearms or other potentially lethal weapons or means readily accessible to you?',
        type: 'radio',
        options: yesNo(),
        showIf: SAFETY_SCREEN_POSITIVE
      }),
      field({
        key: 'lethal_means_secured',
        label: 'Are they currently secured or stored in a way that limits immediate access?',
        type: 'radio',
        options: yesNo(),
        showIf: { fieldKey: 'lethal_means_accessible', equals: 'yes' }
      }),
      field({
        key: 'someone_if_unsafe',
        label: 'Is there someone you can contact or be with if you feel unsafe?',
        type: 'radio',
        options: yesNo(),
        showIf: SAFETY_SCREEN_POSITIVE
      }),
      field({
        key: 'someone_if_unsafe_who',
        label: 'Who?',
        type: 'text',
        showIf: { fieldKey: 'someone_if_unsafe', equals: 'yes' }
      })
    ]
  });
}

function whatHelps() {
  return step({
    id: 'what_helps',
    label: 'What Helps You',
    helperText: 'Your therapist should know what already works, not only what is going wrong.',
    whyWeAsk: 'Strengths and what already helps are as useful as the problem list.',
    fields: [
      field({ key: 'when_life_difficult', label: 'When life gets difficult, what do you usually do?' }),
      field({ key: 'what_reliably_helps', label: 'What reliably helps you feel better or more grounded?' }),
      field({ key: 'what_tends_to_make_worse', label: 'What tends to make things worse?' }),
      field({ key: 'what_are_you_good_at', label: 'What are you good at?' }),
      field({
        key: 'handled_well',
        label: 'What have you handled well in your life, even if it was difficult?'
      }),
      field({ key: 'what_keeps_you_going', label: 'What keeps you going when things are rough?' }),
      field({
        key: 'what_you_enjoy',
        label: 'What do you enjoy doing when you actually have the time or energy?'
      }),
      field({
        key: 'especially_important',
        label: 'Is there a person, responsibility, goal, activity, belief, or commitment that is especially important to you?',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'people_misunderstand',
        label: 'What is something people often misunderstand about you?',
        optional: true,
        helperText: 'Optional'
      })
    ]
  });
}

function howTherapyWorks() {
  return step({
    id: 'how_therapy_works',
    label: 'How You Want Therapy to Work',
    helperText: 'Different people work well with different therapists. Tell us what tends to work for you.',
    whyWeAsk: 'Fit matters. Knowing how you work best helps us match style, not just availability.',
    fields: [
      field({
        key: 'worked_with_therapist_before',
        label: 'Have you worked with a therapist before?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'how_direct',
        label: 'How direct would you like your therapist to be?',
        type: 'radio',
        options: [
          opt('very_gentle', 'Very gentle'),
          opt('balanced', 'Balanced'),
          opt('direct', 'Direct'),
          opt('very_direct', 'Very direct')
        ]
      }),
      field({
        key: 'most_helpful_when_struggling',
        label: 'When you are struggling, what is usually most helpful?',
        type: 'radio',
        layout: 'cards',
        options: [
          opt('someone_listening', 'Someone listening'),
          opt('asking_questions', 'Asking me questions'),
          opt('helping_understand', 'Helping me understand what is happening'),
          opt('practical_tools', 'Giving me practical tools'),
          opt('challenging_thinking', 'Challenging my thinking'),
          opt('making_a_plan', 'Helping me make a plan'),
          opt('holding_accountable', 'Holding me accountable'),
          opt('time_to_figure_out', 'Giving me time to figure things out'),
          opt('combination', 'A combination')
        ]
      }),
      field({
        key: 'want_between_session_work',
        label: 'Do you want practical things to work on between sessions?',
        type: 'radio',
        options: [opt('yes', 'Yes'), opt('no', 'No'), opt('sometimes', 'Sometimes')]
      }),
      field({
        key: 'if_therapist_disagrees',
        label: 'If your therapist disagrees with you or sees something differently, how would you like them to handle it?'
      }),
      field({
        key: 'what_makes_you_shut_down',
        label: 'What tends to make you shut down, disengage, or stop trusting someone who is trying to help?'
      }),
      field({ key: 'what_helps_you_trust', label: 'What helps you trust someone?' }),
      field({
        key: 'do_not_assume',
        label: 'Is there anything you do not want a therapist to assume about you?'
      }),
      field({
        key: 'prefer_not_to_focus',
        label: 'Is there anything you would prefer not to focus on unless you bring it up first?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'prefer_not_to_focus_what',
        label: 'What?',
        showIf: { fieldKey: 'prefer_not_to_focus', equals: 'yes' }
      }),
      field({
        key: 'therapist_gets_me',
        label: 'What would make you think, “This therapist gets me”?'
      })
    ]
  });
}

function whatToChange() {
  return step({
    id: 'what_to_change',
    label: 'What Do You Want to Change?',
    helperText: 'Therapy needs somewhere to go. Tell us what better would actually look like.',
    whyWeAsk: 'Clear goals make it possible to tell whether therapy is actually helping.',
    fields: [
      field({
        key: 'three_most_important',
        label: 'What are the three most important things you want help with?'
      }),
      field({
        key: 'different_in_three_months',
        label: 'If therapy is working, what would be different three months from now?'
      }),
      field({
        key: 'someone_close_would_notice',
        label: 'What would someone close to you notice was different?'
      }),
      field({ key: 'what_you_would_notice_first', label: 'What would you notice first?' }),
      field({ key: 'doing_more_of', label: 'What would you be doing more of?' }),
      field({ key: 'doing_less_of', label: 'What would you be doing less of?' }),
      field({
        key: 'what_might_make_difficult',
        label: 'What might make it difficult for you to make these changes?'
      }),
      field({
        key: 'readiness_0_10',
        label: 'How ready are you to work on this right now?',
        type: 'radio',
        layout: 'pills',
        options: Array.from({ length: 11 }, (_, i) => opt(String(i), String(i)))
      }),
      field({
        key: 'what_would_need_to_change_for_ready',
        label: 'What would need to change for you to feel more ready?',
        showIf: { fieldKey: 'readiness_0_10', equals: ['0', '1', '2', '3', '4'] }
      }),
      field({ key: 'what_would_make_therapy_worth_it', label: 'What would make therapy worth your time?' }),
      field({
        key: 'first_thing_to_ask',
        label: 'What is the first thing you would want your therapist to ask you about?'
      })
    ]
  });
}

function questionnaires() {
  return step({
    id: 'questionnaires',
    label: 'Standard Questionnaires',
    type: 'clinical_questions',
    helperText:
      'A few short questionnaires give your therapist a baseline and help measure whether treatment is actually helping.',
    whyWeAsk: 'These are the same measures your therapist will use later to see whether treatment is helping.',
    fields: buildStandardQuestionnaireFields()
  });
}

function anythingMissed() {
  return step({
    id: 'anything_missed',
    label: 'Anything We Missed?',
    helperText: 'Last question. Tell your therapist anything important that the form did not ask.',
    whyWeAsk: 'You know what the form did not capture. This is the place for it.',
    fields: [
      field({
        key: 'what_we_have_not_asked',
        label: 'What have we not asked that you think we should know?',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'answers_might_be_misunderstood',
        label: 'Is there anything you are concerned your answers might be misunderstood about?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'answers_misunderstood_what',
        label: 'What should we understand?',
        showIf: { fieldKey: 'answers_might_be_misunderstood', equals: 'yes' }
      }),
      field({
        key: 'know_before_first_session',
        label: 'Is there anything you want your therapist to know before you walk into the first session?',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'rather_explain_in_person',
        label: 'Is there anything you would rather explain in person instead of writing here?',
        type: 'radio',
        options: yesNo()
      })
    ]
  });
}

export function buildCounselingSelfEnSteps() {
  return [
    aboutYou(),
    whatBringsYou(),
    combineSteps(
      'symptoms_and_life',
      'How You Feel & How Life Is Going',
      'Symptoms and how they show up day to day. Life-area ratings start as Going well for convenience — please update as needed.',
      'This helps us understand both what you are experiencing and how it is affecting daily life.',
      [howFeeling(), howLifeGoing()]
    ),
    combineSteps(
      'history_health',
      'History, Health & Substances',
      'Past care, medical context, and substance use.',
      'A combined history helps us care for you safely without asking you to repeat yourself across pages.',
      [treatmentHistory(), healthMedsSubstances()]
    ),
    combineSteps(
      'life_and_history',
      'Your Life & History',
      'Important people and the story that shaped you.',
      'Relationships and history together give a fuller picture of what support should look like.',
      [lifeAndPeople(), yourHistory()]
    ),
    safety(),
    questionnaires()
  ];
}

export function flattenIntakeFields(steps) {
  const fields = [];
  for (const stepDef of steps || []) {
    if (!['questions', 'clinical_questions', 'demographics'].includes(String(stepDef?.type || ''))) continue;
    for (const f of stepDef.fields || []) {
      if (!f || f.type === 'info') continue;
      const labelRaw = String(f.label || '').trim();
      const keyRaw = String(f.key || '').trim();
      if (!labelRaw && !keyRaw) continue;
      fields.push({
        key: f.key || f.id,
        label: f.label || f.key,
        type: f.type,
        required: !!f.required,
        options: f.options || [],
        helperText: f.helperText || '',
        showIf: f.showIf || null,
        scope:
          f.scope
          || (stepDef.type === 'clinical_questions' ? 'clinical' : 'self'),
        category: f.category || 'clinical',
        exclusiveValue: f.exclusiveValue || null,
        section: f.section || null,
        instrument: f.instrument || null
      });
    }
  }
  return fields;
}

export function mergeCounselingSelfEnIntoSteps(existingSteps = []) {
  const counseling = buildCounselingSelfEnSteps();
  const kept = (Array.isArray(existingSteps) ? existingSteps : []).filter((s) => {
    const id = String(s?.id || '');
    if (id.startsWith(COUNSELING_SELF_STEP_PREFIX)) return false;
    if (String(s?.type || '') === 'questions' && (!Array.isArray(s.fields) || s.fields.length === 0)) {
      return false;
    }
    return true;
  });
  return [...counseling, ...kept];
}
