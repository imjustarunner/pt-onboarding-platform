import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),family:vi.fn(),consent:vi.fn(),profile:vi.fn(),authorize:vi.fn(),cancel:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.find,mapRow:r=>r}}));
vi.mock('../appointmentFamilyRecipients.service.js',()=>({appointmentFamilyRecipients:m.family}));
vi.mock('../sessionNotification.service.js',()=>({loadClientConsent:m.consent}));
vi.mock('../smsProfileAudit.service.js',()=>({resolveProfilePhoneMatch:m.profile}));
vi.mock('../guardianAppointments.service.js',()=>({requireGuardianCancellation:m.authorize}));
vi.mock('../appointmentReminder.service.js',()=>({logCommunication:vi.fn()}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:async()=>({isSchool:false})}));
vi.mock('../bookingCancellationPolicy.service.js',()=>({evaluateCancel:async()=>({allowed:true,recommendedFeeCents:0})}));
vi.mock('../appointment.service.js',()=>({cancelAppointment:m.cancel}));
vi.mock('../notificationDispatcher.service.js',()=>({default:{createNotificationAndDispatch:vi.fn()}}));
import {handleInboundSmsAppointmentReply} from '../appointmentReply.service.js';
const appt={id:68,agencyId:450,status:'scheduled',startAt:'2099-11-02 17:00:00'};
beforeEach(()=>{
 vi.resetAllMocks();m.profile.mockResolvedValue({clients:[{id:2271}]});m.find.mockResolvedValue(appt);
 m.family.mockResolvedValue({hasRelationships:true,recipients:[{userId:91},{userId:92}]});
 m.consent.mockImplementation(async(c,a,id)=>({phoneNumber:id===91?'+17195550101':'+17195550102'}));
 m.execute.mockImplementation(async sql=>sql.includes('SELECT a.*')?[[appt]]:[{insertId:11,affectedRows:1}]);
});
it.each([[91,'+17195550101'],[92,'+17195550102']])('lets guardian %s cancel from their own phone',async(id,phone)=>{
 const result=await handleInboundSmsAppointmentReply({agencyId:450,clientId:2271,fromNumber:phone,rawBody:'N'});
 expect(result.status).toBe('applied');expect(m.cancel).toHaveBeenCalledWith(68,expect.objectContaining({actorUserId:id,actorRole:'guardian'}));
});
it('does not choose a dependent arbitrarily when a phone belongs to several clients',async()=>{
 m.profile.mockResolvedValue({clients:[{id:2271},{id:2272}]});
 const result=await handleInboundSmsAppointmentReply({agencyId:450,clientId:2271,fromNumber:'+17195550101',rawBody:'N'});
 expect(result.status).toBe('pending_review');expect(m.cancel).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
});
it('requires portal identification when both guardians share a phone',async()=>{
 m.consent.mockResolvedValue({phoneNumber:'+17195550101'});
 const result=await handleInboundSmsAppointmentReply({agencyId:450,clientId:2271,fromNumber:'+17195550101',rawBody:'N'});
 expect(result.status).toBe('pending_review');expect(m.cancel).not.toHaveBeenCalled();
});
it('does not treat an unrelated sender as either guardian',async()=>{
 const result=await handleInboundSmsAppointmentReply({agencyId:450,clientId:2271,fromNumber:'+17195550999',rawBody:'Y'});
 expect(result.status).toBe('pending_review');expect(m.authorize).not.toHaveBeenCalled();expect(m.cancel).not.toHaveBeenCalled();
});
