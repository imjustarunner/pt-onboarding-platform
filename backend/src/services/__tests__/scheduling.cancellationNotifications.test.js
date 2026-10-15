import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../sessionNotification.service.js', () => ({ loadClientConsent: vi.fn(), getClientPreferences: vi.fn(), getTenantSettings: vi.fn() }));
vi.mock('../scheduleNotificationEmail.service.js', () => ({ sendScheduleNotificationEmail: vi.fn() }));
vi.mock('../appointmentReminder.service.js', () => ({ logCommunication: vi.fn() }));
vi.mock('../smsCompliance.service.js', () => ({ resolveRegisteredSmsSender: vi.fn() }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: vi.fn() } }));
import { buildCancellationNotification, cancellationClientDetails, createCancellationNotificationService, isCanceledAppointmentStatus } from '../appointmentCancellationNotification.service.js';

const facts = { eventType: 'canceled', clientFacingReason: 'Your provider is unavailable due to illness.',
  followUpAction: 'client_contact_support', additionalComments: 'PRIVATE clinical note', reasonOther: 'PRIVATE internal reason' };
let service, db, rows, appointments, consent, preferences, sendEmail, sendSms, audit, log, tenantSettings;
beforeEach(() => {
  rows = [];
  db = { execute: vi.fn(async (sql, args = []) => {
    if (sql.startsWith('INSERT IGNORE')) {
      const [appointment_id, agency_id, client_id, channel, notification_json, created_by_user_id] = args;
      if (!rows.some(r => r.appointment_id === appointment_id && r.client_id === client_id && r.channel === channel))
        rows.push({ id: rows.length + 1, appointment_id, agency_id, client_id, channel, notification_json, created_by_user_id, delivery_status: 'pending' });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE appointment_cancellation_deliveries SET delivery_status='sending'")) {
      const row = rows.find(r => r.id === args[0] && r.delivery_status === 'pending');
      if (row) row.delivery_status = 'sending';
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.startsWith("UPDATE appointment_cancellation_deliveries SET delivery_status='pending'")) {
      const row = rows.find(r => r.id === args[0] && r.appointment_id === args[1] && ['failed', 'skipped'].includes(r.delivery_status));
      if (row) row.delivery_status = 'pending';
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.startsWith('UPDATE appointment_cancellation_deliveries')) {
      Object.assign(rows.find(r => r.id === args[5]), { delivery_status: args[0], error_message: args[1], external_message_id: args[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT *')) return [[rows.find(r => r.id === args[0])]];
    if (sql.startsWith('SELECT id FROM')) return [rows.filter(r => r.delivery_status === 'pending' && (!args[0] || r.appointment_id === args[0]))];
    if (sql.startsWith('SELECT id,client_id')) return [rows.filter(r => r.appointment_id === args[0])];
    throw new Error(sql);
  }) };
  appointments = { findById: vi.fn(async () => ({ id: 1, agencyId: 2, startAt: '2026-11-03 22:00:00', sourceTimezone: 'America/Denver', status: 'canceled_by_provider' })),
    listParticipants: vi.fn(async () => [{ clientId: 8 }, { clientId: 9 }, { clientId: 8 }]) };
  consent = vi.fn(async id => ({ email: true, emailAddress: `client${id}@example.test`, sms: true, phoneNumber: '+17195550123' }));
  preferences = vi.fn(async () => ({ isDefault: true, channels: { email: true, sms: false } }));
  tenantSettings = vi.fn(async () => ({ channelsEnabled: { sms: false }, changeNotify: { channels: ['email'] } }));
  sendEmail = vi.fn(async () => ({ id: 'email-accepted' })); sendSms = vi.fn(async () => ({ sid: 'sms-accepted' }));
  audit = { create: vi.fn(async () => ({ id: 100 })), updateDeliveryStatus: vi.fn(async () => ({})) }; log = vi.fn();
  service = createCancellationNotificationService({ database: db, appointments, consent, preferences, tenantSettings,
    sendEmail, sendSms, smsSender: vi.fn(async () => '+17195550100'), communications: audit, log,
    encrypt: value => JSON.stringify({ _enc: true, cipher: Buffer.from(value).toString('base64') }),
    decrypt: value => { const parsed = JSON.parse(value); return parsed._enc ? Buffer.from(parsed.cipher, 'base64').toString() : value; } });
});

describe('client cancellation content', () => {
  it('uses the reviewed public reason and follow-up, never internal details', async () => {
    const message = buildCancellationNotification(await appointments.findById(), facts);
    expect(message.text).toContain('Tuesday, November 3, 2026'); expect(message.text).toContain('3:00 PM');
    expect(message.text).toContain('Reason: Your provider is unavailable'); expect(message.text).toContain('contact our support team');
    expect(JSON.stringify(message)).not.toContain('PRIVATE');
  });
  it('escapes user-entered HTML in the public reason', async () => {
    const message = buildCancellationNotification(await appointments.findById(), { ...facts, clientFacingReason: '<img src=x onerror=alert(1)>' });
    expect(message.html).toContain('&lt;img'); expect(message.html).not.toContain('<img');
  });
  it('requires an explicit public reason and a real replacement before promising one', () => {
    expect(() => cancellationClientDetails({ reasonOther: 'private' })).toThrow('share with the client');
    expect(() => cancellationClientDetails({ ...facts, followUpAction: 'replacement_booked' })).toThrow('Link the replacement');
    expect(() => cancellationClientDetails({ ...facts, followUpAction: 'unknown' })).toThrow('follow-up');
  });
});
describe('durable cancellation delivery', () => {
  it('sends once per client, stores client and session copies, and retries without duplicate messages', async () => {
    expect(await service.notify(1, facts, 6)).toMatchObject({ sent: 2, failed: 0, held: 0 });
    await service.notify(1, facts, 6);
    expect(sendEmail).toHaveBeenCalledTimes(2); expect(audit.create).toHaveBeenCalledTimes(2); expect(log).toHaveBeenCalledTimes(2);
    expect(rows[0].notification_json).not.toContain(facts.clientFacingReason);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ clientId: 8, existingCommunicationId: 100, templateType: 'session_cancellation' });
    expect(log.mock.calls[0][0].metadata).toMatchObject({ clientId: 8, deliveryStatus: 'sent', body: expect.stringContaining('Reason:') });
  });
  it('holds an uncertain email failure for review instead of reporting delivery or retrying', async () => {
    sendEmail.mockRejectedValue(new Error('Transport disconnected'));
    expect(await service.notify(1, facts)).toMatchObject({ sent: 0, held: 2 });
    await service.notify(1, facts); expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0].metadata.deliveryStatus).toBe('review');
  });
  it.each([{ queued: true, id: 'queue' }, { redirected: true, id: 'test' }, { pendingApproval: true, id: 'approval' }, { skipped: true }])('does not label a held transport result as sent (%j)', async result => {
    sendEmail.mockResolvedValue(result);
    expect(await service.notify(1, facts)).toMatchObject({ sent: 0, held: 2 });
  });
  it('records opted-out or missing email recipients for staff follow-up', async () => {
    consent.mockResolvedValue({ email: false, emailAddress: 'client@example.test' });
    expect(await service.notify(1, facts)).toMatchObject({ sent: 0, skipped: 2 }); expect(sendEmail).not.toHaveBeenCalled();
    expect(audit.updateDeliveryStatus).toHaveBeenCalledWith(100, 'skipped', null, null, expect.stringContaining('follow up'));
  });
  it('sends SMS only when enabled for changes and recipient consent is current', async () => {
    tenantSettings.mockResolvedValue({ channelsEnabled: { sms: true }, changeNotify: { channels: ['email', 'sms'] } });
    consent.mockImplementation(async id => ({ email: true, emailAddress: `c${id}@example.test`, sms: id === 8, phoneNumber: '+17195550123' }));
    expect(await service.notify(1, facts)).toMatchObject({ sent: 3, skipped: 1 }); expect(sendSms).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'reminders', clientId: 8, body: expect.stringContaining('Reason:') }));
  });
  it('respects guardian-specific channel opt-outs even when general consent exists', async () => {
    preferences.mockResolvedValue({ isDefault: false, channels: { email: false, sms: false } });
    expect(await service.notify(1, facts)).toMatchObject({ skipped: 2 }); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('does not deliver to a client removed from a session before the worker runs', async () => {
    appointments.listParticipants.mockResolvedValueOnce([{ clientId: 8 }]).mockResolvedValue([]);
    expect(await service.notify(1, facts)).toMatchObject({ sent: 0, skipped: 1 }); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('never treats cancellation_requested as a canceled appointment', async () => {
    expect(isCanceledAppointmentStatus('cancellation_requested')).toBe(false);
    appointments.findById.mockResolvedValue({ id: 1, agencyId: 2, startAt: '2026-11-03 22:00:00', status: 'cancellation_requested' });
    expect(await service.notify(1, facts)).toMatchObject({ sent: 0, skipped: 2 }); expect(sendEmail).not.toHaveBeenCalled();
  });
  it('does not send cancellation messages for void or no-show documentation', async () => {
    expect(await service.notify(1, { ...facts, eventType: 'no_show' })).toBeNull(); expect(db.execute).not.toHaveBeenCalled();
  });
  it('rechecks current consent when staff retry a previously skipped notification', async () => {
    consent.mockResolvedValue({ email: false, emailAddress: 'client@example.test' });
    await service.notify(1, facts);
    consent.mockResolvedValue({ email: true, emailAddress: 'client@example.test' });
    expect(await service.retry(1, 1)).toMatchObject({ sent: 1, skipped: 1 }); expect(sendEmail).toHaveBeenCalledOnce();
  });
  it('rejects retries for another appointment or an uncertain delivery', async () => {
    sendEmail.mockRejectedValue(new Error('Transport disconnected')); await service.notify(1, facts);
    await expect(service.retry(1, 1)).rejects.toMatchObject({ status: 409 });
    await expect(service.retry(2, 1)).rejects.toMatchObject({ status: 409 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
