import { describe, expect, it } from 'vitest';
import { planOwnerReviewedHandbookRelease } from '../ownerReviewedHandbookRelease.service.js';
import { COLLECTIVE_HANDBOOK_RELEASE } from '../../content/collectiveHandbookNovember2026.js';

function snapshot(slug) {
  const id={itsco:2,nlu:6,tisi:377}[slug];
  return { agency:{id,slug,name:slug,color_palette:{primary:'#123456',secondary:'#234567',accent:'#345678'}}, document:{id:1}, version:{id:2,is_draft:1,version_number:1,metadata_json:{forms:{retained:true}}}, maxVersionNumber:1,
    sections:[{id:1,slug:'direct-care-automatic-indirect-correction',title:'Indirect',body_html:'<p>Earlier wording.</p>',content_status:'ready',parent_slug:null},{id:2,slug:'owner-custom-policy',title:'Owner policy',body_html:'<p>Approved unrelated policy.</p>',content_status:'ready',parent_slug:null}],
    digests:[{id:3,agency_id:id,status:'draft',period_label:'November 2026'}], entries:[{id:4,digest_id:3,agency_id:id,handbook_section_slug:'direct-care-automatic-indirect-correction',subject:'Indirect',changed_content:'old',sort_order:0}], medical:[{service_code:'H0004',is_active:1}] };
}
describe('final company handbook release planning',()=>{
  it.each(['itsco','nlu','tisi'])('plans a new immutable publication for %s without mutating input records',slug=>{
    const input=snapshot(slug),before=JSON.stringify(input),plan=planOwnerReviewedHandbookRelease(input,{approvalFileHash:'review-hash'});
    expect(JSON.stringify(input)).toBe(before);
    expect(plan.versionNumber).toBe(2);
    expect(plan.metadata.ownerApproval).toMatchObject({status:'final',release:COLLECTIVE_HANDBOOK_RELEASE,reviewExportSha256:'review-hash'});
    expect(plan.metadata).toMatchObject({edition:'November 2026 · Version 2 · Final',sourceDate:'2026-11-13',organization:slug});
    expect(plan.metadata.forms).toEqual({retained:true});
    expect(plan.metadata.presentation.agencyBrand.primary).toBe('#123456');
    expect(plan.minimumWorkloadWaivedFrom).toBe('2026-11-13');
    expect(plan.sections.find(s=>s.slug==='owner-custom-policy').bodyHtml).toBe('<p>Approved unrelated policy.</p>');
    expect(plan.medicalInsertions.every(c=>c.isActive===false)).toBe(true);
    expect(plan.medicalInsertions.some(c=>c.serviceCode==='H0004')).toBe(false);
    for(const entry of [...plan.entries,...plan.novemberAdditions])expect(entry.changed_content).toBe(plan.sections.find(s=>s.slug===entry.handbook_section_slug).bodyHtml);
  });
  it('refuses an unlinked draft entry instead of calling it complete',()=>{
    const input=snapshot('itsco');input.entries[0].handbook_section_slug='not-a-policy';
    expect(()=>planOwnerReviewedHandbookRelease(input)).toThrow('Unlinked update entries');
  });
  it('does not reopen or renumber a completed release on retry',()=>{
    const input=snapshot('itsco');input.version={...input.version,is_draft:0,version_number:2,metadata_json:{ownerApproval:{release:COLLECTIVE_HANDBOOK_RELEASE}}};
    expect(planOwnerReviewedHandbookRelease(input)).toMatchObject({alreadyFinal:true,versionNumber:2});
  });
});
