/**
 * Full counseling enrollment — Family path.
 * Composes primary contact + roster + shared family sections + selective per-member
 * clinical/safety. Reuses dependent/self patterns without copying entire intakes.
 */
import { FAMILY_QUICK_CONCERN_OPTIONS, FAMILY_ROLE_OPTIONS } from '../constants/adaptiveQuickConcerns.js';

export const COUNSELING_FAMILY_STEP_PREFIX = 'counseling_family_';

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
  scope = 'family',
  defaultValue = undefined,
  privateToRespondent = false
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
    defaultValue,
    privateToRespondent: privateToRespondent || undefined
  };
}

function step({
  id,
  label,
  helperText,
  whyWeAsk,
  type = 'questions',
  fields,
  audience = 'family',
  repeatPerClient = false
}) {
  return {
    id: `${COUNSELING_FAMILY_STEP_PREFIX}${id}`,
    type,
    label,
    helperText,
    whyWeAsk,
    audience,
    scope: audience === 'family_member' ? 'client' : 'family',
    visibility: 'always',
    repeatPerClient: repeatPerClient || undefined,
    fields
  };
}

function primaryContact() {
  return step({
    id: 'primary_contact',
    label: 'Primary Contact',
    helperText: 'This person is the initial contact — not necessarily “the client.”',
    whyWeAsk: 'Family therapy needs a reachable organizer while members stay separate records.',
    audience: 'family',
    fields: [
      field({ key: 'pc_legal_first', label: 'Legal first name', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_legal_last', label: 'Legal last name', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_preferred_name', label: 'Preferred name', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_date_of_birth', label: 'Date of birth', type: 'date', scope: 'guardian' }),
      field({ key: 'pc_email', label: 'Email', type: 'email', scope: 'guardian' }),
      field({ key: 'pc_phone', label: 'Phone', type: 'tel', scope: 'guardian' }),
      field({
        key: 'pc_preferred_contact_method',
        label: 'Preferred contact method',
        type: 'radio',
        options: [opt('text', 'Text'), opt('email', 'Email'), opt('phone', 'Phone'), opt('any', 'Any')],
        scope: 'guardian'
      }),
      field({
        key: 'pc_best_time',
        label: 'Best time to contact you',
        type: 'checkbox',
        options: [
          opt('morning', 'Morning (8am–12pm)'),
          opt('afternoon', 'Afternoon (12–5pm)'),
          opt('evening', 'Evening (5–8pm)'),
          opt('anytime', 'Anytime')
        ],
        scope: 'guardian'
      }),
      field({ key: 'pc_address_street', label: 'Street address', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_address_apt', label: 'Apt / unit', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_address_zip', label: 'ZIP', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_address_city', label: 'City', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_address_state', label: 'State', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_emergency_name', label: 'Emergency contact — Name', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_emergency_relationship', label: 'Relationship', type: 'text', scope: 'guardian' }),
      field({ key: 'pc_emergency_phone', label: 'Phone', type: 'tel', scope: 'guardian' }),
      field({
        key: 'pc_family_role',
        label: 'Your relationship to the family',
        type: 'radio',
        layout: 'cards',
        options: FAMILY_ROLE_OPTIONS.map((o) => opt(o.value, o.label)),
        scope: 'guardian'
      })
    ]
  });
}

function familyRoster() {
  return step({
    id: 'family_roster',
    label: 'Your Family',
    type: 'family_roster',
    helperText: 'Add everyone who may be part of care. Adults and children can both be listed.',
    whyWeAsk: 'A roster keeps people as separate client records under one family unit.',
    fields: [
      field({
        key: 'family_roster_note',
        label: 'Use + Add family member for each person. Adult/minor is determined from date of birth.',
        type: 'info'
      }),
      field({
        key: 'member_legal_first',
        label: 'Legal first name',
        type: 'text',
        scope: 'client'
      }),
      field({
        key: 'member_legal_last',
        label: 'Legal last name',
        type: 'text',
        scope: 'client'
      }),
      field({
        key: 'member_preferred_name',
        label: 'Preferred name',
        type: 'text',
        scope: 'client'
      }),
      field({
        key: 'member_date_of_birth',
        label: 'Date of birth',
        type: 'date',
        scope: 'client'
      }),
      field({
        key: 'member_sex',
        label: 'Sex',
        type: 'radio',
        options: [opt('female', 'Female'), opt('male', 'Male')],
        scope: 'client'
      }),
      field({
        key: 'member_relationship_to_primary',
        label: 'Relationship to primary contact',
        type: 'text',
        scope: 'client'
      }),
      field({
        key: 'member_lives_in_household',
        label: 'Lives in household?',
        type: 'radio',
        options: yesNo(),
        scope: 'client'
      }),
      field({
        key: 'member_participation',
        label: 'Participating in therapy?',
        type: 'radio',
        options: [
          opt('expected_regular', 'Expected to participate regularly'),
          opt('may_participate', 'May participate'),
          opt('not_participating', 'Not currently participating')
        ],
        scope: 'client'
      })
    ]
  });
}

function householdsRelationships() {
  return step({
    id: 'households',
    label: 'Households & Relationships',
    helperText: 'Help us understand how the family is organized. There is no need to explain every relationship here.',
    whyWeAsk: 'Multi-household and custody context changes who can participate in treatment.',
    fields: [
      field({
        key: 'one_household',
        label: 'Does everyone live primarily in one household?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'custody_affects_participation',
        label: 'Are there custody or parenting arrangements that affect who can participate in treatment?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'custody_details_note',
        label: 'We will use the existing custody / legal-authority flow when needed. Note anything urgent here.',
        optional: true,
        showIf: { fieldKey: 'custody_affects_participation', equals: 'yes' }
      }),
      field({
        key: 'important_relationships_missing',
        label: 'Are there important family relationships not represented by the people listed above?',
        type: 'radio',
        options: yesNo()
      }),
      field({
        key: 'missing_who',
        label: 'Who?',
        type: 'text',
        showIf: { fieldKey: 'important_relationships_missing', equals: 'yes' }
      }),
      field({
        key: 'missing_relationship',
        label: 'Relationship to the family',
        type: 'text',
        showIf: { fieldKey: 'important_relationships_missing', equals: 'yes' }
      })
    ]
  });
}

function whatBringsFamily() {
  return step({
    id: 'what_brings',
    label: 'What Brings Your Family Here?',
    helperText: 'Shared family reasons — not every member needs to agree on every item.',
    whyWeAsk: 'Family-level presenting concerns drive matching and first-session focus.',
    fields: [
      field({ key: 'main_reason_family', label: 'What is the main reason your family is seeking therapy?' }),
      field({ key: 'why_now_family', label: 'Why now?' }),
      field({
        key: 'how_long_affecting',
        label: 'How long has this been affecting the family?',
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
        key: 'something_changed',
        label: 'Did something specific change before the problem became more noticeable?',
        type: 'radio',
        options: yesNoNotSure()
      }),
      field({
        key: 'what_changed',
        label: 'What changed?',
        showIf: { fieldKey: 'something_changed', equals: ['yes', 'not_sure'] }
      }),
      field({ key: 'what_makes_worse', label: 'What seems to make things worse?' }),
      field({ key: 'what_helps', label: 'What helps things go better?' }),
      field({ key: 'already_tried', label: 'What has the family already tried?' }),
      field({
        key: 'affecting_family_0_10',
        label: 'How much is this affecting family life?',
        type: 'radio',
        options: Array.from({ length: 11 }, (_, i) => opt(String(i), String(i)))
      }),
      field({ key: 'help_with_first', label: 'What would you most like help with first?' }),
      field({
        key: 'family_concerns',
        label: 'What best describes why your family is looking for support?',
        type: 'checkbox',
        layout: 'cards',
        options: FAMILY_QUICK_CONCERN_OPTIONS.map((o) => opt(o.value, o.label))
      })
    ]
  });
}

function howFamilyDoing() {
  const areas = [
    ['communication', 'Communication'],
    ['handling_disagreements', 'Handling disagreements'],
    ['parent_child', 'Parent-child relationships'],
    ['siblings', 'Relationships between siblings'],
    ['household_expectations', 'Household expectations'],
    ['boundaries', 'Boundaries'],
    ['supporting_one_another', 'Supporting one another'],
    ['spending_time', 'Spending time together'],
    ['managing_stress', 'Managing stress'],
    ['parenting_consistency', 'Parenting consistency'],
    ['trust', 'Trust'],
    ['adjusting_to_changes', 'Adjusting to changes']
  ];
  const rating = [
    opt('going_well', 'Going well'),
    opt('some_difficulty', 'Some difficulty'),
    opt('significant_difficulty', 'Significant difficulty'),
    opt('na', 'Not applicable')
  ];
  return step({
    id: 'how_family_doing',
    label: 'How Your Family Is Doing',
    helperText: 'Shared family psychosocial snapshot.',
    whyWeAsk: 'Family functioning is the shared layer; individual clinical detail stays on each member.',
    fields: [
      ...areas.map(([key, label]) =>
        field({
          key: `fam_area_${key}`,
          label,
          type: 'radio',
          options: rating,
          defaultValue: 'going_well',
          section: 'How are things going in each area?'
        })
      ),
      field({ key: 'family_does_well', label: 'What does your family do well together?' }),
      field({ key: 'when_conflict', label: 'When there is conflict, what usually happens?' }),
      field({ key: 'who_becomes_involved', label: 'Who tends to become involved?' }),
      field({ key: 'what_settles_down', label: 'What usually helps things settle down?' }),
      field({ key: 'stuck_problem', label: 'Is there a problem the family keeps getting stuck on?' }),
      field({ key: 'most_like_to_change', label: 'What would you most like to change?' })
    ]
  });
}

function importantChanges() {
  return step({
    id: 'important_changes',
    label: 'Important Changes & History',
    helperText: 'Family-level changes and history — not a full individual trauma interview.',
    whyWeAsk: 'Reuse the spirit of dependent family/hard-experiences at the unit level.',
    fields: [
      field({
        key: 'recent_family_changes',
        label: 'Has your family recently experienced:',
        type: 'checkbox',
        layout: 'cards',
        exclusiveValue: 'none',
        options: [
          opt('move', 'Move'),
          opt('school_change', 'School change'),
          opt('separation_divorce', 'Separation/divorce'),
          opt('marriage_new_partnership', 'Marriage/new partnership'),
          opt('new_household_member', 'New household member'),
          opt('birth_adoption', 'Birth/adoption'),
          opt('death_loss', 'Death/loss'),
          opt('serious_illness', 'Serious illness'),
          opt('job_financial', 'Job/financial change'),
          opt('military', 'Military deployment or return'),
          opt('legal_court', 'Legal/court involvement'),
          opt('traumatic_event', 'A frightening or traumatic event'),
          opt('other', 'Other major transition'),
          opt('none', 'None')
        ]
      }),
      field({
        key: 'change_affected_most',
        label: 'Which change has affected the family the most?',
        showIf: { fieldKey: 'recent_family_changes', notEquals: 'none' }
      }),
      field({
        key: 'noticed_since_change',
        label: 'What have you noticed since then?',
        showIf: { fieldKey: 'recent_family_changes', notEquals: 'none' }
      }),
      field({
        key: 'family_history_useful',
        label: "Is there anything important in your family's history that would help the provider understand what is happening now?",
        optional: true,
        helperText: 'Optional'
      })
    ]
  });
}

function memberMiniIntake() {
  return step({
    id: 'member_mini',
    label: 'About {memberName}',
    helperText: 'Reduced family-therapy member intake. Full individual packet is not required unless also enrolling individually.',
    whyWeAsk: 'Clinically relevant member context without duplicating entire self/dependent packets.',
    audience: 'family_member',
    repeatPerClient: true,
    fields: [
      field({
        key: 'member_current_mh_treatment',
        label: 'Is this person currently in mental-health treatment?',
        type: 'radio',
        options: yesNo(),
        scope: 'client'
      }),
      field({
        key: 'member_relevant_diagnoses',
        label: 'Any relevant diagnoses the family therapist should know?',
        optional: true,
        scope: 'client'
      }),
      field({
        key: 'member_medications_relevant',
        label: 'Medications relevant to family therapy (if any)',
        optional: true,
        scope: 'client'
      }),
      field({
        key: 'member_substance_relevant',
        label: 'Any substance use the family therapist should know about?',
        type: 'radio',
        options: yesNoNotSure(),
        scope: 'client'
      }),
      field({
        key: 'member_prior_therapy',
        label: 'Prior therapy or counseling?',
        type: 'radio',
        options: yesNo(),
        scope: 'client'
      }),
      field({
        key: 'member_major_experiences',
        label: 'Major experiences affecting family therapy',
        optional: true,
        scope: 'client'
      }),
      field({
        key: 'member_strengths',
        label: 'What are this person’s strengths? What helps them regulate?',
        optional: true,
        scope: 'client'
      }),
      field({
        key: 'member_school_note',
        label: 'School / functioning notes (minors)',
        optional: true,
        scope: 'client'
      })
    ]
  });
}

function familySafety() {
  return step({
    id: 'safety',
    label: 'Safety',
    helperText: 'Person-level safety stays private. Shared family flags route to the right member quietly.',
    whyWeAsk: 'Safety belongs partly to the person, not the family record.',
    fields: [
      field({
        key: 'household_safety_concerns',
        label: 'Are there current safety concerns between any members of the household?',
        type: 'radio',
        options: [opt('no', 'No'), opt('yes', 'Yes'), opt('unsure', 'Unsure')]
      }),
      field({
        key: 'household_safety_private_route',
        label: 'We have a few additional private questions for the appropriate family member(s).',
        type: 'info',
        showIf: { fieldKey: 'household_safety_concerns', equals: ['yes', 'unsure'] }
      })
    ]
  });
}

function memberPrivateSafety() {
  return step({
    id: 'member_safety',
    label: 'Private Safety — {memberName}',
    helperText: 'Complete privately when indicated. Other family members do not see these answers on shared review.',
    whyWeAsk: 'Reuse person-scoped safety infrastructure.',
    audience: 'family_member',
    repeatPerClient: true,
    fields: [
      field({
        key: 'member_feel_safe_home',
        label: 'Do you feel physically safe where you live?',
        type: 'radio',
        options: yesNoNotSure(),
        scope: 'client',
        privateToRespondent: true
      }),
      field({
        key: 'member_afraid_of_someone',
        label: 'Are you currently afraid that another person in the home may hurt you?',
        type: 'radio',
        options: yesNo(),
        scope: 'client',
        privateToRespondent: true
      }),
      field({
        key: 'member_immediate_danger',
        label: 'Are you currently in immediate danger of hurting yourself or someone else?',
        type: 'radio',
        options: yesNo(),
        scope: 'client',
        privateToRespondent: true
      }),
      field({
        key: 'member_self_harm_past',
        label: 'Have you intentionally hurt yourself in the past?',
        type: 'radio',
        options: yesNo(),
        scope: 'client',
        privateToRespondent: true
      }),
      field({
        key: 'member_wish_dead',
        label: 'Have you wished you were dead or wished you could go to sleep and not wake up?',
        type: 'radio',
        options: yesNo(),
        scope: 'client',
        privateToRespondent: true
      }),
      field({
        key: 'member_thoughts_killing_self',
        label: 'Have you actually had any thoughts of killing yourself?',
        type: 'radio',
        options: yesNo(),
        scope: 'client',
        privateToRespondent: true
      })
    ]
  });
}

function familyGoals() {
  return step({
    id: 'goals',
    label: 'Goals',
    helperText: 'Shared family goals, then optional per-member hopes with attribution.',
    whyWeAsk: 'Therapists need to see distinct voices — not one forced “family answer.”',
    fields: [
      field({ key: 'therapy_working_well', label: 'If family therapy were working well, what would be different?' }),
      field({ key: 'happen_more_often', label: 'What would happen more often in your home?' }),
      field({ key: 'happen_less_often', label: 'What would happen less often?' }),
      field({ key: 'already_working_keep', label: 'What is already working that you want to keep?' }),
      field({ key: 'this_is_helping_us', label: 'What would make your family say, "This is helping us"?' })
    ]
  });
}

function memberGoals() {
  return step({
    id: 'member_goals',
    label: 'Personal hope — {memberName}',
    helperText: 'Optional. Stored with respondent attribution.',
    whyWeAsk: 'Parent, teen, and sibling hopes often differ — and that difference is clinically useful.',
    audience: 'family_member',
    repeatPerClient: true,
    fields: [
      field({
        key: 'member_personal_hope',
        label: 'What is one thing you hope family therapy helps with?',
        optional: true,
        helperText: 'Optional',
        scope: 'client'
      })
    ]
  });
}

export function buildCounselingFamilyEnSteps() {
  return [
    primaryContact(),
    familyRoster(),
    householdsRelationships(),
    whatBringsFamily(),
    howFamilyDoing(),
    importantChanges(),
    memberMiniIntake(),
    familySafety(),
    memberPrivateSafety(),
    familyGoals(),
    memberGoals()
  ];
}

export default { buildCounselingFamilyEnSteps, COUNSELING_FAMILY_STEP_PREFIX };
