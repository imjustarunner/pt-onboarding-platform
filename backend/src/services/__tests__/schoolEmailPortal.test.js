import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({notice:vi.fn(),log:vi.fn(),find:vi.fn(),send:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.find}}));
vi.mock('../notificationDispatcher.service.js',()=>({createNotificationAndDispatch:async()=>{}}));
vi.mock('../clientOnboardingTask.service.js',()=>({createClientOnboardingTaskForProvider:async()=>{}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../communicationLogging.service.js',()=>({default:{logGeneratedCommunication:m.log}}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolvePreferredSenderIdentityForAgency:async()=>({id:1,from_email:'notifications@itsco.health',signature_image_path:'schools.png'})}));
vi.mock('../clientExchangeEnrollmentNotice.service.js',()=>({sendNewClientSupportNotice:m.notice}));
import {schoolEmailPortalUrl} from '../schoolEmailPortal.service.js';
import {notifyNewPacketUploaded} from '../clientNotifications.service.js';
const school={id:20,slug:'galileo',portal_url:'galileo-school',organization_type:'school'};
beforeEach(()=>{
 vi.clearAllMocks();m.find.mockImplementation(async id=>Number(id)===20?school:{id:2,slug:'itsco',organization_type:'agency'});
 m.execute.mockImplementation(async sql=>{
  // clients stores organization_id; school_organization_id belongs to other tables.
  if (/\bFROM clients\b/.test(sql) && /\bschool_organization_id\b/.test(sql)) {
   throw Object.assign(new Error("Unknown column 'school_organization_id' in 'field list'"), {code:'ER_BAD_FIELD_ERROR'});
  }
  return sql.includes('sp.itsco_email')?[[{itsco_email:'galileo@itsco.health'}]]:sql.includes('AS agency_name')?[[{agency_name:'Galileo'}]]:[[]];
 });
 m.send.mockResolvedValue({id:'sent'});
 m.log.mockResolvedValue({id:1});
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

it('routes full office enrollment to the same deduplicated Support notice as a brief inquiry',async()=>{
 const execute=m.execute.getMockImplementation();m.execute.mockImplementation(async sql=>sql.includes('FROM clients c')?[[{client_type:'clinical',status:'PACKET',provider_id:null,organization_type:null}]]:execute(sql));m.notice.mockResolvedValue({status:'sent'});
 await notifyNewPacketUploaded({agencyId:2,clientId:10,schoolOrganizationId:null,mode:'digital_submission'});
 expect(m.notice).toHaveBeenCalledWith({agencyId:2,clientId:10});
});

it('still sends the school packet email when the office lookup fails',async()=>{
 const execute=m.execute.getMockImplementation();
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM clients'))throw Object.assign(new Error('Office lookup unavailable'),{code:'ER_BAD_FIELD_ERROR'});
  return execute(sql);
 });
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 await notifyNewPacketUploaded({agencyId:2,schoolOrganizationId:20,clientId:10,clientInitials:'ABC'});
 expect(m.send).toHaveBeenCalledOnce();
 expect(log).toHaveBeenCalledWith('[clientExchange] Enrollment Support notice needs review',{clientId:10,code:'ER_BAD_FIELD_ERROR'});
});

it('still sends the school packet email when the office Support notice fails',async()=>{
 const execute=m.execute.getMockImplementation();
 m.execute.mockImplementation(async sql=>sql.includes('FROM clients c')?[[{client_type:'clinical',status:'PACKET',provider_id:null,organization_type:null}]]:execute(sql));
 m.notice.mockRejectedValue(Object.assign(new Error('Support unavailable'),{code:'SUPPORT_UNAVAILABLE'}));
 vi.spyOn(console,'error').mockImplementation(()=>{});
 await notifyNewPacketUploaded({agencyId:2,schoolOrganizationId:20,clientId:10,clientInitials:'ABC'});
 expect(m.send).toHaveBeenCalledOnce();
});

it('records a school email preparation failure in communication history',async()=>{
 m.find.mockResolvedValue(null);
 vi.spyOn(console,'error').mockImplementation(()=>{});
 await notifyNewPacketUploaded({agencyId:2,schoolOrganizationId:20,clientId:10,clientInitials:'ABC'});
 expect(m.send).not.toHaveBeenCalled();
 expect(m.log).toHaveBeenCalledWith(expect.objectContaining({
  agencyId:2,clientId:10,templateType:'school_enrollment_packet_status',
  metadata:{schoolOrganizationId:20,skipReason:'School email requires a configured school portal'}
 }));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("SET delivery_status = 'skipped'"),['The school enrollment notice was not sent because the school portal is not configured.',1]);
});

it.each([
 {client_type:'school',status:'PACKET',provider_id:null,organization_type:'school'},
 {client_type:'clinical',status:'PACKET',provider_id:null,organization_type:'school'},
 {client_type:'clinical',status:'PACKET',provider_id:7,organization_type:null},
 {client_type:'clinical',status:'ACTIVE',provider_id:null,organization_type:null}
])('does not send a new office Support notice for an ineligible client (%j)',async client=>{
 const execute=m.execute.getMockImplementation();
 m.execute.mockImplementation(async sql=>sql.includes('FROM clients c')?[[client]]:execute(sql));
 await notifyNewPacketUploaded({agencyId:2,schoolOrganizationId:20,clientId:10,clientInitials:'ABC'});
 expect(m.notice).not.toHaveBeenCalled();
 expect(m.send).toHaveBeenCalledOnce();
});

it('retries a missing school email even when the in-app packet notification exists',async()=>{
 const execute=m.execute.getMockImplementation();
 m.execute.mockImplementation(async sql=>sql.includes('FROM notifications')?[[{id:67435}]]:execute(sql));
 await notifyNewPacketUploaded({agencyId:2,schoolOrganizationId:20,clientId:10,clientInitials:'ABC'});
 expect(m.send).toHaveBeenCalledOnce();
});

it('does not duplicate a school packet email already sent or awaiting approval',async()=>{
 const execute=m.execute.getMockImplementation();
 m.execute.mockImplementation(async sql=>sql.includes("template_type = 'school_enrollment_packet_status'")?[[{id:42}]]:execute(sql));
 await notifyNewPacketUploaded({agencyId:2,schoolOrganizationId:20,clientId:10,clientInitials:'ABC'});
 expect(m.send).not.toHaveBeenCalled();
});
