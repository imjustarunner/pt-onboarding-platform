import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({enqueue:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../intakeEligibility.service.js',()=>({enqueueIntakeEligibility:mocks.enqueue}));
import {writeClientInsurance,applySubmittedClientInsurance} from '../clientInsurance.service.js';
import {encryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {paperInsuranceIsReviewed} from '../../utils/paperInsuranceReviewGate.js';
const input=()=>({agencyId:377,clientId:20,primary:{insurerName:'Test coverage',memberId:'SYNTHETIC'},patient:{firstName:'Test',lastName:'Person',dateOfBirth:'2000-01-01'}});
const database=()=>({execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[{billing_insurance_payload:null}]]:[{affectedRows:1}])});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));mocks.enqueue.mockResolvedValue({status:'queued',jobId:8});});
it.each([2,6,377])('queues insurance written by any entry path for agency %i using the same transaction',async agencyId=>{
 const db=database(),saved=await writeClientInsurance({...input(),agencyId},db);
 expect(mocks.enqueue).toHaveBeenCalledWith({agencyId,clientId:20,submissionId:0},db);
 expect(saved.automaticEligibility).toMatchObject({status:'queued'});
 expect(JSON.stringify(saved)).not.toContain('automaticEligibility');
});
it('does not recursively queue worker-generated member or payer corrections',async()=>{
 await writeClientInsurance({...input(),queueEligibility:false},database());expect(mocks.enqueue).not.toHaveBeenCalled();
});
it('never queues an unreviewed school paper record, including legacy records before a candidate exists',async()=>{
 const db={execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[{billing_insurance_payload:null,source:'SCHOOL_UPLOAD'}]]:[{affectedRows:1}])};
 const saved=await writeClientInsurance(input(),db);expect(saved.paperReviewRequired).toBe(true);expect(saved.automaticEligibility.status).toBe('awaiting_paper_review');expect(mocks.enqueue).not.toHaveBeenCalled();
});
it('permits a payer queue only after transcription confirmation, then invalidates it on an edited number',async()=>{
 let current=null;const db={execute:vi.fn(async(sql,args)=>{if(sql.startsWith('SELECT'))return [[{billing_insurance_payload:current,source:'SCHOOL_UPLOAD'}]];if(sql.startsWith('UPDATE clients SET billing_insurance_payload'))current=args[0];return [{affectedRows:1}];})};
 const draft=await writeClientInsurance({...input(),paperSourceDocumentId:9,queueEligibility:false},db);expect(paperInsuranceIsReviewed(draft)).toBe(false);expect(mocks.enqueue).not.toHaveBeenCalled();
 const reviewed=await writeClientInsurance({...input(),paperSourceDocumentId:9,paperReviewActorId:42},db);expect(paperInsuranceIsReviewed(reviewed)).toBe(true);expect(mocks.enqueue).toHaveBeenCalledTimes(1);
 const same=await writeClientInsurance({...input(),paperSourceDocumentId:9,paperReviewActorId:42,queueEligibility:false},db);expect(same.paperReview.approvalId).toBe(reviewed.paperReview.approvalId);
 const changed=await writeClientInsurance({...input(),primary:{...input().primary,memberId:'CORRECTED'},verifiedForClaims:true},db);expect(paperInsuranceIsReviewed(changed)).toBe(false);expect(changed.verifiedForClaims).toBe(false);expect(mocks.enqueue).toHaveBeenCalledTimes(1);
 expect(changed.paperReviewHistory[0].approvalId).toBe(reviewed.paperReview.approvalId);
});
it('preserves the insurance save and reports queue failures',async()=>{
 mocks.enqueue.mockRejectedValue(new Error('queue unavailable'));
 const saved=await writeClientInsurance(input(),database());expect(saved.eligibilityQueueWarning).toContain('Insurance was saved');
});
it('lets a later intake policy replace an empty Medicaid-search placeholder',async()=>{
 const placeholder=encryptFamilyBilling({primary:{},patient:input().patient},'client-insurance:377:20');
 const db={execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[{billing_insurance_payload:placeholder}]]:[{affectedRows:1}])};
 expect(await applySubmittedClientInsurance({...input(),profileId:17},db)).toBe(true);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clients SET billing_insurance_payload'))).toBe(true);
 expect(mocks.enqueue).toHaveBeenCalledTimes(1);
});

it('permits saving an unverified Medicaid holder mismatch but prevents marking it verified for claims',async()=>{
 const value={...input(),primary:{insurerName:'Colorado Medicaid',payerId:'COCHA',eligibilityPayerId:'SKCO0',isMedicaid:true,memberId:'A123456',relationshipToSubscriber:'child',subscriberFirstName:'Parent',subscriberLastName:'Person'}};
 const db=database();expect((await writeClientInsurance(value,db)).verifiedForClaims).toBe(false);
 db.execute.mockClear();await expect(writeClientInsurance({...value,verifiedForClaims:true},db)).rejects.toMatchObject({status:409});expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
