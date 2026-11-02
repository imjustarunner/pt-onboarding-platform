import { vi,it,expect,beforeEach } from 'vitest';
import crypto from 'node:crypto';
const m=vi.hoisted(()=>({sender:vi.fn(),inbound:vi.fn(),execute:vi.fn(),release:vi.fn(),settings:vi.fn(),auricwell:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:m.execute,release:m.release})}}));
vi.mock('../../services/smsCompliance.service.js',()=>({getSmsSender:m.sender}));
vi.mock('../../controllers/vonageWebhook.controller.js',()=>({inboundSmsWebhook:m.inbound}));
vi.mock('../../services/auricwell/platformIntegrations.js',()=>({platformIntegrations:m.settings}));
vi.mock('../../services/auricwell/clientMessaging.js',()=>({acceptAuthenticatedNotifyreEvent:m.auricwell}));
import { notifyreWebhook, createNotifyreWebhook } from '../notifyre.routes.js';
function request(payload,secret='test-secret'){const body=Buffer.from(JSON.stringify(payload)),timestamp=Math.floor(Date.now()/1000);const sig=crypto.createHmac('sha256',secret).update(`${timestamp}.`).update(body).digest('hex');return{body,query:{},get:()=>`t=${timestamp},v=${sig}`};}
const event={Event:'sms_received',Payload:{ReceivedDateUtc:Math.floor(Date.now()/1000),ReplyID:'r1',SenderNumber:'+17195550123',RecipientNumber:'+17195550124',Message:'STOP'}};
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('AURICWELL_ENABLED','false');vi.stubEnv('NOTIFYRE_WEBHOOK_SECRET','test-secret');vi.stubEnv('NOTIFYRE_CLIENT_CAMPAIGNS_JSON',JSON.stringify({'2':{brandId:'b1',campaignId:'c1'}}));m.settings.mockResolvedValue({settings:{notifyre:{webhookSecret:'old-secret'},clientMessaging:{routes:[]}}});m.auricwell.mockResolvedValue({accepted:true});m.sender.mockResolvedValue({agency_id:2,registration:{provider:'notifyre',brandId:'b1',campaignId:'c1',purposes:['care','reminders']}});m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]);m.inbound.mockImplementation(async(req,res)=>res.status(200).json({ok:true}));});
it('rejects unsigned events before any lookup or processing',async()=>{const req=request(event),res=response();req.get=()=>'';await notifyreWebhook(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.sender).not.toHaveBeenCalled();expect(m.inbound).not.toHaveBeenCalled();});
it('routes authenticated client STOP through the existing consent handler exactly once',async()=>{const req=request(event),res=response();await notifyreWebhook(req,res,vi.fn());expect(m.inbound).toHaveBeenCalledWith(expect.objectContaining({smsProvider:'notifyre',body:{from:'+17195550123',to:'+17195550124',text:'STOP',messageId:'notifyre:r1',receivedAt:event.Payload.ReceivedDateUtc*1000}}),expect.anything(),expect.anything());expect(m.execute.mock.calls.some(([sql])=>sql.includes('SET completed_at'))).toBe(true);m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT completed_at')?[[{completed_at:'now'}]]:[[]]);await notifyreWebhook(request(event),response(),vi.fn());expect(m.inbound).toHaveBeenCalledTimes(1);});
it('rejects a Notifyre event targeting a staff Vonage sender',async()=>{m.sender.mockResolvedValue({registration:{provider:'vonage',campaignId:'staff'}});const res=response();await notifyreWebhook(request(event),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.inbound).not.toHaveBeenCalled();});
it('does not acknowledge failed routing as completed',async()=>{const error=new Error('database unavailable'),next=vi.fn();m.inbound.mockImplementation(async(req,res,next)=>next(error));await notifyreWebhook(request(event),response(),next);expect(next).toHaveBeenCalledWith(error);expect(m.execute.mock.calls.some(([sql])=>sql.includes('SET completed_at'))).toBe(false);expect(m.release).toHaveBeenCalled();});

it('records delivery against the actual carrier ID and owning agency',async()=>{const next=vi.fn();await notifyreWebhook(request({Event:'sms_sent',Payload:{ID:'m1',FromNumber:'+17195550124',Recipient:{ToNumber:'+17195550123',DeliveryStatus:'Delivered'}}}),response(),next);const update=m.execute.mock.calls.find(([sql])=>sql.includes('UPDATE message_logs'));expect(update[0]).toContain('twilio_message_sid');expect(update[0]).toContain('AND agency_id = ?');expect(update[0]).not.toContain('updated_at');expect(update[1]).toEqual(['delivered','notifyre:m1','notifyre:m1',2]);expect(next).not.toHaveBeenCalled();});
it.each([{agency_id:99},{agency_id:2,registration:{provider:'notifyre',brandId:'other',campaignId:'c1',purposes:['care']}},{agency_id:2,registration:{provider:'notifyre',brandId:'b1',campaignId:'other',purposes:['care']}}])('rejects a signed event when the organization, brand or campaign does not match: %j',async patch=>{
 m.sender.mockResolvedValue({agency_id:2,registration:{provider:'notifyre',brandId:'b1',campaignId:'c1',purposes:['care']},...patch});
 const res=response();await notifyreWebhook(request(event),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.inbound).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
});

it('serves a different approved tenant on the same webhook without trusting a payload agency ID',async()=>{
 vi.stubEnv('NOTIFYRE_CLIENT_CAMPAIGNS_JSON',JSON.stringify({'99':{brandId:'b99',campaignId:'c99'}}));
 m.sender.mockResolvedValue({agency_id:99,registration:{provider:'notifyre',brandId:'b99',campaignId:'c99',purposes:['care']}});
 const next=vi.fn();await notifyreWebhook(request({...event,agencyId:2}),response(),next);
 expect(m.sender).toHaveBeenCalledWith(event.Payload.RecipientNumber);expect(m.inbound).toHaveBeenCalledTimes(1);expect(next).not.toHaveBeenCalled();
});
it('retains one receipt when Notifyre posts to both URL aliases during migration',async()=>{
 vi.stubEnv('AURICWELL_ENABLED','true');let completed=false;
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('SELECT completed_at'))return completed?[[{completed_at:'now'}]]:[[]];
  if(sql.includes('SET completed_at'))completed=true;
  return [[]];
 });
 await notifyreWebhook(request(event),response(),vi.fn());
 const res=response();await createNotifyreWebhook({auricwellAlias:true})(request(event,'old-secret'),res,vi.fn());
 expect(m.inbound).toHaveBeenCalledTimes(1);expect(res.json).toHaveBeenCalledWith({duplicate:true});
});
it('requires the signing secret belonging to the URL, including the legacy alias',async()=>{
 vi.stubEnv('AURICWELL_ENABLED','true');const res=response();
 await createNotifyreWebhook({auricwellAlias:true})(request(event),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(m.sender).not.toHaveBeenCalled();expect(m.inbound).not.toHaveBeenCalled();
});
it('routes an AuricWell number through its existing consumer without also creating a legacy message',async()=>{
 vi.stubEnv('AURICWELL_ENABLED','true');
 const settings={clientMessaging:{routes:[{practiceId:'p99',mainNumber:event.Payload.RecipientNumber}]}};
 m.settings.mockResolvedValue({settings});m.sender.mockRejectedValue(Object.assign(new Error('unknown'),{code:'sms_unknown_sender'}));
 await notifyreWebhook(request(event),response(),vi.fn());
 expect(m.auricwell).toHaveBeenCalledWith(settings,event);expect(m.inbound).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
});
it('rejects conflicting owners instead of delivering the same client message to two tenants',async()=>{
 vi.stubEnv('AURICWELL_ENABLED','true');m.settings.mockResolvedValue({settings:{clientMessaging:{routes:[{practiceId:'p99',mainNumber:event.Payload.RecipientNumber}]}}});
 const res=response();await notifyreWebhook(request(event),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(409);expect(m.inbound).not.toHaveBeenCalled();expect(m.auricwell).not.toHaveBeenCalled();
});
it('leaves an unassigned number retryable and does not claim receipt',async()=>{
 m.sender.mockRejectedValue(Object.assign(new Error('unknown'),{code:'sms_unknown_sender'}));const res=response();
 await notifyreWebhook(request(event),res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);expect(m.execute).not.toHaveBeenCalled();
});
it('does not turn an ownership lookup outage into an unassigned or accepted event',async()=>{
 const error=new Error('database unavailable'),next=vi.fn();m.sender.mockRejectedValue(error);
 await notifyreWebhook(request(event),response(),next);expect(next).toHaveBeenCalledWith(error);expect(m.execute).not.toHaveBeenCalled();
});
it.each(['fax_received','fax_sent'])('accepts %s on the shared endpoint only for a primary fax route',async type=>{
 vi.stubEnv('AURICWELL_ENABLED','true');
 const settings={clientMessaging:{routes:[{practiceId:'p99',mainNumber:event.Payload.RecipientNumber,providerNumber:'+17195550999'}]}};
 m.settings.mockResolvedValue({settings});
 const payload={Event:type,Timestamp:Math.floor(Date.now()/1000),Payload:{ID:'fax-1',From:event.Payload.SenderNumber,FromNumber:type==='fax_sent'?event.Payload.RecipientNumber:event.Payload.SenderNumber,To:event.Payload.RecipientNumber,Status:'successful',Pages:1}};
 await notifyreWebhook(request(payload),response(),vi.fn());expect(m.auricwell).toHaveBeenCalledWith(settings,payload);expect(m.inbound).not.toHaveBeenCalled();
 const res=response();const wrong={...payload,Payload:{...payload.Payload,FromNumber:'+17195550999',To:'+17195550999'}};
 await notifyreWebhook(request(wrong),res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);expect(m.auricwell).toHaveBeenCalledTimes(1);
});
it('retains a picture-only MMS reference for the existing agency review flow',async()=>{
 const payload={...event,Event:'mms_received',Payload:{...event.Payload,Message:undefined}};
 await notifyreWebhook(request(payload),response(),vi.fn());
 expect(m.inbound).toHaveBeenCalledWith(expect.objectContaining({notifyreMediaReceipt:'notifyre:r1',body:expect.objectContaining({text:'',messageId:'notifyre:r1'})}),expect.anything(),expect.anything());
});
