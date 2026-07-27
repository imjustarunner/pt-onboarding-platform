import { describe, it, expect } from 'vitest';
import {
  buildSettingsSearchTargets,
  enrichSettingsSearchTarget,
  filterSettingsSearchTargets,
  scoreSettingsSearchTarget,
  settingsCardMatchesQuery
} from '../settingsSearchCatalog.js';

function catalogItems() {
  return [
    {
      id: 'platform-settings',
      label: 'Platform Settings',
      categoryId: 'platform',
      categoryLabel: 'PLATFORM'
    },
    {
      id: 'billing',
      label: 'Billing',
      categoryId: 'general',
      categoryLabel: 'GENERAL'
    },
    {
      id: 'company-profile',
      label: 'Company Profile',
      categoryId: 'general',
      categoryLabel: 'GENERAL'
    },
    {
      id: 'tenant-features',
      label: 'Features',
      categoryId: 'general',
      categoryLabel: 'GENERAL'
    },
    {
      id: 'branding-config',
      label: 'Branding Configuration',
      categoryId: 'theming',
      categoryLabel: 'THEMING'
    },
    {
      id: 'payroll-schedule',
      label: 'Payroll',
      categoryId: 'workflow',
      categoryLabel: 'WORKFLOW'
    },
    {
      id: 'booking-service-types',
      label: 'Booking & service types',
      categoryId: 'general',
      categoryLabel: 'GENERAL'
    },
    {
      id: 'note-aid-kb',
      label: 'Note Aid KB',
      categoryId: 'ai',
      categoryLabel: 'AI TOOLS'
    }
  ];
}

function allTargets(isSuperAdmin = true) {
  return buildSettingsSearchTargets({
    catalogItems: catalogItems(),
    isSuperAdmin,
    includeCompanyProfile: true
  });
}

describe('settingsSearchCatalog', () => {
  it('excludes hub shell items from enrichment', () => {
    expect(
      enrichSettingsSearchTarget({
        id: 'tenant-ws-home',
        label: 'Tenant home',
        categoryId: 'platform'
      })
    ).toBeNull();
  });

  it('uses preferred display labels', () => {
    const t = enrichSettingsSearchTarget({
      id: 'platform-settings',
      label: 'Platform Settings',
      categoryId: 'platform'
    });
    expect(t.label).toBe('Platform defaults');
  });

  it('billing matches invoices alias', () => {
    const hits = filterSettingsSearchTargets('invoices', allTargets());
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('billing');
  });

  it('finds Company Profile → Notifications for notification queries', () => {
    const hits = filterSettingsSearchTargets('notifications', allTargets());
    expect(hits.some((h) => h.agencyTab === 'notifications')).toBe(true);
  });

  it('prefers dedicated Payroll over legacy Company Profile PTO section', () => {
    const hits = filterSettingsSearchTargets('pto', allTargets());
    const dedicated = hits.find((h) => h.id === 'payroll-schedule');
    const legacy = hits.find((h) => h.id === 'cp-sec-pto');
    expect(dedicated).toBeTruthy();
    expect(legacy).toBeTruthy();
    expect(dedicated.score).toBeGreaterThan(legacy.score);
  });

  it('finds mileage in dedicated Payroll and still surfaces Company Profile', () => {
    const hits = filterSettingsSearchTargets('mileage', allTargets());
    expect(hits.some((h) => h.id === 'payroll-schedule')).toBe(true);
    expect(hits.some((h) => h.agencyTab === 'payroll' || h.agencyTab === 'sites')).toBe(true);
  });

  it('prefers dedicated Features over legacy Company Profile Features tab', () => {
    const hits = filterSettingsSearchTargets('features', allTargets());
    const dedicated = hits.find((h) => h.id === 'tenant-features');
    const legacy = hits.find((h) => h.id === 'cp-tab-features');
    expect(dedicated).toBeTruthy();
    expect(legacy).toBeTruthy();
    expect(dedicated.score).toBeGreaterThan(legacy.score);
  });

  it('booking types resolve to dedicated screen (moved out of Company Profile)', () => {
    const hits = filterSettingsSearchTargets('booking', allTargets());
    expect(hits[0]?.id).toBe('booking-service-types');
    expect(hits[0]?.agencyTab).toBeFalsy();
  });

  it('company setup aliases find Company profile', () => {
    const hits = filterSettingsSearchTargets('company setup', allTargets());
    expect(hits.some((h) => h.id === 'company-profile')).toBe(true);
  });

  it('payroll schedule outranks legacy CP payroll tab', () => {
    const hits = filterSettingsSearchTargets('payroll', allTargets());
    const dedicated = hits.find((h) => h.id === 'payroll-schedule');
    const legacy = hits.find((h) => h.id === 'cp-tab-payroll');
    expect(dedicated).toBeTruthy();
    expect(legacy).toBeTruthy();
    expect(dedicated.score).toBeGreaterThan(legacy.score);
  });

  it('hides superadmin-only social feeds for non-superadmin', () => {
    const adminHits = filterSettingsSearchTargets('social feeds', allTargets(false));
    expect(adminHits.some((h) => h.id === 'cp-tab-social-feeds')).toBe(false);
    const saHits = filterSettingsSearchTargets('social feeds', allTargets(true));
    expect(saHits.some((h) => h.id === 'cp-tab-social-feeds')).toBe(true);
  });

  it('keeps Company Profile hub card visible for nested matches', () => {
    expect(
      settingsCardMatchesQuery('pto policy', {
        item: 'company-profile',
        label: 'Company profile',
        category: 'general'
      })
    ).toBe(true);
    expect(
      settingsCardMatchesQuery('payroll', {
        item: 'company-profile',
        label: 'Company profile',
        category: 'general'
      })
    ).toBe(true);
  });

  it('note aid alias finds KB', () => {
    const hits = filterSettingsSearchTargets('noteaid', allTargets());
    expect(hits.some((h) => h.id === 'note-aid-kb')).toBe(true);
  });

  it('terminology lands on Company Profile tab', () => {
    const hits = filterSettingsSearchTargets('terminology', allTargets());
    expect(hits.some((h) => h.agencyTab === 'terminology')).toBe(true);
  });

  it('scores exact alias above weak description overlap', () => {
    const billing = enrichSettingsSearchTarget({
      id: 'billing',
      label: 'Billing',
      categoryId: 'general'
    });
    const company = enrichSettingsSearchTarget({
      id: 'company-profile',
      label: 'Company profile',
      categoryId: 'general',
      description: 'Also mentions invoices in a long description about invoices workflow'
    });
    expect(scoreSettingsSearchTarget('invoices', billing)).toBeGreaterThan(
      scoreSettingsSearchTarget('invoices', company)
    );
  });
});
