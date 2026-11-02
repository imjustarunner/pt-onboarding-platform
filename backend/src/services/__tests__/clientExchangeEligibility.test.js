import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), profile: vi.fn(), coverage: vi.fn(), summary: vi.fn(), availability: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, slug: 'itsco' }) } }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: { getForProvider: mocks.profile } }));
vi.mock('../providerAcceptedInsurance.service.js', () => ({ listProviderAcceptedInsurancesForDisplay: mocks.coverage }));
vi.mock('../providerClinicalFacets.service.js', () => ({ listClinicalFacetsForUsers: async () => new Map() }));
vi.mock('../clientExchangeSummary.service.js', () => ({ loadClientExchangeSummary: mocks.summary }));
vi.mock('../providerAvailability.service.js', () => ({ default: { computeWeekAvailability: mocks.availability } }));
import { assertExchangeRequestEligible, exchangeProviderAudit, loadExchangeOpenings, evaluateCurrentExchangeFit } from '../clientExchangeEligibility.service.js';
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
  expect(openings.slots).toHaveLength(1); expect(openings.slots[0]).toMatchObject({ format: 'IN_PERSON', city: 'Denver' });
  expect(mocks.availability).toHaveBeenCalledTimes(1);
  expect(mocks.availability).toHaveBeenCalledWith(expect.objectContaining({ weekCount: 4, materializeOfficeEvents: false, intakeOnly: true }));
});
it('does not compute four calendars when no publication exists, and keeps an unverified possible match', async () => {
  mocks.execute.mockResolvedValue([[{ published: 0 }]]);
  const fit = await evaluateCurrentExchangeFit({ context: { user: { id: 10, sees_clients: 1, provider_accepting_new_clients: 1 }, profile: { details: { virtualEnabled: true } }, waivers: [] },
    listing: { agencyId: 2, preferences: { modality: 'virtual', schedule: { days: ['Tuesday'] } } } });
  expect(fit).toMatchObject({ matched: true, canRequest: true, canAssign: false });
  expect(fit.checks.find(c => c.field === 'schedule')).toMatchObject({ status: 'unknown' });
  expect(mocks.availability).not.toHaveBeenCalled();
});
it('distinguishes unpublished calendars from published times that are busy', async () => {
  mocks.execute.mockResolvedValue([[{ published: 1 }]]);
  mocks.availability.mockResolvedValue({ inPersonSlots: [], virtualSlots: [], diagnostics: [{ endAt: '2026-10-28T18:00:00Z', reasons: ['Client appointment'] }] });
  expect(await loadExchangeOpenings({ userId: 10, agencyId: 2, now: new Date('2026-10-26') })).toMatchObject({ slots: [], availabilityKnown: true });
  mocks.availability.mockResolvedValue({ inPersonSlots: [], virtualSlots: [], diagnostics: [] });
  expect(await loadExchangeOpenings({ userId: 10, agencyId: 2, now: new Date('2026-10-26') })).toMatchObject({ slots: [], availabilityKnown: false });
});
it('reads the whole window once, including shared agency schedules', async () => {
  mocks.execute.mockResolvedValue([[{ published: 1 }]]);
  mocks.availability.mockResolvedValue({ virtualSlots: [{ startAt: '2026-10-27T18:00:00Z', endAt: '2026-10-27T19:00:00Z' }] });
  const result = await loadExchangeOpenings({ userId: 10, agencyId: 2, scheduleAgencyId: 3, now: new Date('2026-10-26') });
  expect(result.availabilityKnown).toBe(true);
  expect(mocks.availability).toHaveBeenCalledTimes(1);
  expect(mocks.execute.mock.calls[0][1].slice(0,3)).toEqual([10,2,3]);
});
it('does not notify on a calendar lookup failure', async () => {
  mocks.execute.mockRejectedValue(new Error('Database unavailable'));
  const fit = await evaluateCurrentExchangeFit({ context: { user: { id: 10 }, profile: {}, waivers: [] }, listing: { agencyId: 2, preferences: { schedule: { days: ['Tuesday'] } } } });
  expect(fit.canNotify).toBe(false);
  expect(fit.checks.find(c => c.field === 'schedule').status).toBe('unknown');
});
