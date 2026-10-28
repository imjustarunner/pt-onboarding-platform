import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), client: vi.fn(), provider: vi.fn(), signature: vi.fn(), send: vi.fn(), notify: vi.fn(), identities: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, slug: 'test-agency' }) } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: m.client } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: m.notify } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { list: m.identities } }));
vi.mock('../clientExchangeEligibility.service.js', () => ({ loadExchangeProvider: m.provider }));
vi.mock('../clientExchangeAudit.service.js', () => ({ withExchangeLock: async (id, work) => work(), parseAuditJson: value => typeof value === 'string' ? JSON.parse(value) : value }));
vi.mock('../staffHtmlEmailSignature.service.js', () => ({ appendStaffHtmlSignature: m.signature }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../../utils/publicPortalUrl.js', () => ({ buildPublicAppUrl: () => 'https://example.test/test-agency/client-exchange' }));
import { previewExchangeShare, sendExchangeShare } from '../clientExchangeSharing.service.js';
const input = { listingId: 11, agencyId: 2, providerUserId: 10, actor: { id: 7, role: 'support' }, requestKey: 'first-share-request-123', expectedShareCount: 0 };
let listing, shares;
beforeEach(() => {
  vi.clearAllMocks(); shares = [];
  listing = { id: 11, agency_id: 2, client_id: 3, status: 'open' };
  m.client.mockResolvedValue({ id: 3, agency_id: 2, status: 'CURRENT', full_name: 'Private Client Name' });
  m.provider.mockResolvedValue({ user: { id: 10, first_name: 'Provider', work_email: 'provider@example.test' } });
  m.identities.mockResolvedValue([{ id: 20, identity_key: 'client_exchange', from_email: 'exchange@example.test' }]);
  m.signature.mockImplementation(async value => ({ appended: true, text: `${value.text}\nSigned by Staff Seven`, html: `${value.html}<!-- pt-staff-html-signature -->Staff Seven` }));
  m.send.mockResolvedValue({ id: 'message-1', communicationId: 9 }); m.notify.mockResolvedValue({ id: 30 });
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT * FROM client_exchange_listings')) return [[listing]];
    if (sql.startsWith('SELECT s.*')) return [shares];
    if (sql.startsWith('SELECT * FROM client_exchange_shares')) return [shares.filter(s => s.request_key === args[2])];
    if (sql.startsWith('INSERT INTO client_exchange_shares')) {
      const id = shares.length + 1;
      shares.push({ id, listing_id: args[0], provider_user_id: args[1], shared_by_user_id: args[2], request_key: args[3], share_number: args[4], status: 'sending' }); return [{ insertId: id }];
    }
    if (sql.startsWith('UPDATE client_exchange_shares SET status')) Object.assign(shares.find(s => s.id === args[2]), { status: args[0], delivery_json: args[1] });
    return [{ affectedRows: 1 }];
  });
});
it('previews a personal signed share without sending, matching or changing client records', async () => {
  const preview = await previewExchangeShare(input);
  expect(preview).toMatchObject({ to: 'provider@example.test', previousShareCount: 0 });
  expect(preview.text).toContain('Your support team has shared a client'); expect(preview.text).toContain('Signed by Staff Seven');
  expect(preview.text).not.toContain('Private Client Name');
  expect(m.signature).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, agencyId: 2, force: true }));
  expect(m.send).not.toHaveBeenCalled(); expect(m.notify).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('sends without requiring a match, signs as the sharing staff, and deduplicates a retried request', async () => {
  const first = await sendExchangeShare(input), retried = await sendExchangeShare(input);
  expect(first.share.status).toBe('sent'); expect(retried.duplicate).toBe(true); expect(m.send).toHaveBeenCalledOnce();
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual', generatedByUserId: 7, userId: 10,
    templateType: 'client_exchange_shared', html: expect.stringContaining('pt-staff-html-signature'), linkUrl: expect.stringContaining('listingId=11&agencyId=2') }));
  expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'client_exchange_shared', actorUserId: 7 }));
  expect(m.execute.mock.calls.some(([sql]) => /UPDATE (clients|client_exchange_listings|client_exchange_requests)/.test(sql))).toBe(false);
});
it('welcomes the provider back on a second intentional share and validates preview history', async () => {
  await sendExchangeShare(input);
  const second = { ...input, requestKey: 'second-share-request-123' };
  const preview = await previewExchangeShare(second);
  expect(preview.previousShareCount).toBe(1); expect(preview.text).toContain('still available'); expect(preview.text).toContain('shared them with you again');
  await expect(sendExchangeShare(second)).rejects.toThrow('Preview');
  await sendExchangeShare({ ...second, expectedShareCount: 1 });
  expect(m.send).toHaveBeenCalledTimes(2); expect(shares[1].share_number).toBe(2);
});
it.each(['provider', 'school_staff'])('rejects %s attempting to share', async role => {
  await expect(previewExchangeShare({ ...input, actor: { id: 7, role } })).rejects.toMatchObject({ status: 403 });
  await expect(sendExchangeShare({ ...input, actor: { id: 7, role } })).rejects.toMatchObject({ status: 403 });
  expect(m.send).not.toHaveBeenCalled();
});
it('rejects cross-agency, inactive, direct-referral and closed targets', async () => {
  await expect(sendExchangeShare({ ...input, agencyId: 99 })).rejects.toMatchObject({ status: 404 });
  listing.target_provider_user_id = 12; await expect(sendExchangeShare(input)).rejects.toMatchObject({ status: 403 });
  listing.target_provider_user_id = null; m.provider.mockResolvedValue({ user: null }); await expect(sendExchangeShare(input)).rejects.toMatchObject({ status: 403 });
  listing.status = 'closed'; await expect(sendExchangeShare(input)).rejects.toThrow('no longer available');
  expect(m.send).not.toHaveBeenCalled(); expect(shares).toHaveLength(0);
});
it('does not silently omit the signature or retry an uncertain send', async () => {
  m.signature.mockResolvedValueOnce({ appended: false }); await expect(sendExchangeShare(input)).rejects.toThrow('signature');
  expect(m.send).not.toHaveBeenCalled();
  m.send.mockRejectedValueOnce(new Error('Connection lost'));
  const result = await sendExchangeShare(input); expect(result.share.status).toBe('unknown');
  await sendExchangeShare(input); expect(m.send).toHaveBeenCalledOnce();
});
it.each([{ queued: true, status: 'queued' }, { skipped: true, status: 'skipped' }, { blocked: true, status: 'failed' }])('keeps accurate delivery status $status', async ({ status, ...result }) => {
  m.send.mockResolvedValue(result);
  expect((await sendExchangeShare(input)).share.status).toBe(status);
});
