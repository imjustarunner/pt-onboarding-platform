import {createHash} from 'node:crypto';
import {beforeEach, it, expect, vi} from 'vitest';
vi.mock('../../config/database.js', () => ({default:{execute:vi.fn()}}));
vi.mock('../chatEncryption.service.js', () => ({decryptChatText:vi.fn()}));
vi.mock('../smsCompliance.service.js', () => ({getSmsSender:vi.fn(),isSmsSuppressed:vi.fn(),recordSmsPermission:vi.fn()}));
import pool from '../../config/database.js';
import {decryptChatText} from '../chatEncryption.service.js';
import {getSmsSender,isSmsSuppressed,recordSmsPermission} from '../smsCompliance.service.js';
import {buildSmsConsentDisclosure} from '../../utils/smsConsentDisclosure.js';
import {reviewSmsConsentRequest} from '../smsConsentRequest.service.js';

const registration={brandId:'B1',campaignId:'C2',resellerId:'R1',brandName:'ITSCO',legalName:'ITSCO, LLC',supportContact:'support@example.test',
 website:'https://example.test',termsUrl:'https://example.test/terms',privacyUrl:'https://example.test/privacy',evidenceUrl:'https://example.test/proof',
 purposes:['care','reminders','billing'],keywordOwner:'application',approved:true,numberLinked:true};
let signed,activation,send,row;
const review=()=>reviewSmsConsentRequest({agencyId:2,requestId:4,actorUserId:501,signerVerified:true,sendConfirmation:send});
beforeEach(()=>{
 vi.resetAllMocks();activation={};
 const disclosure=buildSmsConsentDisclosure(registration,{signerRole:'guardian'});
 signed={choices:{care:'yes',reminders:'yes',billing:'yes'},disclosure,signedAt:'2026-01-01T00:00:00Z'};
 row={id:4,agency_id:2,number_id:3,phone:'+13035550101',signer_role:'guardian',signed_at:new Date('2026-01-01'),signed_payload_json:{},
  disclosure_json:disclosure,disclosure_hash:createHash('sha256').update(JSON.stringify(disclosure)).digest('hex')};
 decryptChatText.mockImplementation(()=>JSON.stringify(signed));
 getSmsSender.mockResolvedValue({registration,agency_id:2,scope:'campaign:C2',phone_number:'+13035550100'});
 isSmsSuppressed.mockResolvedValue(false);
 pool.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM sms_consent_requests'))return [[row]];
  if(sql.startsWith('SELECT phone_number'))return [[{phone_number:'+13035550100'}]];
  if(sql.startsWith('SELECT id FROM sms_consent_requests'))return [[]];
  if(sql.startsWith('SELECT activation_json'))return [[{activation_json:activation}]];
  if(sql.startsWith('UPDATE sms_consent_requests SET activation_json'))activation=JSON.parse(args[0]);
  return [{affectedRows:1}];
 });
 send=vi.fn().mockResolvedValue({sid:'one-family-confirmation'});
});
it.each(['guardian','client'])('sends one confirmation for three choices by a %s and none on repeated review',async role=>{
 row.signer_role=role;
 const result=await review();
 expect(send).toHaveBeenCalledOnce();
 expect(send.mock.calls[0][0]).toMatchObject({confirmationPurposes:['care','reminders','billing']});
 expect(send.mock.calls[0][0].body).toContain("You'll receive appointment reminders, messages from your care team and billing updates.");
 expect(Object.values(result.results).every(r=>r.confirmationMessageId==='one-family-confirmation')).toBe(true);
 await review();expect(send).toHaveBeenCalledOnce();
});
it('retains declined choices without confirming or enabling those message types',async()=>{
 signed.choices={care:'yes',reminders:'no',billing:'no'};
 await review();
 expect(send.mock.calls[0][0].confirmationPurposes).toEqual(['care']);
 expect(send.mock.calls[0][0].body).toContain("You'll receive messages from your care team.");
 expect(send.mock.calls[0][0].body).not.toContain('appointment reminders');
 expect(send.mock.calls[0][0].body).not.toContain('billing updates');
 expect(recordSmsPermission).toHaveBeenCalledWith(expect.objectContaining({purpose:'reminders',status:'opted_out'}));
 expect(recordSmsPermission).toHaveBeenCalledWith(expect.objectContaining({purpose:'billing',status:'opted_out'}));
 expect(activation.reminders.confirmationMessageId).toBeNull();
});
it('saves all declined choices without any acceptance text',async()=>{
 signed.choices={care:'no',reminders:'no',billing:'no'};
 await review();expect(send).not.toHaveBeenCalled();
 expect(Object.values(activation).every(r=>r.choice==='no'&&r.activated===true)).toBe(true);
});
it('does not resend previously activated choices from an older partial activation',async()=>{
 activation={care:{activated:true,choice:'yes',confirmationMessageId:'previous'}};
 await review();
 expect(send).toHaveBeenCalledOnce();
 expect(send.mock.calls[0][0].confirmationPurposes).toEqual(['reminders','billing']);
 expect(activation.care.confirmationMessageId).toBe('previous');
});
it('keeps STOP enforced before sending or saving any acceptance',async()=>{
 isSmsSuppressed.mockResolvedValue(true);
 await expect(review()).rejects.toMatchObject({code:'sms_opted_out'});
 expect(send).not.toHaveBeenCalled();expect(recordSmsPermission).not.toHaveBeenCalled();
});
it('revokes the accepted types if the single confirmation fails',async()=>{
 send.mockRejectedValue(new Error('carrier unavailable'));
 await expect(review()).rejects.toThrow('carrier unavailable');
 expect(recordSmsPermission.mock.calls.slice(-3).map(([r])=>[r.purpose,r.status])).toEqual([['care','opted_out'],['reminders','opted_out'],['billing','opted_out']]);
 expect(activation).toEqual({});
});
