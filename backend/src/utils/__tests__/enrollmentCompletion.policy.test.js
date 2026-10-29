import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { missingInsuranceCards } from '../insuranceCardRequirements.js';
import { safeEnrollmentPortalUrl } from '../enrollmentPortalAccess.js';
import { verifyNotifyreSignature, normalizeNotifyreEvent, smsTransport, sendNotifyreSms } from '../../services/notifyre.service.js';
const env = { NOTIFYRE_ENABLED:'true',NOTIFYRE_API_TOKEN:'secret',NOTIFYRE_WEBHOOK_SECRET:'hook-secret',NOTIFYRE_BAA_REFERENCE:'signed-test',NOTIFYRE_CLIENT_CAMPAIGNS_JSON:JSON.stringify({'2':{brandId:'brand',campaignId:'campaign1'}}) };
const registration = { provider:'notifyre',brandId:'brand',campaignId:'campaign1',resellerId:'notifyre',brandName:'Agency',legalName:'Agency LLC',supportContact:'support@example.test',website:'https://example.test',privacyUrl:'https://example.test/privacy',termsUrl:'https://example.test/terms',evidenceUrl:'https://example.test/consent',purposes:['care','reminders','billing','account_security'],keywordOwner:'notifyre',approved:true,numberLinked:true };
const delivery = { agencyId:2,registration,purpose:'reminders',to:'+17195550123',from:'+17195550124',body:'Agency: Please check your portal.' };
describe('insurance card requirements',()=>{
 it('exempts no insurance and Medicaid-only',()=>{expect(missingInsuranceCards(null)).toEqual([]);expect(missingInsuranceCards({primary:{insurerName:'Health First Colorado'}})).toEqual([]);});
 it('never blocks enrollment for missing commercial or Medicaid cards',()=>{expect(missingInsuranceCards({primary:{insurerName:'Commercial'}})).toEqual([]);expect(missingInsuranceCards({primary:{isMedicaid:true},secondary:{insurerName:'Commercial'}})).toEqual([]);});
 it('recognizes private references in enrollment and saved policies',()=>{expect(missingInsuranceCards({primary:{insurerName:'Commercial'},primaryCardFrontUrl:'gs://a',primary_card_back_url:'gs://b'})).toEqual([]);});
});
describe('Notifyre client campaign routing',()=>{
 it('leaves workforce on Vonage and selects only the configured client campaign',()=>{expect(smsTransport({registration:{campaignId:'staff'},purpose:'workforce'},env)).toBe('vonage');expect(smsTransport(delivery,env)).toBe('notifyre');});
 it('blocks inactive transport, wrong campaigns, marketing and workforce',()=>{expect(()=>smsTransport(delivery,{...env,NOTIFYRE_ENABLED:'false'})).toThrow();expect(()=>smsTransport(delivery,{...env,NOTIFYRE_CLIENT_CAMPAIGNS_JSON:JSON.stringify({'2':{brandId:'brand',campaignId:'other'}})})).toThrow();for(const purpose of ['workforce','marketing','polling'])expect(()=>smsTransport({...delivery,purpose},env)).toThrow();});
 it('posts documented SMS format and reports acceptance as queued',async()=>{let request;const result=await sendNotifyreSms(delivery,{env,fetchImpl:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({success:true,payload:{smsMessageID:'123',invalidToNumbers:[]}})};}});expect(result).toMatchObject({sid:'notifyre:123',status:'queued'});expect(JSON.parse(request.body)).toMatchObject({From:delivery.from,Recipients:[{type:'mobile_number',value:delivery.to}]});});
 it('never falls back or retries after timeout or rejection',async()=>{let calls=0;await expect(sendNotifyreSms(delivery,{env,fetchImpl:async()=>{calls++;throw new Error('timeout');}})).rejects.toThrow('Check message activity');expect(calls).toBe(1);await expect(sendNotifyreSms(delivery,{env,fetchImpl:async()=>({ok:true,json:async()=>({success:false})})})).rejects.toThrow('did not accept');});
});
describe('Notifyre webhooks',()=>{
 const now=1800000000000, raw=Buffer.from('{"Event":"sms_received"}'),t=String(now/1000);
 const signature=crypto.createHmac('sha256',env.NOTIFYRE_WEBHOOK_SECRET).update(`${t}.`).update(raw).digest('hex');
 it('accepts signed raw JSON; rejects tampering, missing secret, replay and duplicate headers',()=>{const header=`t=${t},v=${signature}`;expect(verifyNotifyreSignature(raw,header,env.NOTIFYRE_WEBHOOK_SECRET,now)).toBe(true);expect(verifyNotifyreSignature(Buffer.from('{}'),header,env.NOTIFYRE_WEBHOOK_SECRET,now)).toBe(false);expect(verifyNotifyreSignature(raw,header,'',now)).toBe(false);expect(verifyNotifyreSignature(raw,header,env.NOTIFYRE_WEBHOOK_SECRET,now+301000)).toBe(false);expect(verifyNotifyreSignature(raw,`${header},t=${t}`,env.NOTIFYRE_WEBHOOK_SECRET,now)).toBe(false);});
 it('maps received messages and delivery receipts without losing carrier identity',()=>{expect(normalizeNotifyreEvent({Event:'sms_received',Payload:{ReplyID:'r1',SenderNumber:'+17195550123',RecipientNumber:'+17195550124',Message:'STOP'}})).toMatchObject({id:'notifyre:r1',text:'STOP'});expect(normalizeNotifyreEvent({event:'sms_sent',payload:{id:'m1',fromNumber:delivery.from,recipient:{deliveryStatus:'delivered',toNumber:delivery.to}}})).toMatchObject({id:'notifyre:m1',status:'delivered'});});
});
it('never exposes a password token as a portal URL',()=>{expect(safeEnrollmentPortalUrl('https://agency.test/login')).toBe('https://agency.test/login');for(const url of ['https://agency.test/passwordless-login/secret','https://agency.test/login?token=secret','javascript:alert(1)'])expect(safeEnrollmentPortalUrl(url)).toBe(null);});
