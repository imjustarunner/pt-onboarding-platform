import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),audit:vi.fn(),settings:null}));
vi.mock('../auricwell/repository.js',()=>({pool:{execute:m.execute},transaction:fn=>fn({execute:m.execute}),seal:v=>v,open:v=>v,
  audit:m.audit,list:vi.fn(),get:vi.fn(),create:vi.fn(),update:vi.fn(),findSource:vi.fn(),sourceRecords:vi.fn(),lockPractice:vi.fn()}));
vi.mock('../auricwell/clinical.js',()=>({patientAccess:vi.fn()}));
vi.mock('../auricwell/platformIntegrations.js',()=>({platformIntegrations:async()=>({settings:m.settings}),recordNotifyreWebhookVerified:vi.fn()}));
vi.mock('../auricwell/verificationSms.js',()=>({acceptVerificationEvent:async()=>false}));
vi.mock('../auricwell/sessionTransports.js',()=>({notifyreRequest:vi.fn(),notifyreReceipt:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
import { acceptAuthenticatedNotifyreEvent } from '../auricwell/clientMessaging.js';
import { restartClientSmsCategories } from '../auricwell/clientMessagingPolicy.js';
let contact,state,events,outbox;
const at=Date.now()-10000;
const event=(text,offset,id=text)=>({Event:'sms_received',Timestamp:Math.floor((at+offset)/1000),Payload:{ReplyID:id,SenderNumber:'+13035550101',RecipientNumber:'+13035550100',Message:text,ReceivedDateUtc:(at+offset)/1000}});
beforeEach(()=>{
 vi.clearAllMocks();state={blocked:false,command_at:0};events=new Set();outbox=[];
 m.settings={smsProvider:'notifyre',clientMessaging:{routes:[{practiceId:'p1',mainNumber:'+13035550100',campaignId:'c1',brand:'Test agency'}]}};
 contact={id:'contact1',practice_id:'p1',patient_id:'patient1',revision:1,payload:{phone:'+13035550101',accountId:'a1',consentAt:new Date(at-1000).toISOString(),evidence:'Recorded permission',categories:{reminders:true,links:true,forms:true,account:false,conversations:false}}};
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('INSERT IGNORE INTO auricwell_sms_events')) {const duplicate=events.has(args[0]);events.add(args[0]);return [{affectedRows:duplicate?0:1}];}
  if(sql.includes('FROM auricwell_practices')) return [[{id:'p1',agency_id:2,settings:{},name:'Test agency'}]];
  if(sql.includes('SELECT * FROM auricwell_sms_phone_state')) return [[state]];
  if(sql.includes('UPDATE auricwell_sms_phone_state')) {state={blocked:args[0],command_at:args[1]};return [{}];}
  if(sql.includes('SELECT * FROM auricwell_sms_contacts')) return [[contact]];
  if(sql.includes('UPDATE auricwell_sms_contacts SET payload')) {contact.payload=args[0];contact.revision++;return [{}];}
  if(sql.includes('INSERT IGNORE INTO auricwell_sms_outbox')) {outbox.push({id:args[0],practice_id:args[1],contact_id:args[2],thread_id:args[3],key:args[4],category:args[5],payload:args[6],status:'queued'});return [{affectedRows:1}];}
  if(sql.includes('FROM auricwell_sms_outbox WHERE practice_id')) return [[outbox.find(r=>r.key===args[1])]];
  return [[]];
 });
});
it('restores multiple individually declined categories and gives only their individual opt-out commands once',async()=>{
 for(const [text,offset] of [['NOLINK',100],['NOFORM',200]]) await acceptAuthenticatedNotifyreEvent(m.settings,event(text,offset));
 expect(contact.payload.categories).toMatchObject({links:false,forms:false,reminders:true});
 await acceptAuthenticatedNotifyreEvent(m.settings,event('START',300));
 expect(contact.payload.categories).toMatchObject({links:true,forms:true,account:false,conversations:false});
 expect(outbox).toHaveLength(1);expect(outbox[0].payload.body).toContain('Turned back on: session links, form texts');
 expect(outbox[0].payload.body).toContain('NOLINK (session links)');expect(outbox[0].payload.body).toContain('NOFORM (form texts)');
 expect(outbox[0].payload.body).not.toContain('NOACCOUNT');
 await acceptAuthenticatedNotifyreEvent(m.settings,event('START',300));expect(outbox).toHaveLength(1);
});
it('keeps the standard account restart distinct and rejects a delayed START after STOP',async()=>{
 await acceptAuthenticatedNotifyreEvent(m.settings,event('NOFORM',100));
 await acceptAuthenticatedNotifyreEvent(m.settings,event('STOP',300));
 await acceptAuthenticatedNotifyreEvent(m.settings,event('START',200,'old-start'));
 expect(state.blocked).toBe(true);
 await acceptAuthenticatedNotifyreEvent(m.settings,event('START',400));
 expect(state.blocked).toBe(false);expect(contact.payload.categories.forms).toBe(false);expect(outbox).toHaveLength(0);
});
it('never invents consent or overrides a newer category decline',()=>{
 const input={categories:{forms:false,links:false},consentedCategories:{forms:true,links:true},accountId:'a',consentAt:'2026-11-02',evidence:'Permission',commandAt:{forms:200,links:100}};
 expect(restartClientSmsCategories(input,150).restored).toEqual(['links']);
 expect(restartClientSmsCategories({...input,evidence:''},300).restored).toEqual([]);
});
