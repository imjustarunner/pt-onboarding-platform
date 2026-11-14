import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../staffVerbalReminderConsent.service.js',()=>({reviewedVerbalReminderGrant:vi.fn()}));
import pool from '../../config/database.js';
import {reviewedVerbalReminderGrant} from '../staffVerbalReminderConsent.service.js';
import {prepareSmsDelivery,recordedReminderConsent} from '../smsCompliance.service.js';
import {validateSmsConsentEvidence} from '../../utils/smsCompliancePolicy.js';
const registration={provider:'notifyre',brandId:'brand',campaignId:'campaign',brandName:'Agency',legalName:'Agency LLC',resellerId:'r',supportContact:'support@example.com',website:'https://example.com',termsUrl:'https://example.com/terms',privacyUrl:'https://example.com/privacy',evidenceUrl:'https://example.com/consent',purposes:['reminders'],keywordOwner:'notifyre',approved:true,numberLinked:true,verbalReminderConsentApproved:true,verbalReminderConsentVersion:'2026-11-01.1'};
const evidence={source:'staff_verbal',version:'2026-11-01.1',grants:[{clientId:101,recipientUserId:55,consentEventId:9}]};
let sender;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NOTIFYRE_CLIENT_CAMPAIGNS_JSON',JSON.stringify({'2':{brandId:'brand',campaignId:'campaign'}}));sender={id:3,agency_id:2,phone_number:'+13035550101',is_active:1,campaign_id:'campaign',registration_json:registration};pool.execute.mockImplementation(async sql=>sql.includes('FROM twilio_numbers')?[[sender]]:sql.includes('SELECT evidence_json')?[[{evidence_json:evidence}]]:[[]]);reviewedVerbalReminderGrant.mockResolvedValue({source:'staff_verbal',reference:'sms_permission_events:9',collectedAt:'2026-11-01T12:00:00Z'});});
const message={agencyId:2,clientId:101,to:'+13035550100',from:'+13035550101',purpose:'reminders',body:'Appointment reminder'};
it('rechecks recorded staff evidence with the exact client and phone at the actual sender boundary',async()=>{
 expect(await prepareSmsDelivery(message)).toMatchObject({purpose:'reminders'});expect(reviewedVerbalReminderGrant).toHaveBeenCalledWith({evidence,agencyId:2,clientId:101,phone:message.to});
 reviewedVerbalReminderGrant.mockResolvedValue(null);await expect(prepareSmsDelivery(message)).rejects.toMatchObject({code:'sms_verbal_recipient_changed'});
});
it('never accepts a fabricated staff signature through the existing generic enrollment route',()=>{
 expect(validateSmsConsentEvidence({purpose:'reminders',status:'opted_in',evidence:{source:'staff_verbal',signerVerified:true,signatureReference:'fabricated',reference:'x',disclosure:'x',collectedAt:'2026-01-01'}})).not.toHaveLength(0);
});
it('rejects staff-verbal activation when the current campaign no longer has its verbal flow approved',async()=>{
 sender={...sender,registration_json:{...registration,verbalReminderConsentApproved:false}};await expect(prepareSmsDelivery(message)).rejects.toMatchObject({code:'sms_verbal_program_not_ready'});expect(reviewedVerbalReminderGrant).not.toHaveBeenCalled();
});
it('makes preference readers use a recipient-bound verbal record without fabricating signed evidence',async()=>{
 const impl=pool.execute.getMockImplementation();pool.execute.mockImplementation((sql,...args)=>sql.includes('SELECT n.phone_number')?Promise.resolve([[{phone_number:message.from}]]):impl(sql,...args));
 expect(await recordedReminderConsent(2,message.to,{clientId:101,recipientUserId:55})).toMatchObject({source:'staff_verbal'});expect(reviewedVerbalReminderGrant).toHaveBeenCalledWith({evidence,agencyId:2,phone:message.to,clientId:101,recipientUserId:55});
});
it('hides an otherwise consented reminder number when STOP is active',async()=>{
 const impl=pool.execute.getMockImplementation();pool.execute.mockImplementation((sql,...args)=>sql.includes('SELECT n.phone_number')?Promise.resolve([[{phone_number:message.from}]]):sql.includes("purpose = 'suppression' AND status = 'opted_out'")?Promise.resolve([[{stopped:1}]]):impl(sql,...args));
 expect(await recordedReminderConsent(2,message.to,{clientId:101,recipientUserId:55,requireActive:true})).toBeNull();
 expect(reviewedVerbalReminderGrant).not.toHaveBeenCalled();
});
