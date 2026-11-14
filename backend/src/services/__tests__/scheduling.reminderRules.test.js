import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), appointment: vi.fn() }));
let customRules = [];
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {
  findById: m.appointment,
  listParticipants: async () => []
} }));
vi.mock('../appointmentServiceSetting.service.js', () => ({ resolveAppointmentServiceSetting: async () => ({ isSchool: false }), buildSchoolReminder: vi.fn() }));
vi.mock('../sessionSchedulingLock.service.js', () => ({ withSessionSchedulingLock: async (id, work) => work() }));
import { buildDeliveryPlan, scheduleSessionNotifications } from '../sessionNotification.service.js';
import { dedupeSessionReminders } from '../../../../frontend/src/navigation/sessionReminderRules.js';
beforeEach(() => {
  vi.clearAllMocks(); customRules=[];
  m.appointment.mockResolvedValue({ id:68, agencyId:377, startAt:'2026-11-26 22:00:00', sourceTimezone:'America/Denver' });
  m.execute.mockImplementation(async sql => sql.includes('platform_session_notification_settings') ? [[{
    channels_json: { email:'available', sms:'consent_required', in_app:'available' }, min_rules_json:[{channel:'email',offsetValue:24,offsetUnit:'hours'}]
  }]] : sql.includes('FROM appointment_notification_customizations') ? [[{rules_json:customRules}]] : sql.trimStart().startsWith('SELECT') ? [[]] : [{insertId:1,affectedRows:1}]);
});
it('uses 72/24/2-hour defaults while merging an explicit platform floor into the 24-hour delivery', async () => {
  const plan = await buildDeliveryPlan(68);
  expect(plan.deliveries.map(row=>row.offsetMinutes).sort((a,b)=>b-a)).toEqual([4320,1440,120]);
  expect(plan.deliveries.find(row=>row.offsetMinutes===1440)).toMatchObject({ kind: 'standard_reminder', ruleKey: 'organization:app-24h', channel: 'email', isRequired: true });
});
it('keeps distinct channels, recipients and confirmation deliveries while merging duplicate required floors', () => {
  const floor = { kind: 'standard_reminder', channel: 'email', recipientRole: 'client', offsetMinutes: 1440, ruleKey: 'platform:24h', isRequired: true };
  const practice = { ...floor, ruleKey: 'tenant_standard', isRequired: false, messageBody: 'Practice wording' };
  const result = dedupeSessionReminders([floor, practice, { ...practice, channel: 'in_app' }, { ...practice, recipientRole: 'provider' }, { ...practice, kind: 'confirmation', sendImmediately: true }]);
  expect(result).toHaveLength(4); expect(result[0]).toMatchObject({ ruleKey: 'tenant_standard', isRequired: true, messageBody: 'Practice wording' });
});

it('uses the complete custom schedule instead of organization defaults and rejects a text without consent', async()=>{
 m.appointment.mockResolvedValue({id:68,agencyId:377,startAt:'2026-11-26 22:00:00',sourceTimezone:'America/Denver',notificationMode:'customizable'});
 customRules=[{id:'extra',channel:'email',offsetMinutes:60,message:'Arrive early',askConfirmation:true},{id:'text',channel:'sms',offsetMinutes:60,message:'',askConfirmation:true}];
 const plan=await buildDeliveryPlan(68);expect(plan.deliveries).toHaveLength(1);
 expect(plan.deliveries.find(row=>row.ruleKey==='appointment_custom:extra')).toMatchObject({channel:'email',offsetMinutes:60,messageBody:'Arrive early'});
 expect(plan.deliveries.some(row=>row.channel==='sms')).toBe(false);
});
it('keeps a custom reminder optional even when its timing matches the organization default',async()=>{
 m.appointment.mockResolvedValue({id:68,agencyId:377,startAt:'2026-11-26 22:00:00',notificationMode:'customizable'});
 customRules=[{id:'same-time',channel:'email',offsetMinutes:1440,message:'Custom wording',askConfirmation:true}];
 const plan=await buildDeliveryPlan(68);expect(plan.deliveries).toHaveLength(1);expect(plan.deliveries[0]).toMatchObject({messageBody:'Custom wording',isRequired:false});
});
it('recomputes the saved custom timing when the appointment moves',async()=>{
 m.appointment.mockResolvedValue({id:68,agencyId:377,startAt:'2080-12-03 22:00:00',sourceTimezone:'America/Denver',notificationMode:'customizable'});
 customRules=[{id:'extra',channel:'email',offsetMinutes:60,message:'',askConfirmation:true}];
 await scheduleSessionNotifications(68,{replace:true});
 const row=m.execute.mock.calls.find(([sql,args])=>sql.includes('INSERT INTO appointment_reminders')&&args[4]==='appointment_custom:extra');
 expect(row[1][11]).toBe('2080-12-03 21:00:00');
});
