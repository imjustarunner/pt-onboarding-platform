/**
 * Full counseling enrollment — Couple path.
 * Composes partner person basics (self About You pattern) + shared couple sections
 * + selective per-partner clinical + private safety. Does not duplicate the whole self intake.
 */
import { COUPLE_QUICK_CONCERN_OPTIONS } from '../constants/adaptiveQuickConcerns.js';
import {
  buildCssrsScreenerFields,
  buildStandardQuestionnaireFields
} from './validatedClinicalScreens.en.js';

export const COUNSELING_COUPLE_STEP_PREFIX = 'counseling_couple_';

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
  scope = 'couple',
  privateToRespondent = false,
  partnerIndex = null,
  defaultValue = undefined
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
    category: 'clinical',
    privateToRespondent: privateToRespondent || undefined,
    partnerIndex: partnerIndex == null ? undefined : partnerIndex,
    defaultValue
  };
}

function step({ id, label, helperText, whyWeAsk, type = 'questions', fields, audience = 'couple', privatePerPartner = false }) {
  return {
    id: `${COUNSELING_COUPLE_STEP_PREFIX}${id}`,
    type,
    label,
    helperText,
    whyWeAsk,
    audience,
    scope: audience === 'couple_partner' ? 'partner' : 'couple',
    visibility: 'always',
    privatePerPartner: privatePerPartner || undefined,
    fields
  };
}

function partnerBasics(partnerIndex, partnerLabel) {
  const p = `p${partnerIndex}_`;
  return step({
    id: `about_partner_${partnerIndex}`,
    label: `${partnerLabel} — About You`,
    helperText: 'Start with the basics. Tell us enough to know who you are and how to reach you.',
    whyWeAsk: 'Each partner keeps their own identity record; answers are not merged into one person.',
    audience: 'couple_partner',
    fields: [
      field({ key: `${p}legal_first_name`, label: 'Legal first name', type: 'text', scope: 'partner', partnerIndex }),
      field({ key: `${p}legal_last_name`, label: 'Legal last name', type: 'text', scope: 'partner', partnerIndex }),
      field({ key: `${p}preferred_name`, label: 'If you prefer a different name, please enter it here.', type: 'text', scope: 'partner', partnerIndex }),
      field({ key: `${p}date_of_birth`, label: 'Date of birth', type: 'date', scope: 'partner', partnerIndex }),
      field({ key: `${p}phone_number`, label: 'Phone number', type: 'tel', scope: 'partner', partnerIndex }),
      field({ key: `${p}email_address`, label: 'Email address', type: 'email', scope: 'partner', partnerIndex }),
      field({
        key: `${p}sex`,
        label: 'Sex',
        type: 'radio',
        options: [opt('female', 'Female'), opt('male', 'Male')],
        scope: 'partner',
        partnerIndex
      }),
      field({ key: `${p}preferred_language`, label: 'Preferred language', type: 'text', scope: 'partner', partnerIndex }),
      field({ key: `${p}address_street`, label: 'Street address', type: 'text', scope: 'partner', partnerIndex }),
      field({ key: `${p}address_zip`, label: 'ZIP code', type: 'text', scope: 'partner', partnerIndex }),
      field({ key: `${p}address_city`, label: 'City', type: 'text', scope: 'partner', partnerIndex }),
      field({ key: `${p}address_state`, label: 'State', type: 'text', scope: 'partner', partnerIndex }),
      field({
        key: `${p}preferred_contact_method`,
        label: 'Preferred contact method',
        type: 'radio',
        options: [opt('text', 'Text'), opt('email', 'Email'), opt('phone', 'Phone'), opt('any', 'Any')],
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}best_time_to_contact`,
        label: 'Best time to contact you',
        type: 'checkbox',
        options: [
          opt('morning', 'Morning (8am–12pm)'),
          opt('afternoon', 'Afternoon (12–5pm)'),
          opt('evening', 'Evening (5–8pm)'),
          opt('anytime', 'Anytime')
        ],
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}want_emergency_contact`,
        label: 'Would you like to add an emergency contact?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}emergency_contact_name`,
        label: 'Emergency contact name',
        type: 'text',
        showIf: { fieldKey: `${p}want_emergency_contact`, equals: 'yes' },
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}emergency_contact_relationship`,
        label: 'Relationship to you',
        type: 'text',
        showIf: { fieldKey: `${p}want_emergency_contact`, equals: 'yes' },
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}emergency_contact_phone`,
        label: 'Emergency contact phone',
        type: 'tel',
        showIf: { fieldKey: `${p}want_emergency_contact`, equals: 'yes' },
        scope: 'partner',
        partnerIndex
      })
    ]
  });
}

function aboutRelationship() {
  return step({
    id: 'about_relationship',
    label: 'About Your Relationship',
    helperText: 'Give your provider a basic picture of the relationship. Details can be discussed together in session.',
    whyWeAsk: 'Shared relationship context helps the first couples session start in the right place.',
    fields: [
      field({ key: 'how_long_together', label: 'How long have you been together?', type: 'text' }),
      field({
        key: 'current_relationship_status',
        label: 'Current relationship:',
        type: 'radio',
        layout: 'cards',
        options: [
          opt('dating', 'Dating'),
          opt('engaged', 'Engaged'),
          opt('married', 'Married'),
          opt('domestic_partnership', 'Domestic partnership'),
          opt('separated', 'Separated'),
          opt('divorced_seeking', 'Divorced but seeking counseling together'),
          opt('other', 'Other')
        ]
      }),
      field({
        key: 'live_together',
        label: 'Do you currently live together?',
        type: 'radio',
        options: [opt('yes', 'Yes'), opt('no', 'No'), opt('part_time', 'Part-time')]
      }),
      field({
        key: 'children_involved',
        label: 'Do you have children together or children involved in the relationship?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'children_approximately_how_many',
        label: 'Approximately how many?',
        type: 'text',
        showIf: { fieldKey: 'children_involved', equals: 'yes' }
      }),
      field({
        key: 'parenting_concerns_part_of_therapy',
        label: 'Are parenting concerns part of why you are seeking therapy?',
        type: 'radio',
        options: yesNo(),
        showIf: { fieldKey: 'children_involved', equals: 'yes' }
      }),
      field({
        key: 'prior_couples_counseling',
        label: 'Have you previously attended couples counseling together?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'prior_couples_what_helped',
        label: 'What was helpful?',
        showIf: { fieldKey: 'prior_couples_counseling', equals: 'yes' }
      }),
      field({
        key: 'prior_couples_what_not_helped',
        label: 'What was not helpful?',
        showIf: { fieldKey: 'prior_couples_counseling', equals: 'yes' }
      })
    ]
  });
}

function whatBringsYou() {
  return step({
    id: 'what_brings_you',
    label: 'What Brings You Here?',
    helperText: 'Tell us what is happening in the relationship and why now. You do not need to agree on everything before starting.',
    whyWeAsk: 'Relationship-level reasons guide couples matching and first-session focus.',
    fields: [
      field({ key: 'main_reason_couples', label: 'What is the main reason you are seeking couples therapy?' }),
      field({ key: 'why_now_couples', label: 'Why are you seeking help now?' }),
      field({
        key: 'how_long_concern',
        label: 'How long has this been a concern?',
        type: 'radio',
        options: [
          opt('lt_2w', 'Less than 2 weeks'),
          opt('2w_2m', '2 weeks–2 months'),
          opt('2_6m', '2–6 months'),
          opt('6_12m', '6–12 months'),
          opt('gt_1y', 'More than a year'),
          opt('comes_goes', 'Comes and goes')
        ]
      }),
      field({
        key: 'something_specific_happened',
        label: 'Did something specific happen around the time things became more difficult?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'what_happened',
        label: 'What happened?',
        showIf: { fieldKey: 'something_specific_happened', equals: 'yes' }
      }),
      field({ key: 'what_makes_worse', label: 'What tends to make things worse?' }),
      field({ key: 'what_helps_reconnect', label: 'What helps the two of you reconnect or resolve things?' }),
      field({ key: 'already_tried', label: 'What have you already tried?' }),
      field({
        key: 'affecting_relationship_0_10',
        label: 'How much is this affecting the relationship right now?',
        type: 'radio',
        options: Array.from({ length: 11 }, (_, i) => opt(String(i), String(i)))
      }),
      field({
        key: 'readiness_0_10',
        label: 'How ready are you to work on the relationship?',
        type: 'radio',
        options: Array.from({ length: 11 }, (_, i) => opt(String(i), String(i)))
      }),
      field({ key: 'accomplish_together', label: 'What would you most like to accomplish together?' }),
      field({
        key: 'couple_concerns',
        label: 'What would you like help with? Select all that apply.',
        type: 'checkbox',
        layout: 'cards',
        options: COUPLE_QUICK_CONCERN_OPTIONS.map((o) => opt(o.value, o.label))
      })
    ]
  });
}

function howRelationshipGoing() {
  const areas = [
    ['communication', 'Communication'],
    ['trust', 'Trust'],
    ['emotional_connection', 'Emotional connection'],
    ['affection_intimacy', 'Affection/intimacy'],
    ['handling_disagreements', 'Handling disagreements'],
    ['parenting', 'Parenting'],
    ['money', 'Money'],
    ['household_responsibilities', 'Household responsibilities'],
    ['time_together', 'Time together'],
    ['support_for_one_another', 'Support for one another'],
    ['extended_family', 'Relationships with extended family'],
    ['making_decisions', 'Making decisions together']
  ];
  const rating = [
    opt('going_well', 'Going well'),
    opt('some_difficulty', 'Some difficulty'),
    opt('significant_difficulty', 'Significant difficulty'),
    opt('na', 'Not applicable')
  ];
  return step({
    id: 'how_relationship_going',
    label: 'How the Relationship Is Going',
    helperText: 'Rate each area. Defaults are for convenience — update as needed.',
    whyWeAsk: 'A shared functioning snapshot is faster than repeating individual life-area pages twice.',
    fields: [
      ...areas.map(([key, label]) =>
        field({
          key: `rel_area_${key}`,
          label,
          type: 'radio',
          options: rating,
          defaultValue: 'going_well',
          section: 'How are things going in each area?'
        })
      ),
      field({ key: 'currently_going_well', label: 'What is currently going well between you?' }),
      field({ key: 'when_disagree', label: 'What usually happens when you disagree?' }),
      field({ key: 'how_disagreements_resolved', label: 'How are disagreements usually resolved?' }),
      field({
        key: 'repeating_issue',
        label: 'Is there one issue that seems to come up repeatedly?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'repeating_issue_what',
        label: 'What is it?',
        showIf: { fieldKey: 'repeating_issue', equals: 'yes' }
      })
    ]
  });
}

function partnerClinicalSelective(partnerIndex, partnerLabel) {
  const p = `p${partnerIndex}_`;
  return step({
    id: `partner_clinical_${partnerIndex}`,
    label: `${partnerLabel} — Individual Background`,
    helperText: 'Selective history for couples therapy. Full individual psychotherapy intake is not required unless also enrolling individually.',
    whyWeAsk: 'These answers belong to this partner only — not a shared couple answer.',
    audience: 'couple_partner',
    fields: [
      field({
        key: `${p}therapy_before`,
        label: 'Have you ever been in therapy or counseling before?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}current_other_provider`,
        label: 'Are you currently working with another mental health provider?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}current_other_provider_who`,
        label: 'Who are you seeing and what are they helping you with?',
        showIf: { fieldKey: `${p}current_other_provider`, equals: 'yes' },
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}diagnosed_before`,
        label: 'Have you ever been diagnosed with a mental health condition?',
        type: 'radio',
        options: yesNoNotSure(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}diagnoses_list`,
        label: 'What diagnoses have you been given?',
        showIf: { fieldKey: `${p}diagnosed_before`, equals: 'yes' },
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}psych_meds_provider`,
        label: 'Have you ever seen a psychiatrist or another provider for psychiatric medication?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}hospitalized_before`,
        label: 'Have you ever been hospitalized or received emergency/crisis care for mental health?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}currently_taking_medications`,
        label: 'Are you currently taking medications?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}medications_list`,
        label: 'List medication, dose if known, and what you take it for.',
        showIf: { fieldKey: `${p}currently_taking_medications`, equals: 'yes' },
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}medical_conditions`,
        label: 'Do you have any medical conditions that affect your mood, sleep, energy, concentration, or day-to-day life?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}medical_know`,
        label: 'What should your therapist know?',
        showIf: { fieldKey: `${p}medical_conditions`, equals: 'yes' },
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}drink_alcohol`,
        label: 'Do you currently drink alcohol?',
        type: 'radio',
        options: [
          opt('never', 'Never'),
          opt('occasionally', 'Occasionally'),
          opt('weekly', 'Weekly'),
          opt('several_week', 'Several times a week'),
          opt('daily', 'Daily or almost daily')
        ],
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}use_cannabis`,
        label: 'Do you currently use cannabis?',
        type: 'radio',
        options: [
          opt('never', 'Never'),
          opt('occasionally', 'Occasionally'),
          opt('weekly', 'Weekly'),
          opt('several_week', 'Several times a week'),
          opt('daily', 'Daily or almost daily')
        ],
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}other_substances`,
        label: 'Do you currently use any other recreational substances?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}trauma_affects_relationship`,
        label: 'Have you experienced a major loss or trauma that currently affects the relationship or treatment?',
        type: 'radio',
        options: yesNoNotSure(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}military_service`,
        label: 'Have you served in the military?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}legal_court_issues`,
        label: 'Are there current legal or court issues affecting treatment?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex
      }),
      field({
        key: `${p}previous_treatment_preferences`,
        label: 'Is there anything from previous treatment that you definitely do or do not want repeated?',
        scope: 'partner',
        partnerIndex
      })
    ]
  });
}

function partnerPrivateSafety(partnerIndex, partnerLabel) {
  const p = `p${partnerIndex}_`;
  const cssrs = buildCssrsScreenerFields().map((f) => ({
    ...f,
    key: `${p}${f.key}`,
    id: `field_${p}${f.key}`,
    scope: 'partner',
    partnerIndex,
    privateToRespondent: true,
    showIf: f.showIf?.fieldKey
      ? { ...f.showIf, fieldKey: `${p}${f.showIf.fieldKey}` }
      : f.showIf
  }));
  return step({
    id: `private_safety_${partnerIndex}`,
    label: `${partnerLabel} — Private Safety Check`,
    helperText: 'Answer privately. Your partner will not see these answers on the shared review screen.',
    whyWeAsk: 'Relationship safety and suicide risk must stay person-scoped and private.',
    audience: 'couple_partner',
    privatePerPartner: true,
    fields: [
      field({
        key: `${p}feel_safe_in_relationship`,
        label: 'Do you feel physically safe in your relationship?',
        type: 'radio',
        options: yesNoNotSure(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      field({
        key: `${p}afraid_of_partner`,
        label: 'Are you afraid of your partner?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      field({
        key: `${p}partner_threatened_harmed`,
        label: 'Has your partner threatened or seriously harmed you?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      field({
        key: `${p}disagreements_physically_violent`,
        label: 'Have disagreements ever become physically violent?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      field({
        key: `${p}safe_disagreeing`,
        label: 'Do you feel safe disagreeing with your partner?',
        type: 'radio',
        options: yesNoNotSure(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      field({
        key: `${p}immediate_danger`,
        label: 'Are you currently in immediate danger of hurting yourself or someone else?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      field({
        key: `${p}hurt_yourself_past`,
        label: 'Have you intentionally hurt yourself in the past?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      field({
        key: `${p}suicide_attempt_ever`,
        label: 'Have you ever attempted suicide?',
        type: 'radio',
        options: yesNo(),
        scope: 'partner',
        partnerIndex,
        privateToRespondent: true
      }),
      ...cssrs
    ]
  });
}

function coupleGoals() {
  return step({
    id: 'goals',
    label: 'What Would Better Look Like?',
    helperText: 'Shared goals first. Optional personal hopes stay attributed to each partner.',
    whyWeAsk: 'Joint goals plus personal attributions keep both voices visible.',
    fields: [
      field({ key: 'therapy_working_well', label: 'If couples therapy were working well, what would be different?' }),
      field({ key: 'doing_more_together', label: 'What would you be doing more of together?' }),
      field({ key: 'happen_less_often', label: 'What would happen less often?' }),
      field({ key: 'protect_what_is_good', label: 'What is already good about the relationship that you want to protect?' }),
      field({ key: 'this_is_helping_us', label: 'What would make you say, "This is helping us"?' }),
      field({
        key: 'p1_personal_hope',
        label: 'Partner 1 — What is one thing you personally hope to do differently?',
        optional: true,
        helperText: 'Optional',
        scope: 'partner',
        partnerIndex: 1
      }),
      field({
        key: 'p2_personal_hope',
        label: 'Partner 2 — What is one thing you personally hope to do differently?',
        optional: true,
        helperText: 'Optional',
        scope: 'partner',
        partnerIndex: 2
      })
    ]
  });
}

function coupleQuestionnaires() {
  return step({
    id: 'questionnaires',
    label: 'Standard Questionnaires',
    type: 'clinical_questions',
    helperText: 'Individual measures are saved under each participant. Scores are not shared as if they describe both partners.',
    whyWeAsk: 'Reuse the existing questionnaire engine with respondent attribution.',
    audience: 'couple_partner',
    fields: buildStandardQuestionnaireFields().map((f) => ({
      ...f,
      scope: 'partner',
      audience: 'couple_partner'
    }))
  });
}

export function buildCounselingCoupleEnSteps() {
  return [
    partnerBasics(1, 'Partner 1'),
    partnerBasics(2, 'Partner 2'),
    aboutRelationship(),
    whatBringsYou(),
    howRelationshipGoing(),
    partnerClinicalSelective(1, 'Partner 1'),
    partnerClinicalSelective(2, 'Partner 2'),
    partnerPrivateSafety(1, 'Partner 1'),
    partnerPrivateSafety(2, 'Partner 2'),
    coupleGoals(),
    coupleQuestionnaires()
  ];
}

export default { buildCounselingCoupleEnSteps, COUNSELING_COUPLE_STEP_PREFIX };
