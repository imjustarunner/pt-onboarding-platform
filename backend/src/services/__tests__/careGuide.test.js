import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { handbookAnswerSources, rankHandbookSources, answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
import { requiredTrainingKeys, documentTrainingDefinitions, trainingMatchesEdition } from '../documentTrainingContent.js';
import { getHandbookSource } from '../workplaceHandbookContent.js';
import { FACILITATOR_SCOPE_SLUG } from '../careGuideScope.js';

const key = 'counseling-guide';
const book = slug => { const source = referenceSource({ slug }, key); return { metadata: referenceMetadata(source), sections: source.sections, version: { id: 45, version_number: 1, is_draft: 0 } }; };
describe('shared care guide, scoped company editions', () => {
  it.each(['itsco', 'nlu', 'tisi'])('makes %s searchable, linked and trainable without borrowing another company edition', slug => {
    const b = book(slug), sources = handbookAnswerSources(b);
    expect(b.sections).toHaveLength(41);
    expect(b.metadata).toMatchObject({ documentKey: key, learningPurpose: 'orientation', coverTitle: ['Care', 'approaches.'] });
    expect(rankHandbookSources(sources, 'H0004')).toEqual(expect.arrayContaining([expect.objectContaining({ source: expect.objectContaining({ slug: 'h0004-service' }) })]));
    expect(trainingMatchesEdition(documentTrainingDefinitions.find(d => d.documentKey === key), b)).toBe(true);
    expect(requiredTrainingKeys({ slug }, { role: 'facilitator' })).toContain(key);
    for (const section of b.sections) for (const match of section.body_html.matchAll(/href="#counseling-guide-([^"]+)"/g)) expect(b.sections.some(s => s.slug === match[1])).toBe(true);
    const context = b.sections.find(s => s.slug === 'company-care-context').body_html;
    expect(context).toContain(slug === 'itsco' ? 'ITSCO' : slug === 'nlu' ? 'Next Level Up' : 'Inner Strength Institute');
    if (slug !== 'itsco') expect(context).not.toContain('ITSCO');
    if (slug === 'nlu') expect(context).toContain('actual clinical and self-pay tutoring portions separately');
    if (slug === 'tisi') expect(context).toContain('counseling-only');
  });
  it('requires company setup for a licensed package, without forcing Colorado onboarding on every tenant', () => {
    const agency = { slug: 'cedar', name: 'Cedar <img onerror="alert(1)"> Care' };
    expect(referenceSource(agency, key)).toBeNull();
    const source = referenceSource(agency, key, { packageAssigned: true });
    expect(source.requiredSections[0].prompt).toContain('whether the Colorado');
    expect(source.sections.find(s => s.slug === 'company-care-context')).toMatchObject({ content_status: 'pending', body_html: '' });
    expect(source.presentation.theme).toBe('company-foundations');
    expect(JSON.stringify(source)).not.toMatch(/ITSCO|Next Level Up|Inner Strength|<img|onerror/);
    expect(requiredTrainingKeys(agency, { role: 'facilitator' })).not.toContain(key);
    expect(referenceCatalogFor(agency).map(d => d.key)).toContain(key);
    source.sections[0].body_html = 'changed';
    expect(referenceSource(agency, key, { packageAssigned: true }).sections[0].body_html).not.toBe('changed');
  });
  it('keeps key clinical qualifications with the relevant technique and billing text', () => {
    const bySlug = Object.fromEntries(book('itsco').sections.map(s => [s.slug, s.body_html]));
    expect(bySlug['facilitator-scope']).toContain('express, documented approval');
    expect(bySlug['licensed-oversight']).toContain('at least two years in the field');
    expect(bySlug['licensed-oversight']).toContain('different requirements');
    expect(bySlug['cognitive-approaches']).toContain('not a protocol');
    expect(bySlug['rbt-comparison']).toContain('course alone does not make someone an RBT');
    expect(bySlug['h0004-service']).toContain('not a guarantee of coverage');
    expect(bySlug['consent-and-privacy']).toContain('blanket “12 and older means confidential” wording must not be used');
    expect(bySlug['required-reporting']).toContain('within 24 hours');
  });
  it.each(['itsco', 'nlu', 'tisi'])('reconciles %s handbook and provider reference with exact updater destinations', slug => {
    const h = getHandbookSource({ slug }, { employeeTemplates: [] });
    expect(h.sections.filter(s => s.slug === FACILITATOR_SCOPE_SLUG)).toHaveLength(1);
    expect(h.sections.some(s => s.body_html.includes('Bachelor’s-Level Mental Health Counselors'))).toBe(false);
    expect(h.sections.find(s => s.slug === FACILITATOR_SCOPE_SLUG).body_html).toContain('at least two years in the field');
    expect(h.reviewUpdates.at(-1)).toMatchObject({ status: 'draft', handbook_section_slug: FACILITATOR_SCOPE_SLUG, policy_section_slugs: [FACILITATOR_SCOPE_SLUG] });
    expect(referenceSource({ slug }, 'provider-guide').sections.at(-1).body_html).toContain(`#handbook-${FACILITATOR_SCOPE_SLUG}`);
    expect(book(slug).sections.find(s => s.slug === 'care-orientation').body_html).toContain('/workplace-handbook');
  });
});

describe('care-guide Q&A boundaries (local model fixtures; no external AI)', () => {
  const result = data => ({ text: JSON.stringify(data), finishReason: 'STOP' });
  it.each([
    ['itsco', 'Can I use CBT after passing?', 'cognitive-approaches'],
    ['nlu', 'Can tutoring be H0004?', 'h0004-service'],
    ['tisi', 'Does the 40-hour RBT course qualify me?', 'rbt-comparison']
  ])('includes source scope and oversight even when routing selects only a technique: %s', async (slug, question, section) => {
    const b = book(slug);
    const model = vi.fn().mockResolvedValueOnce(result({ slugs: [section] })).mockResolvedValueOnce(result({ status: 'answered', paragraphs: [{ text: 'Reading this guide does not authorize clinical practice.', citations: [{ slug: 'care-orientation', passageId: 'p1' }] }] })).mockResolvedValueOnce(result({ supported: true }));
    const answer = await answerFromHandbook({ handbook: b, question }, { model });
    expect(answer.status).toBe('answered');
    const request = model.mock.calls[1][0], evidence = JSON.parse(request.prompt).sources;
    expect(request.systemInstruction).toContain('supervisor permission cannot expand lawful scope');
    expect(evidence.map(s => s.slug)).toEqual(expect.arrayContaining([section, 'care-orientation', 'facilitator-scope', 'licensed-oversight', 'company-care-context']));
    expect(answer.paragraphs[0].citations[0].quote).toContain('not authorization to practice');
    expect(answer.version.id).toBe(45);
  });
});
