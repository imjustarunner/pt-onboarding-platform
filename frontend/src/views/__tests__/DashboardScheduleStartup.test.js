import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: m.get, post: vi.fn(async()=>({data:{}})), put: vi.fn(async()=>({data:{}})) }, isApiRateLimited: () => false }));
import DashboardView from '../DashboardView.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
let wrapper;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  m.get.mockImplementation(async url => {
    if (url.endsWith('/onboarding-checklist')) return new Promise(() => {});
    return { data: [] };
  });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('mounts My Schedule without mounting the overview while the onboarding request is still pending', async () => {
  const pinia=createPinia();setActivePinia(pinia);
  useAuthStore().user={id:7,role:'provider',status:'active',first_name:'Test',last_name:'Provider',has_provider_access:true};
  const agency={id:2,name:'Agency',organization_type:'agency'};
  useAgencyStore().currentAgency=agency;useAgencyStore().userAgencies=[agency];useAgencyStore().agencies=[agency];
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboard',component:DashboardView}]});
  await router.push('/dashboard?tab=my_schedule');await router.isReady();
  wrapper=shallowMount(DashboardView,{global:{plugins:[pinia,router],renderStubDefaultSlot:true}});
  await flushPromises();
  expect(wrapper.find('schedule-availability-grid-stub').exists()).toBe(true);
  expect(wrapper.find('dashboard-overview-home-stub').exists()).toBe(false);
  expect(m.get.mock.calls.some(([url])=>url.endsWith('/onboarding-checklist'))).toBe(true);
});
