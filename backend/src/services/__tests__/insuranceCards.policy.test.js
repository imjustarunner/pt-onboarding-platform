import test from 'node:test';
import assert from 'node:assert/strict';
import {cardCycle,cardProgress,requiredCardSlots,reminderOrdinal,validCardFile} from '../insuranceCards/policy.js';
const commercial={insurerName:'Synthetic commercial',memberId:'SYNTHETIC-ONLY'};
const medicaid={insurerName:'Health First Colorado',memberId:'SYNTHETIC-MEDICAID'};
test('requires each side of commercial coverage even with a Medicaid secondary',()=>{
 assert.deepEqual(requiredCardSlots({primary:commercial,secondary:medicaid}),['primary_front','primary_back']);
 assert.deepEqual(requiredCardSlots({primary:medicaid,secondary:commercial}),['secondary_front','secondary_back']);
 assert.deepEqual(requiredCardSlots({primary:medicaid}),[]);
 assert.deepEqual(requiredCardSlots({primary:{...commercial,terminationDate:'2020-01-01'}}),[]);
 assert.deepEqual(requiredCardSlots({primary:null}),[]);
});
test('front-only uploads remain missing; both sides await review, never verify coverage',()=>{
 const p={primary:commercial,primary_card_front_url:'gs://synthetic/front'};
 assert.deepEqual(cardProgress(p).missingSlots,['primary_back']);
 p.primary_card_back_url='gs://synthetic/back';assert.equal(cardProgress(p).state,'review');
 const f={state:'complete',cycle_hash:cardCycle(p)};assert.equal(cardProgress(p,f).state,'complete');
 assert.equal(cardProgress({...p,primary_card_back_url:null},{...f,state:'help'}).state,'help');
 assert.equal(cardProgress(p,{...f,state:'help'}).state,'review');
 assert.equal(cardProgress(p,{...f,state:'waived'}).state,'waived');
 assert.deepEqual(cardProgress(p,{...f,rejected_slots_json:'["primary_back"]'}).missingSlots,['primary_back']);
 p.primary={...commercial,memberId:'CHANGED'};assert.equal(cardProgress(p,f).state,'review');
});
test('reminder cadence is initial, day 3, day 7 and weekly, with no catch-up burst',()=>{
 const first=new Date('2026-10-01T00:00:00Z');
 for(const [day,ordinal] of [[-1,null],[0,0],[2,0],[3,1],[6,1],[7,2],[13,2],[14,3],[100,15]])assert.equal(reminderOrdinal(first,new Date(+first+day*86400000)),ordinal);
});
test('checks actual file signatures and maximum size',()=>{
 assert.equal(validCardFile({mimetype:'image/png',buffer:Buffer.from('<script>no</script>')}),false);
 assert.equal(validCardFile({mimetype:'application/pdf',buffer:Buffer.from('%PDF-1.7 synthetic')}),true);
 assert.equal(validCardFile({mimetype:'image/jpeg',buffer:Buffer.from([255,216,255,1])}),true);
 assert.equal(validCardFile({mimetype:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)}),false);
});
