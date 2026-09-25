import { beforeEach,describe,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),clinical:vi.fn(),access:vi.fn(),billing:vi.fn(),policy:vi.fn(),connection:vi.fn(),document:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../schedulingBillingAccess.service.js',async original=>({...await original(),hasSchedulingBillingAccess:m.billing}));
vi.mock('../supervisedBillingPolicy.service.js',async original=>({...await original(),resolveDocumentationPolicy:m.policy,requiredDocumentReviewTypes:vi.fn().mockResolvedValue([])}));
vi.mock('../clinicalReviewDocument.service.js',()=>({loadReviewDocument:m.document}));
import { documentationScope,listSuperviseeDocumentReviews, getSupervisionDocumentationPolicy,saveSupervisionDocumentationPolicy,saveDocumentationReviewTime,getSuperviseeReviewDocument,saveSupervisedPayerPolicy,listSupervisedPayerPolicies } from '../../controllers/supervisedBilling.controller.js';
const req=()=>({user:{id:5,role:'provider'},params:{providerId:'7'},body:{agencyId:1},query:{}});
const res=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{user_id:7}]]);m.clinical.mockResolvedValue([[]]);m.access.mockResolvedValue();m.policy.mockResolvedValue({supervisorUserId:9,version:0,cosignTiming:'before_submission'});m.billing.mockResolvedValue(false);});
describe('clinical oversight and financial permission separation',()=>{
  it('does not let a separate clinical supervisor record RPO as the billing overseer',async()=>{
    m.policy.mockResolvedValue({supervisorUserId:9,reviewSupervisorIds:[5,9]});
    const r=req();r.body={agencyId:1,activityType:'rendering_provider_oversight',startAt:'2026-09-20T10:00:00Z',endAt:'2026-09-20T10:30:00Z',timezone:'UTC',requestId:'review-123',attested:true};
    const next=vi.fn();await saveDocumentationReviewTime(r,res(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(m.connection).not.toHaveBeenCalled();
  });
  it('lets a separate clinical supervisor review but reserves policy and cosign for the billing supervisor',async()=>{
    m.policy.mockResolvedValue({supervisorUserId:9,reviewSupervisorIds:[5,9],clinicalSupervisorIds:[5]});
    expect(await documentationScope(req(),{reviewerOnly:true})).toMatchObject({canReview:true,canManage:false,canAttest:false});
    await expect(documentationScope(req(),{write:true})).rejects.toMatchObject({status:403});
    await expect(documentationScope(req(),{supervisorOnly:true})).rejects.toMatchObject({status:403});
    const r=req();r.user.id=9;
    expect(await documentationScope(r,{supervisorOnly:true})).toMatchObject({canReview:true,canManage:true,canAttest:true});
  });
  it('audits a clinical supervisor document read and removes financial fields even inside serialized notes',async()=>{
    m.policy.mockResolvedValue({supervisorUserId:9,reviewSupervisorIds:[5,9]});
    m.document.mockResolvedValue({row:{client_id:3},hash:'source-hash',content:JSON.stringify({note:JSON.stringify({assessment:'Clinical progress',billing:{amount:800},claimPayload:{payer:'secret'}}),addenda:[]})});
    const r=req();r.params={...r.params,type:'note',documentId:'4'};const response=res();
    await getSuperviseeReviewDocument(r,response,e=>{throw e;});
    expect(JSON.parse(response.json.mock.calls[0][0].content)).toEqual({note:{assessment:'Clinical progress'},addenda:[]});
    expect(response.json.mock.calls[0][0].contentHash).toBe('source-hash');
    expect(m.execute).toHaveBeenLastCalledWith(expect.stringContaining('supervision_case_review_events'),[1,7,5,3,'source-hash']);
  });
  it('includes tenant-specific non-service types in review settings',async()=>{
    m.clinical.mockResolvedValue([[{note_type:'CARE_COORDINATION'}]]);
    const r=req();r.user.id=9;const response=res();await getSupervisionDocumentationPolicy(r,response,e=>{throw e;});
    expect(response.json.mock.calls[0][0].noteTypes).toContain('CARE_COORDINATION');
    expect(m.clinical.mock.calls[0][1]).toEqual([1]);
  });
  it('keeps amendments in the mandatory queue with review off and no earlier review record',async()=>{
    const r=req();r.user.id=9;const response=res();
    const note={id:4,client_id:3,note_type:'CONTACT_NOTE',title:'Contact note',provider_signed_at:'2026-09-22',created_at:'2026-09-22',addendum_count:1,supervisor_cosigned_at:'2026-09-23'};
    m.policy.mockResolvedValue({supervisorUserId:9,nonBillableReview:'none',noteTypes:[],cosignDueDays:7});
    m.clinical.mockResolvedValueOnce([[note]]).mockResolvedValueOnce([[]]);
    m.execute.mockResolvedValueOnce([[{user_id:7}]]).mockResolvedValueOnce([[]]);
    m.document.mockResolvedValue({row:{...note,supervisor_cosigned_by_user_id:9,metadata_json:{supervisorCosign:{contentHash:'old'}}},hash:'amended'});
    await listSuperviseeDocumentReviews(r,response,e=>{throw e;});
    expect(response.json.mock.calls[0][0].documents[0]).toMatchObject({reviewRequested:true,mandatoryReview:true,amendmentSignoffRequired:true,cosignedAt:null,latestReview:null});
  });

  it('denies unrelated clinicians before loading documents or creating review time',async()=>{
    for(const controller of [getSupervisionDocumentationPolicy,saveSupervisionDocumentationPolicy,saveDocumentationReviewTime,getSuperviseeReviewDocument]){const next=vi.fn();await controller(req(),res(),next);expect(next.mock.calls[0][0].status).toBe(403);}
    expect(m.clinical).not.toHaveBeenCalled();expect(m.connection).not.toHaveBeenCalled();
  });
  it('assigned supervisor can see policy without receiving financial permission',async()=>{
    const r=req();r.user.id=9;const response=res();await getSupervisionDocumentationPolicy(r,response,e=>{throw e;});expect(response.json).toHaveBeenCalledWith(expect.objectContaining({canManage:true,canAttest:true}));
    const next=vi.fn();await listSupervisedPayerPolicies(r,res(),next);expect(next.mock.calls[0][0].status).toBe(403);
  });
  it('allows supervisee read-only settings, but neither self-review nor admin attestation as supervisor',async()=>{
    const r=req();r.user.id=7;const response=res();await getSupervisionDocumentationPolicy(r,response,e=>{throw e;});expect(response.json).toHaveBeenCalledWith(expect.objectContaining({canManage:false,canAttest:false}));
    let next=vi.fn();await saveSupervisionDocumentationPolicy(r,res(),next);expect(next.mock.calls[0][0].status).toBe(403);
    r.user.role='admin';next=vi.fn();await saveDocumentationReviewTime(r,res(),next);expect(next.mock.calls[0][0].status).toBe(403);
  });
  it('rejects cross-tenant membership and agency access',async()=>{
    m.execute.mockResolvedValue([[]]);let next=vi.fn();await getSupervisionDocumentationPolicy(req(),res(),next);expect(next.mock.calls[0][0].status).toBe(404);
    m.access.mockRejectedValue(Object.assign(new Error('No agency access'),{status:403}));next=vi.fn();await getSuperviseeReviewDocument(req(),res(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(m.clinical).not.toHaveBeenCalled();
  });
  it('refuses stale supervision policy saves under a row lock',async()=>{
    const r=req();r.user.id=9;r.body={agencyId:1,version:1,reason:'Require review before submitting',policy:{cosignTiming:'before_submission',cosignDueDays:7,nonBillableReview:'all',noteTypes:[]}};
    const db={execute:vi.fn().mockResolvedValue([[{id:2}]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.connection.mockResolvedValue(db);
    const next=vi.fn();await saveSupervisionDocumentationPolicy(r,res(),next);expect(next.mock.calls[0][0].status).toBe(409);expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
  });
  it('denies financial policy mutation without tenant billing access',async()=>{
    const next=vi.fn();await saveSupervisedPayerPolicy(req(),res(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(m.connection).not.toHaveBeenCalled();
  });
});
