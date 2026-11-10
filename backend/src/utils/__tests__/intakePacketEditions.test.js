import { test } from 'node:test';import assert from 'node:assert/strict';
import { validateIntakePacketEditions } from '../intakePacketEditions.js';
const context={title:'Policy',contentHash:'current',packetVersion:'1.02',locale:'en'};
test('rejects stale editions before submission, including a single child',async()=>{
 for(const response of [{contentHash:'old',packetVersion:'1.02'},{contentHash:'current',packetVersion:'1.01'}]) {
  await assert.rejects(validateIntakePacketEditions({clients:[{}],packetSections:{policy_services:response}},async()=>context),e=>e.status===409&&e.code==='INTAKE_AGREEMENT_CHANGED'&&e.message.includes('Policy'));
 }
});
test('accepts the captured edition and handles legacy flat captures',async()=>{
 let calls=0;await validateIntakePacketEditions({packetPolicyServices:{contentHash:'current',packetVersion:'1.02'}},async()=>{calls++;return context;});assert.equal(calls,1);
 await validateIntakePacketEditions({},async()=>assert.fail('No capture to check'));
});
