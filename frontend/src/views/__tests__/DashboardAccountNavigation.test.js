import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: m.get, post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) }, isApiRateLimited: () => false }));
import DashboardView from '../DashboardView.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

let wrapper;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('CSS', { escape: value => value });
  m.get.mockImplementation(async url => {
    if (url.endsWith('/onboarding-checklist')) return { data: { completionPercentage: 25 } };
    if (url === '/users/7') return { data: { status: 'ACTIVE_EMPLOYEE' } };
    return { data: [] };
  });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function open(path) {
  const pinia = createPinia(); setActivePinia(pinia);
  useAuthStore().user = { id: 7, role: 'provider', status: 'active', first_name: 'Test', last_name: 'Provider', has_provider_access: true };
  const agency = { id: 2, name: 'Agency', organization_type: 'agency', slug: 'itsco' };
  useAgencyStore().currentAgency = agency; useAgencyStore().userAgencies = [agency]; useAgencyStore().agencies = [agency];
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/dashboard', component: DashboardView }, { path: '/:organizationSlug/dashboard', component: DashboardView }, { path: '/onboarding', component: { template: '<div />' } }] });
  await router.push(path); await router.isReady();
  wrapper = shallowMount(DashboardView, { global: { plugins: [pinia, router], renderStubDefaultSlot: true, stubs: { MyAccountTab: false, AccountHubPanel: false, RouterLink: false } } });
  await flushPromises();
  return router;
}

it.each(['/dashboard', '/itsco/dashboard'])('returns from enrollment settings to %s with an unfinished employee checklist', async path => {
  const router = await open(`${path}?tab=my&my=preferences#prefs-enrollment`);
  expect(wrapper.find('user-preferences-hub-stub').exists()).toBe(true);
  const settings = wrapper.get('[data-profile-my-section="preferences"]');
  expect(settings.attributes('aria-modal')).toBeUndefined();
  expect(wrapper.get('[aria-controls="account-section-menu"]').text()).toBe('Expand account menu');
  await wrapper.get('.account-dashboard-link').trigger('click'); await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe(path);
  expect(wrapper.find('user-preferences-hub-stub').exists()).toBe(false);
  expect(wrapper.find('dashboard-overview-home-stub').exists()).toBe(true);
});

it('leaves settings when the global Dashboard link clears the query', async () => {
  const router = await open('/dashboard?tab=my&my=preferences#prefs-enrollment');
  await router.push('/dashboard'); await flushPromises();
  expect(wrapper.find('user-preferences-hub-stub').exists()).toBe(false);
  expect(wrapper.find('dashboard-overview-home-stub').exists()).toBe(true);
});

it('returns to My Account and clears enrollment and search targets', async () => {
  const router = await open('/dashboard?tab=my&my=preferences&section=prefs-enrollment#prefs-enrollment');
  await wrapper.findAll('.acct-back').find(b => b.text().includes('Back to My Account')).trigger('click'); await flushPromises();
  expect(router.currentRoute.value.query).toEqual({ tab: 'my', my: 'account' });
  expect(router.currentRoute.value.hash).toBe('');
  expect(wrapper.get('[aria-label="My Account sections"]').isVisible()).toBe(true);
  expect(wrapper.find('user-preferences-hub-stub').exists()).toBe(false);
});

it('lets browser Back leave settings for the previous account section', async () => {
  const router = await open('/dashboard?tab=my&my=account');
  await wrapper.findAll('.acct-hub__nav-item').find(b => b.text().includes('My Settings')).trigger('click'); await flushPromises();
  expect(router.currentRoute.value.query.my).toBe('preferences');
  router.back(); await flushPromises();
  expect(router.currentRoute.value.query.my).toBe('account');
  expect(wrapper.find('user-preferences-hub-stub').exists()).toBe(false);
});

it('can switch directly from settings to Accounts & access', async () => {
  const router = await open('/dashboard?tab=my&my=preferences#prefs-enrollment');
  await wrapper.get('[aria-controls="account-section-menu"]').trigger('click');
  await wrapper.findAll('.acct-hub__nav-item').find(b => b.text().includes('Accounts & access')).trigger('click'); await flushPromises();
  expect(router.currentRoute.value.query.my).toBe('access');
  expect(router.currentRoute.value.hash).toBe('');
  expect(wrapper.find('my-account-access-stub').exists()).toBe(true);
  expect(wrapper.find('user-preferences-hub-stub').exists()).toBe(false);
});

it('honors legacy account-only settings links', async () => {
  await open('/dashboard?my=preferences');
  expect(wrapper.find('user-preferences-hub-stub').exists()).toBe(true);
});

it.each(['/dashboard', '/itsco/dashboard'])('opens availability directly from a match notification at %s', async path => {
  await open(`${path}?tab=my&my=availability`);
  expect(wrapper.get('[data-profile-my-section="availability"]').isVisible()).toBe(true);
  expect(wrapper.findComponent({name:'ProviderAvailabilitySettings'}).props()).toMatchObject({providerId:7,agencyId:2});
});
