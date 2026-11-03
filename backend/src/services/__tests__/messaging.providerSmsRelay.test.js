import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../../models/MessageLog.model.js', () => ({ default: { createOutbound: vi.fn(), createInbound: vi.fn(), markSent: vi.fn(), markFailed: vi.fn() } }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: vi.fn() } }));
vi.mock('../providerSmsRelaySettings.service.js', () => ({ relayEnrollmentReady: vi.fn() }));
vi.mock('../clinicalSmsSend.service.js', () => ({ sendClinicalSms: vi.fn() }));
vi.mock('../smsCompliance.service.js', () => ({ isSmsSuppressed: vi.fn() }));
vi.mock('../providerRelaySupport.service.js', () => ({ requestRelaySupport: vi.fn() }));
import pool from '../../config/database.js';
import Client from '../../models/Client.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import MessageLog from '../../models/MessageLog.model.js';
import Vonage from '../vonage.service.js';
import { relayEnrollmentReady } from '../providerSmsRelaySettings.service.js';
import { sendClinicalSms } from '../clinicalSmsSend.service.js';
import { isSmsSuppressed } from '../smsCompliance.service.js';
import { requestRelaySupport } from '../providerRelaySupport.service.js';
import { forwardClientSmsToProviders, handleProviderSmsReply } from '../providerSmsRelay.service.js';
const familyPhone='+16189107000',staffPhone='+17192172227';
const enrollment={id:1,agency_id:450,number_id:6,provider_user_id:1433,phone:staffPhone,enabled:1};
const code='ROWQAO-2271-1449';
const route={id:1,enrollment_id:1,client_id:2271,guardian_user_id:1449,family_phone:familyPhone,reply_code:code};
const incoming={route:{agencyId:450,clientId:2271,number:{id:6}},from:familyPhone,to:'+17196775413',body:'QA question',messageId:'in-1',inboundLogId:40};
const reply={sender:{id:6,agency_id:450},from:staffPhone,to:incoming.to,body:`${code} QA answer`,messageId:'reply-1'};
let enrollments,routes,claims,logs,replies,nextId,lastNotice,recent;
beforeEach(()=>{
 vi.clearAllMocks(); enrollments=[enrollment];routes=[route];claims=new Set();logs=new Map();replies=new Map();nextId=100;lastNotice=null;recent=route;
 pool.getConnection.mockResolvedValue({execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]),release:vi.fn()});
 Client.findById.mockResolvedValue({id:2271,agency_id:450,initials:'ROWQAO'});
 ClientGuardian.listForClient.mockResolvedValue([{guardian_user_id:1449,phone:familyPhone,access_enabled:1,is_active:1,relationship_type:'parent'}]);
 relayEnrollmentReady.mockImplementation(async e=>!!e.enabled);isSmsSuppressed.mockResolvedValue(false);
 MessageLog.createOutbound.mockImplementation(async value=>{const id=++nextId;logs.set(id,value);return{id};});
 MessageLog.createInbound.mockImplementation(async value=>{const id=++nextId;logs.set(id,value);return{id};});
 MessageLog.markSent.mockImplementation(async(id)=>{if(logs.get(id)?.metadata.providerSmsRelayNotice)lastNotice=new Date();});
 Vonage.sendSms.mockResolvedValue({sid:'out-1'});sendClinicalSms.mockResolvedValue({messageLog:{id:60}});
 pool.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM provider_sms_relay_enrollments'))return[enrollments];
  if(sql.startsWith('SELECT * FROM provider_sms_relay_routes'))return[routes.filter(r=>Number(r.enrollment_id)===Number(args[0])&&(r.reply_code===args[1]||r.id===args[1]))];
  if(sql.includes('MAX(created_at) AS last_notice'))return[[{last_notice:lastNotice}]];
  if(sql.startsWith('SELECT route.*'))return[recent?[recent]:[]];
  if(sql.startsWith('SELECT r.id, original.body')){
   const entry=[...replies.entries()].reverse().find(([,r])=>r.status==='awaiting_confirmation');if(!entry)return[[]];
   const[id,r]=entry,prompt=logs.get(r.log),original=logs.get(prompt.metadata.relayOriginalInboundLogId);
   return[[{id,pending_body:original.body,route_id:prompt.metadata.relayRouteId,relay_action:prompt.metadata.relayAction}]];
  }
  if(/INSERT INTO provider_sms_relay_(dispatches|replies)/.test(sql)){
   const key=sql.split(' ')[2]+':'+args.slice(0,2).join(':');if(claims.has(key))throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
   claims.add(key);const id=++nextId;if(sql.includes('relay_replies'))replies.set(id,{status:'pending'});return[{insertId:id}];
  }
  if(sql.startsWith('UPDATE provider_sms_relay_replies')&&!sql.includes("status='expired'")){
   const status=sql.match(/status='([^']+)'/)?.[1];const hasLog=sql.includes('outbound_log_id=?');
   for(const id of args.slice(hasLog?1:0)){if(replies.has(id))replies.set(id,{...replies.get(id),status,...(hasLog?{log:args[0]}:{})});}
  }
  return[{affectedRows:1}];
 });
});
it('forwards once with a short family code and sends opt-out guidance on the first copy',async()=>{
 await forwardClientSmsToProviders(incoming);await forwardClientSmsToProviders(incoming);
 expect(Vonage.sendSms).toHaveBeenCalledTimes(1);
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({providerRelayEnrollmentId:1,body:expect.stringContaining('or #1 followed by your message.')}));
 expect(Vonage.sendSms.mock.calls[0][0].body).toContain('NOCLIENTS to stop client forwarding');
 expect(Vonage.sendSms.mock.calls[0][0].body).toContain('SUPPORT anytime for scheduling or other help');
 expect(Vonage.sendSms.mock.calls[0][0].body).not.toContain(code);
});
it('reminds only on the first incoming forward after fourteen days, not every message or confirmation',async()=>{
 lastNotice=new Date(Date.now()-13*86400000);await forwardClientSmsToProviders(incoming);
 expect(Vonage.sendSms.mock.calls.at(-1)[0].body).not.toContain('Reminder:');
 lastNotice=new Date(Date.now()-15*86400000);await handleProviderSmsReply({...reply,body:'An answer'});
 expect(Vonage.sendSms.mock.calls.at(-1)[0].body).not.toContain('Reminder:');
 await forwardClientSmsToProviders({...incoming,messageId:'in-2'});expect(Vonage.sendSms.mock.calls.at(-1)[0].body).toContain('Reminder:');
 await forwardClientSmsToProviders({...incoming,messageId:'in-3'});expect(Vonage.sendSms.mock.calls.at(-1)[0].body).not.toContain('Reminder:');
});
it.each([code,'#1'])('routes explicit code %s only to its exact guardian, once',async address=>{
 await handleProviderSmsReply({...reply,body:`${address} QA answer`});await handleProviderSmsReply(reply);
 expect(sendClinicalSms).toHaveBeenCalledTimes(1);
 expect(sendClinicalSms).toHaveBeenCalledWith({userId:1433,clientId:2271,numberId:6,body:'QA answer',relayRecipient:{phone:familyPhone,guardianUserId:1449}});
});
it('holds an unaddressed reply until Y, preserves its body and destination when another family writes, and deduplicates Y',async()=>{
 await handleProviderSmsReply({...reply,body:'My exact answer'});expect(sendClinicalSms).not.toHaveBeenCalled();
 expect(Vonage.sendSms.mock.calls.at(-1)[0].body).toContain("Did you mean to reply to ROWQAO's guardian (phone ending 7000)?");
 recent={...route,id:2,client_id:999,guardian_user_id:999,family_phone:'+12025550101'};
 await handleProviderSmsReply({...reply,body:'Y',messageId:'confirm'});await handleProviderSmsReply({...reply,body:'Y',messageId:'confirm'});
 expect(sendClinicalSms).toHaveBeenCalledTimes(1);expect(sendClinicalSms.mock.calls[0][0]).toMatchObject({clientId:2271,body:'My exact answer',relayRecipient:{phone:familyPhone}});
 await handleProviderSmsReply({...reply,body:'Y',messageId:'second-Y'});expect(sendClinicalSms).toHaveBeenCalledTimes(1);
});
it('cancels on N and does not replace an outstanding reply with another text',async()=>{
 await handleProviderSmsReply({...reply,body:'First answer'});
 await handleProviderSmsReply({...reply,body:'Second answer',messageId:'second'});
 expect(Vonage.sendSms.mock.calls.at(-1)[0].body).toContain('An earlier reply is waiting');
 await handleProviderSmsReply({...reply,body:'N',messageId:'cancel'});await handleProviderSmsReply({...reply,body:'Y',messageId:'late'});
 expect(sendClinicalSms).not.toHaveBeenCalled();
});
it.each(['#ZZ answer','OTHER-123-456 answer','Y'])('does not guess a recipient for %s',async body=>{
 await handleProviderSmsReply({...reply,body});expect(sendClinicalSms).not.toHaveBeenCalled();
});
it('does not infer a recipient without a recent sent forward',async()=>{
 recent=null;await handleProviderSmsReply({...reply,body:'An answer'});expect(sendClinicalSms).not.toHaveBeenCalled();expect(Vonage.sendSms.mock.calls.at(-1)[0].body).toContain('no recent eligible family');
});
it('consumes disabled or STOPped provider replies without exposing them to a family',async()=>{
 enrollments=[{...enrollment,enabled:0}];expect(await handleProviderSmsReply(reply)).toBe(true);
 enrollments=[enrollment];isSmsSuppressed.mockResolvedValue(true);expect(await handleProviderSmsReply(reply)).toBe(true);
 expect(sendClinicalSms).not.toHaveBeenCalled();expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('rechecks assignment and the exact family before confirming, even after a prompt',async()=>{
 await handleProviderSmsReply({...reply,body:'Answer'});ClientGuardian.listForClient.mockResolvedValue([]);
 await handleProviderSmsReply({...reply,body:'Y',messageId:'confirm'});expect(sendClinicalSms).not.toHaveBeenCalled();
});
it('rejects another enrollment short code',async()=>{
 routes=[{...route,enrollment_id:2}];await handleProviderSmsReply({...reply,body:'#1 answer'});expect(sendClinicalSms).not.toHaveBeenCalled();
});
it('does not forward disabled/unassigned, other-tenant, revoked-guardian or MMS messages',async()=>{
 relayEnrollmentReady.mockResolvedValue(false);await forwardClientSmsToProviders(incoming);relayEnrollmentReady.mockResolvedValue(true);
 Client.findById.mockResolvedValueOnce({id:2271,agency_id:377});await forwardClientSmsToProviders(incoming);
 ClientGuardian.listForClient.mockResolvedValueOnce([]);await forwardClientSmsToProviders(incoming);
 await forwardClientSmsToProviders({...incoming,mediaUrls:['https://example.com/image']});expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('marks uncertain sends for review without retrying on duplicate carrier delivery',async()=>{
 sendClinicalSms.mockRejectedValueOnce(Object.assign(new Error('uncertain'),{code:'notifyre_delivery_uncertain'}));
 await handleProviderSmsReply(reply);await handleProviderSmsReply(reply);expect(sendClinicalSms).toHaveBeenCalledTimes(1);
 expect([...replies.values()].some(r=>r.status==='needs_review')).toBe(true);
});

it('SUPPORT asks which recent family to hand off, creates a Support request after Y, and never texts SUPPORT to the family',async()=>{
 await handleProviderSmsReply({...reply,body:'SUPPORT'});expect(requestRelaySupport).not.toHaveBeenCalled();expect(sendClinicalSms).not.toHaveBeenCalled();
 expect(Vonage.sendSms.mock.calls.at(-1)[0].body).toContain('to Support? Reply Y');
 expect(pool.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT route.*'))[0]).not.toContain('INTERVAL 2 HOUR');
 await handleProviderSmsReply({...reply,body:'Y',messageId:'support-Y'});
 expect(requestRelaySupport).toHaveBeenCalledWith(expect.objectContaining({enrollment,route}));expect(sendClinicalSms).not.toHaveBeenCalled();
 await handleProviderSmsReply({...reply,body:'Y',messageId:'support-Y'});expect(requestRelaySupport).toHaveBeenCalledTimes(1);
});
it('a short code plus SUPPORT selects a family explicitly without sending a client reply',async()=>{
 await handleProviderSmsReply({...reply,body:'#1 SUPPORT'});expect(requestRelaySupport).toHaveBeenCalledTimes(1);expect(sendClinicalSms).not.toHaveBeenCalled();
});
it('does not treat expired confirmation as a fresh reply',async()=>{
 await handleProviderSmsReply({...reply,body:'An answer'});for(const row of replies.values())if(row.status==='awaiting_confirmation')row.status='expired';
 await handleProviderSmsReply({...reply,body:'Y',messageId:'expired-Y'});expect(sendClinicalSms).not.toHaveBeenCalled();
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INTERVAL 10 MINUTE'))).toBe(true);
});
