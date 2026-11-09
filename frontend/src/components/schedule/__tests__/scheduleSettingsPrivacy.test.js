import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { h, reactive } from 'vue';
const m = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), route: null, summary: {}, prefs: {} }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, put: m.put, post: vi.fn() }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'admin' }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Practice' }, agencies: [{ id: 2, name: 'Practice' }, { id: 3, name: 'Other practice' }], userAgencies: [], hydrateAgencyById: vi.fn() }) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
import Hub from '../../dashboard/ScheduleHubPanel.vue';
import { clearScheduleSummaryCache } from '../../../utils/scheduleSummaryCache.js';
let wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T18:00:00Z'));
  setActivePinia(createPinia()); localStorage.clear(); clearScheduleSummaryCache(); vi.clearAllMocks();
  m.route = reactive({ path: '/dashboard', params: {}, query: {} });
  m.prefs = { schedule_display_prefs: { schedulePaletteVersion: 2, clientNameDisplay: 'full', unrelatedPreference: 'keep' } };
  m.summary = { providerId: 7, weekStart: '2026-11-09', scheduleEvents: [], scheduleAgencyIds: [2] };
  m.get.mockImplementation(async url => ({ data: url.includes('/schedule-summary') ? m.summary : url.endsWith('/preferences') ? m.prefs : {} }));
  m.put.mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; clearScheduleSummaryCache(); vi.useRealTimers(); });
const props = { userId: 7, agencyId: 2, mode: 'self', weekStartYmd: '2026-11-09', compactPageChrome: true };
const stubs = { Teleport: false, RouterLink: true, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' } };
async function mountGrid(overrides = {}) {
  wrapper = shallowMount(Grid, { props: { ...props, ...overrides }, global: { stubs }, attachTo: document.body });
  await flushPromises();
  await wrapper.vm.$.setupState.load({ forceRefresh: true }); await flushPromises();
  return wrapper.vm.$.setupState;
}
it('puts organization beside View as and reveals the former header tools with Settings', async () => {
  wrapper = shallowMount(Hub, {
    props: { metaOnlyHeader: true }, attachTo: document.body,
    slots: { 'header-controls': '<span class="view-as-fixture">View as</span>', 'header-actions': '<button class="tasks-fixture">Tasks</button>', default: () => h(Grid, props) },
    global: { stubs: { ...stubs, ScheduleAvailabilityGrid: false } }
  });
  await flushPromises();
  const grid = wrapper.findComponent(Grid);
  await grid.vm.$.setupState.load({ forceRefresh: true }); await flushPromises();
  expect(wrapper.get('.sched-hub__utility-row').find('[aria-label="Schedule organization"]').exists()).toBe(true);
  expect(wrapper.find('.sched-hub__more').exists()).toBe(false);
  expect(wrapper.get('[data-testid="my-schedule-calendar-settings"]').element.open).toBe(false);
  const button = grid.findAll('button').find(b => b.text() === 'Settings▾');
  expect(button).toBeTruthy(); await button.trigger('click');
  const settings = wrapper.get('[data-testid="my-schedule-calendar-settings"]');
  expect(settings.element.open).toBe(true);
  expect(settings.find('.tasks-fixture').exists()).toBe(true);
  expect(settings.get('[data-testid="schedule-client-name-display"]').isVisible()).toBe(true);
  await button.trigger('click'); expect(settings.element.open).toBe(false);
});
it('applies hide, initials and full names to timed, untimed, all-day, day and agenda cards', async () => {
  m.summary.scheduleEvents = [
    { id: 71, kind: 'PERSONAL_EVENT', clientId: 42, clientName: 'Jane Doe', agencyId: 2, title: 'Jane Doe visit', startAt: '2026-11-10T16:00:00Z', endAt: '2026-11-10T17:00:00Z', description: 'Client ID: 42 · Ask Jane Doe' },
    { id: 72, kind: 'PERSONAL_EVENT', clientId: 43, clientName: 'Alex Doe', agencyId: 2, title: 'Alex Doe visit', allDay: true, startDate: '2026-11-10', endDate: '2026-11-11' }
  ];
  m.summary.schoolSoftSessions = [{ agencyId: 2, providerId: 7, schoolId: 20, schoolName: 'North', date: '2026-11-10', clientId: 44, clientName: 'Jamie Doe', canceled: false }];
  const state = await mountGrid();
  state.toggleCalendarSettings(); await flushPromises();
  const select = wrapper.get('[data-testid="schedule-client-name-display"]');
  await select.setValue('hidden'); await flushPromises();
  expect(wrapper.get('.sched-grid-wrap').html()).not.toMatch(/Jane|Alex|Jamie|Doe/);
  state.setScheduleSpanMode('day'); state.focusedDays = ['Tuesday']; await flushPromises();
  expect(wrapper.get('.sched-grid-wrap').html()).not.toMatch(/Jane|Alex|Jamie|Doe/);
  state.setScheduleSpanMode('agenda'); await flushPromises();
  expect(state.agendaItems.filter(item => item.isClientSession).length).toBe(3);
  expect(wrapper.get('.sched-agenda').html()).not.toMatch(/Jane|Alex|Jamie|Doe/);
  await select.setValue('initials'); await flushPromises();
  expect(wrapper.get('.sched-agenda').text()).toContain('JD');
  expect(wrapper.get('.sched-agenda').text()).toContain('AD');
  expect(wrapper.get('.sched-agenda').html()).not.toMatch(/Jane|Alex|Jamie|Doe/);
  await select.setValue('full'); await flushPromises();
  expect(wrapper.get('.sched-agenda').text()).toContain('Jane Doe');
  expect(state.summary.scheduleEvents[0].clientName).toBe('Jane Doe');
});
it('saves and restores the viewer’s name preference while viewing someone else', async () => {
  m.prefs.schedule_display_prefs.clientNameDisplay = 'initials';
  const state = await mountGrid({ userId: 8, mode: 'admin' });
  expect(state.clientNameDisplay).toBe('initials');
  await wrapper.get('[data-testid="schedule-client-name-display"]').setValue('hidden'); await flushPromises();
  expect(JSON.parse(localStorage.getItem('schedule.displayPrefs.v1:7')).clientNameDisplay).toBe('hidden');
  expect(m.put).toHaveBeenCalledWith('/users/7/preferences', { schedule_display_prefs: expect.objectContaining({ clientNameDisplay: 'hidden', unrelatedPreference: 'keep' }) }, expect.anything());
  expect(m.put.mock.calls.some(([url]) => url === '/users/8/preferences')).toBe(false);
});
it('keeps the latest saved choice when preference requests finish slowly', async () => {
  const state = await mountGrid({ userId: 8, mode: 'admin' });
  m.put.mockClear();
  let finishFirst;
  m.put.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
  state.clientNameDisplay = 'initials'; const first = state.saveClientNameDisplay(); await flushPromises();
  state.clientNameDisplay = 'hidden'; const last = state.saveClientNameDisplay(); await flushPromises();
  expect(m.put).toHaveBeenCalledTimes(1);
  finishFirst({ data: {} }); await first; await last;
  expect(m.put.mock.calls.at(-1)[1].schedule_display_prefs.clientNameDisplay).toBe('hidden');
});
it('keeps closures from every loaded organization, deduplicates districts, and filters the all-day row', async () => {
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => {
    if (!url.includes('/schedule-summary')) return get(url, options);
    const agencyId = Number(options.params.agencyId);
    return { data: { ...m.summary, agencyId, scheduleAgencyIds: [2, 3], schoolDayClosures: [
      { agencyId, schoolOrgId: agencyId * 10, eventId: agencyId, scope: 'district', districtName: `District ${agencyId}`, date: '2026-11-10', kind: 'no_school', fullDay: true },
      { agencyId, schoolOrgId: agencyId * 10 + 1, eventId: agencyId, scope: 'district', districtName: `District ${agencyId}`, date: '2026-11-10', kind: 'no_school', fullDay: true }
    ] } };
  });
  const state = await mountGrid({ userId: 8, mode: 'admin', agencyIds: [2, 3] });
  expect(state.allDayBlocksForDay('Tuesday').filter(b => b.kind === 'school-closure')).toHaveLength(2);
  expect(wrapper.findAll('.sched-all-day-item--closure')).toHaveLength(2);
  const select = wrapper.get('[aria-label="Schedule organization"]');
  await select.setValue('3'); await flushPromises();
  expect(wrapper.findAll('.sched-all-day-item--closure')).toHaveLength(1);
  expect(wrapper.get('.sched-all-day-item--closure').text()).toContain('District 3');
  await wrapper.get('.sched-all-day-item--closure').trigger('click');
  expect(state.schoolRailDetail.schoolClosure.districtName).toBe('District 3');
  await state.load({ forceRefresh: true });
  await select.setValue('0'); await state.load(); await flushPromises();
  expect(wrapper.findAll('.sched-all-day-item--closure')).toHaveLength(2);
});
