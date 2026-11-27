import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../sessionPreferenceSchedule.service.js',()=>({refreshClientSessionNotifications:vi.fn()}));
import pool from '../../config/database.js';
import {prepareSmsDelivery} from '../smsCompliance.service.js';
import {hiringDisclosure,hiringDisclosureHash,PLOTLINE_HIRING_CONSENT_VERSION} from '../plotlineHiringSms.service.js';
const phone='+12025550101';
const registration={provider:'vonage',brandId:'B1',campaignId:'C1',resellerId:'R1',brandName:'Plotline People Operations',legalName:'Example LLC',supportContact:'support@example.test',website:'https://example.test',privacyUrl:'https://example.test/privacy',termsUrl:'https://example.test/terms',evidenceUrl:'https://example.test/evidence',keywordOwner:'application',approved:true,numberLinked:true,purposes:['workforce'],platformHiringSender:true,hiringJourneyApproved:true,applicationOptInApproved:true,hiringConsentVersion:PLOTLINE_HIRING_CONSENT_VERSION,hiringJourneyApprovalDigest:'a'.repeat(64),interviewOnly:false};
const sender={id:23,agency_id:null,number_purpose:'platform_contact',phone_number:'+12025550100',is_active:true,status:'active',campaign_id:'C1',registration_json:registration};
let stopped,grant,appointment;
const notice=(overrides={})=>({from:sender.phone_number,to:phone,body:'Your onboarding is ready.',purpose:'workforce',agencyId:null,hiringAgencyId:2,hiringUserId:8,staffNotificationKind:'hiring',...overrides});
beforeEach(async()=>{
 vi.resetAllMocks();stopped=false;appointment=true;
 vi.stubEnv('PLOTLINE_HIRING_SMS_CAMPAIGNS_JSON',JSON.stringify({platform:{from:sender.phone_number,brandId:'B1',campaignId:'C1',scope:'all_agencies'}}));
 pool.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('FROM twilio_numbers n LEFT JOIN agencies'))return [[sender]];
  if(sql.includes("purpose = 'suppression'"))return [stopped?[{exists:1}]:[]];
  if(sql.includes('FROM agencies WHERE id='))return [[{id:args[0],name:args[0]===2?'ITSCO':'Other Organization'}]];
  if(sql.includes('FROM hire_communication_preferences p JOIN sms_consent_requests'))return [args[0]===8&&args[1]===2&&grant?[grant]:[]];
  if(sql.includes('FROM hiring_interviews h'))return [appointment&&args[0]===19&&args[1]===2?[{candidate_user_id:8}]:[]];
  return [[]];
 });
 const disclosure=await hiringDisclosure({...sender,registration},2);
 grant={phone,request_id:77,disclosure_json:disclosure,disclosure_hash:hiringDisclosureHash(disclosure),activation_json:{workforce:{activated:true,choice:'yes',confirmed:true}}};
});
afterEach(()=>vi.unstubAllEnvs());
it('uses the same confirmed application choice for hiring notices and interview reminders, with both brands',async()=>{
 for(const message of [notice(),notice({staffNotificationKind:'plotlineInterview',interviewId:19,interviewAgencyId:2})]){
  const delivery=await prepareSmsDelivery(message);
  expect(delivery).toMatchObject({agencyId:2,from:sender.phone_number,to:phone});
  expect(delivery.body).toMatch(/^Plotline People Operations · ITSCO:/);
 }
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes('hiring_interview_sms_consents'))).toBe(false);
});
it('checks the scheduled appointment again and does not authorize a canceled or changed interview',async()=>{
 appointment=false;
 await expect(prepareSmsDelivery(notice({interviewId:19,interviewSmsStartAt:'2026-12-01 15:00:00'}))).rejects.toHaveProperty('code','sms_interview_reminders_disabled');
});
it('does not share opt-in across agencies, phone numbers, recipients, or unrelated workforce purposes',async()=>{
 for(const patch of [{hiringAgencyId:6},{hiringUserId:9},{to:'+12025550109'}])await expect(prepareSmsDelivery(notice(patch))).rejects.toHaveProperty('code','sms_hiring_consent_required');
 await expect(prepareSmsDelivery(notice({staffNotificationKind:'notifications'}))).rejects.toHaveProperty('code','sms_hiring_sender_restricted');
});
it('honors STOP, email-only or missing consent, pending review, and unconfirmed enrollment',async()=>{
 stopped=true;await expect(prepareSmsDelivery(notice())).rejects.toHaveProperty('code','sms_opted_out');stopped=false;
 for(const workforce of [{activated:false,choice:'yes'},{activated:true,choice:'no'},{activated:true,choice:'yes',confirmed:false}]){
  grant.activation_json={workforce};await expect(prepareSmsDelivery(notice())).rejects.toHaveProperty('code','sms_hiring_consent_required');
 }
 grant=null;await expect(prepareSmsDelivery(notice())).rejects.toHaveProperty('code','sms_hiring_consent_required');
});
