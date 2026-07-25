import { describe, expect, it } from 'vitest';
import {
  isScheduleCoworkerRole,
  isMeetingAttendeeEligible,
  scheduleCoworkerRoleSqlClause,
  scheduleCoworkerRoleSqlParams
} from '../scheduleCoworkerRoles.js';

describe('scheduleCoworkerRoles', () => {
  it('excludes guardians, school staff, clients, and kiosk accounts', () => {
    expect(isScheduleCoworkerRole('provider')).toBe(true);
    expect(isScheduleCoworkerRole('staff')).toBe(true);
    expect(isScheduleCoworkerRole('admin')).toBe(true);
    expect(isScheduleCoworkerRole('super_admin')).toBe(true);
    expect(isScheduleCoworkerRole('superadmin')).toBe(true);
    expect(isScheduleCoworkerRole('school_staff')).toBe(false);
    expect(isScheduleCoworkerRole('client_guardian')).toBe(false);
    expect(isScheduleCoworkerRole('guardian')).toBe(false);
    expect(isScheduleCoworkerRole('client')).toBe(false);
    expect(isScheduleCoworkerRole('kiosk')).toBe(false);
  });

  it('allows platform superadmin attendees when host is superadmin', () => {
    expect(isMeetingAttendeeEligible({
      attendeeRow: { role: 'super_admin', in_agency: 0 },
      agencyId: 12,
      actorRole: 'super_admin',
      hostRole: 'super_admin'
    })).toBe(true);
    expect(isMeetingAttendeeEligible({
      attendeeRow: { role: 'provider', in_agency: 0 },
      agencyId: 12,
      actorRole: 'super_admin',
      hostRole: 'super_admin'
    })).toBe(false);
  });

  it('builds SQL clause and params for excluded roles', () => {
    const clause = scheduleCoworkerRoleSqlClause('u.role');
    expect(clause).toContain('NOT IN');
    expect(scheduleCoworkerRoleSqlParams()).toContain('school_staff');
    expect(scheduleCoworkerRoleSqlParams()).toContain('client_guardian');
  });
});
