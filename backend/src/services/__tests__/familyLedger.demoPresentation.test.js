import test from 'node:test';
import assert from 'node:assert/strict';
import { presentBalance } from '../familyLedger/presentation.js';
const row={sourceType:'qa_appointment',amountCents:8000,totalCents:8000,paidCents:0,status:'review',holdReason:'synthetic_demo'};
const responsibility={syntheticOnly:true,noCollection:true,outcome:'canceled_by_client'};
test('a synthetic fee is visible separately from money due and can never offer payment',()=>{
 for(const state of [{...row},{...row,status:'open',holdReason:null}]){
  const value=presentBalance(state,{collectible:true,own:true,responsibility});
  assert.equal(value.demoAmountCents,8000);assert.equal(value.dueCents,0);assert.equal(value.canPay,false);
  assert.equal(value.description,'Late cancellation');assert.match(value.explanation,/payments are disabled/);
 }
});
test('real held charges cannot acquire demo amounts from an untrusted label',()=>{
 for(const [source,metadata] of [['staff_charge',responsibility],['qa_appointment',{}],['claim_responsibility',{...responsibility,syntheticOnly:false}]]){
  const value=presentBalance({...row,sourceType:source},{collectible:false,own:true,responsibility:metadata});
  assert.equal(value.demoAmountCents,undefined);assert.equal(value.amountCents,null);assert.equal(value.totalCents,null);
 }
});
test('test no-show and completed session amounts retain their distinct descriptions',()=>{
 for(const [outcome,amount,description] of [['no_show',10000,'Missed appointment'],['completed',12000,'Counseling session']]){
  const value=presentBalance({...row,amountCents:amount,totalCents:amount},{collectible:false,own:true,responsibility:{...responsibility,outcome}});
  assert.equal(value.demoAmountCents,amount);assert.equal(value.description,description);assert.equal(value.balanceCents,0);
 }
});

test('the full service price is visible during coverage review but is never counted as debt',()=>{
 const value=presentBalance({...row,sourceType:'staff_charge',holdReason:'insurance_review',totalCents:12000,amountCents:6000},{collectible:false,own:true});
 assert.deepEqual(value.referencePrice,{amountCents:12000,label:'Service price before coverage review'});
 assert.equal(value.amountCents,null);assert.equal(value.totalCents,null);assert.equal(value.dueCents,0);assert.equal(value.canPay,false);
 assert.match(value.explanation,/No payment is due yet/);
});
test('unverified copays are not misrepresented as the full service price',()=>{
 const value=presentBalance({...row,sourceType:'clinical_copay',holdReason:'insurance_review'},{collectible:false,own:true,responsibility:{responsibilityType:'copay'}});
 assert.equal(value.referencePrice.label,'Previously recorded amount — under review');assert.equal(value.canPay,false);
});
test('confirmed self-pay displays an actual amount due without a pending insurance price',()=>{
 const value=presentBalance({...row,sourceType:'clinical_self_pay',status:'open',holdReason:null,amountCents:12000,totalCents:12000},{collectible:true,own:true,responsibility:{responsibilityType:'self_pay'}});
 assert.equal(value.referencePrice,undefined);assert.equal(value.dueCents,12000);assert.equal(value.balanceCents,12000);assert.equal(value.canPay,true);assert.equal(value.billingState,'due');assert.match(value.explanation,/agreed self-pay price/);
});
test('disputed, void, paid, and unrelated hold states do not become coverage estimates',()=>{
 for(const change of [{status:'void'},{status:'paid'},{disputedAt:'2026-10-27'},{holdReason:'staff_review'},{holdReason:'payer_assignment'}]){
  const value=presentBalance({...row,sourceType:'staff_charge',holdReason:'insurance_review',...change},{collectible:false,own:true});
  assert.equal(value.referencePrice,undefined);assert.equal(value.dueCents,0);assert.equal(value.canPay,false);
 }
});
