import test from 'node:test';
import assert from 'node:assert/strict';
import {qaAutomationActorFor,withQaAutomationAttribution,qaAutomationUserAgent,verifiedQaAutomationAttribution} from '../qaAutomationAttribution.js';
test('only exact owner-authorized retained nonhuman fixtures classify as automation',()=>{
 for(const id of [1433,1434,1438,1439,1453,1465,1728,1729,1746,1766,1782,1790,1456,1496,1759,1771,1785,1807])assert.equal(qaAutomationActorFor(id).actorUserId,id);
 for(const id of [null,undefined,0,501,1435,1497,1808,'1433x','01433','1433e0','-1433','__proto__'])assert.equal(qaAutomationActorFor(id),null);
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

test('NLU owner-confirmed fixtures have their own bounded registration without changing old evidence',()=>{
 for(const id of [1496,1759,1771,1785,1807]){const actor=qaAutomationActorFor(id);assert.deepEqual(actor.qaAgencyBoundary,[453,454]);assert.match(actor.authorizationRef,/nlu/);}
 assert.deepEqual(qaAutomationActorFor(1456).qaAgencyBoundary,[450,451,452,453,454]);
 assert.deepEqual(qaAutomationActorFor(1433).qaAgencyBoundary,[450,451,452]);
 assert.equal(qaAutomationActorFor(1435),null);
});
test('Sora school walkthrough uses its own current authorization and narrow agency boundary',()=>{
 const sora=qaAutomationActorFor(1782);assert.deepEqual(sora.qaAgencyBoundary,[450,451]);
 assert.equal(sora.fixture,'Sora');assert.equal(sora.authorizationRef,'owner-reserved-sora-school-qa-2026-11-15-v1');
 assert.notEqual(sora.authorizationRef,qaAutomationActorFor(1790).authorizationRef);
 assert.equal(qaAutomationActorFor(1783),null);
});
test('Jordan office-approval automation is labeled only within the owner-approved QA agencies',()=>{
 const jordan=qaAutomationActorFor(1434);
 assert.deepEqual(jordan.qaAgencyBoundary,[450,451,452,453,454]);
 assert.equal(jordan.authorizationRef,'owner-reserved-nlu-office-support-qa-2026-11-16-v1');
 assert.equal(jordan.kind,'qa_automation');assert.equal(jordan.fixture,'Jordan');
 assert.equal(Object.hasOwn(jordan,'role'),false);
 assert.deepEqual(qaAutomationActorFor(1433).qaAgencyBoundary,[450,451,452]);
 assert.equal(qaAutomationActorFor(1435),null);
});
test('Jordan historical automation attribution retains its original authorization and scope',()=>{
 const original={kind:'qa_automation',actorUserId:1434,fixture:'Jordan',authorizationRef:'owner-reserved-automated-qa-2026-11-14-v1',qaAgencyBoundary:[450,451,452]};
 assert.deepEqual(verifiedQaAutomationAttribution({automationActor:original},1434),original);
 assert.equal(verifiedQaAutomationAttribution({automationActor:original},1496),null);
 const current=qaAutomationActorFor(1434);
 assert.deepEqual(verifiedQaAutomationAttribution({automationActor:current},1434),current);
});
