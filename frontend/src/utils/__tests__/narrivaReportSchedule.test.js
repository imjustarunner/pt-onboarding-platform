import { describe, expect, it } from 'vitest';
import { reportScheduleStatus, scheduledReportPeriod } from '../narrivaReportSchedule';

const settings = { enabled: true, cadence: 'quarterly', nextRunAt: '2027-01-01T07:00:00Z' };
const billing = { canRun: true, priceAccepted: true, priceCents: 0 };
describe('scheduled compliance report display', () => {
  it('shows a first Q1 2027 run reviewing the preceding quarter', () => {
    expect(scheduledReportPeriod(settings)).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    expect(scheduledReportPeriod({ ...settings, nextRunAt: '2027-04-01T07:00:00Z' })).toEqual({ start: '2027-01-01', end: '2027-03-31' });
  });
  it('matches monthly, annual and custom worker windows across leap years and DST', () => {
    expect(scheduledReportPeriod({ ...settings, cadence: 'monthly', nextRunAt: '2028-03-31T07:00:00Z' })).toEqual({ start: '2028-02-29', end: '2028-03-30' });
    expect(scheduledReportPeriod({ ...settings, cadence: 'annual', nextRunAt: '2028-02-29T07:00:00Z' })).toEqual({ start: '2027-02-28', end: '2028-02-28' });
    expect(scheduledReportPeriod({ ...settings, cadence: 'custom', intervalDays: 14, nextRunAt: '2027-03-21T07:00:00Z' })).toEqual({ start: '2027-03-07', end: '2027-03-20' });
    expect(scheduledReportPeriod({ ...settings, cadence: 'manual' })).toBeNull();
    expect(scheduledReportPeriod({ ...settings, nextRunAt: null })).toBeNull();
  });
  it('counts actual time remaining across the year boundary', () => {
    expect(reportScheduleStatus(settings, billing, Date.parse('2026-12-31T06:58:00Z'))).toMatchObject({ state: 'scheduled', countdown: '1 day · 0 hours · 2 minutes' });
    expect(reportScheduleStatus(settings, billing, Date.parse('2027-01-01T06:59:30Z')).countdown).toBe('1 minute');
  });
  it('shows due status without claiming completion or a negative countdown', () => {
    for (const now of ['2027-01-01T07:00:00Z', '2027-01-02T07:00:00Z']) {
      const status = reportScheduleStatus(settings, billing, Date.parse(now));
      expect(status.state).toBe('due'); expect(status.countdown).toBeUndefined(); expect(status.title).not.toContain('completed');
    }
  });
  it('does not promise an automatic run for disabled, manual, paused or missing schedules', () => {
    for (const [config, quote, state] of [
      [{ ...settings, enabled: false }, billing, 'off'],
      [{ ...settings, cadence: 'manual' }, billing, 'manual'],
      [settings, { ...billing, canRun: false }, 'paused'],
      [settings, { ...billing, priceAccepted: false }, 'paused'],
      [{ ...settings, nextRunAt: 'invalid' }, billing, 'unscheduled']
    ]) {
      const status = reportScheduleStatus(config, quote, 0); expect(status.state).toBe(state); expect(status.countdown).toBeUndefined();
    }
  });
});
