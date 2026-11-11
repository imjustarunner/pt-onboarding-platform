import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), listing: vi.fn(), provider: vi.fn(), fit: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m } }));
vi.mock('../clientExchange.service.js', () => ({ getListingForMatching: m.listing }));
vi.mock('../clientExchangeEligibility.service.js', () => ({ loadExchangeProvider: m.provider, evaluateCurrentExchangeFit: m.fit }));
import { changeExchangeWaiver, loadExchangeWaivers, loadExchangeWaiversBatch } from '../clientExchangeWaivers.service.js';
const input = { listingId: 11, agencyId: 2, providerUserId: 10, actor: { id: 7, role: 'support' }, field: 'age', fingerprint: 'current', reason: 'Discussed age coverage with the provider' };
beforeEach(() => {
  vi.clearAllMocks(); m.listing.mockResolvedValue({ id: 11, agencyId: 2 }); m.provider.mockResolvedValue({ user: { id: 10 } });
  m.fit.mockResolvedValue({ checks: [{ field: 'age', status: 'fail', reason: 'Age 8 is outside the listed ages', fingerprint: 'current', canWaive: true }] });
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT * FROM client_exchange_listings') ? [[{ id: 11, agency_id: 2, status: 'open' }]] : [{ affectedRows: 1 }]);
});
it('records the current failure, reason and staff actor in a transaction', async () => {
  await changeExchangeWaiver(input);
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_exchange_match_waivers'), [11, 10, 'age', 'current', 'fail', 'Age 8 is outside the listed ages', input.reason, 7]);
  expect(m.commit).toHaveBeenCalledOnce(); expect(m.rollback).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
});
it.each(['insurance', 'insurance_credential', 'insurance_exclusions', 'account', 'direct_referral'])('does not waive protected %s checks', async field => {
  m.fit.mockResolvedValue({ checks: [{ field, canWaive: false, status: 'fail', fingerprint: 'current' }] });
  await expect(changeExchangeWaiver({ ...input, field })).rejects.toThrow('cannot be waived');
  expect(m.commit).not.toHaveBeenCalled(); expect(m.rollback).toHaveBeenCalledOnce();
});
it('rejects stale checks, missing reasons and nonstaff actors', async () => {
  await expect(changeExchangeWaiver({ ...input, fingerprint: 'old' })).rejects.toThrow('changed');
  await expect(changeExchangeWaiver({ ...input, reason: '' })).rejects.toMatchObject({ status: 400 });
  await expect(changeExchangeWaiver({ ...input, actor: { id: 10, role: 'provider' } })).rejects.toMatchObject({ status: 403 });
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
it('rejects another agency and closed listings before loading matching details', async () => {
  await expect(changeExchangeWaiver({ ...input, agencyId: 99 })).rejects.toMatchObject({ status: 404 });
  m.execute.mockResolvedValue([[{ id: 11, agency_id: 2, status: 'closed' }]]);
  await expect(changeExchangeWaiver(input)).rejects.toThrow('available listings'); expect(m.fit).not.toHaveBeenCalled();
});
it('removes only the requested active waiver and preserves its history', async () => {
  await changeExchangeWaiver({ ...input, revokeId: 4 });
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ? AND listing_id = ? AND provider_user_id = ?'), [7, 4, 11, 10]);
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false); expect(m.fit).not.toHaveBeenCalled();
});
it('loads waivers only for the requested listing and provider', async () => {
  m.execute.mockResolvedValue([[{ id: 4, provider_user_id: 10, field: 'age', fingerprint: 'current', waived_by_name: 'Support Person' }]]);
  const rows = await loadExchangeWaivers({ listingId: 11, userId: 10 });
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('AND w.provider_user_id = ? AND w.revoked_at IS NULL'), [11, 10]);
  expect(rows[0]).toMatchObject({ id: 4, field: 'age', waivedByName: 'Support Person' });
});

it('batches current personal waivers with agency, viewer, active-evidence and bounded listing restrictions',async()=>{const execute=vi.fn(async()=>[[{id:4,listing_id:11,provider_user_id:10,field:'age',fingerprint:'current'}]]);const result=await loadExchangeWaiversBatch({listingIds:[11,11,12,-1,'bad'],agencyId:2,userId:10,database:{execute}});expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0][0]).toContain('JOIN client_exchange_listings l ON l.id=w.listing_id');expect(execute.mock.calls[0][0]).toContain('l.agency_id=? AND w.provider_user_id=? AND w.revoked_at IS NULL');expect(execute.mock.calls[0][1]).toEqual([2,10,11,12]);expect(result.get(11)[0]).toMatchObject({id:4,providerUserId:10,field:'age'});expect(result.get(12)).toBeUndefined();});
it('bounds batch size and does not query with an invalid viewer or no listings',async()=>{const execute=vi.fn(async()=>[[]]);await loadExchangeWaiversBatch({listingIds:Array.from({length:205},(_,i)=>i+1),agencyId:2,userId:10,database:{execute}});expect(execute.mock.calls.map(([,values])=>values.length)).toEqual([102,102,7]);execute.mockClear();await loadExchangeWaiversBatch({listingIds:[11],agencyId:2,userId:0,database:{execute}});await loadExchangeWaiversBatch({listingIds:[],agencyId:2,userId:10,database:{execute}});expect(execute).not.toHaveBeenCalled();});
