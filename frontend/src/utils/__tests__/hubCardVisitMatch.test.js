import { describe, expect, it } from 'vitest';
import {
  cardDestinationKey,
  normalizeActivityPath,
  rankHubCards,
  visitCountForCard,
  buildVisitCountMap,
} from '../hubCardVisitMatch.js';

describe('hubCardVisitMatch', () => {
  it('normalizes org-scoped admin paths', () => {
    expect(normalizeActivityPath('/itsco/admin/clients')).toBe('/admin/clients');
    expect(normalizeActivityPath('/itsco/client-exchange')).toBe('/client-exchange');
  });

  it('preserves meaningful query params', () => {
    expect(normalizeActivityPath('/admin/client-onboarding?scope=school&agencyId=2'))
      .toBe('/admin/client-onboarding?scope=school');
    expect(normalizeActivityPath('/admin/guardians?scope=school'))
      .toBe('/admin/guardians?scope=school');
  });

  it('matches cards with scoped destinations separately', () => {
    const visits = buildVisitCountMap([
      { path: '/itsco/admin/client-onboarding?scope=school', visit_count: 8 },
      { path: '/admin/client-onboarding?scope=all', visit_count: 3 },
    ]);
    const schoolCard = { id: 'school-onb', to: '/admin/client-onboarding?scope=school' };
    const allCard = { id: 'all-onb', to: '/admin/client-onboarding?scope=all' };
    expect(visitCountForCard(schoolCard, visits)).toBe(8);
    expect(visitCountForCard(allCard, visits)).toBe(3);
  });

  it('ranks hub cards by visit count', () => {
    const cards = [
      { id: 'a', title: 'Payroll', to: '/admin/payroll' },
      { id: 'b', title: 'Clients', to: '/admin/clients' },
    ];
    const ranked = rankHubCards(cards, [
      { path: '/admin/clients', visit_count: 12 },
      { path: '/admin/payroll', visit_count: 4 },
    ]);
    expect(ranked[0].id).toBe('b');
    expect(ranked[0].visitCount).toBe(12);
  });

  it('builds stable card destination keys from route objects', () => {
    expect(
      cardDestinationKey({
        path: '/itsco/admin/school-approvals',
        query: { tab: 'adjustments', agencyId: '2' },
      })
    ).toBe('/admin/school-approvals');
  });
});
