import { describe,it,expect,vi } from 'vitest';
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {claimResubmissionFields,validateResubmissionRequest,assertResubmissionSource} from '../claimResubmission.service.js';
const original={id:11,agency_id:1,client_id:2,clinical_session_id:3,billing_revision:4,claim_lifecycle:'paid',payer_name:'Synthetic payer'};
const input={kind:'replacement',revision:4,reason:'Correct approved service details',attested:true,payerSupportsElectronicCorrection:true,payerControlNumber:'ICN-123'};
describe('linked claim correction policy',()=>{
 it.each([['original_retry','1'],['replacement','7'],['void','8']])('maps %s to Claim.MD frequency %s',(kind,frequency)=>{
  expect(claimResubmissionFields({metadata_json:{resubmission:{...input,kind,sourceClaimId:11}}})).toEqual({frequency_code:frequency,...(frequency==='1'?{}:{icn_dcn_1:'ICN-123'})});
 });
 it('requires source revision, explicit reason, approval and payer control reference',()=>{
  expect(()=>validateResubmissionRequest(original,input)).not.toThrow();
  for(const override of [{revision:3},{reason:''},{attested:false},{payerSupportsElectronicCorrection:false},{payerControlNumber:''},{payerControlNumber:'x'.repeat(33)}])expect(()=>validateResubmissionRequest(original,{...input,...override})).toThrow();
 });
 it('never sends a new original after an accepted or ambiguous submission',()=>{
  for(const claim_lifecycle of ['submitted','queued','paid'])expect(()=>validateResubmissionRequest({...original,claim_lifecycle},{...input,kind:'original_retry'})).toThrow();
  expect(()=>validateResubmissionRequest({...original,claim_lifecycle:'rejected'},{...input,kind:'original_retry'})).not.toThrow();
 });
 it('requires adjudication for replacement/void and excludes Medicare electronic correction',()=>{
  for(const claim_lifecycle of ['draft','ready','rejected','submitted','queued'])expect(()=>validateResubmissionRequest({...original,claim_lifecycle},input)).toThrow();
  expect(()=>validateResubmissionRequest({...original,payer_name:'Medicare'},input)).toThrow('Medicare');
 });
 it('rechecks the original under lock and rejects changed source or another patient before submission',async()=>{
  const claim={agency_id:1,client_id:2,clinical_session_id:3,metadata_json:{resubmission:{...input,sourceClaimId:11,sourceBillingRevision:4}}};
  const db={execute:vi.fn(async()=>[[original]])};await assertResubmissionSource(claim,db);
  expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  db.execute.mockResolvedValue([[{...original,billing_revision:5}]]);await expect(assertResubmissionSource(claim,db)).rejects.toThrow('changed');
  db.execute.mockResolvedValue([[{...original,client_id:99}]]);await expect(assertResubmissionSource(claim,db)).rejects.toThrow('does not match');
 });
});
