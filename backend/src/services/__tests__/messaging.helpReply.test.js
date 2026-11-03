import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
import pool from '../../config/database.js';
import { processSmsKeyword, prepareSmsDelivery, isSmsSuppressed } from '../smsCompliance.service.js';
import { validateSmsRegistration } from '../../utils/smsCompliancePolicy.js';
const registration={provider:'notifyre',brandId:'NLU-brand',campaignId:'NLU-campaign',resellerId:'account',brandName:'Next Level Up',legalName:'Next Level Up, LLC',supportContact:'719-377-6577',website:'https://example.test',privacyUrl:'https://example.test/privacy',termsUrl:'https://example.test/terms',evidenceUrl:'https://example.test/consent',purposes:['care','reminders'],approved:true,numberLinked:true,keywordOwner:'notifyre',helpKeywordOwner:'application'};
const sender={id:7,agency_id:6,phone_number:'+12025550101',status:'active',is_active:1,campaign_id:'NLU-campaign'};
const incoming={from:'+12025550102',to:sender.phone_number,body:'HELP',messageId:'help-1'};
let attempts,sendReply,activeRegistration;
beforeEach(()=>{
 vi.resetAllMocks();attempts=[];activeRegistration={...registration};
 pool.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('FROM twilio_numbers'))return[[{...sender,registration_json:activeRegistration}]];
  if(sql.includes('SELECT blocked FROM auricwell_sms_phone_state'))return[[{blocked:1}]];
  if(sql.includes('INSERT INTO sms_keyword_reply_attempts')){
   if(attempts.some(a=>a.numberId===args[1]&&a.inboundId===args[2]))throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
   const a={id:attempts.length+1,agencyId:args[0],numberId:args[1],inboundId:args[2],from:args[3],to:args[4],body:args[5],status:'pending'};attempts.push(a);return[{insertId:a.id}];
  }
  if(sql.includes("status='submitted'")){Object.assign(attempts.find(a=>a.id===args[1]),{status:'submitted',sid:args[0]});return[{affectedRows:1}];}
  if(sql.includes("status='needs_review'")){Object.assign(attempts.find(a=>a.id===args[1]),{status:'needs_review',error:args[0]});return[{affectedRows:1}];}
  return[[]];
 });
 sendReply=vi.fn(async options=>{expect(await prepareSmsDelivery(options)).toMatchObject({controlReply:true,agencyId:6});return{sid:'notifyre:help-out'};});
});
it.each(['HELP','help',' INFO '])('replies to %s from the receiving line with NLU support details',async body=>{
 expect(await processSmsKeyword({...incoming,body,sendReply})).toBe(true);
 expect(sendReply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({from:incoming.to,to:incoming.from,body:expect.stringContaining('Next Level Up: For help, contact 719-377-6577.')}));
 expect(sendReply.mock.calls[0][0].body).toContain('Reply STOP to opt out.');
 expect(attempts[0]).toMatchObject({agencyId:6,numberId:7,status:'submitted',sid:'notifyre:help-out',inboundId:'help-1'});
});
it('leaves carrier-owned HELP unchanged unless the campaign explicitly opts into app handling',async()=>{
 delete activeRegistration.helpKeywordOwner;expect(await processSmsKeyword({...incoming,sendReply})).toBe(true);
 expect(sendReply).not.toHaveBeenCalled();expect(attempts).toHaveLength(0);
});
it('honors explicit carrier HELP ownership even when other keywords are app-owned',async()=>{
 activeRegistration.keywordOwner='application';activeRegistration.helpKeywordOwner='notifyre';
 await processSmsKeyword({...incoming,sendReply});expect(sendReply).not.toHaveBeenCalled();expect(attempts).toHaveLength(0);
});
it('does not alter suppression or subscribe someone who requests HELP',async()=>{
 await processSmsKeyword({...incoming,sendReply});
 expect(await isSmsSuppressed({...sender,registration:activeRegistration,scope:'campaign:NLU-campaign'},incoming.from)).toBe(true);
 expect(pool.execute.mock.calls.some(([sql])=>/(INSERT|UPDATE)[\s\S]*sms_(recipient_permissions|permission_events)/.test(sql))).toBe(false);
});
it('claims before sending and consumes concurrent aliases and later webhook retries',async()=>{
 await Promise.all([processSmsKeyword({...incoming,sendReply}),processSmsKeyword({...incoming,sendReply})]);
 const claim=pool.execute.mock.calls.findIndex(([sql])=>sql.includes('INSERT INTO sms_keyword_reply_attempts'));
 expect(pool.execute.mock.invocationCallOrder[claim]).toBeLessThan(sendReply.mock.invocationCallOrder[0]);
 await processSmsKeyword({...incoming,sendReply});expect(sendReply).toHaveBeenCalledTimes(1);expect(attempts).toHaveLength(1);
});
it('never repeats an uncertain send on webhook retry',async()=>{
 sendReply.mockRejectedValueOnce(Object.assign(new Error('uncertain'),{code:'notifyre_delivery_uncertain'}));
 await expect(processSmsKeyword({...incoming,sendReply})).rejects.toMatchObject({code:'notifyre_delivery_uncertain'});
 expect(attempts[0].status).toBe('needs_review');await processSmsKeyword({...incoming,sendReply});expect(sendReply).toHaveBeenCalledTimes(1);
});
it('does not send when the durable claim cannot be stored',async()=>{
 const execute=pool.execute.getMockImplementation();pool.execute.mockImplementation(async(sql,args)=>{if(sql.includes('INSERT INTO sms_keyword_reply_attempts'))throw Error('storage unavailable');return execute(sql,args);});
 await expect(processSmsKeyword({...incoming,sendReply})).rejects.toThrow('storage unavailable');expect(sendReply).not.toHaveBeenCalled();
});
it('does not resend if storing the carrier acknowledgement fails',async()=>{
 const execute=pool.execute.getMockImplementation();pool.execute.mockImplementation(async(sql,args)=>{if(sql.includes("status='submitted'"))throw Error('ack storage unavailable');return execute(sql,args);});
 await expect(processSmsKeyword({...incoming,sendReply})).rejects.toThrow('ack storage unavailable');
 await processSmsKeyword({...incoming,sendReply});expect(sendReply).toHaveBeenCalledTimes(1);expect(attempts[0].status).toBe('needs_review');
});
it('requires an inbound message ID before attempting an app-owned HELP response',async()=>{
 await expect(processSmsKeyword({...incoming,messageId:null,sendReply})).rejects.toMatchObject({status:400});
 expect(sendReply).not.toHaveBeenCalled();expect(attempts).toHaveLength(0);
});
it('lets a fresh HELP request receive a new reply',async()=>{
 await processSmsKeyword({...incoming,sendReply});await processSmsKeyword({...incoming,messageId:'help-2',sendReply});
 expect(sendReply).toHaveBeenCalledTimes(2);expect(attempts).toHaveLength(2);
});
it.each(['application','notifyre'])('validates explicit HELP ownership %s',helpKeywordOwner=>{
 expect(validateSmsRegistration({...registration,helpKeywordOwner})).toEqual([]);
});
it.each(['vonage','other'])('rejects incompatible HELP ownership %s',helpKeywordOwner=>{
 expect(validateSmsRegistration({...registration,helpKeywordOwner})).not.toHaveLength(0);
});
