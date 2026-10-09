import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(),getAgencies:vi.fn()}}));
vi.mock('../smsCampaignPacket.service.js',()=>({getAgencyCampaignPacket:vi.fn()}));
vi.mock('../smsCompliance.service.js',()=>({recordSmsPermission:vi.fn(),getSmsSender:vi.fn(async()=>({scope:'campaign:C123'})),isSmsSuppressed:vi.fn()}));
vi.mock('../smsEnrollment.service.js',()=>({enrollSmsRecipient:vi.fn()}));
vi.mock('../chatEncryption.service.js',()=>({isChatEncryptionConfigured:vi.fn(()=>true),encryptChatText:vi.fn(s=>({cipher:s})),decryptChatText:vi.fn(e=>e.cipher)}));
vi.mock('../securityEvidence.service.js',()=>({appendSecurityEvidence:vi.fn(async()=> 'evidence-1')}));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import {getAgencyCampaignPacket} from '../smsCampaignPacket.service.js';
import {enrollSmsRecipient} from '../smsEnrollment.service.js';
import {recordSmsPermission,isSmsSuppressed} from '../smsCompliance.service.js';
import {appendSecurityEvidence} from '../securityEvidence.service.js';
import {getStaffCommunicationChoices,saveStaffCommunicationChoices} from '../staffCommunicationChoices.service.js';
import {validateStaffCommunicationInput,staffDeliveryKinds,staffNotificationBody} from '../../utils/staffCommunicationChoices.js';
let stored,programs,conn,reviewed;
const profile={brandName:'ITSCO',legalName:'ITSCO, LLC',supportContact:'support@itsco.health'};
const registration={...profile,brandId:'B123',campaignId:'C123',resellerId:'R123',website:'https://www.itsco.health',privacyUrl:'https://www.itsco.health/privacy',termsUrl:'https://www.itsco.health/terms',evidenceUrl:'https://www.itsco.health/proof',purposes:['workforce','polling'],keywordOwner:'application',approved:true,numberLinked:true};
beforeEach(()=>{
 vi.clearAllMocks();stored={};programs=[];reviewed=false;isSmsSuppressed.mockResolvedValue(false);
 User.findById.mockResolvedValue({id:7,role:'provider',personal_phone:'+13035550101'});User.getAgencies.mockResolvedValue([{id:2}]);
 getAgencyCampaignPacket.mockResolvedValue({profile,hasPublished:true,links:{termsUrl:'https://app.itsco.health/sms-programs/2/polling/terms',privacyUrl:'https://app.itsco.health/sms-programs/2/polling/privacy'}});
 pool.execute.mockImplementation(async sql=>sql.includes('FROM sms_recipient_permissions')?[reviewed?[{found:1}]:[]]:sql.includes('FROM twilio_numbers')?[programs]:[[{notification_categories:stored}]]);
 conn={execute:vi.fn(async(sql,args)=>{if(sql.includes('GET_LOCK'))return [[{acquired:1}]];if(sql.includes('INSERT INTO user_preferences'))stored[args[1]]=JSON.parse(args[2]);return [{affectedRows:1}];}),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(conn);
 enrollSmsRecipient.mockResolvedValue({status:'opted_in'});
});
async function input(choices={notifications:false,messageAlerts:false,polling:false}){const form=await getStaffCommunicationChoices({userId:7,agencyId:2});return {disclosureHash:form.disclosureHash,arrivalEmail:false,exchangeEmail:false,choices:{appointmentReplies:false,kioskArrivals:false,exchangeMatches:false,...choices},accessRequests:{inAppTexting:false,personalSmsRelay:false},phone:form.phone,signerName:'Example Provider',acknowledged:true};}
describe('staff communication choices',()=>{
 it('records access and future-forwarding requests without enabling texting or relay',async()=>{const form=await input();form.accessRequests={inAppTexting:true,personalSmsRelay:true};const send=vi.fn();const saved=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:form,sendConfirmation:send});expect(saved.accessRequests).toEqual(form.accessRequests);expect(saved.capabilities.clientRelay).toBe(false);expect(saved.activation).toEqual([]);expect(enrollSmsRecipient).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();expect(conn.execute.mock.calls.some(([sql])=>sql.includes('sms_forwarding_enabled=FALSE'))).toBe(true);expect(JSON.parse(stored.staff_communications_2.envelope.cipher).accessRequests).toEqual(form.accessRequests);});
 it('requires both access-request choices without accepting permission grants',async()=>{const form=await input();delete form.accessRequests;await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:form})).rejects.toThrow('in-app texting');form.accessRequests={inAppTexting:true,personalSmsRelay:true,grantAccess:true};await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:form})).rejects.toThrow('in-app texting');expect(appendSecurityEvidence).not.toHaveBeenCalled();});
 it('starts all choices off without treating employment as consent',async()=>{const f=await getStaffCommunicationChoices({userId:7,agencyId:2});expect(f.choices).toEqual({notifications:false,messageAlerts:false,polling:false,appointmentReplies:false,kioskArrivals:false,exchangeMatches:false});expect(f.needsReview).toBe(true);expect(f.capabilities.clientRelay).toBe(false);});
 it('accepts all No and stores encrypted, append-only signature evidence without sending',async()=>{const form=await input();const send=vi.fn();const result=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:form,sendConfirmation:send});expect(result.reviewedAt).toBeTruthy();expect(result.needsReview).toBe(false);expect(appendSecurityEvidence).toHaveBeenCalledWith(expect.objectContaining({details:expect.objectContaining({envelope:expect.any(Object)})}),conn,{mirror:false});expect(enrollSmsRecipient).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();});
 it('saves opt-in as pending when no approved campaign is linked',async()=>{const result=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:await input({notifications:true,messageAlerts:false,polling:true}),sendConfirmation:vi.fn()});expect(result.activation).toEqual([{purpose:'workforce',status:'pending_campaign'},{purpose:'polling',status:'pending_campaign'}]);expect(enrollSmsRecipient).not.toHaveBeenCalled();});
 it('requires administrator-reviewed enrollment before activating preferences and independently revokes voting',async()=>{programs=[{id:4,phone_number:'+13035550100',campaign_id:'C123',registration_json:registration}];const result=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:await input({notifications:false,messageAlerts:true,polling:false}),sendConfirmation:vi.fn()});expect(enrollSmsRecipient).not.toHaveBeenCalled();expect(result.activation[0]).toMatchObject({purpose:'workforce',status:'pending_review'});expect(recordSmsPermission).toHaveBeenCalledWith(expect.objectContaining({purpose:'polling',status:'opted_out'}));});
 it('does not bypass STOP even with previously reviewed enrollment',async()=>{programs=[{id:4,phone_number:'+13035550100',campaign_id:'C123',registration_json:registration}];reviewed=true;isSmsSuppressed.mockResolvedValue(true);const result=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:await input({notifications:true,messageAlerts:false,polling:false}),sendConfirmation:vi.fn()});expect(result.activation[0]).toMatchObject({status:'pending_review'});expect(enrollSmsRecipient).not.toHaveBeenCalled();});
 it('recognizes a later administrator review without re-enrolling or replacing its evidence',async()=>{programs=[{id:4,phone_number:'+13035550100',campaign_id:'C123',registration_json:registration}];await saveStaffCommunicationChoices({userId:7,agencyId:2,input:await input({notifications:true,messageAlerts:false,polling:false}),sendConfirmation:vi.fn()});reviewed=true;const result=await getStaffCommunicationChoices({userId:7,agencyId:2});expect(result.activation[0]).toMatchObject({status:'active'});expect(enrollSmsRecipient).not.toHaveBeenCalled();expect(recordSmsPermission.mock.calls.every(([p])=>p.status==='opted_out')).toBe(true);});
 it('rejects another organization and an unsigned or changed disclosure',async()=>{await expect(getStaffCommunicationChoices({userId:7,agencyId:99})).rejects.toMatchObject({status:403});const form=await input();await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:{...form,acknowledged:false}})).rejects.toMatchObject({status:400});await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:{...form,disclosureHash:'changed'}})).rejects.toMatchObject({status:400});expect(appendSecurityEvidence).not.toHaveBeenCalled();});
 it('does not send to a number not in the staff profile',async()=>{const form=await input({notifications:true,messageAlerts:false,polling:false});await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:{...form,phone:'+13035550999'}})).rejects.toThrow('profile');});
 it('fails before enrollment when signed evidence storage fails',async()=>{appendSecurityEvidence.mockRejectedValueOnce(new Error('unavailable'));await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:await input()})).rejects.toThrow('unavailable');expect(enrollSmsRecipient).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalled();});
 it('requires explicit boolean choices and never puts client content in an alert',()=>{expect(validateStaffCommunicationInput({choices:{notifications:'yes'},disclosureHash:'h',signerName:'Example',acknowledged:true},'h').length).toBeGreaterThan(0);expect(staffDeliveryKinds({messageAlerts:true})).toEqual(['messageAlerts']);expect(staffNotificationBody('inbound_client_message','https://app.itsco.health')).toBe('You have a message waiting in the app. Sign in to review: https://app.itsco.health');});
});

it('accepts declining without a phone and never changes another phone permission',async()=>{
 const form=await input();form.phone='+13035550999';
 const result=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:form});
 expect(result.needsReview).toBe(false);
 expect(JSON.parse(stored.staff_communications_2.envelope.cipher).phone).toBe('+13035550101');
 User.findById.mockResolvedValue({id:7,role:'provider'});
 const next=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:await input()});
 expect(next.needsReview).toBe(false);
});
it('does not offer workforce consent to client or athlete accounts',async()=>{
 for(const role of ['client','client_guardian','school_staff','athlete']){
  User.findById.mockResolvedValue({id:7,role});
  await expect(getStaffCommunicationChoices({userId:7,agencyId:2})).rejects.toMatchObject({status:403});
 }
});

it('requires published policies before opting in but permits declining',async()=>{
 getAgencyCampaignPacket.mockResolvedValue({profile,hasPublished:false,links:{}});
 const form=await input({notifications:true,messageAlerts:false,polling:false});
 await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:form})).rejects.toThrow('publish');
 const declined=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:await input()});
 expect(declined.needsReview).toBe(false);expect(declined.disclosure.termsUrl).toBeNull();
});

it('records separate Exchange email and SMS choices without activating a sender',async()=>{
 const form=await input();form.exchangeEmail=true;form.choices.exchangeMatches=true;
 const result=await saveStaffCommunicationChoices({userId:7,agencyId:2,input:form});
 expect(result.exchangeEmail).toBe(true);expect(result.choices.exchangeMatches).toBe(true);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining("VALUES (?,'client_exchange_match',1,?,?)"),[7,1,1]);
 expect(enrollSmsRecipient).not.toHaveBeenCalled();
 const missing={...form};delete missing.exchangeEmail;
 await expect(saveStaffCommunicationChoices({userId:7,agencyId:2,input:missing})).rejects.toThrow('Client Exchange emails');
});
