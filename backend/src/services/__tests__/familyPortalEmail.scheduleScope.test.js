import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),disabled:vi.fn(),link:vi.fn(),intake:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:async()=>({tenant:{name:'ITSCO'},url:p=>'https://auricwell.com/itsco/'+p}),sendClientPortalEmail:m.send}));
vi.mock('../providerWaitlistEmail.service.js',()=>({resolveWaitlistMailboxes:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn(),sendEmailFromIdentity:vi.fn()}));
vi.mock('../schoolSessionEmailPreferences.service.js',()=>({isSchoolSessionEmailOptedOut:m.disabled,createSchoolSessionEmailOptOutLink:m.link}));
vi.mock('../intakeCommunicationChoices.service.js',()=>({latestIntakeCommunicationChoices:m.intake}));
import {sendScheduleNotificationEmail} from '../scheduleNotificationEmail.service.js';
import {familyNotificationDeliveryGate} from '../familyNotificationChoices.service.js';
const input={agencyId:2,clientId:22,to:'guardian@example.test',subject:'Schedule updated',text:'Original combined schedule',html:'<p>Original combined schedule</p>'};
const entry=(id,school,eventType='canceled')=>({appointment:{id,school,startAt:'2030-01-02T20:00:00Z',sourceTimezone:'America/Denver'},row:{event_type:eventType},payload:{eventType}});
let choices;
beforeEach(()=>{
 vi.resetAllMocks();m.disabled.mockResolvedValue(true);m.intake.mockResolvedValue(null);
 choices={appointments:'off',school_sessions:'off',schedule_changes:'email'};
 m.execute.mockImplementation(async sql=>sql.includes('FROM family_notification_choices')?[[{choices_json:choices}]]:[[]]);
 // Exercise the shared category/confidential-choice gate without actual mail.
 m.send.mockImplementation(async args=>{const gate=await familyNotificationDeliveryGate(args,{execute:m.execute});return gate.allowed?{id:'accepted'}:{skipped:true,reason:gate.reason};});
});
it.each(['canceled','moved','created'])('keeps a school %s update separate from reminder-only opt-outs',async eventType=>{
 expect(await sendScheduleNotificationEmail({...input,entries:[entry(1,true,eventType)]})).toEqual({id:'accepted'});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({templateType:'session_change',text:input.text}));
 expect(m.disabled).not.toHaveBeenCalled();expect(m.link).not.toHaveBeenCalled();
});
it('retains school and office entries in the same operational update',async()=>{
 await sendScheduleNotificationEmail({...input,entries:[entry(1,true),entry(2,false)]});
 expect(m.send).toHaveBeenCalledOnce();expect(m.send.mock.calls[0][0]).toMatchObject({text:input.text,html:input.html,templateType:'session_change'});
});
it('preserves the cancellation category on a prelogged communication without retagging it as a reminder',async()=>{
 await sendScheduleNotificationEmail({...input,templateType:'session_cancellation',existingCommunicationId:12,entries:[entry(1,true)]});
 expect(m.send.mock.calls[0][0]).toMatchObject({templateType:'session_cancellation',existingCommunicationId:12});
 expect(m.send.mock.calls[0][0].schoolSessionScopeKey).toBeUndefined();
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('still honors an explicit schedule-change category decline',async()=>{
 choices.schedule_changes='off';
 expect(await sendScheduleNotificationEmail({...input,entries:[entry(1,true)]})).toMatchObject({skipped:true,reason:'family_notification_category_off'});
});
it('still honors confidential contact instructions and an enrollment-wide email decline',async()=>{
 m.intake.mockResolvedValue({recipientEmail:input.to,noAutomaticEmail:true});
 expect(await sendScheduleNotificationEmail({...input,entries:[entry(1,true)]})).toMatchObject({skipped:true,reason:'enrollment_automatic_email_off'});
 m.intake.mockResolvedValue({recipientEmail:input.to,emailPreference:'no'});m.execute.mockResolvedValue([[]]);
 expect(await sendScheduleNotificationEmail({...input,entries:[entry(1,true)]})).toMatchObject({skipped:true,reason:'enrollment_email_choice_off'});
});
