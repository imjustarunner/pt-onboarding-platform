import { beforeEach,describe,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),clinical:vi.fn(),access:vi.fn(),billing:vi.fn(),policy:vi.fn(),connection:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:m.billing}));
vi.mock('../supervisedBillingPolicy.service.js',async original=>({...await original(),resolveDocumentationPolicy:m.policy}));
import { getSupervisionDocumentationPolicy,saveSupervisionDocumentationPolicy,saveDocumentationReviewTime,getSuperviseeReviewDocument,saveSupervisedPayerPolicy,listSupervisedPayerPolicies } from '../../controllers/supervisedBilling.controller.js';
const req=()=>({user:{id:5,role:'provider'},params:{providerId:'7'},body:{agencyId:1},query:{}});
const res=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{user_id:7}]]);m.access.mockResolvedValue();m.policy.mockResolvedValue({supervisorUserId:9,version:0,cosignTiming:'before_submission'});m.billing.mockResolvedValue(false);});
describe('clinical oversight and financial permission separation',()=>{
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
