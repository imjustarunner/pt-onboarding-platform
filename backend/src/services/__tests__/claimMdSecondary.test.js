import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn()}));
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:vi.fn()}));
import {validatePrimaryAdjudication,secondaryInsurance,applySecondaryAdjudication,prepareSecondaryClaim} from '../secondaryClaim.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {readClientInsurance} from '../clientInsurance.service.js';
const charge={proc_code:'90834',charge:'100.00',units:'1'},input=()=>({attested:true,crossoverConfirmedAbsent:true,reference:'ERA 123 verified',primaryClaimControlNumber:'ICN123',paymentDate:'2026-09-24',lines:[{paidCents:7000,adjustments:[{code:'CO45',amountCents:2000},{code:'PR1',amountCents:1000}]}]});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));readClientInsurance.mockResolvedValue({primary:{payerId:'PRIMARY'},secondary:{payerId:'SECOND',insurerName:'Second'}});});
describe('secondary coordination of benefits',()=>{
 it('maps primary payment and CAS adjustments while preserving full charges',()=>{
  const cob=validatePrimaryAdjudication(input(),[charge]),payload=applySecondaryAdjudication({payerid:'SECOND',other_payerid:'PRIMARY',remote_claimid:'PT-1-11',charge:[charge]},cob);
  expect(payload).toMatchObject({payerid:'SECOND',other_payerid:'PRIMARY',payer_order:'Secondary',amount_paid:'70.00',other_ins_payment_date:'20260924',charge:[{charge:'100.00',primary_paid_amount:'70.00',primary_paid_date:'20260924',adj_code_1:'CO45',adj_amt_1:'20.00',adj_code_2:'PR1',adj_amt_2:'10.00'}]});
  expect(payload).not.toHaveProperty('icn_dcn_1'); // Primary ICN must not masquerade as a replacement ICN for the destination payer.
 });
 it('allows documented zero-payment adjudication and blocks unbalanced or duplicate-crossover proposals',()=>{
  expect(validatePrimaryAdjudication({...input(),lines:[{paidCents:0,adjustments:[{code:'CO96',amountCents:10000}]}]},[charge]).lines[0].paidCents).toBe(0);
  for(const changes of [{attested:false},{crossoverConfirmedAbsent:false},{lines:[]},{lines:[{paidCents:10000,adjustments:[{code:'PR1',amountCents:1000}]}]},{lines:[{paidCents:-1,adjustments:[]}]},{primaryClaimControlNumber:''}])expect(()=>validatePrimaryAdjudication({...input(),...changes},[charge])).toThrow();
 });
 it('rejects changing services underneath primary adjudication',()=>{
  const cob=validatePrimaryAdjudication(input(),[charge]);for(const change of [{proc_code:'90837'},{units:'2'},{charge:'110.00'},{mod1:'GT'},{from_date:'2026-09-21'}])expect(()=>applySecondaryAdjudication({charge:[{...charge,...change}]},cob)).toThrow(/differ/);
 });
 it('targets secondary while retaining the original primary subscriber identity',()=>{
  const insurance={primary:{payerId:'P',memberId:'P-MEMBER'},secondary:{payerId:'S',memberId:'S-MEMBER'},patient:{firstName:'Test'}};expect(secondaryInsurance(insurance)).toMatchObject({primary:insurance.secondary,secondary:insurance.primary});expect(insurance.primary.payerId).toBe('P');expect(()=>secondaryInsurance({...insurance,secondary:insurance.primary})).toThrow();
 });
 function setup(existing){
  const parent={id:7,agency_id:1,client_id:3,clinical_session_id:2,payer_sequence:1,claimmd_submitted_at:'2026-09-20',claimmd_claim_id:'remote7',claim_lifecycle:'paid',billing_revision:0};
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
   if(sql.startsWith('SELECT id,encounter_status'))return [[{id:2,encounter_status:'completed'}]];
   if(sql.startsWith('SELECT clinical_session_id'))return [[{clinical_session_id:2}]];
   if(sql.startsWith('SELECT * FROM clinical_claims WHERE id='))return [[parent]];
   if(sql.includes('clinical_claim_change_requests'))return [[]];
   if(sql.includes('SELECT event_key'))return [[{event_key:'submission:1',payload_encrypted:encryptFamilyBilling({payload:{payerid:'PRIMARY',charge:[charge]}},'claimmd:1:7:submission:1')}]];
   if(sql.startsWith('SELECT * FROM clinical_claims WHERE agency_id='))return [existing?[existing]:[]];
   return [{insertId:11,affectedRows:1}];
  })};return {db,source:{getConnection:async()=>db}};
 }
 it('creates one linked draft transactionally without altering primary payment status or transmitting',async()=>{
  const {db,source}=setup();expect(await prepareSecondaryClaim({agencyId:1,parentClaimId:7,actorUserId:9,adjudication:input()},source)).toEqual({claimId:11,parentClaimId:7,claimTransmitted:false});
  const update=db.execute.mock.calls.find(([s])=>s.startsWith('UPDATE clinical_claims'));
  expect(update[1].slice(-2)).toEqual([11,1]);expect(decryptFamilyBilling(update[1][0],'claim-cob:1:11')).toMatchObject({parentClaimId:7,reference:'ERA 123 verified'});expect(db.commit).toHaveBeenCalled();
 });
 it('updates the same unsent secondary draft and refuses previously transmitted or deleted children',async()=>{
  const {db,source}=setup({id:11,claim_status:'PENDING',claim_lifecycle:'draft'});await prepareSecondaryClaim({agencyId:1,parentClaimId:7,actorUserId:9,adjudication:input()},source);expect(db.execute.mock.calls.some(([s])=>s.startsWith('INSERT INTO clinical_claims'))).toBe(false);
  for(const child of [{id:11,claim_lifecycle:'paid'},{id:11,is_deleted:1}]){const s=setup(child);await expect(prepareSecondaryClaim({agencyId:1,parentClaimId:7,actorUserId:9,adjudication:input()},s.source)).rejects.toMatchObject({status:409});expect(s.db.commit).not.toHaveBeenCalled();}
 });
});
