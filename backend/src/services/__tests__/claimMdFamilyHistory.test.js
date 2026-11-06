import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({clinical:vi.fn(),main:vi.fn(),family:vi.fn(),decrypt:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.main},onTableWrite:()=>()=>{}}));
vi.mock('../claimFamily.service.js',()=>({loadClaimFamily:mocks.family,claimRecordId:r=>r.id}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:vi.fn(),decryptFamilyBilling:mocks.decrypt}));
vi.mock('../claimMd.service.js',()=>({fetchResponses:vi.fn()}));
import {claimFamilyHistory} from '../claimMdWorkflow.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.family.mockResolvedValue({root:{id:11},current:{id:13},claimReference:'002-2026-11-009',patientControlNumber:'12',attempts:[{id:11},{id:12},{id:13}]});mocks.main.mockResolvedValue([[{id:9,first_name:'DEMO',last_name:'Biller'}]]);mocks.decrypt.mockImplementation(value=>value);});
it('joins the complete chain chronologically, using each attempt encryption context and authoritative actor',async()=>{
 mocks.clinical.mockResolvedValue([[{id:3,clinical_claim_id:13,event_key:'response:3',event_type:'response',actor_user_id:null,status:'R',payload_encrypted:{messages:[{message:'Rejected'}]}},{id:2,clinical_claim_id:11,event_key:'retry',event_type:'resubmission_created',actor_user_id:9,payload_encrypted:{claimId:12,actorName:'forged',createdAt:'forged'}},{id:1,clinical_claim_id:11,event_key:'first',event_type:'approved_submission',actor_user_id:9,created_at:'2026-11-05',payload_encrypted:{}}]]);
 const result=await claimFamilyHistory(2,13);expect(result.history.map(x=>x.id)).toEqual([1,2,3]);expect(result.history[1]).toMatchObject({attemptNumber:2,actorName:'DEMO Biller'});expect(result.history[1].createdAt).not.toBe('forged');
 expect(mocks.decrypt).toHaveBeenCalledWith(expect.anything(),'claimmd:2:11:retry');expect(mocks.decrypt).toHaveBeenCalledWith(expect.anything(),'claimmd:2:13:response:3');
 const [sql,args]=mocks.clinical.mock.calls[0];expect(sql).toContain('d.agency_id=e.agency_id');expect(sql).toContain('d.connection_id=e.connection_id');expect(sql).toContain('d.event_key=e.event_key');expect(args).toEqual([2,11,12,13,11,12,13]);
});
it('pages earlier activity without truncating at 100 and rejects invalid cursors before querying',async()=>{
 mocks.clinical.mockResolvedValue([Array.from({length:101},(_,i)=>({id:200-i,clinical_claim_id:11,event_key:`e${i}`,payload_encrypted:{}}))]);
 const result=await claimFamilyHistory(2,13,{before:300});expect(result.history).toHaveLength(100);expect(result.history[0].id).toBe(101);expect(result.nextBefore).toBe(101);expect(mocks.clinical.mock.calls[0][1].at(-1)).toBe(300);
 mocks.clinical.mockClear();await expect(claimFamilyHistory(2,13,{before:'NaN'})).rejects.toMatchObject({status:400});expect(mocks.clinical).not.toHaveBeenCalled();
});
