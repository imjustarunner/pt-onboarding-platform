import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../auricwell/repository.js', () => ({
  pool: { execute: vi.fn() }, seal: vi.fn(value => value), open: vi.fn(value => value),
  transaction: vi.fn(), list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(),
  findSource: vi.fn(), sourceRecords: vi.fn(), lockPractice: vi.fn(), audit: vi.fn()
}));
vi.mock('../auricwell/clinical.js', () => ({ patientAccess: vi.fn() }));
vi.mock('../auricwell/platformIntegrations.js', () => ({ platformIntegrations: vi.fn(), recordNotifyreWebhookVerified: vi.fn() }));
vi.mock('../auricwell/sessionTransports.js', () => ({ notifyreRequest: vi.fn(), notifyreReceipt: vi.fn() }));

import sharedDb from '../../config/database.js';
import { pool, transaction, findSource } from '../auricwell/repository.js';
import { patientAccess } from '../auricwell/clinical.js';
import { platformIntegrations } from '../auricwell/platformIntegrations.js';
import { clientSmsPreferences, saveClientSmsPreferences, dispatchSms } from '../auricwell/clientMessaging.js';

const phone = '+13035550101';
const ctx = { practiceId: 'practice', agencyId: 2, accountId: 'staff', actorType: 'staff', permissions: ['schedule'], settings: { phiActivatedAt: '2026-01-01' } };
const route = { practiceId: 'practice', enabled: true, approval: 'approved', campaignId: 'campaign', verifiedAt: '2026-01-01', verifiedProvider: 'notifyre', mainNumber: '+13035550100' };
let declined, contact, candidate;

beforeEach(() => {
  vi.resetAllMocks();
  declined = new Set();
  contact = { id: 'contact', patient_id: 'patient', revision: 3, payload: {
    phone, categories: { reminders: true, links: true, forms: true, account: false, conversations: true },
    inquiryAt: new Date().toISOString()
  } };
  candidate = { id: 'outbox', status: 'queued', practice_id: 'practice', contact_id: 'contact', category: 'reminders',
    expires_at: new Date(Date.now() + 3600000), payload: { body: 'Reminder', line: 'main', origin: 'automation' } };
  patientAccess.mockResolvedValue({ id: 'patient', data: { phone } });
  findSource.mockResolvedValue(null);
  platformIntegrations.mockResolvedValue({ settings: { smsProvider: 'notifyre', notifyre: {
    apiToken: 'test', baaReference: 'test', webhookSecret: 'test', webhookVerifiedAt: '2026-01-01'
  }, clientMessaging: { routes: [route] } } });
  sharedDb.execute.mockImplementation(async (_sql, values) => [[{ status: declined.has(values[2]) ? 'opted_out' : 'opted_in' }]]);
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT * FROM auricwell_practices')) return [[{ id: 'practice', agency_id: 2, settings: ctx.settings }]];
    if (sql.includes('SELECT * FROM auricwell_sms_contacts')) return [[contact]];
    if (sql.includes('SELECT * FROM auricwell_sms_phone_state')) return [[{ blocked: false, command_at: 0 }]];
    if (sql.includes('SELECT status FROM sms_recipient_permissions')) return [[{ status: declined.has('reminders') ? 'opted_out' : 'opted_in' }]];
    if (sql.includes('SELECT * FROM auricwell_sms_outbox')) return [[candidate]];
    if (sql.includes("SET status='sending'")) return [{ affectedRows: 1 }];
    return [{ affectedRows: 1 }];
  });
  transaction.mockImplementation(fn => fn(pool));
});

it('shows a shared reminder decline without switching off provider, form or link texts', async () => {
  declined.add('reminders');
  const prefs = await clientSmsPreferences(ctx, 'patient');
  expect(prefs.categories).toMatchObject({ reminders: false, conversations: true, forms: true, links: true });
});

it('requires fresh affirmative permission before an old local checkbox can undo NOREMIND', async () => {
  declined.add('reminders');
  await expect(saveClientSmsPreferences(ctx, 'patient', { revision: 3, categories: contact.payload.categories }))
    .rejects.toMatchObject({ status: 400 });
  expect(pool.execute.mock.calls.some(([sql]) => /UPDATE auricwell_sms_contacts|DELETE FROM sms_recipient_permissions/.test(sql))).toBe(false);
});

it('blocks dispatch after NOREMIND but still permits an independently consented provider conversation', async () => {
  contact.patient_id = null;
  const original = pool.execute.getMockImplementation();
  pool.execute.mockImplementation((sql, values) => sql.includes('SELECT status FROM sms_recipient_permissions')
    ? Promise.resolve([[{ status: values[2] === 'reminders' ? 'opted_out' : 'opted_in' }]]) : original(sql, values));
  const send = vi.fn(async () => 'carrier-receipt');
  await dispatchSms('outbox', { send });
  expect(send).not.toHaveBeenCalled();
  candidate.category = 'conversations';
  await dispatchSms('outbox', { send });
  expect(send).toHaveBeenCalledTimes(1);
});

it('keeps provider texting declined even when an earlier inquiry is recent', async () => {
  contact.patient_id = null;
  contact.payload.conversationsDeclined = true;
  candidate.category = 'conversations';
  const send = vi.fn();
  await dispatchSms('outbox', { send });
  expect(send).not.toHaveBeenCalled();
});
