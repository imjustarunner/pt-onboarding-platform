// Instrument text is versioned clinical content, never company-editable prose.
// Rights and source evidence: outcomeMeasureRights.json. English versions only.
import { getNluLearningMeasure } from './nluLearningMeasures.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildPhq9Fields, buildGad7Fields } from './validatedClinicalScreens.en.js';

export const measureRights = JSON.parse(readFileSync(new URL('./outcomeMeasureRights.json', import.meta.url), 'utf8'));
const options = (labels, start = 0) => labels.map((label, i) => ({ value: String(i + start), label }));
const yesNo = options(['No', 'Yes']);
const frequency = options(['Not at all', 'Several days', 'More than half the days', 'Nearly every day']);
const fields = (texts, choices, extra = {}) => texts.map((label, i) => ({ key: `q${i + 1}`, label, type: 'radio', options: choices, ...extra }));
const base = (id, title, domain, instructions, items, extra = {}) => ({ id, title, domain, language: 'en',
  population: 'Adults; clinician selects for clinical fit', instructions, items, ...extra });
const impairment = { key: 'difficulty', label: 'If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?', type: 'radio', optional: true, options: options(['Not difficult at all', 'Somewhat difficult', 'Very difficult', 'Extremely difficult']) };
const twoWeeks = 'Over the last 2 weeks, how often have you been bothered by the following problems?';

const measures = [
  base('phq-9', 'PHQ-9 · Depression symptoms', 'Depression', twoWeeks,
    [...fields(buildPhq9Fields().map(f => f.label), frequency), impairment],
    { instrumentVersion: 'PHQ-9, English', summary: 'Nine symptom items and an unscored functioning question. Item 9 requires direct clinical follow-up when endorsed.', scoreRange: '0–27', timeframe: 'Past 2 weeks' }),
  base('gad-7', 'GAD-7 · Anxiety symptoms', 'Anxiety', twoWeeks,
    [...fields(buildGad7Fields().map(f => f.label), frequency), impairment],
    { instrumentVersion: 'GAD-7, English', summary: 'Seven anxiety symptom items and an unscored functioning question.', scoreRange: '0–21', timeframe: 'Past 2 weeks' }),
  base('pcl-5', 'PCL-5 · PTSD symptoms', 'Trauma', 'Below is a list of problems that people sometimes have in response to a very stressful experience. Keeping your worst event in mind, please read each problem carefully and then select one of the numbers to indicate how much you have been bothered by that problem in the past month.',
    [{ key: 'worst_event', label: 'Your worst event:', type: 'text', optional: true }, ...fields([
      'Repeated, disturbing, and unwanted memories of the stressful experience?',
      'Repeated, disturbing dreams of the stressful experience?',
      'Suddenly feeling or acting as if the stressful experience were actually happening again (as if you were actually back there reliving it)?',
      'Feeling very upset when something reminded you of the stressful experience?',
      'Having strong physical reactions when something reminded you of the stressful experience (for example, heart pounding, trouble breathing, sweating)?',
      'Avoiding memories, thoughts, or feelings related to the stressful experience?',
      'Avoiding external reminders of the stressful experience (for example, people, places, conversations, activities, objects, or situations)?',
      'Trouble remembering important parts of the stressful experience?',
      'Having strong negative beliefs about yourself, other people, or the world (for example, having thoughts such as: I am bad, there is something seriously wrong with me, no one can be trusted, the world is completely dangerous)?',
      'Blaming yourself or someone else for the stressful experience or what happened after it?',
      'Having strong negative feelings such as fear, horror, anger, guilt, or shame?',
      'Loss of interest in activities that you used to enjoy?',
      'Feeling distant or cut off from other people?',
      'Trouble experiencing positive feelings (for example, being unable to feel happiness or have loving feelings for people close to you)?',
      'Irritable behavior, angry outbursts, or acting aggressively?',
      'Taking too many risks or doing things that could cause you harm?',
      'Being “superalert” or watchful or on guard?',
      'Feeling jumpy or easily startled?',
      'Having difficulty concentrating?',
      'Trouble falling or staying asleep?'
    ], options(['Not at all', 'A little bit', 'Moderately', 'Quite a bit', 'Extremely']))],
    { instrumentVersion: 'PCL-5 Standard, 29 August 2023', summary: '20 symptoms linked to a stressful event. Total and symptom cluster scores; no automated PTSD diagnosis.', scoreRange: '0–80', timeframe: 'Past month' }),
  base('lec-5', 'LEC-5 · Life events', 'Trauma', 'Listed below are a number of difficult or stressful things that sometimes happen to people. For each event check one or more of the boxes to indicate that: (a) it happened to you personally; (b) you witnessed it happen to someone else; (c) you learned about it happening to a close family member or close friend; (d) you were exposed to it as part of your job (for example, paramedic, police, military, or other first responder); (e) you’re not sure if it fits; or (f) it doesn’t apply to you. Be sure to consider your entire life (growing up as well as adulthood) as you go through the list of events.', fields([
    'Natural disaster (for example, flood, hurricane, tornado, earthquake)', 'Fire or explosion',
    'Transportation accident (for example, car accident, boat accident, train wreck, plane crash)',
    'Serious accident at work, home, or during recreational activity',
    'Exposure to toxic substance (for example, dangerous chemicals, radiation)',
    'Physical assault (for example, being attacked, hit, slapped, kicked, beaten up)',
    'Assault with a weapon (for example, being shot, stabbed, threatened with a knife, gun, bomb)',
    'Sexual assault (rape, attempted rape, made to perform any type of sexual act through force or threat of harm)',
    'Other unwanted or uncomfortable sexual experience',
    'Combat or exposure to a war-zone (in the military or as a civilian)',
    'Captivity (for example, being kidnapped, abducted, held hostage, prisoner of war)',
    'Life-threatening illness or injury', 'Severe human suffering',
    'Sudden violent death (for example, homicide, suicide)', 'Sudden accidental death',
    'Serious injury, harm, or death you caused to someone else', 'Any other very stressful event or experience'
  ], options(['Happened to me', 'Witnessed it', 'Learned about it', 'Part of my job', 'Not sure', 'Doesn’t apply']), { type: 'checkboxes' }),
  { instrumentVersion: 'LEC-5 Standard, 12 April 2018', summary: '17 types of lifetime events, with multiple exposure types. An exposure inventory, not a severity score or progress scale.', scoreRange: 'No total score', timeframe: 'Lifetime' }),
  base('des-b', 'DES-B · Dissociative symptoms', 'Dissociation', 'For each statement below, please check the box that best answers each question to show how much each thing has happened to you in the past SEVEN (7) DAYS.', fields([
    'I find myself staring into space and thinking of nothing.', 'People, objects, or the world around me seem strange or unreal.',
    'I find that I did things that I do not remember doing.', 'When I am alone, I talk out loud to myself.',
    'I feel as though I were looking at the world through a fog so that people and things seem far away or unclear.',
    'I am able to ignore pain.', 'I act so differently from one situation to another that it is almost as if I were two different people.',
    'I can do things very easily that would usually be hard for me.'
  ], options(['Not at all', 'Once or twice', 'Almost every day', 'About once a day', 'More than once a day'])),
  { instrumentVersion: 'DES-B Modified for DSM-5, adult', summary: 'Eight symptom items for adults with dissociative symptoms. Total and average; partial results explicitly identify prorating.', scoreRange: '0–32; average 0–4', timeframe: 'Past 7 days' }),
  base('aware', 'AWARE · Relapse warning signs', 'Recovery', 'Please read the following statements and for each one select a number, from 1 to 7, to indicate how much this has been true for you recently. Please select one and only one number for every statement.', fields([
    'I feel nervous or unsure of my ability to stay sober.', 'I have many problems in my life.', 'I tend to overreact or act impulsively.',
    'I keep to myself and feel lonely.', 'I get too focused on one area of my life.', 'I feel blue, down, listless, or depressed.',
    'I engage in wishful thinking.', 'The plans that I make succeed.', 'I have trouble concentrating and prefer to dream about how things could be.',
    'Things don’t work out well for me.', 'I feel confused.', 'I get irritated or annoyed with my friends.', 'I feel angry or frustrated.',
    'I have good eating habits.', 'I feel trapped and stuck, like there is no way out.', 'I have trouble sleeping.',
    'I have long periods of serious depression.', 'I don’t really care what happens.', 'I feel like things are so bad that I might as well drink.',
    'I am able to think clearly.', 'I feel sorry for myself.', 'I think about drinking.', 'I lie to other people.',
    'I feel hopeful and confident.', 'I feel angry at the world in general.', 'I am doing things to stay sober.',
    'I am afraid that I am losing my mind.', 'I am drinking out of control.'
  ], options(['Never', 'Rarely', 'Sometimes', 'Fairly often', 'Often', 'Almost always', 'Always'], 1)),
  { instrumentVersion: 'AWARE 3.0, 28 items', summary: 'Alcohol relapse warning signs. Five items reverse-scored. Higher scores indicate more warning signs; no personalized relapse probability is calculated.', scoreRange: '28–196', timeframe: 'Recently' }),
  base('cage-aid', 'CAGE-AID · Alcohol and drug use', 'Substance use', 'When thinking about drug use, include illegal drug use and the use of prescription drugs other than prescribed. Answer about your lifetime.', fields([
    'Have you ever felt that you ought to cut down on your drinking or drug use?',
    'Have people annoyed you by criticizing your drinking or drug use?',
    'Have you ever felt bad or guilty about your drinking or drug use?',
    'Have you ever had a drink or used drugs first thing in the morning to steady your nerves or to get rid of a hangover (eye opener)?'
  ], yesNo), { instrumentVersion: 'CAGE-AID, 4-item lifetime', summary: 'Brief lifetime screen. One or more yes responses calls for further assessment; not a treatment progress scale.', scoreRange: '0–4', timeframe: 'Lifetime' }),
  base('ftnd', 'FTND · Cigarette dependence', 'Substance use', 'Select one answer to each question about cigarette smoking.', [
    { key: 'q1', label: 'How soon after you wake up do you smoke your first cigarette?', type: 'radio', options: [{ value: '3', label: 'Within 5 minutes' }, { value: '2', label: '6–30 minutes' }, { value: '1', label: '31–60 minutes' }, { value: '0', label: 'After 60 minutes' }] },
    { key: 'q2', label: 'Do you find it difficult to refrain from smoking in places where it is forbidden (e.g., in church, at the library, in the cinema)?', type: 'radio', options: yesNo },
    { key: 'q3', label: 'Which cigarette would you hate most to give up?', type: 'radio', options: [{ value: '1', label: 'The first one in the morning' }, { value: '0', label: 'Any other' }] },
    { key: 'q4', label: 'How many cigarettes per day do you smoke?', type: 'radio', options: options(['10 or less', '11–20', '21–30', '31 or more']) },
    { key: 'q5', label: 'Do you smoke more frequently during the first hours after waking than during the rest of the day?', type: 'radio', options: yesNo },
    { key: 'q6', label: 'Do you smoke when you are so ill that you are in bed most of the day?', type: 'radio', options: yesNo }
  ], { instrumentVersion: 'FTND, Heatherton et al. 1991', summary: 'Six questions about cigarette smoking. Do not substitute vaping or other nicotine products into these items.', scoreRange: '0–10', timeframe: 'Current cigarette smoking' })
];

const ftnd = measures.find(m => m.id === 'ftnd');
ftnd.items = [{ key: 'current_smoking', label: 'Do you currently smoke cigarettes?', type: 'radio', options: yesNo, unscored: true },
  ...ftnd.items.map(item => ({ ...item, when: [{ key: 'current_smoking', equals: '1' }] }))];
ftnd.instrumentVersion = 'FTND, Heatherton et al. 1991; CTN form 24 March 2014';

const tapsFrequency = options(['Never', 'Less Than Monthly', 'Monthly', 'Weekly', 'Daily or Almost Daily']);
const tapsItems = [
  { key: 'alcohol_branch', type: 'radio', label: 'Clinician: select the original alcohol question set appropriate for this administration.', options: [{ value: 'female', label: 'Original female question set (4 drinks)' }, { value: 'male', label: 'Original male question set (5 drinks)' }], unscored: true },
  { key: 'tobacco', label: 'In the PAST 12 MONTHS, how often have you used any tobacco product (for example, cigarettes, e-cigarettes, cigars, pipes, or smokeless tobacco)?' },
  ...['female', 'male'].map(sex => ({ key: `alcohol_${sex}`, label: `In the PAST 12 MONTHS, how often have you had ${sex === 'male' ? 5 : 4} or more drinks containing alcohol in one day?`, helper: 'One standard drink is about 1 small glass of wine (5 oz), 1 beer (12 oz), or 1 single shot of liquor.', when: [{ key: 'alcohol_branch', equals: sex }] })),
  { key: 'drugs', label: 'In the PAST 12 MONTHS, how often have you used any drugs including marijuana, cocaine or crack, heroin, methamphetamine (crystal meth), hallucinogens, ecstasy/MDMA?' },
  { key: 'prescription', label: 'In the PAST 12 MONTHS, how often have you used any prescription medications just for the feeling, more than prescribed or that were not prescribed for you? Prescription medications that may be used this way include: Opiate pain relievers (for example, OxyContin, Vicodin, Percocet, Methadone) Medications for anxiety or sleeping (for example, Xanax, Ativan, Klonopin) Medications for ADHD (for example, Adderall or Ritalin)' }
].map(i => ({ type: 'radio', options: tapsFrequency, section: 'Part 1 · Past 12 months', ...i }));

const tapsGroups = [
  ['tobacco', 'tobacco', 'did you smoke a cigarette containing tobacco?', 'did you usually smoke more than 10 cigarettes each day?', 'did you usually smoke within 30 minutes after waking?'],
  ['alcohol', 'alcohol', 'did you have a drink containing alcohol?', 'have you tried and failed to control, cut down or stop drinking?', 'has anyone expressed concern about your drinking?'],
  ['marijuana', 'drugs', 'did you use marijuana (hash, weed)?', 'have you had a strong desire or urge to use marijuana at least once a week or more often?', 'has anyone expressed concern about your use of marijuana?'],
  ['stimulants', 'drugs', 'did you use cocaine, crack, or methamphetamine (crystal meth)?', 'did you use cocaine, crack, or methamphetamine (crystal meth) at least once a week or more often?', 'has anyone expressed concern about your use of cocaine, crack, or methamphetamine (crystal meth)?'],
  ['heroin', 'drugs', 'did you use heroin?', 'have you tried and failed to control, cut down or stop using heroin?', 'has anyone expressed concern about your use of heroin?'],
  ['opioids', 'prescription', 'did you use a prescription opiate pain reliever (for example, Percocet, Vicodin) not as prescribed or that was not prescribed for you?', 'have you tried and failed to control, cut down or stop using an opiate pain reliever?', 'has anyone expressed concern about your use of an opiate pain reliever?'],
  ['sedatives', 'prescription', 'did you use a medication for anxiety or sleep (for example, Xanax, Ativan, or Klonopin) not as prescribed or that was not prescribed for you?', 'have you had a strong desire or urge to use medications for anxiety or sleep at least once a week or more often?', 'has anyone expressed concern about your use of medication for anxiety or sleep?'],
  ['adhd', 'prescription', 'did you use a medication for ADHD (for example, Adderall, Ritalin) not as prescribed or that was not prescribed for you?', 'did you use a medication for ADHD (for example, Adderall, Ritalin) at least once a week or more often?', 'has anyone expressed concern about your use of a medication for ADHD (for example, Adderall or Ritalin)?'],
  ['other', 'drugs', "did you use any other illegal or recreational drug (for example, ecstasy/molly, GHB, poppers, LSD, mushrooms, special K, bath salts, synthetic marijuana ('spice'), whip-its, etc.)?"]
];
for (const [id, parent, ...questions] of tapsGroups) {
  // Alcohol depends on the selected original question; do not infer it from gender identity.
  const parentCondition = parent === 'alcohol' ? { key: '$alcohol', positive: true } : { key: parent, positive: true };
  questions.forEach((label, i) => {
    tapsItems.push({ key: `${id}_${i}`, label: `In the PAST 3 MONTHS, ${label}`, type: 'radio', options: yesNo,
      section: 'Part 2 · Past 3 months', when: [parentCondition, ...(i ? [{ key: `${id}_0`, equals: '1' }] : [])] });
    if (id === 'alcohol' && i === 0) for (const sex of ['female', 'male']) tapsItems.push({ key: `alcohol_binge_${sex}`, label: `In the PAST 3 MONTHS, did you have ${sex === 'male' ? 5 : 4} or more drinks containing alcohol in a day?`, type: 'radio', options: yesNo, section: 'Part 2 · Past 3 months', when: [parentCondition, { key: 'alcohol_0', equals: '1' }, { key: 'alcohol_branch', equals: sex }] });
  });
}
tapsItems.push({ key: 'other_drugs', section: 'Part 2 · Past 3 months', label: 'In the PAST 3 MONTHS, what were the other drug(s) you used?', type: 'text', when: [{ key: 'drugs', positive: true }, { key: 'other_0', equals: '1' }] });
measures.push(base('taps', 'TAPS · Substance use', 'Substance use', 'Part 1 asks about the past 12 months. Follow-up questions in Part 2 ask about the PAST 3 MONTHS ONLY. Select one answer for each question shown.', tapsItems,
  { instrumentVersion: 'TAPS Parts 1 and 2, web 2.0 / 4.00, 19 September 2017', summary: 'A two-stage adult screen with substance-specific follow-up and scores. The clinician selects the appropriate original alcohol questions.', scoreRange: 'Separate substance scores; no combined total', timeframe: '12 months; 3-month follow-up' }));

export const outcomeMeasures = measures.map(m => {
  const rights = measureRights.find(r => r.id === m.id);
  if (rights?.status !== 'enabled') throw new Error(`Missing reuse evidence: ${m.id}`);
  const version = createHash('sha256').update(JSON.stringify({ ...m, scoringVersion: '1.0.0', rights })).digest('hex').slice(0,20);
  return { ...m, version, rights };
});
export const getOutcomeMeasure = id => outcomeMeasures.find(m => m.id === id) || getNluLearningMeasure(id);
