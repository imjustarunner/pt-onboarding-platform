import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {billingDashboardSummary} from '../claimMdWorkspace.service.js';
import {matchesClaimQueue} from '../billingWorkItems.service.js';
import {suggestionForSignal,listBillingSuggestions} from '../billingOutcomeLearning.service.js';

const user={id:55,role:'admin'};
const agency=id=>({id,name:`Agency ${id}`,slug:`agency-${id}`,organization_type:'agency',is_active:1,feature_flags:{medicalBillingEnabled:true}});
const claim=(claimId,claim_lifecycle,extra={})=>({claimId,claim_lifecycle,agency_id:2,client_id:100+claimId,clinical_session_id:200+claimId,payer_sequence:1,claim_metadata_json:{},...extra});
function fixture(){
 const rows=[claim(1,'rejected'),claim(2,'submitted',{client_id:101,clinical_session_id:201,claim_metadata_json:{resubmission:{sourceClaimId:1}}}),claim(3,'ready'),claim(4,'draft'),claim(5,'denied'),claim(6,'paid'),claim(7,'ready'),claim(8,'ready',{claim_metadata_json:{hiddenFromQueue:true}})];
 const tasks=[{agency_id:2,claim_id:'1'},{agency_id:2,claim_id:'3'},{agency_id:2,claim_id:'3'},{agency_id:2,claim_id:'6'}];
 const deps={memberships:vi.fn(async()=>[agency(2),agency(6)]),managed:vi.fn(async()=>[]),canAccess:vi.fn(async(_user,id)=>id===2),main:{execute:vi.fn(async sql=>sql.includes('FROM clients')?[[{id:107,agency_id:2}]]:sql.includes('FROM tasks')?[tasks]:[[]])},clinical:{execute:vi.fn(async()=>[rows])}};
 return {rows,tasks,deps};
}

describe('billing dashboard summary',()=>{
 it('counts one claim history, separates saved issues and review, and omits closed/demo/hidden claims',async()=>{
  const {deps}=fixture(),result=await billingDashboardSummary(user,{agencyId:2},deps);
  expect(result.counts).toEqual({submitted:1,review:1,needsHelp:2});
  expect(result.organizations).toEqual([{id:2,name:'Agency 2',slug:'agency-2'}]);
  expect(JSON.stringify(result)).not.toMatch(/client_id|claimId|payload|amount|insurance/);
  for(const [,params] of deps.clinical.execute.mock.calls)expect(params).toEqual([2]);
 });
 it('rejects forged company scopes before reading claims',async()=>{
  for(const agencyId of [6,999,'all','2 OR 1=1']){const {deps}=fixture();await expect(billingDashboardSummary(user,{agencyId},deps)).rejects.toMatchObject({status:403});expect(deps.clinical.execute).not.toHaveBeenCalled();}
 });
 it('does not fetch claims without billing access or for ordinary provider identities',async()=>{
  const {deps}=fixture();deps.canAccess.mockResolvedValue(false);
  expect((await billingDashboardSummary(user,{},deps)).organizations).toEqual([]);expect(deps.clinical.execute).not.toHaveBeenCalled();
  await expect(billingDashboardSummary({id:55,role:'provider'}, {},deps)).rejects.toMatchObject({status:403});
 });
 it('reports an unavailable database instead of showing reassuring zero counts',async()=>{
  const {deps}=fixture();deps.main.execute.mockRejectedValue(new Error('Database unavailable'));
  await expect(billingDashboardSummary(user,{},deps)).rejects.toThrow('Database unavailable');
 });
 it('uses the same categories when opening the work queue',()=>{
  expect(matchesClaimQueue({...claim(3,'ready'),stage:'ready_to_submit',billing_issue_open:true},'needs_help')).toBe(true);
  expect(matchesClaimQueue({...claim(3,'ready'),stage:'ready_to_submit',billing_issue_open:true},'needs_review')).toBe(false);
  expect(matchesClaimQueue({...claim(4,'draft'),stage:'draft'},'needs_review')).toBe(true);
  expect(matchesClaimQueue({...claim(2,'submitted'),stage:'submitted',billing_issue_open:true},'submitted_or_processing')).toBe(true);
 });
 it('treats uncertain uploads with a saved billing issue as needing help',async()=>{
  const {rows,deps}=fixture();rows.splice(0,rows.length,claim(3,'queued'));
  expect((await billingDashboardSummary(user,{agencyId:2},deps)).counts).toEqual({submitted:0,review:0,needsHelp:1});
 });
 it('keeps a submitted claim with a pending service correction in the help queue',async()=>{
  const {rows,deps}=fixture();rows.splice(0,rows.length,claim(9,'submitted',{service_change_pending:1}));
  expect((await billingDashboardSummary(user,{agencyId:2},deps)).counts).toEqual({submitted:0,review:0,needsHelp:1});
 });
});

describe('saved billing corrections need no owner acceptance',()=>{
 it('records rejection signals without inventing a generic change to accept',()=>{
  expect(suggestionForSignal({outcome:'rejected',reasonCode:'REVIEW',payerId:'COCHA',serviceCode:'H0002'})).toBeNull();
 });
 it('withholds existing generic review prompts while retaining concrete future-default suggestions',async()=>{
  const db={execute:vi.fn(async()=>[[]])};await listBillingSuggestions(2,db);
  expect(db.execute.mock.calls[0][0]).toContain("kind IN ('modifier','place_of_service')");
 });
});
