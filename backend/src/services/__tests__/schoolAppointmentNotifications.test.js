import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn(), listParticipants: vi.fn(), update: vi.fn(), mapRow: r => r } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../../models/ClientContactAffiliation.model.js', () => ({ default: { listReminderRecipientsForClient: vi.fn() } }));
vi.mock('../intakeCommunicationChoices.service.js', () => ({ latestIntakeCommunicationChoices: vi.fn(), INTAKE_COMMUNICATION_VERSION: 'v2' }));
vi.mock('../appointmentServiceSetting.service.js', () => ({ resolveAppointmentServiceSetting: vi.fn(), buildSchoolReminder: () => 'School visit. No confirmation is needed. Let our team know about absences.' }));
vi.mock('../smsCompliance.service.js', () => ({ resolveRegisteredSmsSender: vi.fn(), recordedReminderConsent: vi.fn() }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: vi.fn() } }));
vi.mock('../email.service.js', () => ({ default: { isConfigured: () => false } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('../notificationDispatcher.service.js', () => ({ default: { createNotificationAndDispatch: vi.fn() } }));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import Guardians from '../../models/ClientGuardian.model.js';
import Contacts from '../../models/ClientContactAffiliation.model.js';
import { latestIntakeCommunicationChoices } from '../intakeCommunicationChoices.service.js';
import { resolveAppointmentServiceSetting } from '../appointmentServiceSetting.service.js';
import { resolveRegisteredSmsSender, recordedReminderConsent } from '../smsCompliance.service.js';
import Vonage from '../vonage.service.js';
import { sendNotificationEmail } from '../unifiedEmail/unifiedEmailSender.service.js';
import { buildDeliveryPlan, processDueSessionNotifications, applyConfirmReply, putClientPreferences } from '../sessionNotification.service.js';
import { applyAppointmentReply, resolveAppointmentForClientReply } from '../appointmentReply.service.js';
let preferences, due, choice, client, lock;
beforeEach(() => {
  vi.resetAllMocks(); preferences = []; due = []; choice = null;
  client = { session_email_opt_in: 1, session_sms_opt_in: 1, guardian_phone: '+17195550100', guardian_email: 'guardian@example.test' };
  Appointment.findById.mockResolvedValue({ id: 12, agencyId: 2, providerUserId: 8, startAt: '2026-11-01 16:00:00', status: 'scheduled' });
  Appointment.listParticipants.mockResolvedValue([{ clientId: 4, receivesReminders: true }]);
  resolveAppointmentServiceSetting.mockResolvedValue({ isSchool: true });
  Guardians.listForClient.mockResolvedValue([]); Contacts.listReminderRecipientsForClient.mockResolvedValue([]);
  latestIntakeCommunicationChoices.mockImplementation(async () => choice);
  recordedReminderConsent.mockResolvedValue(null); resolveRegisteredSmsSender.mockResolvedValue('+17195550199'); Vonage.sendSms.mockResolvedValue({ messageId: 'test' });
  sendNotificationEmail.mockResolvedValue({ id: 'email' });
  lock = { execute: vi.fn(async sql => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : sql.includes('SELECT status') ? [[{ status: 'pending' }]] : [[]]), release: vi.fn() };
  pool.getConnection.mockResolvedValue(lock);
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM platform_session_notification_settings')) return [[]];
    if (sql.includes('FROM agency_session_notification_settings')) return [[{ channels_enabled_json: { email: true, sms: true },
      booking_confirmation_json: { enabled: true, channels: ['sms'], requireResponse: true, message: 'Reply Y to confirm at our office' },
      standard_reminder_json: { enabled: true, required: true, channels: ['sms', 'email'], message: 'Reply N to cancel at the office' } }]];
    if (sql.includes('FROM client_session_notification_preferences')) return [preferences];
    if (sql.includes('FROM clients WHERE')) return [[client]];
    if (sql.includes('SELECT * FROM appointment_reminders')) return [due];
    if (sql.includes('FROM appointment_change_notification_queue')) return [[]];
    return [{ affectedRows: 1, insertId: 3 }];
  });
});
it('school plans replace even custom confirmation templates and deduplicate same-time school notices', async () => {
  const plan = await buildDeliveryPlan(12);
  expect(plan.deliveries.length).toBeGreaterThan(0);
  expect(plan.deliveries.every(d => !d.requiresConfirmation && d.messageBody.includes('No confirmation'))).toBe(true);
  expect(plan.deliveries.filter(d => d.channel === 'email' && d.offsetMinutes === 1440)).toHaveLength(1);
});
it('recipient No choices beat mandatory email and SMS reminder rules', async () => {
  preferences = [{ agency_id: 2, client_id: 4, channels_json: { email: false, sms: false } }];
  expect((await buildDeliveryPlan(12)).deliveries).toEqual([]);
});
it('an intake No blocks an older imported Yes flag', async () => {
  choice = { smsPreference: 'no', emailPreference: 'no' };
  expect((await buildDeliveryPlan(12)).deliveries).toEqual([]);
});
it('rechecks opt-out after scheduling', async () => {
  due = [{ id: 5, appointment_id: 12, channel: 'sms', kind: 'reminder', is_required: 1 }];
  preferences = [{ agency_id: 2, client_id: 4, channels_json: { sms: false } }];
  expect((await processDueSessionNotifications()).skipped).toBe(1);
  expect(Vonage.sendSms).not.toHaveBeenCalled(); expect(lock.release).toHaveBeenCalled();
});
it('corrects already queued school messages and uses only the registered reminder sender', async () => {
  due = [{ id: 5, appointment_id: 12, channel: 'sms', kind: 'confirmation', message_body: 'Reply Y to confirm in our office', requires_confirmation: 1 }];
  await processDueSessionNotifications();
  expect(resolveRegisteredSmsSender).toHaveBeenCalledWith({ agencyId: 2, purpose: 'reminders' });
  expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: '+17195550100', from: '+17195550199', body: expect.stringContaining('No confirmation') }));
});
it('keeps delivery blocked when no approved number is linked', async () => {
  due = [{ id: 5, appointment_id: 12, channel: 'sms' }]; resolveRegisteredSmsSender.mockResolvedValue(null);
  expect((await processDueSessionNotifications()).skipped).toBe(1);
  expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('cannot bypass the central recipient permission or STOP gate', async () => {
  due = [{ id: 5, appointment_id: 12, channel: 'sms' }];
  Vonage.sendSms.mockRejectedValue(new Error('Recorded recipient consent required'));
  expect((await processDueSessionNotifications()).failed).toBe(1);
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes("SET status = 'sent'"))).toBe(false);
});
it.each(['Y', 'N', 'R', 'Absent today'])('records school reply %s for review without changing the appointment or fee', async rawBody => {
  const result = await applyAppointmentReply({ appointmentId: 12, agencyId: 2, clientId: 4, rawBody });
  expect(result.status).toBe('pending_review'); expect(result.ackMessage).toContain('No confirmation');
  expect(Appointment.update).not.toHaveBeenCalled();
});
it('does not start a confirmation follow-up cadence for school portal replies', async () => {
  await applyConfirmReply(12); expect(Appointment.update).not.toHaveBeenCalled();
});
it('does not select an arbitrary appointment for an ambiguous one-letter reply', async () => {
  pool.execute.mockResolvedValue([[{ id: 1 }, { id: 2 }]]);
  expect(await resolveAppointmentForClientReply({ agencyId: 2, clientId: 4 })).toBeNull();
});
it('guardian preferences cannot overwrite another recipient’s global flags', async () => {
  await putClientPreferences(2, 4, { channels: { sms: false, email: false } }, 28);
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('UPDATE clients SET'))).toBe(false);
});
it('overlapping reminder workers do not send a row twice', async () => {
  due = [{ id: 5, appointment_id: 12, channel: 'sms' }];
  lock.execute.mockResolvedValue([[{ acquired: 0 }]]);
  await processDueSessionNotifications(); expect(Vonage.sendSms).not.toHaveBeenCalled();
});

it('a later signed enrollment can supersede intake No without overriding portal opt-out', async () => {
  choice = { smsPreference: 'no', emailPreference: 'no', signedAt: '2026-10-01T00:00:00Z' };
  recordedReminderConsent.mockResolvedValue({ collectedAt: '2026-10-06T00:00:00Z' });
  expect((await buildDeliveryPlan(12)).deliveries.some(d => d.channel === 'sms')).toBe(true);
  preferences = [{ agency_id: 2, client_id: 4, channels_json: { sms: false } }];
  expect((await buildDeliveryPlan(12)).deliveries).toEqual([]);
});
