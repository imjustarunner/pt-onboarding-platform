import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { requiredTrainingKeys, trainingDefinitionsFor } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'caseload-management-sop';
describe('caseload management resource', () => {
  it.each(['itsco','nlu','tisi'])('%s has an indexed resource without onboarding or quizzes', slug => {
    const source = referenceSource({ slug }, key);
    expect(source.sections).toHaveLength(12); expect(source.learningPurpose).toBe('reference-only');
    expect(referenceCatalogFor({ slug }).some(d => d.key === key)).toBe(true);
    expect(trainingDefinitionsFor({ slug }).some(d => d.documentKey === key)).toBe(false);
    for (const role of ['provider','intern','facilitator','staff']) expect(requiredTrainingKeys({ slug }, { role }, true)).not.toContain(key);
    expect(referenceMetadata(source).coverTitle[0]).toBe('Care in focus.');
    const text = source.sections.map(s => s.body_html).join(' ');
    expect(text).not.toMatch(/Thriveworks|TherapyNotes|Sara or Patrick/);
    expect(text).toContain('not a delivered clinical service');
    expect(text).toContain('not establish a universal legal 30-day rule');
    expect(text).toContain('not adopted by this resource');
  });
  it('keeps service boundaries separate by company', () => {
    const body = slug => referenceSource({ slug }, key).sections.find(s => s.slug === 'company-caseload-context').body_html;
    expect(body('itsco')).toContain('school-practice-guide'); expect(body('itsco')).toContain('moratorium');
    expect(body('nlu')).toContain('two or more actual attendees'); expect(body('nlu')).not.toContain('school');
    expect(body('nlu')).toContain('individual H2014 service may proceed');
    expect(body('tisi')).toContain('counseling-only'); expect(body('tisi')).not.toContain('school');
    expect(referenceSource({ slug: 'unknown' }, key, { packageAssigned: true })).toBeNull();
  });
  it('always supplies closure and billing limits to Q&A', async () => {
    const s = referenceSource({ slug: 'itsco' }, key), response = data => ({ text: JSON.stringify(data), finishReason: 'STOP' });
    const model = vi.fn().mockResolvedValueOnce(response({ slugs: ['missed-visits'] })).mockResolvedValueOnce(response({ status: 'not_found', paragraphs: [], clarification: null }));
    await answerFromHandbook({ handbook: { metadata: referenceMetadata(s), sections: s.sections, version: { id: 1 } }, question: 'Can I close a case after three no-shows?' }, { model });
    expect(model.mock.calls[1][0].systemInstruction).toContain('not an onboarding course');
    expect(JSON.parse(model.mock.calls[1][0].prompt).sources.map(s => s.slug)).toEqual(expect.arrayContaining(['transfer-and-closure','outreach-and-billing','company-caseload-context','missed-visits']));
  });
});
