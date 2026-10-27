import { beforeEach, expect, it, vi } from 'vitest';
import { listProvidersForSupport } from '../supportProviderDirectory.service.js';
import User from '../../models/User.model.js';
import pool from '../../config/database.js';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
const user = { id: 1434, role: 'support' };
beforeEach(() => {
  vi.resetAllMocks();
  User.getAgencies.mockResolvedValue([{ id: 450 }]);
  pool.execute.mockResolvedValue([[{ supervisee_id: 1433, supervisee_first_name: 'Avery', supervisee_last_name: 'QA', agency_name: 'ITSCOLLC', email: 'not-returned@example.com', password_hash: 'not-returned' }]]);
});
it.each(['support', 'provider_plus'])('allows %s a minimal provider list limited to membership', async role => {
  const result = await listProvidersForSupport({ user: { ...user, role }, agencyId: '450' });
  expect(result).toEqual([{ supervisee_id: 1433, supervisee_first_name: 'Avery', supervisee_last_name: 'QA', agency_name: 'ITSCOLLC', supervisee_profile_photo_url: null }]);
  expect(pool.execute.mock.calls[0][1]).toEqual([450]);
});
it('rejects another agency before reading its providers', async () => {
  await expect(listProvidersForSupport({ user, agencyId: 2 })).rejects.toMatchObject({ status: 403 });
  expect(pool.execute).not.toHaveBeenCalled();
});
it('uses only memberships when the agency filter is omitted', async () => {
  await listProvidersForSupport({ user });
  expect(pool.execute.mock.calls[0][1]).toEqual([450]);
});
it('returns no providers for an account without memberships', async () => {
  User.getAgencies.mockResolvedValue([]);
  expect(await listProvidersForSupport({ user })).toEqual([]);
  expect(pool.execute).not.toHaveBeenCalled();
});
it.each(['450oops', '0', '-1'])('rejects malformed scope %s', async agencyId => {
  await expect(listProvidersForSupport({ user, agencyId })).rejects.toMatchObject({ status: 400 });
  expect(User.getAgencies).not.toHaveBeenCalled();
});
it.each(['client_guardian', 'provider'])('does not grant %s support directory access', async role => {
  await expect(listProvidersForSupport({ user: { ...user, role } })).rejects.toMatchObject({ status: 403 });
  expect(User.getAgencies).not.toHaveBeenCalled();
});
