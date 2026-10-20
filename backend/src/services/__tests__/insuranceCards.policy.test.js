import test from 'node:test';
import assert from 'node:assert/strict';
import {cardCycle,cardProgress,requiredCardSlots,encouragedCardSlots,cardCoverageVerified,reminderOrdinal,validCardFile} from '../insuranceCards/policy.js';
const commercial={insurerName:'Synthetic commercial',memberId:'SYNTHETIC-ONLY'};
const medicaid={insurerName:'Health First Colorado',memberId:'SYNTHETIC-MEDICAID'};
test('cards are optional for all plans and encouraged for active policies',()=>{
 assert.deepEqual(requiredCardSlots({primary:commercial,secondary:medicaid}),[]);
 assert.deepEqual(encouragedCardSlots({primary:commercial,secondary:medicaid}),[]);
 assert.deepEqual(encouragedCardSlots({primary:commercial}),['primary_front','primary_back']);
 assert.deepEqual(encouragedCardSlots({primary:{...commercial,terminationDate:'2020-01-01'}}),[]);
 assert.deepEqual(encouragedCardSlots({primary:null}),[]);
});
test('verified unchanged coverage stops prompts even without uploaded cards',()=>{
 const p={primary:commercial};
 assert.equal(cardProgress(p,{},new Date(),true).state,'not_required');
 assert.deepEqual(cardProgress(p,{},new Date(),true).missingSlots,[]);
 assert.equal(cardProgress(p).slots.primary_front.required,false);
 assert.equal(cardProgress(p).slots.primary_front.encouraged,true);
 const check={id:1,policy_slot:'primary',status:'returned',insurance_fingerprint:'current',evidence:{summary:{status:'active_reported',identityMatches:true}}};
 const args={fingerprint:'current',checks:[check]};
 assert.equal(cardCoverageVerified(args),true);
 for(const patch of [{fingerprint:'changed'},{hasSecondary:true},{review:{status:'unresolved'}},{checks:[{...check,status:'error'}]},{checks:[{...check,evidence:{summary:{status:'active_reported',identityMatches:false}}}]}])assert.equal(cardCoverageVerified({...args,...patch}),false);
 assert.equal(cardCoverageVerified({...args,review:{status:'verified',insurance_fingerprint:'current',through_check_id:1}}),true);
 assert.equal(cardCoverageVerified({...args,checks:[check,{...check,id:2,status:'error'}],review:{status:'verified',insurance_fingerprint:'current',through_check_id:1}}),false);
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

test('Medicaid suppresses every card request, including commercial primary and prior replacements',()=>{
 for(const p of [{primary:medicaid},{primary:commercial,secondary:medicaid},{primary:commercial,primaryIsMedicaid:true}]) {
  const progress=cardProgress(p,{state:'help',cycle_hash:cardCycle(p),rejected_slots_json:'["primary_back"]'});
  assert.equal(progress.state,'not_required');assert.deepEqual(progress.missingSlots,[]);
  assert.ok(Object.values(progress.slots).every(s=>!s.required&&!s.encouraged&&!s.needsReplacement));
 }
 const progress=cardProgress({primary:commercial},{},new Date(),false,false);
 assert.equal(progress.state,'not_required');assert.deepEqual(progress.encouragedSlots,[]);
});
