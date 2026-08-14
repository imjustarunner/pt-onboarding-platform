/**
 * Master English counseling intake — parent/guardian + per-child (dependent).
 * Question labels are verbatim from the clinical interview spec.
 * Part A is completed once. Part B repeats for every child.
 */
import { buildCounselingSelfEnSteps, COUNSELING_SELF_STEP_PREFIX } from './counselingIntakeSelfEn.js';
import {
  buildAsqFields,
  buildCrafftFields,
  buildPsc17Fields,
  buildScared5ParentFields,
  buildVanderbiltAdhd18Fields
} from './validatedClinicalScreens.en.js';

export const COUNSELING_DEP_STEP_PREFIX = 'counseling_dep_';

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
  scope = 'client',
  instrument = ''
}) {
  return {
    id: `field_${key}`,
    key,
    label,
    type,
    required: optional ? false : required,
    helperText,
    placeholder,
    scope,
    visibility: 'always',
    showIf: showIf || { fieldKey: '', equals: '' },
    options,
    exclusiveValue: exclusiveValue || undefined,
    section,
    layout: layout || undefined,
    maxLength: maxLength || undefined,
    category: 'clinical',
    instrument: instrument || undefined
  };
}

function guardianStep({ id, label, helperText, whyWeAsk, type = 'questions', fields, required }) {
  return {
    id: `${COUNSELING_DEP_STEP_PREFIX}${id}`,
    type,
    label,
    helperText,
    whyWeAsk,
    audience: 'guardian',
    scope: 'guardian',
    visibility: 'always',
    required: required === undefined ? undefined : required,
    fields
  };
}

function childStep({ id, label, helperText, whyWeAsk, type = 'questions', fields, showWhen = '' }) {
  return {
    id: `${COUNSELING_DEP_STEP_PREFIX}${id}`,
    type,
    label,
    helperText,
    whyWeAsk,
    audience: 'dependent',
    scope: 'client',
    repeatPerClient: true,
    visibility: 'always',
    showWhen: showWhen || undefined,
    fields
  };
}

function stampSection(fields, section) {
  return (fields || []).map((f) => ({ ...f, section: f.section || section }));
}

function combineGuardianSteps(id, label, helperText, whyWeAsk, parts) {
  return guardianStep({
    id,
    label,
    helperText,
    whyWeAsk,
    type: parts?.[0]?.type || 'questions',
    fields: (parts || []).flatMap((p) => stampSection(p.fields, p.label))
  });
}

function combineChildSteps(id, label, helperText, whyWeAsk, parts) {
  return childStep({
    id,
    label,
    helperText,
    whyWeAsk,
    type: parts?.[0]?.type || 'questions',
    fields: (parts || []).flatMap((p) => stampSection(p.fields, p.label)),
    showWhen: parts?.[0]?.showWhen || ''
  });
}

const CONCERN_ANY = { fieldKey: 'presenting_concerns', equals: [] };
const EMOTION_ANY = { fieldKey: 'emotional_symptoms', notEquals: 'none' };
const HIGH_ENERGY = {
  any: [
    { fieldKey: 'emotional_symptoms', includes: 'unusually_high_energy' },
    { fieldKey: 'emotional_symptoms', includes: 'needing_little_sleep' }
  ]
};
const UNUSUAL_PERCEPTIONS = { fieldKey: 'emotional_symptoms', includes: 'unusual_perceptions' };
const SLEEP_DIFFICULTY = { fieldKey: 'life_sleep', equals: ['some_difficulty', 'significant_difficulty'] };
const EATING_CONCERN = { fieldKey: 'life_eating', equals: ['some_concerns', 'significant_concerns'] };
const SCHOOL_SUPPORT_ANY = { fieldKey: 'school_supports', notEquals: 'none' };
const DEV_DELAY_ANY = { fieldKey: 'development_delays', notEquals: ['none', 'not_sure'] };
const HEALTH_HX_ANY = { fieldKey: 'health_history', notEquals: 'none' };
const PRIOR_SERVICES_ANY = { fieldKey: 'prior_services', notEquals: 'none' };
const LIFE_CHANGE_ANY = { fieldKey: 'life_changes', notEquals: 'none' };
const TRAUMA_YES_NS = { fieldKey: 'trauma_experienced', equals: ['yes', 'not_sure'] };
const SUBSTANCE_ANY = {
  fieldKey: 'substances_used',
  includesAny: ['alcohol', 'cannabis', 'nicotine', 'rx_not_theirs', 'other']
};
const ASQ_OR_SAFETY_POSITIVE = {
  any: [
    { fieldKey: 'asq_1', equals: 'yes' },
    { fieldKey: 'asq_2', equals: 'yes' },
    { fieldKey: 'asq_3', equals: 'yes' },
    { fieldKey: 'asq_4', equals: 'yes' },
    { fieldKey: 'asq_5', equals: 'yes' },
    { fieldKey: 'talked_wanting_to_die', equals: ['yes', 'not_sure'] },
    { fieldKey: 'self_harm', equals: ['yes', 'not_sure'] }
  ]
};
const ADHD_INDICATED = {
  any: [
    { fieldKey: 'presenting_concerns', includesAny: ['trouble_attention', 'hyperactivity_impulsivity'] },
    { fieldKey: 'school_concerns', includes: 'attention' }
  ]
};
const ANXIETY_INDICATED = {
  any: [
    { fieldKey: 'presenting_concerns', includesAny: ['worry_anxiety', 'school_avoidance'] },
    { fieldKey: 'emotional_symptoms', includesAny: ['more_worry', 'panic'] }
  ]
};
const PSC_SHOW = {
  all: [
    { fieldKey: '_age_gte_4', equals: 'yes' },
    { fieldKey: '_age_lte_17', equals: 'yes' }
  ]
};
const ASQ_SHOW = {
  any: [
    { fieldKey: '_age_gte_8', equals: 'yes' },
    { fieldKey: '_age_unknown', equals: 'yes' },
    { fieldKey: 'self_harm', equals: ['yes', 'not_sure'] },
    { fieldKey: 'talked_wanting_to_die', equals: ['yes', 'not_sure'] }
  ]
};

function partAAboutYou() {
  return guardianStep({
    id: 'about_you',
    label: 'About You',
    helperText: 'First, tell us who is completing these forms.',
    whyWeAsk: 'We need to know who is enrolling the child and whether they can consent to treatment.',
    fields: [
      field({
        key: 'guardian_legal_first',
        label: 'Legal first name',
        type: 'text',
        scope: 'guardian'
      }),
      field({
        key: 'guardian_legal_last',
        label: 'Legal last name',
        type: 'text',
        scope: 'guardian'
      }),
      field({
        key: 'guardian_preferred_name',
        label: 'Preferred name',
        type: 'text',
        scope: 'guardian'
      }),
      field({
        key: 'guardian_dob',
        label: 'Date of birth',
        type: 'date',
        scope: 'guardian'
      }),
      field({
        key: 'guardian_email',
        label: 'Email',
        type: 'email',
        scope: 'guardian'
      }),
      field({
        key: 'guardian_phone',
        label: 'Phone',
        type: 'tel',
        scope: 'guardian'
      }),
      field({
        key: 'guardian_preferred_contact',
        label: 'Preferred contact method',
        type: 'radio',
        scope: 'guardian',
        options: [
          opt('text', 'Text'),
          opt('email', 'Email'),
          opt('phone', 'Phone'),
          opt('any', 'Any')
        ]
      }),
      field({
        key: 'guardian_best_time',
        label: 'Best time to contact you',
        type: 'checkbox',
        layout: 'cards',
        scope: 'guardian',
        options: [
          opt('morning', 'Morning (8am–12pm)'),
          opt('afternoon', 'Afternoon (12–5pm)'),
          opt('evening', 'Evening (5–8pm)'),
          opt('anytime', 'Anytime')
        ]
      }),
      field({
        key: 'guardian_relationship_to_child',
        label: 'Your relationship to the child or children. I am their:',
        type: 'radio',
        layout: 'cards',
        scope: 'guardian',
        options: [
          opt('parent', 'Parent'),
          opt('legal_guardian', 'Legal guardian'),
          opt('foster_parent', 'Foster parent'),
          opt('grandparent', 'Grandparent'),
          opt('stepparent', 'Stepparent'),
          opt('other', 'Other')
        ]
      }),
      field({
        key: 'guardian_relationship_other',
        label: 'What is your relationship to the child or children?',
        type: 'text',
        scope: 'guardian',
        showIf: { fieldKey: 'guardian_relationship_to_child', equals: 'other' }
      }),
      field({
        key: 'legal_authority',
        label: 'Do you have legal authority to consent to treatment?',
        type: 'radio',
        scope: 'guardian',
        options: [
          opt('yes', 'Yes'),
          opt('no', 'No'),
          opt('shared', 'Shared authority')
        ]
      }),
      field({
        key: 'authority_name',
        label: 'Who has legal authority? Name',
        type: 'text',
        scope: 'guardian',
        showIf: { fieldKey: 'legal_authority', equals: 'no' }
      }),
      field({
        key: 'authority_relationship',
        label: 'Relationship',
        type: 'text',
        scope: 'guardian',
        showIf: { fieldKey: 'legal_authority', equals: 'no' }
      }),
      field({
        key: 'authority_contact',
        label: 'Contact information',
        type: 'textarea',
        scope: 'guardian',
        showIf: { fieldKey: 'legal_authority', equals: 'no' }
      }),
      field({
        key: 'shared_authority_name',
        label: 'Who else shares legal authority? Name',
        type: 'text',
        scope: 'guardian',
        showIf: { fieldKey: 'legal_authority', equals: 'shared' }
      }),
      field({
        key: 'shared_authority_relationship',
        label: 'Relationship',
        type: 'text',
        scope: 'guardian',
        showIf: { fieldKey: 'legal_authority', equals: 'shared' }
      }),
      field({
        key: 'shared_authority_contact',
        label: 'Contact information',
        type: 'textarea',
        scope: 'guardian',
        showIf: { fieldKey: 'legal_authority', equals: 'shared' }
      }),
      field({
        key: 'custody_arrangement_notes',
        label: 'Is there anything about the custody or decision-making arrangement we need to know before beginning services?',
        optional: true,
        scope: 'guardian'
      })
    ]
  });
}

function partACustodyUpload() {
  return {
    id: `${COUNSELING_DEP_STEP_PREFIX}custody_upload`,
    type: 'upload',
    label: 'Upload custody documentation, if applicable',
    helperText: 'You can skip this if it does not apply.',
    audience: 'guardian',
    scope: 'guardian',
    visibility: 'always',
    required: false,
    maxFiles: 5,
    fields: []
  };
}

function partAFamilyContact() {
  return guardianStep({
    id: 'family_contact',
    label: 'Family Contact & Logistics',
    helperText: 'These details help us communicate with your family and coordinate care.',
    whyWeAsk: 'Contact, emergency, and logistics details stay at the family level so we do not ask them again for every child.',
    fields: [
      field({
        key: 'home_street',
        label: 'Home address',
        type: 'text',
        scope: 'guardian',
        placeholder: 'Street address'
      }),
      field({
        key: 'home_apt',
        label: 'Apt / unit',
        type: 'text',
        optional: true,
        scope: 'guardian'
      }),
      field({
        key: 'home_zip',
        label: 'ZIP',
        type: 'text',
        scope: 'guardian',
        placeholder: '80903'
      }),
      field({
        key: 'home_city',
        label: 'City',
        type: 'text',
        scope: 'guardian'
      }),
      field({
        key: 'home_state',
        label: 'State',
        type: 'text',
        scope: 'guardian'
      }),
      field({
        key: 'appointment_reminder_recipients',
        label: 'Who should receive appointment reminders?',
        type: 'textarea',
        scope: 'guardian'
      }),
      field({
        key: 'other_guardian_communication',
        label: 'Is there another parent or guardian who should receive communication?',
        type: 'radio',
        scope: 'guardian',
        options: yesNo()
      }),
      field({
        key: 'other_guardian_name',
        label: 'Name',
        type: 'text',
        scope: 'guardian',
        showIf: { fieldKey: 'other_guardian_communication', equals: 'yes' }
      }),
      field({
        key: 'other_guardian_relationship',
        label: 'Relationship',
        type: 'text',
        scope: 'guardian',
        showIf: { fieldKey: 'other_guardian_communication', equals: 'yes' }
      }),
      field({
        key: 'other_guardian_email',
        label: 'Email',
        type: 'email',
        scope: 'guardian',
        showIf: { fieldKey: 'other_guardian_communication', equals: 'yes' }
      }),
      field({
        key: 'other_guardian_phone',
        label: 'Phone',
        type: 'tel',
        scope: 'guardian',
        showIf: { fieldKey: 'other_guardian_communication', equals: 'yes' }
      }),
      field({
        key: 'other_guardian_share',
        label: 'What information may we share with them?',
        type: 'textarea',
        scope: 'guardian',
        showIf: { fieldKey: 'other_guardian_communication', equals: 'yes' }
      }),
      field({
        key: 'emergency_contact_name',
        label: 'Emergency contact — Name',
        type: 'text',
        scope: 'guardian',
        section: 'Emergency contact'
      }),
      field({
        key: 'emergency_contact_relationship',
        label: 'Relationship',
        type: 'text',
        scope: 'guardian',
        section: 'Emergency contact'
      }),
      field({
        key: 'emergency_contact_phone',
        label: 'Phone',
        type: 'tel',
        scope: 'guardian',
        section: 'Emergency contact'
      }),
      field({
        key: 'family_logistics',
        label: 'Are there any practical issues that could make attending services difficult?',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'no',
        scope: 'guardian',
        section: 'Family logistics',
        options: [
          opt('transportation', 'Transportation'),
          opt('work_schedule', 'Work schedule'),
          opt('childcare', 'Childcare'),
          opt('school_schedule', 'School schedule'),
          opt('technology_internet', 'Technology/internet'),
          opt('cost', 'Cost'),
          opt('other', 'Other'),
          opt('no', 'No')
        ]
      }),
      field({
        key: 'family_logistics_notes',
        label: 'What would be helpful for us to know?',
        scope: 'guardian',
        showIf: { fieldKey: 'family_logistics', notEquals: 'no' }
      })
    ]
  });
}

function childAbout() {
  return childStep({
    id: 'about_child',
    label: 'About {childName}',
    helperText: 'Start with who your child is—not what is wrong.',
    whyWeAsk: 'A picture of who this child is helps the provider meet them as a person first.',
    fields: [
      field({ key: 'child_legal_first', label: 'Legal first name', type: 'text' }),
      field({ key: 'child_legal_last', label: 'Legal last name', type: 'text' }),
      field({ key: 'child_preferred_name', label: 'What name do they usually go by?', type: 'text' }),
      field({ key: 'child_dob', label: 'Date of birth', type: 'date' }),
      field({
        key: 'child_sex',
        label: 'Sex',
        type: 'radio',
        layout: 'cards',
        options: [
          opt('female', 'Female'),
          opt('male', 'Male')
        ]
      }),
      field({
        key: 'child_preferred_called',
        label: 'If they want to be called something different, write it here',
        type: 'text',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'child_preferred_language',
        label: 'Preferred language',
        type: 'text',
        placeholder: 'e.g. English, Spanish'
      }),
      field({ key: 'address_street', label: 'Street address', type: 'text' }),
      field({ key: 'address_city', label: 'City', type: 'text' }),
      field({ key: 'address_state', label: 'State', type: 'text' }),
      field({ key: 'address_zip', label: 'ZIP code', type: 'text' }),
      field({ key: 'child_grade', label: 'Current grade', type: 'text' }),
      field({ key: 'child_school', label: 'School', type: 'text' }),
      field({
        key: 'time_outside_school',
        label: 'What do they spend most of their time doing outside of school?'
      }),
      field({ key: 'child_interests', label: 'What are they interested in?' }),
      field({ key: 'child_strengths', label: 'What are they good at?' }),
      field({
        key: 'describe_this_child',
        label: 'If you were describing this child to someone who had never met them, what would you want that person to know?'
      }),
      field({
        key: 'people_misunderstand_child',
        label: 'What is something people tend to misunderstand about them?',
        optional: true,
        helperText: 'Optional'
      }),
      field({
        key: 'communication_learning_notes',
        label: 'Is there anything about how they communicate, learn, or interact with people that would be helpful for us to know?',
        optional: true,
        helperText: 'Optional'
      })
    ]
  });
}

function childWhatBrings() {
  return childStep({
    id: 'what_brings',
    label: 'What Brings {childName} Here?',
    helperText: 'Tell us what you have been noticing and why you are looking for help now.',
    whyWeAsk: 'Your words about why now help the provider start in the right place.',
    fields: [
      field({
        key: 'main_reason_seeking',
        label: 'What is the main reason you are seeking support for this child?'
      }),
      field({ key: 'why_seeking_now', label: 'Why are you seeking help now?' }),
      field({ key: 'most_concerned_about', label: 'What are you most concerned about?' }),
      field({
        key: 'presenting_concerns',
        label: 'What have you been noticing? Select all that apply:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none_describe',
        options: [
          opt('worry_anxiety', 'Worry or anxiety'),
          opt('sadness_low_mood', 'Sadness or low mood'),
          opt('anger_irritability', 'Anger or irritability'),
          opt('emotional_outbursts', 'Emotional outbursts'),
          opt('difficulty_calming', 'Difficulty calming down'),
          opt('trouble_attention', 'Trouble paying attention'),
          opt('hyperactivity_impulsivity', 'Hyperactivity or impulsivity'),
          opt('defiance', 'Defiance or frequent arguments'),
          opt('school_avoidance', 'School avoidance'),
          opt('academic_difficulty', 'Academic difficulty'),
          opt('friendship_problems', 'Friendship problems'),
          opt('social_difficulty', 'Social difficulty'),
          opt('low_confidence', 'Low confidence'),
          opt('sleep_problems', 'Sleep problems'),
          opt('eating_concerns', 'Eating concerns'),
          opt('grief_loss', 'Grief or loss'),
          opt('stress_after_experience', 'Stress after a difficult experience'),
          opt('repetitive_behaviors', 'Repetitive behaviors or thoughts'),
          opt('sensory_difficulties', 'Sensory difficulties'),
          opt('developmental_concerns', 'Developmental concerns'),
          opt('substance_use', 'Substance use'),
          opt('self_harm_safety', 'Self-harm or safety concerns'),
          opt('something_else', 'Something else'),
          opt('none_describe', 'None of these describe it well')
        ]
      }),
      field({
        key: 'presenting_concerns_other',
        label: 'What else have you been noticing?',
        type: 'text',
        showIf: { fieldKey: 'presenting_concerns', includes: 'something_else' }
      }),
      field({
        key: 'biggest_concern_now',
        label: 'Which concern is the biggest problem right now?',
        showIf: { fieldKey: 'presenting_concerns', notEquals: 'none_describe', minSelected: 2 }
      }),
      field({
        key: 'concern_duration',
        label: 'How long have you been noticing this?',
        type: 'radio',
        layout: 'cards',
        showIf: CONCERN_ANY,
        options: [
          opt('less_than_2_weeks', 'Less than 2 weeks'),
          opt('2_weeks_2_months', '2 weeks–2 months'),
          opt('2_6_months', '2–6 months'),
          opt('6_12_months', '6–12 months'),
          opt('more_than_a_year', 'More than a year'),
          opt('always_part_of_them', 'It has always been part of them'),
          opt('comes_and_goes', 'Comes and goes')
        ]
      }),
      field({
        key: 'concern_precipitant',
        label: 'Did something change around the time this started?',
        type: 'radio',
        showIf: CONCERN_ANY,
        options: yesNoNotSure()
      }),
      field({
        key: 'concern_what_happened',
        label: 'What happened?',
        showIf: { fieldKey: 'concern_precipitant', equals: ['yes', 'not_sure'] }
      }),
      field({
        key: 'concern_triggers',
        label: 'What seems to trigger or worsen it?',
        showIf: CONCERN_ANY
      }),
      field({
        key: 'concern_what_helps',
        label: 'What seems to help?',
        showIf: CONCERN_ANY
      })
    ]
  });
}

function childEmotional() {
  return childStep({
    id: 'emotional',
    label: 'How {childName} Has Been Doing Emotionally',
    helperText: 'Answer based on what you actually see or what your child has told you.',
    whyWeAsk: 'Recent emotional changes help us know what to assess first.',
    fields: [
      field({
        key: 'emotional_symptoms',
        label: 'During the past few weeks, have you noticed:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('more_sadness', 'More sadness than usual'),
          opt('less_interest', 'Less interest in things they normally enjoy'),
          opt('more_worry', 'More worry or fear'),
          opt('panic', 'Panic'),
          opt('increased_irritability', 'Increased irritability'),
          opt('frequent_anger', 'Frequent anger'),
          opt('mood_changing_quickly', 'Mood changing quickly'),
          opt('crying_more', 'Crying more often'),
          opt('trouble_calming', 'Trouble calming down'),
          opt('overwhelmed_easily', 'Becoming overwhelmed easily'),
          opt('withdrawing', 'Withdrawing from others'),
          opt('wanting_to_be_alone', 'Wanting to be alone more'),
          opt('reassurance_seeking', 'Increased reassurance seeking'),
          opt('physical_complaints', 'Frequent physical complaints when stressed'),
          opt('nightmares', 'Nightmares'),
          opt('avoiding_situations', 'Avoiding certain situations'),
          opt('unwanted_thoughts', 'Unwanted or repetitive thoughts'),
          opt('repetitive_checking', 'Repetitive checking or behaviors'),
          opt('appearing_disconnected', 'Appearing disconnected or "not there"'),
          opt('unusually_high_energy', 'Unusually high energy'),
          opt('needing_little_sleep', 'Needing very little sleep without appearing tired'),
          opt('dramatically_different', 'Behavior that seems dramatically different from their usual self'),
          opt('unusual_perceptions', 'Reporting hearing or seeing things others do not'),
          opt('none', 'None of these')
        ]
      }),
      field({
        key: 'emotional_most_often',
        label: 'Which concerns happen most often?',
        showIf: EMOTION_ANY
      }),
      field({
        key: 'emotional_how_often',
        label: 'How often?',
        type: 'radio',
        layout: 'cards',
        showIf: EMOTION_ANY,
        options: [
          opt('occasionally', 'Occasionally'),
          opt('few_times_month', 'A few times a month'),
          opt('few_times_week', 'A few times a week'),
          opt('most_days', 'Most days'),
          opt('multiple_times_day', 'Multiple times a day')
        ]
      }),
      field({
        key: 'high_energy_duration',
        label: 'How long do these periods usually last?',
        showIf: HIGH_ENERGY
      }),
      field({
        key: 'high_energy_impulsive',
        label:
          'During these periods do they become noticeably more impulsive, reckless, talkative, aggressive, or difficult to slow down?',
        type: 'radio',
        showIf: HIGH_ENERGY,
        options: yesNoNotSure()
      }),
      field({
        key: 'unusual_perceptions_described',
        label: 'What have they described?',
        showIf: UNUSUAL_PERCEPTIONS
      }),
      field({
        key: 'unusual_perceptions_current',
        label: 'Is this happening currently?',
        type: 'radio',
        showIf: UNUSUAL_PERCEPTIONS,
        options: yesNo()
      })
    ]
  });
}

function childBehavior() {
  return childStep({
    id: 'behavior',
    label: 'Behavior & Regulation',
    helperText: 'Behavior tells us something. Help us understand when it happens and what happens around it.',
    whyWeAsk: 'Context around behavior is more useful than a list of incidents.',
    fields: [
      field({
        key: 'frequent_hard_behaviors',
        label: 'Does this child have frequent behaviors that are difficult to manage?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'behavior_what',
        label: 'What usually happens?',
        type: 'checkbox',
        layout: 'cards',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' },
        options: [
          opt('arguing', 'Arguing'),
          opt('refusing', 'Refusing'),
          opt('yelling', 'Yelling'),
          opt('crying', 'Crying'),
          opt('meltdowns', 'Meltdowns'),
          opt('aggression', 'Aggression'),
          opt('breaking_things', 'Breaking things'),
          opt('leaving_running', 'Leaving/running away'),
          opt('shutting_down', 'Shutting down'),
          opt('lying', 'Lying'),
          opt('stealing', 'Stealing'),
          opt('risk_taking', 'Risk-taking'),
          opt('other', 'Other')
        ]
      }),
      field({
        key: 'behavior_where',
        label: 'Where does it usually happen?',
        type: 'checkbox',
        layout: 'cards',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' },
        options: [
          opt('home', 'Home'),
          opt('school', 'School'),
          opt('with_peers', 'With peers'),
          opt('activities', 'Activities'),
          opt('community', 'Community'),
          opt('everywhere', 'Everywhere')
        ]
      }),
      field({
        key: 'behavior_before',
        label: 'What usually happens immediately before?',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' }
      }),
      field({
        key: 'behavior_function',
        label: 'What does your child seem to be trying to get, avoid, communicate, or change when this happens?',
        optional: true,
        helperText: 'Optional',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' }
      }),
      field({
        key: 'behavior_recover',
        label: 'What usually helps them recover?',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' }
      }),
      field({
        key: 'behavior_recover_time',
        label: 'About how long does it take them to return to normal?',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' }
      }),
      field({
        key: 'behavior_adults_tried',
        label: 'What have adults tried?',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' }
      }),
      field({
        key: 'behavior_worked',
        label: 'What has worked?',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' }
      }),
      field({
        key: 'behavior_worse',
        label: 'What tends to make it worse?',
        showIf: { fieldKey: 'frequent_hard_behaviors', equals: 'yes' }
      })
    ]
  });
}

function childDailyLife() {
  return childStep({
    id: 'daily_life',
    label: 'Daily Life',
    helperText: "Help us understand where the problem is actually affecting your child's life.",
    whyWeAsk: 'Functioning across daily routines shows where help will matter most.',
    fields: [
      field({
        key: 'life_sleep',
        label: 'How is your child doing with: Sleep',
        type: 'radio',
        options: [
          opt('going_well', 'Going well'),
          opt('some_difficulty', 'Some difficulty'),
          opt('significant_difficulty', 'Significant difficulty')
        ]
      }),
      field({
        key: 'sleep_difficulty_types',
        label: 'What kind of sleep difficulty?',
        type: 'checkbox',
        layout: 'cards',
        showIf: SLEEP_DIFFICULTY,
        options: [
          opt('falling_asleep', 'Falling asleep'),
          opt('staying_asleep', 'Staying asleep'),
          opt('nightmares', 'Nightmares'),
          opt('sleeping_too_much', 'Sleeping too much'),
          opt('waking_too_early', 'Waking too early'),
          opt('refusing_sleep_alone', 'Refusing to sleep alone'),
          opt('other', 'Other')
        ]
      }),
      field({
        key: 'life_eating',
        label: 'Eating',
        type: 'radio',
        options: [
          opt('going_well', 'Going well'),
          opt('some_concerns', 'Some concerns'),
          opt('significant_concerns', 'Significant concerns')
        ]
      }),
      field({
        key: 'life_hygiene',
        label: 'Hygiene and self-care',
        type: 'radio',
        options: [
          opt('age_appropriate', 'Age appropriate'),
          opt('needs_more_help', 'Needs more help than expected'),
          opt('significant_difficulty', 'Significant difficulty')
        ]
      }),
      field({
        key: 'life_responsibilities',
        label: 'Responsibilities',
        type: 'radio',
        options: [
          opt('going_well', 'Going well'),
          opt('some_difficulty', 'Some difficulty'),
          opt('significant_difficulty', 'Significant difficulty')
        ]
      }),
      field({
        key: 'life_family',
        label: 'Family relationships',
        type: 'radio',
        options: [
          opt('going_well', 'Going well'),
          opt('some_difficulty', 'Some difficulty'),
          opt('significant_difficulty', 'Significant difficulty')
        ]
      }),
      field({
        key: 'life_friendships',
        label: 'Friendships',
        type: 'radio',
        options: [
          opt('going_well', 'Going well'),
          opt('some_difficulty', 'Some difficulty'),
          opt('significant_difficulty', 'Significant difficulty')
        ]
      }),
      field({
        key: 'life_activities',
        label: 'Activities and hobbies',
        type: 'radio',
        options: [
          opt('participating_normally', 'Participating normally'),
          opt('participating_less', 'Participating less'),
          opt('no_longer_participating', 'No longer participating')
        ]
      }),
      field({
        key: 'hardest_everyday',
        label: 'What part of everyday life is hardest for them right now?'
      }),
      field({
        key: 'going_well_everyday',
        label: 'What part of everyday life is going well?'
      })
    ]
  });
}

function childSchool() {
  return childStep({
    id: 'school',
    label: 'School & Learning',
    helperText: 'School gives us another view of how your child is functioning.',
    whyWeAsk:
      'School and peer functioning are standard parts of child psychiatric assessment and can provide information that may differ substantially from what is seen at home.',
    fields: [
      field({ key: 'school_name', label: 'Current school', type: 'text' }),
      field({ key: 'school_grade', label: 'Current grade', type: 'text' }),
      field({
        key: 'feel_about_school',
        label: 'How does your child generally feel about school?',
        type: 'radio',
        layout: 'cards',
        options: [
          opt('likes_it', 'Likes it'),
          opt('mostly_okay', 'Mostly okay'),
          opt('dislikes_it', 'Dislikes it'),
          opt('strongly_avoids', 'Strongly avoids it'),
          opt('mixed', 'Mixed')
        ]
      }),
      field({
        key: 'school_attendance',
        label: 'How is attendance?',
        type: 'radio',
        options: [
          opt('no_concerns', 'No concerns'),
          opt('some_absences', 'Some absences/tardiness'),
          opt('significant_problems', 'Significant attendance problems')
        ]
      }),
      field({
        key: 'academics',
        label: 'How are they doing academically?',
        type: 'radio',
        options: [
          opt('above', 'Above expectations'),
          opt('meeting', 'Meeting expectations'),
          opt('some_difficulty', 'Some difficulty'),
          opt('significant_difficulty', 'Significant difficulty'),
          opt('not_sure', 'Not sure')
        ]
      }),
      field({
        key: 'grades_changed',
        label: 'Have grades changed recently?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'grades_change_direction',
        label: 'How have grades changed?',
        type: 'radio',
        showIf: { fieldKey: 'grades_changed', equals: 'yes' },
        options: [
          opt('improved', 'Improved'),
          opt('declined', 'Declined'),
          opt('inconsistent', 'Inconsistent')
        ]
      }),
      field({
        key: 'school_concerns',
        label: 'Any concerns with:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('attention', 'Attention'),
          opt('completing_work', 'Completing work'),
          opt('organization', 'Organization'),
          opt('reading', 'Reading'),
          opt('writing', 'Writing'),
          opt('math', 'Math'),
          opt('following_directions', 'Following directions'),
          opt('motivation', 'Motivation'),
          opt('behavior', 'Behavior'),
          opt('attendance', 'Attendance'),
          opt('test_anxiety', 'Test anxiety'),
          opt('none', 'None')
        ]
      }),
      field({
        key: 'school_supports',
        label: 'Does your child have:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('iep', 'IEP'),
          opt('plan_504', '504 Plan'),
          opt('behavior_plan', 'Behavior plan'),
          opt('special_education', 'Special education services'),
          opt('speech', 'Speech services'),
          opt('ot', 'Occupational therapy'),
          opt('school_counseling', 'School counseling'),
          opt('other', 'Other school support'),
          opt('none', 'None')
        ]
      }),
      field({
        key: 'school_support_details',
        label: 'What support are they receiving?',
        showIf: SCHOOL_SUPPORT_ANY
      }),
      field({
        key: 'teacher_concerns',
        label: 'Have teachers or school staff raised concerns?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'teacher_seeing',
        label: 'What are they seeing?',
        showIf: { fieldKey: 'teacher_concerns', equals: 'yes' }
      }),
      field({
        key: 'has_connected_friend',
        label: 'Does your child have at least one friend they feel connected to?',
        type: 'radio',
        section: 'Peers',
        options: yesNoNotSure()
      }),
      field({
        key: 'peer_concerns',
        label: 'Any current concerns involving:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        section: 'Peers',
        options: [
          opt('making_friends', 'Making friends'),
          opt('keeping_friends', 'Keeping friends'),
          opt('conflict', 'Conflict'),
          opt('bullying', 'Bullying'),
          opt('being_bullied', 'Being bullied'),
          opt('isolation', 'Isolation'),
          opt('social_judgment', 'Social judgment'),
          opt('none', 'None')
        ]
      })
    ]
  });
}

function childDevelopmentHealth() {
  return childStep({
    id: 'development_health',
    label: 'Development & Health',
    helperText: 'Development and physical health can affect behavior, mood, attention, and learning.',
    whyWeAsk:
      'Developmental and medical history—including pregnancy/birth, milestones, illness, injuries, medication, sleep, and development—is part of a comprehensive child assessment.',
    fields: [
      field({
        key: 'pregnancy_complications',
        label: 'Were there significant pregnancy, birth, or newborn complications?',
        type: 'radio',
        section: 'Pregnancy and birth',
        options: yesNoNotSure()
      }),
      field({
        key: 'pregnancy_what',
        label: 'What happened?',
        showIf: { fieldKey: 'pregnancy_complications', equals: 'yes' }
      }),
      field({
        key: 'born_premature',
        label: 'Was your child born prematurely?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'how_early',
        label: 'Approximately how early?',
        type: 'text',
        showIf: { fieldKey: 'born_premature', equals: 'yes' }
      }),
      field({
        key: 'development_delays',
        label: 'Were there concerns or delays with:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        section: 'Development',
        options: [
          opt('walking', 'Walking'),
          opt('talking', 'Talking'),
          opt('language', 'Language'),
          opt('toilet_training', 'Toilet training'),
          opt('fine_motor', 'Fine motor skills'),
          opt('social', 'Social development'),
          opt('learning', 'Learning'),
          opt('none', 'None'),
          opt('not_sure', 'Not sure')
        ]
      }),
      field({
        key: 'development_noticed',
        label: 'What did you notice?',
        showIf: DEV_DELAY_ANY
      }),
      field({
        key: 'medical_condition',
        label: 'Does your child have a medical condition that affects everyday life?',
        type: 'radio',
        section: 'Current health',
        options: yesNo()
      }),
      field({
        key: 'medical_know',
        label: 'What should the provider know?',
        showIf: { fieldKey: 'medical_condition', equals: 'yes' }
      }),
      field({
        key: 'health_history',
        label: 'History of:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('significant_illness', 'Significant illness'),
          opt('surgery', 'Surgery'),
          opt('hospitalization', 'Hospitalization'),
          opt('head_injury', 'Head injury'),
          opt('seizures', 'Seizures'),
          opt('loss_of_consciousness', 'Loss of consciousness'),
          opt('chronic_pain', 'Chronic pain'),
          opt('hearing', 'Hearing difficulty'),
          opt('vision', 'Vision difficulty'),
          opt('none', 'None')
        ]
      }),
      field({
        key: 'health_history_describe',
        label: 'Please describe.',
        showIf: HEALTH_HX_ANY
      }),
      field({
        key: 'taking_medication',
        label: 'Is your child currently taking medication or supplements?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'med_name',
        label: 'Medication',
        type: 'text',
        showIf: { fieldKey: 'taking_medication', equals: 'yes' }
      }),
      field({
        key: 'med_dose',
        label: 'Dose, if known',
        type: 'text',
        optional: true,
        showIf: { fieldKey: 'taking_medication', equals: 'yes' }
      }),
      field({
        key: 'med_reason',
        label: 'Reason',
        showIf: { fieldKey: 'taking_medication', equals: 'yes' }
      }),
      field({
        key: 'med_prescriber',
        label: 'Who prescribes it?',
        type: 'text',
        showIf: { fieldKey: 'taking_medication', equals: 'yes' }
      }),
      field({
        key: 'med_helpful',
        label: 'Does it seem helpful?',
        type: 'radio',
        options: yesNoNotSure(),
        showIf: { fieldKey: 'taking_medication', equals: 'yes' }
      }),
      field({
        key: 'med_side_effects',
        label: 'Any noticeable side effects?',
        optional: true,
        showIf: { fieldKey: 'taking_medication', equals: 'yes' }
      })
    ]
  });
}

function childPreviousHelp() {
  return childStep({
    id: 'previous_help',
    label: 'Previous Help',
    helperText: 'Knowing what has already happened keeps the next provider from starting from zero.',
    whyWeAsk: 'Prior treatment, testing, and diagnoses save time and prevent repeating what did not help.',
    fields: [
      field({
        key: 'received_counseling',
        label: 'Has this child ever received counseling or therapy?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'counseling_when',
        label: 'Approximately when?',
        type: 'text',
        showIf: { fieldKey: 'received_counseling', equals: 'yes' }
      }),
      field({
        key: 'counseling_type',
        label: 'What type?',
        showIf: { fieldKey: 'received_counseling', equals: 'yes' }
      }),
      field({
        key: 'counseling_why',
        label: 'Why?',
        showIf: { fieldKey: 'received_counseling', equals: 'yes' }
      }),
      field({
        key: 'counseling_helped',
        label: 'What helped?',
        showIf: { fieldKey: 'received_counseling', equals: 'yes' }
      }),
      field({
        key: 'counseling_not_help',
        label: 'What did not help?',
        showIf: { fieldKey: 'received_counseling', equals: 'yes' }
      }),
      field({
        key: 'prior_services',
        label: 'Has this child ever received:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('psychiatry', 'Psychiatry'),
          opt('psych_testing', 'Psychological testing'),
          opt('neuropsych', 'Neuropsychological testing'),
          opt('developmental_eval', 'Developmental evaluation'),
          opt('ot', 'Occupational therapy'),
          opt('speech', 'Speech therapy'),
          opt('aba', 'ABA'),
          opt('crisis', 'Crisis services'),
          opt('emergency_mh', 'Emergency mental-health evaluation'),
          opt('psych_hospital', 'Psychiatric hospitalization'),
          opt('residential', 'Residential treatment'),
          opt('none', 'None')
        ]
      }),
      field({
        key: 'prior_services_know',
        label: 'What should the new provider know?',
        showIf: PRIOR_SERVICES_ANY
      }),
      field({
        key: 'given_diagnosis',
        label: 'Has this child ever been given a mental-health, developmental, or behavioral diagnosis?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'diagnosis_list',
        label: 'What diagnosis or diagnoses?',
        showIf: { fieldKey: 'given_diagnosis', equals: 'yes' }
      }),
      field({
        key: 'diagnosis_who',
        label: 'Who made the diagnosis?',
        type: 'text',
        showIf: { fieldKey: 'given_diagnosis', equals: 'yes' }
      }),
      field({
        key: 'diagnosis_accurate',
        label: 'Do you believe it describes your child accurately?',
        type: 'radio',
        showIf: { fieldKey: 'given_diagnosis', equals: 'yes' },
        options: [
          opt('yes', 'Yes'),
          opt('partially', 'Partially'),
          opt('no', 'No'),
          opt('not_sure', 'Not sure')
        ]
      }),
      field({
        key: 'currently_helping',
        label: 'Is anyone currently helping this child?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'currently_helping_who',
        label: 'Who?',
        type: 'text',
        showIf: { fieldKey: 'currently_helping', equals: 'yes' }
      }),
      field({
        key: 'currently_helping_with',
        label: 'What are they helping with?',
        showIf: { fieldKey: 'currently_helping', equals: 'yes' }
      })
    ]
  });
}

function childFamilyRelationships() {
  return childStep({
    id: 'family_relationships',
    label: 'Family & Relationships',
    helperText:
      'You already told us who is in the family. Here we want to understand how this particular child experiences those relationships.',
    whyWeAsk: 'Each child’s experience of the same household can be different.',
    fields: [
      field({
        key: 'lives_with',
        label: 'Who does this child currently live with?'
      }),
      field({
        key: 'moves_households',
        label: 'Do they move between households?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'household_schedule',
        label: 'Describe the usual schedule.',
        showIf: { fieldKey: 'moves_households', equals: 'yes' }
      }),
      field({
        key: 'mood_changes_households',
        label: 'Does their behavior or mood noticeably change between households?',
        type: 'radio',
        showIf: { fieldKey: 'moves_households', equals: 'yes' },
        options: yesNoNotSure()
      }),
      field({ key: 'closest_to', label: 'Who is this child closest to?', type: 'text' }),
      field({
        key: 'goes_to_when_upset',
        label: 'Who do they usually go to when upset?',
        type: 'text'
      }),
      field({
        key: 'difficult_relationships',
        label: 'Are there relationships in the home that are especially difficult for them?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'difficult_relationships_what',
        label: 'What is happening?',
        showIf: { fieldKey: 'difficult_relationships', equals: 'yes' }
      }),
      field({
        key: 'life_changes',
        label: 'Have there been major changes in this child\'s life?',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('parent_separation', 'Parent separation/divorce'),
          opt('move', 'Move'),
          opt('school_change', 'School change'),
          opt('death_loss', 'Death/loss'),
          opt('new_sibling', 'New sibling'),
          opt('new_caregiver', 'New caregiver'),
          opt('parent_absence', 'Parent absence'),
          opt('family_illness', 'Family illness'),
          opt('financial_change', 'Financial change'),
          opt('legal_involvement', 'Legal involvement'),
          opt('other', 'Other'),
          opt('none', 'None')
        ]
      }),
      field({
        key: 'life_change_most',
        label: 'Which change affected them the most?',
        showIf: LIFE_CHANGE_ANY
      }),
      field({
        key: 'life_change_after',
        label: 'What did you notice afterward?',
        showIf: LIFE_CHANGE_ANY
      })
    ]
  });
}

function childTrauma() {
  return childStep({
    id: 'trauma',
    label: 'Difficult or Frightening Experiences',
    helperText:
      'You do not need to describe private details on this form. We mainly need to know whether something may still be affecting your child.',
    whyWeAsk: 'Knowing whether something is still affecting them helps the provider plan a safe first meeting.',
    fields: [
      field({
        key: 'trauma_experienced',
        label:
          'Has this child experienced something they found frightening, dangerous, overwhelming, abusive, or traumatic?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'trauma_still_affecting',
        label: 'Is it still affecting them?',
        type: 'radio',
        showIf: TRAUMA_YES_NS,
        options: yesNoNotSure()
      }),
      field({
        key: 'trauma_effects',
        label: 'What effects are you noticing?',
        type: 'checkbox',
        layout: 'cards',
        showIf: { fieldKey: 'trauma_still_affecting', equals: 'yes' },
        options: [
          opt('fear', 'Fear'),
          opt('avoidance', 'Avoidance'),
          opt('nightmares', 'Nightmares'),
          opt('anger', 'Anger'),
          opt('withdrawal', 'Withdrawal'),
          opt('clinginess', 'Clinginess'),
          opt('regression', 'Regression'),
          opt('trouble_concentrating', 'Trouble concentrating'),
          opt('hypervigilance', 'Hypervigilance'),
          opt('emotional_numbness', 'Emotional numbness'),
          opt('other', 'Other')
        ]
      }),
      field({
        key: 'trauma_discuss_privately',
        label: 'Is there information you would rather discuss directly with the provider instead of entering here?',
        type: 'radio',
        options: yesNo()
      })
    ]
  });
}

function childSubstance() {
  return childStep({
    id: 'substance',
    label: 'Substance Use',
    helperText: 'We ask this plainly because it can affect mood, behavior, safety, and treatment.',
    whyWeAsk:
      'Adolescents require developmentally appropriate substance-use screening and assessment. If use is endorsed, a validated youth screen follows rather than a long custom questionnaire.',
    showWhen: 'substance_indicated',
    fields: [
      field({
        key: 'substances_used',
        label: 'To your knowledge, has your child used:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('alcohol', 'Alcohol'),
          opt('cannabis', 'Cannabis'),
          opt('nicotine', 'Nicotine/vaping'),
          opt('rx_not_theirs', 'Prescription medication not prescribed to them'),
          opt('other', 'Other drugs'),
          opt('none', 'None'),
          opt('dont_know', "I don't know")
        ]
      }),
      field({
        key: 'substance_which',
        label: 'Which substance?',
        type: 'text',
        showIf: SUBSTANCE_ANY
      }),
      field({
        key: 'substance_how_often',
        label: 'How often do you believe they use it?',
        type: 'text',
        showIf: SUBSTANCE_ANY
      }),
      field({
        key: 'substance_problems',
        label: 'Has it caused problems at:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'no_known',
        showIf: SUBSTANCE_ANY,
        options: [
          opt('home', 'Home'),
          opt('school', 'School'),
          opt('work', 'Work'),
          opt('relationships', 'Relationships'),
          opt('legal', 'Legal situations'),
          opt('health', 'Health'),
          opt('no_known', 'No known problems')
        ]
      }),
      field({
        key: 'substance_intoxicated_safety',
        label: 'Has your child ever been intoxicated enough that you were worried about their safety?',
        type: 'radio',
        showIf: SUBSTANCE_ANY,
        options: yesNoNotSure()
      }),
      ...buildCrafftFields({ scope: 'client', showIf: SUBSTANCE_ANY })
    ]
  });
}

function childSafety() {
  return childStep({
    id: 'safety',
    label: 'Safety',
    helperText:
      'These are standard safety questions. Straight answers help us know whether anything needs attention before the first appointment.',
    whyWeAsk:
      'AAP recommends age- and clinically appropriate screening, with a brief safety assessment following a positive screen. Means-access questions appear only after concern is identified.',
    fields: [
      field({
        key: 'hurt_another_person',
        label: 'Has this child intentionally seriously hurt another person?',
        type: 'radio',
        section: 'Aggression and safety toward others',
        options: yesNo()
      }),
      field({
        key: 'hurt_another_what',
        label: 'What happened?',
        showIf: { fieldKey: 'hurt_another_person', equals: 'yes' }
      }),
      field({
        key: 'hurt_another_when',
        label: 'When was the most recent time?',
        type: 'text',
        showIf: { fieldKey: 'hurt_another_person', equals: 'yes' }
      }),
      field({
        key: 'talked_hurting_someone',
        label: 'Has this child recently talked about seriously hurting or killing someone?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'talked_hurting_who',
        label: 'Who?',
        type: 'text',
        showIf: { fieldKey: 'talked_hurting_someone', equals: 'yes' }
      }),
      field({
        key: 'talked_hurting_how',
        label: 'Have they described how they would do it?',
        type: 'radio',
        showIf: { fieldKey: 'talked_hurting_someone', equals: 'yes' },
        options: yesNo()
      }),
      field({
        key: 'talked_hurting_access',
        label: 'Do they currently have access to what they described?',
        type: 'radio',
        showIf: { fieldKey: 'talked_hurting_someone', equals: 'yes' },
        options: yesNoNotSure()
      }),
      field({
        key: 'runaway_unsafe',
        label:
          'Has this child recently run away, disappeared, or intentionally put themselves in a dangerous situation?',
        type: 'radio',
        section: 'Running away / unsafe behavior',
        options: yesNo()
      }),
      field({
        key: 'runaway_what',
        label: 'What happened?',
        showIf: { fieldKey: 'runaway_unsafe', equals: 'yes' }
      }),
      field({
        key: 'self_harm',
        label: 'Has this child intentionally hurt themselves?',
        type: 'radio',
        required: true,
        optional: false,
        section: 'Self-harm and suicide',
        options: yesNoNotSure()
      }),
      field({
        key: 'self_harm_what',
        label: 'What happened?',
        showIf: { fieldKey: 'self_harm', equals: ['yes', 'not_sure'] }
      }),
      field({
        key: 'self_harm_when',
        label: 'When was the most recent time?',
        type: 'text',
        showIf: { fieldKey: 'self_harm', equals: ['yes', 'not_sure'] }
      }),
      field({
        key: 'talked_wanting_to_die',
        label: 'Has this child ever talked about wanting to die or kill themselves?',
        type: 'radio',
        required: true,
        optional: false,
        options: yesNoNotSure()
      }),
      field({
        key: 'wanting_to_die_current',
        label: 'Is this happening currently?',
        type: 'radio',
        showIf: { fieldKey: 'talked_wanting_to_die', equals: ['yes', 'not_sure'] },
        options: yesNoNotSure()
      }),
      ...buildAsqFields({ scope: 'client', showIf: ASQ_SHOW }),
      field({
        key: 'means_firearms',
        label: 'Does your child currently have access to firearms?',
        type: 'radio',
        showIf: ASQ_OR_SAFETY_POSITIVE,
        options: yesNoNotSure()
      }),
      field({
        key: 'means_medications',
        label: 'Does your child have unsupervised access to medications?',
        type: 'radio',
        showIf: ASQ_OR_SAFETY_POSITIVE,
        options: yesNoNotSure()
      }),
      field({
        key: 'means_other',
        label: 'Are there other items or means you are concerned they could use to seriously hurt themselves?',
        type: 'radio',
        showIf: ASQ_OR_SAFETY_POSITIVE,
        options: yesNo()
      }),
      field({
        key: 'means_other_describe',
        label: 'Please describe.',
        showIf: {
          all: [ASQ_OR_SAFETY_POSITIVE, { fieldKey: 'means_other', equals: 'yes' }]
        }
      })
    ]
  });
}

function childWhatHelps() {
  return childStep({
    id: 'what_helps',
    label: 'What Helps {childName}?',
    helperText: 'A provider needs to know how to reach your child, not just what symptoms they have.',
    whyWeAsk: 'Strengths and regulation cues are as important as concerns.',
    fields: [
      field({ key: 'enjoys', label: 'What does this child genuinely enjoy?' }),
      field({ key: 'proud_of', label: 'What are they proud of?' }),
      field({ key: 'especially_good_at', label: 'What are they especially good at?' }),
      field({ key: 'motivates', label: 'What motivates them?' }),
      field({ key: 'makes_laugh', label: 'What usually makes them laugh?' }),
      field({ key: 'when_upset_helps', label: 'When they are upset, what actually helps?' }),
      field({ key: 'when_upset_not_help', label: 'What usually does not help?' }),
      field({
        key: 'show_overwhelmed',
        label: 'How do they usually show that they are overwhelmed?'
      }),
      field({
        key: 'need_space_signs',
        label: 'How can you tell when they need space?'
      }),
      field({
        key: 'want_help_signs',
        label: 'How can you tell when they want help?'
      }),
      field({
        key: 'connect_with_adults',
        label: 'What kinds of adults do they tend to connect with?'
      }),
      field({
        key: 'shut_down_causes',
        label: 'What causes them to shut down or stop trusting someone?'
      }),
      field({ key: 'feel_respected', label: 'What makes them feel respected?' }),
      field({
        key: 'terrible_day_approach',
        label: 'If they are having a terrible day, what is the best way to approach them?'
      })
    ]
  });
}

function childProviderKnow() {
  return childStep({
    id: 'provider_know',
    label: 'What Should Their Provider Know?',
    helperText: 'Imagine the provider has five minutes to understand your child before meeting them.',
    whyWeAsk: 'A short briefing prevents a first session that starts in the wrong place.',
    fields: [
      field({
        key: 'child_would_tell_provider',
        label:
          'If your child could tell their provider one thing before the first meeting, what do you think they would want them to know?'
      }),
      field({
        key: 'want_provider_understand',
        label: 'What do you want the provider to understand before meeting them?'
      }),
      field({
        key: 'provider_avoid',
        label: 'Is there anything the provider should avoid doing at first?'
      }),
      field({
        key: 'feel_comfortable_new_adult',
        label: 'Is there anything that helps your child feel comfortable with a new adult?'
      }),
      field({
        key: 'how_child_usually',
        label: 'Does your child usually:',
        type: 'checkbox',
        layout: 'cards',
        options: [
          opt('open_up_quickly', 'Open up quickly'),
          opt('need_time', 'Need time'),
          opt('talk_during_activity', 'Talk more while doing an activity'),
          opt('answer_direct', 'Answer direct questions'),
          opt('avoid_feelings', 'Avoid talking about feelings'),
          opt('use_humor', 'Use humor'),
          opt('shut_down_pressured', 'Shut down when pressured'),
          opt('other', 'Other')
        ]
      }),
      field({
        key: 'misread_behavior',
        label:
          'Is there something people often interpret as "bad behavior" that you think means something different for this child?',
        type: 'radio',
        optional: true,
        helperText: 'Optional',
        options: yesNo()
      }),
      field({
        key: 'misread_behavior_means',
        label: 'What do you think it means?',
        showIf: { fieldKey: 'misread_behavior', equals: 'yes' }
      })
    ]
  });
}

function childWantToChange() {
  return childStep({
    id: 'want_to_change',
    label: 'What Do You Want to Change?',
    helperText: 'Tell us what better would actually look like for this child.',
    whyWeAsk:
      'The last question produces an observable outcome that can later be compared with progress.',
    fields: [
      field({
        key: 'three_important_help',
        label: 'What are the three most important things you want help with?'
      }),
      field({
        key: 'three_months_different',
        label: 'If therapy were working really well, what would be different three months from now?'
      }),
      field({ key: 'notice_at_home', label: 'What would you notice at home?' }),
      field({ key: 'school_would_notice', label: 'What would school notice?' }),
      field({ key: 'child_would_notice', label: 'What would your child notice?' }),
      field({
        key: 'handle_that_is_hard',
        label: 'What would you like them to be able to handle that is difficult for them now?'
      }),
      field({ key: 'see_more_of', label: 'What would you like to see more of?' }),
      field({ key: 'see_less_of', label: 'What would you like to see less of?' }),
      field({
        key: 'do_not_accidentally_change',
        label: 'What is already going well that you do not want treatment to accidentally change?'
      }),
      field({
        key: 'actually_helping',
        label: 'What would make you say, "This is actually helping my child"?'
      })
    ]
  });
}

function childProviderPrefs() {
  return childStep({
    id: 'provider_prefs',
    label: 'Provider & Scheduling Preferences',
    helperText: "We'll use this to show providers who can realistically work with your child.",
    whyWeAsk: 'These answers feed provider matching rather than existing only as intake text.',
    fields: [
      field({
        key: 'preferred_service_format',
        label: 'Preferred service format:',
        type: 'radio',
        options: [
          opt('in_person', 'In person'),
          opt('school_based', 'School based'),
          opt('virtual', 'Virtual'),
          opt('any', 'Any')
        ]
      }),
      field({
        key: 'days_that_work',
        label: 'Days that generally work',
        type: 'checkbox',
        layout: 'cards',
        options: [
          opt('monday', 'Monday'),
          opt('tuesday', 'Tuesday'),
          opt('wednesday', 'Wednesday'),
          opt('thursday', 'Thursday'),
          opt('friday', 'Friday'),
          opt('saturday', 'Saturday'),
          opt('sunday', 'Sunday')
        ]
      }),
      field({
        key: 'times_that_work',
        label: 'Times that generally work',
        type: 'checkbox',
        layout: 'cards',
        options: [
          opt('morning', 'Morning'),
          opt('afternoon', 'Afternoon'),
          opt('after_school', 'After school'),
          opt('evening', 'Evening')
        ]
      }),
      field({
        key: 'earliest_availability',
        label: 'How important is earliest availability?',
        type: 'radio',
        options: [
          opt('most_important', 'Most important'),
          opt('important', 'Important'),
          opt('flexible', 'Flexible')
        ]
      }),
      field({
        key: 'has_provider_preference',
        label: 'Does your child have a provider preference?',
        type: 'radio',
        options: [opt('no_preference', 'No preference'), opt('yes', 'Yes')]
      }),
      field({
        key: 'provider_comfort',
        label: 'What would help them feel comfortable with a provider?',
        showIf: { fieldKey: 'has_provider_preference', equals: 'yes' }
      }),
      field({
        key: 'provider_good_fit',
        label: 'Anything else that would make a provider a particularly good fit for this child?',
        optional: true
      })
    ]
  });
}

function childQuestionnaires() {
  return childStep({
    id: 'questionnaires',
    label: 'Questionnaires',
    helperText:
      'These give the provider another view of how your child is doing and provide a baseline we can compare with later.',
    whyWeAsk:
      'A comprehensive evaluation incorporates both parent/guardian and child/adolescent perspectives rather than treating one as a substitute for the other.',
    fields: [
      field({
        key: 'psc17_card',
        type: 'info',
        required: false,
        optional: true,
        label: 'PSC-17',
        helperText: 'Completed by: Parent/Guardian. About 5 minutes.',
        showIf: PSC_SHOW
      }),
      ...buildPsc17Fields({ scope: 'client', showIf: PSC_SHOW }),
      field({
        key: 'vanderbilt_card',
        type: 'info',
        required: false,
        optional: true,
        label: 'Vanderbilt ADHD (parent)',
        helperText: 'Completed by: Parent/Guardian. Shown because of attention or hyperactivity concerns.',
        showIf: ADHD_INDICATED
      }),
      ...buildVanderbiltAdhd18Fields({ scope: 'client', showIf: ADHD_INDICATED }),
      field({
        key: 'scared5_card',
        type: 'info',
        required: false,
        optional: true,
        label: 'SCARED-5 (parent)',
        helperText: 'Completed by: Parent/Guardian. Shown because of worry or anxiety concerns.',
        showIf: ANXIETY_INDICATED
      }),
      ...buildScared5ParentFields({ scope: 'client', showIf: ANXIETY_INDICATED }),
      field({
        key: 'send_child_depression',
        label: 'Depression measure',
        helperText:
          'Completed by: {childName}. We will ask {childName} to complete this separately. Parent-report and child self-report stay as separate records.',
        type: 'radio',
        optional: true,
        showIf: { fieldKey: '_age_gte_12', equals: 'yes' },
        options: [opt('send', 'Send to Child'), opt('skip', 'Skip for now')]
      }),
      field({
        key: 'send_child_anxiety',
        label: 'Anxiety measure',
        helperText: 'Completed by: {childName}. We will ask {childName} to complete this separately.',
        type: 'radio',
        optional: true,
        showIf: { fieldKey: '_age_gte_12', equals: 'yes' },
        options: [opt('send', 'Send to Child'), opt('skip', 'Skip for now')]
      }),
      field({
        key: 'send_child_trauma',
        label: 'Trauma measure',
        helperText: 'Completed by: {childName}. We will ask {childName} to complete this separately.',
        type: 'radio',
        optional: true,
        showIf: {
          all: [
            { fieldKey: '_age_gte_12', equals: 'yes' },
            { fieldKey: 'trauma_experienced', equals: ['yes', 'not_sure'] }
          ]
        },
        options: [opt('send', 'Send to Child'), opt('skip', 'Skip for now')]
      }),
      field({
        key: 'send_child_adhd',
        label: 'ADHD measure',
        helperText: 'Completed by: {childName}. We will ask {childName} to complete this separately.',
        type: 'radio',
        optional: true,
        showIf: {
          all: [{ fieldKey: '_age_gte_12', equals: 'yes' }, ADHD_INDICATED]
        },
        options: [opt('send', 'Send to Child'), opt('skip', 'Skip for now')]
      })
    ]
  });
}

function childAnythingMissed() {
  return childStep({
    id: 'anything_missed',
    label: 'Anything We Missed?',
    helperText: "Last chance to tell us something important that didn't fit neatly into a question.",
    whyWeAsk: 'Open space catches what structured questions miss.',
    fields: [
      field({
        key: 'anything_not_asked',
        label: 'What have we not asked about this child that you think their provider should know?',
        optional: true
      }),
      field({
        key: 'worry_misunderstand',
        label: 'Is there anything you are worried we might misunderstand based on your answers?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'misunderstand_differently',
        label: 'What should we understand differently?',
        showIf: { fieldKey: 'worry_misunderstand', equals: 'yes' }
      }),
      field({
        key: 'discuss_privately',
        label: 'Is there anything you want to discuss privately with the provider rather than put in writing?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'needs_from_adults',
        label: 'If you had to describe what this child needs from adults right now in one sentence, what would you say?'
      })
    ]
  });
}

function childReview() {
  return {
    id: `${COUNSELING_DEP_STEP_PREFIX}child_review`,
    type: 'child_review',
    label: 'Child Review — {childName}',
    helperText: 'A simple summary of this child’s intake. You can edit before adding another child.',
    audience: 'dependent',
    scope: 'client',
    repeatPerClient: true,
    visibility: 'always',
    fields: []
  };
}

export function buildCounselingDependentEnSteps() {
  return [
    combineGuardianSteps(
      'about_you',
      'About You & Family Contact',
      'Your information and how we reach the family.',
      'We need a primary contact and household logistics before the child pages.',
      [partAAboutYou(), partAFamilyContact()]
    ),
    partACustodyUpload(),
    childAbout(),
    combineChildSteps(
      'presenting',
      'What Brings You Here & How They Are Doing',
      'Concerns, emotions, and behavior together.',
      'Grouping these keeps the story in one place without losing any questions.',
      [childWhatBrings(), childEmotional(), childBehavior()]
    ),
    combineChildSteps(
      'daily_context',
      'Daily Life & School',
      'Home routines and school context.',
      'Daily life and school often explain each other.',
      [childDailyLife(), childSchool()]
    ),
    combineChildSteps(
      'health_history',
      'Development, Health & Previous Help',
      'Development, medical history, and prior services.',
      'Health and previous help belong on the same page for safer care.',
      [childDevelopmentHealth(), childPreviousHelp()]
    ),
    combineChildSteps(
      'family_trauma',
      'Family, Relationships & Hard Experiences',
      'Family relationships and trauma history.',
      'These questions stay together so context is not split across pages.',
      [childFamilyRelationships(), childTrauma()]
    ),
    childSubstance(),
    childSafety(),
    combineChildSteps(
      'goals_prefs',
      'What Helps, Goals & Preferences',
      'What already helps, what you want to change, and scheduling preferences.',
      'Goals and preferences help us match the right clinician and plan.',
      [childWhatHelps(), childProviderKnow(), childWantToChange(), childProviderPrefs()]
    ),
    childQuestionnaires(),
    childAnythingMissed(),
    childReview()
  ];
}

export function mergeCounselingOfficeEnIntoSteps(existingSteps = []) {
  const self = buildCounselingSelfEnSteps();
  const dep = buildCounselingDependentEnSteps();
  const kept = (Array.isArray(existingSteps) ? existingSteps : []).filter((s) => {
    const id = String(s?.id || '');
    if (id.startsWith(COUNSELING_SELF_STEP_PREFIX)) return false;
    if (id.startsWith(COUNSELING_DEP_STEP_PREFIX)) return false;
    if (String(s?.type || '') === 'questions' && (!Array.isArray(s.fields) || s.fields.length === 0)) {
      return false;
    }
    return true;
  });
  return [...self, ...dep, ...kept];
}
