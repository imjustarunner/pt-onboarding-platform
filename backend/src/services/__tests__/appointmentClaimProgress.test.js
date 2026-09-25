import {describe,it,expect} from 'vitest';
import {appointmentProgress,clinicalCorrectionReasons} from '../appointmentClaimProgress.service.js';
describe('clinical claim progress',()=>{
  it('does not request a service claim for non-billable documentation',()=>{
    expect(appointmentProgress({note:{provider_signed_at:'now'},nonBillable:true})).toMatchObject({status:'documentation_only',actions:[]});
  });
  it('distinguishes a planned service, unsigned note and signed claim preparation',()=>{
    expect(appointmentProgress({}).label).toContain('planned');
    expect(appointmentProgress({note:{id:1}}).actions).toContain('Complete and sign the service note.');
    expect(appointmentProgress({note:{provider_signed_at:'now'}}).status).toBe('awaiting_preparation');
  });
  it('never equates acceptance with payment',()=>{
    expect(appointmentProgress({claim:{claim_lifecycle:'accepted'},note:{provider_signed_at:'now'}})).toMatchObject({status:'accepted',step:3});
    expect(appointmentProgress({claim:{claim_lifecycle:'paid'},note:{provider_signed_at:'now'},pendingChange:true})).toMatchObject({status:'paid',step:4,correctionPending:true});
  });
  it('does not trust stale ready status without a current complete review',()=>{
    expect(appointmentProgress({claim:{claim_lifecycle:'ready'},note:{provider_signed_at:'now'}}).status).toBe('review');
    expect(appointmentProgress({claim:{claim_lifecycle:'ready'},note:{provider_signed_at:'now'},prepared:{readiness:{ready:true}}}).status).toBe('awaiting_submission');
  });
  it('keeps cosign and amendment holds visible',()=>{
    expect(appointmentProgress({note:{provider_signed_at:'now'},cosignPending:true,cosignRequired:true}).status).toBe('needs_cosign');
    expect(appointmentProgress({claim:{claim_lifecycle:'draft'},pendingChange:true}).status).toBe('changes_pending');
  });
  it('maps actionable fields without forwarding sensitive free text or invented replacements',()=>{
    const result=clinicalCorrectionReasons([{fields:'place_of_service diag_1',message:'Secret amount $999.00; replace diagnosis with X'}]);
    expect(result.join(' ')).toContain('location'); expect(result.join(' ')).toContain('Diagnosis');
    expect(JSON.stringify(result)).not.toMatch(/999|Secret|replace diagnosis/);
  });
});
