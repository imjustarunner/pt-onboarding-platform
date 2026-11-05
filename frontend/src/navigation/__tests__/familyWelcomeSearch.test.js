import { describe, expect, it } from 'vitest';
import { accountSearchTargets, searchProfileContent } from '../profileContentSearch.js';
import { mergeDashboardSearchTargets } from '../dashboardSearchNavigation.js';
import { buildQuickNavContext, getAccessibleQuickNavEntries, resolveQuickNavLocation, searchQuickNav } from '../quickNavCatalog.js';

const TERMS = ['auto message', 'parent email', 'client email', 'auto client', 'auto parent', 'family welcome', 'auto welcome', 'school welcome', 'school email', 'school message'];

describe('Family Welcome & Follow-Up search', () => {
  const provider = buildQuickNavContext({ user: { id: 9, role: 'provider' } });

  it.each(TERMS)('Quick Nav finds "%s" and opens the account setting', term => {
    const [hit] = searchQuickNav(term, provider).flat;
    expect(hit.id).toBe('family-welcome');
    expect(resolveQuickNavLocation(hit, { orgSlug: 'auricwell-qa-demo' })).toEqual({ path: '/auricwell-qa-demo/dashboard', query: { tab: 'my', my: 'account', section: 'my-family-welcome' } });
  });

  it.each(TERMS)('Search My Dashboard finds "%s" first', term => {
    const targets = mergeDashboardSearchTargets(accountSearchTargets({ familyWelcome: true, canPrintCards: true }), getAccessibleQuickNavEntries(provider));
    expect(searchProfileContent(term, targets)[0]).toMatchObject({ tabId: 'my', mySection: 'account', sectionId: 'my-family-welcome', label: 'Family Welcome & Follow-Up' });
  });

  it('stays out of search for non-provider staff', () => {
    const staff = buildQuickNavContext({ user: { id: 3, role: 'staff' } });
    expect(getAccessibleQuickNavEntries(staff).some(e => e.id === 'family-welcome')).toBe(false);
    expect(accountSearchTargets({}).some(t => t.sectionId === 'my-family-welcome')).toBe(false);
  });
});
