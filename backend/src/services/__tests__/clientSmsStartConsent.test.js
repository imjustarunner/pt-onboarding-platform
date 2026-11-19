import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../providerSmsRelayIdentity.service.js', () => ({ resolveRelayFamily: vi.fn() }));
vi.mock('../intakeCommunicationChoices.service.js', () => ({ latestIntakeCommunicationChoices: vi.fn() }));
import pool from '../../config/database.js';
import { resolveRelayFamily } from '../providerSmsRelayIdentity.service.js';
import { latestIntakeCommunicationChoices } from '../intakeCommunicationChoices.service.js';
import { CLIENT_START_CONSENT_VERSION, clientStartPurposes, recordClientSmsStart, clientSmsStartAllowed } from '../clientSmsStartConsent.service.js';

const at = Date.now() - 100000;
const phone = '+17195550101';
const sender = { id: 4, agency_id: 377, campaign_id: 'tisi', scope: 'campaign:tisi', registration: {
  provider: 'notifyre', allowRestart: true, approved: true, numberLinked: true, keywordOwner: 'notifyre',
  brandId: 'brand', campaignId: 'tisi', resellerId: 'reseller', brandName: 'Inner Strength', legalName: 'Inner Strength',
  supportContact: 'support@example.test', website: 'https://example.test', privacyUrl: 'https://example.test/privacy',
  termsUrl: 'https://example.test/terms', evidenceUrl: 'https://example.test/proof', purposes: ['care', 'reminders']
} };
const evidence = { source: 'inbound_start', version: CLIENT_START_CONSENT_VERSION, agencyId: 377,
  campaignId: 'tisi', messageId: 'start-1', purposes: ['care', 'reminders'], collectedAt: new Date(at).toISOString() };
let permissions, events, state, clients, preference;
const key = (scope, recipient, purpose) => JSON.stringify([scope, recipient, purpose]);
beforeEach(() => {
  vi.resetAllMocks(); permissions = new Map(); events = new Map(); state = { blocked: false, command_at: 0 };
  clients = []; preference = null;
  resolveRelayFamily.mockResolvedValue({ guardianUserId: 1449 });
  latestIntakeCommunicationChoices.mockResolvedValue(null);
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('SELECT blocked,command_at')) return [[state]];
    if (sql.startsWith('UPDATE auricwell_sms_phone_state')) { state = { blocked: args[0], command_at: args[1] }; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT IGNORE INTO sms_permission_events')) {
      const k = key(...args.slice(0, 3)) + args[4];
      if (events.has(k)) return [{ affectedRows: 0 }];
      events.set(k, { scope: args[0], phone: args[1], purpose: args[2], evidence: JSON.parse(args[3]) });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT evidence_json,updated_at')) return [[permissions.get(key(...args))].filter(Boolean)];
    if (sql.startsWith('INSERT INTO sms_recipient_permissions')) {
      permissions.set(key(...args.slice(0, 3)), { status: 'opted_in', evidence_json: JSON.parse(args[3]) });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM clients c LEFT JOIN client_statuses')) {
      expect(args.slice(0, 2)).toEqual([377, 377]);
      return [clients.filter(c => !args[2] || c.id === args[2])];
    }
    if (sql.includes('FROM client_session_notification_preferences')) return [[preference].filter(Boolean)];
    return [{ affectedRows: 1 }];
  });
});
const start = (overrides = {}) => recordClientSmsStart({ sender, phone, messageId: 'start-1', receivedAt: at, ...overrides }, pool);
const allowed = (overrides = {}) => clientSmsStartAllowed({ sender, phone, purpose: 'care', evidence, ...overrides });

describe('authenticated phone START ledger', () => {
  it('saves both categories for an unknown phone with carrier evidence and no invented signer or actor', async () => {
    expect(await start({ phone: '(719) 555-0101' })).toBe(true);
    expect([...permissions.values()]).toHaveLength(4);
    expect([...events.values()].map(e => e.purpose).sort()).toEqual(['care', 'reminders', 'suppression', 'suppression']);
    const saved = permissions.get(key(sender.scope, phone, 'care')).evidence_json;
    expect(saved).toMatchObject({ source: 'inbound_start', agencyId: 377, messageId: 'start-1', termsUrl: sender.registration.termsUrl });
    expect(saved.actorUserId).toBeUndefined(); expect(saved.signerVerified).toBeUndefined();
    expect(await allowed()).toBe(false);
  });
  it('is idempotent across duplicate receipts and does not allow delayed START to undo STOP', async () => {
    await start();
    expect(await start()).toBe(false); expect(events.size).toBe(4);
    state = { blocked: true, command_at: at + 5000 };
    expect(await start({ messageId: 'delayed', receivedAt: at + 1000 })).toBe(false);
    expect(state.blocked).toBe(true); expect(events.size).toBe(4);
    expect(await start({ messageId: 'later', receivedAt: at + 6000 })).toBe(true);
    expect(state.blocked).toBe(false);
  });
  it('retains a newer category decline while recording a delayed START event', async () => {
    permissions.set(key(sender.scope, phone, 'reminders'), { status: 'opted_out', evidence_json: { collectedAt: new Date(at + 5000).toISOString() } });
    await start();
    expect(permissions.get(key(sender.scope, phone, 'reminders')).status).toBe('opted_out');
    expect(permissions.get(key(sender.scope, phone, 'care')).status).toBe('opted_in');
  });
  it('replaces a temporary inquiry reply grant with the permanent START subscription', async () => {
    permissions.set(key(sender.scope, phone, 'care'), { status: 'opted_in',
      evidence_json: { source: 'inbound_conversation' }, updated_at: new Date(at + 5000) });
    await start();
    expect(permissions.get(key(sender.scope, phone, 'care')).evidence_json).toMatchObject({ source: 'inbound_start', expiresAt: null });
  });
  it('accepts either receiving DID on the same campaign without spreading to another campaign', async () => {
    await start();
    await start({ sender: { ...sender, id: 8 }, messageId: 'other-did', receivedAt: at + 1000 });
    expect(permissions.get(key(sender.scope, phone, 'care')).evidence_json.numberId).toBe(8);
    expect([...permissions.keys()].some(k => k.includes('campaign:other'))).toBe(false);
  });
  it('records separate program STARTs with the same carrier timestamp, while STOP wins a timestamp tie', async () => {
    await start();
    const other = { ...sender, id: 8, campaign_id: 'other', scope: 'campaign:other', registration: { ...sender.registration, campaignId: 'other' } };
    expect(await start({ sender: other, messageId: 'other-program' })).toBe(true);
    expect(permissions.has(key('campaign:other', phone, 'care'))).toBe(true);
    state = { blocked: true, command_at: at };
    expect(await start({ messageId: 'same-time-as-stop' })).toBe(false);
    expect(state.blocked).toBe(true);
  });
  it('never enrolls marketing, billing, account security or staff purposes', () => {
    expect(clientStartPurposes(sender)).toEqual(['reminders', 'care']);
    for (const purposes of [['marketing'], ['workforce'], ['billing'], ['account_security']])
      expect(clientStartPurposes({ ...sender, registration: { ...sender.registration, purposes } })).toEqual([]);
    expect(clientStartPurposes({ ...sender, registration: { ...sender.registration, provider: 'vonage' } })).toEqual([]);
    expect(clientStartPurposes({ ...sender, registration: { ...sender.registration, approved: false } })).toEqual([]);
    // An explicitly configured first-time enrollment/review flow owns this
    // decision, including when it has been explicitly disabled by an operator.
    for (const enabled of [false, true]) expect(clientStartPurposes({ ...sender,
      registration: { ...sender.registration, startEnrollment: { enabled } } })).toEqual([]);
  });
  it.each([{ messageId: null }, { receivedAt: NaN }])('rejects incomplete webhook evidence %j', async overrides => {
    await expect(start(overrides)).rejects.toMatchObject({ code: 'sms_start_evidence_required' });
    expect(events.size).toBe(0);
  });
});

describe('current and future client/guardian integration', () => {
  it('activates the saved grant when a verified relationship appears, and stops when it is revoked', async () => {
    expect(await allowed()).toBe(false);
    clients = [{ id: 42, contact_phone: phone }];
    expect(await allowed()).toBe(true);
    resolveRelayFamily.mockResolvedValue(null);
    expect(await allowed()).toBe(false);
  });
  it('requires the exact client and guardian when a delivery names them', async () => {
    clients = [{ id: 42, contact_phone: phone }];
    expect(await allowed({ clientId: 43 })).toBe(false);
    expect(await allowed({ clientId: 42, recipientUserId: 0 })).toBe(false);
    expect(await allowed({ clientId: 42, recipientUserId: 999 })).toBe(false);
    expect(await allowed({ clientId: 42, recipientUserId: 1449 })).toBe(true);
  });
  it.each(['reminders', 'care'])('honors a later enrollment decline for %s only', async purpose => {
    clients = [{ id: 42, contact_phone: phone }];
    latestIntakeCommunicationChoices.mockResolvedValue({ guardianUserId: 1449, recipientPhone: phone,
      signedAt: new Date(at + 1000).toISOString(), smsPreference: purpose === 'reminders' ? 'no' : 'scheduling_only',
      providerTextingOptIn: purpose === 'care' ? 'no' : 'yes' });
    expect(await allowed({ purpose })).toBe(false);
    expect(await allowed({ purpose: purpose === 'care' ? 'reminders' : 'care' })).toBe(true);
  });
  it('allows a fresh START to supersede an earlier enrollment decline', async () => {
    clients = [{ id: 42, contact_phone: phone }];
    latestIntakeCommunicationChoices.mockResolvedValue({ guardianUserId: 1449, smsPreference: 'no', providerTextingOptIn: 'no', signedAt: new Date(at - 1000).toISOString() });
    expect(await allowed()).toBe(true); expect(await allowed({ purpose: 'reminders' })).toBe(true);
  });
  it('honors later portal reminder choices without switching off provider texting', async () => {
    clients = [{ id: 42, contact_phone: phone }];
    preference = { channels_json: { sms: false }, updated_at: new Date(at + 1000) };
    expect(await allowed({ purpose: 'reminders' })).toBe(false);
    expect(await allowed()).toBe(true);
    preference.updated_at = new Date(at - 1000);
    expect(await allowed({ purpose: 'reminders' })).toBe(true);
  });
  it('rejects cross-agency evidence, malformed timestamps and unrelated purposes', async () => {
    clients = [{ id: 42, contact_phone: phone }];
    expect(await allowed({ evidence: { ...evidence, agencyId: 2 } })).toBe(false);
    expect(await allowed({ evidence: { ...evidence, campaignId: 'other' } })).toBe(false);
    expect(await allowed({ evidence: { ...evidence, collectedAt: 'bad' } })).toBe(false);
    expect(await allowed({ purpose: 'marketing' })).toBe(false);
  });
});
