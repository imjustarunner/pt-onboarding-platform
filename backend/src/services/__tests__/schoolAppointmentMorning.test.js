import { beforeEach, expect, it, vi } from 'vitest';
import { schoolAppointmentReminderWindow } from '../../utils/schoolAppointmentReminder.js';

const m = vi.hoisted(() => ({ execute: vi.fn(), get: vi.fn(), findSource: vi.fn(), sms: vi.fn() }));
vi.mock('../auricwell/repository.js', () => ({ pool: { execute: m.execute }, seal: value => value,
  open: value => value, list: vi.fn(), get: m.get, findSource: m.findSource,
  create: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock('../auricwell/clinical.js', () => ({ patientAccess: vi.fn() }));
vi.mock('../auricwell/platformIntegrations.js', () => ({ platformIntegrations: vi.fn() }));
vi.mock('../auricwell/appointmentVideo.js', () => ({ ensureAppointmentVideo: vi.fn(), clientVideoLink: vi.fn(),
  appointmentVersion: appointment => `${appointment.id}:${appointment.data.start}`,
  requireTelehealthConsent: vi.fn(), retireUnusedSessionRooms: vi.fn() }));
vi.mock('../auricwell/clientMessaging.js', () => ({ queuePatientSms: m.sms, patientSmsCategoryEnabled: vi.fn(),
  clientSmsPreferences: vi.fn(), saveClientSmsPreferences: vi.fn() }));
import { reminderKinds, deliverAppointment, deliveryKey } from '../auricwell/sessionReminders.js';

const school = { id: 'appointment', patientId: 'patient', data: { start: '2026-11-05T17:00:00Z',
  end: '2026-11-05T18:00:00Z', status: 'scheduled', serviceSetting: 'school', providerAccountId: 'provider' } };
const ctx = { practiceId: 'practice', practiceName: 'Care team', settings: {
  phiActivatedAt: '2026-01-01T00:00:00Z', timezone: 'America/Denver' } };
beforeEach(() => {
  vi.clearAllMocks();
  m.get.mockImplementation(async (_ctx, kind) => kind === 'patient'
    ? { id: 'patient', data: { email: 'family@example.test' } } : school);
  m.findSource.mockResolvedValue(null);
  m.execute.mockResolvedValue([{ affectedRows: 1 }]);
});

it.each([
  ['2026-10-28T16:00:00Z', '2026-10-28T13:00:00.000Z'],
  ['2026-11-05T17:00:00Z', '2026-11-05T14:00:00.000Z'],
  ['2026-11-05T13:00:00Z', '2026-11-05T12:30:00.000Z']
])('schedules a local school morning across DST and early visits (%s)', (startAt, expected) => {
  expect(schoolAppointmentReminderWindow({ startAt, sourceTimezone: 'America/Denver' }).scheduledAt.toISOString()).toBe(expected);
});

it('does not queue school confirmation, day-before or afternoon notices', () => {
  expect(reminderKinds(school, Date.parse('2026-11-04T14:00:00Z'))).toEqual([]);
  expect(reminderKinds(school, Date.parse('2026-11-05T13:59:00Z'))).toEqual([]);
  expect(reminderKinds(school, Date.parse('2026-11-05T14:00:00Z'))).toEqual(['school_morning']);
  const afternoon = { ...school, data: { ...school.data, start: '2026-11-05T22:00:00Z' } };
  expect(reminderKinds(afternoon, Date.parse('2026-11-05T19:00:00Z'))).toEqual([]);
});

it('keeps the regular appointment cadence', () => {
  const office = { ...school, data: { ...school.data, serviceSetting: 'office' } };
  expect(reminderKinds(office, Date.parse('2026-11-03T14:00:00Z'))).toEqual(['confirmation']);
  expect(reminderKinds(office, Date.parse('2026-11-05T14:00:00Z'))).toEqual(['one_day']);
  expect(reminderKinds(office, Date.parse('2026-11-05T16:30:00Z'))).toEqual(['one_hour']);
});

it('keeps one school delivery identity through time changes on the same school day', () => {
  const changed = { ...school, data: { ...school.data, start: '2026-11-05T18:00:00Z', providerAccountId: 'other-provider' } };
  expect(deliveryKey(school, 'school_morning', 'email', 'family@example.test', null, 'America/Denver'))
    .toBe(deliveryKey(changed, 'school_morning', 'email', 'family@example.test', null, 'America/Denver'));
  const tomorrow = { ...school, data: { ...school.data, start: '2026-11-06T18:00:00Z' } };
  expect(deliveryKey(school, 'school_morning', 'email', 'family@example.test', null, 'America/Denver'))
    .not.toBe(deliveryKey(tomorrow, 'school_morning', 'email', 'family@example.test', null, 'America/Denver'));
});

it('uses school morning copy and one stable queue key without a confirm prompt', async () => {
  const email = vi.fn(async () => ({ id: 'email' }));
  await deliverAppointment(ctx, school, { emailReminders: true }, { now: Date.parse('2026-11-05T14:00:00Z'), sendEmail: email });
  expect(m.sms).toHaveBeenCalledWith(ctx, 'patient', expect.objectContaining({ category: 'reminders',
    key: expect.stringContaining('school_morning'), body: expect.stringContaining('Reply N to cancel') }));
  expect(m.sms.mock.calls[0][2].body).not.toContain('Reply Y');
  expect(m.sms.mock.calls[0][2].expiresAt).toBe(Date.parse(school.data.start));
  expect(email.mock.calls[0][2]).toContain('dependent will be seen today at school');
});

it('never prepares a native school delivery outside its morning window', async () => {
  await deliverAppointment(ctx, school, { emailReminders: true }, { now: Date.parse('2026-11-04T14:00:00Z') });
  expect(m.get).not.toHaveBeenCalled(); expect(m.sms).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
});
