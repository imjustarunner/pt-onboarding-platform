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

it('lets an ordinary provider view a coworker without mounting schedule editing controls', async () => {
  m.get.mockImplementation(async url => ({ data: url === '/staff/directory' ? { staff: [{ id: 8, displayName: 'Test Coworker', workEmail: 'work@example.test' }] } : [] }));
  const pinia = createPinia(); setActivePinia(pinia);
  useAuthStore().user = { id: 7, role: 'provider', status: 'ACTIVE_EMPLOYEE', has_provider_access: true };
  const agency = { id: 2, name: 'Agency', organization_type: 'agency' };
  useAgencyStore().currentAgency = agency; useAgencyStore().userAgencies = [agency]; useAgencyStore().agencies = [agency];
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/dashboard', component: DashboardView }] });
  await router.push('/dashboard?tab=my_schedule'); await router.isReady();
  wrapper = shallowMount(DashboardView, { global: { plugins: [pinia, router], renderStubDefaultSlot: true } });
  await flushPromises();
  const state = wrapper.vm.$.setupState;
  expect(m.get).toHaveBeenCalledWith('/staff/directory', expect.objectContaining({ params: { agencyId: 2, activeOnly:true } }));
  state.onScheduleModalChangeUser(8); await flushPromises();
  const coworkerGrid=wrapper.findComponent({name:'ScheduleAvailabilityGrid'});
  expect(coworkerGrid.props('userId')).toBe(8);
  expect(coworkerGrid.props('teamCalendar')).toBe(true);
  expect(coworkerGrid.props('teamAvailabilityOnly')).toBe(true);
  state.clearMyScheduleViewAs(); await flushPromises();
  const ownGrid=wrapper.findComponent({name:'ScheduleAvailabilityGrid'});
  expect(ownGrid.props('userId')).toBe(7);
  expect(ownGrid.props('teamAvailabilityOnly')).toBe(false);
});
it('uses the active agency staff directory for administrator employee calendar choices too',async()=>{
  m.get.mockImplementation(async url=>({data:url==='/staff/directory'?{staff:[{id:8,displayName:'Active Employee',workEmail:'staff@example.test'}]}:[]}));
  const pinia=createPinia();setActivePinia(pinia);useAuthStore().user={id:7,role:'super_admin',status:'ACTIVE_EMPLOYEE'};
  const agency={id:2,name:'Agency',organization_type:'agency'};useAgencyStore().currentAgency=agency;useAgencyStore().userAgencies=[agency];useAgencyStore().agencies=[agency];
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboard',component:DashboardView}]});await router.push('/dashboard?tab=my_schedule');await router.isReady();
  wrapper=shallowMount(DashboardView,{global:{plugins:[pinia,router],renderStubDefaultSlot:true}});await flushPromises();
  expect(m.get).toHaveBeenCalledWith('/staff/directory',expect.objectContaining({params:{agencyId:2,activeOnly:true}}));
  expect(m.get.mock.calls.some(([url])=>url==='/users')).toBe(false);
  expect(wrapper.vm.$.setupState.employeeSchedulePickerOptions.map(person=>person.id)).toEqual([8]);
  expect(wrapper.vm.$.setupState.employeesDirectoryRows[0].agencyName).toBe('Agency');
});

it.each([['',''],['&weekStart=2026-11-30','2026-11-30']])('opens today rather than a stale saved week while honoring explicit links %s',async(suffix,expected)=>{
 localStorage.setItem('dashboard.scheduleViewPref.v1:7',JSON.stringify({mode:'self',selfWeekStartYmd:'2025-01-06'}));
 const pinia=createPinia();setActivePinia(pinia);useAuthStore().user={id:7,role:'provider',status:'active',has_provider_access:true};
 const agency={id:2,name:'Agency',organization_type:'agency'};useAgencyStore().currentAgency=agency;useAgencyStore().userAgencies=[agency];useAgencyStore().agencies=[agency];
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboard',component:DashboardView}]});await router.push('/dashboard?tab=my_schedule'+suffix);await router.isReady();
 wrapper=shallowMount(DashboardView,{global:{plugins:[pinia,router],renderStubDefaultSlot:true}});await flushPromises();expect(wrapper.vm.$.setupState.selfScheduleWeekStartYmd).toBe(expected);
});
