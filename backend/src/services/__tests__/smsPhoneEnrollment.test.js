import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), sender: vi.fn(), suppressed: vi.fn(), blocked: false, categoryStopped: false }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m } }));
vi.mock('../chatEncryption.service.js', () => ({ encryptChatText: value => ({ sealed: value }), decryptChatText: value => value.sealed }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: m.sender, isSmsSuppressed: m.suppressed }));
vi.mock('../notifyreRecipientState.service.js', () => ({ notifyrePhoneStopped: async () => m.blocked, notifyrePurposeOptedOut: async () => m.categoryStopped }));
import { approvedStartEnrollment, capturePhoneEnrollmentCommand, listPhoneEnrollments, phoneEnrollmentEvidence, reviewPhoneEnrollment } from '../smsPhoneEnrollment.service.js';
const registration = { provider: 'notifyre', brandId: 'test-brand', campaignId: 'test-campaign', resellerId: 'test-reseller', brandName: 'Test practice', legalName: 'Test practice LLC', supportContact: 'support@example.test',
  website: 'https://example.test', privacyUrl: 'https://example.test/privacy', termsUrl: 'https://example.test/terms', evidenceUrl: 'https://example.test/consent', purposes: ['care','reminders'], keywordOwner: 'notifyre', approved: true, numberLinked: true, allowRestart: true,
  startEnrollment: { enabled: true, version: '2026-11-16.1', approvalReference: 'carrier:verified-example', disclosure: 'Test practice appointment reminders and care-team messages. Frequency varies. Rates apply. STOP to stop, HELP for help.', purposes: ['reminders','care'] } };
const sender = { id: 7, agency_id: 6, scope: 'campaign:test-campaign', registration }, phone = '+13035550101';
const at = Date.now() - 10000;
let row, events, permissions, recipient, transactionSnapshot;
beforeEach(() => {
  vi.clearAllMocks(); row = null; events = new Set(); permissions = []; m.blocked = false; m.categoryStopped = false;
  recipient = { id: 22, phone_number: phone };
  m.sender.mockResolvedValue(sender); m.suppressed.mockResolvedValue(false);
  m.beginTransaction.mockImplementation(async () => { transactionSnapshot = structuredClone({ row, events, permissions }); });
  m.rollback.mockImplementation(async () => { if (transactionSnapshot) ({ row, events, permissions } = transactionSnapshot); });
  m.execute.mockImplementation(async (sql, args = []) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql.startsWith('INSERT IGNORE INTO sms_phone_enrollments')) { row ||= { id: 1, agency_id: args[0], scope_key: args[1], phone_hash: args[2], phone_last_four: args[3], number_id: args[4], status: 'pending', command_at: 0, payload_json: args[5] }; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT IGNORE INTO sms_phone_enrollment_events')) { const duplicate = events.has(args[1]); events.add(args[1]); return [{ affectedRows: duplicate ? 0 : 1 }]; }
    if (sql.startsWith('UPDATE sms_phone_enrollments SET status=?')) { Object.assign(row, { status: args[0], command_at: args[1], number_id: args[2], payload_json: args[3], linked_user_id: null, linked_client_id: null }); return [{}]; }
    if (sql.startsWith('UPDATE sms_phone_enrollments SET status=\'linked\'')) { Object.assign(row, { status: 'linked', linked_user_id: args[0], linked_client_id: args[1] }); return [{}]; }
    if (sql.startsWith('SELECT payload_json FROM sms_phone_enrollments')) return [[...(row && row.agency_id === args[0] ? [row] : [])]];
    if (sql.includes('FROM sms_phone_enrollments')) return [[...(row ? [row] : [])]];
    if (sql.includes('FROM twilio_numbers')) return [[{ phone_number: '+13035550200' }]];
    if (sql.includes('FROM users u JOIN clients')) return [[...(recipient ? [recipient] : [])]];
    if (sql.startsWith('INSERT INTO sms_recipient_permissions')) { permissions.push(args); return [{}]; }
    return [{ affectedRows: 1 }];
  });
});
const capture = (keyword = 'START', offset = 0, messageId = `${keyword}:${offset}`) => capturePhoneEnrollmentCommand({ sender, phone, keyword, messageId, receivedAt: at + offset }, m);
const review = overrides => reviewPhoneEnrollment({ agencyId: 6, id: 1, userId: 22, clientId: 40, identityVerified: true, actorUserId: 99, ...overrides });
describe('account-independent START history', () => {
  it('captures original phone and versioned consent without requiring an account or granting permissions', async () => {
    await capture();
    expect(row.status).toBe('pending'); expect(row.linked_user_id).toBeNull(); expect(permissions).toHaveLength(0);
    const evidence = await phoneEnrollmentEvidence(6, 1);
    expect(evidence).toMatchObject({ phone, messageId: 'START:0', receivedAt: at, disclosure: { version: '2026-11-16.1', purposes: ['reminders','care'] } });
    const listed = await listPhoneEnrollments(6);
    expect(listed.items[0]).toMatchObject({ phoneLastFour: '0101', eligibleForReview: true });
    expect(JSON.stringify(listed)).not.toContain(phone);
  });
  it('keeps duplicate delivery idempotent and preserves newer STOP against delayed START', async () => {
    await capture(); await capture(); expect(events.size).toBe(1);
    await capture('STOP', 1000); await capture('START', 500);
    expect(events.size).toBe(3); expect(row.status).toBe('stopped'); expect(row.command_at).toBe(at + 1000);
    await capture('START', 2000); expect(row.status).toBe('pending'); expect(row.linked_user_id).toBeNull();
  });
  it('gives STOP precedence when event timestamps are equal', async () => {
    await capture('STOP'); await capture('START'); expect(row.status).toBe('stopped');
  });
  it('refuses anonymous/undated carrier events and rejects cross-agency evidence reads', async () => {
    await expect(capturePhoneEnrollmentCommand({ sender, phone, keyword: 'START', messageId: null, receivedAt: at }, m)).rejects.toThrow('dated carrier');
    await capture(); await expect(phoneEnrollmentEvidence(2, 1)).rejects.toMatchObject({ status: 404 });
  });
  it('does not treat marketing, unsigned program flags or missing carrier approval as a first-time grant', () => {
    expect(approvedStartEnrollment(registration)).toBeTruthy();
    for (const patch of [{ approved: false }, { allowRestart: false }, { provider: 'vonage' }, { startEnrollment: { ...registration.startEnrollment, approvalReference: '' } }, { startEnrollment: { ...registration.startEnrollment, purposes: ['marketing'] } }]) expect(approvedStartEnrollment({ ...registration, ...patch })).toBeNull();
  });
});
describe('explicit current-recipient review', () => {
  it('links the existing consent and grants only original purposes without creating users or guardian access', async () => {
    await capture(); const evidenceBefore = row.payload_json;
    expect(await review()).toMatchObject({ status: 'linked', userId: 22, clientId: 40, purposes: ['reminders','care'] });
    expect(permissions.map(args => args[2])).toEqual(['reminders','care']); expect(row.payload_json).toBe(evidenceBefore);
    expect(m.execute.mock.calls.some(([sql]) => /INSERT INTO (users|client_guardians)/.test(sql))).toBe(false);
    expect(m.execute.mock.calls.find(([sql]) => sql.includes('FROM users u JOIN clients'))[0]).toContain('noViewOtherGuardian');
    expect(JSON.parse(permissions[0][3])).toMatchObject({ source: 'inbound_start_reviewed', actorUserId: 99, collectedAt: new Date(at).toISOString() });
    await expect(review()).rejects.toMatchObject({ status: 409 });
  });
  it.each(['account STOP','campaign STOP','category opt-out','wrong phone','restricted guardian','changed disclosure'])('blocks unsafe linkage: %s', async kind => {
    await capture();
    if (kind === 'account STOP') m.blocked = true;
    if (kind === 'campaign STOP') m.suppressed.mockResolvedValue(true);
    if (kind === 'category opt-out') m.categoryStopped = true;
    if (kind === 'wrong phone') recipient.phone_number = '+13035550999';
    if (kind === 'restricted guardian') recipient = null;
    if (kind === 'changed disclosure') m.sender.mockResolvedValue({ ...sender, registration: { ...registration, startEnrollment: { ...registration.startEnrollment, version: 'new' } } });
    await expect(review()).rejects.toMatchObject({ status: 409 });
    expect(permissions).toHaveLength(0); expect(row.status).toBe('pending');
  });
  it('requires affirmative human review and rolls back the link if permission/history writing fails', async () => {
    await capture(); await expect(review({ identityVerified: false })).rejects.toMatchObject({ status: 400 });
    const execute = m.execute.getMockImplementation();
    m.execute.mockImplementation(async (sql,args) => { if (sql.startsWith('INSERT INTO sms_permission_events')) throw Error('Evidence unavailable'); return execute(sql,args); });
    await expect(review()).rejects.toThrow('Evidence unavailable');
    expect(permissions).toHaveLength(0); expect(row.status).toBe('pending');
  });
});
