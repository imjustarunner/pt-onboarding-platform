import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { requiredTrainingKeys, trainingDefinitionsFor } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'clinical-note-aid-guide';
describe('clinical note aid companion', () => {
  it.each(['itsco', 'nlu', 'tisi'])('offers %s a resource without mandated learning or source case records', slug => {
    const source = referenceSource({ slug }, key);
    expect(source.sections).toHaveLength(15);
    expect(source.learningPurpose).toBe('reference-only');
    expect(referenceCatalogFor({ slug }).some(d => d.key === key)).toBe(true);
    expect(trainingDefinitionsFor({ slug }).some(d => d.documentKey === key)).toBe(false);
    expect(requiredTrainingKeys({ slug }, { role: 'provider' }, true)).not.toContain(key);
    const text = source.sections.map(s => s.body_html).join(' ');
    expect(text).not.toMatch(/Emily|LPCC\.0017912|7\/25\/2022|stalking behaviors/);
    expect(text).toContain('not a complete reproduction');
    expect(text).toContain('Missing data');
    expect(referenceMetadata(source).coverTitle).toHaveLength(2);
  });
  it('keeps company boundaries and unsupported companies separate', () => {
    const body = slug => referenceSource({ slug }, key).sections.find(s => s.slug === 'company-care-context').body_html;
    expect(body('itsco')).toContain('moratorium');
    expect(body('nlu')).toContain('nonoverlapping time');
    expect(body('tisi')).toContain('counseling-only');
    expect(referenceSource({ slug: 'other' }, key, { packageAssigned: true })).toBeNull();
  });
  it('retrieves scope and factual-writing limits even for a narrow example question', async () => {
    const source = referenceSource({ slug: 'itsco' }, key);
    const response = data => ({ text: JSON.stringify(data), finishReason: 'STOP' });
    const model = vi.fn().mockResolvedValueOnce(response({ slugs: ['fictional-examples'] })).mockResolvedValueOnce(response({ status: 'not_found', paragraphs: [], clarification: null }));
    await answerFromHandbook({ handbook: { metadata: referenceMetadata(source), sections: source.sections, version: { id: 1 } }, question: 'Can I copy an example into a note?' }, { model });
    expect(model.mock.calls[1][0].systemInstruction).toContain('Never invent client facts');
    expect(JSON.parse(model.mock.calls[1][0].prompt).sources.map(s => s.slug)).toEqual(expect.arrayContaining(['scope-and-evidence','ai-and-review','billing-and-policy','fictional-examples']));
  });
});
