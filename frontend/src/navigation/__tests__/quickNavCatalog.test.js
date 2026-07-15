import { describe, it, expect } from 'vitest';
import {
  buildQuickNavContext,
  getAccessibleQuickNavEntries,
  resolveQuickNavLocation,
  scoreQuickNavEntry,
  searchQuickNav
} from '../quickNavCatalog.js';

function providerCtx(overrides = {}) {
  return buildQuickNavContext({
    user: { role: 'provider', capabilities: {} },
    showSchedule: true,
    showPayroll: true,
    showClaims: true,
    showChats: true,
    kudosEnabled: true,
    ...overrides
  });
}

describe('quickNavCatalog', () => {
  it('pay fuzzy-matches Payroll account destination', () => {
    const { flat } = searchQuickNav('pay', providerCtx());
    expect(flat.length).toBeGreaterThan(0);
    expect(flat[0].label).toBe('Payroll');
    expect(flat[0].my).toBe('payroll');
  });

  it('benef fuzzy-matches Benefits', () => {
    const { flat } = searchQuickNav('benef', providerCtx());
    expect(flat.some((r) => r.my === 'benefits' || r.label === 'Benefits')).toBe(true);
  });

  it('sched fuzzy-matches My Schedule', () => {
    const { flat } = searchQuickNav('sched', providerCtx());
    expect(flat.some((r) => r.tab === 'my_schedule')).toBe(true);
  });

  it('superv fuzzy-matches supervision when allowed', () => {
    const ctx = providerCtx({ showSupervision: true, showMySupervision: false });
    const { flat } = searchQuickNav('superv', ctx);
    expect(flat.some((r) => r.tab === 'supervision')).toBe(true);
  });

  it('workforce account tabs hidden in club context', () => {
    const ctx = providerCtx({ isClubContext: true, showPayroll: false, showSchedule: false });
    const entries = getAccessibleQuickNavEntries(ctx);
    expect(entries.some((e) => e.my === 'payroll')).toBe(false);
    expect(entries.some((e) => e.my === 'account')).toBe(true);
    expect(entries.some((e) => e.tab === 'my_schedule')).toBe(false);
  });

  it('kudos gated by agency flag', () => {
    const off = getAccessibleQuickNavEntries(providerCtx({ kudosEnabled: false }));
    const on = getAccessibleQuickNavEntries(providerCtx({ kudosEnabled: true }));
    expect(off.some((e) => e.my === 'kudos')).toBe(false);
    expect(on.some((e) => e.my === 'kudos')).toBe(true);
  });

  it('admin payroll requires canManagePayroll', () => {
    const provider = getAccessibleQuickNavEntries(providerCtx());
    expect(provider.some((e) => e.id === 'admin-payroll')).toBe(false);

    const admin = getAccessibleQuickNavEntries(
      buildQuickNavContext({
        user: { role: 'admin', capabilities: { canManagePayroll: true } },
        showPayroll: true
      })
    );
    expect(admin.some((e) => e.id === 'admin-payroll')).toBe(true);
  });

  it('resolveQuickNavLocation deep-links My Account payroll', () => {
    const loc = resolveQuickNavLocation(
      { kind: 'dashboard', tab: 'my', my: 'payroll' },
      { currentPath: '/itsco/dashboard', currentQuery: { foo: '1' } }
    );
    expect(loc).toEqual({
      path: '/itsco/dashboard',
      query: { foo: '1', tab: 'my', my: 'payroll' }
    });
  });

  it('resolveQuickNavLocation prefixes org slug for admin paths', () => {
    const loc = resolveQuickNavLocation(
      { kind: 'path', path: '/admin/clients' },
      { orgSlug: 'itsco' }
    );
    expect(loc).toBe('/itsco/admin/clients');
  });

  it('score prefers label prefix over weak subsequence', () => {
    const payroll = { label: 'Payroll', keywords: ['pay', 'payroll'], description: '' };
    const profile = { label: 'Profile', keywords: ['account'], description: '' };
    expect(scoreQuickNavEntry('pay', payroll)).toBeGreaterThan(scoreQuickNavEntry('pay', profile));
  });

  it('results are grouped with Account first when present', () => {
    const { groups } = searchQuickNav('pay', providerCtx());
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].label).toBe('Account');
  });
});
