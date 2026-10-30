import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { requiredTrainingKeys, trainingDefinitionsFor, trainingMatchesEdition, gradeDocumentQuiz } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'service-documentation-standards';
const book = slug => { const s = referenceSource({ slug }, key); return { metadata: referenceMetadata(s), sections: s.sections, version: { id: 99, version_number: 1, is_draft: 0 } }; };
describe('documentation standards audience and editions', () => {
  it.each([{ role: 'provider' }, { role: 'intern' }, { role: 'facilitator' }, { role: 'supervisor' }, { role: 'staff', sees_clients: 1 }, { role: 'admin', agency_role: 'provider' }])('defaults clinical onboarding for %j', user => {
    for (const slug of ['itsco', 'nlu', 'tisi']) expect(requiredTrainingKeys({ slug }, user, false)).toContain(key);
  });
  it.each([{ role: 'staff', sees_clients: 0 }, { role: 'admin' }, { role: 'tutor' }, { role: 'client' }, { role: 'provider', agency_role: 'staff', sees_clients: 0 }])('does not assign based on school preference alone: %j', user => {
    expect(requiredTrainingKeys({ slug: 'itsco' }, user, true)).not.toContain(key);
  });
  it.each(['itsco', 'nlu', 'tisi'])('%s has branded, searchable sections and a source-matched quiz', slug => {
    const b = book(slug), d = trainingDefinitionsFor({ slug }).find(d => d.documentKey === key);
    expect(b.sections).toHaveLength(23); expect(d.questions).toHaveLength(9); expect(d.onboardingAudience).toBe('clinical-only');
    expect(referenceCatalogFor({ slug }).filter(d => d.key === key)).toHaveLength(1);
    expect(trainingMatchesEdition(d, b)).toBe(true);
    expect(gradeDocumentQuiz(d, d.questions.map(q => q.correctAnswer))).toMatchObject({ passed: true, score: 100 });
    for (const code of ['H0023', 'H0032', 'T1017', 'H0025', 'H2014', '90791', 'H0004', '90832', '90834', '90837', '90846', '90847', '90853', '90839', '90840', '90785']) expect(b.sections.some(s => s.title.includes(code))).toBe(true);
    for (const s of b.sections) for (const m of s.body_html.matchAll(/href="#service-documentation-standards-([^"]+)"/g)) expect(b.sections.some(s => s.slug === m[1])).toBe(true);
    const changed = structuredClone(b); changed.sections.find(s => s.slug === 'company-documentation-context').body_html += '<p>Changed.</p>';
    expect(trainingMatchesEdition(d, changed)).toBe(false);
    expect(referenceSource({ slug }, 'provider-guide').sections.find(s => s.slug === '6-relationship-to-other-documents').body_html).toContain(`companyDocument=${key}`);
    expect(JSON.stringify(b.sections)).not.toMatch(/TherapyNotes|Google Form/);
  });
  it('preserves company service boundaries without offering the source to another tenant', () => {
    const context = slug => book(slug).sections.find(s => s.slug === 'company-documentation-context').body_html;
    expect(context('itsco')).toContain('moratorium');
    expect(context('nlu')).toContain('two or more'); expect(context('nlu')).toContain('nonoverlapping'); expect(context('nlu')).toContain('individual H2014 service only when actually delivered');
    expect(context('tisi')).toContain('counseling-only');
    expect(referenceSource({ slug: 'other', name: 'ITSCO' }, key, { packageAssigned: true })).toBeNull();
  });
  it('corrects the source shortcuts and preserves accurate work-time records', () => {
    const sections = Object.fromEntries(book('itsco').sections.map(s => [s.slug, s.body_html]));
    expect(sections['mental-status-and-assessment']).toContain('not directly assessed');
    expect(sections['goals-and-progress']).toContain('0 means no distress and 10 means the highest distress');
    expect(sections['case-management-t1017']).toContain('not automatically billable T1017');
    expect(sections['group-90853']).toContain('Do not automatically');
    expect(sections['interactive-complexity-90785']).toContain('interpretation');
    expect(sections['time-and-participants']).toContain('even when a claim is denied');
    expect(sections['review-and-corrections']).toMatch(/backdat/i);
  });
});
describe('documentation Q&A boundaries (local model fixtures)', () => {
  const result = data => ({ text: JSON.stringify(data), finishReason: 'STOP' });
  it('supplies scope and company limits with the selected documentation passage', async () => {
    const model = vi.fn().mockResolvedValueOnce(result({ slugs: ['mental-status-and-assessment'] })).mockResolvedValueOnce(result({ status: 'answered', paragraphs: [{ text: 'If the client was absent, document that they were not directly assessed and identify the collateral source.', citations: [{ slug: 'mental-status-and-assessment', passageId: 'p1' }] }] })).mockResolvedValueOnce(result({ supported: true }));
    const answer = await answerFromHandbook({ handbook: book('nlu'), question: 'What mental status should I record for a caregiver-only visit?' }, { model });
    const call = model.mock.calls[1][0];
    expect(call.systemInstruction).toContain('invent findings');
    expect(JSON.parse(call.prompt).sources.map(s => s.slug)).toEqual(expect.arrayContaining(['minimum-note', 'interventions-and-scope', 'company-documentation-context', 'time-and-participants']));
    expect(answer.paragraphs[0].citations[0]).toMatchObject({ slug: 'mental-status-and-assessment', quote: expect.stringContaining('not directly assessed') });
  });
  it('does not turn a guide into a personal claim determination', async () => {
    const model = vi.fn().mockResolvedValue(result({ slugs: [], reason: 'personal_record' }));
    const answer = await answerFromHandbook({ handbook: book('itsco'), question: 'Will my claim be paid?' }, { model });
    expect(answer.status).toBe('not_found'); expect(answer.message).toContain('clinical supervisor or billing team');
  });
});
