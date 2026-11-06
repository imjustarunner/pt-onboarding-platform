import { describe,it,expect,vi } from 'vitest';
import { billingWorkStage,normalizeBillingWorkItem,filterBillingWorkItems,loadBillingWorkItems } from '../billingWorkItems.service.js';

describe('unified billing work stages',()=>{
 it.each([
  [{},'note_needed'],[{draft_id:3},'draft'],[{clinical_note_id:4},'draft'],
  [{clinical_note_id:4,provider_signed_at:'2026-11-01'},'pending_review'],
  [{provider_signed_at:'2026-11-01',supervisor_cosigned_at:'2026-11-02'},'ready_to_submit'],
  [{provider_signed_at:'2026-11-01',effective_revision_id:7,requires_supervisor_cosign:0,is_billable:1,has_original_signature:1},'ready_to_submit'],
  [{provider_signed_at:'2026-11-01',effective_revision_id:7,requires_supervisor_cosign:0,is_billable:'true',has_original_signature:1},'ready_to_submit'],
  [{provider_signed_at:'2026-11-01',effective_revision_id:7,requires_supervisor_cosign:0,is_billable:1},'pending_review'],
  [{approved_at:'2026-11-02',pending_revision_id:9,pending_revision_origin:'supervisor'},'pending_review'],
  [{approved_at:'2026-11-02',pending_revision_id:9,pending_revision_origin:'provider',pending_author_signed:0},'draft'],
  [{approved_at:'2026-11-02',pending_revision_id:9,pending_revision_origin:'provider',pending_author_signed:1},'pending_review'],
  [{review_requests_json:[{action:'changes_needed'}],provider_signed_at:'2026-11-01'},'revisions_needed'],
  [{review_requests_json:[{action:'review_acknowledge'}],approved_at:'2026-11-02'},'ready_to_submit'],
  [{claim_lifecycle:'submitted',pending_revision_id:9},'submitted'],[{claim_lifecycle:'queued'},'processing'],
  [{claim_lifecycle:'paid'},'paid'],[{claim_lifecycle:'denied'},'denied'],[{claim_lifecycle:'rejected'},'rejected'],[{claim_lifecycle:'void'},'closed']
 ])('derives %s as %s from persisted evidence',(row,stage)=>expect(billingWorkStage(row)).toBe(stage));
 it('never authorizes draft/pending/revision rows to review or submit a claim',()=>{
  for(const row of [{clinical_note_id:4},{clinical_note_id:4,provider_signed_at:'today'},{clinical_note_id:4,review_requests_json:[{action:'changes_needed'}]}]){
   const item=normalizeBillingWorkItem({...row,claimId:7,agency_id:1,client_id:3});expect(item.readOnly).toBe(true);expect(item.canReviewClaim).toBe(false);expect(item.canSubmit).toBe(false);
  }
 });
 it('links approved missing claims without pretending a note ID is a claim ID',()=>{
  const item=normalizeBillingWorkItem({agency_id:1,client_id:3,clinical_note_id:7,clinical_session_id:9,approved_at:'today',encounter_context_json:{dateOfService:'2026-11-03',serviceCode:'H0002',placeOfService:'10',billingPrimaryUnits:1}});
  expect(item).toMatchObject({id:null,key:'note:7',source:'note',canPrepareClaim:true,canReviewClaim:false,stage:'ready_to_submit',service_code:'H0002',units:1,place_of_service:'10'});
 });
 it('keeps Denver service day for past sessions while prioritizing signed service dates',()=>{
  expect(normalizeBillingWorkItem({scheduled_start_at:'2026-11-04 01:00:00',source_timezone:'America/Denver'}).date_of_service).toBe('2026-11-03');
  expect(normalizeBillingWorkItem({date_of_service:'2026-11-02',scheduled_start_at:'2026-11-04 01:00:00'}).date_of_service).toBe('2026-11-02');
 });
});

describe('all claims filtering and sorting',()=>{
 const rows=[{key:'note:1',agency_id:1,client_id:2,client_name:'Demo Zebra',stage:'pending_review',date_of_service:'2026-11-01'},{key:'claim:4',agency_id:2,client_id:3,client_name:'Demo Alpha',stage:'ready_to_submit',service_code:'H0002',date_of_service:'2026-11-02'}];
 it('all includes clinical work and claims, then sorts across organizations',()=>{
  expect(filterBillingWorkItems(rows,{status:'all',sortBy:'client_name',direction:'asc'}).map(r=>r.key)).toEqual(['claim:4','note:1']);
  expect(filterBillingWorkItems(rows,{sortBy:'organization',direction:'asc'},[{id:1,name:'Z tenant'},{id:2,name:'A tenant'}]).map(r=>r.key)).toEqual(['claim:4','note:1']);
 });
 it('supports patient/service search, new stages and exact client history',()=>{
  expect(filterBillingWorkItems(rows,{search:'alpha',status:'ready_to_submit'})).toHaveLength(1);
  expect(filterBillingWorkItems(rows,{search:'H0002'})).toHaveLength(1);
  expect(filterBillingWorkItems(rows,{clientId:2})).toEqual([rows[0]]);
  expect(()=>filterBillingWorkItems(rows,{sortBy:'DROP TABLE'})).toThrow('sort');
  expect(()=>filterBillingWorkItems(rows,{clientId:'x'})).toThrow('client');
 });
});

it('merges drafts only through exact encounter identities and never mutates a record on read',async()=>{
 const deps={clinical:{execute:vi.fn(async sql=>sql.includes('FROM clinical_claims c LEFT')?[[{claimId:1,agency_id:1,client_id:2,clinical_session_id:8,clinical_note_id:4,provider_signed_at:'today',supervisor_cosigned_at:'today'}]]:[[ {agency_id:1,client_id:3,clinical_session_id:9,service_code:'90834',date_of_service:'2026-11-02'}]])},main:{execute:vi.fn(async sql=>{
  if(sql.includes('FROM clinical_note_drafts'))return [[{draft_id:5,agency_id:1,client_id:2,clinical_session_id:8},{draft_id:6,agency_id:1,client_id:3,clinical_session_id:9},{draft_id:7,agency_id:1,client_id:3,clinical_session_id:10}]];
  if(sql.includes('FROM appointments'))return [[]];
  if(sql.includes('FROM clients'))return [[{id:2,agency_id:1,full_name:'Demo Two'},{id:3,agency_id:1,full_name:'Demo Three'}]];
  return [[]];
 })}};
 const result=await loadBillingWorkItems([1],deps);
 expect(result.items).toHaveLength(3);
 expect(result.items.find(r=>r.clinical_session_id===8)).toMatchObject({stage:'ready_to_submit',claimId:1});
 expect(result.items.find(r=>r.clinical_session_id===9)).toMatchObject({stage:'draft',draft_id:6,client_name:'Demo Three'});
 expect(result.items.find(r=>r.clinical_session_id===10).draft_id).toBe(7);
 for(const [sql] of [...deps.clinical.execute.mock.calls,...deps.main.execute.mock.calls])expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
 expect(deps.clinical.execute.mock.calls[1][0]).toContain('COALESCE(s.scheduled_end_at,s.scheduled_start_at)<UTC_TIMESTAMP()');
 expect(deps.main.execute.mock.calls.find(([sql])=>sql.includes('FROM appointments'))[0]).toContain('COALESCE(a.end_at,a.start_at)<UTC_TIMESTAMP()');
});
