import { describe, it, expect } from 'vitest';
import { normalizeSettingsDestination } from '../settingsDestinations';
import { buildSettingsSearchTargets, filterSettingsSearchTargets, settingsCardMatchesQuery } from '../settingsSearchCatalog';
describe('unified business settings', () => {
  it('keeps old bookmarks working through one settings home', () => {
    expect(normalizeSettingsDestination({ category: 'general', item: 'company-profile' })).toEqual({ category: 'platform', item: 'tenant-ws-home' });
    expect(normalizeSettingsDestination({ item: 'company-profile', agencyTab: 'notifications' })).toEqual({ category: 'general', item: 'business-details', agencyTab: 'notifications' });
    expect(normalizeSettingsDestination({ item: 'company-profile', agencyTab: 'features' })).toEqual({ category: 'general', item: 'tenant-features', agencyTab: 'features' });
    expect(normalizeSettingsDestination({ item: 'company-profile', agencyTab: 'payroll' })).toEqual({ category: 'workflow', item: 'payroll-schedule' });
  });
  it('finds lifecycle and commercial settings using everyday language', () => {
    const targets = buildSettingsSearchTargets({ catalogItems: ['business-journey', 'business-commercial', 'business-details', 'tenant-features', 'billing'].map(id => ({ id, label: id, categoryId: 'general' })) });
    for (const query of ['interview', 'onboarding a business', 'exit', 'training']) expect(filterSettingsSearchTargets(query, targets).some(h => h.itemId === 'business-journey')).toBe(true);
    for (const query of ['revenue share', 'percentage', 'a la carte', 'contract']) expect(filterSettingsSearchTargets(query, targets).some(h => h.itemId === 'business-commercial')).toBe(true);
    expect(filterSettingsSearchTargets('company profile', targets).some(h => h.itemId === 'business-details')).toBe(true);
    expect(targets.some(h => h.itemId === 'company-profile')).toBe(false);
    expect(targets.find(h => h.id === 'cp-tab-features').itemId).toBe('tenant-features');
    expect(targets.find(h => h.id === 'cp-tab-payroll').itemId).toBe('payroll-schedule');
    expect(settingsCardMatchesQuery('pto policy', { item: 'business-details' })).toBe(false);
    expect(settingsCardMatchesQuery('pto policy', { item: 'payroll-schedule' })).toBe(true);
  });
});
