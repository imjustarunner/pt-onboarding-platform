import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({enqueue:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../intakeEligibility.service.js',()=>({enqueueIntakeEligibility:mocks.enqueue}));
import {writeClientInsurance,applySubmittedClientInsurance} from '../clientInsurance.service.js';
import {encryptFamilyBilling} from '../familyBillingEncryption.service.js';
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
