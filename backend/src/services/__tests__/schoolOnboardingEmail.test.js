import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({list:vi.fn(),send:vi.fn(),execute:vi.fn()}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:m.list}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
import {sendSchoolOnboardingMessage} from '../schoolOnboardingEmail.service.js';
import {loadOnboardingEmailHistory,matchOnboardingReply} from '../schoolOnboardingEmailHistory.service.js';
import {schoolOrganizationLifecycle} from '../../utils/schoolOrganizationLifecycle.js';
const args={invite:{id:18,agency_id:2,school_organization_id:445,primary_user_id:1346,contact_email:'contact@school.test'},agency:{name:'ITSCO',slug:'itsco'},subject:'Friendly reminder',text:'Please finish your onboarding.\n\nhttps://schoolcarebridge.org/school-onboarding/saved',link:'https://schoolcarebridge.org/school-onboarding/saved',kind:'reminder'};
beforeEach(()=>{vi.clearAllMocks();m.list.mockResolvedValue([{id:12,identity_key:'schools',from_email:'schools@itsco.health'}]);m.send.mockResolvedValue({id:'sent',communicationId:10});});
it('uses Schools, replies to Schools, copies Rachel, and includes both brands and a direct continuation button',async()=>{
 await sendSchoolOnboardingMessage(args);
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:12,replyToOverride:'schools@itsco.health',cc:'rachel@itsco.health',linkUrl:args.link,html:expect.stringContaining('Continue your school onboarding')}));
 const message=m.send.mock.calls[0][0];
 for(const word of ['ITSCO','SchoolCareBridge','https://mh4kidz.org/about','itsco-logo.png',args.link])expect(message.html).toContain(word);
 expect(message.text).toContain('Learn about MH4Kidz: https://mh4kidz.org/about');
});
it('does not substitute PO or a platform mailbox and never CCs Rachel for another tenant',async()=>{
 m.list.mockResolvedValue([{id:99,identity_key:'po',from_email:'po@itsco.health'}]);
 expect(await sendSchoolOnboardingMessage(args)).toEqual({blocked:true,reason:'schools_sender_not_configured'});expect(m.send).not.toHaveBeenCalled();
 m.list.mockResolvedValue([{id:13,identity_key:'schools',from_email:'schools@another.test'}]);
 await sendSchoolOnboardingMessage({...args,invite:{...args.invite,agency_id:90},agency:{name:'Another',slug:'another'}});
 expect(m.send.mock.calls[0][0].cc).toBeNull();
});
it('loads actual message content and matches only exact reply headers in the tenant Schools inbox',async()=>{
 const delivery={id:1,invite_id:18,agency_id:2,delivery_status:'sent',subject:'Reminder',body:'<p>Please continue</p>',metadata:{internetMessageId:'<abc@itsco.health>',fromEmail:'schools@itsco.health',replyTo:'schools@itsco.health',cc:'rachel@itsco.health'}};
 m.execute.mockResolvedValueOnce([[delivery]]).mockResolvedValueOnce([[{id:8,in_reply_to:'<abc@itsco.health>',subject:'Re: Reminder',body_text:'Working on it',from_json:'{"email":"contact@school.test"}',sent_at:'2026-11-09'}]]).mockResolvedValueOnce([[]]);
 const [result]=await loadOnboardingEmailHistory([{id:18}]);
 expect(result).toMatchObject({body_text:'Please continue',cc:'rachel@itsco.health',replies:[{id:'inbox:8',bodyText:'Working on it'}]});
 expect(m.execute.mock.calls[1][1]).toEqual([2,'schools@itsco.health','<abc@itsco.health>','<abc@itsco.health>']);
 expect(matchOnboardingReply(delivery,{references_header:'<abc@itsco.health.evil>'})).toBe(false);
 expect(matchOnboardingReply(delivery,{references_header:'<first@test> <abc@itsco.health>'})).toBe(true);
});
it('distinguishes onboarding drafts from active, inactive, and archived schools',()=>{
 const school={organization_type:'school',is_active:0,feature_flags:{schoolOnboardingDraft:true}};
 expect(schoolOrganizationLifecycle(school)).toBe('onboarding');
 expect(schoolOrganizationLifecycle({...school,feature_flags:{}})).toBe('inactive');
 expect(schoolOrganizationLifecycle({...school,feature_flags:{},is_active:1})).toBe('active');
 expect(schoolOrganizationLifecycle({...school,is_archived:1})).toBe('archived');
});

it('shows replies received by the canonical Schools support-ticket transport',async()=>{
 m.execute.mockResolvedValueOnce([[{id:1,invite_id:18,agency_id:2,delivery_status:'sent',metadata:{internetMessageId:'<sent@itsco.health>',replyTo:'schools@itsco.health'}}]])
 .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{email_id:20,in_reply_to:'<sent@itsco.health>',body:'We will finish tomorrow.',from_email:'contact@school.test',sent_at:'2026-11-09'}]]);
 const [result]=await loadOnboardingEmailHistory([{id:18}]);
 expect(result.replies).toEqual([expect.objectContaining({id:'ticket:20',bodyText:'We will finish tomorrow.',from:'contact@school.test'})]);
});
