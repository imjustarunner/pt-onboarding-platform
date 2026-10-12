import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { handbookTenant } from './handbookTenant.js';
import { referenceAllowed } from './companyReferenceContent.js';
import { needsClinicalProfile } from '../utils/hireClinicalProfile.js';
import { isBachelorsCredentialText } from '../utils/credentialNormalization.js';

// Register a guide's learning definition here once. Library, onboarding,
// Plotline/My Learning and on-demand all consume this same catalog.
export const documentTrainingDefinitions = ['provider-guide', 'school-practice-guide', 'counseling-guide', 'skill-development-guide-itsco', 'skill-development-guide-nlu', 'facilities-guide-itsco', 'facilities-guide-nlu', 'facilities-guide-isi', 'crisis-response-guide-itsco', 'crisis-response-guide-nlu', 'crisis-response-guide-isi', 'facilitator-coding-protocol-itsco', 'facilitator-coding-protocol-nlu', 'facilitator-coding-protocol-isi', 'service-documentation-standards-itsco', 'service-documentation-standards-nlu', 'service-documentation-standards-isi', 'mandated-reporting-sop-itsco', 'mandated-reporting-sop-nlu', 'mandated-reporting-sop-isi'].map(key =>
  JSON.parse(readFileSync(new URL(`../content/document-training/${key}.json`, import.meta.url), 'utf8')));
export const trainingHash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export const trainingDefinitionsFor = agency => documentTrainingDefinitions.filter(d => (d.tenants.includes('*') || d.tenants.includes(handbookTenant(agency))) && referenceAllowed(agency, d.documentKey));
export function expectedSchoolWork(agency, user, preference) {
  if (handbookTenant(agency) !== 'itsco') return false;
  return preference == null ? needsClinicalProfile({ ...user, role: user?.agency_role || user?.role }) : [true, 1, '1'].includes(preference);
}
// Training assignment only, never credentialing or permission to render/bill.
// Company membership overrides the global role; users.credential is synced
// from the provider_credential profile field by UserInfoValue.
export function needsFacilitatorProtocol(user) {
  const role = String(user?.agency_role || user?.role || '').trim().toLowerCase();
  if (['client', 'guardian', 'family', 'child', 'school_staff', 'tutor', 'qbha', 'clinical_practice_assistant', 'intern', 'intern_plus'].includes(role)) return false;
  if (role === 'facilitator') return true;
  if (!needsClinicalProfile({ ...user, role })) return false;
  const title = String(user?.agency_position || user?.title || '').trim().toLowerCase();
  if (['facilitator', 'mental health facilitator', 'skill development facilitator'].includes(title)) return true;
  const credential = String(user?.credential || '').replace(/\./g, '').trim();
  // An undergraduate degree listed alongside a graduate/clinical credential
  // must not enroll a licensed provider or graduate trainee by accident.
  if (/\b(LPC|LPCC|LCSW|LSW|SWC|LMFT|MFTC|LAC|CAS|PSYD|PHD|EDD|MA|MS|MSW|MED|INTERN|QBHA)\b|master|doctor|candidate|\blicensed\b|psychologist/i.test(credential)) return false;
  return isBachelorsCredentialText(credential);
}
export function requiredTrainingKeys(agency, user, preference) {
  user = { ...user, role: user?.agency_role || user?.role };
  const school = expectedSchoolWork(agency, user, preference);
  const staff = ['staff', 'support', 'admin', 'assistant_admin', 'super_admin', 'superadmin', 'clinical_director', 'provider', 'provider_plus', 'intern', 'intern_plus', 'facilitator', 'supervisor'].includes(String(user?.role || '').toLowerCase()) || needsClinicalProfile(user);
  return trainingDefinitionsFor(agency).filter(d => (!d.onboardingTenants || d.onboardingTenants.includes(handbookTenant(agency))) && (d.onboardingAudience === 'workforce' ? staff || ['tutor', 'qbha', 'clinical_practice_assistant'].includes(String(user?.role || '').toLowerCase()) : d.onboardingAudience === 'clinical-only' ? needsClinicalProfile(user) : d.onboardingAudience === 'facilitator' ? needsFacilitatorProtocol(user) : d.onboardingAudience === 'staff' ? staff : d.onboardingAudience === 'school' ? school : needsClinicalProfile(user) || school)).map(d => d.documentKey);
}
export function validateTrainingDefinition(input, book) {
  const sections = new Map((book?.sections || []).filter(s => s.content_status === 'ready' && s.body_html).map(s => [s.slug, s]));
  if (!input || !Array.isArray(input.requiredSections) || !input.requiredSections.length || input.requiredSections.length > 100 || input.requiredSections.some(s => !sections.has(s))) fail('Choose published reading sections.');
  if (!Array.isArray(input.questions) || input.questions.length < 3 || input.questions.length > 12) fail('Provide between three and twelve questions.');
  const ids = new Set();
  const questions = input.questions.map(q => {
    if (!q || typeof q !== 'object') fail('Provide a valid question.');
    if (!/^[a-z0-9-]{1,80}$/.test(q.id || '') || ids.has(q.id)) fail('Question identities must be unique.');
    ids.add(q.id);
    if (typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 1500 || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 1200)) fail('Provide a question and two to six answer choices.');
    if (!Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer >= q.options.length || !sections.has(q.sourceSlug) || typeof q.explanation !== 'string' || !q.explanation.trim() || q.explanation.length > 3000) fail('Each question needs a correct answer, explanation and published source section.');
    return { id: q.id, prompt: q.prompt.trim(), options: q.options.map(o => o.trim()), correctAnswer: q.correctAnswer, explanation: q.explanation.trim(), sourceSlug: q.sourceSlug };
  });
  const requiredSections = [...new Set(input.requiredSections)];
  const slugs = [...new Set([...requiredSections, ...questions.map(q => q.sourceSlug)])];
  return { title: String(input.title || book.metadata?.title || 'Guide training').slice(0, 250), description: String(input.description || '').slice(0, 1500), requiredSections, questions, passingScore: 100,
    sectionHashes: Object.fromEntries(slugs.map(slug => [slug, trainingHash(sections.get(slug).body_html)])) };
}
export function trainingMatchesEdition(definition, book) {
  return !!definition?.sectionHashes && Object.entries(definition.sectionHashes).every(([slug, hash]) => {
    const section = book?.sections.find(s => s.slug === slug);
    return section?.content_status === 'ready' && trainingHash(section.body_html) === hash;
  });
}
export function trainingTemplateForEdition(template, book) {
  const {previousEditions, ...current} = template;
  return [current, ...(previousEditions || [])].find(definition => trainingMatchesEdition(definition, book)) || current;
}
export const learnerDefinition = definition => ({ ...definition, betaBook: undefined, sectionHashes: undefined, previousEditions: undefined, questions: definition.questions.map(({ id, prompt, options }) => ({ id, prompt, options })) });
export function gradeDocumentQuiz(definition, answers) {
  if (!Array.isArray(answers) || answers.length !== definition.questions.length || answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= definition.questions[i].options.length)) fail('Answer every question before submitting.');
  const feedback = definition.questions.map((q, i) => ({ id: q.id, correct: answers[i] === q.correctAnswer, correctAnswer: q.correctAnswer, explanation: q.explanation, sourceSlug: q.sourceSlug }));
  const score = Math.round(feedback.filter(f => f.correct).length / feedback.length * 100);
  return { score, passed: feedback.every(f => f.correct), feedback };
}
export function validateTrainingHeartbeat(input) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(input?.sessionId || '') || !Number.isSafeInteger(input.sequence) || input.sequence < 1 || typeof input.active !== 'boolean') fail('Invalid training activity heartbeat.');
  return { sessionId: input.sessionId, sequence: input.sequence, active: input.active };
}
export function trainingCreditSeconds(row, input, now) {
  const elapsed = (new Date(now) - new Date(row?.seen_at)) / 1000;
  return row?.session_id === input.sessionId && input.sequence > Number(row.sequence_number) && row.active && input.active && elapsed > 0 && elapsed <= 45 ? Math.min(30, Math.floor(elapsed)) : 0;
}
