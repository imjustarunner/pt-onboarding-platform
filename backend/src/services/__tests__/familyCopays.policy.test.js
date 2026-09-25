import test, {after} from 'node:test';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import assert from 'node:assert/strict';
import {presentBalance} from '../familyLedger/presentation.js';
import {insuranceFingerprint,assertReady} from '../familyLedger/readiness.js';
import {linkAllowsBilling} from '../familyBillingPolicy.service.js';
import {requireBillingStaff} from '../familyLedger/policy.js';
const row={amountCents:20000,paidCents:0,totalCents:20000,status:'review',holdReason:'insurance_review'};
after(async()=>{await pool.end();await clinicalPool.end();});
test('incomplete insurance, disputes, voids and holds never become portal debt',()=>{
  for(const change of [{},{status:'void'},{status:'open'},{status:'open',holdReason:null,disputedAt:new Date()}]){
    const result=presentBalance({...row,...change},{collectible:false,own:true});
    assert.equal(result.dueCents,0);assert.equal(result.balanceCents,0);assert.equal(result.amountCents,null);assert.equal(result.totalCents,null);assert.equal(result.canPay,false);
  }
});
test('settled payments reduce the exact payer share and never reappear as due',()=>{
  const partial=presentBalance({...row,amountCents:3000,paidCents:1000,status:'open',holdReason:null},{collectible:true,own:true,responsibility:{responsibilityType:'copay'}});
  assert.equal(partial.dueCents,2000);assert.equal(partial.canPay,true);assert.match(partial.explanation,/prior payments/i);
  const paid=presentBalance({...row,amountCents:3000,paidCents:3000,status:'paid',holdReason:null},{collectible:false,own:true});
  assert.equal(paid.dueCents,0);assert.equal(paid.billingState,'paid');assert.equal(paid.canPay,false);
});
test('staff can investigate a held amount without publishing it as family debt',()=>{
  const value=presentBalance(row,{collectible:false,staff:true});assert.equal(value.balanceCents,20000);assert.equal(value.dueCents,0);assert.equal(value.canPay,false);
});
test('coverage changes invalidate verification; demographic changes do not',()=>{
  const coverage={primary:{memberId:'synthetic',insurerName:'Example'},patient:{firstName:'Old'}};
  const profile={setup_status:'ready',coverage_mode:'insured',insurance_fingerprint:insuranceFingerprint(coverage)};
  assert.doesNotThrow(()=>assertReady(profile,{...coverage,patient:{firstName:'New'}}));
  assert.throws(()=>assertReady(profile,{primary:{memberId:'changed'}}),/Coverage changed/);
  assert.throws(()=>assertReady({...profile,setup_status:'incomplete'},coverage),/incomplete/);
  assert.equal(insuranceFingerprint({primary:{a:1,b:2}}),insuranceFingerprint({primary:{b:2,a:1}}));
});
test('an adult self account may consent to paying; children, unknown ages and restricted links may not',()=>{
  const link={relationship_type:'self',access_enabled:1,date_of_birth:'1990-01-01'};
  assert.equal(linkAllowsBilling(link),true);
  for(const change of [{date_of_birth:'2020-01-01'},{date_of_birth:null},{permissions_json:{noView:true}},{access_enabled:0}])assert.equal(linkAllowsBilling({...link,...change}),false);
});
test('provider roles cannot inherit financial access from a stale billing flag',async()=>{
  for(const role of ['provider','provider_plus'])await assert.rejects(requireBillingStaff({id:1,role},1,{execute:()=>{throw new Error('Must reject before reading financial access');}}),e=>e.status===403);
});
