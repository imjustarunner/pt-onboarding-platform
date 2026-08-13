/**
 * Official instrument batteries for counseling intake.
 * Wording is the published item text — do not paraphrase when editing.
 */

function opt(value, label) {
  return { value, label };
}

function radioField({
  key,
  label,
  helperText = '',
  options,
  required = true,
  showIf = null,
  instrument,
  section = '',
  scope = 'self'
}) {
  return {
    id: `field_${key}`,
    key,
    label,
    type: 'radio',
    required,
    helperText,
    placeholder: '',
    scope,
    visibility: 'always',
    showIf: showIf || { fieldKey: '', equals: '' },
    options,
    section,
    instrument,
    category: 'clinical'
  };
}

export const PHQ9_FREQUENCY = [
  opt('0', 'Not at all'),
  opt('1', 'Several days'),
  opt('2', 'More than half the days'),
  opt('3', 'Nearly every day')
];

export const GAD7_FREQUENCY = [...PHQ9_FREQUENCY];

const PHQ9_HELPER =
  'Over the last 2 weeks, how often have you been bothered by any of the following problems?';

export function buildPhq9Fields() {
  const items = [
    ['phq9_1', 'Little interest or pleasure in doing things'],
    ['phq9_2', 'Feeling down, depressed, or hopeless'],
    ['phq9_3', 'Trouble falling or staying asleep, or sleeping too much'],
    ['phq9_4', 'Feeling tired or having little energy'],
    ['phq9_5', 'Poor appetite or overeating'],
    ['phq9_6', 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down'],
    ['phq9_7', 'Trouble concentrating on things, such as reading the newspaper or watching television'],
    ['phq9_8', 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual'],
    ['phq9_9', 'Thoughts that you would be better off dead or of hurting yourself in some way']
  ];
  return items.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: PHQ9_HELPER,
      options: PHQ9_FREQUENCY,
      instrument: 'phq9',
      section: 'PHQ-9'
    })
  );
}

const GAD7_HELPER =
  'Over the last 2 weeks, how often have you been bothered by the following problems?';

export function buildGad7Fields() {
  const items = [
    ['gad7_1', 'Feeling nervous, anxious, or on edge'],
    ['gad7_2', 'Not being able to stop or control worrying'],
    ['gad7_3', 'Worrying too much about different things'],
    ['gad7_4', 'Trouble relaxing'],
    ['gad7_5', 'Being so restless that it is hard to sit still'],
    ['gad7_6', 'Becoming easily annoyed or irritable'],
    ['gad7_7', 'Feeling afraid, as if something awful might happen']
  ];
  return items.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: GAD7_HELPER,
      options: GAD7_FREQUENCY,
      instrument: 'gad7',
      section: 'GAD-7'
    })
  );
}

/** C-SSRS Screener (Recent) — Columbia Lighthouse Project item wording. */
export function buildCssrsScreenerFields() {
  const yesNo = [opt('yes', 'Yes'), opt('no', 'No')];
  const ideationShowIf = { fieldKey: 'cssrs_2', equals: 'yes' };
  return [
    radioField({
      key: 'cssrs_1',
      label: 'Have you wished you were dead or wished you could go to sleep and not wake up?',
      helperText: 'Columbia-Suicide Severity Rating Scale (C-SSRS) Screener. Think about the past month.',
      options: yesNo,
      instrument: 'cssrs_screener',
      section: 'Validated suicide screening'
    }),
    radioField({
      key: 'cssrs_2',
      label: 'Have you actually had any thoughts of killing yourself?',
      helperText: 'Columbia-Suicide Severity Rating Scale (C-SSRS) Screener. Think about the past month.',
      options: yesNo,
      instrument: 'cssrs_screener',
      section: 'Validated suicide screening'
    }),
    radioField({
      key: 'cssrs_3',
      label: 'Have you been thinking about how you might do this?',
      helperText: 'Columbia-Suicide Severity Rating Scale (C-SSRS) Screener. Think about the past month.',
      options: yesNo,
      showIf: ideationShowIf,
      instrument: 'cssrs_screener',
      section: 'Validated suicide screening'
    }),
    radioField({
      key: 'cssrs_4',
      label: 'Have you had these thoughts and had some intention of acting on them?',
      helperText: 'Columbia-Suicide Severity Rating Scale (C-SSRS) Screener. Think about the past month.',
      options: yesNo,
      showIf: ideationShowIf,
      instrument: 'cssrs_screener',
      section: 'Validated suicide screening'
    }),
    radioField({
      key: 'cssrs_5',
      label: 'Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?',
      helperText: 'Columbia-Suicide Severity Rating Scale (C-SSRS) Screener. Think about the past month.',
      options: yesNo,
      showIf: ideationShowIf,
      instrument: 'cssrs_screener',
      section: 'Validated suicide screening'
    }),
    radioField({
      key: 'cssrs_6',
      label: 'Have you ever done anything, started to do anything, or prepared to do anything to end your life?',
      helperText: 'Columbia-Suicide Severity Rating Scale (C-SSRS) Screener.',
      options: yesNo,
      instrument: 'cssrs_screener',
      section: 'Validated suicide screening'
    })
  ];
}

const AUDIT_C_SHOW_IF = {
  all: [
    { fieldKey: 'alcohol_use', includesAny: ['occasionally', 'weekly', 'several_times_week', 'daily'] },
    {
      any: [
        { fieldKey: 'alcohol_use', includesAny: ['weekly', 'several_times_week', 'daily'] },
        { fieldKey: 'substance_causes_problems', equals: ['maybe', 'yes'] },
        { fieldKey: 'substance_others_concerned', equals: 'yes' },
        { fieldKey: 'substance_want_help', equals: ['yes', 'not_sure'] }
      ]
    }
  ]
};

export function buildAuditCFields() {
  return [
    radioField({
      key: 'audit_c_1',
      label: 'How often do you have a drink containing alcohol?',
      helperText: 'AUDIT-C alcohol screening.',
      options: [
        opt('0', 'Never'),
        opt('1', 'Monthly or less'),
        opt('2', '2–4 times a month'),
        opt('3', '2–3 times a week'),
        opt('4', '4 or more times a week')
      ],
      showIf: AUDIT_C_SHOW_IF,
      instrument: 'audit_c',
      section: 'Alcohol screening'
    }),
    radioField({
      key: 'audit_c_2',
      label: 'How many standard drinks containing alcohol do you have on a typical day when you are drinking?',
      helperText: 'AUDIT-C alcohol screening.',
      options: [
        opt('0', '1 or 2'),
        opt('1', '3 or 4'),
        opt('2', '5 or 6'),
        opt('3', '7 to 9'),
        opt('4', '10 or more')
      ],
      showIf: AUDIT_C_SHOW_IF,
      instrument: 'audit_c',
      section: 'Alcohol screening'
    }),
    radioField({
      key: 'audit_c_3',
      label: 'How often do you have six or more drinks on one occasion?',
      helperText: 'AUDIT-C alcohol screening.',
      options: [
        opt('0', 'Never'),
        opt('1', 'Less than monthly'),
        opt('2', 'Monthly'),
        opt('3', 'Weekly'),
        opt('4', 'Daily or almost daily')
      ],
      showIf: AUDIT_C_SHOW_IF,
      instrument: 'audit_c',
      section: 'Alcohol screening'
    })
  ];
}

const DAST_SHOW_IF = {
  any: [
    { fieldKey: 'cannabis_use', includesAny: ['weekly', 'several_times_week', 'daily'] },
    { fieldKey: 'other_substances', equals: 'yes' },
    { fieldKey: 'nonprescribed_meds', equals: 'yes' }
  ]
};

export function buildDast10Fields() {
  const yesNo = [opt('yes', 'Yes'), opt('no', 'No')];
  const helper = 'DAST-10 drug-use screening. These questions refer to the past 12 months.';
  const items = [
    ['dast10_1', 'Have you used drugs other than those required for medical reasons?'],
    ['dast10_2', 'Do you abuse more than one drug at a time?'],
    ['dast10_3', 'Are you always able to stop using drugs when you want to?'],
    ['dast10_4', 'Have you had blackouts or flashbacks as a result of drug use?'],
    ['dast10_5', 'Do you ever feel bad or guilty about your drug use?'],
    ['dast10_6', 'Does your spouse (or parents) ever complain about your involvement with drugs?'],
    ['dast10_7', 'Have you neglected your family because of your use of drugs?'],
    ['dast10_8', 'Have you engaged in illegal activities in order to obtain drugs?'],
    ['dast10_9', 'Have you ever experienced withdrawal symptoms (felt sick) when you stopped taking drugs?'],
    ['dast10_10', 'Have you had medical problems as a result of your drug use (e.g., memory loss, hepatitis, convulsions, bleeding)?']
  ];
  return items.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: helper,
      options: yesNo,
      showIf: DAST_SHOW_IF,
      instrument: 'dast10',
      section: 'Drug-use screening'
    })
  );
}

const PTSD_SHOW_IF = {
  any: [
    { fieldKey: 'trauma_experienced', equals: ['yes', 'not_sure'] },
    {
      fieldKey: 'recent_symptoms',
      includesAny: ['disturbing_memories', 'avoiding', 'feeling_disconnected']
    }
  ]
};

export function buildPcPtsd5Fields() {
  const yesNo = [opt('yes', 'Yes'), opt('no', 'No')];
  const helper =
    'PC-PTSD-5. Sometimes things happen to people that are unusually or especially frightening, horrible, or traumatic. In the past month:';
  const items = [
    ['pcptsd5_1', 'Have you had nightmares about the event(s) or thought about the event(s) when you did not want to?'],
    ['pcptsd5_2', 'Have you tried hard not to think about the event(s) or gone out of your way to avoid situations that reminded you of the event(s)?'],
    ['pcptsd5_3', 'Have you been constantly on guard, watchful, or easily startled?'],
    ['pcptsd5_4', 'Have you felt numb or detached from people, activities, or your surroundings?'],
    ['pcptsd5_5', 'Have you felt guilty or unable to stop blaming yourself or others for the event(s) or any problems the event(s) may have caused?']
  ];
  return items.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: helper,
      options: yesNo,
      showIf: PTSD_SHOW_IF,
      instrument: 'pcptsd5',
      section: 'Trauma measure'
    })
  );
}

const ASRS_SHOW_IF = {
  any: [
    { fieldKey: 'bothering_most', equals: 'trouble_concentrating' },
    {
      all: [
        { fieldKey: 'recent_symptoms', includes: 'trouble_concentrating' },
        { fieldKey: 'recent_symptoms', includesAny: ['low_motivation', 'feeling_unusually_energetic'] }
      ]
    }
  ]
};

export function buildAsrsPartAFields() {
  const freq = [
    opt('never', 'Never'),
    opt('rarely', 'Rarely'),
    opt('sometimes', 'Sometimes'),
    opt('often', 'Often'),
    opt('very_often', 'Very Often')
  ];
  const helper = 'Adult ADHD Self-Report Scale (ASRS-v1.1) Symptom Checklist, Part A.';
  const items = [
    ['asrs_1', 'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?'],
    ['asrs_2', 'How often do you have difficulty getting things in order when you have to do a task that requires organization?'],
    ['asrs_3', 'How often do you have problems remembering appointments or obligations?'],
    ['asrs_4', 'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?'],
    ['asrs_5', 'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?'],
    ['asrs_6', 'How often do you feel overly active and compelled to do things, like you were driven by a motor?']
  ];
  return items.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: helper,
      options: freq,
      showIf: ASRS_SHOW_IF,
      instrument: 'asrs_v1_1_part_a',
      section: 'ADHD measure'
    })
  );
}

const MDQ_SHOW_IF = { fieldKey: 'recent_symptoms', includes: 'feeling_unusually_energetic' };

export function buildMdqFields() {
  const yesNo = [opt('yes', 'Yes'), opt('no', 'No')];
  const helper =
    'Mood Disorder Questionnaire (MDQ). Has there ever been a period of time when you were not your usual self and…';
  const items = [
    ['mdq_1', '…you felt so good or so hyper that other people thought you were not your normal self, or you were so hyper that you got into trouble?'],
    ['mdq_2', '…you were so irritable that you shouted at people or started fights or arguments?'],
    ['mdq_3', '…you felt much more self-confident than usual?'],
    ['mdq_4', '…you got much less sleep than usual and found you didn’t really miss it?'],
    ['mdq_5', '…you were much more talkative or spoke much faster than usual?'],
    ['mdq_6', '…thoughts raced through your head or you couldn’t slow your mind down?'],
    ['mdq_7', '…you were so easily distracted by things around you that you had trouble concentrating or staying on track?'],
    ['mdq_8', '…you had much more energy than usual?'],
    ['mdq_9', '…you were much more active or did many more things than usual?'],
    ['mdq_10', '…you were much more social or outgoing than usual; for example, you telephoned friends in the middle of the night?'],
    ['mdq_11', '…you were much more interested in sex than usual?'],
    ['mdq_12', '…you did things that were unusual for you or that other people might have thought were excessive, foolish, or risky?'],
    ['mdq_13', '…spending money got you or your family into trouble?']
  ];
  const fields = items.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: helper,
      options: yesNo,
      showIf: MDQ_SHOW_IF,
      instrument: 'mdq',
      section: 'Bipolar/mania screening'
    })
  );
  fields.push(
    radioField({
      key: 'mdq_same_period',
      label: 'If you checked YES to more than one of the above, have several of these ever happened during the same period of time?',
      helperText: 'Mood Disorder Questionnaire (MDQ).',
      options: yesNo,
      showIf: MDQ_SHOW_IF,
      instrument: 'mdq',
      section: 'Bipolar/mania screening'
    }),
    radioField({
      key: 'mdq_problem',
      label: 'How much of a problem did any of these cause you — like being unable to work; having family, money or legal troubles; getting into arguments or fights?',
      helperText: 'Mood Disorder Questionnaire (MDQ).',
      options: [
        opt('no_problem', 'No problem'),
        opt('minor', 'Minor problem'),
        opt('moderate', 'Moderate problem'),
        opt('serious', 'Serious problem')
      ],
      showIf: MDQ_SHOW_IF,
      instrument: 'mdq',
      section: 'Bipolar/mania screening'
    })
  );
  return fields;
}

export function buildStandardQuestionnaireFields() {
  return [
    ...buildPhq9Fields(),
    ...buildGad7Fields(),
    ...buildAuditCFields(),
    ...buildDast10Fields(),
    ...buildPcPtsd5Fields(),
    ...buildAsrsPartAFields(),
    ...buildMdqFields()
  ];
}

const PSC17_NEVER_SOMETIMES_OFTEN = [
  opt('0', 'Never'),
  opt('1', 'Sometimes'),
  opt('2', 'Often')
];

/** School-packet / Clinical-tab order — do not reorder to official MGH numbering. */
export const PSC17_ITEMS = [
  ['psc_1', 'Fidgety, unable to sit still'],
  ['psc_2', 'Acts as if driven by a motor'],
  ['psc_3', 'Daydreams too much'],
  ['psc_4', 'Distracted easily'],
  ['psc_5', 'Feels sad, unhappy'],
  ['psc_6', 'Feels hopeless'],
  ['psc_7', 'Has trouble concentrating'],
  ['psc_8', 'Fights with others'],
  ['psc_9', 'Is down on him or herself'],
  ['psc_10', 'Worries a lot'],
  ['psc_11', 'Seems to be having less fun'],
  ['psc_12', 'Does not listen to rules'],
  ['psc_13', "Does not understand other people's feelings"],
  ['psc_14', 'Teases others'],
  ['psc_15', 'Blames others for his or her troubles'],
  ['psc_16', 'Takes things that do not belong to him or her'],
  ['psc_17', 'Refuses to share']
];

export function buildPsc17Fields({
  scope = 'client',
  showIf = null,
  helperText = 'Please select the answer that best fits your dependent:'
} = {}) {
  return PSC17_ITEMS.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText,
      options: PSC17_NEVER_SOMETIMES_OFTEN,
      showIf,
      instrument: 'psc17',
      section: 'PSC-17',
      scope
    })
  );
}

const VANDERBILT_FREQ = [
  opt('0', 'Never'),
  opt('1', 'Occasionally'),
  opt('2', 'Often'),
  opt('3', 'Very Often')
];

const VANDERBILT_ITEMS = [
  ['vanderbilt_1', 'Does not pay attention to details or makes careless mistakes with, for example, homework'],
  ['vanderbilt_2', 'Has difficulty keeping attention to what needs to be done'],
  ['vanderbilt_3', 'Does not seem to listen when spoken to directly'],
  ['vanderbilt_4', 'Does not follow through when given directions and fails to finish activities (not due to refusal or failure to understand)'],
  ['vanderbilt_5', 'Has difficulty organizing tasks and activities'],
  ['vanderbilt_6', 'Avoids, dislikes, or does not want to start tasks that require ongoing mental effort'],
  ['vanderbilt_7', 'Loses things necessary for tasks or activities (toys, assignments, pencils, or books)'],
  ['vanderbilt_8', 'Is easily distracted by noises or other stimuli'],
  ['vanderbilt_9', 'Is forgetful in daily activities'],
  ['vanderbilt_10', 'Fidgets with hands or feet or squirms in seat'],
  ['vanderbilt_11', 'Leaves seat when remaining seated is expected'],
  ['vanderbilt_12', 'Runs about or climbs too much when remaining seated is expected'],
  ['vanderbilt_13', 'Has difficulty playing or beginning quiet play activities'],
  ['vanderbilt_14', 'Is “on the go” or often acts as if “driven by a motor”'],
  ['vanderbilt_15', 'Talks too much'],
  ['vanderbilt_16', 'Blurts out answers before questions have been completed'],
  ['vanderbilt_17', 'Has difficulty waiting his or her turn'],
  ['vanderbilt_18', 'Interrupts or intrudes upon others’ conversations and/or activities']
];

export function buildVanderbiltAdhd18Fields({ scope = 'client', showIf = null } = {}) {
  const helper =
    'Vanderbilt ADHD items (parent). For each behavior, how often does this happen?';
  return VANDERBILT_ITEMS.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: helper,
      options: VANDERBILT_FREQ,
      showIf,
      instrument: 'vanderbilt_adhd18',
      section: 'Vanderbilt ADHD',
      scope
    })
  );
}

const SCARED5_FREQ = [
  opt('0', 'Not True or Hardly Ever True'),
  opt('1', 'Somewhat True or Sometimes True'),
  opt('2', 'Very True or Often True')
];

const SCARED5_ITEMS = [
  ['scared5_1', 'Gets really frightened for no reason'],
  ['scared5_2', 'Is afraid to be alone in the house'],
  ['scared5_3', 'People tell me my child worries too much'],
  ['scared5_4', 'Is scared to go to school'],
  ['scared5_5', 'Is shy']
];

export function buildScared5ParentFields({ scope = 'client', showIf = null } = {}) {
  const helper = 'SCARED-5 (parent). How true is each of these for your child?';
  return SCARED5_ITEMS.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: helper,
      options: SCARED5_FREQ,
      showIf,
      instrument: 'scared5_parent',
      section: 'SCARED-5 Parent',
      scope
    })
  );
}

export function buildAsqFields({
  scope = 'client',
  showIf = null,
  helperText = 'Ask Suicide-Screening Questions (ASQ) — parent/caregiver report. Answer based on what you have seen or what your child has told you.'
} = {}) {
  const yesNo = [opt('yes', 'Yes'), opt('no', 'No')];
  const items = [
    ['asq_1', 'In the past few weeks, has your child wished they were dead?'],
    ['asq_2', 'In the past few weeks, has your child felt that they or their family would be better off if they were dead?'],
    ['asq_3', 'In the past few weeks, has your child been having thoughts about killing themselves?'],
    ['asq_4', 'Has your child ever tried to kill themselves?']
  ];
  const fields = items.map(([key, label]) =>
    radioField({
      key,
      label,
      helperText,
      options: yesNo,
      showIf,
      instrument: 'asq',
      section: 'ASQ',
      scope
    })
  );
  const asqPositive = {
    any: [
      { fieldKey: 'asq_1', equals: 'yes' },
      { fieldKey: 'asq_2', equals: 'yes' },
      { fieldKey: 'asq_3', equals: 'yes' },
      { fieldKey: 'asq_4', equals: 'yes' }
    ]
  };
  fields.push(
    radioField({
      key: 'asq_5',
      label: 'Is your child having thoughts of killing themselves right now?',
      helperText: helperText,
      options: yesNo,
      showIf: showIf ? { all: [showIf, asqPositive] } : asqPositive,
      instrument: 'asq',
      section: 'ASQ',
      scope
    })
  );
  return fields;
}

const CRAFFT_YES_NO = [opt('yes', 'Yes'), opt('no', 'No')];
const CRAFFT_DAYS = [
  opt('0', '0 days'),
  opt('1plus', '1 or more days')
];

export function buildCrafftFields({
  scope = 'client',
  showIf = null,
  helperText = 'CRAFFT 2.1 (parent/caregiver). To your knowledge, during the PAST 12 MONTHS, on how many days did your child:'
} = {}) {
  const partA = [
    ['crafft_a1', 'Drink more than a few sips of beer, wine, or any drink containing alcohol?'],
    ['crafft_a2', 'Use any marijuana (cannabis, weed, pot) or hashish?'],
    ['crafft_a3', 'Use anything else to get high?']
  ].map(([key, label]) =>
    radioField({
      key,
      label,
      helperText,
      options: CRAFFT_DAYS,
      showIf,
      instrument: 'crafft21',
      section: 'CRAFFT 2.1',
      scope
    })
  );
  const partBIf = {
    all: [
      ...(showIf ? [showIf] : []),
      {
        any: [
          { fieldKey: 'crafft_a1', equals: '1plus' },
          { fieldKey: 'crafft_a2', equals: '1plus' },
          { fieldKey: 'crafft_a3', equals: '1plus' }
        ]
      }
    ]
  };
  const partBHelper =
    'CRAFFT 2.1. Please answer based on what you know about your child’s alcohol or drug use.';
  const partB = [
    ['crafft_car', 'Have they ever ridden in a CAR driven by someone (including themselves) who was “high” or had been using alcohol or drugs?'],
    ['crafft_relax', 'Do they ever use alcohol or drugs to RELAX, feel better about themselves, or fit in?'],
    ['crafft_alone', 'Do they ever use alcohol or drugs while they are by themselves, or ALONE?'],
    ['crafft_forget', 'Do they ever FORGET things they did while using alcohol or drugs?'],
    ['crafft_friends', 'Do their family or FRIENDS ever tell them that they should cut down on their drinking or drug use?'],
    ['crafft_trouble', 'Have they ever gotten into TROUBLE while they were using alcohol or drugs?']
  ].map(([key, label]) =>
    radioField({
      key,
      label,
      helperText: partBHelper,
      options: CRAFFT_YES_NO,
      showIf: partBIf,
      instrument: 'crafft21',
      section: 'CRAFFT 2.1',
      scope
    })
  );
  return [...partA, ...partB];
}
