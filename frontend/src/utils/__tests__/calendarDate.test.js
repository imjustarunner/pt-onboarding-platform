import { describe, expect, it, vi } from 'vitest';
const prefs = vi.hoisted(() => ({ timezone: 'America/Denver', dateFormat: 'MM/DD' }));
vi.mock('../../store/userPreferences', () => ({ useUserPreferencesStore: () => prefs }));
import { formatDate, formatAuditTimestamp, todayCalendarDate } from '../formatDate.js';
describe('calendar dates remain calendar dates', () => {
  it.each(['America/Denver', 'Pacific/Honolulu', 'Pacific/Kiritimati'])('preserves DOB and plan date in %s', timezone => {
    prefs.timezone = timezone;
    expect(formatDate('2015-05-18')).toBe('05/18/2015');
    expect(formatDate('2015-05-18T00:00:00.000Z')).toBe('05/18/2015');
    expect(formatDate(new Date('2026-11-07T00:00:00Z'))).toBe('11/07/2026');
  });
  it('still converts an audit instant to the requested timezone', () => {
    expect(formatAuditTimestamp('2026-11-07T00:00:00Z', { timeZone: 'America/Denver' })).toContain('Nov 6, 2026');
  });
  it('offers the local day in evening forms after the UTC day has changed', () => {
    expect(todayCalendarDate(new Date('2026-11-08T03:00:00Z'),'America/Denver')).toBe('2026-11-07');
  });
});
