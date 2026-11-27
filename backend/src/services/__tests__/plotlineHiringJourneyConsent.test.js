import { beforeEach,afterEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),sender:vi.fn(),legacy:vi.fn(),stopped:vi.fn(),decrypt:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../smsCompliance.service.js',()=>({getSmsSender:m.sender,resolveRegisteredSmsSender:m.legacy,isSmsSuppressed:m.stopped}));
vi.mock('../chatEncryption.service.js',()=>({isChatEncryptionConfigured:()=>true,encryptChatText:()=>({synthetic:true}),decryptChatText:m.decrypt}));
vi.mock('../staffSmsEnrollmentBridge.service.js',()=>({currentStaffEnrollmentEvidence:vi.fn()}));
vi.mock('../smsEnrollment.service.js',()=>({enrollSmsRecipientBatch:vi.fn()}));
import { PLOTLINE_HIRING_CONSENT_VERSION as version,isPlotlineHiringSender,resolvePlotlineHiringSender,hiringDisclosure,hiringDisclosureHash,currentPlotlineHiringConsent } from '../plotlineHiringSms.service.js';
import { hiringCommunicationContext,validateHiringChoice } from '../hiringCommunication.service.js';
import { createSmsConsentRequest,reviewSmsConsentRequest } from '../smsConsentRequest.service.js';

const phone='+12025550101';
const sender={id:23,agency_id:null,number_purpose:'platform_contact',phone_number:'+12025550100',campaign_id:'C1',registration:{
  provider:'vonage',brandId:'B1',campaignId:'C1',resellerId:'R1',brandName:'Plotline People Operations',legalName:'Plot Twist Co',
  website:'https://example.test',termsUrl:'https://example.test/terms',privacyUrl:'https://example.test/privacy',evidenceUrl:'https://example.test/consent',
  supportContact:'support@example.test',keywordOwner:'application',purposes:['workforce'],approved:true,numberLinked:true,
  platformHiringSender:true,hiringJourneyApproved:true,applicationOptInApproved:true,hiringConsentVersion:version,hiringJourneyApprovalDigest:'a'.repeat(64),interviewOnly:false
}};
let row,request,disclosure;
beforeEach(async()=>{
  vi.resetAllMocks();
  vi.stubEnv('PLOTLINE_HIRING_SMS_CAMPAIGNS_JSON',JSON.stringify({platform:{from:sender.phone_number,brandId:'B1',campaignId:'C1',scope:'all_agencies'}}));
  m.sender.mockResolvedValue(sender);m.stopped.mockResolvedValue(false);m.legacy.mockResolvedValue(null);
  row={phone,request_id:77,review_token:'claim',activation_json:{workforce:{activated:true,choice:'yes',confirmed:true}}};
  request={id:77,agency_id:2,number_id:23,phone,signer_role:'staff',signed_at:'2026-11-26 12:00:00',signed_payload_json:{synthetic:true},disclosure_json:null,activation_json:{}};
  m.execute.mockImplementation(async(sql,args)=>{
    if(sql.includes('FROM agencies WHERE id='))return [[{id:Number(args[0]),name:Number(args[0])===2?'ITSCO':'Next Level Up',slug:'example'}]];
    if(sql.includes('SELECT phone_number FROM twilio_numbers'))return [[]];
    if(sql.includes('SELECT * FROM sms_consent_requests'))return [[request]];
    if(sql.includes('SELECT id FROM sms_consent_requests'))return [[]];
    if(sql.startsWith('SELECT activation_json'))return [[{activation_json:request.activation_json}]];
    if(sql.startsWith('UPDATE sms_consent_requests SET review_token = ?')){row.review_token=args[0];return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE sms_consent_requests SET activation_json')){row.activation_json=JSON.parse(args[0]);request.activation_json=row.activation_json;return [{affectedRows:1}];}
    if(sql.includes('FROM hire_communication_preferences p JOIN sms_consent_requests'))return [args[0]===8&&args[1]===2?[row]:[]];
    if(sql.startsWith('SELECT user_id FROM hire_communication_preferences'))return [[{user_id:8}]];
    if(sql.startsWith('SELECT status FROM users'))return [[{status:'PROSPECTIVE'}]];
    if(sql.startsWith('INSERT INTO sms_consent_requests'))return [{insertId:77}];
    return [[]];
  });
  disclosure=await hiringDisclosure(sender,2);
  row.disclosure_json=disclosure;row.disclosure_hash=hiringDisclosureHash(disclosure);
  request.disclosure_json=disclosure;request.disclosure_hash=row.disclosure_hash;
  m.decrypt.mockReturnValue(JSON.stringify({choices:{workforce:'yes'},disclosure,signerName:'Synthetic Applicant'}));
});
afterEach(()=>vi.unstubAllEnvs());
const current=(changes={})=>currentPlotlineHiringConsent({agencyId:2,userId:8,sender,phone,...changes});

it('requires explicit approval of the full online application journey, never just interview approval',async()=>{
  expect(isPlotlineHiringSender(sender)).toBe(true);
  for(const patch of [{interviewOnly:true},{applicationOptInApproved:false},{hiringJourneyApproved:false},{hiringConsentVersion:'old'}]){
    m.sender.mockResolvedValue({...sender,registration:{...sender.registration,...patch}});
    expect(await resolvePlotlineHiringSender(2)).toBeNull();
  }
  expect(m.legacy).not.toHaveBeenCalled();
});
it('shows Plotline and the actual organization, with all requested notification types in application consent',async()=>{
  const context=await hiringCommunicationContext(2);
  expect(context.available).toBe(true);
  expect(context.disclosure).toMatchObject({program:'plotline_hiring',hiringAgencyId:2,hiringAgencyName:'ITSCO'});
  expect(context.disclosure.text).toMatch(/Plotline People Operations.*ITSCO/);
  for(const scope of ['interview','reference','pre-hire','onboarding','documents or tasks'])expect(context.disclosure.text).toContain(scope);
});
it('binds a reviewed confirmed application grant to its exact agency, user, phone, sender and disclosure',async()=>{
  expect(await current()).toMatchObject({agencyId:2,agencyName:'ITSCO',phone});
  expect(await current({agencyId:6})).toBeNull();
  expect(await current({userId:9})).toBeNull();
  expect(await current({phone:'+12025550109'})).toBeNull();
  row.disclosure_hash='old-disclosure';expect(await current()).toBeNull();
});
it('rejects unconfirmed enrollment and STOP; only the claimed review can send the enrollment confirmation',async()=>{
  row.activation_json.workforce.confirmed=false;
  expect(await current()).toBeNull();
  expect(await current({confirmationRequestId:77})).toMatchObject({requestId:77});
  expect(await current({confirmationRequestId:78})).toBeNull();
  row.review_token=null;expect(await current({confirmationRequestId:77})).toBeNull();
  row.activation_json.workforce.confirmed=true;m.stopped.mockResolvedValue(true);expect(await current()).toBeNull();
});
it('creates shared-number hiring evidence under the applicant agency, without sharing generic staff/family enrollment',async()=>{
  await createSmsConsentRequest({agencyId:2,numberId:23,phone,signerRole:'staff',actorUserId:8,enrollmentCategory:'hiring'});
  const args=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO sms_consent_requests'))[1];
  expect(args.slice(0,4)).toEqual([2,23,phone,'staff']);
  expect(JSON.parse(args[5])).toMatchObject({hiringAgencyId:2,program:'plotline_hiring'});
  await expect(createSmsConsentRequest({agencyId:2,numberId:23,phone,signerRole:'guardian',actorUserId:8,enrollmentCategory:'hiring'})).rejects.toMatchObject({status:404});
  await expect(createSmsConsentRequest({agencyId:2,numberId:23,phone,signerRole:'staff',actorUserId:8})).rejects.toMatchObject({status:404});
});
it('confirms reviewed application enrollment once and keeps unconfirmed or failed delivery inactive',async()=>{
  const send=vi.fn(async options=>{
    expect(options).toMatchObject({agencyId:null,hiringAgencyId:2,hiringConfirmationRequestId:77,hiringUserId:8});
    expect(await current({confirmationRequestId:77})).toMatchObject({phone});
    return {sid:'synthetic-confirmation'};
  });
  await reviewSmsConsentRequest({agencyId:2,requestId:77,actorUserId:12,signerVerified:true,sendConfirmation:send});
  expect(send).toHaveBeenCalledOnce();expect(row.activation_json.workforce.confirmed).toBe(true);
  await reviewSmsConsentRequest({agencyId:2,requestId:77,actorUserId:12,signerVerified:true,sendConfirmation:send});
  expect(send).toHaveBeenCalledOnce();
  request.activation_json={};row.activation_json={};
  send.mockRejectedValueOnce(new Error('synthetic transport failure'));
  await expect(reviewSmsConsentRequest({agencyId:2,requestId:77,actorUserId:12,signerVerified:true,sendConfirmation:send})).rejects.toThrow('synthetic transport failure');
  expect(row.activation_json.workforce.activated).toBe(false);expect(await current()).toBeNull();
});

it('rejects an unsupported international mobile number before signing the shared US program',async()=>{
 const context=await hiringCommunicationContext(2);
 expect(()=>validateHiringChoice({channel:'email_sms',phone:'+442079460001'},context)).toThrow('US mobile number');
});
