import { describe, expect, it } from 'vitest';
import { applyCollectiveHandbookReview, SHARED_REVIEW_POLICY_SLUGS, COLLECTIVE_HANDBOOK_RELEASE } from '../collectiveHandbookNovember2026.js';

const source = () => ({ sections: [
  {slug:'owner-custom-policy',title:'Owner policy',bodyHtml:'<p>Retained company-specific policy.</p>',status:'ready',parentSlug:null},
  {slug:'container',title:'Policy part',bodyHtml:'',status:'pending',parentSlug:null},
  {slug:'child',title:'Child policy',bodyHtml:'<p>Existing child policy.</p>',status:'ready',parentSlug:'container'},
  {slug:'unprovided',title:'Unprovided appendix',bodyHtml:'',status:'pending',parentSlug:null},
  {slug:'event-travel-reimbursement',title:'Event travel',bodyHtml:'<p>ITSCO event workflow.</p>',status:'ready',parentSlug:null},
  {slug:'school-support-activity-hours',title:'School Support Hours',bodyHtml:'<p>Prior school support policy.</p>',status:'ready',parentSlug:null},
  {slug:'testing-services',title:'Testing',bodyHtml:'<p>Verified Testing reference.</p>',status:'ready',parentSlug:null}
] });

describe('owner-approved collective handbook reconciliation', () => {
  it.each(['itsco','nlu','isi'])('gives %s all shared policies and correctly scoped November entries', tenant => {
    const input=source(),result=applyCollectiveHandbookReview(input,[],tenant);
    for(const slug of SHARED_REVIEW_POLICY_SLUGS)expect(result.source.sections.some(s=>s.slug===slug)).toBe(true);
    expect(result.source.ownerReviewRelease).toBe(COLLECTIVE_HANDBOOK_RELEASE);
    expect(result.updates.filter(e=>e.period_label==='November 2026').every(e=>e.scope.includes(tenant))).toBe(true);
    expect(result.source.sections.find(s=>s.slug==='employee-contract-policy').bodyHtml).toContain('Yes</strong> or <strong>No');
    expect(result.source.sections.find(s=>s.slug==='benefits-tier-framework').bodyHtml).toContain('not itself noncompliance');
    expect(result.source.sections.find(s=>s.slug==='owner-custom-policy').bodyHtml).toBe('<p>Retained company-specific policy.</p>');
    expect(result.source.sections.find(s=>s.slug==='child').parentSlug).toBe('container');
    expect(result.source.sections.find(s=>s.slug==='container')).toMatchObject({status:'ready'});
    expect(result.source.sections.find(s=>s.slug==='container').bodyHtml).toContain('#handbook-child');
    expect(result.source.sections.some(s=>s.slug==='unprovided')).toBe(false);
    expect(result.source.ownerReviewExcludedEmptySections).toContainEqual(expect.objectContaining({slug:'unprovided'}));
  });
  it('keeps school support and the outreach travel policy only in ITSCO', () => {
    for(const tenant of ['itsco','nlu','isi']) {
      const result=applyCollectiveHandbookReview(source(),[],tenant);
      for(const slug of ['school-support-activity-hours','event-travel-reimbursement'])expect(result.source.sections.some(s=>s.slug===slug)).toBe(tenant==='itsco');
      expect(result.updates.some(e=>e.handbook_section_slug==='school-support-activity-hours')).toBe(tenant==='itsco');
    }
  });
  it('includes NLU learning progression without offering tutoring at Inner Strength', () => {
    const nlu=applyCollectiveHandbookReview(source(),[],'nlu').source;
    expect(nlu.sections.find(s=>s.slug==='career-pathway-overview').bodyHtml).toContain('Tutoring and learning support');
    const isi=applyCollectiveHandbookReview(source(),[],'isi').source;
    expect(isi.sections.find(s=>s.slug==='service-focus-assignment')).toMatchObject({title:'Clinical responsibilities and individual expectations'});
    expect(isi.sections.find(s=>s.slug==='service-focus-assignment').bodyHtml).toContain('does not offer tutoring');
  });
  it('uses compensation mapping rather than the code prefix for the shared indirect allowance', () => {
    const body=applyCollectiveHandbookReview(source(),[],'nlu').source.sections.find(s=>s.slug==='direct-care-automatic-indirect-correction').bodyHtml;
    expect(body).toContain('eligible Testing administration/scoring');
    expect(body).toContain('not the first digit of the code');
    expect(body).toContain('10 minutes');
    expect(body).toContain('preserve a greater agreed allowance');
  });
  it('reapplying the release neither duplicates policies nor changes final wording', () => {
    const result=applyCollectiveHandbookReview(source(),[],'nlu');
    const before=JSON.stringify(result);
    applyCollectiveHandbookReview(result.source,result.updates,'nlu');
    expect(JSON.stringify(result)).toBe(before);
  });
});
