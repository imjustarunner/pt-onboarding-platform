import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { requiredTrainingKeys, trainingDefinitionsFor, trainingMatchesEdition, gradeDocumentQuiz } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'mandated-reporting-sop';
describe('mandated reporting editions and onboarding', () => {
  it.each(['itsco', 'nlu', 'tisi'])('%s has required staff learning, a source-matched quiz and Library access', slug => {
    const agency = { slug }, source = referenceSource(agency, key), definition = trainingDefinitionsFor(agency).find(d => d.documentKey === key);
    expect(referenceCatalogFor(agency).some(d => d.key === key)).toBe(true);
    expect(source.sections).toHaveLength(slug === 'itsco' ? 13 : 12);
    expect(definition.questions).toHaveLength(slug === 'itsco' ? 10 : 9);
    expect(trainingMatchesEdition(definition, source)).toBe(true);
    expect(gradeDocumentQuiz(definition, definition.questions.map(q => q.correctAnswer))).toMatchObject({ passed: true, score: 100 });
    for (const role of ['staff', 'admin', 'provider', 'intern', 'facilitator', 'supervisor', 'tutor']) expect(requiredTrainingKeys(agency, { role }, false)).toContain(key);
    for (const role of ['client', 'guardian', 'family']) expect(requiredTrainingKeys(agency, { role }, false)).not.toContain(key);
    const changed = structuredClone(source); changed.sections.find(s => s.slug === 'child-reporting-duty').body_html += '<p>Changed reporting rule.</p>';
    expect(trainingMatchesEdition(definition, changed)).toBe(false);
    expect(source.sections.some(s => s.slug === 'itsco-school-reporting')).toBe(slug === 'itsco');
    if (slug !== 'itsco') expect(JSON.stringify(source.sections)).not.toMatch(/School Practice Guide|principal|district permission/);
  });
  it('replaces unsafe source shortcuts while preserving factual documentation', () => {
    const sections = Object.fromEntries(referenceSource({ slug: 'itsco' }, key).sections.map(s => [s.slug, s.body_html]));
    expect(sections['child-reporting-duty']).toContain('within 24 hours');
    expect(sections['child-reporting-duty']).toContain('must not delay');
    expect(sections['third-party-information']).toContain('Do not warn or confront');
    expect(sections['recognize-without-investigating']).toContain('Do not conduct an investigation');
    expect(sections['billing-and-work-time']).toContain('does not automatically');
    expect(sections['documentation']).toContain('Do not infer');
    expect(sections['adult-reporting-route']).toContain('exception');
    expect(referenceSource({ slug: 'unrelated' }, key, { packageAssigned: true })).toBeNull();
  });
  it('keeps the reporting and safety conditions in Q&A context', async () => {
    const source = referenceSource({ slug: 'nlu' }, key);
    const result = value => ({ text: JSON.stringify(value), finishReason: 'STOP' });
    const model = vi.fn().mockResolvedValueOnce(result({ slugs: ['make-and-confirm-report'] })).mockResolvedValueOnce(result({ status: 'not_found', paragraphs: [], clarification: null }));
    await answerFromHandbook({ handbook: { ...source, metadata: referenceMetadata(source), version: { id: 1 } }, question: 'What if someone says they already reported?' }, { model });
    expect(model.mock.calls[1][0].systemInstruction).toContain('not a reporting channel');
    const context = JSON.parse(model.mock.calls[1][0].prompt).sources.map(s => s.slug);
    expect(context).toEqual(expect.arrayContaining(['child-reporting-duty', 'adult-reporting-route', 'third-party-information', 'billing-and-work-time']));
    expect(context).not.toContain('itsco-school-reporting');
  });
});
