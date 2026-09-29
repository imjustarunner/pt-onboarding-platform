import { describe, expect, it } from 'vitest';
import {
  canAccessFinanceOperationsHub,
  canAccessPeopleOperationsHub,
  resolveWorkspaceAccess,
  buildDashboardQuickAccessLinks,
  buildHubSwitcherLinks,
  workspaceNavContextFromStores
} from '../workspaceNavAccess.js';
import { canAccessSchoolPortalsSurfaces } from '../schoolPortalsAccess.js';

const admin = { role: 'admin', capabilities: { canAccessFinanceOperations: true } };
const itsco = {
  id: 2, slug: 'itsco',
  feature_flags: { schoolPortalsEnabled: true, financeOperationsEnabled: false }
};
const context = (agency = itsco, user = admin) => workspaceNavContextFromStores({
  agency, user, role: user.role, slug: agency.slug, branding: {}
});

describe('tenant operations access', () => {
  it('shows People Operations for ITSCO admin staff after restoring tenant features, including serialized flags', () => {
    for (const role of ['admin', 'support', 'staff']) {
      for (const flags of [{ hiringEnabled: true, peopleOpsEnabled: true }, JSON.stringify({ hiringEnabled: true, peopleOpsEnabled: true })]) {
        const ctx = context({ ...itsco, feature_flags: flags }, { role, has_supervisor_privileges: 1, capabilities: { canManageHiring: true } });
        expect(canAccessPeopleOperationsHub(ctx)).toBe(true);
        for (const links of [buildDashboardQuickAccessLinks(ctx), buildHubSwitcherLinks(ctx)]) {
          expect(links.find(link => link.key === 'people').to).toBe('/itsco/people-operations');
        }
      }
    }
  });

  it('retains disabled-feature and employee-role boundaries for People Operations', () => {
    const enabled = { ...context(), agencyFeatureFlags: { hiringEnabled: true }, hasHiringFeature: true };
    expect(canAccessPeopleOperationsHub({ ...enabled, role: 'provider', user: { role: 'provider' } })).toBe(false);
    expect(canAccessPeopleOperationsHub({ ...enabled, isAffiliationContext: true })).toBe(false);
    expect(canAccessPeopleOperationsHub(context())).toBe(false);
  });

  it('restores school access for ITSCO admins without showing their other tenant finance access', () => {
    const ctx = context();
    expect(resolveWorkspaceAccess(ctx)).toMatchObject({ school: true, finance: false });
    expect(canAccessSchoolPortalsSurfaces({ userRole: 'admin', agencyFeatureFlags: itsco.feature_flags })).toBe(true);
    for (const links of [buildDashboardQuickAccessLinks(ctx), buildHubSwitcherLinks(ctx)]) {
      expect(links.find(link => link.key === 'school').to).toBe('/itsco/school-operations');
      expect(links.some(link => link.key === 'finance')).toBe(false);
    }
  });

  it('does not expose Finance Operations for missing or disabled tenant flags', () => {
    for (const flags of [{}, { financeOperationsEnabled: false }, { financeOperationsEnabled: 'false' }]) {
      expect(canAccessFinanceOperationsHub({ ...context(), agencyFeatureFlags: flags })).toBe(false);
    }
  });

  it('retains finance for opted-in nonprofits and parses serialized feature flags', () => {
    const nonprofit = { id: 434, slug: 'mh4kidz', feature_flags: JSON.stringify({ financeOperationsEnabled: true }) };
    const ctx = context(nonprofit);
    expect(resolveWorkspaceAccess(ctx)).toMatchObject({ school: false, finance: true });
    expect(buildDashboardQuickAccessLinks(ctx).find(link => link.key === 'finance').to).toBe('/mh4kidz/finance-operations');
    expect(resolveWorkspaceAccess(context())).toMatchObject({ school: true, finance: false });
  });

  it('requires an authorized role or finance grant even for opted-in tenants', () => {
    const agency = { ...itsco, feature_flags: { financeOperationsEnabled: true } };
    expect(canAccessFinanceOperationsHub(context(agency, { role: 'provider' }))).toBe(false);
    expect(canAccessFinanceOperationsHub(context(agency, { role: 'staff', capabilities: { canAccessFinanceOperations: true } }))).toBe(true);
    expect(canAccessFinanceOperationsHub(context(agency, { role: 'admin' }))).toBe(true);
  });

  it('preserves super admin setup access and tenant context exclusions', () => {
    const ctx = context(itsco, { role: 'super_admin' });
    expect(canAccessFinanceOperationsHub(ctx)).toBe(true);
    expect(canAccessFinanceOperationsHub({ ...ctx, isAffiliationContext: true })).toBe(false);
    expect(canAccessFinanceOperationsHub({ ...ctx, isSscSstcTenant: true })).toBe(false);
  });
});
