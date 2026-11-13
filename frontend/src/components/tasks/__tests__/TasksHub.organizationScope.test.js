vi.mock('../PaperPacketTaskAction.vue', () => ({ default: { template: '<div />' } }));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import TasksHub from '../TasksHub.vue';

const mocks = vi.hoisted(() => ({ auth: null, agency: null, tasks: null, get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get, post: vi.fn().mockResolvedValue({ data: {} }), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('../../../store/tasks', () => ({ useTasksStore: () => mocks.tasks }));

const alpha = { id: 450, name: 'Alpha full tenant', slug: 'alpha-qa', organization_type: 'agency', feature_flags: {} };
const beta = { id: 458, name: 'Beta full tenant', slug: 'beta-qa', organization_type: 'agency', feature_flags: {} };
const school = { id: 451, name: 'Nested school', organization_type: 'school', affiliated_agency_id: 450 };
const restricted = { id: 456, name: 'Restricted SCB company', organization_type: 'agency', feature_flags: { schoolCareBridgeOnly: true } };
let wrapper;

beforeEach(() => {
  localStorage.clear();
  mocks.auth = reactive({ user: { id: 1434, role: 'support' } });
  mocks.agency = reactive({ currentAgency: { ...alpha }, userAgencies: [{ ...alpha }, { ...beta }, { ...school }, { ...restricted }] });
  mocks.tasks = reactive({ tasks: [], taskCounts: {}, fetchTasks: vi.fn().mockResolvedValue([]), fetchTaskCounts: vi.fn().mockResolvedValue({}) });
  mocks.get.mockReset().mockImplementation(async url => ({ data: url === '/task-lists/team' ? [] : [] }));
});
afterEach(() => wrapper?.unmount());

async function mountHub() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:organizationSlug/tasks', component: { template: '<div />' } }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
  await router.push('/alpha-qa/tasks?tab=all&teamMode=lists');
  wrapper = shallowMount(TasksHub, { props: { hideTimeline: true }, global: { plugins: [router] } });
  await flushPromises();
  return wrapper.vm.$.setupState;
}

it('mounted Team Lists requests only full task tenants, never SCB456 or nested451', async () => {
  const state = await mountHub();
  await state.loadTeamLists();
  const ids = mocks.get.mock.calls.filter(([url]) => url === '/task-lists/team').map(([, options]) => options.params.agencyId);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids)).toEqual(new Set([450, 458]));
  expect(ids).not.toContain(456);
  expect(ids).not.toContain(451);
});

it('late lists from the previous allowed tenant cannot replace the selected tenant', async () => {
  const state = await mountHub();
  state.teamFilters.tenantId = '450';
  let release;
  mocks.get.mockImplementation(async (url, options) => {
    if (url !== '/task-lists/team') return { data: [] };
    if (options.params.agencyId === 450) return new Promise(resolve => { release = resolve; });
    return { data: [{ id: 20, name: 'Current Beta list' }] };
  });
  const previous = state.loadTeamLists();
  await flushPromises();
  state.teamFilters.tenantId = '458';
  await state.loadTeamLists(); await nextTick();
  expect(state.teamLists.map(list => list.name)).toEqual(['Current Beta list']);
  release({ data: [{ id: 10, name: 'Old Alpha list' }] });
  await previous; await flushPromises();
  expect(state.teamLists.map(list => list.name)).toEqual(['Current Beta list']);
  expect(state.teamLists.every(list => list._agencyId === 458)).toBe(true);
  expect(wrapper.text()).not.toContain('Old Alpha list');
});

it('a delayed previous search cannot overwrite the current search in the same tenant', async () => {
  const state = await mountHub();
  state.teamFilters.tenantId = '450';
  const lists = [{ id: 10, name: 'Old query list' }, { id: 20, name: 'Current query list' }];
  let release;
  let first = true;
  mocks.get.mockImplementation(async url => {
    if (url !== '/task-lists/team') return { data: [] };
    if (first) { first = false; return new Promise(resolve => { release = resolve; }); }
    return { data: lists };
  });
  state.teamListSearch = 'old';
  const previous = state.loadTeamLists(); await flushPromises();
  state.teamListSearch = 'current';
  await state.loadTeamLists(); await nextTick();
  expect(state.teamLists.map(list => list.name)).toEqual(['Current query list']);
  release({ data: lists }); await previous; await flushPromises();
  expect(state.teamLists.map(list => list.name)).toEqual(['Current query list']);
  expect(wrapper.text()).not.toContain('Old query list');
});

it('losing full-tenant membership clears lists and does not restore a restricted fallback or stale result', async () => {
  const state = await mountHub();
  state.teamFilters.tenantId = '450';
  let release;
  mocks.get.mockImplementation(async url => url === '/task-lists/team' ? new Promise(resolve => { release = resolve; }) : { data: [] });
  const previous = state.loadTeamLists(); await flushPromises();
  mocks.agency.userAgencies = [{ ...restricted }];
  mocks.agency.currentAgency = { ...restricted };
  await nextTick();
  await state.loadTeamLists(); await flushPromises();
  release({ data: [{ id: 10, name: 'Former Alpha list' }] }); await previous; await flushPromises();
  expect(state.teamLists).toEqual([]);
  expect(state.teamListsGrouped).toEqual([]);
  expect(mocks.get.mock.calls.some(([url, options]) => url === '/task-lists/team' && Number(options.params.agencyId) === 456)).toBe(false);
});
