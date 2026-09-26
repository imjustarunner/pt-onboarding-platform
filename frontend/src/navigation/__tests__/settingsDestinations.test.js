import { describe, it, expect } from 'vitest';
import { normalizeSettingsDestination, settingsLocationForAgency } from '../settingsDestinations';
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

describe('settings scope', () => {
  it('retains the selected agency on ordinary Settings links', () => {
    expect(settingsLocationForAgency({ id: 377, slug: 'tisi' })).toEqual({ path: '/tisi/admin/settings', query: { agencyId: '377', category: 'platform', item: 'tenant-ws-home' } });
    expect(settingsLocationForAgency({ id: 377 }).query.agencyId).toBe('377');
  });
  it('makes platform administration an explicit destination', () => {
    const destination = settingsLocationForAgency(null, { platform: true });
    expect(destination.path).toBe('/admin/settings');
    expect(destination.query.scope).toBe('platform');
    expect(destination.query.agencyId).toBeUndefined();
  });
  it('finds client payment setup without confusing it with subscription billing', () => {
    const targets = buildSettingsSearchTargets({ catalogItems: [{ id: 'payment-setup', label: 'Stripe & client payment setup', categoryId: 'general' }] });
    for (const query of ['stripe', 'copay', 'family billing', 'payment authorizations']) expect(filterSettingsSearchTargets(query, targets).some(h => h.itemId === 'payment-setup')).toBe(true);
  });
});
