import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import OfficeClientsView from '../OfficeClientsView.vue';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: mocks }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, params: {} }) }));
vi.mock('../../../composables/useOfficeClientAgency.js', async () => {
  const { ref } = await import('vue');
  return {
    formatRelativeTime: () => 'Today', portalLabel: enabled => enabled ? 'Active' : 'Not invited',
    useOfficeClientAgency: () => ({
      agencyId: ref(10), accessibleAgencies: ref([{ id: 10, name: 'Inner Strength' }, { id: 20, name: 'Other Agency' }]),
      multiTenant: ref(true), tenantFilter: ref('all'), scopeAgencyIds: ref([10, 20]), showingAllAgencies: ref(true),
      agencyIdsParam: () => '10,20', orgPath: path => path, clientProfilePath: id => `/admin/clients/${id}`
    })
  };
});

const clients = [
  { id: 1, fullName: 'Synthetic One', agencyId: 10, agencies: [{ agencyId: 10, name: 'Inner Strength' }], providers: [], bucket: 'prospective' },
  { id: 2, fullName: 'Synthetic Two', agencyId: 20, agencies: [{ agencyId: 20, name: 'Other Agency' }], providers: [], bucket: 'prospective' }
];
const providers = [
  { id: 101, name: 'Agency Ten Provider', assignmentServicesByAgency: {10:['counseling','tutoring']}, agencyIds: [10], agencies: [{ id: 10, name: 'Inner Strength' }] },
  { id: 202, name: 'Agency Twenty Provider', assignmentServicesByAgency: {20:['counseling','tutoring']}, agencyIds: [20], agencies: [{ id: 20, name: 'Other Agency' }] }
];
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async url => ({ data: url === '/office-clients' ? { clients, aggregates: {} } : { providers } }));
  mocks.put.mockResolvedValue({ data: {} });
  mocks.post.mockResolvedValue({ data: {} });
});
afterEach(() => wrapper?.unmount());
async function ready() {
  wrapper = shallowMount(OfficeClientsView, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  return wrapper.vm.$.setupState;
}

it('loads providers for the selected client and prevents assignment across agencies', async () => {
  const state = await ready();
  expect(mocks.get.mock.calls.some(([url]) => url.includes('/providers'))).toBe(false);
  state.selectedId = 1;
  await flushPromises();
  expect(mocks.get).toHaveBeenCalledWith('/office-clients/providers', expect.objectContaining({ params: { agencyIds: '10,20', clientId: 1, serviceAssignments:'1' } }));
  expect(wrapper.getComponent({ name: 'ProviderSearchSelect' }).props('options').map(provider => provider.id)).toEqual([101]);
  state.assignProviderId = 202;
  await state.assignSelected();
  expect(mocks.put).not.toHaveBeenCalled();
  state.assignProviderId = 101;
  await state.assignSelected();
  expect(mocks.put).toHaveBeenCalledWith('/clients/1/provider', { provider_id: 101 });
  expect(wrapper.get('a[href="/admin/clients/1?tab=assignments"]').text()).toBe('Review assignments');
});

it('discards an older provider response after switching clients', async () => {
  let resolveFirst;
  const state = await ready();
  mocks.get.mockImplementation((url, options) => {
    if (options?.params?.clientId === 1) return new Promise(resolve => { resolveFirst = resolve; });
    return Promise.resolve({ data: { providers: [providers[1]] } });
  });
  state.selectedId = 1;
  await flushPromises();
  state.selectedId = 2;
  await flushPromises();
  expect(state.providersLoading).toBe(false);
  resolveFirst({ data: { providers: [providers[0]] } });
  await flushPromises();
  expect(state.clientProviders.map(provider => provider.id)).toEqual([202]);
});

it('shows the current provider and directs service assignment review to the full profile', async () => {
  mocks.get.mockResolvedValue({ data: { clients: [{ ...clients[0], providers: [{ providerId: 101, name: 'Agency Ten Provider' }], nextStep: { key: 'review_service_assignment', label: 'Review Counseling assignment' } }] } });
  const state = await ready();
  state.selectedId = 1;
  await flushPromises();
  expect(wrapper.find('.ocm-assign').exists()).toBe(false);
  expect(wrapper.get('.ocm-drawer').text()).toContain('Agency Ten Provider');
  expect(wrapper.get('.ocm-drawer').text()).toContain('Review Counseling assignment');
  expect(wrapper.get('a[href="/admin/clients/1?tab=assignments"]').exists()).toBe(true);
});

it('assigns a single unassigned service by ID using only providers from its agency', async () => {
  const service = { id: 81, agencyId: 20, serviceKind: 'counseling', label: 'Counseling', providerId: null, organizationId: 44, organizationName: 'Counseling and Therapy' };
  mocks.get.mockImplementation(async url => ({ data: url === '/office-clients' ? { clients: [{ ...clients[0], agencies: [...clients[0].agencies, { agencyId: 20, name: 'Other Agency' }], services: [service], providers: [{ providerId: 101, name: 'Agency Ten Provider' }] }] } : { providers } }));
  const state = await ready();
  state.selectedId = 1;
  await flushPromises();
  expect(wrapper.find('.ocm-assign').exists()).toBe(true);
  expect(state.clientProviders.map(provider => provider.id)).toEqual([202]);
  expect(wrapper.find('#office-client-alert').exists()).toBe(false);
  state.assignProviderId = 202;
  await state.assignSelected();
  expect(mocks.post).toHaveBeenCalledWith('/clients/1/service-enrollments', { agencyId: 20, serviceId: 81, serviceKind: 'counseling', providerUserId: 202, organizationId: 44, label: 'Counseling' });
  expect(mocks.put).not.toHaveBeenCalled();
});

it('directs staff to assignments when multiple services need a provider', async () => {
  const service = { id: 81, agencyId: 10, serviceKind: 'counseling', label: 'Counseling', providerId: null };
  mocks.get.mockResolvedValue({ data: { clients: [{ ...clients[0], services: [service, { ...service, id: 82 }] }] } });
  const state = await ready();
  state.selectedId = 1;
  await flushPromises();
  expect(wrapper.find('.ocm-assign').exists()).toBe(false);
  expect(wrapper.get('.ocm-drawer').text()).toContain('Multiple services need a provider');
  state.assignProviderId = 101;
  await state.assignSelected();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
});
