import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {claimProcessorDispatch} from '../familyLedger/paymentDispatch.js';
function fixture({started=false,status='pending',intentId=null}={}) {
  const state={started,status,intentId,audits:0};
  const database={execute:vi.fn(async(sql)=>{
    if(sql.startsWith('UPDATE family_ledger_payments SET processor_dispatch_started_at')){
      if(state.started||state.status!=='pending'||state.intentId)return [{affectedRows:0}];
      state.started=true;return [{affectedRows:1}];
    }
    if(sql.startsWith('SELECT processor_intent_id'))return [[{processor_intent_id:state.intentId,status:state.status}]];
    if(sql.startsWith("UPDATE family_ledger_payments SET status='cancelled'")){
      if(state.status==='pending'&&!state.intentId){state.status='cancelled';return [{affectedRows:1}];}return [{affectedRows:0}];
    }
    if(sql.startsWith('INSERT INTO family_billing_audit')){state.audits++;return [{affectedRows:1}];}
    throw new Error('Unexpected SQL');
  })};
  return {state,database};
}
const input={attempt:{id:90},agencyId:2,userId:22,allocationId:91,automatic:true};
it('cancels a known never-dispatched attempt if midnight passes, preserving an audit',async()=>{
  const f=fixture(),checkDate=vi.fn().mockRejectedValue(Object.assign(new Error('service date passed'),{code:'COPAY_AFTER_SERVICE_DATE'}));
  await expect(claimProcessorDispatch(input,{database:f.database,checkDate})).rejects.toMatchObject({code:'COPAY_AFTER_SERVICE_DATE'});
  expect(f.state).toMatchObject({status:'cancelled',started:true,audits:1});
});
it('never cancels an ambiguous existing dispatch with no saved processor reference',async()=>{
  const f=fixture({started:true}),checkDate=vi.fn().mockRejectedValue(new Error('late'));
  await expect(claimProcessorDispatch(input,{database:f.database,checkDate})).rejects.toThrow(/reconciliation/);
  expect(checkDate).not.toHaveBeenCalled();expect(f.state.status).toBe('pending');
});
it('only one concurrent worker can start a processor request',async()=>{
  const f=fixture(),checkDate=vi.fn().mockResolvedValue();
  const results=await Promise.allSettled([claimProcessorDispatch(input,{database:f.database,checkDate}),claimProcessorDispatch(input,{database:f.database,checkDate})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(checkDate).toHaveBeenCalledTimes(1);
});
it('existing processor references remain available for read-only reconciliation after the service day',async()=>{
  const f=fixture({started:true,intentId:'pi_existing'}),checkDate=vi.fn().mockRejectedValue(new Error('late'));
  expect(await claimProcessorDispatch({...input,attempt:{id:90,processor_intent_id:'pi_existing'}},{database:f.database,checkDate})).toEqual({intentId:'pi_existing'});
  expect(checkDate).not.toHaveBeenCalled();expect(f.database.execute).not.toHaveBeenCalled();
});
it('authorized installment plans and patient-initiated payments do not use the session-day cutoff',async()=>{
  const checkDate=vi.fn();
  for(const patch of [{planId:5},{automatic:false}]){
    const f=fixture();expect(await claimProcessorDispatch({...input,...patch},{database:f.database,checkDate})).toEqual({intentId:null});
  }
  expect(checkDate).not.toHaveBeenCalled();
});
