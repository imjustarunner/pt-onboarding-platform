import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { referenceSource, referenceMetadata, referenceAllowed, referenceCatalogFor } from '../companyReferenceContent.js';
import { trainingDefinitionsFor, requiredTrainingKeys, trainingMatchesEdition, validateTrainingDefinition, gradeDocumentQuiz, learnerDefinition } from '../documentTrainingContent.js';
import { handbookAnswerSources, answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
import { getHandbookSource } from '../workplaceHandbookContent.js';

const key = 'skill-development-guide';
const book = slug => { const s = referenceSource({ slug }, key); return { metadata: referenceMetadata(s), sections: s.sections, version: { id: 77, version_number: 1, is_draft: 0 } }; };
const definition = slug => trainingDefinitionsFor({ slug }).find(d => d.documentKey === key);
describe('skills editions, program boundaries and curriculum fidelity', () => {
  it.each(['itsco', 'nlu'])('%s gets one company-specific library and training edition', slug => {
    const b = book(slug), d = definition(slug);
    expect(referenceCatalogFor({ slug }).filter(d => d.key === key)).toHaveLength(1);
    expect(trainingDefinitionsFor({ slug }).filter(d => d.documentKey === key)).toHaveLength(1);
    expect(b.metadata).toMatchObject({ title: 'Skill Development & Learning Guide', coverTitle: ['Skills in', 'practice.'], learningPurpose: 'orientation' });
    expect(b.sections).toHaveLength(slug === 'itsco' ? 18 : 19);
    expect(requiredTrainingKeys({ slug }, { role: 'facilitator' })).toContain(key);
    expect(requiredTrainingKeys({ slug }, { role: 'staff', sees_clients: false })).not.toContain(key);
    expect(trainingMatchesEdition(d, b)).toBe(true);
    expect(validateTrainingDefinition(d, b).questions).toHaveLength(8);
    expect(gradeDocumentQuiz(d, d.questions.map(q => q.correctAnswer))).toMatchObject({ passed: true, score: 100 });
    expect(learnerDefinition(d).questions[0]).not.toHaveProperty('correctAnswer');
    const changed = structuredClone(b);
    changed.sections.find(s => s.slug === 'program-boundaries').body_html += '<p>Changed attendance rule.</p>';
    expect(trainingMatchesEdition(d, changed)).toBe(false);
    const handbook = getHandbookSource({ slug }, { employeeTemplates: [] });
    for (const s of b.sections) {
      for (const m of s.body_html.matchAll(/href="#skill-development-guide-([a-z0-9-]+)"/g)) expect(b.sections.some(s => s.slug === m[1])).toBe(true);
      for (const m of s.body_html.matchAll(/href="\/workplace-handbook#handbook-([a-z0-9-]+)"/g)) expect(handbook.sections.some(s => s.slug === m[1])).toBe(true);
    }
    expect(handbookAnswerSources(b).find(s => s.slug === 'quick-reference').links).toContain('program-boundaries');
  });
  it('uses different attendance questions and hashes for the same document key', () => {
    expect(definition('nlu').questions.find(q => q.id === 'program').prompt).toContain('Only one client');
    expect(definition('itsco').questions.find(q => q.id === 'program').prompt).toContain('new ITSCO group');
    expect(trainingMatchesEdition(definition('itsco'), book('nlu'))).toBe(false);
    expect(trainingMatchesEdition(definition('nlu'), book('itsco'))).toBe(false);
    const nlu = book('nlu').sections.find(s => s.slug === 'program-boundaries').body_html;
    expect(nlu).toContain('three clients'); expect(nlu).toContain('two or more attending');
    expect(nlu).toContain('separately agreed self-pay'); expect(nlu).toContain('does not currently provide individual skills services through insurance');
    const itsco = book('itsco').sections.find(s => s.slug === 'program-boundaries').body_html;
    expect(itsco).toContain('current group moratorium'); expect(itsco).toContain('twelve 90-minute');
    expect(itsco).not.toContain('three clients');
  });
  it.each(['tisi', 'other'])('does not leak a skills program into %s even with a package or misleading name', slug => {
    const agency = { slug, name: 'ITSCO' };
    expect(referenceAllowed(agency, key)).toBe(false);
    expect(referenceSource(agency, key, { packageAssigned: true })).toBeNull();
    expect(trainingDefinitionsFor(agency).some(d => d.documentKey === key)).toBe(false);
  });
  it('preserves role, scope, privacy, service separation and competency limits', () => {
    const s = Object.fromEntries(book('nlu').sections.map(s => [s.slug, s.body_html]));
    expect(s['facilitator-scope']).toContain('not counselors or therapists');
    expect(s['facilitator-scope']).toContain('express, documented approval');
    expect(s['facilitator-scope']).toContain('at least two years in the field');
    expect(s['service-separation']).toContain('non-overlapping'); expect(s['service-separation']).toContain('does not enable an automatic split claim');
    expect(s['group-privacy']).toContain('cannot guarantee'); expect(s['precepting']).toContain('not independent clinical practice');
    expect(s['co-regulation']).toContain('not punishment'); expect(s['planning-and-notes']).toContain('do not prefill');
    expect(s['skills-orientation']).toContain('supervisor- or administrator-assigned');
    expect(s['safety-and-emergencies']).not.toContain('ITSCO');
    expect(s['safety-and-emergencies']).toContain('does not replace a required external report');
  });
  it('uses the website’s verified evidence summaries without claiming a T+T trial', () => {
    const evidence = JSON.parse(readFileSync(new URL('../../../../frontend/src/content/learning-support-evidence.json', import.meta.url), 'utf8'));
    const section = book('nlu').sections.find(s => s.slug === 'research-and-rationale').body_html;
    for (const study of evidence.studies) expect(section).toContain(study.url);
    expect(section).toContain('did not evaluate NLU'); expect(section).toContain('11 reported positive'); expect(section).toContain('two found no effect');
    expect(section).not.toContain('0.37');
  });
});
describe('source-grounded skills answers (local fixtures)', () => {
  const result = value => ({ text: JSON.stringify(value), finishReason: 'STOP' });
  it.each(['itsco', 'nlu'])('includes company boundaries even when the router selects only examples: %s', async slug => {
    const model = vi.fn().mockResolvedValueOnce(result({ slugs: ['practice-examples'] })).mockResolvedValueOnce(result({ status: 'answered', paragraphs: [{ text: 'The examples require the approved plan and appropriate scope.', citations: [{ slug: 'practice-examples', passageId: 'p1' }] }] })).mockResolvedValueOnce(result({ supported: true }));
    const response = await answerFromHandbook({ handbook: book(slug), question: 'Can I run these activities?' }, { model });
    const call = model.mock.calls[1][0];
    expect(JSON.parse(call.prompt).sources.map(s => s.slug)).toEqual(expect.arrayContaining(['skills-orientation', 'program-boundaries', 'facilitator-scope', 'service-separation', 'practice-examples']));
    expect(call.systemInstruction).toContain('not a trial of the agency');
    expect(response.paragraphs[0].citations[0].quote).toContain('approved plan');
  });
});
