import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { faxRoute, faxPdf, notifyreFaxNumbers, normalizeFaxEvent, faxStatusUpdate, requireFaxSupport } from './faxPolicy.js';
import { integrationDefaults, cleanPlatformSettings } from './integrationPolicy.js';
import { runtimeIntegrationSecrets } from './integrationSecrets.js';
const route = { practiceId:'10000000-0000-4000-8000-000000000000',brand:'Test',support:'help@example.invalid',mainNumber:'+17195550100',providerNumber:'+17195550200',approval:'submitted',campaignId:'pending',approvalReference:'',faxVerifiedAt:'today',faxEnabled:true };
const settings = { ...integrationDefaults(),notifyre:{apiToken:'synthetic',baaReference:'test',webhookSecret:'test'},clientMessaging:{routes:[route]} };
test('fax readiness is independent of SMS approval and limited to primary verified routes',()=>{
 assert.equal(faxRoute(settings,route.practiceId,true).mainNumber,route.mainNumber);
 assert.throws(()=>faxRoute(settings,'different',true),{status:409});
 const edited=structuredClone(settings);edited.clientMessaging.routes[0].mainNumber='+17195550300';
 assert.throws(()=>cleanPlatformSettings(edited,settings),{status:409});
 edited.clientMessaging.routes[0].faxEnabled=false;
 assert.equal(cleanPlatformSettings(edited,settings).clientMessaging.routes[0].faxVerifiedAt,null);
 const rotated=runtimeIntegrationSecrets(settings,{AURICWELL_NOTIFYRE_API_TOKEN:'rotated-test-token'});
 assert.equal(rotated.clientMessaging.routes[0].faxEnabled,false);
 assert.equal(rotated.clientMessaging.routes[0].faxVerifiedAt,null);
 assert.throws(()=>requireFaxSupport({actorType:'staff',permissions:['clinical'],settings:{phiActivatedAt:'test'}}),{status:403});
 assert.throws(()=>requireFaxSupport({actorType:'patient',permissions:['admin'],settings:{phiActivatedAt:'test'}}),{status:403});
 assert.throws(()=>requireFaxSupport({actorType:'staff',permissions:['admin'],settings:{}}),{status:409});
});
test('fax inventory accepts only active fax numbers, not arbitrary SMS inventory',()=>{
 assert.deepEqual(notifyreFaxNumbers({Numbers:[{E164:route.mainNumber,Status:'active'},{E164:route.providerNumber,Status:'cancelled'}]}),[route.mainNumber]);
 assert.deepEqual(notifyreFaxNumbers({numbers:[{e164:route.mainNumber,status:'active'}]}),[route.mainNumber]);
 assert.throws(()=>notifyreFaxNumbers({smsNumbers:[{number:route.mainNumber}]}),{status:503});
});
test('fax PDFs reject malformed documents and page limits',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const base64=Buffer.from(await pdf.save()).toString('base64');
 assert.equal((await faxPdf(base64)).pages,1);
 await assert.rejects(faxPdf(Buffer.from('not pdf').toString('base64')),{status:400});
 await assert.rejects(faxPdf('A'.repeat(7*1024*1024)),{status:400});
 for(let i=0;i<100;i++)pdf.addPage();
 await assert.rejects(faxPdf(Buffer.from(await pdf.save()).toString('base64')),{status:400});
});
test('fax events normalize documented payload and terminal delivery cannot regress',()=>{
 const event=normalizeFaxEvent({Event:'fax_sent',Timestamp:123,Payload:{ID:'fax-one',FromNumber:route.mainNumber,To:route.providerNumber,Status:'successful',Pages:2}});
 assert.equal(event.status,'delivered');
 const final=faxStatusUpdate({status:'submitted'},event);
 assert.equal(faxStatusUpdate(final,{...event,status:'sending',timestamp:124}),final);
 assert.throws(()=>normalizeFaxEvent({Event:'fax_received',Timestamp:123,Payload:{ID:'../../secret',To:route.mainNumber}}),{status:400});
});
