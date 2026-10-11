import { describe, it, expect } from 'vitest';
import { referenceSource } from '../companyReferenceContent.js';
import { documentTrainingDefinitions as definitions, trainingDefinitionsFor, expectedSchoolWork, requiredTrainingKeys, validateTrainingDefinition, trainingMatchesEdition, learnerDefinition, gradeDocumentQuiz, validateTrainingHeartbeat, trainingCreditSeconds } from '../documentTrainingContent.js';
const itsco = { slug: 'itsco' }, provider = { role: 'provider', status: 'ONBOARDING' };
describe('company guide training defaults and source fidelity', () => {
  it('defaults clinical guides for ITSCO; school opt-out removes only school practice', () => {
    expect(expectedSchoolWork(itsco, provider)).toBe(true);
    expect(requiredTrainingKeys(itsco, provider)).toEqual(['provider-guide', 'school-practice-guide', 'counseling-guide', 'skill-development-guide', 'facilities-guide', 'crisis-response-guide', 'service-documentation-standards', 'mandated-reporting-sop']);
    expect(requiredTrainingKeys(itsco, provider, false)).toEqual(['provider-guide', 'counseling-guide', 'skill-development-guide', 'facilities-guide', 'crisis-response-guide', 'service-documentation-standards', 'mandated-reporting-sop']);
    expect(requiredTrainingKeys(itsco, { role: 'staff', sees_clients: false })).toEqual(['facilities-guide', 'crisis-response-guide', 'mandated-reporting-sop']);
    expect(requiredTrainingKeys(itsco, { role: 'staff', sees_clients: false }, true)).toEqual(['provider-guide', 'school-practice-guide', 'counseling-guide', 'skill-development-guide', 'facilities-guide', 'crisis-response-guide', 'mandated-reporting-sop']);
  });
  it.each(['nlu', 'tisi', 'other'])('does not copy ITSCO school training into %s', slug => {
    expect(trainingDefinitionsFor({ slug, name: 'ITSCO' }).map(d => d.documentKey)).toEqual(slug === 'nlu' ? ['counseling-guide', 'skill-development-guide', 'facilities-guide', 'crisis-response-guide', 'facilitator-coding-protocol', 'service-documentation-standards', 'mandated-reporting-sop'] : slug === 'tisi' ? ['counseling-guide', 'facilities-guide', 'crisis-response-guide', 'facilitator-coding-protocol', 'service-documentation-standards', 'mandated-reporting-sop'] : ['counseling-guide']);
    expect(requiredTrainingKeys({ slug }, provider, true)).toEqual(slug === 'other' ? [] : slug === 'nlu' ? ['counseling-guide', 'skill-development-guide', 'facilities-guide', 'crisis-response-guide', 'service-documentation-standards', 'mandated-reporting-sop'] : ['counseling-guide', 'facilities-guide', 'crisis-response-guide', 'service-documentation-standards', 'mandated-reporting-sop']);
  });
  it.each(definitions.map(d => [d.documentKey, d]))('%s has supported questions and complete source references', (key, definition) => {
    const book = referenceSource(definition.tenants.length === 1 && definition.tenants[0] === 'isi' ? { slug: 'tisi' } : definition.tenants.includes('nlu') && !definition.tenants.includes('itsco') ? { slug: 'nlu' } : itsco, key); const valid = validateTrainingDefinition(definition, book);
    expect(valid.questions).toHaveLength(key === 'mandated-reporting-sop' ? (definition.tenants.includes('itsco') ? 10 : 9) : ['facilitator-coding-protocol', 'service-documentation-standards', 'mandated-reporting-sop'].includes(key) ? 9 : key === 'facilities-guide' ? 6 : ['skill-development-guide', 'crisis-response-guide'].includes(key) ? 8 : key === 'counseling-guide' ? 7 : 5); expect(trainingMatchesEdition(valid, book)).toBe(true);
    expect(trainingMatchesEdition(definition, book)).toBe(true);
    const publicDefinition = learnerDefinition(valid);
    expect(publicDefinition.questions[0]).not.toHaveProperty('correctAnswer');
    expect(publicDefinition.questions[0]).not.toHaveProperty('explanation');
    const changed = structuredClone(book); changed.sections.find(s => s.slug === definition.requiredSections[0]).body_html += '<p>Changed.</p>';
    expect(trainingMatchesEdition(definition, changed)).toBe(false);
    changed.sections = changed.sections.filter(s => s.slug !== definition.questions[0].sourceSlug);
    expect(() => validateTrainingDefinition(definition, changed)).toThrow('published');
  });
  it('requires every correct answer and returns useful linked feedback on failure', () => {
    const d = definitions[0], correct = d.questions.map(q => q.correctAnswer);
    expect(gradeDocumentQuiz(d, correct)).toMatchObject({ passed: true, score: 100 });
    correct[0] = (correct[0] + 1) % d.questions[0].options.length;
    expect(gradeDocumentQuiz(d, correct)).toMatchObject({ passed: false, score: 80, feedback: expect.arrayContaining([expect.objectContaining({ correct: false, sourceSlug: d.questions[0].sourceSlug })]) });
    expect(() => gradeDocumentQuiz(d, [1])).toThrow('every question');
    expect(() => gradeDocumentQuiz(d, d.questions.map(() => '0'))).toThrow('every question');
  });
  it('rejects malformed questions, missing source, and invalid answer keys without a server error', () => {
    const book = referenceSource(itsco, 'provider-guide');
    for (const change of [q => { q.explanation = 7; }, q => { q.correctAnswer = 12; }, q => { q.sourceSlug = 'missing'; }]) {
      const d = structuredClone(definitions[0]); change(d.questions[0]); expect(() => validateTrainingDefinition(d, book)).toThrow('Each question');
    }
    expect(() => validateTrainingDefinition({ ...definitions[0], questions: [null, null, null] }, book)).toThrow('valid question');
  });
});
describe('active paid time boundary', () => {
  const input = { sessionId: 'abcdefghijklmnop', sequence: 2, active: true };
  const row = { session_id: input.sessionId, sequence_number: 1, active: true, seen_at: '2026-10-10T12:00:00Z' };
  it('uses observed server intervals, never a supplied duration', () => {
    expect(trainingCreditSeconds(row, { ...input, durationSeconds: 9999 }, '2026-10-10T12:00:15Z')).toBe(15);
    expect(trainingCreditSeconds(row, input, '2026-10-10T12:00:40Z')).toBe(30);
  });
  it.each([{ active: false }, { sequence: 1 }, { sessionId: 'different-session' }])('does not credit idle, replay or another tab: %j', patch => expect(trainingCreditSeconds(row, { ...input, ...patch }, '2026-10-10T12:00:15Z')).toBe(0));
  it('does not credit reconnect gaps or reversed clocks', () => {
    expect(trainingCreditSeconds(row, input, '2026-10-10T12:05:00Z')).toBe(0);
    expect(trainingCreditSeconds(row, input, '2026-10-10T11:59:00Z')).toBe(0);
    expect(() => validateTrainingHeartbeat({ durationSeconds: 9999 })).toThrow('Invalid');
  });
});
