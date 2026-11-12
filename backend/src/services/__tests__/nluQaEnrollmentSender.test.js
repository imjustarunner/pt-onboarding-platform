import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),domain:vi.fn(),ensure:vi.fn(),identity:vi.fn(),create:vi.fn(),update:vi.fn(),send:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:m.domain}));
vi.mock('../portalGroupSender.service.js',()=>({ensurePortalGroupSender:m.ensure}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:m.identity,create:m.create,update:m.update}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {sendEnrollmentPortalEmail} from '../enrollmentPortalEmail.service.js';
let source, notifications;
beforeEach(()=>{
 vi.clearAllMocks();source={id:10,agency_id:6,from_email:'portal@nextleveluplcc.com',is_active:1};
 notifications = null;
 m.agency.mockResolvedValue({id:453,slug:'nlu-qa-demo',name:'NLU QA',is_active:1,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}});m.domain.mockResolvedValue('nextleveluplcc.com');
 m.identity.mockImplementation(async(id,key)=>id===6?(key==='enrollment_portal'?source:key==='notifications'?notifications:null):null);m.create.mockResolvedValue({id:99});m.send.mockResolvedValue({id:'qa-message',redirected:true});
});
it('reuses the existing NLU sender without provisioning Workspace Groups or mailboxes',async()=>{
 const result=await sendEnrollmentPortalEmail({agencyId:453,enrollmentChannel:'tutoring',to:'qa.parent@example.com',subject:'Enrollment received',text:'Sign in'});
 expect(result).toMatchObject({sent:true,fromEmail:'portal@nextleveluplcc.com',replyTo:'support@nextleveluplcc.com'});
 expect(m.ensure).not.toHaveBeenCalled();expect(m.identity).toHaveBeenCalledWith(6,'enrollment_portal');
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({agencyId:453,fromEmail:'portal@nextleveluplcc.com',inboundAddresses:[]}));
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:99,to:'qa.parent@example.com',replyToOverride:'support@nextleveluplcc.com'}));
});
it.each([null,{id:10,is_active:0,from_email:'portal@nextleveluplcc.com'},{id:10,is_active:1,from_email:'portal@other.example'}])('fails before sending or provisioning if the canonical sender is not ready: %j',async identity=>{
 source=identity;await expect(sendEnrollmentPortalEmail({agencyId:453,enrollmentChannel:'tutoring',to:'qa.parent@example.com'})).rejects.toMatchObject({code:'NLU_QA_PORTAL_SENDER_NOT_READY'});
 expect(m.ensure).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});

it('uses the existing NLU notifications sender when no portal sender exists, retaining its actual headers and tenant branding',async()=>{
 source=null;notifications={id:52,agency_id:6,identity_key:'notifications',from_email:'Notifications@nextleveluplcc.com',reply_to:'PO@nextleveluplcc.com',display_name:'Next Level Up Notifications',is_active:1};
 const result=await sendEnrollmentPortalEmail({agencyId:453,enrollmentChannel:'tutoring',to:'qa.parent@example.com',subject:'Enrollment received',text:'Create your password'});
 expect(result).toMatchObject({sent:true,fromEmail:'Notifications@nextleveluplcc.com',replyTo:'PO@nextleveluplcc.com',qaSenderSource:{agencyId:6,identityId:52,identityKey:'notifications'}});
 expect(m.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({agencyId:453,identityKey:'enrollment_portal',fromEmail:'Notifications@nextleveluplcc.com',replyTo:'PO@nextleveluplcc.com',inboundAddresses:[]}));
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:99,replyToOverride:'PO@nextleveluplcc.com',subject:'NLU QA: Enrollment received',html:expect.stringContaining('NLU QA')}));
 expect(m.ensure).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it('prefers the existing portal sender even when notifications is also configured',async()=>{
 notifications={id:52,agency_id:6,from_email:'Notifications@nextleveluplcc.com',reply_to:'PO@nextleveluplcc.com',is_active:1};
 const result=await sendEnrollmentPortalEmail({agencyId:453,enrollmentChannel:'tutoring',to:'qa.parent@example.com'});
 expect(result.fromEmail).toBe('portal@nextleveluplcc.com');expect(m.identity).not.toHaveBeenCalledWith(6,'notifications');
});
it('keeps notifications transport failures actionable without provisioning or claiming success',async()=>{
 source=null;notifications={id:52,agency_id:6,from_email:'Notifications@nextleveluplcc.com',reply_to:'PO@nextleveluplcc.com',is_active:1};
 m.send.mockRejectedValue(Object.assign(new Error('Sender not verified'),{code:'EMAIL_SENDER_UNVERIFIED'}));
 await expect(sendEnrollmentPortalEmail({agencyId:453,enrollmentChannel:'tutoring',to:'qa.parent@example.com'})).rejects.toMatchObject({code:'EMAIL_SENDER_UNVERIFIED'});
 expect(m.ensure).not.toHaveBeenCalled();
});
it('rejects an inactive or unrelated notifications sender when neither approved source is ready',async()=>{
 source=null;notifications={id:52,agency_id:99,from_email:'Notifications@nextleveluplcc.com',is_active:1};
 await expect(sendEnrollmentPortalEmail({agencyId:453,enrollmentChannel:'tutoring',to:'qa.parent@example.com'})).rejects.toMatchObject({code:'NLU_QA_PORTAL_SENDER_NOT_READY',status:503});
 expect(m.create).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();expect(m.ensure).not.toHaveBeenCalled();
});
