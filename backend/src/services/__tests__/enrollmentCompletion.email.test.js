vi.mock('../portalGroupSender.service.js',()=>({ensurePortalGroupSender:vi.fn(async()=>{})}));
import { it,expect,vi,beforeEach } from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),domain:vi.fn(),identity:vi.fn(),create:vi.fn(),send:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:m.identity,create:m.create,update:vi.fn()}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:m.domain}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import { sendEnrollmentPortalEmail,enrollmentMailBrand } from '../enrollmentPortalEmail.service.js';
beforeEach(()=>{m.agency.mockResolvedValue({id:4,name:'Agency',feature_flags:{medicalBillingEnabled:true}});m.domain.mockResolvedValue('agency.test');m.identity.mockResolvedValue(null);m.create.mockResolvedValue({id:12});m.send.mockResolvedValue({id:'message'});});
it('uses AuricWell with the agency reply-to and retains SchoolCareBridge role branding',async()=>{
 const result=await sendEnrollmentPortalEmail({agencyId:4,schoolOrganizationId:5,to:'guardian@example.test',subject:'Enrollment',text:'Welcome'});
 expect(result.sent).toBe(true);expect(m.create).toHaveBeenCalledWith(expect.objectContaining({displayName:'AuricWell Portal',fromEmail:'portal@auricwell.com',replyTo:'support@agency.test',agencyId:4,inboundAddresses:[]}));
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:12,replyToOverride:'support@agency.test',text:expect.stringContaining('SchoolCareBridge'),html:expect.stringContaining('AuricWell')}));
});
it('uses NLU’s own sender for tutoring and does not imply clinical records',()=>{const brand=enrollmentMailBrand({agency:{name:'Next Level Up',feature_flags:{medicalBillingEnabled:true}},domain:'nextleveluplcc.com',channel:'tutoring'});expect(brand.fromEmail).toBe('portal@nextleveluplcc.com');expect(brand.products).toEqual([]);});
it.each([{queued:true},{blocked:true},{skipped:true}])('does not report successful delivery for %j',async flags=>{m.send.mockResolvedValue({id:'message',...flags});expect((await sendEnrollmentPortalEmail({agencyId:4,text:'Welcome'})).sent).toBe(false);});
it('records a transmitted test-inbox redirect as sent, but requires a transport ID',async()=>{
 m.send.mockResolvedValue({id:'message',redirected:true});
 expect(await sendEnrollmentPortalEmail({agencyId:4,text:'Welcome'})).toMatchObject({sent:true,deliveryStatus:'sent',redirected:true});
 m.send.mockResolvedValue({redirected:true});
 expect((await sendEnrollmentPortalEmail({agencyId:4,text:'Welcome'})).sent).toBe(false);
});
it('keeps approval-held portal mail pending instead of reporting success or a delivery failure', async()=>{
 m.send.mockResolvedValue({id:'message',pendingApproval:true});
 expect(await sendEnrollmentPortalEmail({agencyId:4,text:'Welcome'})).toMatchObject({sent:false,queued:true,deliveryStatus:'pending'});
});
