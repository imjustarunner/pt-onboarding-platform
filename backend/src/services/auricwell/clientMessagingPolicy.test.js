import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {smsCommand,verifyNotifyreSignature,normalizeNotifyreEvent,assertMessagingReady,parseRelayReply,onRelayShift,smsFooter} from './clientMessagingPolicy.js';
import {integrationDefaults,cleanPlatformSettings,publicPlatformSettings} from './integrationPolicy.js';
test('category opt-outs are distinct and never equivalent to account STOP',()=>{
 for(const [word,category] of [['NOREMIND','reminders'],['NOLINK','links'],['NOFORM','forms']]) assert.deepEqual(smsCommand(` ${word.toLowerCase()} `),{type:'category',category});
 for(const word of ['STOP','unsubscribe','Please stop texting me.','Do not message me']) assert.equal(smsCommand(word).type,'stop');
 assert.equal(smsCommand('START').type,'start');assert.equal(smsCommand('Y').type,'attendance');assert.equal(smsCommand('I need to change my appointment'),null);
 assert.ok(smsFooter('forms').includes('NOFORM'));assert.ok(!smsFooter('conversations').includes('NOFORM'));
});
test('Notifyre signature authenticates full payload, rejects future/stale timestamps and wrong secrets',()=>{
 const event={Event:'sms_received',Timestamp:1735689600,Payload:{ReplyID:'test',SenderNumber:'+17195550123',RecipientNumber:'+17195550999',Message:'TEST',ReceivedDateUtc:1735689600}};
 const time=1735689600000;const raw=Buffer.from(JSON.stringify(event));const sign=(payload,stamp=1735689600)=>`t=${stamp},v=${crypto.createHmac('sha256','synthetic-secret').update(`${stamp}.${payload}`).digest('hex')}`;
 assert.deepEqual(verifyNotifyreSignature(raw,sign(raw),'synthetic-secret',time),event);
 assert.deepEqual(verifyNotifyreSignature(Buffer.from(JSON.stringify(event,null,2)),sign(raw),'synthetic-secret',time),event);
 assert.throws(()=>verifyNotifyreSignature(raw,sign(raw),'different',time),{status:403});
 assert.throws(()=>verifyNotifyreSignature(Buffer.from(raw.toString().replace('TEST','STOP')),sign(raw),'synthetic-secret',time),{status:403});
 assert.throws(()=>verifyNotifyreSignature(raw,sign(raw),'synthetic-secret',time+301000),{status:403});
 assert.throws(()=>verifyNotifyreSignature(raw,sign(raw,1735690600),'synthetic-secret',time),{status:403});
 const normalized=normalizeNotifyreEvent(event);assert.equal(normalized.from,'+17195550123');assert.equal(normalized.body,'TEST');
 assert.equal(normalized.key,normalizeNotifyreEvent({...event,Timestamp:event.Timestamp+1}).key);
});
test('campaign approval, owned numbers, matching carrier and signed webhook are separate sending gates',()=>{
 const defaults=integrationDefaults();const route={practiceId:'p',brand:'Test',enabled:true,approval:'approved',campaignId:'C1',mainNumber:'+17195550123',verifiedAt:'today',verifiedProvider:'notifyre'};
 const ready={...defaults,smsProvider:'notifyre',notifyre:{apiToken:'secret',baaReference:'signed',webhookSecret:'secret',webhookVerifiedAt:'today'},clientMessaging:{routes:[route]}};
 assert.equal(assertMessagingReady(ready,'p').campaignId,'C1');
 for(const modified of [{...ready,smsProvider:'disabled'},{...ready,clientMessaging:{routes:[{...route,approval:'submitted'}]}},{...ready,notifyre:{...ready.notifyre,webhookVerifiedAt:null}},{...ready,clientMessaging:{routes:[{...route,verifiedProvider:'vonage'}]}}]) assert.throws(()=>assertMessagingReady(modified,'p'),{status:409});
 assert.throws(()=>assertMessagingReady(ready,'another-practice'),{status:409});assert.throws(()=>assertMessagingReady(ready,'p','provider'),{status:409});
});
test('staff relay requires exact codes, approved device, consent and current working hours',()=>{
 assert.deepEqual(parseRelayReply('ConBen Hello there'),{tag:'conben',body:'Hello there',close:false});assert.equal(parseRelayReply('conben CLOSED').close,true);assert.equal(parseRelayReply('Hello'),null);
 const c={enabled:true,phone:'+17195550123',consentConfirmed:true,deviceApproved:true,timezone:'America/Denver',shifts:[{day:1,start:'08:00',end:'17:00'}]};
 assert.equal(onRelayShift(c,Date.parse('2026-10-19T15:00:00Z')),true);assert.equal(onRelayShift(c,Date.parse('2026-10-19T23:00:00Z')),false);assert.equal(onRelayShift({...c,deviceApproved:false},Date.parse('2026-10-19T15:00:00Z')),false);
});
test('saving routes cannot forge verification, reuse another agency number or expose webhook secrets',()=>{
 const current=integrationDefaults();const route={practiceId:'11111111-1111-4111-8111-111111111111',brand:'ITSCO',support:'support@example.invalid',approval:'submitted',campaignId:'pending',mainNumber:'+17196577444',providerNumber:'+17193684020',enabled:false};
 const saved=cleanPlatformSettings({...current,notifyre:{...current.notifyre,webhookSecret:'hidden'},clientMessaging:{routes:[{...route,verifiedAt:'forged'}]}},current);
 assert.equal(saved.clientMessaging.routes[0].verifiedAt,null);assert.equal(publicPlatformSettings(saved).notifyre.webhookSecret,undefined);assert.equal(publicPlatformSettings(saved).notifyre.hasWebhookSecret,true);
 assert.throws(()=>cleanPlatformSettings({...current,clientMessaging:{routes:[{...route,enabled:true}]}},current),{status:409});
 assert.throws(()=>cleanPlatformSettings({...current,clientMessaging:{routes:[route,{...route,practiceId:'22222222-2222-4222-8222-222222222222'}]}},current),{status:400});
});
test('a legacy Vonage clinical environment flag cannot authorize either patient line',()=>{
 const previous=process.env.VONAGE_CLINICAL_APPROVED;
 process.env.VONAGE_CLINICAL_APPROVED='true';
 try {
  const settings={...integrationDefaults(),smsProvider:'vonage',clientMessaging:{routes:[{practiceId:'p',brand:'Test',enabled:true,approval:'approved',campaignId:'old',mainNumber:'+17195550123',providerNumber:'+17195550124',verifiedAt:'today',verifiedProvider:'vonage'}]}};
  for(const line of ['main','provider'])assert.throws(()=>assertMessagingReady(settings,'p',line),/Notifyre/);
 }finally{if(previous===undefined)delete process.env.VONAGE_CLINICAL_APPROVED;else process.env.VONAGE_CLINICAL_APPROVED=previous;}
});
test('platform settings cannot reactivate Vonage for client texts',()=>{
 const current=integrationDefaults();
 assert.throws(()=>cleanPlatformSettings({...current,smsProvider:'vonage',vonage:{from:'+17195550123',campaignId:'old'}},current),/Notifyre/);
});
