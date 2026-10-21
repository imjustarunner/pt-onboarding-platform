import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),setting:vi.fn(),disabled:vi.fn(),link:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:async()=>({tenant:{name:'ITSCO'},url:p=>'https://auricwell.com/itsco/'+p}),sendClientPortalEmail:m.send}));
vi.mock('../providerWaitlistEmail.service.js',()=>({resolveWaitlistMailboxes:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn(),sendEmailFromIdentity:vi.fn()}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:m.setting}));
vi.mock('../schoolSessionEmailPreferences.service.js',()=>({isSchoolSessionEmailOptedOut:m.disabled,createSchoolSessionEmailOptOutLink:m.link,schoolSessionEmailOptOutContent:()=>({text:'\nScoped school opt-out',html:'<p>Scoped school opt-out</p>'}),SCHOOL_EMAIL_TEMPLATE:'school_session_notice'}));
import {sendScheduleNotificationEmail} from '../scheduleNotificationEmail.service.js';
const input={agencyId:2,clientId:22,to:'guardian@example.test',subject:'Schedule updated',text:'Original combined schedule',html:'<p>Original combined schedule</p>'};
const entry=(id,school)=>({appointment:{id,school,startAt:'2030-01-02T20:00:00Z',sourceTimezone:'America/Denver'},row:{event_type:'created'},payload:{}});
beforeEach(()=>{vi.resetAllMocks();m.setting.mockImplementation(async a=>({isSchool:a.school}));m.disabled.mockResolvedValue(false);m.link.mockResolvedValue({scopeKey:'a'.repeat(64),url:'https://auricwell.com/unsubscribe'});});
it('suppresses school cancellations and schedule notices without affecting office messages',async()=>{
 m.disabled.mockResolvedValue(true);
 expect(await sendScheduleNotificationEmail({...input,appointment:entry(1,true).appointment})).toMatchObject({skipped:true});expect(m.send).not.toHaveBeenCalled();
 await sendScheduleNotificationEmail({...input,appointment:entry(2,false).appointment});expect(m.send).toHaveBeenCalledTimes(1);
});
it('filters school entries out of a mixed school and office update instead of silencing office updates',async()=>{
 m.disabled.mockResolvedValue(true);
 const school=entry(1,true),office=entry(2,false);school.appointment.startAt='2030-01-08T20:00:00Z';
 await sendScheduleNotificationEmail({...input,entries:[school,office]});
 expect(m.send).toHaveBeenCalledOnce();const sent=m.send.mock.calls[0][0];expect(sent.text).not.toContain('Original combined');expect(sent.text).not.toContain('January 8');expect(sent.text).toContain('January 2');
});
it('persists the narrow scope for later delivery checks and includes the opt-out',async()=>{
 await sendScheduleNotificationEmail({...input,existingCommunicationId:12,entries:[entry(1,true)]});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('schoolSessionScopeKey'),['school_session_notice','a'.repeat(64),12]);
 expect(m.send.mock.calls[0][0]).toMatchObject({templateType:'school_session_notice',schoolSessionScopeKey:'a'.repeat(64)});
 expect(m.send.mock.calls[0][0].html).toContain('Scoped school opt-out');
});
