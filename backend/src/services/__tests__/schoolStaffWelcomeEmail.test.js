import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(async()=>({id:5,first_name:'Brenda',email:'staff@example.test'})),generatePasswordlessToken:vi.fn(async()=>({token:'test-token',expiresAt:new Date()}))}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async id=>({id,name:id===2?'ITSCO':'Montbello HS',slug:id===2?'itsco':'montbello-hs'}))}}));
vi.mock('../emailTemplate.service.js',()=>({default:{collectParameters:vi.fn(async()=>({RESET_TOKEN_LINK:'https://app.example/montbello-hs/passwordless-login/test-token',PORTAL_LOGIN_LINK:'https://app.example/montbello-hs/login'}))}}));
vi.mock('../communicationLogging.service.js',()=>({default:{logGeneratedCommunication:vi.fn(async()=>({id:99})),markAsSent:vi.fn(async()=>{})}}));
vi.mock('../activityLog.service.js',()=>({default:{logActivity:vi.fn()}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:vi.fn()}}));
vi.mock('../../models/UserActivityLog.model.js',()=>({default:{logActivity:vi.fn(async()=>({id:1}))}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn(async()=>({id:'sent'}))}));
import Identity from '../../models/EmailSenderIdentity.model.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {schoolStaffWelcomeContent,sendSchoolStaffWelcomeEmail} from '../schoolStaffWelcomeEmail.service.js';
import UserActivityLog from '../../models/UserActivityLog.model.js';
beforeEach(()=>{vi.clearAllMocks();Identity.list.mockResolvedValue([{id:6,identity_key:'notifications',from_email:'Notifications@itsco.health',reply_to:'wrong@example.test'},{id:11,identity_key:'support',from_email:'Support@itsco.health'}]);});
it.each([[false,false,'Standard School Staff'],[true,false,'School Admin'],[false,true,'Scheduler'],[true,true,'School Admin + Scheduler']])('names the school and actual account level (%s,%s)',(isSchoolAdmin,isScheduler,label)=>{
 const mail=schoolStaffWelcomeContent({firstName:'A <B>',schoolName:'School & Co',isSchoolAdmin,isScheduler,accessUrl:'https://app.example/school'});
 expect(mail.text).toContain(`Account level: ${label}`);expect(mail.subject).toContain('School & Co');expect(mail.html).toContain('A &lt;B&gt;');expect(mail.html).not.toContain('A <B>');
 expect(mail.text.includes('Assign School Admin')).toBe(isSchoolAdmin);
});
it('sends from schools@, replies to schools@, names who added the person, and records the send',async()=>{
 Identity.list.mockResolvedValue([{id:6,identity_key:'notifications',from_email:'Notifications@itsco.health',reply_to:'wrong@example.test'},{id:11,identity_key:'support',from_email:'Support@itsco.health'},{id:12,identity_key:'schools',from_email:'schools@itsco.health',reply_to:'schools@itsco.health'}]);
 const mail=schoolStaffWelcomeContent({firstName:'Brenda',schoolName:'Montbello HS',addedByName:'Halle Bristow',accessUrl:'https://schoolcarebridge.org/app/montbello-hs/reset-password/token',portalUrl:'https://schoolcarebridge.org/app/montbello-hs'});
 expect(mail.text).toContain('Halle Bristow added you');
 expect(mail.text).toContain('https://schoolcarebridge.org/app/montbello-hs');
 expect(mail.text).toContain('Set your password');
 expect(mail.text).toContain('no temporary password');
 expect(mail.text).not.toMatch(/temporary password\s*:/i);
 await sendSchoolStaffWelcomeEmail({agencyId:2,schoolOrganizationId:357,userId:5,actorUserId:1,to:'staff@example.test',firstName:'Brenda',schoolName:'Montbello HS',addedByName:'Halle Bristow',accessUrl:'https://schoolcarebridge.org/app/montbello-hs/reset-password/token',portalUrl:'https://schoolcarebridge.org/app/montbello-hs'});
 expect(Identity.list).toHaveBeenCalledWith({agencyId:2,includePlatformDefaults:false,onlyActive:true});
 expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:12,replyToOverride:'schools@itsco.health',fromDisplayNameOverride:'Schools Team',schoolOrganizationId:357,userId:5,generatedByUserId:1,source:'auto',templateType:'school_staff_welcome',text:expect.stringContaining('Halle Bristow added you')}));
 expect(UserActivityLog.logActivity).toHaveBeenCalledWith(expect.objectContaining({actionType:'school_staff_invitation_email_sent',userId:5,metadata:expect.objectContaining({email:'staff@example.test',fromEmail:'schools@itsco.health',replyTo:'schools@itsco.health',deliveryStatus:'sent',addedByName:'Halle Bristow',messageId:'sent'})}));
});
it('fails visibly instead of choosing an unrelated sender or reply mailbox',async()=>{
 Identity.list.mockResolvedValue([{id:1,identity_key:'default',from_email:'other@example.test'},{id:6,identity_key:'notifications',from_email:'Notifications@itsco.health'}]);
 await expect(sendSchoolStaffWelcomeEmail({agencyId:2,accessUrl:'https://schoolcarebridge.org/app/demo',schoolName:'Cedar Grove'})).rejects.toThrow('schools@');expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
it('uses the configured Schools sender without requiring a separate Support identity',async()=>{
 Identity.list.mockResolvedValue([{id:1128,identity_key:'schools',from_email:'schools@itsco.health',reply_to:'schools@itsco.health'}]);
 await sendSchoolStaffWelcomeEmail({agencyId:450,to:'testing@itsco.health',schoolName:'Cedar Grove',accessUrl:'https://schoolcarebridge.org/app/demo'});
 expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:1128,replyToOverride:'schools@itsco.health',fromDisplayNameOverride:'Schools Team'}));
});
it('rejects unsafe links and does not offer setup when access already exists',()=>{
 expect(()=>schoolStaffWelcomeContent({accessUrl:'javascript:alert(1)'})).toThrow();
 const mail=schoolStaffWelcomeContent({firstName:'Sierra',schoolName:'Montbello HS',isSchoolAdmin:true,promoted:true,setup:false,accessUrl:'https://app.example/school'});
 expect(mail.text).toContain('existing account');expect(mail.text).not.toContain('expires');
});

it('uses the same concise welcome for onboarding staff, with the schools mailbox and who added them',async()=>{
 Identity.list.mockResolvedValue([{id:12,identity_key:'schools',from_email:'schools@itsco.health',reply_to:'schools@itsco.health'}]);
 const {sendSchoolOnboardingStaffPortalAccessEmail}=await import('../schoolStaffAccountAccessEmail.service.js');
 const result=await sendSchoolOnboardingStaffPortalAccessEmail({agencyId:2,schoolOrganizationId:357,schoolName:'Montbello HS',userId:5,invitedByName:'Halle Bristow',accessRoleLabel:'School Admin + Scheduler',actorUserId:1});
 expect(result.sent).toBe(true);
 expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:12,replyToOverride:'schools@itsco.health',fromDisplayNameOverride:'Schools Team',text:expect.stringContaining('Halle Bristow added you'),html:expect.stringContaining('schoolcarebridge.org/app/montbello-hs')}));
});
