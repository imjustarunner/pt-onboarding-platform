import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount, mount as mountComponent } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), route: null, summary: {} }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, put: vi.fn(), post: m.post }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'provider' }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Test', timezone: 'America/Denver' }, agencies: [], userAgencies: [] }) }));
import SchoolSoftScheduleDialog from '../SchoolSoftScheduleDialog.vue';
import Grid from '../ScheduleAvailabilityGrid.vue';
import { clearScheduleSummaryCache } from '../../../utils/scheduleSummaryCache.js';
let wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T18:00:00Z'));
  setActivePinia(createPinia()); localStorage.clear(); clearScheduleSummaryCache(); vi.clearAllMocks();
  m.route = reactive({ path: '/dashboard', params: {}, query: {} });
  m.summary = { providerId: 7, weekStart: '2026-10-12', schoolAssignments: [{ agencyId: 2, schoolId: 20, schoolName: 'Demo school', dayOfWeek: 'Tuesday', startTime: '08:00', endTime: '15:00' }], schoolSoftSessions: [], scheduleEvents: [], scheduleAgencyIds: [2] };
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
const student = (overrides = {}) => ({ agencyId: 2, providerId: 7, schoolId: 20, clientId: 100, date: '2026-10-13', timeZone: 'America/Denver', clientName: 'Synthetic student', schoolName: 'Demo school', canceled: false, slots: [{ startTime: '10:28', endTime: '11:21' }], ...overrides });
it('renders one client block at the exact minutes in the grid, with no separate roster above it', async () => {
  m.summary.schoolSoftSessions = [student()];
  const s = await mount();
  const blocks = wrapper.findAll('.cell-block-school-soft');
  expect(blocks).toHaveLength(1); expect(blocks[0].text()).toContain('Synthetic student');
  expect(blocks[0].text()).toContain('10:28–11:21');
  expect(wrapper.findComponent({ name: 'SchoolAbsenceRecords' }).exists()).toBe(false);
  const block = s.cellBlocks('Tuesday', 10).find(b => b.kind === 'school-soft');
  expect(block.timedSlice.topPct).toBeCloseTo(46.6667);
  expect(s.cellBlocks('Tuesday', 11).some(b => b.kind === 'school-soft')).toBe(false);
  expect(s.isAppointmentBlockDraggable(block)).toBe(false);
  await blocks[0].trigger('keydown', { key: 'Enter' });
  const dialog = wrapper.findComponent(SchoolSoftScheduleDialog);
  expect(dialog.exists()).toBe(true); expect(dialog.props('block').record.clientId).toBe(100);
  expect(m.post).not.toHaveBeenCalled(); expect(s.showRequestModal).toBe(false);
  dialog.vm.$emit('cancel-day', '2026-10-13'); await flushPromises();
  expect(s.cancelDayDate).toBe('2026-10-13'); expect(s.selectedSchoolSoftBlock).toBeNull();
});
it('keeps untimed children inside the day without making a midnight appointment, in week, agenda and phone views', async () => {
  m.summary.schoolSoftSessions = [student({ slots: [] })];
  const s = await mount();
  expect(wrapper.findAll('.sched-untimed-school-cell button')).toHaveLength(1);
  expect(s.cellBlocks('Tuesday', 0).some(b => b.kind === 'school-soft')).toBe(false);
  s.focusedDays = ['Tuesday']; s.scheduleSpanMode = 'agenda'; await flushPromises();
  expect(s.agendaItems.filter(b => b.kind === 'school-soft')).toHaveLength(1);
  expect(s.agendaItems.find(b => b.kind === 'school-soft').timeLabel).toBe('Time not set');
  s.scheduleSpanMode = 'day'; s.isNarrowSchedule = true; await flushPromises();
  expect(wrapper.find('.sched-mobile-untimed').text()).toContain('Time not set');
  expect(wrapper.findAll('.sched-mobile-untimed button')).toHaveLength(1);
});
it('keeps timed children in quarter-hour agenda and phone lists, and packs overlapping booked sessions beside them', async () => {
  m.summary.schoolSoftSessions = [student()];
  m.summary.scheduleEvents = [{ id: 72, kind: 'SESSION', agencyId: 2, clientId: 200, title: 'Synthetic office session', startAt: '2026-10-13T16:45:00Z', endAt: '2026-10-13T17:30:00Z' }];
  const s = await mount(); s.focusedDays = ['Tuesday']; s.scheduleSpanMode = 'day';
  await flushPromises();
  const soft = s.cellBlocks('Tuesday', 10).find(b => b.kind === 'school-soft');
  expect(soft.laneCols || soft.sideBySideLane?.cols).toBe(2);
  s.showQuarterDetail = true; await flushPromises();
  expect(s.cellBlocks('Tuesday', 10, 0).some(b => b.kind === 'school-soft')).toBe(false);
  expect(s.cellBlocks('Tuesday', 10, 15).some(b => b.kind === 'school-soft')).toBe(true);
  expect(s.mobileDayCardsForHour(10).filter(b => b.kind === 'school-soft')).toHaveLength(1);
  expect(s.mobileDayCardsForHour(10).find(b => b.eventId === 72).cellMinute).toBe(45);
  s.isNarrowSchedule = true; await flushPromises();
  const phoneCard = wrapper.findAll('.sched-day-card.cell-block-school-soft').find(b => b.text().includes('Synthetic student'));
  expect(phoneCard.exists()).toBe(true);
  expect(phoneCard.attributes('style')).not.toContain('position: absolute');
  expect(phoneCard.attributes('style')).not.toContain('height:');
  await phoneCard.trigger('click');
  expect(wrapper.findComponent(SchoolSoftScheduleDialog).props('block').record.clientId).toBe(100);
  s.isNarrowSchedule = false;
  s.scheduleSpanMode = 'agenda'; await flushPromises();
  expect(s.agendaItems.filter(b => b.kind === 'school-soft')).toHaveLength(1);
});
it('keeps availability behind client appointments in week and day views, with quarter guides and exact saved minutes', async () => {
  m.summary.schoolSoftSessions = [student()];
  m.summary.virtualWorkingHours = [{ id: 91, agencyId: 2, dayOfWeek: 'Tuesday', startTime: '10:15', endTime: '12:00', sessionType: 'BOTH' }];
  m.summary.scheduleEvents = [{ id: 72, kind: 'SESSION', agencyId: 2, clientId: 200, title: 'Synthetic office session', startAt: '2026-10-13T16:45:00Z', endAt: '2026-10-13T17:30:00Z' }];
  const s = await mount();
  const hourCell = () => wrapper.find('[data-sched-cell][data-day="Tuesday"][data-hour="10"][data-minute="0"]');
  expect(hourCell().findAll('.sched-quarter-guides > i').map(line => line.attributes('style'))).toEqual(['top: 25%;', 'top: 50%;', 'top: 75%;']);
  for (const dayMode of [false, true]) {
    if (dayMode) { s.focusedDays = ['Tuesday']; s.scheduleSpanMode = 'day'; await flushPromises(); }
    const blocks = s.cellBlocks('Tuesday', 10);
    const soft = blocks.find(b => b.kind === 'school-soft');
    const office = blocks.find(b => b.eventId === 72);
    expect(soft.sideBySideLane.cols).toBe(2); expect(office.sideBySideLane.cols).toBe(2);
    expect(soft.sideBySideLane.col).not.toBe(office.sideBySideLane.col);
    expect(soft.timedSlice.topPct).toBeCloseTo(28/60*100);
    expect(soft.timedSlice.heightPct).toBeCloseTo(53/60*100);
    for (const kind of ['school', 'portal']) {
      const context = blocks.find(b => b.kind === kind);
      expect(context.backgroundContext).toBe(true);
      expect(s.cellBlockStyle(context).zIndex).toBeLessThan(s.cellBlockStyle(soft).zIndex);
    }
  }
  await hourCell().find('.cell-multi-pick-badge').trigger('click');
  expect(hourCell().find('.cell-expanded-item.cell-block-school').text()).toContain('School');
  expect(hourCell().find('.cell-expanded-item.cell-block-portal').text()).toContain('Virtual');
  expect(hourCell().findAll('.cell-expanded-item')).toHaveLength(4);
  await hourCell().find('.cell-blocks').trigger('keydown', { key: 'Escape' });
  s.scheduleSideBySide = false; await flushPromises();
  const portal = s.cellBlocks('Tuesday', 10).find(b => b.kind === 'portal');
  expect(s.cellBlockStyle(portal)).toMatchObject({ position: 'absolute', top: '25%', height: 'calc(75% - 2px)', flex: 'none' });
  s.scheduleSideBySide = true; s.showQuarterDetail = true; await flushPromises();
  expect(wrapper.find('.sched-quarter-guides').exists()).toBe(false);
  const soft = s.cellBlocks('Tuesday', 10, 15).find(b => b.kind === 'school-soft');
  expect(soft.timedSlice.topPct).toBeCloseTo(13/15*100);
  expect(soft.timedSlice.heightPct).toBeCloseTo(53/15*100);
  await wrapper.find('.cell-block-school-soft').trigger('click');
  expect(wrapper.findComponent(SchoolSoftScheduleDialog).props('block').record.clientId).toBe(100);
  expect(m.post).not.toHaveBeenCalled();
});
it('expands the calendar for early school times and preserves cancellation attention and receipt details on click', async () => {
  m.summary.schoolSoftSessions = [student({ canceled: true, slots: [{ startTime: '06:10', endTime: '06:50' }], reason: 'Weather', actorName: 'Synthetic support', delivery: { sent: 1, failed: 1, deliveries: [{ status: 'sent', recipient_address: 'qa@example.com', receiptRequired: true }] } })];
  const s = await mount();
  expect(s.hours[0]).toBe(6);
  const block = wrapper.find('.cell-block-school-soft'); expect(block.text()).toContain('needs attention');
  expect(block.classes()).not.toContain('cell-block-sevt--cancelled');
  await block.trigger('click');
  expect(wrapper.findComponent(SchoolSoftScheduleDialog).props('block').record.delivery.deliveries[0].recipient_address).toBe('qa@example.com');
  await wrapper.setProps({ userId: 8 }); expect(s.selectedSchoolSoftBlock).toBeNull();
});

it('opens the preserved contact history immediately, including who canceled, missing email and receipt evidence', async () => {
  const record = student({ canceled: true, reason: 'Weather', actorName: 'Synthetic support', actorUserId: 12, providerName: 'Synthetic provider', recordedAt: '2026-10-12 18:00:00', urgent: true,
    delivery: { sent: 1, failed: 1, deliveries: [
      { status: 'sent', recipient_name: 'Guardian A', recipient_address: 'qa.a@example.com', receiptRequired: true, receiptConfirmedAt: '2026-10-12 18:04:00' },
      { status: 'failed', recipient_name: 'Guardian B', recipient_address: '', error_message: 'Missing email' }
    ] } });
  wrapper = mountComponent(SchoolSoftScheduleDialog, { props: { block: { record, clientName: record.clientName, displayDate: record.date, timeLabel: '10:28–11:21', displayTimeZone: record.timeZone }, canCancelDay: false } });
  await flushPromises();
  expect(wrapper.find('details').attributes()).toHaveProperty('open');
  expect(wrapper.text()).toContain('Synthetic support'); expect(wrapper.text()).toContain('qa.a@example.com');
  const receiptTime = new Date('2026-10-12T18:04:00Z').toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
  expect(wrapper.text()).toContain(`Receipt confirmed ${receiptTime}`);
  expect(wrapper.text()).not.toContain('2026-10-12 18:04:00');
  expect(wrapper.text()).toContain('No email on file'); expect(wrapper.text()).toContain('Missing email');
  expect(wrapper.text()).toContain('does not represent a booked EHR session');
  await wrapper.find('button[aria-label="Close school schedule details"]').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1); expect(m.post).not.toHaveBeenCalled();
});
