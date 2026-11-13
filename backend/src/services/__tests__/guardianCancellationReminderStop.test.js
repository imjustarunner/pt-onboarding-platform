import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),query:vi.fn(),connection:vi.fn(),blocked:vi.fn(async()=>true),email:vi.fn(),sms:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,query:m.query,getConnection:m.connection},onTableWrite:vi.fn()}));
vi.mock('../sessionSchedulingLock.service.js',()=>({withSessionSchedulingLock:async(id,work)=>work()}));
vi.mock('../clientServiceNotificationPolicy.service.js',()=>({serviceNotificationBlocked:m.blocked}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:async()=>({id:1,agencyId:2,providerUserId:7,businessType:'mental_health',startAt:'2099-01-01T16:00:00Z',status:'scheduled'}),listParticipants:async()=>[{clientId:8}]}}));
vi.mock('../appointmentFamilyRecipients.service.js',()=>({appointmentFamilyRecipients:async()=>({hasRelationships:false,recipients:[]})}));
vi.mock('../../models/ClientContactAffiliation.model.js',()=>({default:{listReminderRecipientsForClient:async()=>[]}}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:async()=>({isSchool:false}),buildSchoolReminder:vi.fn()}));
vi.mock('../appointmentEmailActions.service.js',()=>({sendAppointmentEmail:m.email}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:m.sms}}));
vi.mock('../appointmentScheduleNotice.service.js',()=>({appointmentScheduleNotices:{processDue:async()=>({processed:0})}}));
vi.mock('../replacementOfferEvents.service.js',()=>({replacementOfferEvents:{processDue:async()=>({processed:0})}}));
import {buildDeliveryPlan,processDueSessionNotifications,scheduleDefaultCadenceReminders} from '../sessionNotification.service.js';
beforeEach(()=>{
 vi.clearAllMocks();m.blocked.mockResolvedValue(true);
 m.execute.mockResolvedValue([[]]);m.connection.mockResolvedValue({execute:async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT status')?[[{status:'pending'}]]:[[]],release:vi.fn()});
});
it('does not generate more reminders for an ended service',async()=>{
 const plan=await buildDeliveryPlan(1);expect(plan.deliveries).toEqual([]);
 expect(await scheduleDefaultCadenceReminders(1)).toEqual([]);expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO appointment_reminders'))).toBe(false);
});
it.each(['email','sms'])('suppresses an old queued %s reminder while the cancellation worker is still finishing',async channel=>{
 m.query.mockResolvedValue([[{id:3,agency_id:2,appointment_id:1,recipient_client_id:8,channel,kind:'standard_reminder'}]]);
 const result=await processDueSessionNotifications();expect(result.skipped).toBe(1);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("skip_reason='service_ended'"),[3]);
 expect(m.email).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();
});
