export const legacyReferenceQuestionnaire = {
  version: 2,
  scale: '1 = consistently falls short, 2 = needs frequent support, 3 = meets expectations, 4 = often exceeds expectations, 5 = consistently excels. Choose “Not observed” if you cannot assess a trait.',
  traits: [
    { key: 'trustworthy', label: 'Trustworthy', question: 'How reliably does this person act honestly and keep commitments?', example: 'For example: handles confidential information appropriately and follows through on promises.' },
    { key: 'independent', label: 'Independent', question: 'How well does this person work independently and seek help when appropriate?', example: 'For example: completes routine work without repeated direction and escalates unfamiliar issues.' },
    { key: 'organized', label: 'Organized', question: 'How well does this person plan work and manage responsibilities?', example: 'For example: meets deadlines, keeps accurate records, and follows up on outstanding tasks.' },
    { key: 'capable', label: 'Capable', question: 'How effectively does this person perform the work expected of them?', example: 'For example: applies relevant skills, exercises sound judgment, and produces dependable work.' },
    { key: 'selfMotivated', label: 'Self-motivated', question: 'How consistently does this person take initiative and stay engaged?', example: 'For example: identifies useful next steps and pursues improvement without repeated prompting.' }
  ]
};

export const referenceQuestionnaire = {
  version: 3,
  scale: 'Select a rating from 1 (Needs improvement) to 5 (Excellent). Choose Not observed if you cannot assess an area.',
  traits: [
    { key: 'reliability', label: 'Reliability & dependability', question: 'How would you rate their reliability and dependability?', example: '' },
    { key: 'communication', label: 'Communication', question: 'How would you rate their communication?', example: '' },
    { key: 'teamwork', label: 'Teamwork & collaboration', question: 'How would you rate their teamwork and collaboration?', example: '' },
    { key: 'professionalism', label: 'Professionalism & judgment', question: 'How would you rate their professionalism and judgment?', example: '' }
  ]
};

export function normalizeReferenceQuestionnaire(value = referenceQuestionnaire) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!value || !Array.isArray(value.traits) || value.traits.length < 1 || value.traits.length > 12) fail('Provide between 1 and 12 rating questions.');
  const keys = new Set();
  const traits = value.traits.map(trait => {
    const key = String(trait?.key || '');
    const label = String(trait?.label || '').trim();
    const question = String(trait?.question || '').trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || keys.has(key)) fail('Each rating needs a unique question key.');
    if (!label || label.length > 120 || !question || question.length > 1000) fail('Each rating needs a title and a question of up to 1000 characters.');
    keys.add(key);
    return { key, label, question, example: String(trait.example || '').trim().slice(0, 1000) };
  });
  const extra = value.questions || [];
  if (!Array.isArray(extra) || extra.length > 10) fail('Use up to 10 written questions.');
  const questions = extra.map(question => {
    const key = String(question?.key || '');
    const label = String(question?.label || '').trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || keys.has(key) || !label || label.length > 1000) fail('Each written question needs a unique key and a question.');
    keys.add(key);
    return { key, label, required: question.required === true };
  });
  const version = value.version === 3 ? 3 : 2;
  return { version, scale: version === 3 ? referenceQuestionnaire.scale : legacyReferenceQuestionnaire.scale, traits, questions };
}

export function normalizeReferenceAnswers(body, questionnaire = referenceQuestionnaire) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const referenceName = String(body?.referenceName || '').trim().slice(0, 255);
  if (!referenceName) fail('Please enter the reference’s name.');
  const relationshipType = String(body?.relationshipType || '');
  if (!['manager', 'coworker', 'direct_report', 'other'].includes(relationshipType)) fail('Please select your relationship to the applicant.');
  const relationshipOther = String(body?.relationshipOther || '').trim().slice(0, 500);
  if (relationshipType === 'other' && !relationshipOther) fail('Please describe your relationship.');
  const current = questionnaire.version === 3;
  const relationshipDuration = String(body?.relationshipDuration || '');
  const strengths = String(body?.strengths || '').trim();
  if (current && !['under_1_year', '1_2_years', '3_5_years', 'over_5_years'].includes(relationshipDuration)) fail('Please select how long you have known the applicant.');
  if (current && (!strengths || strengths.length > 4000)) fail('Please describe their professional strengths in 4000 characters or fewer.');
  const wouldHire = String(body?.wouldHire || '');
  if (!(current && !wouldHire) && !['yes', 'with_reservations', 'no', 'unable_to_assess'].includes(wouldHire)) fail('Please answer whether you would hire this person.');
  const traits = {};
  for (const { key, label } of questionnaire.traits) {
    const raw = body?.traits?.[key];
    if (raw === 'not_observed') traits[key] = raw;
    else if ([1, 2, 3, 4, 5, '1', '2', '3', '4', '5'].includes(raw)) traits[key] = Number(raw);
    else fail(`Please rate ${label} from 1 to 5 or select Not observed.`);
  }
  const customAnswers = {};
  for (const question of questionnaire.questions || []) {
    const answer = String(body?.customAnswers?.[question.key] || '').trim();
    if (answer.length > 4000) fail('Written answers must be 4000 characters or fewer.');
    if (question.required && !answer) fail(`Please answer: ${question.label}`);
    customAnswers[question.key] = answer;
  }
  return {
    questionnaireVersion: questionnaire.version,
    questionnaireSnapshot: questionnaire,
    relationshipDuration: current ? relationshipDuration : null,
    strengths: current ? strengths : null,
    developmentAreas: current ? String(body?.developmentAreas || '').trim().slice(0, 4000) : null,
    customAnswers,
    referenceName,
    relationshipType,
    relationshipOther: relationshipType === 'other' ? relationshipOther : null,
    wouldHire,
    traits,
    hireReason: String(body?.hireReason || '').trim().slice(0, 4000),
    additionalComments: String(body?.additionalComments || '').trim().slice(0, 8000),
    submittedAt: new Date().toISOString()
  };
}

// Business days are Monday–Friday; preserve the time and avoid local DST shifts.
export function referenceDeadline(start = new Date(), days = 5) {
  const date = new Date(start);
  for (let remaining = days; remaining > 0;) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) remaining -= 1;
  }
  return date;
}
