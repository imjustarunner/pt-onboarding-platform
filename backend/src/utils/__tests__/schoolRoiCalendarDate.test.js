import { expect, it } from 'vitest';
import { schoolRoiCalendarDates, schoolRoiSignedTimestamp } from '../schoolRoiCalendarDate.js';

it('stores the agency calendar date rather than tomorrow’s UTC date at evening signing', () => {
  const instant = '2026-11-08T05:21:49Z';
  expect(schoolRoiCalendarDates(instant, 'America/Denver')).toEqual({ effectiveDate: '2026-11-07', roiExpiresAt: '2029-11-07' });
  expect(schoolRoiCalendarDates(instant, 'America/New_York')).toEqual({ effectiveDate: '2026-11-08', roiExpiresAt: '2029-11-08' });
  expect(schoolRoiSignedTimestamp(instant, 'America/Denver')).toMatch(/November 7, 2026.*10:21:49 PM MST/);
});
it('formats database UTC timestamps consistently and retains daylight-saving timezone labels', () => {
  expect(schoolRoiSignedTimestamp('2026-11-08 05:21:49')).toBe(schoolRoiSignedTimestamp('2026-11-08T05:21:49Z'));
  expect(schoolRoiSignedTimestamp('2026-07-02T03:00:00Z')).toMatch(/July 1, 2026.*9:00:00 PM MDT/);
});
it('does not mutate the signed instant or fabricate an invalid date', () => {
  const signed = new Date('2026-11-08T05:21:49Z');schoolRoiCalendarDates(signed);
  expect(signed.toISOString()).toBe('2026-11-08T05:21:49.000Z');
  expect(() => schoolRoiCalendarDates('invalid')).toThrow('signedAt is invalid');
});
