import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Join from '../AdaptiveJoinView.vue';
import { createAddressAutocompleteDirective } from '../../../directives/addressAutocomplete.js';
import { setPublicLocale } from '../../../i18n';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null, isAuthenticated: false }) }));
const address = { street: '1600 Pennsylvania Ave NW', city: 'Washington', state: 'DC', postalCode: '20500', formattedAddress: '1600 Pennsylvania Ave NW, Washington, DC 20500' };
const client = { post: vi.fn() }; let wrapper;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); setPublicLocale('en'); window.scrollTo = vi.fn();
  api.get.mockResolvedValue({ data: { agency: { id: 450, slug: 'synthetic-clinic', name: 'Synthetic clinic' }, activeService: { serviceType: 'counseling', displayName: 'Counseling' }, intakeServices: [{ serviceType: 'counseling' }], pathways: { quick: { enabled: true }, full: { enabled: false } }, copy: {} } });
  api.post.mockResolvedValue({ data: {} });
  client.post.mockReset().mockImplementation(async url => ({ data: url.endsWith('/suggest') ? { suggestions: [{ label: '1600 Pennsylvania Ave NW, Washington DC', selectionToken: 'opaque-selection' }] } : { address } }));
});
afterEach(() => { wrapper?.unmount(); document.body.replaceChildren(); vi.clearAllMocks(); });
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/join/:agencySlug/:serviceType', component: Join }] });
  await router.push('/join/synthetic-clinic/counseling'); await router.isReady();
  wrapper = mount(Join, { attachTo: document.body, global: { plugins: [router], directives: { 'address-autocomplete': createAddressAutocompleteDirective({ client, debounceMs: 0 }) }, stubs: { AdaptiveJoinLanding: { template: '<button @click="$emit(\'continue\',\'quick\')">Brief</button>' }, LearningEnrollmentQuestions: true } } });
  await flushPromises(); if (wrapper.vm.phase === 'pathway') await wrapper.find('button').trigger('click');
  wrapper.vm.chooseWhoFor('couple'); wrapper.vm.form.partnersSameAddress = 'no'; await flushPromises();
  return router;
}
async function choosePrimary() {
  await wrapper.findAll('input[role=combobox]')[0].setValue('1600 Pennsylvania');
  await vi.waitFor(() => expect(document.querySelector('[role=option]')).not.toBeNull());
  document.querySelector('[role=option]').click(); await flushPromises();
}
it('fills the actual join primary household only, retaining the partner, both units and identities', async () => {
  await render();
  Object.assign(wrapper.vm.form.address, { street: 'Primary old street', city: 'Denver', state: 'CO', zip: '80203', apt: 'Unit P' });
  Object.assign(wrapper.vm.form.partner.address, { street: 'Partner old street', city: 'Boulder', state: 'CO', zip: '80301', apt: 'Unit Q' });
  wrapper.vm.form.respondent.firstName = 'Private primary'; wrapper.vm.form.partner.firstName = 'Private partner';
  const partner = JSON.parse(JSON.stringify(wrapper.vm.form.partner)); await flushPromises(); await choosePrimary();
  expect(wrapper.vm.form.address).toEqual({ street: address.street, city: address.city, state: address.state, zip: address.postalCode, apt: 'Unit P' });
  expect(wrapper.vm.form.partner).toEqual(partner);
  expect(wrapper.vm.form.respondent.firstName).toBe('Private primary');
  const [url, data] = client.post.mock.calls.find(([url]) => url.endsWith('/suggest'));
  expect(url).toBe('/address-lookup/context/suggest');
  expect(data.publicContext).toEqual({ kind: 'adaptive-join', token: 'synthetic-clinic', serviceType: 'counseling' });
  expect(JSON.stringify(data)).not.toMatch(/Private primary|Private partner|Unit P|Unit Q|Boulder/);
});
it('fills the actual partner address without replacing the primary household or apartment', async () => {
  await render(); Object.assign(wrapper.vm.form.address, { street: 'Primary old street', city: 'Denver', state: 'CO', zip: '80203', apt: 'Unit P' });
  wrapper.vm.form.partner.address.apt = 'Unit Q'; const primary = JSON.parse(JSON.stringify(wrapper.vm.form.address)); await flushPromises();
  await wrapper.findAll('input[role=combobox]')[1].setValue('1600 Pennsylvania');
  await vi.waitFor(() => expect(document.querySelector('[role=option]')).not.toBeNull()); document.querySelector('[role=option]').click(); await flushPromises();
  expect(wrapper.vm.form.partner.address).toEqual({ street: address.street, city: address.city, state: address.state, zip: address.postalCode, apt: 'Unit Q' });
  expect(wrapper.vm.form.address).toEqual(primary);
});
it('discards an in-flight chosen address when the actual join organization route changes', async () => {
  const router = await render(); let resolveSelection;
  client.post.mockImplementation(url => url.endsWith('/suggest') ? Promise.resolve({ data: { suggestions: [{ label: '1600 Pennsylvania Ave NW', selectionToken: 'opaque-selection' }] } }) : new Promise(resolve => { resolveSelection = resolve; }));
  await choosePrimary(); expect(resolveSelection).toBeTypeOf('function');
  await router.push('/join/another-clinic/counseling'); await flushPromises(); resolveSelection({ data: { address } }); await flushPromises();
  expect(wrapper.vm.form.address.street).toBe('1600 Pennsylvania'); expect(wrapper.vm.form.address.city).not.toBe(address.city);
});
it('does not overwrite a selected locality with a delayed broad ZIP result', async () => {
  await render(); let resolveZip;
  api.get.mockImplementation(url => url.startsWith('/public/us-zip/') ? new Promise(resolve => { resolveZip = resolve; }) : Promise.resolve({ data: {} }));
  await choosePrimary(); expect(resolveZip).toBeTypeOf('function');
  resolveZip({ data: { found: true, city: 'Broad ZIP locality', state: 'XX' } }); await flushPromises();
  expect(wrapper.vm.form.address.city).toBe(address.city); expect(wrapper.vm.form.address.state).toBe(address.state);
});
it('ignores a delayed ZIP result after the actual organization context changes', async () => {
  const router = await render(); let resolveZip;
  api.get.mockImplementation(url => url.startsWith('/public/us-zip/') ? new Promise(resolve => { resolveZip = resolve; }) : Promise.resolve({ data: {} }));
  wrapper.vm.form.address.zip = '20500'; await flushPromises(); expect(resolveZip).toBeTypeOf('function');
  await router.push('/join/another-clinic/counseling'); await flushPromises();
  resolveZip({ data: { found: true, city: 'Former organization locality', state: 'XX' } }); await flushPromises();
  expect(wrapper.vm.form.address.city).toBe(''); expect(wrapper.vm.form.address.state).toBe('');
});
