import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoSelectionConflict,hashHoldToken,createPublicProviderHoldService} from '../publicProviderHold.service.js';
const start='2030-01-07T17:00:00Z',end='2030-01-07T18:00:00Z';
test('an ITSCO intake hold blocks overlapping tutoring at NLU, across formats and weeks',async()=>{
 const connection={execute:async sql=>[sql.includes('FROM public_provider_slot_holds')?[{agency_id:1,start_at:start,end_at:end,time_zone:'America/Denver',token_hash:hashHoldToken('same')}]:[]]};
 await assert.rejects(assertNoSelectionConflict(connection,{providerId:9,agencyId:2,startAt:'2030-01-14T17:30:00Z',endAt:'2030-01-14T18:30:00Z',token:'same'}),e=>e.status===409);
 await assert.doesNotReject(assertNoSelectionConflict(connection,{providerId:9,agencyId:2,startAt:'2030-01-14T18:00:00Z',endAt:'2030-01-14T19:00:00Z'}));
});
test('pending appointment requests block a second agency without requiring an identical start time',async()=>{
 const connection={execute:async sql=>[sql.includes('FROM public_appointment_requests')?[{requested_start_at:start,requested_end_at:end}]:[]]};
 await assert.rejects(assertNoSelectionConflict(connection,{providerId:9,agencyId:2,startAt:'2030-01-07T17:30:00Z',endAt:'2030-01-07T18:30:00Z'}),e=>e.status===409);
});
test('simultaneous new-client selections for different agencies share one provider lock: only one wins',async()=>{
 const holds=[],locks=[];let tail=Promise.resolve();
 const pool={getConnection:async()=>{let releaseLock;return {release(){},async execute(sql,args){
  if(sql.includes('GET_LOCK')){locks.push(args[0]);const previous=tail;tail=new Promise(r=>releaseLock=r);await previous;return [[{acquired:1}]];}
  if(sql.includes('RELEASE_LOCK')){releaseLock();return [[]];}
  if(sql.includes('FROM public_provider_slot_holds'))return [[...holds]];
  if(sql.includes('FROM public_appointment_requests'))return [[]];
  if(sql.includes('INSERT INTO public_provider_slot_holds'))holds.push({agency_id:args[0],start_at:args[4],end_at:args[5],token_hash:args[6],time_zone:args[7]});
  return [[]];
 }}}};
 const service=createPublicProviderHoldService(pool),startAt=new Date(Date.now()+86400000),endAt=new Date(+startAt+3600000);
 const results=await Promise.allSettled([service.create({agencyId:1,providerId:9,serviceType:'counseling',modality:'IN_PERSON',startAt,endAt,validateAvailability:async()=>{}}),service.create({agencyId:2,providerId:9,serviceType:'tutoring',modality:'VIRTUAL',startAt,endAt,validateAvailability:async()=>{}})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(holds.length,1);assert.equal(new Set(locks).size,1);
});
