import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { splitSqlStatements,stripSqlLineComments } from '../../utils/migrationSql.js';

const fixture=vi.hoisted(()=>({pool:null,deliveries:[],disabled:new Set(),contacts:new Map()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{
  execute:(...args)=>fixture.pool.execute(...args),getConnection:()=>fixture.pool.getConnection()
}}));
vi.mock('../safetyPlans/access.js',()=>({
  staffRole:vi.fn(),agencyAccess:vi.fn(),planAccess:vi.fn(),
  clientAccess:async(_actor,id)=>({id:Number(id),agency_id:2,full_name:'Synthetic client '+id}),
  agencyBrand:async()=>({id:2,name:'Synthetic Agency'}),
  recipientOptions:async()=>[],
  recipientAccess:async(_item,id)=>fixture.contacts.get('user:'+id)?.name
}));
vi.mock('../clinicalDocumentShareDelivery.js',()=>({sendDocumentDelivery:async delivery=>{
  fixture.deliveries.push(delivery);
  return {state:'sent',reference:'synthetic'};
}}));
vi.mock('../clinicalDocumentShareRecipients.js',()=>({
  eligibleDocumentRecipients:async()=>[...fixture.contacts.values()].filter(contact=>!fixture.disabled.has(contact.key)),
  documentDeliveryOptions:async(_item,contact)=>({email:true,sms:Boolean(contact.phone),portal:Boolean(contact.userId)}),
  currentDocumentRecipient:async(_item,key)=>{
    if(fixture.disabled.has(key)||!fixture.contacts.has(key))throw Object.assign(new Error('Access changed'),{status:403});
    return fixture.contacts.get(key);
  }
}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:async id=>({id,agency_id:2,full_name:'Synthetic client '+id})}}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:async()=>({url:()=> 'https://example.invalid/login'})}));
vi.mock('../familyPortalScreening.service.js',()=>({portalScreenDefinition:()=>null,requirePortalScreenRecipient:vi.fn(),completedPortalScreen:()=>null}));

import * as shares from '../clinicalDocumentShares.service.js';
import { listFiledClinicalForms, portalList, portalRead, portalSubmitUpdate } from '../safetyPlans/records.js';

const socketPath=process.env.CLINICAL_DOCUMENT_TEST_SOCKET;
const actor={id:8,role:'provider'};
const clientId=41;
const parent={key:'user:20',userId:20,kind:'guardian',name:'Synthetic Parent',email:'parent@example.invalid',phone:'+13035550100',portal:'active'};
const dependent={key:'client:41',userId:null,kind:'client',name:'Synthetic Client',email:'client@example.invalid',portal:null};
const signature='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(20)]).toString('base64');
let dbName,root;

async function share(recipients,{documents=[{release:true}],mode='email',requestKey=randomUUID()}={}) {
  const base={agencyId:2,documents};
  const preview=await shares.previewDocumentShare(actor,clientId,base);
  const selected=recipients.map(key=>({key,mode,items:preview.recipients.find(recipient=>recipient.key===key).items.map(item=>item.key)}));
  const result=await shares.sendDocumentShare(actor,clientId,{...base,requestKey,recipients:selected,contactConfirmed:true,authorityConfirmed:true});
  return {result,preview};
}
function answers(plan,signer='Synthetic Client'){
  return {version:plan.version,contentHash:plan.contentHash,name:signer,signature,consent:true,data:{
    ...plan.data,recipientName:'Synthetic recipient',recipientEmail:'recipient@example.invalid',
    direction:['Discuss information with the named recipient'],purpose:'Care coordination',
    information:['Summary of sessions and treatment'],representativeAuthority:'Parent with medical authority'
  }};
}

describe.skipIf(!socketPath)('shared document lifecycle on MySQL',()=>{
  beforeAll(async()=>{
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,6).toString('base64'));
    root=await mysql.createConnection({socketPath,user:'root'});
    dbName='clinical_request_test_'+randomUUID().replaceAll('-','');
    await root.query('CREATE DATABASE '+dbName);
    fixture.pool=mysql.createPool({socketPath,user:'root',database:dbName,connectionLimit:5});
    for(const file of ['023_client_outcome_measures.sql','025_client_safety_plans.sql','036_clinical_document_requests.sql']){
      const sql=await readFile(new URL('../../../../database/clinical_migrations/'+file,import.meta.url),'utf8');
      for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await fixture.pool.query(statement);
    }
  });
  afterAll(async()=>{await fixture.pool?.end();if(root){await root.query('DROP DATABASE IF EXISTS '+dbName);await root.end();}});
  beforeEach(()=>{fixture.contacts=new Map([[dependent.key,dependent],[parent.key,parent]]);fixture.disabled.clear();fixture.deliveries=[];});

  it('completes and files an ROI for a client with no portal user',async()=>{
    await share([dependent.key]);
    const [delivery]=fixture.deliveries;
    const session=await shares.redeemDocumentLink(delivery.token);
    const context=await shares.documentSession(session);
    const item=context.items[0];
    const {plan}=await shares.readSessionItem(session,item.id);
    expect(plan.data.personLabel).toBe('Synthetic client 41');
    await shares.submitSessionItem(session,item.id,answers(plan));
    const signed=await shares.readSessionItem(session,item.id);
    expect(signed.completed).toBe(true);
    expect(signed.plan.signers[0]).toMatchObject({method:'direct_link',actorUserId:null});
    expect((await listFiledClinicalForms(actor,clientId)).forms).toEqual(expect.arrayContaining([
      expect.objectContaining({id:plan.id,version:2,category:'Release of information'})
    ]));
    const [[filing]]=await fixture.pool.execute('SELECT state FROM clinical_release_recipient_links WHERE plan_id=? AND version=2',[plan.id]);
    expect(filing.state).toBe('pending');
    await expect(shares.redeemDocumentLink(delivery.token)).rejects.toHaveProperty('status',404);
  });

  it('shares silently to the portal and allows only one signed version across email and SMS',async()=>{
    await share([parent.key],{mode:'all'});
    expect(fixture.deliveries.map(delivery=>delivery.channel)).toEqual(['email','sms']);
    const user={id:20,role:'client_guardian'};
    const portal=(await portalList(user,clientId)).shares.find(item=>!item.superseded&&!item.signedAt);
    expect(portal).toBeTruthy();
    const [first,second]=await Promise.all(fixture.deliveries.map(delivery=>shares.redeemDocumentLink(delivery.token)));
    const item=(await shares.documentSession(first)).items[0];
    const {plan}=await shares.readSessionItem(first,item.id);
    await Promise.all([first,second].map(session=>shares.submitSessionItem(session,item.id,answers(plan,parent.name))));
    const [signatures]=await fixture.pool.execute('SELECT id FROM clinical_form_signers WHERE plan_id=? AND signed_at IS NOT NULL',[plan.id]);
    expect(signatures).toHaveLength(1);
    expect((await portalList(user,clientId)).shares.filter(item=>item.planId===plan.id&&item.signedAt)).toHaveLength(1);
  });

  it('reflects a portal submission in the original email request',async()=>{
    await share([parent.key]);
    const session=await shares.redeemDocumentLink(fixture.deliveries[0].token);
    const item=(await shares.documentSession(session)).items[0];
    const {plan}=await shares.readSessionItem(session,item.id);
    const user={id:20,role:'client_guardian'};
    const signer=await portalRead(user,plan.mySignerId);
    await portalSubmitUpdate(user,signer.mySignerId,answers(plan,parent.name));
    expect((await shares.readSessionItem(session,item.id)).completed).toBe(true);
  });

  it('rejects a different request’s item and access revoked after opening',async()=>{
    const original=await share([parent.key]);
    const session=await shares.redeemDocumentLink(fixture.deliveries[0].token);
    await share([dependent.key]);
    const other=await shares.redeemDocumentLink(fixture.deliveries[1].token);
    await expect(shares.readSessionItem(session,(await shares.documentSession(other)).items[0].id)).rejects.toHaveProperty('status',404);
    await shares.revokeDocumentRequest(actor,original.result.requests[0].id);
    await expect(shares.documentSession(session)).rejects.toHaveProperty('status',410);
  });

  it('issues a replacement link after expiration and keeps the same request',async()=>{
    const shared=await share([dependent.key]);
    const requestId=shared.result.requests[0].id;
    await fixture.pool.execute('UPDATE clinical_document_request_deliveries SET expires_at=UTC_TIMESTAMP() WHERE request_id=?',[requestId]);
    await expect(shares.redeemDocumentLink(fixture.deliveries[0].token)).rejects.toHaveProperty('status',410);
    await shares.resendDocumentRequest(actor,requestId,'email');
    const newSession=await shares.redeemDocumentLink(fixture.deliveries[1].token);
    expect((await shares.documentSession(newSession)).items).toHaveLength(1);
    expect(fixture.deliveries).toHaveLength(2);
  });

  it('keeps two guardians’ signed responses and sibling requests distinct',async()=>{
    const other={...parent,key:'user:22',userId:22,name:'Second synthetic parent',email:'second@example.invalid'};
    fixture.contacts.set(other.key,other);
    const preview=await shares.previewDocumentShare(actor,clientId,{agencyId:2,documents:[{release:true},{release:true,clientId:42}]});
    await shares.sendDocumentShare(actor,clientId,{agencyId:2,documents:[{release:true},{release:true,clientId:42}],
      requestKey:randomUUID(),authorityConfirmed:true,contactConfirmed:true,recipients:[
        {key:parent.key,mode:'email',items:preview.items.map(item=>item.key)},
        {key:other.key,mode:'email',items:[preview.items[0].key]}
      ]});
    const responses=[];
    for(const delivery of fixture.deliveries){
      const session=await shares.redeemDocumentLink(delivery.token);
      const {items}=await shares.documentSession(session);
      responses.push(items);
      const item=items[0],{plan}=await shares.readSessionItem(session,item.id);
      await shares.submitSessionItem(session,item.id,answers(plan,delivery.recipient.name));
    }
    expect(responses.map(items=>items.map(item=>item.clientName))).toEqual([
      ['Synthetic client 41','Synthetic client 42'],['Synthetic client 41']
    ]);
    const chart=(await listFiledClinicalForms(actor,clientId)).forms;
    expect(chart.map(form=>form.respondent)).toEqual(expect.arrayContaining([parent.name,other.name]));
  });

  it('reuses a retried request and stops new access when the relationship changes',async()=>{
    const requestKey=randomUUID();
    const first=await share([parent.key],{requestKey});
    const second=await share([parent.key],{requestKey});
    expect(second.result.requests[0].id).toBe(first.result.requests[0].id);
    expect(fixture.deliveries).toHaveLength(1);
    fixture.disabled.add(parent.key);
    await expect(shares.redeemDocumentLink(fixture.deliveries[0].token)).rejects.toHaveProperty('status',410);
  });
});
