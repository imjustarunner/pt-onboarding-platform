import { describe, expect, it } from 'vitest';
import {
  activeBriefingSections,
  buildTenantBlend,
  isAgencyTenantOrg,
  isLivePrivilegedPresence,
  isPrivilegedLoginBriefingUser,
  isSchoolBriefingNotification,
  parseBrandPalette,
  schoolBriefingItemsFromNotifications,
  tenantBriefingNotifications
} from '../privilegedLoginBriefing';

describe('privileged login briefing rules', () => {
  it('allows only active admin, support, and superadmin users', () => {
    expect(isPrivilegedLoginBriefingUser({ role: 'admin', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isPrivilegedLoginBriefingUser({ role: 'support', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isPrivilegedLoginBriefingUser({ role: 'super_admin', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isPrivilegedLoginBriefingUser({ role: 'provider', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(isPrivilegedLoginBriefingUser({ role: 'admin', status: 'INACTIVE_EMPLOYEE' })).toBe(false);
    expect(isPrivilegedLoginBriefingUser({ role: 'support', status: 'ARCHIVED' })).toBe(false);
  });

  it('removes empty briefing sections in priority order', () => {
    const result = activeBriefingSections({
      messages: { count: 0, items: [] },
      tickets: { count: 2, items: [] },
      calendar: { count: 0, items: [{ id: 1 }] },
      notifications: { count: 1, items: [{ id: 'n1' }] }
    });
    expect(result.map((section) => section.key)).toEqual(['notifications', 'tickets', 'calendar']);
  });

  it('splits school updates out of tenant notifications', () => {
    const rows = [
      { id: 1, type: 'client_assigned', title: 'Assigned' },
      { id: 2, type: 'payroll_pending', title: 'Payroll' },
      { id: 3, type: 'school_provider_availability_updated', title: 'Slots changed' }
    ];
    expect(isSchoolBriefingNotification(rows[0])).toBe(true);
    expect(isSchoolBriefingNotification(rows[1])).toBe(false);
    expect(schoolBriefingItemsFromNotifications(rows).map((r) => r.id)).toEqual([1, 3]);
    expect(tenantBriefingNotifications(rows).map((r) => r.id)).toEqual([2]);
  });

  it('treats only agency rows as tenant orgs for briefing branding', () => {
    expect(isAgencyTenantOrg({ organization_type: 'agency' })).toBe(true);
    expect(isAgencyTenantOrg({ organization_type: 'school' })).toBe(false);
  });

  it('keeps only live privileged presence rows', () => {
    expect(isLivePrivilegedPresence({ role: 'admin', status: 'online' })).toBe(true);
    expect(isLivePrivilegedPresence({ role: 'support', status: 'idle' })).toBe(true);
    expect(isLivePrivilegedPresence({ role: 'admin', status: 'offline' })).toBe(false);
    expect(isLivePrivilegedPresence({ role: 'staff', status: 'online' })).toBe(false);
  });

  it('parses palettes and builds a multi-tenant gradient', () => {
    expect(parseBrandPalette({ color_palette: '{"primary":"#112233"}' }).primary).toBe('#112233');
    const blend = buildTenantBlend([
      { color_palette: { primary: '#112233' } },
      { colorPalette: { primary: '#abcdef' } }
    ]);
    expect(blend).toContain('linear-gradient');
    expect(blend).toContain('#112233');
    expect(blend).toContain('#abcdef');
  });
});
