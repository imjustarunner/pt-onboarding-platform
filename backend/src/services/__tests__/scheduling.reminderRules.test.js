import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {
  findById: async () => ({ id: 68, agencyId: 377, startAt: '2026-11-26 22:00:00', sourceTimezone: 'America/Denver' }),
  listParticipants: async () => []
} }));
vi.mock('../appointmentServiceSetting.service.js', () => ({ resolveAppointmentServiceSetting: async () => ({ isSchool: false }), buildSchoolReminder: vi.fn() }));
import { buildDeliveryPlan } from '../sessionNotification.service.js';
import { dedupeSessionReminders } from '../../../../frontend/src/navigation/sessionReminderRules.js';
beforeEach(() => {
  m.execute.mockImplementation(async sql => sql.includes('platform_session_notification_settings') ? [[{
    channels_json: { email: 'available' }, min_rules_json: [{ channel: 'email', offsetValue: 24, offsetUnit: 'hours' }]
  }]] : [[]]);
});
it('plans one actual 24-hour email delivery when platform and tenant rules coincide', async () => {
  const plan = await buildDeliveryPlan(68);
  expect(plan.deliveries).toHaveLength(1);
  expect(plan.deliveries[0]).toMatchObject({ kind: 'standard_reminder', ruleKey: 'tenant_standard', channel: 'email', offsetMinutes: 1440, isRequired: true });
});
it('keeps distinct channels, recipients and confirmation deliveries while merging duplicate required floors', () => {
  const floor = { kind: 'standard_reminder', channel: 'email', recipientRole: 'client', offsetMinutes: 1440, ruleKey: 'platform:24h', isRequired: true };
  const practice = { ...floor, ruleKey: 'tenant_standard', isRequired: false, messageBody: 'Practice wording' };
  const result = dedupeSessionReminders([floor, practice, { ...practice, channel: 'in_app' }, { ...practice, recipientRole: 'provider' }, { ...practice, kind: 'confirmation', sendImmediately: true }]);
  expect(result).toHaveLength(4); expect(result[0]).toMatchObject({ ruleKey: 'tenant_standard', isRequired: true, messageBody: 'Practice wording' });
});
