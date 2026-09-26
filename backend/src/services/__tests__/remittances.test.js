import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEra,matchesSubmission,money,hash} from '../remittances/normalize.js';
export const identity={taxId:'123456789',npis:['1234567893'],eraId:'100'};
export const raw={eraid:'100',prov_taxid:'123456789',prov_npi:'1234567893',payerid:'TEST',payer_name:'Synthetic payer',paid_date:'2026-01-03',paid_amount:'80.00',claim:[{pcn:'101',ins_number:'SYNTHETIC',payer_icn:'SYNTHETIC-1',status_code:'1',total_charge:'100.00',total_paid:'80.00',charge:[{proc_code:'90837',from_dos:'20260101',units:'1',charge:'100.00',paid:'80.00',adjustment:[{group:'CO',code:'45',amount:'20.00'}]}]}]};
export const sent={pcn:'101',ins_number:'SYNTHETIC',bill_npi:'1234567893',payerid:'TEST',total_charge:'100.00',charge:[{proc_code:'90837',from_date:'2026-01-01',units:'1',charge:'100.00'}]};
test('balanced ERA without PR defaults to zero, with exact service and member matching',()=>{
 const era=normalizeEra(raw,identity),item=era.items[0];assert.equal(item.responsibilityCents,0);assert.deepEqual(item.blockers,[]);assert.equal(era.requiresReview,false);assert.ok(matchesSubmission(item,era,sent));
 for(const change of [{ins_number:'OTHER'},{payerid:'OTHER'},{bill_npi:'9876543210'},{total_charge:'99.00'},{pcn:'102'},{charge:[{...sent.charge[0],from_date:'2026-01-02'}]}])assert.equal(matchesSubmission(item,era,{...sent,...change}),false);
 assert.equal(matchesSubmission(item,era,{...sent,pcn:'other'},{allowPcnOverride:true}),true);
 assert.equal(matchesSubmission(item,era,{...sent,ins_number:'OTHER'},{allowPcnOverride:true}),false);
});
test('PR and contractual adjustments remain separate',()=>{
 const changed=structuredClone(raw);changed.claim[0].charge[0].adjustment=[{group:'CO',code:'45',amount:'5'},{group:'PR',code:'3',amount:'15'}];const item=normalizeEra(changed,identity).items[0];assert.equal(item.responsibilityCents,1500);assert.equal(item.adjustmentCents,2000);assert.deepEqual(item.blockers,[]);
});
test('incomplete, unbalanced, unsupported and negative data cannot quietly become zero responsibility',()=>{
 for(const mutate of [x=>delete x.claim[0].total_paid,x=>x.claim[0].total_charge='101',x=>x.claim[0].charge=[],x=>x.claim[0].status_code='99',x=>x.claim[0].charge[0].units='?',x=>x.claim[0].charge[0].adjustment[0].amount='-20']){
  const changed=structuredClone(raw);mutate(changed);assert.ok(normalizeEra(changed,identity).items[0].blockers.length);
 }
 assert.throws(()=>normalizeEra({...raw,prov_taxid:'999999999'},identity));assert.throws(()=>normalizeEra({...raw,prov_npi:'9999999999'},identity));assert.throws(()=>normalizeEra({...raw,eraid:'999'},identity));
 assert.equal(normalizeEra({...raw,paid_amount:'79'},identity).requiresReview,true);
});
test('denials, reversals and forwarding are not ordinary payments',()=>{
 for(const [code,key] of [['4','denied'],['22','reversal'],['19','forwarded']]){const changed=structuredClone(raw);changed.claim[0].status_code=code;assert.equal(normalizeEra(changed,identity).items[0][key],true);}
});
test('money and source hashes are stable and exact',()=>{
 assert.equal(money('1.01'),101);assert.equal(money('-1.01'),-101);for(const v of [null,'NaN','0.001','1e2'])assert.throws(()=>money(v));assert.equal(hash({a:1,b:2}),hash({b:2,a:1}));
});
