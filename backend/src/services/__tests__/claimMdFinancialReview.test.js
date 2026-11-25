import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:vi.fn(async()=>true)}));
import {recordClaimEvent} from '../claimMdWorkflow.service.js';
import {excludeNoteFromBilling} from '../noteBillingDisposition.service.js';
import {claimFinancialReview,saveClaimPatientEstimate,recordFinalPatientResponsibility} from '../claimFinancialReview.service.js';
import {encryptFamilyBilling} from '../familyBillingEncryption.service.js';
const claim={id:7,agency_id:2,client_id:3,clinical_session_id:4,clinical_note_id:5,billing_revision:2,claim_lifecycle:'ready',claim_status:'READY',amount_cents:13500,payer_sequence:1,metadata_json:'{}',date_of_service:'2026-11-20'};
const fail=(status,message)=>Object.assign(Error(message),{status});
beforeEach(()=>{vi.clearAllMocks();recordClaimEvent.mockResolvedValue(true);vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));});
function transaction(execute){const db={execute:vi.fn(execute),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};return {db,pool:{getConnection:vi.fn(async()=>db)}};}
function financialDb(overrides={}){return transaction(async(sql)=>{
 if(sql.includes('FROM clinical_note_billing_exclusions'))return [[]];
 if(sql.includes('SELECT clinical_session_id'))return [[{clinical_session_id:4}]];
 if(sql.includes('SELECT * FROM clinical_claims'))return [[{...claim,...overrides}]];
 return [{affectedRows:1}];
});}
describe('chart disposition transactions',()=>{
 const input={agencyId:2,noteId:5,actor:{id:90,role:'super_admin'},disposition:'therapy_notes',reason:'Documented in Therapy Notes EHR',confirmed:true};
 function setup(claims=[claim]){return transaction(async(sql)=>{
  if(sql.startsWith('SELECT clinical_session_id'))return [[{clinical_session_id:4}]];
  if(sql.startsWith('SELECT id,clinical_session_id'))return [[{id:5,clinical_session_id:4,provider_signed_at:'2026-11-20'}]];
  if(sql.startsWith('SELECT * FROM clinical_claims'))return [claims];
  if(sql.includes('FROM claimmd_claim_events'))return [[]];
  return [{affectedRows:1,insertId:22}];
 });}
 it('appends actual-actor audit and closes only an unsent claim without changing the signed note',async()=>{
  const d=setup([claim,{...claim,id:8,claim_lifecycle:'submitted',claimmd_submitted_at:'2026-11-20'}]);
  expect(await excludeNoteFromBilling(input,d.pool)).toMatchObject({claimCreated:false,claimsClosed:1});
  const edits=d.db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE clinical_claims'));
  expect(edits).toHaveLength(1);expect(JSON.parse(edits[0][1][0])).toMatchObject({claimClosure:{actorUserId:90,source:'note_billing_disposition',previousLifecycle:'ready'}});
  expect(d.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clinical_notes'))).toBe(false);
  expect(recordClaimEvent).toHaveBeenCalledTimes(2);expect(recordClaimEvent).toHaveBeenCalledWith(expect.objectContaining({actorUserId:90,eventType:'note_billing_disposition'}),d.db);expect(d.db.commit).toHaveBeenCalledOnce();
 });
 it('refuses uncertain transmissions before writing an exclusion',async()=>{
  const d=setup([{...claim,claim_lifecycle:'queued'}]);await expect(excludeNoteFromBilling(input,d.pool)).rejects.toHaveProperty('status',409);
  expect(d.db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(d.db.rollback).toHaveBeenCalledOnce();
 });
 it('rolls back the exclusion and closure if audit persistence fails',async()=>{
  const d=setup();recordClaimEvent.mockRejectedValueOnce(Error('Audit unavailable'));await expect(excludeNoteFromBilling(input,d.pool)).rejects.toThrow('Audit unavailable');expect(d.db.commit).not.toHaveBeenCalled();expect(d.db.rollback).toHaveBeenCalledOnce();expect(d.db.release).toHaveBeenCalledOnce();
 });
});
describe('claim patient estimates',()=>{
 const input={agencyId:2,claimId:7,revision:2,amountCents:null,copayCents:2500,coinsuranceBasisPoints:2000,reason:'Reviewed benefit evidence',actorUserId:90};
 it('saves nullable estimates and revisioned audit without creating a ledger balance',async()=>{
  const d=financialDb();await saveClaimPatientEstimate(input,d.pool);
  const update=d.db.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'));
  expect(JSON.parse(update[1][0]).patientShareEstimate).toMatchObject({amountCents:null,copayCents:2500,coinsuranceBasisPoints:2000,estimateOnly:true,actorUserId:90});
  expect(recordClaimEvent).toHaveBeenCalledWith(expect.objectContaining({eventType:'patient_share_estimate',actorUserId:90}),d.db);
  expect(d.db.execute.mock.calls.some(([sql])=>sql.includes('family_receivables'))).toBe(false);
 });
 it.each([{billing_revision:3},{claim_lifecycle:'queued'}])('rejects a stale or unresolved estimate %o',async change=>{
  const d=financialDb(change);await expect(saveClaimPatientEstimate(input,d.pool)).rejects.toHaveProperty('status',409);expect(recordClaimEvent).not.toHaveBeenCalled();expect(d.db.rollback).toHaveBeenCalledOnce();
 });
});
describe('manual final patient responsibility',()=>{
 const input={agencyId:2,claimId:7,amountCents:2500,reason:'Reviewed final payer EOB',reference:'Portal EOB 123',evidenceIds:['11111111-1111-4111-8111-111111111111'],attested:true,actorUserId:90};
 function setup(change={}){const d=financialDb(change);return {...d,clinical:d.pool,validate:vi.fn(async()=>[{id:input.evidenceIds[0],kind:'final_eob'}]),set:vi.fn(async()=>({id:99})),event:vi.fn(async()=>true)};}
 it('records external adjudication before posting through the existing ledger without fabricating a payer payment',async()=>{
  const d=setup();const result=await recordFinalPatientResponsibility(input,d);expect(result).toMatchObject({ok:true,balanceId:99});
  expect(d.event).toHaveBeenCalledWith(expect.objectContaining({eventType:'external_final_adjudication_recorded',actorUserId:90,payload:expect.objectContaining({evidenceIds:input.evidenceIds})}),d.db);
  expect(d.set).toHaveBeenCalledWith(expect.objectContaining({verificationBasis:'era',responsibilityType:'patient_balance',amountCents:2500,verifiedEvidence:{reference:input.reference,evidenceIds:input.evidenceIds,reviewedBy:90}}));
  expect(d.db.commit.mock.invocationCallOrder[0]).toBeLessThan(d.set.mock.invocationCallOrder[0]);expect(d.db.execute.mock.calls.some(([sql])=>sql.includes('claimmd_payment_postings')||sql.includes('claimmd_submitted_at ='))).toBe(false);
 });
 it.each([{attested:false},{amountCents:-1},{evidenceIds:[]},{amountCents:15000}])('rejects unconfirmed, excessive, or unproved amounts %o',async change=>{
  const d=setup();if(change.evidenceIds)d.validate.mockRejectedValueOnce(fail(409,'Missing proof'));await expect(recordFinalPatientResponsibility({...input,...change},d)).rejects.toBeInstanceOf(Error);expect(d.set).not.toHaveBeenCalled();expect(d.event).not.toHaveBeenCalled();
 });
 it('refuses reused primary-only proof as final responsibility evidence',async()=>{
  const d=setup();d.validate.mockResolvedValue([{kind:'primary_eob'}]);await expect(recordFinalPatientResponsibility(input,d)).rejects.toHaveProperty('status',409);expect(d.set).not.toHaveBeenCalled();
 });
 it('retains the external review on a ledger failure and gives a recoverable explanation',async()=>{
  const d=setup();d.set.mockRejectedValue(fail(409,'Review final secondary coverage'));
  await expect(recordFinalPatientResponsibility(input,d)).rejects.toMatchObject({status:409,message:expect.stringContaining('EOB review is saved')});expect(d.db.commit).toHaveBeenCalledOnce();expect(d.db.rollback).not.toHaveBeenCalled();
 });
 it('uses a stable review event key for a retried save',async()=>{
  const d=setup();await recordFinalPatientResponsibility(input,d);await recordFinalPatientResponsibility(input,d);expect(d.event.mock.calls[0][0].eventKey).toBe(d.event.mock.calls[1][0].eventKey);
 });
});
it('reports a final zero responsibility after an externally collected copay requires refund review',async()=>{
 const clinical={execute:vi.fn(async sql=>sql.startsWith('SELECT *')?[[claim]]:sql.includes('posting_count')?[[{posting_count:0}]]:[[]])};
 const main={execute:vi.fn(async()=>[[{id:9,source_type:'claim_responsibility',amount_cents:2500,paid_cents:2500,status:'paid',source_payload:encryptFamilyBilling({verificationBasis:'era',finalPatientResponsibilityCents:0},'receivable:2:3')}]])};
 const data=await claimFinancialReview({agencyId:2,claimId:7},{clinical,main,insurance:async()=>({primary:{payerId:'PAYER',copay:'25'}}),coverage:async()=>({checks:[]})});
 expect(data).toMatchObject({hasFinalPatientResponsibility:true,finalPatientResponsibilityCents:0,policy:{copayCents:2500,coinsuranceBasisPoints:null}});expect(data.balances[0]).not.toHaveProperty('source_payload');expect(data.flags).toEqual([]);
});

it('does not label primary remittance responsibility final when secondary coverage is still outstanding',async()=>{
 const clinical={execute:vi.fn(async sql=>sql.startsWith('SELECT *')?[[claim]]:sql.includes('posting_count')?[[{posting_count:1,responsibility_cents:2500,paid_cents:10000,adjustment_cents:3500}]]:[[]])};
 const data=await claimFinancialReview({agencyId:2,claimId:7},{clinical,main:{execute:async()=>[[]]},insurance:async()=>({primary:{payerId:'PAYER'},secondary:{payerId:'MEDICAID'}}),coverage:async()=>({checks:[]})});
 expect(data.hasPostedAdjudication).toBe(true);expect(data.hasFinalPatientResponsibility).toBe(false);
});
