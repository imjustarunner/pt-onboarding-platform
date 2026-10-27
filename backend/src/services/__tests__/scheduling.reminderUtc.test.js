import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../appointmentServiceSetting.service.js', () => ({ resolveAppointmentServiceSetting: vi.fn(), buildSchoolReminder: vi.fn() }));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import { resolveAppointmentServiceSetting } from '../appointmentServiceSetting.service.js';
import { scheduleDefaultCadenceReminders, sessionReminderTime, formatQueuedSessionMessage } from '../sessionNotification.service.js';
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  pool.execute.mockImplementation(async sql => sql.includes('SELECT') ? [[]] : [{ insertId: 1 }]);
  resolveAppointmentServiceSetting.mockResolvedValue({ isSchool: false });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it.each(['2026-11-03 17:00:00', new Date('2026-11-03T17:00:00Z')])('keeps reminder instants in UTC across the Denver DST change (%s)', async startAt => {
  Appointment.findById.mockResolvedValue({ id: 68, agencyId: 450, startAt, sourceTimezone: 'America/Denver' });
  const rows = await scheduleDefaultCadenceReminders(68, { includeFollowUps: true });
  expect(rows.map(row => row.scheduledFor)).toEqual(['2026-10-27 17:00:00', '2026-11-02 17:00:00', '2026-11-03 13:00:00']);
  const bodies=pool.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO appointment_reminders')).map(([,args])=>args.find(v=>typeof v==='string' && v.includes('Reply Y')));
  expect(bodies.every(body=>body?.includes('10:00 AM MST'))).toBe(true);
});
it.each([
 ['2026-10-28 19:50:00','America/Denver','1:50 PM MDT'],
 ['2026-11-03 20:00:00','America/Denver','1:00 PM MST'],
 [new Date('2026-10-28T19:50:00Z'),'America/Chicago','2:50 PM CDT']
])('renders the actual appointment zone, independently of the server zone', (startAt,sourceTimezone,expected)=>{
 expect(sessionReminderTime({startAt,sourceTimezone})).toContain(expected);
});
it.each([
 'Reminder: Session on Wed Oct 28 2026 19:50:00 GMT+0000 (Coordinated Universal Time). Reply Y to confirm, N to cancel, R to request a reschedule.',
 'Please confirm your appointment "Session" on Wed Oct 28 2026 19:50:00 GMT+0000 (Coordinated Universal Time). Reply Y to confirm, N to cancel, R to request a reschedule.'
])('corrects old queued defaults for any agency when delivered', body=>{
 const result=formatQueuedSessionMessage({agencyId:99,startAt:'2026-10-28 19:50:00',sourceTimezone:'America/Chicago'},body);
 expect(result).toContain('2:50 PM CDT');
 expect(result).not.toContain('GMT+0000');
 expect(result).toContain('Reply Y to confirm, N to cancel, R to request a reschedule.');
});
it.each([
 'Please arrive 15 minutes early. Call our team if you need assistance.',
 'Reminder: Session on Wed, Oct 28, 2026, 1:50 PM MDT. Reply Y to confirm, N to cancel, R to request a reschedule.',
 'Custom reminder: Wed Oct 28 2026 19:50:00 GMT+0000 (Coordinated Universal Time). Please call us.'
])('preserves custom templates and already formatted messages', body=>{
 expect(formatQueuedSessionMessage({startAt:'2026-10-28 19:50:00',sourceTimezone:'America/Denver'},body)).toBe(body);
});
