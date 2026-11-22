import { buildPhq9Fields } from './validatedClinicalScreens.en.js';

const choices = (labels, start = 0) => labels.map((label, index) => ({ value: String(index + start), label }));
const yesNo = choices(['No', 'Yes']);
const frequency = choices(['Not at all', 'Several days', 'More than half the days', 'Nearly every day']);
const questions = (labels, options, prefix = 'q', extra = {}) => labels.map((label, index) => ({
  key: `${prefix}${index + 1}`, label, type: 'radio', options, ...extra
}));
const instrument = (id, title, domain, instructions, items, extra = {}) => ({
  id, title, domain, instructions, items, language: 'en', respondent: 'self', ...extra
});

const vanderbiltSymptoms = [
  'Does not pay attention to details or makes careless mistakes with, for example, homework',
  'Has difficulty keeping attention to what needs to be done',
  'Does not seem to listen when spoken to directly',
  'Does not follow through when given directions and fails to finish activities (not due to refusal or failure to understand)',
  'Has difficulty organizing tasks and activities',
  'Avoids, dislikes, or does not want to start tasks that require ongoing mental effort',
  'Loses things necessary for tasks or activities (toys, assignments, pencils, or books)',
  'Is easily distracted by noises or other stimuli', 'Is forgetful in daily activities',
  'Fidgets with hands or feet or squirms in seat', 'Leaves seat when remaining seated is expected',
  'Runs about or climbs too much when remaining seated is expected',
  'Has difficulty playing or beginning quiet play activities',
  'Is “on the go” or often acts as if “driven by a motor”', 'Talks too much',
  'Blurts out answers before questions have been completed', 'Has difficulty waiting his or her turn',
  'Interrupts or intrudes in on others’ conversations and/or activities'
];
const initialSymptoms = [
  'Argues with adults', 'Loses temper', 'Actively defies or refuses to go along with adults’ requests or rules',
  'Deliberately annoys people', 'Blames others for his or her mistakes or misbehaviors',
  'Is touchy or easily annoyed by others', 'Is angry or resentful', 'Is spiteful and wants to get even',
  'Bullies, threatens, or intimidates others', 'Starts physical fights',
  'Lies to get out of trouble or to avoid obligations (ie, “cons” others)',
  'Is truant from school (skips school) without permission', 'Is physically cruel to people',
  'Has stolen things that have value', 'Deliberately destroys others’ property',
  'Has used a weapon that can cause serious harm (bat, knife, brick, gun)', 'Is physically cruel to animals',
  'Has deliberately set fires to cause damage', 'Has broken into someone else’s home, business, or car',
  'Has stayed out at night without permission', 'Has run away from home overnight',
  'Has forced someone into sexual activity', 'Is fearful, anxious, or worried',
  'Is afraid to try new things for fear of making mistakes', 'Feels worthless or inferior',
  'Blames self for problems, feels guilty', 'Feels lonely, unwanted, or unloved; complains that “no one loves him or her”',
  'Is sad, unhappy, or depressed', 'Is self-conscious or easily embarrassed'
];
const performance = ['Overall school performance', 'Reading', 'Writing', 'Mathematics',
  'Relationship with parents', 'Relationship with siblings', 'Relationship with peers',
  'Participation in organized activities (eg, teams)'];
const sideEffects = ['Headache', 'Stomachache', 'Change of appetite—explain below', 'Trouble sleeping',
  'Irritability in the late morning, late afternoon, or evening—explain below',
  'Socially withdrawn—decreased interaction with others', 'Extreme sadness or unusual crying',
  'Dull, tired, listless behavior', 'Tremors/feeling shaky',
  'Repetitive movements, tics, jerking, twitching, eye blinking—explain below',
  'Picking at skin or fingers, nail biting, lip or cheek chewing—explain below', 'Sees or hears things that aren’t there'];

export const additionalOutcomeMeasures = [false, true].map(followUp => instrument(
  followUp ? 'vanderbilt-parent-follow-up' : 'nichq-vanderbilt-assessment-scale-parent-informant-vadrs',
  `Vanderbilt · Parent ${followUp ? 'follow-up' : 'initial'}`, 'ADHD',
  'Each rating should be considered in the context of what is appropriate for the age of your child. '
    + (followUp ? 'Please think about your child’s behaviors since the last assessment scale was filled out when rating his/her behaviors.'
      : 'When completing this form, please think about your child’s behaviors in the past 6 months.'),
  [
    { key: 'informant', label: 'Reporting parent or guardian’s name or consistent identifier', type: 'text', helper: 'Use the same name or identifier each time so your care team can compare reports from the same person.' },
    { key: 'medication', label: 'Is this evaluation based on a time when the child was on medication, was not on medication, or you are not sure?', type: 'radio', options: choices(['On medication', 'Not on medication', 'Not sure']) },
    ...questions(followUp ? vanderbiltSymptoms : [...vanderbiltSymptoms, ...initialSymptoms], choices(['Never', 'Occasionally', 'Often', 'Very Often']), 'q', { section: 'Symptoms' }),
    ...performance.map((label, index) => ({ key: `p${index + 1}`, label: `${(followUp ? 19 : 48) + index}. ${label}`, type: 'radio', section: 'Performance', options: choices(['Excellent', 'Above Average', 'Average', 'Somewhat of a Problem', 'Problematic'], 1) })),
    ...(followUp ? questions(sideEffects, choices(['None', 'Mild', 'Moderate', 'Severe']), 'side', { section: 'Side effects or problems in the past week' }) : []),
    { key: 'comments', label: 'Explain / Comments', type: 'text', optional: true }
  ], {
    respondent: 'caregiver', instrumentVersion: `NICHQ Vanderbilt, 2002 first edition, parent ${followUp ? 'follow-up, revised March 2003' : 'initial, revised November 2002'}`,
    population: 'Children ages 6–12; parent or guardian report', timeframe: followUp ? 'Since the last assessment; side effects in the past week' : 'Past 6 months',
    summary: followUp ? 'Repeat the 18 ADHD symptoms and eight performance ratings. Includes medication context and side effects.' : 'Initial ADHD symptom and performance assessment, with associated behavioral and emotional symptoms.',
    scoreRange: 'ADHD symptoms 0–54; average performance 1–5',
    comparisonFamily: 'vanderbilt-parent', comparisonVersion: 'nichq-2002-parent-core', phase: followUp ? 'follow_up' : 'initial',
    totalLabel: 'ADHD symptom score', averageLabel: 'Average performance', averageMax: 5
  }
));

additionalOutcomeMeasures.push(instrument('asrs', 'ASRS-v1.1 · Adult ADHD six-question screener', 'ADHD',
  'Please answer the questions below, rating yourself on each of the criteria shown, choosing the answer that best describes how you have felt and conducted yourself over the past 6 months.',
  questions([
    'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?',
    'How often do you have difficulty getting things in order when you have to do a task that requires organization?',
    'How often do you have problems remembering appointments or obligations?',
    'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?',
    'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?',
    'How often do you feel overly active and compelled to do things, like you were driven by a motor?'
  ], choices(['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'])).map((item, index) => ({
    ...item, options: item.options.map(option => ({ ...option, shaded: Number(option.value) >= (index < 3 ? 2 : 3) }))
  })), {
    instrumentVersion: 'ASRS-v1.1 six-question screener, original shaded-response scoring',
    population: 'Adults ages 18 and older; self-report', timeframe: 'Past 6 months', scoreRange: '0–6 shaded responses',
    summary: 'Original six-question adult ADHD screen. Four or more shaded responses indicate a need for further evaluation.', totalLabel: 'Shaded response count'
  }
));

additionalOutcomeMeasures.push(instrument('rses', 'RSES · Rosenberg self-esteem', 'Self-esteem',
  'Below is a list of statements dealing with your general feelings about yourself. Please indicate how strongly you agree or disagree with each statement.',
  questions([
    'I feel that I am a person of worth, at least on an equal plane with others.', 'I feel that I have a number of good qualities.',
    'All in all, I am inclined to feel that I am a failure.', 'I am able to do things as well as most other people.',
    'I feel I do not have much to be proud of.', 'I take a positive attitude toward myself.',
    'On the whole, I am satisfied with myself.', 'I wish I could have more respect for myself.',
    'I certainly feel useless at times.', 'At times I think I am no good at all.'
  ], choices(['Strongly agree', 'Agree', 'Disagree', 'Strongly disagree'])), {
    instrumentVersion: 'Rosenberg Self-Esteem Scale, original 10-item order, 0–30 scoring',
    population: 'Adolescents and adults; self-report', timeframe: 'General feelings about yourself', scoreRange: '0–30',
    summary: 'Ten self-esteem statements. Higher scores indicate higher reported self-esteem.'
  }
));

const depression = buildPhq9Fields().map(item => item.label);
const phqItems = [
  ...questions(['Stomach pain', 'Back pain', 'Pain in your arms, legs, or joints (knees, hips, etc.)',
    'Menstrual cramps or other problems with your periods', 'Pain or problems during sexual intercourse', 'Headaches',
    'Chest pain', 'Dizziness', 'Fainting spells', 'Feeling your heart pound or race', 'Shortness of breath',
    'Constipation, loose bowels, or diarrhea', 'Nausea, gas, or indigestion'], choices(['Not bothered', 'Bothered a little', 'Bothered a lot']), 's', { section: '1. Physical symptoms · Past 4 weeks' }),
  ...questions(depression, frequency, 'd', { section: '2. Depression symptoms · Past 2 weeks' }),
  { key: 'panic1', label: 'In the last 4 weeks, have you had an anxiety attack—suddenly feeling fear or panic?', type: 'radio', options: yesNo, section: '3. Questions about anxiety' },
  ...questions(['Has this ever happened before?', 'Do some of these attacks come suddenly out of the blue—that is, in situations where you don’t expect to be nervous or uncomfortable?',
    'Do these attacks bother you a lot or are you worried about having another attack?'], yesNo, 'panicFollow', { section: '3. Questions about anxiety', when: [{ key: 'panic1', equals: '1' }] }),
  ...questions(['Were you short of breath?', 'Did your heart race, pound, or skip?', 'Did you have chest pain or pressure?', 'Did you sweat?',
    'Did you feel as if you were choking?', 'Did you have hot flashes or chills?', 'Did you have nausea or an upset stomach, or the feeling that you were going to have diarrhea?',
    'Did you feel dizzy, unsteady, or faint?', 'Did you have tingling or numbness in parts of your body?', 'Did you tremble or shake?', 'Were you afraid you were dying?'],
    yesNo, 'attack', { section: '4. Think about your last bad anxiety attack', when: [{ key: 'panic1', equals: '1' }] }),
  { key: 'anxiety1', label: 'Feeling nervous, anxious, on edge, or worrying a lot about different things.', type: 'radio', options: choices(['Not at all', 'Several days', 'More than half the days']), section: '5. Anxiety symptoms · Past 4 weeks' },
  ...questions(['Feeling restless so that it is hard to sit still.', 'Getting tired very easily.', 'Muscle tension, aches, or soreness.', 'Trouble falling asleep or staying asleep.',
    'Trouble concentrating on things, such as reading a book or watching TV.', 'Becoming easily annoyed or irritable.'], choices(['Not at all', 'Several days', 'More than half the days']), 'anxietyFollow',
    { section: '5. Anxiety symptoms · Past 4 weeks', when: [{ key: 'anxiety1', positive: true }] }),
  ...questions(['Do you often feel that you can’t control what or how much you eat?', 'Do you often eat, within any 2-hour period, what most people would regard as an unusually large amount of food?'], yesNo, 'eating', { section: '6. Questions about eating' }),
  { key: 'eatingFrequency', label: 'Has this been as often, on average, as twice a week for the last 3 months?', type: 'radio', options: yesNo, section: '6. Questions about eating', when: [{ key: 'eating1', equals: '1' }, { key: 'eating2', equals: '1' }] },
  ...questions(['Made yourself vomit?', 'Took more than twice the recommended dose of laxatives?', 'Fasted—not eaten anything at all for at least 24 hours?',
    'Exercised for more than an hour specifically to avoid gaining weight after binge eating?'], yesNo, 'compensatory', {
    section: '7. In the last 3 months have you often done any of the following in order to avoid gaining weight?', when: [{ key: 'eating1', equals: '1' }, { key: 'eating2', equals: '1' }]
  }),
  { key: 'compensatoryFrequency', label: 'If you checked YES to any of these ways of avoiding gaining weight, were any as often, on average, as twice a week?', type: 'radio', options: yesNo, section: '8. Frequency', when: [{ any: ['compensatory1', 'compensatory2', 'compensatory3', 'compensatory4'], equals: '1' }] },
  { key: 'drinking', label: 'Do you ever drink alcohol (including beer or wine)?', type: 'radio', options: yesNo, section: '9. Alcohol' },
  ...questions(['You drank alcohol even though a doctor suggested that you stop drinking because of a problem with your health.',
    'You drank alcohol, were high from alcohol, or hung over while you were working, going to school, or taking care of children or other responsibilities.',
    'You missed or were late for work, school, or other activities because you were drinking or hung over.',
    'You had a problem getting along with other people while you were drinking.', 'You drove a car after having several drinks or after drinking too much.'],
    yesNo, 'alcohol', { section: '10. Have any of the following happened to you more than once in the last 6 months?', when: [{ key: 'drinking', equals: '1' }] }),
  { key: 'difficulty', label: 'If you checked off any problems on this questionnaire, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?', type: 'radio', optional: true, options: choices(['Not difficult at all', 'Somewhat difficult', 'Very difficult', 'Extremely difficult']), section: '11. Functioning' }
];
additionalOutcomeMeasures.push(instrument('phq', 'PHQ · Full Patient Health Questionnaire', 'Depression, anxiety and related symptoms',
  'This questionnaire is an important part of providing you with the best health care possible. Your answers will help in understanding problems that you may have. Please answer every question to the best of your ability unless you are requested to skip over a question.', phqItems, {
    instrumentVersion: 'PHQ full, English, three-page questionnaire', population: 'Adults; self-report',
    timeframe: 'Module-specific periods of 2 weeks to 6 months', scoreRange: 'Separate module results', safetyItemKey: 'd9',
    summary: 'Physical symptoms, depression, anxiety and panic, eating, alcohol, and functioning. Follow-up questions appear as needed.'
  }
));

// Short forms retain their own versions and scores even when sharing source items.
for (const [id, title, labels, domain, range] of [
  ['phq-2', 'PHQ-2 · Brief depression screen', depression.slice(0, 2), 'Depression', '0–6'],
  ['phq-8', 'PHQ-8 · Depression symptoms', depression.slice(0, 8), 'Depression', '0–24'],
  ['gad-2', 'GAD-2 · Brief anxiety screen', ['Feeling nervous, anxious, or on edge', 'Not being able to stop or control worrying'], 'Anxiety', '0–6'],
  ['phq-4', 'PHQ-4 · Brief depression and anxiety screen', ['Feeling nervous, anxious, or on edge', 'Not being able to stop or control worrying', ...depression.slice(0, 2)], 'Depression and anxiety', '0–12']
]) additionalOutcomeMeasures.push(instrument(id, title, domain,
  'Over the last 2 weeks, how often have you been bothered by the following problems?', questions(labels, frequency), {
    instrumentVersion: `${id.toUpperCase()}, English`, population: 'Adolescents and adults; self-report, clinician selects for clinical fit',
    timeframe: 'Past 2 weeks', scoreRange: range, summary: `${labels.length} symptom questions using the published ${id.toUpperCase()} scoring.`
  }
));

const teenSymptoms = [
  'Feeling down, depressed, irritable, or hopeless?', 'Little interest or pleasure in doing things?',
  'Trouble falling asleep, staying asleep, or sleeping too much?', 'Poor appetite, weight loss, or overeating?',
  'Feeling tired, or having little energy?', 'Feeling bad about yourself—or feeling that you are a failure, or that you have let yourself or your family down?',
  'Trouble concentrating on things like school work, reading, or watching TV?',
  'Moving or speaking so slowly that other people could have noticed? Or the opposite—being so fidgety or restless that you were moving around a lot more than usual?',
  'Thoughts that you would be better off dead, or of hurting yourself in some way?'
];
const parentSymptoms = [
  'Feeling down, depressed, irritable or hopeless?', 'Little interest or pleasure in doing things?',
  'Trouble falling asleep, staying asleep, or sleeping too much?', 'Poor appetite, weight loss, or over-eating?',
  'Feeling tired, or having little energy?', 'Feeling bad about him/herself—feeling like a failure, or that he/she has let him/herself or the family down?',
  'Trouble concentrating on things like school work, reading, or watching TV?',
  'Moving or speaking so slowly that other people could have noticed? Or the opposite—being so fidgety or restless that he/she was moving around a lot more than usual?',
  'Thoughts that he/she would be better off dead, or of hurting him/herself in some way?'
];
for (const parent of [false, true]) additionalOutcomeMeasures.push(instrument(
  parent ? 'phq-9-parent' : 'phq-9-modified-teens', parent ? 'PHQ-9 · Parent report' : 'PHQ-9 · Modified for teens', 'Depression',
  parent ? 'How often has your child been bothered by each of the following symptoms during the past 2 weeks? For each symptom, choose the answer that best describes how your child has been feeling.'
    : 'How often have you been bothered by each of the following symptoms during the past two weeks? For each symptom, choose the answer that best describes how you have been feeling.',
  [
    ...(parent ? [{ key: 'informant', label: 'Reporting parent or guardian’s name or consistent identifier', type: 'text' }] : []),
    ...questions(parent ? parentSymptoms : teenSymptoms, frequency),
    { key: 'past_year', label: parent ? 'In the past year, has he/she felt depressed or sad most days, even if he/she felt okay sometimes?' : 'In the past year have you felt depressed or sad most days, even if you felt okay sometimes?', type: 'radio', options: yesNo },
    { key: 'difficulty', label: parent ? 'If he/she is experiencing any of the problems on this form, how difficult have these problems made it for him/her to do work, take care of things at home, or get along with other people?' : 'If you are experiencing any of the problems on this form, how difficult have these problems made it for you to do your work, take care of things at home or get along with other people?', type: 'radio', options: choices(['Not difficult at all', 'Somewhat difficult', 'Very difficult', 'Extremely difficult']) },
    { key: 'past_month', label: parent ? 'Has there been a time in the past month when he/she has had serious thoughts about ending his/her life?' : 'Has there been a time in the past month when you have had serious thoughts about ending your life?', type: 'radio', options: yesNo },
    { key: 'lifetime_attempt', label: parent ? 'Has he/she ever, in his/her whole life, tried to kill him/herself or made a suicide attempt?' : 'Have you ever, in your whole life, tried to kill yourself or made a suicide attempt?', type: 'radio', options: yesNo }
  ], {
    respondent: parent ? 'caregiver' : 'self', population: parent ? 'Adolescent depression · Parent or guardian report about the child; not a self-report' : 'Ages 12–18 · Adolescent self-report',
    instrumentVersion: parent ? 'Dartmouth-Hitchcock PHQ-9 Parent Report, 9 symptoms plus 4 supplementary questions' : 'GLAD-PC PHQ-9 Modified for Teens, 9 symptoms plus 4 supplementary questions',
    timeframe: 'Symptoms: past 2 weeks; supplementary questions: past year, past month and lifetime', scoreRange: '0–27; supplementary questions scored separately',
    safetyItemKey: 'q9', safetyYesKeys: ['past_month', 'lifetime_attempt'],
    summary: parent ? 'Published parent adaptation. Descriptive symptom total; parent and youth reports remain separate.' : 'Teen wording with irritability and schoolwork, plus functioning, mood history and safety follow-up questions.'
  }
));

const teenPhq = additionalOutcomeMeasures.find(measure => measure.id === 'phq-9-modified-teens');
additionalOutcomeMeasures.push({
  ...teenPhq, id: 'phq-9-adolescent', title: 'PHQ-9 · Adolescent report (11+)',
  population: 'Youth ages 11 and older · Adolescent self-report',
  instrumentVersion: 'Dartmouth-Hitchcock PHQ-9 Adolescent Report, 9 symptoms plus 4 supplementary questions',
  summary: 'Adolescent report published by Dartmouth-Hitchcock and New Hampshire DHHS. Includes mood history, functioning and safety follow-up questions.'
});
