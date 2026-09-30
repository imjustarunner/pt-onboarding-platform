import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => ({ execute: mocks.execute, beginTransaction: mocks.begin, commit: mocks.commit, rollback: mocks.rollback, release: mocks.release }) } }));
import { insertExchangeListing } from '../clientExchangePosting.service.js';
let client, existing, assignments;
const args = { agencyId: 2, clientId: 12, postedByUserId: 7, onlyUnassigned: true, summary: { diagnoses: ['F41.1'], presentingProblems: ['Concern'] } };
beforeEach(() => {
  vi.clearAllMocks(); client = { id: 12, agency_id: 2, provider_id: null, status: 'ACTIVE' }; existing = []; assignments = [];
  mocks.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT id, agency_id')) return [[client]];
    if (sql.includes('SELECT id FROM client_exchange_listings')) return [existing];
    if (sql.includes('SELECT id FROM client_provider_assignments')) return [assignments];
    return [{ insertId: 5 }];
  });
});
it('locks the client and commits the clinical snapshot with its audit record', async () => {
  expect(await insertExchangeListing(args)).toMatchObject({ listingId: 5, created: true });
  expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_exchange_listings'), expect.arrayContaining(['["F41.1"]', '["Concern"]']));
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_status_history'), [12, 7]);
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
