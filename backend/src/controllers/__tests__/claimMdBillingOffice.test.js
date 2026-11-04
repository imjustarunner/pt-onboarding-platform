import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),main:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),profile:vi.fn(),resolve:vi.fn(),offices:vi.fn(),event:vi.fn(),build:vi.fn(),approved:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:vi.fn()})}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main},onTableWrite:vi.fn()}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/claimMdBillingProfile.service.js',async original=>({...await original(),getClaimMdBillingProfile:m.profile,resolveClaimMdBillingProfile:m.resolve,listClaimMdBillingProfiles:m.offices}));
vi.mock('../../services/claimMdWorkflow.service.js',async original=>({...await original(),recordClaimEvent:m.event,claimEventHistory:vi.fn(async()=>[])}));
vi.mock('../../services/clinicalNoteVersionBilling.service.js',async original=>({...await original(),getApprovedClinicalContext:m.approved,approvedVersionBillingBlockers:()=>[]}));
vi.mock('../../services/clinicalClaimReadiness.service.js',()=>({evaluateClaimReadiness:vi.fn(async()=>({ready:true,checks:{},blockers:[],warnings:[],diagnosisCodes:['F41.1']}))}));
vi.mock('../../services/clinicalSupervisorReview.service.js',()=>({serviceDetailBillingBlockers:vi.fn(async()=>[])}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:vi.fn(async()=>({primary:{payerId:'QA-PAYER'}}))}));
vi.mock('../../services/coverageVerification.service.js',()=>({listCoverageEvidence:vi.fn(async()=>({review:{id:1}})),coverageReviewBlockers:()=>[]}));
vi.mock('../../services/clientDocumentationReadiness.service.js',()=>({documentationScope:()=> 'ordinary',getClientDocumentationReadiness:vi.fn(async()=>({ready:true,blockers:[],sourceHash:'documentation',reviewId:1,scope:'ordinary'}))}));
vi.mock('../../services/claimContentReview.service.js',()=>({claimDocumentation:vi.fn(async()=>({note:{id:7,provider_signed_at:'2026-11-01',provider_signed_by_user_id:22},addenda:[]})),reviewSourceHash:input=>JSON.stringify(input),currentClaimContentReview:vi.fn(async()=>({status:'passed',findings:[]})),runClaimContentReview:vi.fn()}));
vi.mock('../../services/providerBillingRollout.service.js',()=>({providerBillingRolloutReview:vi.fn(async()=>({ready:true,revision:1}))}));
vi.mock('../../services/providerBillingNpi.service.js',()=>({providerBillingNpi:vi.fn(async()=> '2222222222')}));
vi.mock('../../services/supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:vi.fn(async()=>({supervisorUserId:null,billingMode:'own'})),resolveDocumentationPolicy:vi.fn(async()=>({supervisorUserId:null,billingMode:'own'})),loadPayerPolicy:vi.fn(async()=>({})),evaluateSupervisedBilling:()=>({blockers:[],warnings:[]}),isNonBillableDocument:()=>false}));
vi.mock('../../services/applyBillingClaimOverrides.service.js',()=>({applyBillingClaimOverrides:vi.fn(async()=>null)}));
vi.mock('../../services/claimServiceChanges.service.js',async original=>({...await original(),hasPendingClaimChange:vi.fn(async()=>false)}));
vi.mock('../../services/claimMd.service.js',async original=>({...await original(),buildClaimMdJsonClaim:m.build}));
import { correctClaim, prepareClaimReview, claimDraft } from '../claimMdWorkflow.controller.js';

let claim;
const session=Object.freeze({id:3,agency_id:1,client_id:4,provider_user_id:22,service_location_id:5,billing_office_location_id:6,place_of_service:'10'});
const profile={officeId:8,officeName:'Billing group',billingNpi:'1111111111',practice:{name:'Billing group',street_address:'8 Billing Road',city:'Synthetic',state:'CO',postal_code:'80000'}};
const request=(body={})=>({user:{id:99,role:'admin'},params:{claimId:'11'},body:{agencyId:1,revision:2,reason:'Correct billing office selection',placeOfService:'10',billingNpi:'1111111111',renderingNpi:'2222222222',taxonomyCode:'101Y00000X',billingOfficeId:8,lines:[{id:14,chargeCents:10000,modifiers:[]}],...body}});
const response=()=>({json:vi.fn()});
beforeEach(()=>{
 vi.clearAllMocks();claim={id:11,agency_id:1,client_id:4,clinical_session_id:3,clinical_note_id:7,date_of_service:'2026-11-01',claim_lifecycle:'ready',billing_revision:2,billing_npi:'1111111111',rendering_npi:'2222222222',place_of_service:'10',metadata_json:{clinicalVersion:{revisionId:12},rateEvidence:{source:'existing'}}};
 m.execute.mockImplementation(async sql=>sql.includes('FROM clinical_claim_references')?[[{agency_id:1,clinical_claim_id:11,public_reference:'001-2026-11-001'}]]:sql.includes('FROM clinical_claims')?[[{...claim}]]:sql.includes('FROM clinical_claim_lines')?[[{id:14,clinical_note_id:7,procedure_code:'90834',charge_cents:10000,modifiers_json:'[]'}]]:sql.includes('FROM clinical_sessions')?[[session]]:sql.includes('FROM clinical_notes')?[[{id:7,agency_id:1,client_id:4,clinical_session_id:3}]]:sql.startsWith('SELECT')?[[]]:[{affectedRows:1}]);
 m.main.mockImplementation(async sql=>sql.includes('FROM users')?[[{id:22,first_name:'QA',last_name:'Clinician'}]]:[[]]);
 m.profile.mockResolvedValue(profile);m.resolve.mockResolvedValue(profile);m.offices.mockResolvedValue([{id:8,name:'Billing group',practice_npi:'1111111111'}]);
 m.approved.mockImplementation(async({note,session})=>({note:{...note,metadata_json:{structuredChart:{placeOfService:'10'}},clinical_version_id:12,clinical_version_number:1,clinical_version_content_hash:'a'.repeat(64)},session}));
 m.build.mockImplementation((c,lines,{practice})=>({remote_claimid:String(c.id),payer_control:c.claim_number,billing_address:practice.street_address,billing_npi:c.billing_npi,place_of_service:c.place_of_service}));
});
it('stores an audited claim-only office correction without modifying the signed clinical session',async()=>{
 const res=response(),next=vi.fn();await correctClaim(request(),res,next);expect(next).not.toHaveBeenCalled();
 expect(m.profile).toHaveBeenCalledWith(1,8,{requireComplete:false});
 const update=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE clinical_claims'));
 expect(JSON.parse(update[1][5])).toMatchObject({clinicalVersion:{revisionId:12},rateEvidence:{source:'existing'},billingOfficeOverride:{officeId:8,actorUserId:99,reason:'Correct billing office selection'}});
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({actorUserId:99,payload:expect.objectContaining({before:expect.objectContaining({billingOfficeId:null}),after:expect.objectContaining({billingOfficeId:8})})}),expect.anything());
 expect(m.execute.mock.calls.some(([sql])=>/^UPDATE clinical_(sessions|notes)/.test(sql))).toBe(false);expect(session.billing_office_location_id).toBe(6);expect(m.commit).toHaveBeenCalled();
});
it('rolls back an unavailable or cross-practice billing office and a stale claim',async()=>{
 m.profile.mockRejectedValueOnce(Object.assign(Error('The billing office is unavailable or belongs to another agency.'),{status:409}));
 const next=vi.fn();await correctClaim(request({billingOfficeId:999}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.rollback).toHaveBeenCalled();expect(m.event).not.toHaveBeenCalled();
 m.profile.mockClear();await correctClaim(request({revision:1}),response(),vi.fn());expect(m.profile).not.toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();
});
it('requires the selected office NPI and preserves transmitted claim fields',async()=>{
 const next=vi.fn();await correctClaim(request({billingNpi:'9999999999'}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.event).not.toHaveBeenCalled();
 claim.claimmd_claim_id='already-transmitted';await correctClaim(request(),response(),next);expect(m.commit).not.toHaveBeenCalled();
});
it('uses the saved override for the shared review/transmission payload and invalidates a changed office address',async()=>{
 claim.metadata_json={...claim.metadata_json,billingOfficeOverride:{officeId:8}};claim.claim_number='EXISTING-PAYER-CONTROL';
 const first=await prepareClaimReview(1,11);expect(first.billingOffice).toEqual({id:8,name:'Billing group'});expect(first.claim.claim_reference).toBe('001-2026-11-001');
 expect(first.payload).toMatchObject({remote_claimid:'11',payer_control:'EXISTING-PAYER-CONTROL',billing_address:'8 Billing Road',place_of_service:'10'});expect(m.resolve).not.toHaveBeenCalled();expect(m.profile).toHaveBeenCalledWith(1,8);
 m.profile.mockResolvedValue({...profile,practice:{...profile.practice,street_address:'9 Billing Road'}});const changed=await prepareClaimReview(1,11);expect(changed.reviewHash).not.toBe(first.reviewHash);expect(session.service_location_id).toBe(5);
});
it('keeps a missing office draft editable and returns the scoped office list and public reference',async()=>{
 claim.clinical_note_id=null; m.resolve.mockRejectedValueOnce(Object.assign(Error('Select a billing office for this agency.'),{status:409}));
 const res=response(),next=vi.fn();await claimDraft({user:{id:99},params:{claimId:11},query:{agencyId:1}},res,next);expect(next).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({claim:expect.objectContaining({claim_reference:'001-2026-11-001'}),billingOffices:[expect.objectContaining({id:8})],billingOfficeId:null,billingOfficeError:'Select a billing office for this agency.'}));expect(res.json.mock.calls[0][0].claim).not.toHaveProperty('metadata_json');
});

it('distinguishes an unset zero charge from an explicitly entered free rate without repricing',async()=>{
 claim.clinical_note_id=null;
 const prior=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM clinical_claim_lines')?[[{id:14,procedure_code:'H0002',charge_cents:0}]]:prior(sql,args));
 const res=response(),next=vi.fn();await claimDraft({user:{id:99},params:{claimId:11},query:{agencyId:1}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].feeWarnings[0]).toContain('H0002 has a saved $0 charge');
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 claim.metadata_json={feeScheduleSnapshot:[{serviceCode:'H0002',source:'entered',needsRate:false}]};
 const second=response();await claimDraft({user:{id:99},params:{claimId:11},query:{agencyId:1}},second,next);
 expect(second.json.mock.calls[0][0].feeWarnings).toEqual([]);
});

it('returns an incomplete claim as a blocked actionable review using its actual service date',async()=>{
 m.build.mockImplementationOnce(()=>{throw Object.assign(new Error('Claim is incomplete: payerid'),{status:409,missingFields:['payerid']});});
 const result=await prepareClaimReview(1,11);
 expect(result.payload).toBeNull();expect(result.readiness).toMatchObject({ready:false,payloadIssue:{message:'Claim is incomplete: payerid',fields:['payerid']}});
 expect(result.readiness.blockers).toContain('Claim is incomplete: payerid');expect(result.claim.date_of_service).toBe('2026-11-01');
 const {listCoverageEvidence}=await import('../../services/coverageVerification.service.js');expect(listCoverageEvidence).toHaveBeenCalledWith({agencyId:1,clientId:4,serviceDate:'2026-11-01'});
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('does not mask unexpected payload construction failures',async()=>{
 m.build.mockImplementationOnce(()=>{throw new Error('Unexpected failure');});await expect(prepareClaimReview(1,11)).rejects.toThrow('Unexpected failure');
});
