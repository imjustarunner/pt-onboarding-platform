import { describe, it, expect } from 'vitest';
import {
  canUseSchoolPortalQuickNav,
  mapSchoolOverviewToQuickNavEntry,
  schoolPortalDashboardPath,
  scoreSchoolPortalQuickNavEntry,
  searchSchoolPortalQuickNav
} from '../schoolPortalQuickNav.js';

describe('schoolPortalQuickNav', () => {
  it('allows admin, support, and super_admin with feature flag', () => {
    const opts = { agencyFeatureFlags: { schoolPortalsEnabled: true } };
    expect(canUseSchoolPortalQuickNav({ role: 'admin', ...opts })).toBe(true);
    expect(canUseSchoolPortalQuickNav({ role: 'support', ...opts })).toBe(true);
    expect(canUseSchoolPortalQuickNav({ role: 'super_admin', ...opts })).toBe(true);
    expect(canUseSchoolPortalQuickNav({ role: 'staff', ...opts })).toBe(false);
  });

  it('maps overview rows to dashboard paths', () => {
    const entry = mapSchoolOverviewToQuickNavEntry({
      school_id: 12,
      school_name: 'Cheyenne JH',
      school_slug: 'cheyenne-jh',
      district_name: 'D12'
    });
    expect(entry.path).toBe('/cheyenne-jh/dashboard');
    expect(schoolPortalDashboardPath('cheyenne-jh')).toBe('/cheyenne-jh/dashboard');
  });

  it('prefers portal_url over internal slug for navigation', () => {
    const entry = mapSchoolOverviewToQuickNavEntry({
      school_id: 99,
      school_name: 'Colorado Springs School of Technology',
      school_slug: 'csst',
      school_portal_url: 'csst',
      slug: 'colorado-springs-school-of-technology',
      district_name: 'D11'
    });
    expect(entry.slug).toBe('csst');
    expect(entry.path).toBe('/csst/dashboard');
  });

  it('search matches school names for quick nav', () => {
    const schools = [
      { school_id: 1, school_name: 'Cheyenne JH', school_slug: 'cheyenne-jh', district_name: 'D12' },
      { school_id: 2, school_name: 'Ashley Elementary', school_slug: 'ashley', district_name: 'DPS' }
    ];
    const results = searchSchoolPortalQuickNav('cheyenne', schools);
    expect(results.length).toBe(1);
    expect(results[0].label).toBe('Cheyenne JH');
    expect(results[0].path).toBe('/cheyenne-jh/dashboard');
    expect(scoreSchoolPortalQuickNavEntry('chey', { name: 'Cheyenne JH', slug: 'cheyenne-jh' })).toBeGreaterThan(0);
  });
});
