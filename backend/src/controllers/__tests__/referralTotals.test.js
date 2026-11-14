import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getAgencies: vi.fn(), getTotals: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: mocks.getAgencies } }));
vi.mock('../../services/referralTotals.service.js', () => ({ getReferralTotals: mocks.getTotals }));
import { getDashboardReferralTotals } from '../referralTotals.controller.js';

beforeEach(() => { vi.resetAllMocks(); mocks.getAgencies.mockResolvedValue([{ id: 2 }]); });
const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
const request = (query = {}, role = 'admin') => ({ user: { id: 7, role }, query: { agencyId: '2', ...query } });

it.each(['admin', 'support'])('blocks %s from another tenant before reading its totals', async role => {
  const res = response();
  await getDashboardReferralTotals(request({ agencyId: '3' }, role), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(mocks.getTotals).not.toHaveBeenCalled();
});
it.each(['', '-1', '2bad', '2.5'])('rejects invalid agency ID %s', async agencyId => {
  const res = response();
  await getDashboardReferralTotals(request({ agencyId }), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mocks.getTotals).not.toHaveBeenCalled();
});
it('allows agency members and passes the selected year', async () => {
  mocks.getTotals.mockResolvedValue({ currentWeek: { total: 21 } });
  const res = response();
  await getDashboardReferralTotals(request({ year: '2025' }), res, vi.fn());
  expect(mocks.getTotals).toHaveBeenCalledWith({ agencyId: 2, year: '2025' });
  expect(res.json).toHaveBeenCalledWith({ currentWeek: { total: 21 } });
});
it('allows super admins to select a tenant', async () => {
  mocks.getTotals.mockResolvedValue({});
  await getDashboardReferralTotals(request({ agencyId: '3' }, 'super_admin'), response(), vi.fn());
  expect(mocks.getAgencies).not.toHaveBeenCalled();
  expect(mocks.getTotals).toHaveBeenCalledWith({ agencyId: 3, year: undefined });
});
it('reports validation failures and propagates database failures instead of reporting zero', async () => {
  const res = response(); const next = vi.fn();
  mocks.getTotals.mockRejectedValueOnce(Object.assign(new Error('Invalid year'), { status: 400 }));
  await getDashboardReferralTotals(request(), res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  const failure = new Error('Database unavailable');
  mocks.getTotals.mockRejectedValueOnce(failure);
  await getDashboardReferralTotals(request(), response(), next);
  expect(next).toHaveBeenCalledWith(failure);
});
