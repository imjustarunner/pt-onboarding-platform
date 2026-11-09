import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
import pool from '../../config/database.js';
import { prepareSmsDelivery, processSmsKeyword } from '../smsCompliance.service.js';
import { teamSmsEligibility } from '../conversaTeamRecipients.service.js';

const phone = '+13035550101';
const registration = {
  provider: 'vonage', brandId: 'B123', campaignId: 'C123', resellerId: 'R123',
  brandName: 'ITSCO', legalName: 'ITSCO, LLC', supportContact: 'support@example.com',
  website: 'https://example.com', privacyUrl: 'https://example.com/privacy',
  termsUrl: 'https://example.com/terms', evidenceUrl: 'https://example.com/evidence',
  purposes: ['workforce', 'polling'], keywordOwner: 'vonage', approved: true, numberLinked: true
};
const key = (...values) => JSON.stringify(values);
let sender, permissions, events, snapshot;
const sms = () => ({ from: sender.phone_number, to: phone, purpose: 'polling', body: 'Which date? Reply DATE 1 or DATE 2.' });
const command = (body = 'NOPOLLS', messageId = 'poll-optout-1') => ({ from: phone, to: sender.phone_number, body, messageId });
beforeEach(() => {
  vi.resetAllMocks();
  sender = { id: 3, agency_id: 2, phone_number: '+13035550100', is_active: 1, status: 'active',
    campaign_id: 'C123', registration_json: registration, agency_name: 'ITSCO' };
  permissions = new Map(['workforce', 'polling'].map(purpose => [key('campaign:C123', phone, purpose), { status: 'opted_in' }]));
  events = new Set();
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM sms_program_opt_out_notices')) return [[{ recent: 1 }]];
    if (sql.includes('FROM twilio_numbers')) return [[sender]];
    if (sql.includes("purpose = 'suppression'")) {
      const blocked = args.length === 3 && [args[0], args[1]].some(scope => permissions.get(key(scope, args[2], 'suppression'))?.status === 'opted_out');
      return [blocked ? [{ found: 1 }] : []];
    }
    if (sql.includes('FROM sms_recipient_permissions')) {
      const permission = permissions.get(key(...args.slice(0, 3)));
      return [permission && (sql.includes('SELECT status') || permission.status === 'opted_in') ? [permission] : []];
    }
    return [[]];
  });
  pool.getConnection.mockResolvedValue({
    beginTransaction: vi.fn(async () => { snapshot = new Map(permissions); }), commit: vi.fn(),
    rollback: vi.fn(async () => { permissions = snapshot; }), release: vi.fn(),
    execute: vi.fn(async (sql, args) => {
      if (sql.includes('INSERT INTO sms_recipient_permissions')) permissions.set(key(...args.slice(0, 3)), { status: args[3], evidence_json: JSON.parse(args[4]) });
      if (sql.includes('INSERT INTO sms_permission_events')) {
        const event = key(args[0], args[1], args[2], args[5]);
        if (events.has(event)) throw Object.assign(new Error('Duplicate event'), { code: 'ER_DUP_ENTRY' });
        events.add(event);
      }
      return [{ affectedRows: 1 }];
    })
  });
});

it('uses NOPOLLS in invitations and results without adding a campaign STOP prompt', async () => {
  for (const body of [sms().body, 'Final results: Tuesday 3, Friday 2.', 'Vote now. Reply NOPOLLS to stop poll texts only.']) {
    const delivery = await prepareSmsDelivery({ ...sms(), body });
    expect(delivery.body).toMatch(/^ITSCO:/);
    expect(delivery.body.match(/NOPOLLS/g)).toHaveLength(1);
    expect(delivery.body).not.toContain('STOP');
  }
});
it('keeps vote acknowledgments short even when a periodic campaign reminder is due', async () => {
  const original = pool.execute.getMockImplementation();
  pool.execute.mockImplementation((sql, args) => sql.includes('FROM sms_program_opt_out_notices') ? Promise.resolve([[{ recent: 0 }]]) : original(sql, args));
  const result = await prepareSmsDelivery({ ...sms(), body: 'Thanks! Recorded: Friday.', companyEventReply: true });
  expect(result.body).toContain('NOPOLLS'); expect(result.body).not.toContain('STOP');
  const invitation = await prepareSmsDelivery(sms());
  expect(invitation.body).toContain('Reply STOP to stop all staff texts; HELP for help.');
  expect(invitation.body).not.toContain('rates may apply');
});

it('opts out of polling only, confirms once with carrier-owned STOP, and exposes the opt-out in preview', async () => {
  const sendReply = vi.fn(options => prepareSmsDelivery(options));
  expect(await processSmsKeyword({ ...command('  noPolls  '), sendReply })).toBe(true);
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).toHaveBeenCalledOnce();
  expect(sendReply.mock.calls[0][0].body).toContain('other staff notifications and in-app polls are unchanged');
  expect(sendReply.mock.calls[0][0].body).not.toContain('STOP');
  expect(permissions.get(key('campaign:C123', phone, 'workforce'))).toEqual({ status: 'opted_in' });
  expect(permissions.has(key('campaign:C123', phone, 'suppression'))).toBe(false);
  await expect(prepareSmsDelivery(sms())).rejects.toMatchObject({ code: 'sms_consent_required' });
  await expect(prepareSmsDelivery({ ...sms(), purpose: 'workforce' })).resolves.toMatchObject({ to: phone });
  expect(await teamSmsEligibility({ personal_phone: phone }, { agencyId: 2, from: sender.phone_number })).toMatchObject({ eligible: false, label: 'SMS opted out' });
});

it('keeps polling off for another number on the same campaign and does not replay an old opt-out over renewed consent', async () => {
  const sendReply = vi.fn();
  await processSmsKeyword({ ...command(), sendReply });
  sender = { ...sender, id: 4, phone_number: '+13035550102' };
  await expect(prepareSmsDelivery(sms())).rejects.toMatchObject({ code: 'sms_consent_required' });
  permissions.set(key('campaign:C123', phone, 'polling'), { status: 'opted_in' });
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).toHaveBeenCalledOnce();
  await expect(prepareSmsDelivery(sms())).resolves.toMatchObject({ to: phone });
});

it('preserves full STOP for both polling and staff notifications, with no extra NOPOLLS acknowledgment', async () => {
  const sendReply = vi.fn();
  await processSmsKeyword({ ...command('STOP', 'full-stop'), sendReply });
  await processSmsKeyword({ ...command(), sendReply });
  expect(sendReply).not.toHaveBeenCalled();
  for (const purpose of ['polling', 'workforce']) await expect(prepareSmsDelivery({ ...sms(), purpose })).rejects.toMatchObject({ code: 'sms_opted_out' });
});

it('does not interpret NOPOLLS as an opt-out on a client service campaign', async () => {
  sender = { ...sender, registration_json: { ...registration, purposes: ['care', 'reminders'], provider: 'notifyre' } };
  const sendReply = vi.fn();
  expect(await processSmsKeyword({ ...command(), sendReply })).toBe(false);
  expect(pool.getConnection).not.toHaveBeenCalled();
  expect(sendReply).not.toHaveBeenCalled();
});
