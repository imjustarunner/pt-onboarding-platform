import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),send:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.find}}));
vi.mock('../notificationDispatcher.service.js',()=>({createNotificationAndDispatch:async()=>{}}));
vi.mock('../clientOnboardingTask.service.js',()=>({createClientOnboardingTaskForProvider:async()=>{}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../communicationLogging.service.js',()=>({default:{logGeneratedCommunication:async()=>({id:1})}}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolvePreferredSenderIdentityForAgency:async()=>({id:1,from_email:'notifications@itsco.health',signature_image_path:'schools.png'})}));
import {schoolEmailPortalUrl} from '../schoolEmailPortal.service.js';
import {notifyNewPacketUploaded} from '../clientNotifications.service.js';
const school={id:20,slug:'galileo',portal_url:'galileo-school',organization_type:'school'};
beforeEach(()=>{
 vi.clearAllMocks();m.find.mockImplementation(async id=>Number(id)===20?school:{id:2,slug:'itsco',organization_type:'agency'});
 m.execute.mockImplementation(async sql=>sql.includes('sp.itsco_email')?[[{itsco_email:'galileo@itsco.health'}]]:sql.includes('AS agency_name')?[[{agency_name:'Galileo'}]]:[[]]);
 m.send.mockResolvedValue({id:'sent'});
});
it('uses the school portal slug on the parent tenant host',async()=>{
 expect(await schoolEmailPortalUrl({schoolOrganizationId:20,agencyId:2})).toBe('https://app.itsco.health/galileo-school/dashboard');
});
it('honors the parent custom host without losing the school dashboard',async()=>{
 m.find.mockImplementation(async id=>Number(id)===20?school:{slug:'another-agency',custom_domain:'portal.example.org'});
 expect(await schoolEmailPortalUrl({schoolOrganizationId:20,agencyId:2})).toBe('https://portal.example.org/galileo-school/dashboard');
});
it('does not silently send families to a general agency login when the school is missing',async()=>{
 m.find.mockResolvedValue(null);await expect(schoolEmailPortalUrl({schoolOrganizationId:20,agencyId:2})).rejects.toThrow('configured school portal');
});
it.each(['paper_upload','digital_submission'])('keeps the packet subject while using Schools for the signature and the school-specific links (%s)',async mode=>{
 await notifyNewPacketUploaded({agencyId:2,schoolOrganizationId:20,clientId:10,clientInitials:'ABC',mode});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({fromDisplayNameOverride:'Schools',replyToOverride:'schools@itsco.health',to:'galileo@itsco.health',linkUrl:'https://app.itsco.health/galileo-school/dashboard'}));
 const mail=m.send.mock.calls[0][0];expect(mail.subject).toContain('Galileo -');expect(mail.html).toContain('href="https://app.itsco.health/galileo-school/dashboard"');expect(mail.text).toContain('https://app.itsco.health/galileo-school/dashboard');expect(mail.html).not.toContain('https://app.itsco.health/login');
});
