import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, agency: { currentAgency: { id: 2, slug: 'practice', name: 'Synthetic practice' } }, auth: { user: { role: 'admin' } } }));
vi.mock('../../../services/api', () => ({ default: mocks.api }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
import Workbench from '../AuricWellTransitionWorkbench.vue';
const chart = { id: 41, agency_id: 2, full_name: 'Taylor Example', date_of_birth: null, organization_id: 20, provider_id: 9, client_type: 'school' };
let searchRows, caseload, failSearch;
beforeEach(() => {
  vi.clearAllMocks(); searchRows = []; caseload = []; failSearch = false;
  mocks.auth.user = { role: 'admin' };
  mocks.api.get.mockImplementation(async (url, options) => {
    if (url === '/provider-scheduling/providers') return { data: [{ id: 7, first_name: 'Jordan', last_name: 'Example' }] };
    if (url.includes('/affiliated-organizations')) return { data: [{ id: 20, name: 'Synthetic School', organization_type: 'school' }] };
    if (url === '/clients/41') return { data: chart };
    if (url === '/clients') { if (options.params.search && failSearch) throw new Error('Lookup unavailable'); return { data: options.params.search ? searchRows : caseload }; }
    throw new Error(`Unexpected read ${url}`);
  });
  mocks.api.post.mockImplementation(async url => {
    if (url === '/clients/demographics/preview') return { data: { parsed: { fullName: 'Taylor Example', dateOfBirth: '2010-02-03' } } };
    if (url === '/clients') return { data: { client: { id: 55, agency_id: 2, organization_id: 20, provider_id: 7 } } };
    return { data: {} };
  });
  mocks.api.put.mockResolvedValue({ data: {} });
});
async function open() { const wrapper = shallowMount(Workbench, { props: { scopedAgencyId: 2 } }); await flushPromises(); await wrapper.get('.aw-context select').setValue('7'); await flushPromises(); return wrapper; }
async function click(wrapper, text) { const button = wrapper.findAll('button').find(b => b.text() === text); expect(button, text).toBeTruthy(); await button.trigger('click'); await flushPromises(); }
async function identity(wrapper) { await wrapper.get('.aw-identity textarea').setValue('Legal Name: Taylor Example\nDate of Birth: 2/3/2010'); await click(wrapper, 'Read demographics and find matches'); }
it('reuses an incomplete school chart and preserves its primary provider and identity', async () => {
  searchRows = [chart]; const wrapper = await open(); await identity(wrapper); await click(wrapper, 'Use this existing chart');
  expect(mocks.api.post).toHaveBeenCalledWith('/clients/41/provider-assignments', expect.objectContaining({ provider_user_id: 7, is_primary: false }), expect.anything());
  expect(mocks.api.post.mock.calls.some(([url]) => url === '/clients')).toBe(false);
  expect(wrapper.findComponent({ name: 'AuricWellClientImportPanel' }).props('clientId')).toBe(41);
  expect(wrapper.text()).toContain('Chart #41'); wrapper.unmount();
});
it('does not permit creation after a failed lookup', async () => {
  failSearch = true; const wrapper = await open(); await identity(wrapper);
  expect(wrapper.text()).toContain('Lookup unavailable'); expect(wrapper.find('.aw-candidates').exists()).toBe(false);
  expect(mocks.api.post.mock.calls.some(([url]) => url === '/clients')).toBe(false); wrapper.unmount();
});
it('holds a same-name chart with missing DOB for identity review', async () => {
  searchRows = [chart]; const wrapper = await open(); await identity(wrapper);
  expect(wrapper.text()).toContain('matching or missing DOB needs review'); expect(wrapper.get('.aw-check input').element.disabled).toBe(true); wrapper.unmount();
});
it('creates only after explicit new-client review, then keeps the new ID when demographics fail', async () => {
  const wrapper = await open(); await identity(wrapper); await wrapper.get('.aw-check input').setValue(true); await wrapper.get('.aw-candidates select').setValue('20');
  mocks.api.post.mockImplementation(async url => { if (url === '/clients') return { data: { client: { id: 55, agency_id: 2, organization_id: 20 } } }; throw new Error('Demographics unavailable'); });
  await click(wrapper, 'Create this new client and assign provider');
  expect(wrapper.text()).toContain('Chart #55 is saved'); expect(wrapper.findComponent({ name: 'AuricWellClientImportPanel' }).props('clientId')).toBe(55);
  expect(mocks.api.post.mock.calls.filter(([url]) => url === '/clients')).toHaveLength(1);
  expect(mocks.api.post).toHaveBeenCalledWith('/clients', expect.objectContaining({ date_of_birth: '2010-02-03' }), expect.anything()); expect(wrapper.find('.aw-candidates').exists()).toBe(false); wrapper.unmount();
});
it('locks provider changes and navigation while a child saves', async () => {
  caseload = [{ ...chart, provider_id: 7 }]; const wrapper = await open(); await wrapper.get('.aw-caseload li button').trigger('click'); await flushPromises();
  const panel = wrapper.findComponent({ name: 'AuricWellClientImportPanel' }); panel.vm.$emit('busy', true); await flushPromises();
  expect(wrapper.get('.aw-context').element.disabled).toBe(true); expect(wrapper.vm.beforeNavigate()).toBe(false);
  panel.vm.$emit('busy', false); await flushPromises(); expect(wrapper.vm.beforeNavigate()).toBe(true); wrapper.unmount();
});
it('keeps partial agenda results visible without claiming a successful import', async () => {
  const wrapper = await open(); await click(wrapper, '2. Weekly agenda');
  wrapper.findComponent({ name: 'AuricWellAgendaImport' }).vm.$emit('saved', { complete: false, error: 'One visit still needs review', savedAppointmentIds: [81] });
  await flushPromises(); expect(wrapper.get('[role=alert]').text()).toContain('One visit still needs review');
  expect(wrapper.text()).not.toContain('Agenda import saved.'); wrapper.unmount();
});
