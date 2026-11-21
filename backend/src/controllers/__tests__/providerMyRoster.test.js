import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import { getProviderMyRoster } from '../schoolPortal.controller.js';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() }, onTableWrite: vi.fn() }));

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  pool.execute.mockResolvedValue([[]]);
  vi.spyOn(Agency, 'findById').mockResolvedValue({ id: 9, name: 'Synthetic School' });
  vi.spyOn(User, 'getAgencies').mockResolvedValue([]);
  vi.spyOn(User, 'findById').mockResolvedValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('lets a super admin open their own provider roster without a provider override', async () => {
  const res = response();
  const next = vi.fn();
  await getProviderMyRoster({ params: { organizationId: '9' }, user: { role: 'super_admin', id: 21 }, query: {} }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith([]);
  const roster = pool.execute.mock.calls.find(([sql]) => sql.includes('legacy_provider_id') && sql.includes('FROM clients'));
  expect(roster?.[1]).toContain(21);
});

it('checks school access before a provider can request its entire waitlist', async () => {
  const res = response();
  const next = vi.fn();
  await getProviderMyRoster({ params: { organizationId: '9' }, user: { role: 'provider', id: 21 }, query: { view: 'waitlist' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('ORDER BY COALESCE(c.waitlist_started_at'))).toBe(false);
});
