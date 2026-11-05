import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({context:vi.fn(),send:vi.fn(),envelope:vi.fn(),proof:vi.fn(),individual:vi.fn(),optOut:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../emailSendMailbox.service.js',()=>({resolveEmailSendMailbox:vi.fn()}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:m.context,sendClientPortalEmail:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send,sendNotificationEmail:vi.fn()}));
vi.mock('../dayCancellationEmail.service.js',()=>({resolveDayCancellationEmail:m.envelope,reviewedDayCancellationContext:m.proof}));
vi.mock('../appointmentCancellationEmail.service.js',()=>({individualCancellationEmailContext:m.individual}));
vi.mock('../schoolSessionEmailPreferences.service.js',()=>({isSchoolSessionEmailOptedOut:m.optOut,createSchoolSessionEmailOptOutLink:vi.fn(),schoolSessionEmailOptOutContent:vi.fn(),SCHOOL_EMAIL_TEMPLATE:'school_session_notice'}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:async()=>({isSchool:true})}));
import {sendScheduleNotificationEmail} from '../scheduleNotificationEmail.service.js';
import {sendSchoolDayAbsenceEmail} from '../schoolDayAbsenceEmail.service.js';
const proof={reviewedCancellationToken:'11111111-1111-4111-8111-111111111111',reviewedCancellationItemKey:'appointment:17'};
const envelope={senderIdentityId:9,replyToOverride:'support@itsco.health',cc:['support@itsco.health'],fromDisplayNameOverride:'Danica Provider',
 portalEmailBrand:{clinical:false,name:'ITSCO',displayName:'ITSCO',products:[],replyTo:'support@itsco.health'},source:'manual',...proof};
beforeEach(()=>{
 vi.clearAllMocks();m.context.mockResolvedValue({tenant:{name:'ITSCO'},url:()=> 'https://example.test/guardian'});
 m.envelope.mockResolvedValue(envelope);m.proof.mockResolvedValue({providerId:776,actorUserId:776,plan:{facts:{providerAuthored:true}},...proof});
 m.optOut.mockResolvedValue(true);
 m.individual.mockResolvedValue({providerId:776,actorUserId:776,plan:{facts:{providerAuthored:true}}});
});
it('uses the same operational sender for booked school families despite reminder-only opt-out',async()=>{
 await sendScheduleNotificationEmail({agencyId:2,clientId:8,to:'parent@example.test',generatedByUserId:776,
  entries:[{appointment:{id:17,providerUserId:776},payload:{facts:proof}}],subject:'Reviewed cancellation',text:'Danica is away.'});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({...envelope,templateType:'day_cancellation',agencyId:2,to:'parent@example.test'}));
 expect(m.optOut).not.toHaveBeenCalled();
});
it('uses the same operational envelope for school notifications',async()=>{
 await sendSchoolDayAbsenceEmail({agencyId:2,providerId:776,providerAuthored:true,generatedByUserId:776,
  to:'school@example.test',subject:'Reviewed cancellation',text:'Danica is away.',...proof});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({...envelope,templateType:'day_cancellation',agencyId:2,to:'school@example.test'}));
});
it('uses the shared provider/support sender for a persisted signed individual cancellation',async()=>{
 await sendScheduleNotificationEmail({agencyId:2,clientId:8,to:'parent@example.test',generatedByUserId:776,existingCommunicationId:12,
  entries:[{appointment:{id:17},payload:{individualCancellationReview:{appointmentId:17}}}],subject:'Session canceled',text:'The school session was canceled.'});
 expect(m.individual).toHaveBeenCalledWith(expect.objectContaining({existingCommunicationId:12,templateType:'session_cancellation'}));
 expect(m.envelope).toHaveBeenCalledWith({agencyId:2,providerId:776,providerAuthored:true,actorUserId:776});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:9,replyToOverride:'support@itsco.health',cc:['support@itsco.health'],templateType:'session_cancellation'}));
 expect(m.optOut).not.toHaveBeenCalled();
});
it('rejects an individual snapshot without persisted signed authority instead of using a generic manual bypass',async()=>{
 m.individual.mockResolvedValue(null);
 await expect(sendScheduleNotificationEmail({agencyId:2,clientId:8,to:'parent@example.test',existingCommunicationId:12,
  entries:[{appointment:{id:17},payload:{individualCancellationReview:{appointmentId:17}}}]})).rejects.toThrow('persisted recipient review');
 expect(m.send).not.toHaveBeenCalled();
});
it('does not mix an unreviewed schedule notice into the signed operational exception',async()=>{
 await expect(sendScheduleNotificationEmail({agencyId:2,clientId:8,to:'parent@example.test',generatedByUserId:776,
  entries:[{appointment:{id:17},payload:{facts:proof}},{appointment:{id:18},payload:{facts:{}}}]})).rejects.toThrow('mixed schedule notices');
 expect(m.send).not.toHaveBeenCalled();
});
