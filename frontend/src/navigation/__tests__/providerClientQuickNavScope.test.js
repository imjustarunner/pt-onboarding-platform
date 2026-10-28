import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import api from '../../services/api.js';
import { useProviderClientQuickNav } from '../../composables/useProviderClientQuickNav.js';
vi.mock('../../services/api.js', () => ({ default: { get: vi.fn() } }));
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/admin/users/:userId', component: { template: '<div />' }, meta: { requiresAuth: true, requiresRole: ['admin', 'clinical_practice_assistant'] } }
] });
const person = { id: 12, first_name: 'Paige', last_name: 'Wood', role: 'provider' };
const scopes = [];
function setup(role = 'admin') {
  const scope = effectScope(); scopes.push(scope);
  const query = ref('Paige clients');
  const options = ref({ user: { id: 1, role }, agency: { id: 2 } });
  const results = scope.run(() => useProviderClientQuickNav(query, options, router));
  return { query, options, results };
}
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.resetAllMocks(); });
describe('provider Quick Nav scope', () => {
  it('loads a limited directory once and keeps searching locally', async () => {
    api.get.mockResolvedValue({ data: [person] });
    const { query, results } = setup(); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/users', { params: { agencyId: 2, staffOnly: 'true' }, skipGlobalLoading: true });
    expect(results.value[0].label).toBe('Paige Wood — Clients');
    query.value = 'show Paige schools'; await nextTick();
    expect(results.value[0].query.clients).toBe('school');
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it('does not expose an old organization response after switching tenants', async () => {
    let resolveOld;
    api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ data: [] });
    const { options, results } = setup();
    options.value = { ...options.value, agency: { id: 3 } }; await flushPromises();
    resolveOld({ data: [person] }); await flushPromises();
    expect(results.value).toEqual([]);
  });
  it('clears loaded people when the signed-in user changes', async () => {
    api.get.mockResolvedValueOnce({ data: [person] }).mockResolvedValueOnce({ data: [] });
    const { options, results } = setup(); await flushPromises();
    expect(results.value).toHaveLength(1);
    options.value = { ...options.value, user: { id: 2, role: 'admin' } };
    expect(results.value).toEqual([]); await flushPromises();
    expect(results.value).toEqual([]);
  });
  it('does not fetch provider identities for ordinary providers', async () => {
    const { results } = setup('provider'); await flushPromises();
    expect(api.get).not.toHaveBeenCalled(); expect(results.value).toEqual([]);
  });
  it('fails closed when the directory denies access', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    const { results } = setup(); await flushPromises();
    expect(results.value).toEqual([]);
  });
});
