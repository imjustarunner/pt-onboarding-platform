import { describe, it, expect } from 'vitest';
import { interviewCalendar } from '../../utils/interviewCalendar.js';
import { isAssignableSupervisor } from '../../utils/staffEligibility.js';
describe('interview calendar', () => {
  const input = { startsAt: '2026-09-19T21:00:00Z', endsAt: '2026-09-19T22:00:00Z', timezone: 'America/Denver', title: 'Interview — Jordan', publicJoinUrl: 'https://app.itsco.health/join/team-meeting/opaque-token', interviewId: 7 };
  it('uses human local time while calendars preserve the absolute instant', () => {
    const c = interviewCalendar(input);
    expect(c.whenLabel).toContain('3:00 PM MDT');
    expect(c.ics).toContain('DTSTART:20260919T210000Z\r\nDTEND:20260919T220000Z');
    expect(c.googleUrl).toContain('ctz=America%2FDenver');
    expect(c.outlookUrl).toContain('2026-09-19T21%3A00%3A00.000Z');
    expect(c.downloadUrl).toBe('https://app.itsco.health/api/team-meetings/opaque-token/calendar.ics');
  });
  it('folds unicode safely and escapes event text without injecting another event', () => {
    const c = interviewCalendar({ ...input, title: '漢字'.repeat(90) + '\nEND:VEVENT,;' });
    expect(c.ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(c.ics.match(/^END:VEVENT$/gm)).toHaveLength(1);
    expect(c.ics.replace(/\r\n /g, '')).toContain('\\nEND:VEVENT\\,\\;');
  });
});
describe('supervisor eligibility', () => {
  it('requires the supervisor flag on an active employee', () => {
    expect(isAssignableSupervisor({ role: 'provider', status: 'ACTIVE_EMPLOYEE', is_active: 1, has_supervisor_privileges: 1 })).toBe(true);
    for (const role of ['client_guardian', 'client', 'child', 'family', 'school_staff']) expect(isAssignableSupervisor({ role, has_supervisor_privileges: 1, status: 'ACTIVE' })).toBe(false);
    expect(isAssignableSupervisor({ role: 'provider', status: 'ACTIVE', has_supervisor_privileges: 0 })).toBe(false);
    for (const status of ['INACTIVE_EMPLOYEE', 'ARCHIVED', 'PREHIRE_REVIEW', 'ONBOARDING']) expect(isAssignableSupervisor({ role: 'provider', status, has_supervisor_privileges: 1 })).toBe(false);
  });
});
