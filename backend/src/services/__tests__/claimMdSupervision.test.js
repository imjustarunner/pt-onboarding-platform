import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import { evaluateSupervisedBilling, normalizePayerPolicy, normalizeSupervisionPolicy, validNpi, isNonBillableDocument, documentReviewRequirement, NONBILLABLE_TYPES } from '../supervisedBillingPolicy.service.js';
import { applyOverrideRules } from '../applyBillingClaimOverrides.service.js';
import { reviewInterval, assertNoReviewTimeOverlap, assertNoMeetingOverlap, withSupervisorTimeLock } from '../supervisionReviewTime.service.js';
import { evaluateNoteContentReview } from '../clinicalNoteContentReview.service.js';
import { buildClaimMdJsonClaim } from '../claimMd.service.js';

const rule=()=>({effectiveFrom:'2024-09-15',effectiveThrough:'2026-12-31',providerMapping:'supervisor_rendering',mappingVerified:true,deferredCosignAllowed:true,reference:'Verified payer manual section 4',requiredReviewTypes:[]});
const input=()=>({policy:{billingMode:'billing_supervisor',supervisorUserId:2,version:1,cosignTiming:'after_submission',cosignDueDays:7},payerPolicy:{coloradoMedicaid:true,version:1,rules:[rule()]},dateOfService:'2026-09-24',claimDate:'2026-09-24',serviceProvider:{id:1,npi:'1234567893'},supervisor:{id:2,npi:'1306688650'},note:{note_type:'PROGRESS',provider_signed_at:'2026-09-24T12:00:00Z'}});
describe('supervised billing policy',()=>{
  it('also requires review for historical amendment copies regardless of note type or deferred cosign',()=>{
    const v=input();v.note.metadata_json={amendmentOfNoteId:8};
    expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/Every amendment/);
    expect(documentReviewRequirement({...v.note,note_type:'CONTACT_NOTE'},{nonBillableReview:'none',noteTypes:[]})).toEqual({mandatoryReview:true,reviewRequested:true});
  });
  it('allows independent discretionary review for every non-service note type',()=>{
    for (const selected of NONBILLABLE_TYPES) {
      const policy=normalizeSupervisionPolicy({cosignTiming:'after_submission',cosignDueDays:7,nonBillableReview:'selected',noteTypes:[selected]});
      for(const type of NONBILLABLE_TYPES)expect(documentReviewRequirement({note_type:type},policy).reviewRequested).toBe(type===selected);
      expect(documentReviewRequirement({note_type:selected},{...policy,nonBillableReview:'none'},[selected])).toEqual({mandatoryReview:true,reviewRequested:true});
    }
  });
  it('requires amendment sign-off even for excluded non-service note types',()=>{
    for(const type of NONBILLABLE_TYPES)for(const mode of ['none','selected']) {
      expect(documentReviewRequirement({note_type:type,addendum_count:1},{nonBillableReview:mode,noteTypes:[]})).toEqual({mandatoryReview:true,reviewRequested:true});
    }
  });
  it('never defers an amendment cosign and never accepts the original or wrong supervisor signature',()=>{
    const v=input();Object.assign(v.note,{addendum_count:1,review_content_hash:'amended',supervisor_cosigned_at:'2026-09-24',supervisor_cosigned_by_user_id:2,metadata_json:{supervisorCosign:{contentHash:'original'}}});
    expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/Every amendment/);
    v.note.metadata_json.supervisorCosign.contentHash='amended';expect(evaluateSupervisedBilling(v).blockers).toEqual([]);
    v.note.supervisor_cosigned_by_user_id=3;expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/Every amendment/);
    v.policy.supervisorUserId=null;expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/Every amendment/);
  });
  it('does not accept timestamp-only legacy amendment sign-off or the same signature for a later addendum',()=>{
    const v=input();Object.assign(v.note,{latest_addendum_at:'2026-09-24',review_content_hash:'new',supervisor_cosigned_at:'2026-09-25',supervisor_cosigned_by_user_id:2});
    expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/Every amendment/);
    v.note.metadata_json={supervisorCosign:{contentHash:'new'}};expect(evaluateSupervisedBilling(v).blockers).toEqual([]);
    v.note.review_content_hash='second-addendum';expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/Every amendment/);
  });
  it('keeps billing group, treating provider and supervising provider distinct in the outgoing payload',()=>{
    const insurance={verifiedForClaims:true,acceptAssignment:true,primary:{payerId:'COCHA',memberId:'SYNTHETIC',subscriberFirstName:'Test',subscriberLastName:'Person',subscriberDob:'1980-01-01',subscriberSex:'F',subscriberAddressLine1:'1 Test',subscriberCity:'Denver',subscriberState:'CO',subscriberPostalCode:'80000',relationshipToSubscriber:'self'},patient:{firstName:'Test',lastName:'Person',dateOfBirth:'1980-01-01',sex:'F',addressLine1:'1 Test',city:'Denver',state:'CO',postalCode:'80000'}};
    const claim={id:1,agency_id:1,billing_npi:'1111111111',rendering_npi:'1234567893',rendering_first_name:'Treating',rendering_last_name:'Clinician',supervising_provider:{npi:'1306688650',firstName:'Overseeing',lastName:'Clinician'},diagnosis_codes_json:['F41.1'],place_of_service:'11',date_of_service:'2027-01-01'};
    const practice={name:'Synthetic Group',tax_id:'123456789',street_address:'1 Test',city:'Denver',state:'CO',postal_code:'80000',phone_number:'3035550100'},lines=[{procedure_code:'90834',charge_cents:12500,units:1}];
    const payload=buildClaimMdJsonClaim(claim,lines,{insurance,practice});
    expect(payload).toMatchObject({bill_npi:'1111111111',prov_npi:'1234567893',prov_name_f:'Treating',charge:[expect.objectContaining({chg_supv_prov_npi:'1306688650',chg_supv_prov_name_f:'Overseeing'})]});
    expect(()=>buildClaimMdJsonClaim({...claim,supervising_provider:{...claim.supervising_provider,npi:claim.rendering_npi}},lines,{insurance,practice})).toThrow();
  });
  it('preserves both identities and allows deferred cosign only with both policies',()=>{
    const value=input(),result=evaluateSupervisedBilling(value);
    expect(result.blockers).toEqual([]);expect(result.cosignPending).toBe(true);expect(result.renderingProvider.id).toBe(2);expect(result.serviceProvider.id).toBe(1);
    value.policy.cosignTiming='before_submission';expect(evaluateSupervisedBilling(value).blockers.join()).toMatch(/cosign/);
    value.policy.cosignTiming='after_submission';value.payerPolicy.rules[0].deferredCosignAllowed=false;expect(evaluateSupervisedBilling(value).blockers.join()).toMatch(/cosign/);
  });
  it('requires assigned supervisor cosign rather than any signature',()=>{
    const v=input();v.policy.cosignTiming='before_submission';v.note.supervisor_cosigned_at='2026-09-24';v.note.supervisor_cosigned_by_user_id=3;
    expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/cosign/);v.note.supervisor_cosigned_by_user_id=2;expect(evaluateSupervisedBilling(v).blockers).toEqual([]);
  });
  it('requires renewed cosign when the current note/addenda hash differs',()=>{
    const v=input();v.policy.cosignTiming='before_submission';Object.assign(v.note,{supervisor_cosigned_at:'2026-09-24',supervisor_cosigned_by_user_id:2,metadata_json:{supervisorCosign:{contentHash:'old'}},review_content_hash:'new'});
    expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/cosign/);v.note.review_content_hash='old';expect(evaluateSupervisedBilling(v).blockers).toEqual([]);
  });
  it('holds old mapping on January 1 for either submission or service date',()=>{
    for(const field of ['dateOfService','claimDate']){const v=input();v[field]='2027-01-01';expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/January 2027/);}
    const v=input();v.dateOfService=v.claimDate='2027-01-01';v.payerPolicy.rules=[{...rule(),effectiveFrom:'2027-01-01',effectiveThrough:'2027-12-31',providerMapping:'service_rendering_with_supervisor'}];
    expect(evaluateSupervisedBilling(v)).toMatchObject({blockers:[],emitSupervisor:true,renderingProvider:{id:1},supervisingProvider:{id:2}});
    v.payerPolicy.rules[0].mappingVerified=false;expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/Verify/);
    v.serviceProvider.npi=null;expect(evaluateSupervisedBilling(v).blockers.join()).toMatch(/individual NPI/);
  });
  it('does not make non-billable documents billable or accept unsigned notes',()=>{
    const v=input();for(const type of ['TERMINATION','TREATMENT_PLAN','CONTACT_NOTE']){v.note.note_type=type;expect(isNonBillableDocument(v.note)).toBe(true);expect(evaluateSupervisedBilling(v).blockers).toContain('This document is non-billable');}
    v.note.provider_signed_at=null;expect(evaluateSupervisedBilling(v).blockers).toContain('Provider signature is required');
  });
  it('validates NPI checksum, effective dates, overlapping periods and review types',()=>{
    expect(validNpi('1234567893')).toBe(true);expect(validNpi('1234567890')).toBe(false);
    const p={payerId:'COCHA',planType:'Medicaid',rules:[rule()]};expect(normalizePayerPolicy(p).rules).toHaveLength(1);
    expect(()=>normalizePayerPolicy({...p,rules:[rule(),rule()]})).toThrow(/overlap/);
    expect(()=>normalizePayerPolicy({...p,rules:[{...rule(),effectiveFrom:'2026-02-30'}]})).toThrow(/dates/);
    expect(()=>normalizeSupervisionPolicy({cosignTiming:'never',nonBillableReview:'none',noteTypes:[],cosignDueDays:7})).toThrow();
  });
  it('AI-generated metadata cannot pass a content checklist',()=>{
    expect(evaluateNoteContentReview({aiGenerated:true,notePayload:'',noteType:'PROGRESS'}).status).toBe('pending');
  });
});
describe('audited billing field rules',()=>{
  const claim={claimId:8,clientId:2,payerId:'COCHA',planType:'Medicaid',dateOfService:'2026-09-24',placeOfService:'02'};
  const override={id:3,scope:'payer',payer_id:'COCHA',plan_type:'Medicaid',field_key:'place_of_service',from_value:'02',to_value:'11',notes:'Synthetic verified test exception',policy_reference:'Synthetic reference',effective_from:'2026-01-01',effective_through:'2026-12-31'};
  it('matches exact product/date and preserves audit explanation',()=>{
    expect(applyOverrideRules(claim,[override])).toMatchObject({placeOfService:'11',applied:[{from:'02',to:'11',reason:override.notes}]});
    for(const diff of [{payerId:'OTHER'},{planType:'Commercial'},{dateOfService:'2027-01-01'},{placeOfService:'03'}])expect(applyOverrideRules({...claim,...diff},[override]).applied).toEqual([]);
  });
  it('blocks undocumented legacy exceptions and gives specific claim rules precedence',()=>{
    expect(()=>applyOverrideRules(claim,[{...override,notes:null}])).toThrow(/legacy/);
    expect(applyOverrideRules(claim,[{...override,scope:'claim',claim_id:8,to_value:'10'},override]).placeOfService).toBe('10');
  });
});
describe('documentation time',()=>{
  it('converts explicit offsets and rejects future attestation or invalid durations',()=>{
    const v={startAt:'2026-09-24T10:00:00-06:00',endAt:'2026-09-24T10:30:00-06:00',timezone:'America/Denver',attested:true};
    expect(reviewInterval(v,new Date('2026-09-25'))).toMatchObject({startAt:'2026-09-24 16:00:00',minutes:30});
    expect(()=>reviewInterval(v,new Date('2026-09-23'))).toThrow(/Future/);
    expect(()=>reviewInterval({...v,startAt:'2026-09-24T10:00:00'})).toThrow(/offset/);
    expect(()=>reviewInterval({...v,endAt:v.startAt})).toThrow(/whole minutes/);
  });
  it('rejects overlap across tenants, including meetings where supervisor is an attendee',async()=>{
    const db={execute:vi.fn().mockResolvedValue([[{id:5}]])};
    await expect(assertNoReviewTimeOverlap(db,[2], '2026-01-01 10:00:00','2026-01-01 11:00:00')).rejects.toMatchObject({status:409});
    expect(db.execute.mock.calls[0][0]).not.toContain('agency_id');
    await expect(assertNoMeetingOverlap(db,2,'start','end')).rejects.toMatchObject({status:409});
    expect(db.execute.mock.calls[1][0]).toContain('supervision_session_attendees');
  });
  it('releases acquired locks on failure, serializing both meeting and review writes',async()=>{
    const db={execute:vi.fn().mockResolvedValue([[{acquired:1}]]),release:vi.fn()},source={getConnection:async()=>db};
    await expect(withSupervisorTimeLock([9,2,9],async()=>{throw new Error('conflict');},source)).rejects.toThrow('conflict');
    expect(db.execute.mock.calls.map(c=>c[1][0])).toEqual(['supervision-time:2','supervision-time:9','supervision-time:9','supervision-time:2']);expect(db.release).toHaveBeenCalled();
  });
});
