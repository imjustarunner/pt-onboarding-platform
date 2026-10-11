import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { trainingDefinitionsFor, requiredTrainingKeys, trainingMatchesEdition, gradeDocumentQuiz } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'facilities-guide';
const book = slug => { const s = referenceSource({ slug }, key); return { metadata: referenceMetadata(s), sections: s.sections, version: { id: 81, version_number: 1, is_draft: 0 } }; };
describe('three company facilities editions', () => {
  it.each(['itsco', 'nlu', 'tisi'])('%s has the shared location and a complete matching training edition', slug => {
    const b = book(slug), d = trainingDefinitionsFor({ slug }).find(d => d.documentKey === key);
    expect(b.metadata).toMatchObject({ documentKey: key, coverTitle: ['Shared', 'spaces.'], facilities: { primaryLocation: '437 Windchime' } });
    expect(b.sections).toHaveLength(slug === 'itsco' ? 17 : 16);
    expect(referenceCatalogFor({ slug }).filter(d => d.key === key)).toHaveLength(1);
    expect(trainingDefinitionsFor({ slug }).filter(d => d.documentKey === key)).toHaveLength(1);
    expect(trainingMatchesEdition(d, b)).toBe(true);
    expect(d.questions).toHaveLength(6);
    expect(gradeDocumentQuiz(d, d.questions.map(q => q.correctAnswer))).toMatchObject({ passed: true, score: 100 });
    const changed = structuredClone(b); changed.sections.find(s => s.slug === 'locations-and-scope').body_html += '<p>New location.</p>';
    expect(trainingMatchesEdition(d, changed)).toBe(false);
    for (const s of b.sections) for (const m of s.body_html.matchAll(/href="#facilities-guide-([^\"]+)"/g)) expect(b.sections.some(s => s.slug === m[1])).toBe(true);
  });
  it.each(['staff', 'support', 'admin', 'provider', 'facilitator', 'intern', 'supervisor'])('includes %s in facilities onboarding even without clinical duties', role => {
    expect(requiredTrainingKeys({ slug: 'itsco' }, { role, sees_clients: false }, false)).toContain(key);
  });
  it.each(['client', 'client_guardian', 'guardian', 'family', 'school_staff'])('does not assign employee facilities training to %s', role => {
    expect(requiredTrainingKeys({ slug: 'itsco' }, { role })).not.toContain(key);
  });
  it('keeps Denver as an explicit ITSCO-only notice with no invented instructions', () => {
    const itsco = book('itsco');
    expect(itsco.metadata.facilities.denverStatus).toBe('coming_soon');
    expect(itsco.sections.find(s => s.slug === 'denver-procedures').body_html).toContain('not an operating procedure');
    expect(itsco.sections.find(s => s.slug === 'denver-procedures').body_html).toContain('Do not apply Windchime');
    for (const slug of ['nlu','tisi']) {
      const b = book(slug); expect(b.sections.some(s => s.slug === 'denver-procedures')).toBe(false);
      expect(b.metadata.facilities).not.toHaveProperty('denverStatus');
      expect(JSON.stringify(b.sections)).not.toMatch(/Denver/);
    }
    expect(referenceSource({ slug: 'other', name: 'ITSCO' }, key, { packageAssigned: true })).toBeNull();
  });
  it('uses app workflows, excludes credentials and preserves uncertain equipment status', () => {
    const s = Object.fromEntries(book('itsco').sections.map(s => [s.slug,s.body_html]));
    expect(s['office-scheduling']).toContain('app’s office request');
    expect(s['entry-exit-and-alarms']).toContain('Confirm the current status');
    expect(s['cameras-and-privacy']).toContain('cannot verify device settings');
    expect(s['access-and-security']).toContain('do not contain access credentials');
    expect(JSON.stringify(s)).not.toMatch(/@gmail\.com|(?:door code|entry code)\s*(?:is|:)\s*\d{3,}|password\s*:\s*\S+/i);
    const archive = readFileSync(new URL('../../content/facilities-guides/original-facilities-manual.redacted.txt', import.meta.url),'utf8');
    expect(archive.match(/\[REDACTED:/g)).toHaveLength(4);
    expect(archive).not.toMatch(/@gmail\.com|^\s*\d+\s*\+\s*CHECK/m);
    expect(s['safety-and-visitors']).toContain('not a substitute for emergency assistance');
  });
});
describe('facilities Q&A qualifications (local fixtures)', () => {
  it('keeps the Denver notice with a routed Windchime closing passage', async () => {
    const result = data => ({text:JSON.stringify(data),finishReason:'STOP'});
    const model = vi.fn().mockResolvedValueOnce(result({slugs:['windchime-opening-and-closing']})).mockResolvedValueOnce(result({status:'answered',paragraphs:[{text:'Verified Denver procedures have not been added.',citations:[{slug:'denver-procedures',passageId:'p1'}]}]})).mockResolvedValueOnce(result({supported:true}));
    const answer = await answerFromHandbook({handbook:book('itsco'),question:'How do I close Denver?'},{model});
    const call=model.mock.calls[1][0];
    expect(call.systemInstruction).toContain('Never apply 437 Windchime');
    expect(call.systemInstruction).toContain('Never provide, guess or infer passwords');
    expect(JSON.parse(call.prompt).sources.map(s=>s.slug)).toEqual(expect.arrayContaining(['locations-and-scope','access-and-security','denver-procedures']));
    expect(answer.paragraphs[0].citations[0].quote).toContain('have not yet been added');
  });
});
