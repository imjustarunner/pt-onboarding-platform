import { describe, expect, it } from 'vitest';
import {
  activeProviderBriefingSections,
  briefingPathPrefix,
  isProviderLoginBriefingUser,
  providerBriefingDashboardPath,
  resolveLoginTenantAgency,
  splitProviderBriefingNotifications
} from '../providerLoginBriefing';

describe('provider login briefing rules', () => {
  it('allows clinical employees but not admins, school staff, or guardians', () => {
    expect(isProviderLoginBriefingUser({ role: 'provider', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isProviderLoginBriefingUser({ role: 'provider_plus', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isProviderLoginBriefingUser({ role: 'clinical_practice_assistant', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isProviderLoginBriefingUser({ role: 'supervisor', status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(isProviderLoginBriefingUser({ role: 'admin', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(isProviderLoginBriefingUser({ role: 'support', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(isProviderLoginBriefingUser({ role: 'super_admin', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(isProviderLoginBriefingUser({ role: 'school_staff', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(isProviderLoginBriefingUser({ role: 'client_guardian', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(isProviderLoginBriefingUser({ role: 'provider', status: 'INACTIVE_EMPLOYEE' })).toBe(false);
  });

  it('resolves login tenant from host portal slug', () => {
    const agencies = [
      { id: 1, slug: 'itsco', portal_url: 'itsco', organization_type: 'agency', name: 'ITSCO' },
      { id: 2, slug: 'ltsco', portal_url: 'ltsco', organization_type: 'agency', name: 'LTSCO' }
    ];
    const resolved = resolveLoginTenantAgency({
      agencies,
      hostPortalSlug: 'itsco',
      currentAgency: agencies[1]
    });
    expect(resolved?.id).toBe(1);
  });

  it('uses flat paths on dedicated app hosts', () => {
    expect(briefingPathPrefix({
      agency: { portal_url: 'itsco' },
      hostPortalSlug: 'itsco'
    })).toBe('');
    expect(briefingPathPrefix({
      agency: { portal_url: 'itsco' },
      hostPortalSlug: ''
    })).toBe('/itsco');
  });

  it('routes provider plus and CPA to operations dashboard', () => {
    expect(providerBriefingDashboardPath('provider_plus', '/itsco')).toBe('/itsco/operations-dashboard');
    expect(providerBriefingDashboardPath('clinical_practice_assistant', '/itsco')).toBe('/itsco/operations-dashboard');
    expect(providerBriefingDashboardPath('provider', '/itsco')).toBe('/itsco/dashboard');
  });

  it('orders provider briefing sections and splits client updates', () => {
    const sections = activeProviderBriefingSections({
      messages: { count: 0, items: [] },
      tasks: { count: 2, items: [] },
      clientUpdates: { count: 1, items: [{ id: 1 }] },
      notifications: { count: 3, items: [{ id: 'n1' }] }
    });
    expect(sections.map((section) => section.key)).toEqual(['notifications', 'tasks', 'clientUpdates']);

    const { tenantRows, schoolRows } = splitProviderBriefingNotifications([
      { id: 1, type: 'client_assigned', title: 'Assigned' },
      { id: 2, type: 'payroll_pending', title: 'Payroll' }
    ]);
    expect(schoolRows.map((row) => row.id)).toEqual([1]);
    expect(tenantRows.map((row) => row.id)).toEqual([2]);
  });
});
