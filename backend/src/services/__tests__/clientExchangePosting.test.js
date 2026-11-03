import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), coverage:vi.fn() }));
vi.mock('../clientCoverageAdmission.service.js',()=>({assertClientCoverageAdmission:mocks.coverage}));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => ({ execute: mocks.execute, beginTransaction: mocks.begin, commit: mocks.commit, rollback: mocks.rollback, release: mocks.release }) } }));
import { insertExchangeListing } from '../clientExchangePosting.service.js';
let client, existing, assignments;
const args = { agencyId: 2, clientId: 12, postedByUserId: 7, onlyUnassigned: true, summary: { preferences: {modality:'virtual',insurance:'Medicaid',schedule:{days:['Monday'],periods:['morning']}}, diagnoses: ['F41.1'], presentingProblems: ['Concern'] } };
beforeEach(() => {
  vi.clearAllMocks(); client = { id: 12, agency_id: 2, provider_id: null, status: 'ACTIVE' }; existing = []; assignments = [];
  mocks.coverage.mockResolvedValue({ready:true});
  mocks.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT id, agency_id')) return [[client]];
    if (sql.includes('SELECT id FROM client_exchange_listings')) return [existing];
    if (sql.includes('SELECT id FROM client_provider_assignments')) return [assignments];
    return [{ insertId: 5 }];
  });
});
it('blocks a new Exchange listing before inserts when current insurance is not verified',async()=>{
 mocks.coverage.mockRejectedValueOnce(Object.assign(Error('Insurance verification required'),{status:409,code:'INSURANCE_VERIFICATION_REQUIRED'}));
 await expect(insertExchangeListing(args)).rejects.toMatchObject({status:409,code:'INSURANCE_VERIFICATION_REQUIRED'});
 expect(mocks.execute.mock.calls.some(([sql])=>/^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false);expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
});
it('locks the client and commits the clinical snapshot with its audit record', async () => {
  expect(await insertExchangeListing(args)).toMatchObject({ listingId: 5, created: true });
  expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_exchange_listings'), expect.arrayContaining(['["F41.1"]', '["Concern"]']));
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_status_history'), [12, 7, 'Posted to Client Exchange for reassignment']);
  expect(mocks.commit).toHaveBeenCalledOnce();
});
it('reuses an open/requested listing on retry without inserting another', async () => {
  existing = [{ id: 4 }]; expect(await insertExchangeListing(args)).toMatchObject({ listingId: 4, created: false });
  expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
it('rejects primary or secondary assignments for one-click posting', async () => {
  client.provider_id = 9; await expect(insertExchangeListing(args)).rejects.toThrow('already assigned');
  client.provider_id = null; assignments = [{ id: 1 }]; await expect(insertExchangeListing(args)).rejects.toThrow('already assigned');
  expect(mocks.commit).not.toHaveBeenCalled();
});
it('rejects cross-agency or archived clients and rolls back failed audit writes', async () => {
  client.agency_id = 3; await expect(insertExchangeListing(args)).rejects.toThrow('this agency');
  client.agency_id = 2; client.status = 'ARCHIVED'; await expect(insertExchangeListing(args)).rejects.toThrow('Archived');
  client.status = 'ACTIVE'; const normal = mocks.execute.getMockImplementation();
  mocks.execute.mockImplementation(async (sql, params) => { if (sql.includes('INSERT INTO client_status_history')) throw new Error('Audit failed'); return normal(sql, params); });
  await expect(insertExchangeListing(args)).rejects.toThrow('Audit failed');
  expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.rollback).toHaveBeenCalledTimes(3);
});
it('preserves scheduling preferences on the client in the same transaction as posting', async () => {
  const schedule = { days: ['Wednesday'], periods: ['after_school'], windows: [], timezone: 'America/Denver' };
  await insertExchangeListing({ ...args, summary: { ...args.summary, preferences: { ...args.summary.preferences, schedule } } });
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('JSON_SET'), [JSON.stringify(schedule), 12, 2]);
  expect(mocks.commit).toHaveBeenCalledOnce();
});

it('saves fit selections for future referrals in the posting transaction',async()=>{
 const matchingPreferences={specialties:['Depression'],modalities:['EMDR']};
 await insertExchangeListing({...args,summary:{...args.summary,preferences:{...args.summary.preferences,matchingPreferences}}});
 expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("'$.matchingPreferences'"),[JSON.stringify(matchingPreferences),12,2]);expect(mocks.commit).toHaveBeenCalledOnce();
});

it('queues notifications atomically so posting does not wait for a provider-by-provider email run',async()=>{
  await insertExchangeListing(args);expect(mocks.execute).toHaveBeenCalledWith('INSERT INTO client_exchange_delivery_runs (listing_id,agency_id) VALUES (?,?)',[5,2]);
  const normal=mocks.execute.getMockImplementation();mocks.commit.mockClear();mocks.execute.mockImplementation(async(sql,params)=>{if(sql.includes('INSERT INTO client_exchange_delivery_runs'))throw Error('queue unavailable');return normal(sql,params);});
  await expect(insertExchangeListing(args)).rejects.toThrow('queue unavailable');expect(mocks.commit).not.toHaveBeenCalled();expect(mocks.rollback).toHaveBeenCalled();
});

it('saves the requested service location for later referrals', async () => {
  await insertExchangeListing({ ...args, summary: { ...args.summary, preferences: { ...args.summary.preferences, serviceLocation: 'Colorado Springs' } } });
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("'$.serviceLocation'"), ['"Colorado Springs"', 12, 2]);
});
it('keeps reviewed gender, format and license choices on the chart, including a cleared preference', async () => {
  await insertExchangeListing({ ...args, summary: { ...args.summary, preferences: { ...args.summary.preferences, modality: 'virtual', providerGender: null, providerQualification: 'independent' } } });
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("'$.preferredModality'"), ['"virtual"',12,2]);
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("'$.preferredProviderGender'"), ['null',12,2]);
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("'$.providerQualification'"), ['"independent"',12,2]);
});

it('does not require coverage verification for a persisted manual Exchange add',async()=>{
 client.source='ADMIN_CREATED';client.intake_preferences_json={exchangeReferral:{requestId:'11111111-1111-4111-8111-111111111111'}};
 mocks.coverage.mockRejectedValue(Error('Insurance not verified'));
 await expect(insertExchangeListing(args)).resolves.toMatchObject({created:true});
 expect(mocks.coverage).not.toHaveBeenCalled();
});
