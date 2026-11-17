import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ClientDetailPanel from '../ClientDetailPanel.vue';
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { ...api, defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn(), useRoute: () => ({ params: {}, query: {}, path: '/admin/clients' }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), hasRoute: () => false }) }));
let wrapper;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ data: {} });
  window.alert = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => wrapper?.unmount());
async function render({ role = 'admin', client = {}, ...props } = {}) {
  localStorage.setItem('user', JSON.stringify({ id: 4, role }));
  wrapper = shallowMount(ClientDetailPanel, {
    props: { client: { id: 7, agency_id: 2, client_type: 'clinical', full_name: 'Example Client', identifier_code: '123456', ...client }, ...props },
    global: { plugins: [createPinia()], stubs: { RouterLink: true, ClientChartShell: { name: 'ClientChartShell', props: ['headerCollapsed'], template: '<div><slot name="header" /><slot /></div>' } } }
  });
  await flushPromises();
  wrapper.vm.myAgencies = [{ id: 2 }];
  await flushPromises();
  return wrapper;
}
it.each(['admin', 'support'])('lets %s select School from a Clinical chart and saves the actual role in the reason', async role => {
  await render({ role });
  expect(wrapper.vm.canEditClientType).toBe(true);
  expect(wrapper.vm.clientTypeOptions.map(option => option.value)).toEqual(['basic_nonclinical', 'school', 'learning', 'clinical']);
  await wrapper.get('.cdp-inline-select').setValue('school');
  await wrapper.vm.saveClientType();
  expect(api.post).toHaveBeenCalledWith('/clients/7/client-type', { client_type: 'school', reason: `${role === 'support' ? 'Support' : 'Admin'} changed client type to school` });
});
it('keeps type controls unavailable outside the agency and for providers', async () => {
  await render();
  wrapper.vm.myAgencies = [{ id: 99 }];
  await flushPromises();
  expect(wrapper.find('.cdp-inline-select').exists()).toBe(false);
  wrapper.unmount();
  await render({ role: 'provider' });
  expect(wrapper.vm.canEditClientType).toBe(false);
});
it('collapses the header while preserving client identity and navigation state', async () => {
  await render();
  wrapper.vm.goChartSub('account');
  await wrapper.vm.startEditOverview();
  await wrapper.get('.cdp-header-toggle').trigger('click');
  expect(wrapper.get('.cdp-header-toggle').attributes('aria-expanded')).toBe('false');
  expect(wrapper.get('.cdp-compact-id').text()).toBe('ID 123456');
  expect(wrapper.get('.cdp-title').text()).toContain('Example Client');
  expect(wrapper.get('.cdp-identity-line').isVisible()).toBe(false);
  expect(wrapper.findComponent({ name: 'ClientChartShell' }).props('headerCollapsed')).toBe(true);
  expect(wrapper.vm.editingOverview).toBe(true);
  await wrapper.get('.cdp-header-toggle').trigger('click');
  expect(wrapper.get('.cdp-header-toggle').attributes('aria-expanded')).toBe('true');
  expect(wrapper.get('.cdp-identity-line').element.style.display).not.toBe('none');
});
it.each(['school', 'clinical'])('includes school information and both document workflows for a school-assigned %s client', async client_type => {
  await render({ client: { client_type, organization_type: 'school', organization_id: 20, organization_name: 'Example School', school_year: '2026-2027', grade: '6' } });
  wrapper.vm.onHubChange('portal');
  await flushPromises();
  expect(wrapper.get('[aria-label="School information and documents"]').text()).toContain('Example School');
  expect(wrapper.findComponent({ name: 'ClientSchoolRoiAccessTab' }).props('client').id).toBe(7);
  expect(wrapper.findComponent({ name: 'ClientDisclosurePanel' }).props('clientId')).toBe(7);
});
it('omits school tools for an office clinical client', async () => {
  await render({ client: { organization_type: 'clinical' } });
  wrapper.vm.onHubChange('portal');
  await flushPromises();
  expect(wrapper.find('[aria-label="School information and documents"]').exists()).toBe(false);
});
