import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
import { buildReferralTotals, getReferralTotals } from '../referralTotals.service.js';

const now = new Date('2026-11-14T01:56:00Z'); // Friday evening in Denver
const referral = (clientId, channel, receivedAt) => ({ clientId, channel, receivedAt });

it('counts children separately, deduplicates repeated packets, and excludes future records', () => {
  const report = buildReferralTotals([
    referral(1, 'paper', '2026-11-09T07:00:00Z'),
    referral(1, 'paper', '2026-11-12T12:00:00Z'),
    referral(2, 'online', '2026-11-11T02:47:53Z'),
    referral(3, 'online', '2026-11-11T02:47:53Z'),
    referral(4, 'online', '2026-11-11T02:47:54Z'),
    referral(5, 'paper', '2026-11-09T06:59:59Z'), // Sunday, previous week
    referral(6, 'online', '2026-11-14T01:41:10Z'), // Friday, despite UTC Saturday
    referral(7, 'paper', '2026-11-16T08:00:00Z')
  ], { now });
  expect(report.currentWeek).toEqual({ start: '2026-11-09', end: '2026-11-15', paper: 1, online: 4, total: 5 });
  expect(report.currentMonth.total).toBe(6);
  expect(report.yearTotal.total).toBe(6);
  expect(report.weekly[0]).toEqual(report.currentWeek);
  expect(report.weekly[1].paper).toBe(1);
});

it('keeps full Monday–Sunday weeks at year boundaries and calendar month/year totals', () => {
  const report = buildReferralTotals([
    referral(1, 'paper', '2025-12-31T20:00:00Z'),
    referral(2, 'online', '2026-01-01T20:00:00Z'),
    referral(3, 'paper', '2026-02-01T06:59:59Z'), // Jan 31 in Denver
    referral(4, 'online', '2026-02-01T07:00:00Z')
  ], { now });
  expect(report.weekly.at(-1)).toEqual({ start: '2025-12-29', end: '2026-01-04', paper: 1, online: 1, total: 2 });
  expect(report.monthly.find(p => p.start === '2026-01-01')).toMatchObject({ paper: 1, online: 1, total: 2 });
  expect(report.monthly.find(p => p.start === '2026-02-01')).toMatchObject({ online: 1, total: 1 });
  expect(report.yearTotal.total).toBe(3);
  expect(report.years).toEqual([2026, 2025]);
});

it('uses local midnight correctly in summer and through daylight saving changes', () => {
  const summer = buildReferralTotals([
    referral(1, 'paper', '2026-07-06T05:59:59Z'),
    referral(2, 'online', '2026-07-06T06:00:00Z')
  ], { now: new Date('2026-07-07T10:00:00Z') });
  expect(summer.currentWeek).toMatchObject({ start: '2026-07-06', paper: 0, online: 1 });
  const fall = buildReferralTotals([
    referral(1, 'paper', '2026-11-01T07:30:00Z'),
    referral(2, 'online', '2026-11-01T08:30:00Z')
  ], { now: new Date('2026-11-02T08:00:00Z') });
  expect(fall.weekly[1]).toMatchObject({ start: '2026-10-26', paper: 1, online: 1 });
});

it('shows zero periods, provides historical years, and does not show future months', () => {
  const report = buildReferralTotals([], { now });
  expect(report.currentWeek.total).toBe(0);
  expect(report.monthly).toHaveLength(11);
  expect(report.weekly[0].start).toBe('2026-11-09');
  expect(report.weekly.every(p => p.total === 0)).toBe(true);
  const historic = buildReferralTotals([], { now, year: 2024 });
  expect(historic.monthly).toHaveLength(12);
  expect(historic.monthly.find(p => p.start === '2024-02-01').end).toBe('2024-02-29');
  expect(historic.currentWeek.start).toBe('2026-11-09');
});

it('ignores missing or invalid timestamps rather than counting them as 1970 referrals', () => {
  const report = buildReferralTotals([
    referral(1, 'paper', null), referral(2, 'online', 'bad-date')
  ], { now });
  expect(report.yearTotal.total).toBe(0);
  expect(report.years).toEqual([2026]);
});

it('rejects invalid and future years before querying the database', async () => {
  mocks.execute.mockClear();
  for (const year of ['invalid', 2027, 1999, 2026.5]) {
    await expect(getReferralTotals({ agencyId: 2, year, now })).rejects.toMatchObject({ status: 400 });
  }
  expect(mocks.execute).not.toHaveBeenCalled();
});

it('uses tenant-bound parameters and returns counts without client details', async () => {
  mocks.execute.mockResolvedValueOnce([[referral(1, 'paper', '2026-11-10T12:00:00Z')]]);
  const report = await getReferralTotals({ agencyId: 2, now });
  expect(mocks.execute.mock.lastCall[1][0]).toBe(2);
  expect(report).toMatchObject({ agencyId: 2, currentWeek: { paper: 1, total: 1 } });
  expect(JSON.stringify(report)).not.toContain('clientId');
});
