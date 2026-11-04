import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),create:vi.fn(),update:vi.fn(),alias:vi.fn(),portal:vi.fn(),send:vi.fn(),tenant:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../models/Client.model.js',()=>({default:{}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:m.find,create:m.create,update:m.update}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:vi.fn(),ensureTenantNotificationsMailbox:m.tenant}));
vi.mock('../portalGroupSender.service.js',()=>({ensurePortalGroupSender:m.portal}));
vi.mock('../gmailSendAs.service.js',()=>({ensureSendAsAlias:m.alias}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {sendClientPortalEmail} from '../clientPortalEmail.service.js';
const context={clinical:true,tenant:{id:2,name:'ITSCO'},brand:{clinical:true,name:'ITSCO',replyTo:'support@itsco.health',products:[]}};
beforeEach(()=>{
 vi.resetAllMocks();m.alias.mockResolvedValue({ok:true,sendAs:{verificationStatus:'accepted'}});
 m.find.mockImplementation(async(_,key)=>({id:key==='clinical_appointment_reminders'?4:3,is_active:true,from_email:key==='clinical_appointment_reminders'?'notifications@auricwell.com':'portal@auricwell.com',display_name:'AuricWell Notifications',reply_to:'support@itsco.health'}));
});
it('uses the verified AuricWell notifications identity for appointments and leaves portal messages on Portal',async()=>{
 await sendClientPortalEmail({agencyId:2,context,appointments:true,to:'parent@example.test',html:'<p>Reminder</p>'});
 expect(m.alias).toHaveBeenCalledWith(expect.objectContaining({sendAsEmail:'notifications@auricwell.com',displayName:'AuricWell Notifications'}));
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:4,fromDisplayNameOverride:'AuricWell Notifications'}));expect(m.portal).not.toHaveBeenCalled();
 await sendClientPortalEmail({agencyId:2,context,to:'parent@example.test',html:'<p>Welcome</p>'});
 expect(m.send.mock.lastCall[0]).toMatchObject({senderIdentityId:3,fromDisplayNameOverride:'AuricWell Portal'});
});
it('blocks an unverified or disabled appointment identity rather than falling back to a portal sender',async()=>{
 m.alias.mockResolvedValue({ok:false});await expect(sendClientPortalEmail({agencyId:2,context,appointments:true})).rejects.toThrow('not verified');expect(m.send).not.toHaveBeenCalled();
 m.alias.mockResolvedValue({ok:true,sendAs:{verificationStatus:'accepted'}});m.find.mockResolvedValue({id:4,is_active:false});
 await expect(sendClientPortalEmail({agencyId:2,context,appointments:true})).rejects.toThrow('disabled');expect(m.send).not.toHaveBeenCalled();
});
it('keeps learning reminders on the tenant notifications sender',async()=>{
 m.tenant.mockResolvedValue({notifications:{id:9}});
 await sendClientPortalEmail({agencyId:2,context:{...context,clinical:false,brand:{...context.brand,clinical:false}},appointments:true,html:'<p>Tutoring</p>'});
 expect(m.send.mock.lastCall[0]).toMatchObject({senderIdentityId:9,fromDisplayNameOverride:'ITSCO Notifications'});expect(m.alias).not.toHaveBeenCalled();
});
