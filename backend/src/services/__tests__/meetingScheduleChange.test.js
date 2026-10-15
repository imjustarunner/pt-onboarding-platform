import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:m.send}));
vi.mock('../scheduleNotificationEmail.service.js',()=>({sendScheduleNotificationEmail:m.send}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async({user})=>({email:user.email})}));
vi.mock('../meetingParticipants.service.js',()=>({meetingReplyTo:async()=> 'support@example.test',meetingParticipantRows:vi.fn(),meetingEmailDetails:vi.fn()}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://agency.example.test'}));
import {sendMeetingScheduleChange} from '../meetingInvitations.service.js';
const event={id:1,agency_id:2,supervisor_user_id:3,supervisee_user_id:5,session_type:'group',recurrence_series_id:'series',start_at:'2026-11-26 20:00:00',end_at:'2026-11-26 21:00:00',event_timezone:'America/Denver',cancel_reason:'Thanksgiving week'};
let claims;
beforeEach(()=>{vi.resetAllMocks();claims=new Set();m.send.mockResolvedValue({id:'sent'});m.execute.mockImplementation(async(sql,args=[])=>{
 if(sql.includes('SELECT user_id'))return [[{user_id:5},{user_id:6}]];
 if(sql.includes('SELECT id,email'))return [[{id:args[0],email:`user${args[0]}@example.test`}]];
 if(sql.includes('SELECT * FROM meeting_email_invitations'))return [[{join_token:'personal'}]];
 if(sql.startsWith('INSERT IGNORE INTO meeting_schedule_change')){const key=args.join(':');const duplicate=claims.has(key);claims.add(key);return [{affectedRows:duplicate?0:1}];}
 return [[]];
});});
it('sends each invitee one single-date cancellation with its date and reason, even on retry',async()=>{
 await sendMeetingScheduleChange([event],'cancelled');await sendMeetingScheduleChange([event],'cancelled');
 expect(m.send).toHaveBeenCalledTimes(3);for(const [email] of m.send.mock.calls){expect(email.text).toContain('Thursday, Nov 26, 2026');expect(email.text).toContain('Thanksgiving week');expect(email.text).toContain('Other dates in the series are unchanged');}
});
it('sends a single consolidated series update per person, showing the previous and new schedules',async()=>{
 await sendMeetingScheduleChange([event,{...event,id:2,start_at:'2026-12-03 20:00:00',end_at:'2026-12-03 21:00:00'}],'updated',{scope:'future',previousEvents:[{...event,start_at:'2026-11-24 19:00:00',end_at:'2026-11-24 20:00:00'}]});
 expect(m.send).toHaveBeenCalledTimes(3);const email=m.send.mock.calls[0][0];expect(email.subject).toContain('Series updated');expect(email.text).toContain('This and all future');expect(email.text).toContain('Previously: Tuesday');expect(email.text).toContain('Thursday, Dec 3');
});
it('does not resend after an uncertain delivery failure',async()=>{
 m.send.mockRejectedValue(new Error('transport interrupted'));await sendMeetingScheduleChange([event],'cancelled');await sendMeetingScheduleChange([event],'cancelled');expect(m.send).toHaveBeenCalledTimes(3);expect(m.execute.mock.calls.some(([sql])=>sql.includes("delivery_status='review'"))).toBe(true);
});
