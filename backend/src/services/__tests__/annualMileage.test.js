import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
import { mileageYearWindow, annualMileageLimit, summarizeAnnualMileage, getAnnualMileageReport, getSchoolMileageYearSummary } from '../annualMileage.service.js';
beforeEach(() => { mocks.execute.mockReset(); });
it('uses a half-open Jan 1 to Jan 1 range, including leap years', () => {
  expect(mileageYearWindow(2028)).toEqual({ year: 2028, start: '2028-01-01', endExclusive: '2029-01-01' });
  for (const value of ['x', 2026.2, 0]) expect(() => mileageYearWindow(value)).toThrow();
});
it('applies the $2,000 policy only to ITSCO', () => {
  expect(annualMileageLimit({ slug: 'itsco' })).toBe(2000);
  expect(annualMileageLimit({ slug: 'other', name: 'ITSCO' })).toBeNull();
});
it('does not count pending miles as paid dollars or double count approved and paid', () => {
  const result = summarizeAnnualMileage({ user_id: 8, submitted_count: 4, submitted_miles: 2100, approved_dollars: '300.25', paid_dollars: '1750.00' }, 2000);
  expect(result).toMatchObject({ submittedMiles: 2100, paidDollars: 1750, approvedDollars: 300.25, remainingDollars: 250, committedDollars: 2050.25, overLimitDollars: 50.25, status: 'committed' });
  expect(summarizeAnnualMileage({ paid_dollars: 2000 }, 2000).status).toBe('reached');
  expect(summarizeAnnualMileage({ paid_dollars: 1800 }, 2000).status).toBe('approaching');
});
it('scopes report to tenant and trip year and excludes rejected claims', async () => {
  mocks.execute.mockResolvedValueOnce([[{ user_id: 4, name: 'Example', approved_dollars: 50 }]])
    .mockResolvedValueOnce([[{ user_id: 4, name: 'Example', paid_dollars: 250 }, { user_id: 5, name: 'Manual only', paid_dollars: 2000 }]]);
  const report = await getAnnualMileageReport({ agencyId: 2, agency: { slug: 'itsco' }, year: 2026 });
  const [sql, params] = mocks.execute.mock.calls[0];
  expect(params).toEqual([2, '2026-01-01', '2027-01-01']);
  expect(sql).toContain("c.status IN ('submitted', 'approved', 'paid')");
  expect(sql).toContain('c.agency_id = ?');
  expect(report).toMatchObject({ limitDollars: 2000, trackingOnly: true, basis: 'payroll_period_end', claimBasis: 'drive_date' });
  expect(report.people[0]).toMatchObject({ paidDollars: 250, committedDollars: 300 });
  expect(report.people[1]).toMatchObject({ paidDollars: 2000, status: 'reached' });
  expect(mocks.execute.mock.calls[1][0]).toContain("$.__adjustments.mileageAmount");
  expect(sql).toContain("COALESCE(p.status,'draft') NOT IN ('posted','finalized')");
});
it('supervisor snapshot contains counts/miles only, no private limit or dollar totals', async () => {
  mocks.execute.mockResolvedValue([[{ claim_count: 2, miles: '43.50' }]]);
  expect(await getSchoolMileageYearSummary({ agencyId: 2, userId: 8, year: 2026 })).toEqual({ year: 2026, claimCount: 2, miles: 43.5 });
  expect(mocks.execute.mock.calls[0][1]).toEqual([2, 8, '2026-01-01', '2027-01-01']);
});
