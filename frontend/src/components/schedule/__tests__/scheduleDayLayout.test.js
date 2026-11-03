import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
const m = vi.hoisted(() => ({ get: vi.fn(), route: null, summary: {} }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, put: vi.fn(), post: vi.fn() }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'provider' }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Test' }, agencies: [], userAgencies: [] }) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
import { clearScheduleSummaryCache } from '../../../utils/scheduleSummaryCache.js';
let wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T18:00:00Z'));
  setActivePinia(createPinia()); localStorage.clear(); clearScheduleSummaryCache(); vi.clearAllMocks();
  m.route = reactive({ path: '/dashboard', params: {}, query: {} });
  m.summary = { providerId: 7, weekStart: '2026-10-12', scheduleEvents: [], scheduleAgencyIds: [2] };
  m.get.mockImplementation(async url => ({ data: url.includes('/schedule-summary') ? m.summary : {} }));
});
afterEach(() => { wrapper?.unmount(); clearScheduleSummaryCache(); vi.useRealTimers(); });
async function mount() {
  wrapper = shallowMount(Grid, { props: { userId: 7, agencyId: 2, mode: 'self', weekStartYmd: '2026-10-12' }, global: { stubs: { Teleport: false, RouterLink: true, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' } } } });
  await flushPromises();
  const state = wrapper.vm.$.setupState;
  await state.load({ forceRefresh: true });
  await flushPromises();
  return state;
}
it('renders an all-day block once above the hourly grid, retaining its conflict/edit lookup', async () => {
  m.summary.scheduleEvents = [{ id: 71, kind: 'SCHEDULE_HOLD', agencyId: 2, title: 'Unavailable today', allDay: true, startDate: '2026-10-13', endDate: '2026-10-14' }];
  const state = await mount();
  expect(wrapper.findAll('.sched-all-day-item')).toHaveLength(1);
  expect(wrapper.find('.sched-all-day-item').text()).toBe('Unavailable today');
  expect(state.cellBlocks('Tuesday', 9).some(b => b.eventId === 71)).toBe(false);
  expect(state.scheduleEventsInCell('Tuesday', 9)).toHaveLength(1);
  expect(state.hours[0]).toBe(7);
  state.focusedDays = ['Tuesday']; state.scheduleSpanMode = 'agenda';
  await flushPromises();
  expect(state.agendaItems.filter(item => item.eventId === 71)).toHaveLength(1);
  expect(state.agendaItems.find(item => item.eventId === 71).timeLabel).toBe('All day');
});
it('expands for office reservations, supervision and recurring openings and exposes the 24-hour toggle', async () => {
  m.summary.officeEvents = [{ id: 8, startAt: '2026-10-13T05:00:00', endAt: '2026-10-13T06:00:00' }];
  m.summary.supervisionSessions = [{ id: 9, startAt: '2026-10-13T22:30:00', endAt: '2026-10-13T23:15:00' }];
  const state = await mount();
  expect(state.hours[0]).toBe(5); expect(state.hours.at(-1)).toBe(23);
  expect(state.gridStyle.gridTemplateColumns).toMatch(/^56px/);
  await wrapper.find('.sched-head-cell-corner .sched-hours-toggle').trigger('click');
  expect(state.hours).toHaveLength(24);
  await wrapper.find('.sched-head-cell-corner .sched-hours-toggle').trigger('click');
  expect(state.hours[0]).toBe(5);
});
it('opens the chooser at the selected quarter and keeps a one-hour duration', async () => {
  const state = await mount();
  state.onScheduleCellPlusClick('Tuesday', 7, null, 45);
  await flushPromises();
  expect(state.showRequestModal).toBe(true);
  expect(state.modalStartHour).toBe(7); expect(state.modalStartMinute).toBe(45);
  expect(state.modalEndHour).toBe(8); expect(state.modalEndMinute).toBe(45);
});
it('opens the dedicated day cancellation dialog from the day header', async () => {
  const state = await mount();
  const button = wrapper.findAll('.sched-day-cancel').find(button => button.attributes('aria-label')?.includes('Tuesday'));
  await button.trigger('click');
  expect(state.cancelDayDate).toBe('2026-10-13');
  const dialog = wrapper.findComponent({ name: 'DayCancellationDialog' });
  expect(dialog.props()).toMatchObject({ providerId: 7, agencyId: 2, date: '2026-10-13' });
});
it('loads internal alert badges separately and clears them when switching providers', async () => {
  const get = m.get.getMockImplementation();
  m.get.mockImplementation(async (url, options) => url === '/appointments/staff-alerts'
    ? { data: { alerts: [{ appointmentId: 91, providerScheduleEventId: 72, officeEventId: 83, text: 'Prepare intake forms' }] } }
    : get(url, options));
  const state = await mount();
  expect(state.staffAlertForBlock({ kind: 'sevt', eventId: 72 })).toBe('Prepare intake forms');
  expect(state.staffAlertForBlock({ kind: 'ob', isOfficeBlock: true, eventId: 83 })).toBe('Prepare intake forms');
  expect(m.get).toHaveBeenCalledWith('/appointments/staff-alerts', expect.objectContaining({ params: expect.objectContaining({ providerId: 7, agencyId: 2 }) }));
  m.get.mockImplementation((url, options) => url === '/appointments/staff-alerts' ? new Promise(() => {}) : get(url, options));
  await wrapper.setProps({ userId: 8 });
  expect(state.staffAlertForBlock({ kind: 'sevt', eventId: 72 })).toBe('');
});

it('keeps inherited school access out of personal appointment alert and waitlist requests', async () => {
  const tenants=[{id:2,name:'Practice',organization_type:'agency'},{id:377,name:'Other practice',organization_type:'agency'}];
  const schools=Array.from({length:300},(_,i)=>({id:1000+i,name:`School ${i}`,organization_type:'school'}));
  const get=m.get.getMockImplementation();
  m.get.mockImplementation(async(url,options)=>url==='/users/me/agencies'?{data:[...tenants,...schools]}:get(url,options));
  m.summary.scheduleAgencyIds=[2,377];
  const state=await mount();
  expect(state.effectiveAgencyIds).toEqual([2,377]);
  await wrapper.setProps({compactPageChrome:true});
  const waitlist=wrapper.findComponent({name:'ProviderEnrollmentWaitlist'});
  expect(waitlist.props('agencyIds')).toEqual([2,377]);
  expect(m.get.mock.calls.filter(([url])=>url==='/appointments/staff-alerts').length).toBeLessThanOrEqual(2);
  expect(m.get.mock.calls.filter(([url])=>/^\/agencies\//.test(url))).toHaveLength(0);
});

it('coalesces alerts when cached summaries are reapplied and refreshes after an alert edit', async () => {
  const state=await mount();
  for(let i=0;i<15;i++){await state.load();await flushPromises();}
  expect(m.get.mock.calls.filter(([url])=>url==='/appointments/staff-alerts')).toHaveLength(1);
  window.dispatchEvent(new Event('appointment-staff-alert-changed'));await flushPromises();
  expect(m.get.mock.calls.filter(([url])=>url==='/appointments/staff-alerts')).toHaveLength(2);
});

it('does not overlap pending alert requests or let an old provider overwrite the new provider', async () => {
  let finish;
  const get=m.get.getMockImplementation();
  m.get.mockImplementation((url,options)=>url==='/appointments/staff-alerts'&&options.params.providerId===7
    ?new Promise(resolve=>{finish=resolve}):get(url,options));
  const state=await mount();
  for(let i=0;i<5;i++){await state.load();await flushPromises();}
  expect(m.get.mock.calls.filter(([url])=>url==='/appointments/staff-alerts')).toHaveLength(1);
  await wrapper.setProps({userId:8});await flushPromises();
  finish({data:{alerts:[{appointmentId:91,text:'Other provider'}]}});await flushPromises();
  expect(state.staffAlertForBlock({appointmentId:91})).toBe('');
});

it('reuses cell projections on hover and clock ticks but updates them after schedule changes', async () => {
  m.summary.scheduleEvents=[{id:71,kind:'SCHEDULE_HOLD',agencyId:2,title:'Original',startAt:'2026-10-13T15:00:00Z',endAt:'2026-10-13T16:00:00Z'}];
  const state=await mount();
  const hour=state.parseGridEventDate(m.summary.scheduleEvents[0].startAt).getHours();
  const before=state.cellBlocks('Tuesday',hour);
  expect(before.some(b=>b.eventId===71)).toBe(true);
  state.hoveredBlockKey='hover-test';state.joinPromptNowMs+=15000;await flushPromises();
  expect(state.cellBlocks('Tuesday',hour)).toBe(before);
  state.rawSummary.scheduleEvents[0].title='Changed';await flushPromises();
  expect(state.cellBlocks('Tuesday',hour)).not.toBe(before);
  expect(state.cellBlocks('Tuesday',hour).some(b=>b.title.includes('Changed'))).toBe(true);
  state.rawSummary.scheduleEvents=[];await flushPromises();
  expect(state.cellBlocks('Tuesday',hour).some(b=>b.eventId===71)).toBe(false);
});
