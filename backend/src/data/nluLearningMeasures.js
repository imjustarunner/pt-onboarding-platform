import { createHash } from 'node:crypto';
// Original NLU pilot. Domain assignments are hypotheses, not validated subscales.
export const nluAgencySlugs = ['nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up'];
const choices = ['Never', 'Rarely', 'Sometimes', 'Often', 'Almost always'].map((label, i) => ({ value: String(i), label: `${i} · ${label}` }));
const frequency = [...choices, { value: 'not_observed', label: 'No opportunity / not sure' }];
export const nluPilotDomains = [
  { key: 'distress', label: 'Learning-related distress', direction: 'lower', items: ['q1', 'q2', 'q3', 'q4'] },
  { key: 'regulation', label: 'Regulation and support', direction: 'higher', items: ['q5', 'q6', 'q7', 'q8'] },
  { key: 'participation', label: 'Learning participation', direction: 'higher', items: ['q9', 'q10', 'q11', 'q12'] }
];
const prompts = [
 ['I felt worried when it was time to do schoolwork.', 'My child said or showed that they were worried when it was time to do schoolwork at home.'],
 ['When schoolwork was difficult, I felt upset.', 'When schoolwork at home was difficult, my child said or showed that they felt upset.'],
 ['Feeling worried or upset made it hard for me to begin schoolwork.', 'Feeling worried or upset appeared to make it hard for my child to begin schoolwork at home.'],
 ['After I stopped doing schoolwork, I still felt upset about it.', 'After stopping schoolwork at home, my child still said or showed that they were upset about it.'],
 ['When schoolwork became difficult, I could name how I was feeling.', 'When schoolwork at home became difficult, my child could name how they were feeling.'],
 ['When I became upset during schoolwork, I used something that helped me feel calmer.', 'When my child became upset during schoolwork at home, they used something that helped them feel calmer.'],
 ['When I needed help with schoolwork, I asked someone for help.', 'When my child needed help with schoolwork at home, they asked someone for help.'],
 ['After becoming upset during schoolwork, I was able to return to the task.', 'After becoming upset during schoolwork at home, my child was able to return to the task.'],
 ['I began schoolwork at the time I had planned or agreed to start.', 'My child began schoolwork at home at the planned or agreed time.'],
 ['I kept my attention on the part of the schoolwork I was doing.', 'My child kept their attention on the part of the schoolwork they were doing at home.'],
 ['When something distracted me during schoolwork, I returned to what I was doing.', 'When something distracted my child during schoolwork at home, they returned to what they were doing.'],
 ['I completed the amount of schoolwork I had planned or agreed to do.', 'My child completed the amount of schoolwork at home they had planned or agreed to do.']
];
const base = {
  kind: 'original_pilot', program: 'therapy_plus_tutoring', tenants: nluAgencySlugs,
  validated: false, ageRange: { min: 8, max: 17 }, language: 'en',
  population: 'NLU Therapy Plus Tutoring · Ages 8–17 · Pilot only',
  scoringVersion: 'nlu-pilot-2.0.0',
  rights: { status: 'original_pilot', attribution: 'Adapted from Michael Mendez’s original NLU student and caregiver assessments. Original pilot wording; not a validated instrument.', sourceUrl: '/library?companyDocument=nlu-learning-pilot-guide', rightsUrl: '/library?companyDocument=nlu-learning-pilot-guide' }
};
const profiles = ['student', 'caregiver'].map((respondent, j) => ({
  ...base, id: `nlu-learning-${respondent}`, respondent,
  title: `NLU · Learning & Emotional Functioning · ${respondent === 'student' ? 'Student' : 'Caregiver'}`,
  instrumentVersion: `NLU Learning & Emotional Functioning ${respondent} pilot v2`,
  domain: 'NLU pilot · Emotional functioning',
  summary: 'Three separate descriptive domains. No total, diagnostic cutoff, percentile or validated change threshold.',
  timeframe: 'Past 7 days', scoreRange: 'Domain averages 0–4; no combined score', domains: nluPilotDomains,
  instructions: `${respondent === 'student' ? 'Think about schoolwork at school, at home or in tutoring during the past 7 days. Choose how often each statement was true for you.' : 'Think only about schoolwork at home that you observed during the past 7 days. Choose how often each statement described your child. Do not guess what happened elsewhere.'} There are no good or bad answers. Choose “No opportunity / not sure” when you cannot judge; you may leave questions unanswered. This pilot helps us discuss what support is useful. It does not measure reading or math achievement.`,
  items: prompts.map((pair, i) => ({ key: `q${i+1}`, label: pair[j], type: 'radio', options: frequency, section: nluPilotDomains[Math.floor(i / 4)].label }))
}));
const radio = (key, label, values) => ({ key, label, type: 'radio', options: values.map(([value, label]) => ({ value, label })) });
const text = (key, label, helper) => ({ key, label, helper, type: 'text' });
const number = (key, label, max, optional = false) => ({ key, label, type: 'number', min: 0, max, integer: true, optional });
const academic = {
  ...base, id: 'nlu-academic-observation', respondent: 'observer', domain: 'NLU pilot · Academic performance',
  title: 'NLU · Academic Task Observation', instrumentVersion: 'NLU Academic Task Observation pilot v1',
  scoringVersion: 'nlu-academic-1.0.0', timeframe: 'One observed task', scoreRange: 'Task accuracy; no grade equivalent or norms',
  summary: 'Record performance on an identified reading or math task separately from emotional functioning. This is a task record, not a standardized achievement test.',
  instructions: 'Use an original or authorized task with a defined answer key. Record the actual task, difficulty, scoring unit, opportunities, assistance and observation date. Keep tasks separate. A percentage on one task is not a reading level, grade equivalent, diagnosis or evidence of program effectiveness. No test materials or standardized norms are supplied by this record.',
  items: [
    radio('subject', 'Skill observed', [['reading_accuracy','Reading accuracy'],['reading_comprehension','Reading comprehension'],['math_accuracy','Math accuracy']]),
    text('task_family', 'Task or probe family identifier', 'Use a non-identifying stable code for the task protocol. Do not enter a client name.'),
    text('task_form', 'Task form / version identifier', 'Identify the actual passage, item set or alternate form. Different forms are not assumed equally difficult.'),
    text('difficulty', 'Difficulty / content description', 'For example: two-digit addition without regrouping. This is task content, not a measured grade equivalent.'),
    radio('unit', 'What counts as one opportunity?', [['word','Word'],['question','Question / problem']]),
    number('presented', 'Opportunities presented', 10000), number('attempted', 'Opportunities attempted', 10000), number('correct', 'Opportunities correct', 10000),
    number('duration_seconds', 'Observed task duration in seconds (optional)', 14400, true),
    radio('support', 'Assistance during this task', [['independent','Independent'],['directions','Directions repeated or clarified'],['prompted','Prompts or coaching'],['modeled','Modeling / worked example'],['mixed','Mixed assistance']]),
    text('conditions', 'Task conditions and accommodations', 'Record relevant access supports, interruptions and whether the task was previously practiced. No identifying details.'),
    text('observations', 'Optional observations about engagement', 'Describe what happened without inferring a diagnosis.')
  ]
};
academic.items.at(-1).optional = true;
export const nluLearningMeasures = [...profiles, academic].map(m => ({ ...m, version: createHash('sha256').update(JSON.stringify(m)).digest('hex').slice(0,20) }));
export const getNluLearningMeasure = id => nluLearningMeasures.find(m => m.id === id) || null;
