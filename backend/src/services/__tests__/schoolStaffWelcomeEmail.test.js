import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(async()=>({id:5,first_name:'Brenda',email:'staff@example.test'})),generatePasswordlessToken:vi.fn(async()=>({token:'test-token',expiresAt:new Date()}))}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async id=>({id,name:id===2?'ITSCO':'Montbello HS',slug:id===2?'itsco':'montbello-hs'}))}}));
vi.mock('../emailTemplate.service.js',()=>({default:{collectParameters:vi.fn(async()=>({RESET_TOKEN_LINK:'https://app.example/montbello-hs/passwordless-login/test-token',PORTAL_LOGIN_LINK:'https://app.example/montbello-hs/login'}))}}));
vi.mock('../communicationLogging.service.js',()=>({default:{logGeneratedCommunication:vi.fn(async()=>({id:99})),markAsSent:vi.fn(async()=>{})}}));
vi.mock('../activityLog.service.js',()=>({default:{logActivity:vi.fn()}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:vi.fn()}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn(async()=>({id:'sent'}))}));
import Identity from '../../models/EmailSenderIdentity.model.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {schoolStaffWelcomeContent,sendSchoolStaffWelcomeEmail} from '../schoolStaffWelcomeEmail.service.js';
beforeEach(()=>{vi.clearAllMocks();Identity.list.mockResolvedValue([{id:6,identity_key:'notifications',from_email:'Notifications@itsco.health',reply_to:'wrong@example.test'},{id:11,identity_key:'support',from_email:'Support@itsco.health'}]);});
it.each([[false,false,'Standard School Staff'],[true,false,'School Admin'],[false,true,'Scheduler'],[true,true,'School Admin + Scheduler']])('names the school and actual account level (%s,%s)',(isSchoolAdmin,isScheduler,label)=>{
 const mail=schoolStaffWelcomeContent({firstName:'A <B>',schoolName:'School & Co',isSchoolAdmin,isScheduler,accessUrl:'https://app.example/school'});
 expect(mail.text).toContain(`Account level: ${label}`);expect(mail.subject).toContain('School & Co');expect(mail.html).toContain('A &lt;B&gt;');expect(mail.html).not.toContain('A <B>');
 expect(mail.text.includes('Assign School Admin')).toBe(isSchoolAdmin);
});
it('uses Notifications, overrides Reply-To with Support, and associates the school/user audit',async()=>{
 await sendSchoolStaffWelcomeEmail({agencyId:2,schoolOrganizationId:357,userId:5,actorUserId:1,to:'staff@example.test',firstName:'Brenda',schoolName:'Montbello HS',accessUrl:'https://app.example/setup'});
 expect(Identity.list).toHaveBeenCalledWith({agencyId:2,includePlatformDefaults:false,onlyActive:true});
 expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:6,replyToOverride:'Support@itsco.health',schoolOrganizationId:357,userId:5,generatedByUserId:1,source:'auto',html:expect.any(String)}));
});
it('fails visibly instead of choosing an unrelated sender or reply mailbox',async()=>{
 Identity.list.mockResolvedValue([{id:1,identity_key:'default',from_email:'other@example.test'}]);
 await expect(sendSchoolStaffWelcomeEmail({agencyId:2})).rejects.toThrow('Configure Notifications');expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
it('rejects unsafe links and does not offer setup when access already exists',()=>{
 expect(()=>schoolStaffWelcomeContent({accessUrl:'javascript:alert(1)'})).toThrow();
 const mail=schoolStaffWelcomeContent({firstName:'Sierra',schoolName:'Montbello HS',isSchoolAdmin:true,promoted:true,setup:false,accessUrl:'https://app.example/school'});
 expect(mail.text).toContain('existing account');expect(mail.text).not.toContain('expires');
});

it('uses the same concise welcome for onboarding staff, with the correct setup lifetime and reply mailbox',async()=>{
 const {sendSchoolOnboardingStaffPortalAccessEmail}=await import('../schoolStaffAccountAccessEmail.service.js');
 const result=await sendSchoolOnboardingStaffPortalAccessEmail({agencyId:2,schoolOrganizationId:357,schoolName:'Montbello HS',userId:5,accessRoleLabel:'School Admin + Scheduler',actorUserId:1});
 expect(result.sent).toBe(true);
 expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:6,replyToOverride:'Support@itsco.health',text:expect.stringContaining('Account level: School Admin + Scheduler'),html:expect.stringContaining('Montbello HS')}));
});
