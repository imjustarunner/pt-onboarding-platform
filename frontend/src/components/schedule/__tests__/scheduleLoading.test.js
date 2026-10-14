import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';

const m = vi.hoisted(() => ({ get: vi.fn(), hydrate: vi.fn(), route: null, failSchedule: false }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, put: vi.fn(), post: vi.fn() }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'provider', has_supervisor_privileges: true }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: null, agencies: [], userAgencies: [], hydrateAgencyById: m.hydrate }) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
import { clearScheduleSummaryCache, getScheduleSummaryStale, setScheduleSummary } from '../../../utils/scheduleSummaryCache.js';

const summary = { providerId: 7, weekStart: '2026-10-12', scheduleEvents: [], scheduleAgencyIds: [] };
let wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-13T18:00:00Z'));
  setActivePinia(createPinia());
  localStorage.clear();
  clearScheduleSummaryCache();
  vi.clearAllMocks();
  m.failSchedule = false;
  m.route = reactive({ path: '/dashboard', params: {}, query: {} });
  m.get.mockImplementation(async (url) => {
    if (url.includes('/schedule-summary')) {
      if (m.failSchedule) throw { response: { status: 503, data: { error: { message: 'Schedule temporarily unavailable.' } } } };
      return { data: summary };
    }
    if (url.endsWith('/agencies')) throw { response: { status: 403 } };
    return { data: {} };
  });
});
afterEach(() => {
  wrapper?.unmount();
  clearScheduleSummaryCache();
  vi.useRealTimers();
});
async function mount() {
  wrapper = shallowMount(Grid, {
    props: { userId: 7, mode: 'self', weekStartYmd: '2026-10-12' },
    global: { stubs: { RouterLink: true, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' } } }
  });
  await flushPromises();
  return wrapper.vm.$.setupState;
}

it('loads the signed-in provider calendar even when the optional agency request is denied', async () => {
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  expect(m.get).toHaveBeenCalledWith('/users/7/schedule-summary', expect.objectContaining({ params: expect.objectContaining({ includeAllAgencies: 'true' }) }));
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
});

it('shows a load error without throwing, and lets the provider retry successfully', async () => {
  const state = await mount();
  m.failSchedule = true;
  await expect(state.load({ forceRefresh: true })).resolves.toBeUndefined();
  await flushPromises();
  expect(state.loading).toBe(false);
  expect(wrapper.find('[role="alert"]').text()).toContain('Schedule temporarily unavailable.');
  m.failSchedule = false;
  await wrapper.find('[data-testid="schedule-retry"]').trigger('click');
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
});

it('keeps a cached calendar visible after a transient refresh failure', async () => {
  setScheduleSummary('7|all|2026-10-12|monday|false|false|false|', summary);
  vi.setSystemTime(new Date(Date.now() + 120_000));
  m.failSchedule = true;
  const state = await mount();
  await expect(state.load()).resolves.toBeUndefined();
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toContain('previously loaded schedule');
});

it('keeps the calendar mounted with inline progress while a refresh is pending', async () => {
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  const grid = wrapper.find('.sched-grid-wrap').element;
  let resolveSchedule;
  const get = m.get.getMockImplementation();
  m.get.mockImplementation((url, options) => url.includes('/schedule-summary')
    ? new Promise(resolve => { resolveSchedule = resolve; }) : get(url, options));
  const refreshing = state.load({ forceRefresh: true });
  await flushPromises();
  expect(state.loading).toBe(true);
  expect(state.summary).toMatchObject(summary);
  expect(wrapper.find('.sched-grid-wrap').element).toBe(grid);
  expect(wrapper.find('.sched-corner-loading').text()).toContain('Refreshing');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
  resolveSchedule({ data: summary });
  await refreshing;
  await flushPromises();
  expect(wrapper.find('.sched-grid-wrap').element).toBe(grid);
  expect(wrapper.find('.sched-corner-loading').exists()).toBe(false);
});

it.each([401, 403])('clears cached schedule data when the calendar request is denied with %s', async (status) => {
  const key = '7|all|2026-10-12|monday|false|false|false|';
  setScheduleSummary(key, summary);
  vi.setSystemTime(new Date(Date.now() + 120_000));
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => {
    if (url.includes('/schedule-summary')) throw { response: { status, data: {} } };
    return get(url, options);
  });
  const state = await mount();
  await expect(state.load()).resolves.toBeUndefined();
  await flushPromises();
  expect(state.summary).toBeNull();
  expect(state.error).toBeTruthy();
  expect(getScheduleSummaryStale(key)).toBeNull();
  expect(wrapper.find('[data-testid="schedule-retry"]').exists()).toBe(true);
});

it.each([
  { scheduleSideBySide: true, rowHeightMode: 'compact', spanMode: 'week' },
  { scheduleSideBySide: true, rowHeightMode: 'xl', spanMode: 'day', hideWeekend: true },
  { spanMode: 'agenda', weekStartsOn: 'sunday', showAllHours: true }
])('loads My Schedule with saved display settings %j', async (prefs) => {
  localStorage.setItem('schedule.displayPrefs.v1:7', JSON.stringify(prefs));
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
});

it('keeps app appointments loaded when a saved Google overlay reports a permission error', async () => {
  localStorage.setItem('schedule.overlayPrefs.v2:7:multi', JSON.stringify({ showGoogleEvents: true, viewMode: 'open_finder' }));
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => {
    if (url.includes('/schedule-summary')) return { data: { ...summary, googleCalendarEnabled: true, googleEvents: [], googleEventsError: 'Request failed with status code 403' } };
    return get(url, options);
  });
  const state = await mount();
  await vi.advanceTimersByTimeAsync(1000);
  await flushPromises();
  expect(state.summary).toMatchObject(summary);
  expect(state.error).toBe('');
  expect(wrapper.find('[data-testid="my-schedule-empty"]').exists()).toBe(false);
});

it('loads memberships once, shows personal rooms by default, and keeps available-room counts off', async () => {
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => {
    if (url.endsWith('/agencies')) return { data: Array.from({ length: 300 }, (_, i) => ({ id: i + 1, name: `Tenant ${i + 1}`, organization_type: 'agency' })) };
    if (url === '/offices') return { data: [{ id: 1, name: 'Office' }] };
    return get(url, options);
  });
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  expect(m.get.mock.calls.filter(([url]) => url === '/users/me/agencies')).toHaveLength(1);
  expect(m.hydrate).not.toHaveBeenCalled();
  expect(state.selectedOfficeLocationId).toBe(-1);
  expect(state.showMyRooms).toBe(true);
  expect(state.showOfficeOverlay).toBe(false);
  expect(m.get.mock.calls.some(([url]) => /weekly-grid|assigned-offices/.test(url))).toBe(false);
  const select = wrapper.find('[data-tour="my-schedule-office-select"]');
  expect(select.exists()).toBe(true);
  expect(select.findAll('option').map(o => o.text())).toContain('All offices');
});

it('toggles personal reservations independently of available-room counts and remembers the choice', async () => {
  const get = m.get.getMockImplementation();
  m.get.mockImplementation((url, options) => {
    if (url.includes('/schedule-summary')) return Promise.resolve({ data: { ...summary, officeEvents: [
      { id: 1, buildingId: 1, roomId: 10, assignedProviderId: 7, slotState: 'ASSIGNED_AVAILABLE', startAt: new Date('2026-10-12T10:00:00').toISOString(), endAt: new Date('2026-10-12T11:00:00').toISOString() },
      { id: 2, buildingId: 2, roomId: 20, assignedProviderId: 7, bookedProviderId: 7, slotState: 'ASSIGNED_BOOKED', startAt: new Date('2026-10-12T10:00:00').toISOString(), endAt: new Date('2026-10-12T11:00:00').toISOString() }
    ] } });
    return get(url, options);
  });
  const state = await mount();
  await vi.advanceTimersByTimeAsync(500); await flushPromises();
  expect(state.cellBlocks('Monday', 10).map(b => b.kind)).toEqual(expect.arrayContaining(['oa','ob']));
  expect(state.showOfficeOverlay).toBe(false);
  await wrapper.find('[data-testid="my-schedule-room-toggle"]').trigger('click');
  expect(state.cellBlocks('Monday', 10).some(b => ['oa','ob'].includes(b.kind))).toBe(false);
  expect(state.showOfficeOverlay).toBe(false);
  expect(JSON.parse(localStorage.getItem('schedule.overlayPrefs.v2:7:multi')).showMyRooms).toBe(false);
  wrapper.unmount();
  const restored = await mount();
  expect(restored.showMyRooms).toBe(false);
  await wrapper.find('[data-testid="my-schedule-room-toggle"]').trigger('click');
  await vi.advanceTimersByTimeAsync(500); await flushPromises();
  expect(restored.cellBlocks('Monday', 10).map(b => b.kind)).toEqual(expect.arrayContaining(['oa','ob']));
});
