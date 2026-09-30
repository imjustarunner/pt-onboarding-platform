import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ poolExecute: vi.fn(), execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), sync: vi.fn(), ensure: vi.fn(), track: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.poolExecute, getConnection: async () => ({ execute: mocks.execute, beginTransaction: mocks.begin, commit: mocks.commit, rollback: mocks.rollback, release: mocks.release }) } }));
vi.mock('../clientProviderAssignmentSync.service.js', () => ({ afterLegacyProviderFieldsChanged: mocks.sync, ensureClientProviderAssignmentRow: mocks.ensure }));
vi.mock('../officeClientAcceptance.service.js', () => ({ recordProviderAssignmentChange: mocks.track }));
import { createExchangeClaim, resolveExchangeClaim, withdrawExchangeListing } from '../clientExchangeClaims.service.js';
let listing, client, claims, eligible;
beforeEach(() => {
  vi.clearAllMocks();
  listing = { id: 1, agency_id: 2, client_id: 3, posted_by_user_id: 8, current_provider_user_id: 7, status: 'open' };
  client = { id: 3, agency_id: 2, organization_id: 2, provider_id: 7, client_type: 'clinical', status: 'CURRENT' };
  claims = []; eligible = true;
  mocks.poolExecute.mockImplementation(async () => [[{ listing_id: 1 }]]);
  mocks.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT * FROM client_exchange_listings')) return [[{ ...listing }]];
    if (sql.startsWith('SELECT u.id')) return [eligible ? [{ id: args[0] }] : []];
    if (sql.startsWith('SELECT * FROM clients')) return [[{ ...client }]];
    if (sql.startsWith('SELECT * FROM client_exchange_requests')) return [[claims.find(c => c.id === args[0])].filter(Boolean)];
    if (sql.startsWith('SELECT id FROM client_exchange_requests')) return [claims.filter(c => c.status === 'pending' && (args.length === 1 || c.requesting_provider_user_id === args[1]))];
    if (sql.startsWith('INSERT INTO client_exchange_requests')) { const id = claims.length + 1; claims.push({ id, listing_id: 1, requesting_provider_user_id: args[1], status: 'pending' }); return [{ insertId: id }]; }
    if (sql.startsWith("UPDATE client_exchange_listings SET status = 'requested'")) listing.status = 'requested';
    if (sql.startsWith("UPDATE client_exchange_listings SET status = 'closed'")) listing.status = 'closed';
    if (sql.startsWith("UPDATE client_exchange_listings SET status = 'withdrawn'")) listing.status = 'withdrawn';
    return [{ affectedRows: 1 }];
  });
});
it('allows several providers to claim and rejects duplicate pending claims', async () => {
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 });
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 11 });
  expect(claims.map(c => c.requesting_provider_user_id)).toEqual([10, 11]);
  await expect(createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 })).rejects.toMatchObject({ status: 409 });
  expect(mocks.commit).toHaveBeenCalledTimes(2);
  expect(mocks.rollback).toHaveBeenCalledOnce();
});
it('transfers to the chosen claimant and closes other claims in one transaction', async () => {
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 });
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 11 });
  vi.clearAllMocks();
  await resolveExchangeClaim({ requestId: 2, action: 'approve', actingUserId: 7, actingRole: 'provider' });
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE clients SET provider_id'), [11, 7, 3]);
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('SET is_active = FALSE'), [7, 3, 7]);
  expect(mocks.ensure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ providerUserId: 11, isPrimary: true }));
  expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ connection: expect.anything(), oldProviderUserId: 7, newProviderUserId: 11 }));
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('Another provider was assigned'), [7, 1, 2]);
  expect(mocks.commit).toHaveBeenCalledOnce();
  await expect(resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 7, actingRole: 'provider' })).rejects.toMatchObject({ status: 409 });
});
it('allows the posting team to assign an unassigned client', async () => {
  client.provider_id = null; listing.current_provider_user_id = null;
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 });
  await resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 8, actingRole: 'support' });
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE clients SET provider_id'), [10, 8, 3]);
});
it('rejects unauthorized resolution, stale assignments, and inactive/out-of-agency recipients', async () => {
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 });
  await expect(resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 99, actingRole: 'provider' })).rejects.toMatchObject({ status: 403 });
  client.provider_id = 33;
  await expect(resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 7, actingRole: 'provider' })).rejects.toThrow('assignment changed');
  client.provider_id = 7; eligible = false;
  await expect(resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 7, actingRole: 'provider' })).rejects.toMatchObject({ status: 403 });
  expect(mocks.sync).not.toHaveBeenCalled();
});
it('rolls back the assignment when a downstream write fails', async () => {
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 });
  vi.clearAllMocks(); mocks.sync.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 7, actingRole: 'provider' })).rejects.toThrow('Database unavailable');
  expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.release).toHaveBeenCalledOnce();
});
it('withdraws under the same lock and prevents subsequent claims', async () => {
  await withdrawExchangeListing({ listingId: 1, actingUserId: 7 });
  await expect(createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 })).rejects.toMatchObject({ status: 409 });
});
