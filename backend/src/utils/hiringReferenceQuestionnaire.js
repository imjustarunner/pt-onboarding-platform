export const referenceQuestionnaire = {
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

export function normalizeReferenceAnswers(body) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const referenceName = String(body?.referenceName || '').trim().slice(0, 255);
  if (!referenceName) fail('Please enter the reference’s name.');
  const relationshipType = String(body?.relationshipType || '');
  if (!['manager', 'coworker', 'direct_report', 'other'].includes(relationshipType)) fail('Please select your relationship to the applicant.');
  const relationshipOther = String(body?.relationshipOther || '').trim().slice(0, 500);
  if (relationshipType === 'other' && !relationshipOther) fail('Please describe your relationship.');
  const wouldHire = String(body?.wouldHire || '');
  if (!['yes', 'with_reservations', 'no', 'unable_to_assess'].includes(wouldHire)) fail('Please answer whether you would hire this person.');
  const traits = {};
  for (const { key, label } of referenceQuestionnaire.traits) {
    const raw = body?.traits?.[key];
    if (raw === 'not_observed') traits[key] = raw;
    else if ([1, 2, 3, 4, 5, '1', '2', '3', '4', '5'].includes(raw)) traits[key] = Number(raw);
    else fail(`Please rate ${label} from 1 to 5 or select Not observed.`);
  }
  return { questionnaireVersion: 2, referenceName, relationshipType, relationshipOther: relationshipType === 'other' ? relationshipOther : null,
    wouldHire, traits, hireReason: String(body?.hireReason || '').trim().slice(0, 4000),
    additionalComments: String(body?.additionalComments || '').trim().slice(0, 8000),
    submittedAt: new Date().toISOString() };
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
