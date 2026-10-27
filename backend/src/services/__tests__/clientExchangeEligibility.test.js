import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), profile: vi.fn(), coverage: vi.fn(), summary: vi.fn(), availability: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, slug: 'itsco' }) } }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: { getForProvider: mocks.profile } }));
vi.mock('../providerAcceptedInsurance.service.js', () => ({ listProviderAcceptedInsurancesForDisplay: mocks.coverage }));
vi.mock('../providerClinicalFacets.service.js', () => ({ listClinicalFacetsForUsers: async () => new Map() }));
vi.mock('../clientExchangeSummary.service.js', () => ({ loadClientExchangeSummary: mocks.summary }));
vi.mock('../providerAvailability.service.js', () => ({ default: { computeWeekAvailability: mocks.availability } }));
import { assertExchangeRequestEligible, exchangeProviderAudit, loadExchangeOpenings } from '../clientExchangeEligibility.service.js';
const listing = { id: 11, agency_id: 2, client_id: 3, preferences_json: { insurance: 'Aetna' } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT c.*')) return [[{ id: 3, agency_id: 2, insurance_type_label: 'Tricare' }]];
    if (sql.startsWith('SELECT u.*')) return [[{ id: args[0], role: 'provider' }]];
    return [[]];
  });
  mocks.profile.mockResolvedValue({ details: { inPersonEnabled: true } });
  mocks.coverage.mockResolvedValue({ accepted: [{ name: 'Aetna' }], excluded: [] });
  mocks.summary.mockResolvedValue({ preferences: { insurance: 'Tricare' }, demographics: {}, diagnoses: [], presentingProblems: [] });
});
it('uses current chart coverage instead of an older listing or a provider-supplied override', async () => {
  await expect(assertExchangeRequestEligible({ listing, userId: 10 })).rejects.toThrow('Tricare');
  mocks.coverage.mockResolvedValue({ accepted: [{ name: 'Tricare West', aliases: ['Tricare'] }], excluded: [] });
  await expect(assertExchangeRequestEligible({ listing, userId: 10 })).resolves.toMatchObject({ canRequest: true });
  mocks.coverage.mockResolvedValue({ accepted: [{ name: 'Tricare' }], excluded: ['Tricare'] });
  await expect(assertExchangeRequestEligible({ listing, userId: 10 })).rejects.toThrow('Tricare');
});
it('omits former, inactive and demo providers from current matching while keeping closed providers', async () => {
  const users = [
    { id: 10, first_name: 'Current', role: 'provider' }, { id: 11, role: 'provider', is_demo: 1 },
    { id: 12, role: 'provider', is_active: 0 }, { id: 13, role: 'provider', status: 'TERMINATED_PENDING' }
  ];
  mocks.execute.mockImplementation(async (sql, args) => [sql.startsWith('SELECT DISTINCT') ? users : users.filter(user => user.id === args[0])]);
  mocks.profile.mockResolvedValue({ agencyAvailability: { seesClients: true, inPerson: true, acceptingNewClients: false } });
  const audit = await exchangeProviderAudit({ listing: { preferences: { insurance: 'Aetna' } }, agencyId: 2 });
  expect(audit.providers.map(provider => provider.providerUserId)).toEqual([10]);
  expect(audit.providers[0].fit).toMatchObject({ status: 'not_match', canRequest: true, canNotify: false });
  const sql = mocks.execute.mock.calls[0][0];
  expect(sql).toContain('COALESCE(ua.is_active, 1) = 1');
  expect(sql).toContain('TERMINATED');
});
it('checks four weeks of published openings without creating reservations or materializing schedules', async () => {
  mocks.execute.mockResolvedValue([[{ id: 4, city: 'Denver' }]]);
  mocks.availability.mockResolvedValue({ inPersonSlots: [{ buildingId: 4, startAt: '2026-10-28T00:00:00Z' }], virtualSlots: [] });
  const openings = await loadExchangeOpenings({ userId: 10, agencyId: 2, now: new Date('2026-10-26') });
  expect(openings).toHaveLength(4); expect(openings[0]).toMatchObject({ format: 'IN_PERSON', city: 'Denver' });
  expect(mocks.availability).toHaveBeenCalledTimes(4);
  expect(mocks.availability).toHaveBeenCalledWith(expect.objectContaining({ materializeOfficeEvents: false, intakeOnly: true }));
});
