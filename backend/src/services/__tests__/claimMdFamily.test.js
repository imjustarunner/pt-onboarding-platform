import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {claimFamilies,collapseClaimAttempts,loadClaimFamily} from '../claimFamily.service.js';
import {filterBillingWorkItems,matchesClaimQueue} from '../billingWorkItems.service.js';

const row=(id,source=null,extra={})=>({id,claimId:id,agency_id:2,client_id:7,clinical_session_id:71,payer_sequence:1,parent_claim_id:null,claim_reference:'002-2026-11-009',key:`claim:${id}`,stage:'rejected',resubmission:source?{sourceClaimId:source}:null,...extra});
describe('one claim with retained submission attempts',()=>{
 it('groups only explicit chains, keeps the original number, and counts the latest state once',()=>{
  const items=collapseClaimAttempts([row(11),row(12,11,{attempt_reference:'002-2026-11-010'}),row(13,12,{stage:'submitted'}),row(14,null,{claim_reference:'002-2026-11-012'}),row(15,null,{payer_sequence:2,parent_claim_id:13,claim_reference:'002-2026-11-013'})]);
  expect(items).toHaveLength(3);expect(items[0]).toMatchObject({id:13,claim_root_id:11,claim_reference:'002-2026-11-009',attempt_count:3,attempt_ids:[11,12,13],stage:'submitted'});
  expect(items[0].claim_aliases).toContain('002-2026-11-010');expect(filterBillingWorkItems(items,{search:'002-2026-11-010'}).map(x=>x.id)).toEqual([13]);
  expect(filterBillingWorkItems(items,{status:'pending_resubmission'}).map(x=>x.id)).toEqual([14,15]);
 });
 it.each([{agency_id:3},{client_id:8},{clinical_session_id:72},{payer_sequence:2},{parent_claim_id:99}])('refuses a linked attempt outside the same service scope: %j',extra=>{
  expect(()=>claimFamilies([row(11),row(12,11,extra)])).toThrow('different service');
 });
 it('refuses orphan and cyclic links instead of presenting an invented claim',()=>{
  expect(()=>claimFamilies([row(12,11)])).toThrow('unavailable');expect(()=>claimFamilies([row(11,12),row(12,11)])).toThrow('circular');
 });
 it('separates pending initial, retry, information-required and open filters',()=>{
  const initial=row(11,null,{stage:'ready_to_submit'}),retry=row(12,11,{stage:'ready_to_submit'}),denied=row(13,null,{stage:'denied'});
  expect(matchesClaimQueue(initial,'pending_initial_submission')).toBe(true);expect(matchesClaimQueue(retry,'pending_initial_submission')).toBe(false);
  expect(matchesClaimQueue(retry,'pending_resubmission')).toBe(true);expect(matchesClaimQueue(denied,'pending_resubmission')).toBe(false);
  expect(matchesClaimQueue(row(14),'information_required')).toBe(true);expect(matchesClaimQueue(row(15,null,{stage:'paid'}),'open')).toBe(false);
 });
});
function familyDb(rows){return {execute:vi.fn(async sql=>{
 if(sql.startsWith('SELECT id,agency_id,client_id,clinical_session_id,payer_sequence,parent_claim_id FROM'))return [[rows.at(-1)]];
 if(sql.startsWith('WITH RECURSIVE'))return [rows.map(r=>({agency_id:2,clinical_claim_id:r.id,root_claim_id:11,public_reference:'002-2026-11-009',attempt_reference:`alias-${r.id}`}))];
 return [rows];
})};}
const raw=(id,source,extra={})=>({id,agency_id:2,client_id:7,clinical_session_id:71,payer_sequence:1,metadata_json:source?{resubmission:{sourceClaimId:source}}:{},...extra});
it('uses the public claim number for a new original and preserves the actual transmitted legacy number across retries',async()=>{
 let family=await loadClaimFamily(2,11,familyDb([raw(11)]));expect(family.patientControlNumber).toBe('002-2026-11-009');
 family=await loadClaimFamily(2,13,familyDb([raw(11,null,{claimmd_submitted_at:'2026-11-05'}),raw(12,11,{claimmd_submitted_at:'2026-11-05'}),raw(13,12)]));
 expect(family.claimReference).toBe('002-2026-11-009');expect(family.patientControlNumber).toBe('12');
 family=await loadClaimFamily(2,13,familyDb([raw(11,null,{claimmd_submitted_at:'2026-11-05',claim_number:'002-2026-11-009'}),raw(13,11,{metadata_json:{resubmission:{sourceClaimId:11,patientControlNumber:'002-2026-11-009'}}})]));
 expect(family.patientControlNumber).toBe('002-2026-11-009');
});
