import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { requiredTrainingKeys, trainingDefinitionsFor } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'group-psychotherapy-sop';
describe('group psychotherapy resource', () => {
  it.each(['itsco', 'nlu', 'tisi'])('%s has an indexed reference, never a training assignment', slug => {
    const source = referenceSource({ slug }, key);
    expect(source.sections).toHaveLength(12);
    expect(source.learningPurpose).toBe('reference-only');
    expect(referenceCatalogFor({ slug }).some(d => d.key === key)).toBe(true);
    expect(trainingDefinitionsFor({ slug }).some(d => d.documentKey === key)).toBe(false);
    for (const role of ['provider', 'intern', 'facilitator', 'supervisor']) expect(requiredTrainingKeys({ slug }, { role }, true)).not.toContain(key);
    expect(referenceMetadata(source).coverTitle).toEqual(['Group', 'psychotherapy.']);
    expect(source.sections.some(s => s.slug === 'participant-documentation')).toBe(true);
  });
  it('preserves the moratorium, service boundaries, and the original workflow', () => {
    const body = slug => referenceSource({ slug }, key).sections.map(s => s.body_html).join(' ');
    expect(body('itsco')).toContain('moratorium');
    expect(body('nlu')).toContain('do not authorize 90853');
    expect(body('tisi')).toContain('counseling-only');
    expect(body('itsco')).toContain('do not bill a group encounter or automatically convert');
    expect(body('itsco')).toContain('insurer-name list is retired');
    expect(body('itsco')).not.toMatch(/In therapy notes|billing@|Google Form/);
    expect(referenceSource({ slug: 'unrelated' }, key, { packageAssigned: true })).toBeNull();
  });
  it('includes group restrictions in grounded Q&A even for a focused attendance question', async () => {
    const source = referenceSource({ slug: 'itsco' }, key);
    const response = data => ({ text: JSON.stringify(data), finishReason: 'STOP' });
    const model = vi.fn().mockResolvedValueOnce(response({ slugs: ['attendance-and-scheduling'] }))
      .mockResolvedValueOnce(response({ status: 'not_found', paragraphs: [], clarification: null }));
    await answerFromHandbook({ handbook: { metadata: referenceMetadata(source), sections: source.sections, version: { id: 1 } }, question: 'What if only one person arrives?' }, { model });
    expect(model.mock.calls[1][0].systemInstruction).toContain('not an onboarding course');
    expect(JSON.parse(model.mock.calls[1][0].prompt).sources.map(s => s.slug)).toEqual(expect.arrayContaining(['company-group-approval', 'coverage-and-fees', 'attendance-and-scheduling']));
  });
});
