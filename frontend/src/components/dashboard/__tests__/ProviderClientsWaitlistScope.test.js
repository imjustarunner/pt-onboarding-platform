import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ProviderClientsTab from '../ProviderClientsTab.vue';
import ProviderEnrollmentWaitlist from '../../provider/ProviderEnrollmentWaitlist.vue';

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), agencies: null }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => m.agencies }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1433, role: 'provider' } }) }));
vi.mock('../../admin/ClientDetailPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../admin/clientChart/ClientEhrBringUpToDatePanel.vue', () => ({ default: { template: '<div />' } }));
const full = { id: 450, slug: 'auricwell-qa-demo', organization_type: 'agency' };
const limited = { id: 456, slug: 'scb-qa-company', organization_type: 'agency', feature_flags: JSON.stringify({ schoolCareBridgeOnly: true }) };
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  m.agencies = reactive({ currentAgency: full, userAgencies: [full, limited] });
  m.get.mockImplementation(async (url, options) => {
    if (url.endsWith('/enrollment-waitlist')) {
      if (options.params.agencyId === 456) throw { response: { status: 403 } };
      return { data: { requests: [], waitlistEnabled: true } };
    }
    return { data: [] };
  });
  m.post.mockResolvedValue({ data: { summaries: [] } });
});
afterEach(() => wrapper?.unmount());
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/dashboard', component: { template: '<div />' } }] });
  await router.push('/dashboard?tab=clients&clients=office'); await router.isReady();
  wrapper = shallowMount(ProviderClientsTab, { global: { plugins: [router], stubs: { ProviderEnrollmentWaitlist: false } } });
  await flushPromises();
}
it('requests only full-agency waitlists from provider Office Clients and displays a complete empty count', async () => {
  await render();
  expect(m.get.mock.calls.filter(([url]) => url.endsWith('/enrollment-waitlist')).map(([, options]) => options.params.agencyId)).toEqual([450]);
  const waitlist = wrapper.findComponent(ProviderEnrollmentWaitlist);
  expect(waitlist.get('.pew-count').text()).toBe('0');
  expect(waitlist.find('[role="alert"]').exists()).toBe(false);
});
it('does not fall back to a SchoolCareBridge-only current agency when no full-agency memberships exist', async () => {
  m.agencies.userAgencies = [limited]; m.agencies.currentAgency = limited;
  await render();
  expect(m.get.mock.calls.some(([url]) => url.endsWith('/enrollment-waitlist'))).toBe(false);
  expect(wrapper.find('.pew').exists()).toBe(false);
});
