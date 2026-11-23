import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../importedGuardianNotifications.service.js',()=>({importedGuardianSmsAllowed:vi.fn()}));
import pool from '../../config/database.js';
import {importedGuardianSmsAllowed} from '../importedGuardianNotifications.service.js';
import {prepareSmsDelivery,recordedReminderConsent} from '../smsCompliance.service.js';
import {validateSmsConsentEvidence} from '../../utils/smsCompliancePolicy.js';
const registration={provider:'notifyre',brandId:'brand',campaignId:'campaign',brandName:'Agency',legalName:'Agency LLC',resellerId:'r',supportContact:'support@example.test',website:'https://example.test',termsUrl:'https://example.test/terms',privacyUrl:'https://example.test/privacy',evidenceUrl:'https://example.test/consent',purposes:['reminders','care'],keywordOwner:'notifyre',approved:true,numberLinked:true};
const evidence={source:'prior_ehr_contact',collectedAt:'2026-01-01T12:00:00Z',grants:[{importId:71,agencyId:2,clientId:12,guardianUserId:40}]};
const message={agencyId:2,clientId:12,recipientUserId:40,to:'+17205550102',from:'+17195550100',purpose:'care',body:'Message from your provider'};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('NOTIFYRE_CLIENT_CAMPAIGNS_JSON',JSON.stringify({'2':{brandId:'brand',campaignId:'campaign'}}));
 pool.execute.mockImplementation(async(sql)=>sql.includes('FROM twilio_numbers')?[[{id:3,agency_id:2,phone_number:message.from,is_active:1,campaign_id:'campaign',registration_json:registration}]]:sql.includes('SELECT n.phone_number')?[[{phone_number:message.from}]]:sql.includes('SELECT evidence_json')?[[{evidence_json:evidence}]]:[[]]);
 importedGuardianSmsAllowed.mockResolvedValue(true);
});
it('rechecks the exact guardian, client and phone at the actual provider SMS boundary',async()=>{
 expect(await prepareSmsDelivery(message)).toMatchObject({purpose:'care'});
 expect(importedGuardianSmsAllowed).toHaveBeenCalledWith({evidence,agencyId:2,clientId:12,recipientUserId:40,phone:message.to,purpose:'care',allowConfirmation:false});
 importedGuardianSmsAllowed.mockResolvedValue(false);await expect(prepareSmsDelivery(message)).rejects.toMatchObject({code:'sms_imported_recipient_changed'});
});
it('makes reminder readers use an active imported grant without a fabricated signature',async()=>{
 expect(await recordedReminderConsent(2,message.to,{clientId:12,recipientUserId:40,requireActive:true})).toEqual(evidence);
 importedGuardianSmsAllowed.mockResolvedValue(false);expect(await recordedReminderConsent(2,message.to,{clientId:12,recipientUserId:40,requireActive:true})).toBeNull();
 expect(validateSmsConsentEvidence({purpose:'reminders',status:'opted_in',evidence:{...evidence,signerVerified:true,signatureReference:'fake',reference:'fake',disclosure:'fake'}})).not.toHaveLength(0);
});
it('does not allow imported consent to bypass STOP',async()=>{
 const execute=pool.execute.getMockImplementation();pool.execute.mockImplementation(async(sql,...args)=>sql.includes("purpose = 'suppression' AND status = 'opted_out'")?[[{stopped:1}]]:execute(sql,...args));
 await expect(prepareSmsDelivery(message)).rejects.toMatchObject({code:'sms_opted_out'});expect(importedGuardianSmsAllowed).not.toHaveBeenCalled();
});
