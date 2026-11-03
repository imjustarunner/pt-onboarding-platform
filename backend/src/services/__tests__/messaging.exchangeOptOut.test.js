import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../contactReminderSmsConsent.service.js', () => ({ applyContactReminderSmsKeyword: vi.fn() }));
import pool from '../../config/database.js';
import { prepareSmsDelivery, processSmsKeyword } from '../smsCompliance.service.js';
import { exchangeSmsOptedOut, setExchangeSmsPreference } from '../exchangeSmsPreference.service.js';
import { phoneFingerprint, withExchangeSmsOptOut } from '../../utils/staffCommunicationChoices.js';

const phone = '+13035550101';
const registration = {
  provider: 'vonage', brandId: 'B123', campaignId: 'C123', resellerId: 'R123',
  brandName: 'ITSCO', legalName: 'ITSCO, LLC', supportContact: 'support@example.com',
  website: 'https://example.com', privacyUrl: 'https://example.com/privacy',
  termsUrl: 'https://example.com/terms', evidenceUrl: 'https://example.com/evidence',
  purposes: ['workforce', 'polling'], keywordOwner: 'vonage', approved: true, numberLinked: true, allowRestart: true
};
const key = (scope, phone, purpose) => JSON.stringify([scope, phone, purpose]);
let sender, permissions, events, db;
const sms = () => ({ from: sender.phone_number, to: phone, purpose: 'workforce', staffNotificationKind: 'exchangeMatches', body: 'A possible match is available. Sign in to review.' });
const command = (body = 'NOEXCHANGE', messageId = 'exchange-stop-1') => ({ from: phone, to: sender.phone_number, body, messageId });
beforeEach(() => {
  vi.resetAllMocks();
  sender = { id: 3, agency_id: 2, phone_number: '+13035550100', is_active: 1, status: 'active',
    campaign_id: 'C123', registration_json: registration, agency_name: 'ITSCO' };
  permissions = new Map(); events = new Set();
  for (const purpose of ['workforce', 'polling']) permissions.set(key('campaign:C123', phone, purpose), { status: 'opted_in' });
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, args) => {
    if (sql.trim().startsWith('SELECT')) return pool.execute(sql, args);
    if (sql.includes('INTO sms_permission_events')) {
      const event = key(args[0], args[1], `${args[2]}:${args[5]}`);
      if (args[5] && events.has(event)) {
        if (sql.includes('INSERT IGNORE')) return [{ affectedRows: 0 }];
        throw Object.assign(new Error('Duplicate event'), {code:'ER_DUP_ENTRY'});
      }
      if (args[5]) events.add(event);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO sms_recipient_permissions')) permissions.set(key(...args.slice(0, 3)), { status: args[3], evidence_json: args[4] });
    return [{ affectedRows: 1 }];
  }) };
  pool.getConnection.mockResolvedValue(db);
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM twilio_numbers')) return [[sender]];
    if (sql.includes('SELECT status FROM sms_recipient_permissions')) return [[permissions.get(key(...args.slice(0, 3)))].filter(Boolean)];
    if (sql.includes("purpose = 'suppression'")) {
      const blocked = args.length === 3
        ? [args[0], args[1]].some(scope => permissions.get(key(scope, args[2], 'suppression'))?.status === 'opted_out')
        : permissions.get(key(args[0], args[1], 'suppression'))?.status === 'opted_in';
      return [blocked ? [{ found: 1 }] : []];
    }
    if (sql.includes('AS choices')) return [[{ choices: { phoneHash: phoneFingerprint(phone), choices: { exchangeMatches: true, messageAlerts: true, notifications: true, polling: true } } }]];
    if (sql.includes('SELECT evidence_json FROM sms_recipient_permissions')) {
      const permission = permissions.get(key(...args.slice(0, 3)));
      return [permission?.status === 'opted_in' ? [permission] : []];
    }
    return [[]];
  });
});

it('turns off Exchange only, confirms once even with carrier-owned STOP, and preserves other choices', async () => {
  const originalGrants = [...permissions];
  const sendReply = vi.fn(options => prepareSmsDelivery(options));
  expect(await processSmsKeyword({ ...command('  noExchange  '), sendReply })).toBe(true);
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone: '(303) 555-0101' })).toBe(true);
  expect(sendReply).toHaveBeenCalledOnce();
  expect(sendReply.mock.calls[0][0].body).toContain('Email and other text choices are unchanged');
  expect([...permissions].filter(([k]) => !k.includes('exchange_matches'))).toEqual(originalGrants);
  expect(db.execute.mock.calls.every(([sql]) => !/user_preferences|user_notification_type_preferences/.test(sql))).toBe(true);
  await expect(prepareSmsDelivery(sms())).rejects.toMatchObject({ code: 'sms_exchange_opted_out' });
  for (const kind of ['messageAlerts', 'notifications']) await expect(prepareSmsDelivery({ ...sms(), staffNotificationKind: kind })).resolves.toMatchObject({ to: phone });
  await expect(prepareSmsDelivery({ ...sms(), purpose: 'polling' })).resolves.toMatchObject({ to: phone });
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).toHaveBeenCalledOnce();
});

it('blocks queued Exchange texts across agency senders, but not another agency or phone', async () => {
  const queued = sms();
  await processSmsKeyword({ ...command(), sendReply: vi.fn() });
  sender = { ...sender, id: 4, phone_number: '+13035550102', campaign_id: 'C456' };
  await expect(prepareSmsDelivery({ ...queued, from: sender.phone_number })).rejects.toMatchObject({ code: 'sms_exchange_opted_out' });
  expect(await exchangeSmsOptedOut({ agencyId: 99, phone })).toBe(false);
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone: '+13035550103' })).toBe(false);
});

it('restores a previously consented category on category-only START and names its opt-out command', async () => {
  await processSmsKeyword({ ...command(), sendReply: vi.fn() });
  for (const body of ['HELP', 'YES']) await processSmsKeyword({ ...command(body, `reply-${body}`), sendReply: vi.fn() });
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone })).toBe(true);
  const sendReply=vi.fn(options=>prepareSmsDelivery(options));
  await processSmsKeyword({ ...command('START','category-restart'),sendReply });
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone })).toBe(false);
  expect(sendReply).toHaveBeenCalledOnce();
  expect(sendReply.mock.calls[0][0].body).toContain('Turned back on: Client Exchange texts');
  expect(sendReply.mock.calls[0][0].body).toContain('NOEXCHANGE (Client Exchange texts)');
  await expect(prepareSmsDelivery(sms())).resolves.toMatchObject({to:phone});
  await processSmsKeyword({ ...command('START','category-restart'),sendReply });
  expect(sendReply).toHaveBeenCalledOnce();
});

it('uses the ordinary restart after full STOP, without an itemized category confirmation', async () => {
  await processSmsKeyword({ ...command(),sendReply:vi.fn() });
  await processSmsKeyword({ ...command('STOP','global-stop'),sendReply:vi.fn() });
  const sendReply=vi.fn();
  await processSmsKeyword({ ...command('START','global-restart'),sendReply });
  expect(sendReply).not.toHaveBeenCalled(); // Carrier owns the standard START reply.
  expect(await exchangeSmsOptedOut({agencyId:2,phone})).toBe(true);
});

it('saves NOEXCHANGE silently after STOP and keeps the broader suppression intact', async () => {
  permissions.set(key('campaign:C123', phone, 'suppression'), { status: 'opted_out' });
  const sendReply = vi.fn();
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).not.toHaveBeenCalled();
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone })).toBe(true);
  await expect(prepareSmsDelivery({ ...sms(), staffNotificationKind: 'messageAlerts' })).rejects.toMatchObject({ code: 'sms_opted_out' });
});

it('rechecks STOP if it arrives between the opt-out and its confirmation send', async () => {
  const sendReply = vi.fn(async options => {
    permissions.set(key('campaign:C123', phone, 'suppression'), { status: 'opted_out' });
    await expect(prepareSmsDelivery(options)).rejects.toMatchObject({ code: 'sms_opted_out' });
  });
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).toHaveBeenCalledOnce();
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone })).toBe(true);
});

it('allows an intentional signed category change without granting campaign consent or replaying an old decline', async () => {
  await processSmsKeyword({ ...command(), sendReply: vi.fn() });
  await setExchangeSmsPreference({ agencyId: 2, phone, enabled: true, evidence: { source: 'signed_staff_choices', reference: 'new-signature' } });
  const sendReply = vi.fn();
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).not.toHaveBeenCalled();
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone })).toBe(false);
  permissions.delete(key('campaign:C123', phone, 'workforce'));
  await expect(prepareSmsDelivery(sms())).rejects.toMatchObject({ code: 'sms_consent_required' });
});

it('adds the category instruction exactly once at the final send boundary', async () => {
  const outgoing = await prepareSmsDelivery(sms());
  expect(outgoing.body).toContain('Reply NOEXCHANGE to stop Client Exchange texts only.');
  expect(outgoing.body).toContain('Reply STOP to opt out.');
  const alreadyFormatted = await prepareSmsDelivery({ ...sms(), body: withExchangeSmsOptOut(sms().body) });
  expect(alreadyFormatted.body.match(/NOEXCHANGE/g)).toHaveLength(1);
  expect((await prepareSmsDelivery({ ...sms(), staffNotificationKind: 'messageAlerts' })).body).not.toContain('NOEXCHANGE');
});

it('handles an opt-out even without a current staff record or active campaign consent', async () => {
  permissions.clear();
  const sendReply = vi.fn(options => prepareSmsDelivery(options));
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).toHaveBeenCalledOnce();
  expect(await exchangeSmsOptedOut({ agencyId: 2, phone })).toBe(true);
});

it('does not interpret ordinary prose or a clinical reminder reply as a staff category command', async () => {
  expect(await processSmsKeyword({ ...command('What does NOEXCHANGE mean?'), sendReply: vi.fn() })).toBe(false);
  sender.registration_json = { ...registration, provider: 'notifyre', purposes: ['reminders'] };
  expect(await processSmsKeyword({ ...command(), sendReply: vi.fn() })).toBe(false);
  expect(db.beginTransaction).not.toHaveBeenCalled();
});

it('rolls back a failed preference write without sending a false confirmation', async () => {
  db.execute.mockRejectedValueOnce(new Error('storage unavailable'));
  const sendReply = vi.fn();
  await expect(processSmsKeyword({ ...command(), sendReply })).rejects.toThrow('storage unavailable');
  expect(sendReply).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalledOnce();
});
