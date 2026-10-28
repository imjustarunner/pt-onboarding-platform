import { describe, expect, it } from 'vitest';
import { parseProviderClientQuery, searchProviderClients } from '../providerClientQuickNav.js';
const people = [
  { id: 12, first_name: 'Paige', last_name: 'Wood', role: 'provider' },
  { id: 13, first_name: 'Paige', last_name: 'Jones', role: 'provider' },
  { id: 14, first_name: 'Paige', last_name: 'Guardian', role: 'client_guardian' }
];
describe('provider caseload navigation', () => {
  it.each(['Paige Wood clients', 'clients wood paige', "show me Paige Wood’s clients", 'paig wood caseload', 'Paige Wod clietns', 'Paieg Wood clients'])(
    'finds the provider for %s', query => {
      const results = searchProviderClients(query, people, { agencyId: 2 });
      expect(results.map(row => row.id)).toEqual(['provider-clients-12']);
      expect(results[0]).toMatchObject({ path: '/admin/users/12', query: { agencyId: '2', tab: 'clients', clients: 'all' } });
    });
  it('offers separate choices for ambiguous first names without matching guardians', () => {
    expect(searchProviderClients('Paige clients', people, { agencyId: 2 })).toHaveLength(2);
  });
  it('opens the school section for a school request', () => {
    expect(searchProviderClients('please show Paige Wood schools', people, { agencyId: 2 })[0].query.clients).toBe('school');
  });
  it.each(['clients', 'show my clients', 'what happened to Paige clients yesterday', 'unrelated clients', 'p clients'])(
    'does not misroute %s', query => expect(searchProviderClients(query, people, { agencyId: 2 })).toEqual([]));
  it('requires an organization and a caseload intent', () => {
    expect(searchProviderClients('Paige clients', people)).toEqual([]);
    expect(parseProviderClientQuery('Paige Wood')).toBeNull();
  });
});
