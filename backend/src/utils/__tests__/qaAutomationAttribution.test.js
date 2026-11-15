import test from 'node:test';
import assert from 'node:assert/strict';
import {qaAutomationActorFor,withQaAutomationAttribution,qaAutomationUserAgent} from '../qaAutomationAttribution.js';
test('only exact owner-authorized retained nonhuman fixtures classify as automation',()=>{
 for(const id of [1433,1434,1438,1439,1453,1465,1728,1729,1746,1766,1790])assert.equal(qaAutomationActorFor(id).actorUserId,id);
 for(const id of [null,undefined,0,501,1435,1496,1807,'1433x','01433','1433e0','-1433','__proto__'])assert.equal(qaAutomationActorFor(id),null);
});
test('classification contains no permission or authentication grant and returns independent values',()=>{
 const actor=qaAutomationActorFor(1433);assert.deepEqual(Object.keys(actor).sort(),['kind','actorUserId','fixture','authorizationRef','qaAgencyBoundary'].sort());actor.qaAgencyBoundary.push(6);assert.deepEqual(qaAutomationActorFor(1433).qaAgencyBoundary,[450,451,452]);
});
test('new evidence retains existing facts and uses the actual server actor',()=>{
 const source={clientId:2560,automationActor:{actorUserId:501,kind:'human'}};const result=withQaAutomationAttribution(source,1433);assert.equal(result.clientId,2560);assert.equal(result.automationActor.kind,'qa_automation');assert.equal(result.automationActor.actorUserId,1433);assert.equal(source.automationActor.actorUserId,501);
});
test('a human cannot self-label as automation through request metadata',()=>{
 assert.deepEqual(withQaAutomationAttribution({clientId:2560,automationActor:{kind:'qa_automation'}},501),{clientId:2560});assert.equal(withQaAutomationAttribution({automationActor:{kind:'qa_automation'}},501),null);
});
test('normal evidence is unchanged; legacy metadata survives automation attribution',()=>{
 const normal={action:'view'};assert.equal(withQaAutomationAttribution(normal,501),normal);assert.equal(withQaAutomationAttribution(null,501),null);assert.equal(withQaAutomationAttribution('legacy',1433).originalMetadata,'legacy');assert.equal(withQaAutomationAttribution(null,1433).automationActor.kind,'qa_automation');
});
test('secure event classification retains user agent and respects storage length',()=>{
 const ua=qaAutomationUserAgent(1790,'HeadlessChrome');assert.match(ua,/^qa-automation\/1790;/);assert.match(ua,/HeadlessChrome$/);assert.equal(qaAutomationUserAgent(501,'Chrome'),'Chrome');assert.equal(qaAutomationUserAgent(null,null),null);assert.equal(qaAutomationUserAgent(1433,'x'.repeat(1000)).length,512);
});
