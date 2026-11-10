import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {createAssistantBillingSubmission,billingAssistantReady,BILLING_BOT_INSTRUCTIONS} from '../assistantBillingSubmission.service.js';
import {invokeAssistantBillingSubmission,assistantBillingAuthorization} from '../assistantBillingCommand.service.js';
import {hasVerifiedBillingScope} from '../../utils/verifiedBillingScope.js';
const batchRef='11111111-1111-4111-8111-111111111111',itemRef='22222222-2222-4222-8222-222222222222';
const ready=()=>({claim:{id:91,client_id:999,claim_lifecycle:'ready'},readiness:{ready:true},aiReview:{status:'passed',findings:[]},reviewHash:'a'.repeat(64),payload:{pat_name_f:'MUST_NOT_LEAK',ins_number:'PRIVATE_MEMBER'}});
function fixture(){
 const account={id:5,user_id:700,agency_id:2,subrole:'billing',policy_revision:1},rule={id:1,revision:1,status:'active',authorized_by_user_id:501,authorized_by_name:'Michael Mendez',authorized_at:'2026-11-09',agency_ids_json:[2,6,377],instructions_json:BILLING_BOT_INSTRUCTIONS};
 const batch={id:8,ref:batchRef,rule_id:1,rule_revision:1,account_id:5,account_revision:1,agency_id:2,requested_by_user_id:501,requested_by_name:'Michael Mendez',state:'prepared',expires_at:'2026-11-10T01:00:00Z',packet_encrypted:{items:[{ref:itemRef,claimId:91,clientId:999,reviewHash:'a'.repeat(64)}]}};
 const db={execute:vi.fn(async(sql,params=[])=>{
  if(sql.includes('FROM assistant_accounts'))return [[account]];
  if(sql.includes('FROM assistant_billing_rules'))return [[rule]];
  if(sql.includes('FROM assistant_billing_batches'))return [sql.includes("state='prepared'")?(batch.state==='prepared'?[batch]:[]):[batch]];
  if(sql.includes('FROM agencies'))return [[{feature_flags:{medicalBillingEnabled:true,insuranceVerificationTasks:{taskListId:16}}}]];
  if(sql.startsWith("UPDATE assistant_billing_batches SET state='processing'")){
   if(batch.state!=='prepared'||(batch.results_json||[]).length!==params[1])return [{affectedRows:0}];
   batch.state='processing';return [{affectedRows:1}];
  }
  if(sql.startsWith('UPDATE assistant_billing_batches SET results_json=')){batch.results_json=JSON.parse(params[0]);return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE assistant_billing_batches SET state=?')){batch.state=params[0];batch.results_json=JSON.parse(params[1]);return [{affectedRows:1}];}
  return [[]];
 })};
 const clinical={execute:vi.fn(async sql=>sql.startsWith('SELECT id FROM')?[[{id:91}]]:[[ {client_id:999,claim_lifecycle:'ready'} ]])};
 const d={db,clinical,owner:vi.fn(async()=>({id:501})),execute:vi.fn(),connection:async()=>({mode:'live'}),prepare:vi.fn(async()=>ready()),invoke:vi.fn(async()=>({accepted:true,raw:'PRIVATE_MEMBER'})),queueIssue:vi.fn(),encrypt:value=>value,decrypt:value=>value,now:()=>new Date('2026-11-09T20:00:00Z')};
 return {account,rule,batch,db,clinical,d,service:createAssistantBillingSubmission(d)};
}
const input=()=>({ruleNumber:'BILL-000001',ruleRevision:1,itemRefs:[itemRef]});
describe('ready-only Billing Assistant batches',()=>{
 it('releases only opaque references and readiness facts, never client or claim details',async()=>{
  const f=fixture(),result=await f.service.batches(700),json=JSON.stringify(result);
  expect(result.batches[0].items[0]).toMatchObject({ref:itemRef,status:'READY'});
  for(const secret of ['MUST_NOT_LEAK','PRIVATE_MEMBER','claimId','clientId','reviewHash','"payload":'])expect(json).not.toContain(secret);
 });
 it.each([{claim:{claim_lifecycle:'submitted'}},{readiness:{ready:false}},{aiReview:{status:'required'}},{aiReview:{status:'passed',findings:[{message:'Needs review'}]}}])('withholds non-ready state %j',async change=>{
  const f=fixture();f.d.prepare.mockResolvedValue({...ready(),...change});expect((await f.service.batches(700)).batches).toEqual([]);expect(f.d.invoke).not.toHaveBeenCalled();
 });
 it('records the real assistant executor, human authorization, rule and batch while sanitizing results',async()=>{
  const f=fixture(),result=await f.service.submit(700,batchRef,input());
  expect(f.d.invoke).toHaveBeenCalledWith(expect.objectContaining({account:f.account,claimId:91,authorization:expect.objectContaining({ruleNumber:'BILL-000001',ruleRevision:1,authorizedByUserId:501,performedByUserId:700,batchRef})}));
  expect(result.results[0].status).toBe('CLAIMMD_ACKNOWLEDGED');expect(JSON.stringify(result)).not.toMatch(/PRIVATE_MEMBER|claimId|clientId|MUST_NOT_LEAK/);
 });
 it('keeps unselected claims available after an individual submission and excludes attempted references',async()=>{
  const f=fixture(),secondRef='33333333-3333-4333-8333-333333333333';
  f.batch.packet_encrypted.items.push({ref:secondRef,claimId:92,clientId:998,reviewHash:'a'.repeat(64)});
  const first=await f.service.submit(700,batchRef,input());
  expect(first).toMatchObject({remainingCount:1,reconciliationRequired:false});expect(f.batch.state).toBe('prepared');
  expect((await f.service.batches(700)).batches[0].items.map(item=>item.ref)).toEqual([secondRef]);
  await expect(f.service.submit(700,batchRef,input())).rejects.toMatchObject({code:'BILLING_ITEM_SCOPE'});
  expect(f.d.invoke).toHaveBeenCalledTimes(1);
  const second=await f.service.submit(700,batchRef,{...input(),itemRefs:[secondRef]});
  expect(second.results).toHaveLength(1);expect(second.results[0].ref).toBe(secondRef);expect(second.remainingCount).toBe(0);
  expect(f.batch.state).toBe('completed');expect(f.batch.results_json).toHaveLength(2);expect(f.d.invoke).toHaveBeenCalledTimes(2);
  const replay=await f.service.submit(700,batchRef,{...input(),itemRefs:[secondRef]});
  expect(replay.reused).toBe(true);expect(replay.results.map(result=>result.ref)).toEqual([secondRef]);expect(f.d.invoke).toHaveBeenCalledTimes(2);
 });
 it('rejects a stale reservation after another individual request records progress',async()=>{
  const f=fixture(),execute=f.db.execute.getMockImplementation();
  f.db.execute.mockImplementation(async(sql,params)=>{
   if(sql.startsWith("UPDATE assistant_billing_batches SET state='processing'")){
    f.batch.results_json=[{ref:itemRef,status:'CLAIMMD_ACKNOWLEDGED'}];
   }
   return execute(sql,params);
  });
  await expect(f.service.submit(700,batchRef,input())).rejects.toMatchObject({code:'BILLING_BATCH_RECONCILE'});
  expect(f.d.invoke).not.toHaveBeenCalled();
 });
 it('holds a source changed since preparation and creates an urgent billing issue',async()=>{
  const f=fixture();f.d.prepare.mockResolvedValue({...ready(),reviewHash:'b'.repeat(64)});
  expect((await f.service.submit(700,batchRef,input())).results[0].status).toBe('HELD_FOR_BILLING');expect(f.d.invoke).not.toHaveBeenCalled();expect(f.d.queueIssue).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,claimId:91,taskListId:16}));
 });
 it('stops on an uncertain upload and never retries its reserved batch',async()=>{
  const f=fixture();f.d.invoke.mockRejectedValue(new Error('Unknown upload'));
  f.clinical.execute.mockResolvedValue([[{client_id:999,claim_lifecycle:'queued'}]]);
  expect((await f.service.submit(700,batchRef,input())).reconciliationRequired).toBe(true);
  f.batch.state='reconciliation_required';await expect(f.service.submit(700,batchRef,input())).rejects.toMatchObject({code:'BILLING_BATCH_RECONCILE'});expect(f.d.invoke).toHaveBeenCalledTimes(1);
 });
 it('denies revoked rules, stale configurations, expired batches and injected claim IDs',async()=>{
  for(const change of ['revoked','stale','expired','injected']){const f=fixture();if(change==='revoked')f.rule.status='revoked';if(change==='stale')f.account.policy_revision=2;if(change==='expired')f.batch.expires_at='2026-11-08';await expect(f.service.submit(700,batchRef,{...input(),...(change==='injected'?{claimId:91}:{})})).rejects.toBeTruthy();expect(f.d.invoke).not.toHaveBeenCalled();}
 });
 it('enforces current execution verification and company access',async()=>{
  const f=fixture();f.d.execute.mockRejectedValue(new Error('Not verified'));await expect(f.service.batches(700)).rejects.toThrow('Not verified');expect(f.d.prepare).not.toHaveBeenCalled();
 });
 it('does not make a batch from the queue label alone',async()=>{
  const f=fixture();f.d.prepare.mockResolvedValue({...ready(),readiness:{ready:false}});
  expect(await f.service.createBatch({id:501},1,{agencyId:2})).toMatchObject({prepared:false,readyCount:0,heldCount:1});
 });
 it('uses private server authority that HTTP input cannot manufacture',async()=>{
  expect(assistantBillingAuthorization({body:{authorization:{ruleNumber:'FORGED'}}})).toBeNull();
  const f=fixture();let seen;
  await invokeAssistantBillingSubmission({account:f.account,claimId:91,reviewHash:'a'.repeat(64),mode:'live',validate:async()=>{},authorization:{ruleNumber:'BILL-000001',performedByUserId:700}},async(req,res)=>{seen=req;expect(hasVerifiedBillingScope(req.user,2)).toBe(true);expect(req.user.id).toBe(700);expect(assistantBillingAuthorization(req).ruleNumber).toBe('BILL-000001');res.json({accepted:true});});
  expect(assistantBillingAuthorization(seen)).toBeNull();
 });
});
