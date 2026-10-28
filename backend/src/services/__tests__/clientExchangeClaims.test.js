import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ poolExecute: vi.fn(), execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), sync: vi.fn(), ensure: vi.fn(), track: vi.fn(), accepted: vi.fn(), profile: vi.fn(), facets: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.poolExecute, getConnection: async () => ({ execute: mocks.execute, beginTransaction: mocks.begin, commit: mocks.commit, rollback: mocks.rollback, release: mocks.release }) } }));
vi.mock('../clientProviderAssignmentSync.service.js', () => ({ afterLegacyProviderFieldsChanged: mocks.sync, ensureClientProviderAssignmentRow: mocks.ensure }));
vi.mock('../officeClientAcceptance.service.js', () => ({ recordProviderAssignmentChange: mocks.track }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, slug: 'itsco' }) } }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: { getForProvider: mocks.profile } }));
vi.mock('../providerClinicalFacets.service.js', () => ({ listClinicalFacetsForUsers: mocks.facets }));
vi.mock('../providerAcceptedInsurance.service.js', () => ({ listProviderAcceptedInsurancesForDisplay: mocks.accepted }));
vi.mock('../clientExchangeSummary.service.js', () => ({ loadClientExchangeSummary: async () => ({ demographics: {}, preferences: {}, diagnoses: [], presentingProblems: [] }) }));
import { assertExchangeRequestEligible } from '../clientExchangeEligibility.service.js';
import { createExchangeClaim, resolveExchangeClaim, withdrawExchangeListing } from '../clientExchangeClaims.service.js';
let listing, client, claims, eligible, waivers;
beforeEach(() => {
  vi.clearAllMocks();
  listing = { id: 1, agency_id: 2, client_id: 3, posted_by_user_id: 8, current_provider_user_id: 7, status: 'open' };
  client = { id: 3, agency_id: 2, organization_id: 2, provider_id: 7, client_type: 'clinical', status: 'CURRENT' };
  claims = []; eligible = true; waivers = []; mocks.facets.mockResolvedValue(new Map());
  mocks.profile.mockResolvedValue({ agencyAvailability: { seesClients: true, acceptingNewClients: true, inPerson: true } });
  mocks.accepted.mockResolvedValue({ accepted: [{ name: 'Tricare' }], excluded: [] });
  mocks.poolExecute.mockImplementation(async () => [[{ listing_id: 1 }]]);
  mocks.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM client_exchange_match_waivers')) return [waivers];
    if (sql.startsWith('SELECT * FROM client_exchange_listings')) return [[{ ...listing }]];
    if (sql.startsWith('SELECT c.*')) return [[{ ...client }]];
    if (sql.startsWith('SELECT u.*')) return [eligible ? [{ id: args[0], role: 'provider' }] : []];
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

it('blocks an insurance mismatch before inserting a request, including while closed', async () => {
  client.insurance_type_label = 'Tricare';
  mocks.profile.mockResolvedValue({ agencyAvailability: { seesClients: true, acceptingNewClients: false, inPerson: true } });
  mocks.accepted.mockResolvedValue({ accepted: [{ name: 'Aetna' }], excluded: [] });
  await expect(createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 })).rejects.toThrow('Tricare');
  expect(claims).toHaveLength(0);
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.rollback).toHaveBeenCalledOnce();
});
it('allows a closed provider with accepted insurance to request after acknowledging the warnings', async () => {
  client.insurance_type_label = 'Tricare';
  mocks.profile.mockResolvedValue({ agencyAvailability: { seesClients: true, acceptingNewClients: false, inPerson: true } });
  await expect(createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 })).rejects.toMatchObject({ code: 'EXCHANGE_ACKNOWLEDGEMENT_REQUIRED' });
  const fit = await assertExchangeRequestEligible({ listing, userId: 10, database: { execute: mocks.execute } });
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10, acknowledgedWarnings: fit.adjustments.map(w => w.fingerprint) });
  expect(claims).toHaveLength(1);
});
it('rechecks insurance at approval and leaves a previously allowed request unassigned', async () => {
  client.insurance_type_label = 'Tricare';
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 });
  mocks.accepted.mockResolvedValue({ accepted: [], excluded: ['Tricare'] });
  vi.clearAllMocks();
  await expect(resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 8, actingRole: 'support' })).rejects.toThrow('Tricare');
  expect(mocks.ensure).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE clients'))).toBe(false);
  expect(mocks.commit).not.toHaveBeenCalled();
});
it('still allows the team to deny a now-ineligible request', async () => {
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 });
  mocks.accepted.mockRejectedValue(new Error('Should not check coverage for denial'));
  await expect(resolveExchangeClaim({ requestId: 1, action: 'deny', actingUserId: 8, actingRole: 'support' })).resolves.toBeDefined();
});

it('records age-warning acknowledgement, blocks assignment pending staff review, then honors the scoped waiver', async () => {
  listing.demographics_json = { ageBand: '8' };
  mocks.facets.mockResolvedValue(new Map([[10, { ageGroups: ['Adults (18+)'] }]]));
  await expect(createExchangeClaim({ listingId: 1, requestingProviderUserId: 10 })).rejects.toMatchObject({ code: 'EXCHANGE_ACKNOWLEDGEMENT_REQUIRED' });
  const fit = await assertExchangeRequestEligible({ listing, userId: 10, database: { execute: mocks.execute } });
  await createExchangeClaim({ listingId: 1, requestingProviderUserId: 10, acknowledgedWarnings: fit.adjustments.map(w => w.fingerprint) });
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('acknowledged_warnings_json'), [1, 10, null, expect.stringContaining('Client age: 8')]);
  await expect(resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 8, actingRole: 'support' })).rejects.toThrow('waive');
  expect(mocks.ensure).not.toHaveBeenCalled();
  const age = fit.checks.find(c => c.field === 'age');
  waivers = [{ id: 1, provider_user_id: 10, field: 'age', fingerprint: age.fingerprint, reason: 'Age coverage confirmed', waived_by_user_id: 8 }];
  await resolveExchangeClaim({ requestId: 1, action: 'approve', actingUserId: 8, actingRole: 'support' });
  expect(mocks.ensure).toHaveBeenCalled();
});
it('does not accept an old warning acknowledgement after the client age changes', async () => {
  listing.demographics_json = { ageBand: '8' };
  mocks.facets.mockResolvedValue(new Map([[10, { ageGroups: ['Adults (18+)'] }]]));
  const fit = await assertExchangeRequestEligible({ listing, userId: 10, database: { execute: mocks.execute } });
  listing.demographics_json = { ageBand: '7' };
  await expect(createExchangeClaim({ listingId: 1, requestingProviderUserId: 10, acknowledgedWarnings: fit.adjustments.map(w => w.fingerprint) })).rejects.toMatchObject({ code: 'EXCHANGE_ACKNOWLEDGEMENT_REQUIRED' });
  expect(claims).toHaveLength(0);
});
