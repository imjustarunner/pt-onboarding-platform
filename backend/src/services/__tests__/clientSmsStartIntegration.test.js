import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../intakeCommunicationChoices.service.js', () => ({ latestIntakeCommunicationChoices: vi.fn(), INTAKE_COMMUNICATION_VERSION: 'intake-v1' }));
vi.mock('../sessionPreferenceSchedule.service.js', () => ({ refreshClientSessionNotifications: vi.fn() }));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { latestIntakeCommunicationChoices } from '../intakeCommunicationChoices.service.js';
import { refreshClientSessionNotifications } from '../sessionPreferenceSchedule.service.js';
import { processSmsKeyword, prepareSmsDelivery, recordedReminderConsent } from '../smsCompliance.service.js';
import { getClientPreferences, putClientPreferences } from '../sessionNotification.service.js';
import { familyNotificationDeliveryGate } from '../familyNotificationChoices.service.js';
import { buildSmsConsentDisclosure } from '../../utils/smsConsentDisclosure.js';

const at = Date.now() - 10000, phone = '+17195550101', from = '+17195550100';
const registration = { provider: 'notifyre', allowRestart: true, approved: true, numberLinked: true, keywordOwner: 'application',
  brandId: 'brand', campaignId: 'tisi', resellerId: 'reseller', brandName: 'Inner Strength', legalName: 'Inner Strength',
  supportContact: 'support@example.test', website: 'https://example.test', privacyUrl: 'https://example.test/privacy',
  termsUrl: 'https://example.test/terms', evidenceUrl: 'https://example.test/proof', purposes: ['care', 'reminders'] };
const sender = { id: 4, agency_id: 377, phone_number: from, is_active: 1, status: 'active',
  campaign_id: 'tisi', registration_json: registration };
let state, permissions, events, active, preference, connection, failPurpose, familyChoices;
const key = (...values) => JSON.stringify(values);
const command = (body, receivedAt = at, messageId = `${body}-${receivedAt}`) => processSmsKeyword({ from: phone, to: from, body, messageId, receivedAt, sendReply: vi.fn() });
const delivery = (purpose = 'care') => prepareSmsDelivery({ to: phone, from, purpose, body: 'Synthetic message', clientId: 42 });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NOTIFYRE_CLIENT_CAMPAIGNS_JSON', JSON.stringify({ 377: { brandId: 'brand', campaignId: 'tisi' } }));
  state = { blocked: false, command_at: 0 }; permissions = new Map(); events = new Set();
  active = true; preference = null; failPurpose = null; familyChoices = [];
  latestIntakeCommunicationChoices.mockResolvedValue(null);
  ClientGuardian.listForClient.mockImplementation(async () => active ? [{ guardian_user_id: 1449, phone,
    access_enabled: 1, is_active: 1, permissions_json: {}, role: 'client_guardian' }] : []);
  refreshClientSessionNotifications.mockResolvedValue({ appointmentsUpdated: 1 });
  let snapshot;
  connection = { execute: (...args) => pool.execute(...args),
    beginTransaction: vi.fn(async () => { snapshot = structuredClone({ state, permissions, events }); }),
    commit: vi.fn(), rollback: vi.fn(async () => { ({ state, permissions, events } = snapshot); }), release: vi.fn() };
  pool.getConnection.mockResolvedValue(connection);
  pool.execute.mockImplementation(async (sql, args = []) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('FROM twilio_numbers')) return [[sender]];
    if (sql.includes('SELECT blocked')) return [[state]];
    if (sql.startsWith('UPDATE auricwell_sms_phone_state')) { state = { blocked: args[0], command_at: args[1] }; return [{ affectedRows: 1 }]; }
    if (sql.includes('INSERT IGNORE INTO sms_permission_events')) {
      const k = key(...args.slice(0, 3), args.at(-1));
      if (events.has(k)) return [{ affectedRows: 0 }];
      events.add(k); return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO sms_recipient_permissions')) {
      const [scope, recipient, purpose] = args;
      if (purpose === failPurpose) throw new Error('Simulated database interruption');
      const literalStatus = sql.includes("VALUES (?,?,?,'opted_in'");
      permissions.set(key(scope, recipient, purpose), { status: literalStatus ? 'opted_in' : args[3],
        evidence_json: JSON.parse(args[literalStatus ? 3 : 4]), updated_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM sms_recipient_permissions')) {
      let scope = args[0], recipient = args[1], purpose = args[2];
      if (sql.includes("purpose = 'suppression'")) {
        purpose = 'suppression'; if (sql.includes('scope_key IN')) recipient = args[2];
      }
      if (sql.includes("purpose = 'reminders'")) purpose = 'reminders';
      const row = permissions.get(key(scope, recipient, purpose));
      const status = sql.includes("status = 'opted_out'") ? 'opted_out' : sql.includes("status = 'opted_in'") ? 'opted_in' : null;
      return [[row].filter(r => r && (!status || r.status === status))];
    }
    if (sql.includes('FROM family_notification_choices')) return [familyChoices];
    if (sql.includes('FROM client_session_notification_preferences')) return [[preference].filter(Boolean)];
    if (sql.includes('INSERT INTO client_session_notification_preferences')) {
      preference = { agency_id: args[0], client_id: args[1], guardian_user_id: args[2], channels_json: JSON.parse(args[3]), updated_at: new Date() };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM clients c')) return [active ? [{ id: 42, agency_id: 377, contact_phone: phone,
      phone, status: 'ACTIVE', session_sms_opt_in: 0, session_email_opt_in: 1 }] : []];
    return [[]];
  });
});

it('enrolls an existing guardian in both categories and exposes the reminder opt-in', async () => {
  await command('START');
  await expect(delivery()).resolves.toMatchObject({ purpose: 'care' });
  await expect(delivery('reminders')).resolves.toMatchObject({ purpose: 'reminders' });
  expect(await recordedReminderConsent(377, phone, { clientId: 42, recipientUserId: 1449 })).toMatchObject({ source: 'inbound_start' });
  expect((await getClientPreferences(377, 42, 1449)).channels.sms).toBe(true);
  expect(refreshClientSessionNotifications).toHaveBeenCalledWith(377, 42, 1449);
});
it('retains consent before enrollment and applies it once the relationship exists without another START', async () => {
  active = false; await command('START');
  await expect(delivery()).rejects.toMatchObject({ code: 'sms_start_not_active' });
  expect(refreshClientSessionNotifications).not.toHaveBeenCalled();
  active = true;
  await expect(delivery()).resolves.toMatchObject({ purpose: 'care' });
  expect((await getClientPreferences(377, 42, 1449)).channels.sms).toBe(true);
});
it('lets fresh START override an earlier reminder toggle, then honors the next explicit Save', async () => {
  preference = { agency_id: 377, client_id: 42, guardian_user_id: 1449, channels_json: { sms: false, email: true }, updated_at: new Date(at - 1000) };
  await command('START');
  expect((await getClientPreferences(377, 42, 1449)).channels.sms).toBe(true);
  await putClientPreferences(377, 42, { channels: { sms: false, email: true } }, 1449);
  expect((await getClientPreferences(377, 42, 1449)).channels.sms).toBe(false);
  await expect(delivery('reminders')).rejects.toMatchObject({ code: 'sms_start_not_active' });
  await expect(delivery()).resolves.toMatchObject({ purpose: 'care' });
});
it('a later intake No suppresses only the selected category at the actual sending boundary', async () => {
  await command('START');
  latestIntakeCommunicationChoices.mockResolvedValue({ guardianUserId: 1449, smsPreference: 'no', providerTextingOptIn: 'yes', signedAt: new Date(at + 1000).toISOString() });
  await expect(delivery('reminders')).rejects.toMatchObject({ code: 'sms_start_not_active' });
  await expect(delivery()).resolves.toMatchObject({ purpose: 'care' });
});
it('STOP blocks both, a delayed START stays blocked, and a newer START reopens both', async () => {
  await command('START');
  await command('STOP', at + 2000);
  await command('START', at + 1000);
  await expect(delivery()).rejects.toMatchObject({ code: 'sms_opted_out' });
  await expect(delivery('reminders')).rejects.toMatchObject({ code: 'sms_opted_out' });
  await command('START', at + 3000);
  await expect(delivery()).resolves.toMatchObject({ purpose: 'care' });
  await expect(delivery('reminders')).resolves.toMatchObject({ purpose: 'reminders' });
});
it('rolls back account restart and every category grant together on a partial database failure', async () => {
  state = { blocked: true, command_at: at - 1000 }; failPurpose = 'care';
  await expect(command('START')).rejects.toThrow('Simulated database interruption');
  expect(state.blocked).toBe(true); expect(permissions.size).toBe(0); expect(events.size).toBe(0);
  expect(connection.rollback).toHaveBeenCalledOnce(); expect(connection.commit).not.toHaveBeenCalled();
  expect(refreshClientSessionNotifications).not.toHaveBeenCalled();
});
it('retries reminder reconciliation after a failure without adding consent events or resending a confirmation', async () => {
  refreshClientSessionNotifications.mockRejectedValueOnce(new Error('Scheduling busy'));
  await expect(command('START')).rejects.toThrow('Scheduling busy');
  const eventCount = events.size;
  await command('START');
  expect(events.size).toBe(eventCount); expect(refreshClientSessionNotifications).toHaveBeenCalledTimes(2);
});
it('applies START to older family scheduling choices while respecting newer choices and other categories', async () => {
  await command('START');
  familyChoices = [{ choices_json: { appointments: 'off', billing: 'off' }, updated_at: new Date(at - 1000) }];
  const scope = { agencyId: 377, clientId: 42, to: phone, channel: 'sms' };
  expect((await familyNotificationDeliveryGate({ ...scope, notificationCategory: 'appointments' })).allowed).toBe(true);
  expect((await familyNotificationDeliveryGate({ ...scope, notificationCategory: 'billing' })).allowed).toBe(false);
  familyChoices[0].updated_at = new Date(at + 1000);
  expect((await familyNotificationDeliveryGate({ ...scope, notificationCategory: 'appointments' })).allowed).toBe(false);
});
it('explains fresh START enrollment on new forms and preserves the exact historical disclosure when reviewing it', () => {
  const current = buildSmsConsentDisclosure(registration, { signerRole: 'guardian' });
  expect(current.version).toBe('2026-11-17.1'); expect(current.text).toContain('saved even before enrollment');
  const old = buildSmsConsentDisclosure(registration, { signerRole: 'guardian', version: '2026-10-05.1' });
  expect(old.version).toBe('2026-10-05.1'); expect(old.text).toContain('reactivates existing subscriptions only');
  expect(buildSmsConsentDisclosure({ ...registration, provider: 'vonage' }).text).toContain('reactivates existing subscriptions only');
});
