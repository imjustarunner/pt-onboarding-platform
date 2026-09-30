import { beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), agency: null }));
vi.mock('../../../services/api', () => ({ default: mocks }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'support' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' }, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../../../composables/useClientDisplayMode.js', () => ({ useClientDisplayMode: () => ({ getClientLabel: () => 'Synthetic client', clientLabelMode: 'initials' }) }));
import View from '../ClientManagementView.vue';
beforeEach(() => {
  vi.clearAllMocks();
  const agency = { id: 2, name: 'ITSCO', slug: 'itsco', organization_type: 'agency' };
  mocks.agency = { currentAgency: agency, userAgencies: [agency], agencies: [agency], fetchUserAgencies: vi.fn().mockResolvedValue([]) };
  mocks.get.mockImplementation(async url => ({ data: url.includes('affiliated-organizations') ? [{ id: 3, name: 'Office', organization_type: 'clinical' }] : url.includes('/clients/12') ? { id: 12, provider_id: 9 } : [] }));
  mocks.post.mockResolvedValue({ data: { id: 12, agency_id: 2, provider_id: null } }); mocks.put.mockResolvedValue({ data: {} });
});
async function ready() {
  const wrapper = shallowMount(View, { global: { stubs: { RouterLink: true } } }); await flushPromises();
  const state = wrapper.vm.$.setupState;
  await state.openCreateClientModal(); await flushPromises();
  state.newClient.organization_id = 3; await flushPromises();
  Object.assign(state.newClient, { initials: 'SynCli', full_name: 'Synthetic Client', client_type: 'clinical', provider_id: 9 });
  return { wrapper, state };
}
it('offers all three outcomes and saves unassigned even when a provider was selected', async () => {
  const { wrapper, state } = await ready();
  expect(wrapper.text()).toContain('Assign and save'); expect(wrapper.text()).toContain('Save unassigned'); expect(wrapper.text()).toContain('Save and post to exchange');
  state.createOutcome = 'unassigned'; await state.createClient(); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/clients', expect.objectContaining({ provider_id: null }));
  expect(mocks.put.mock.calls.some(([url]) => url.endsWith('/provider'))).toBe(false);
  expect(state.showCreateModal).toBe(false); wrapper.unmount();
});
it('waits for pasted records before posting, and retries a failed post without creating another client', async () => {
  const { wrapper, state } = await ready();
  state.createRecords.intake = 'Presenting Problem: Synthetic concern'; state.createOutcome = 'exchange';
  mocks.post.mockImplementation(async url => {
    if (url === '/client-exchange/listings') throw new Error('Temporary failure');
    return { data: { id: 12, agency_id: 2, provider_id: null } };
  });
  await state.createClient(); await flushPromises();
  expect(state.showCreatedRecordsImport).toBe(true);
  expect(mocks.post.mock.calls.some(([url]) => url === '/client-exchange/listings')).toBe(false);
  await state.onCreatedRecordsImported(); await flushPromises();
  expect(state.createdClientRecord.id).toBe(12); expect(state.showCreateModal).toBe(true);
  mocks.post.mockResolvedValue({ data: { listing: { id: 99 } } });
  await state.createClient(); await flushPromises();
  expect(mocks.post.mock.calls.filter(([url]) => url === '/clients')).toHaveLength(1);
  expect(state.showCreateModal).toBe(false); wrapper.unmount();
});

it('assigns and verifies the newly saved office client before closing', async () => {
  const { wrapper, state } = await ready();
  state.createOutcome = 'assign';
  mocks.get.mockImplementation(async url => ({ data: url === '/clients/12' ? { provider_id: mocks.put.mock.calls.some(([path]) => path.endsWith('/provider')) ? 9 : null } : [] }));
  await state.createClient(); await flushPromises();
  expect(mocks.put).toHaveBeenCalledWith('/clients/12/provider', { provider_id: 9 });
  expect(state.showCreateModal).toBe(false); wrapper.unmount();
});
