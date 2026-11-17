import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { defineComponent, h } from 'vue';
import ClientDetailPanel from '../ClientDetailPanel.vue';
import OfficeClientsView from '../../../views/admin/OfficeClientsView.vue';

const mocks = vi.hoisted(() => ({ open: vi.fn(), menu: vi.fn(), get: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get, put: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn().mockResolvedValue({ data: {} }), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {}, path: '/admin/clients' }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), hasRoute: () => false }) }));
vi.mock('../../../composables/useOfficeClientAgency.js', async () => {
  const { ref } = await import('vue');
  return { formatRelativeTime: () => 'Today', portalLabel: () => 'Active', useOfficeClientAgency: () => ({
    agencyId: ref(10), accessibleAgencies: ref([{ id: 10 }]), multiTenant: ref(false), tenantFilter: ref('10'),
    scopeAgencyIds: ref([10]), showingAllAgencies: ref(false), agencyIdsParam: () => '10', orgPath: path => path,
    clientProfilePath: id => `/admin/clients/${id}`
  }) };
});
const FollowUpStub = defineComponent({
  name: 'ClientFollowUpTask', props: ['agencyId'],
  setup(_props, { expose }) {
    expose({ open: mocks.open, openContextMenu: mocks.menu });
    return () => h('div');
  }
});
let wrapper;
const client = { id: 42, agency_id: 10, initials: 'SC', client_type: 'clinical' };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 17, role: 'support' }));
  mocks.get.mockResolvedValue({ data: [] });
});
afterEach(() => wrapper?.unmount());

it('opens the same task flow from profile quick actions and right-clicking the profile', async () => {
  wrapper = shallowMount(ClientDetailPanel, { props: { client }, global: { plugins: [createPinia()], stubs: {
    ClientChartShell: { template: '<main><slot name="quick-actions" /></main>' }, ClientFollowUpTask: FollowUpStub
  } } });
  await flushPromises();
  const actions = wrapper.findComponent({ name: 'ClientQuickActions' });
  expect(actions.props('actions').find(action => action.id === 'follow-up').label).toBe('Follow-up task');
  actions.vm.$emit('action', { id: 'follow-up' });
  expect(mocks.open).toHaveBeenCalledWith(client);
  await wrapper.get('main').trigger('contextmenu');
  expect(mocks.menu).toHaveBeenCalledWith(expect.any(MouseEvent), client);
});

it('uses the selected office row for both the visible action and context menu', async () => {
  const row = { id: 42, agencyId: 10, fullName: 'Synthetic Client', bucket: 'prospective', providers: [] };
  mocks.get.mockImplementation(async url => ({ data: url === '/office-clients' ? { clients: [row], aggregates: {} } : { providers: [] } }));
  wrapper = shallowMount(OfficeClientsView, { global: { stubs: { ClientFollowUpTask: FollowUpStub, RouterLink: true } } });
  await flushPromises();
  await wrapper.get('tbody tr').trigger('contextmenu');
  expect(mocks.menu).toHaveBeenCalledWith(expect.any(MouseEvent), row);
  await wrapper.findAll('button').find(button => button.text() === 'Follow-up task').trigger('click');
  expect(mocks.open).toHaveBeenCalledWith(row);
});
