import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async id=>({id,first_name:'Person',email:'person@example.com'})}}));
vi.mock('../../models/PhoneNumber.model.js',()=>({default:{normalizePhone:()=>null}}));
vi.mock('../vonage.service.js',()=>({default:{}}));
vi.mock('../communicationRouting.service.js',()=>({resolveReminderNumber:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn()}));
vi.mock('../notificationGatekeeper.service.js',()=>({default:{decideChannels:async()=>({email:true,sms:false})}}));
vi.mock('../video.service.js',()=>({isVideoConfigured:()=>false}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:vi.fn()}));
import {buildScheduleEventNotificationPlan,runJoinReminderTick} from '../joinReminder.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);});
const event={id:10,kind:'TEAM_MEETING',title:'Leadership',provider_id:5,start_at:'2099-09-28 22:00:00',notify_participants:1};
describe('editable meeting reminders',()=>{
  it('shows the actual selected reminder time in the event notification plan',async()=>{
    const plan=await buildScheduleEventNotificationPlan({...event,reminder_minutes:30});
    expect(plan.items[0].scheduledFor).toBe('2099-09-28 21:30:00');expect(plan.items[0].bodyPreview).toContain('30 minutes');
  });
  it('does not schedule a reminder when explicitly turned off',async()=>{
    expect((await buildScheduleEventNotificationPlan({...event,reminder_minutes:null})).items).toEqual([]);
    expect((await buildScheduleEventNotificationPlan({...event,notify_participants:0})).items).toEqual([]);
  });
  it('preserves the five-minute default for existing events',async()=>{expect((await buildScheduleEventNotificationPlan(event)).items[0].scheduledFor).toBe('2099-09-28 21:55:00');});
  it('uses UTC and persisted per-event settings for both meeting types',async()=>{
    await runJoinReminderTick({now:new Date('2026-09-28T21:30:00Z')});
    const queries=m.execute.mock.calls.filter(([sql])=>sql.includes('INTERVAL') && sql.includes('reminder_minutes'));
    expect(queries).toHaveLength(2);
    for(const [sql,args] of queries){expect(sql).toContain('reminder_minutes IS NOT NULL');expect(sql).toContain('INTERVAL 3 MINUTE');expect(args).toEqual(['2026-09-28 21:30:00','2026-09-28 21:30:00','2026-09-28 21:30:00']);}
  });
});
