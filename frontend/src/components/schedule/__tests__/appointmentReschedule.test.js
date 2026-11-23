import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post, patch: m.patch }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/dashboard', params: {}, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 501, role: 'provider' }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Test', slug: 'test', organization_type: 'agency', timezone: 'America/Denver' }, agencies: [], userAgencies: [] }) }));
import Panel from '../AppointmentReschedulePanel.vue';
import Grid from '../ScheduleAvailabilityGrid.vue';
import { invalidateScheduleSummaryCacheForUser } from '../../../utils/scheduleSummaryCache.js';
let wrapper;
const info = { appointmentId: 18141, timeZone: 'America/Denver', hasSeries: true, canMoveSeries: true, inPerson: true,
  startAt: '2026-11-18T00:00:00Z', endAt: '2026-11-18T01:00:00Z' };
beforeEach(() => {
  vi.clearAllMocks(); setActivePinia(createPinia()); localStorage.clear(); sessionStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-18T15:00:00Z'));
  m.get.mockImplementation(async url => ({ data: url.endsWith('/reschedule') ? info : url.includes('agencies') ? [] : {} }));
  m.post.mockImplementation(async url => ({ data: url.endsWith('/options') ? { rooms: [{ id: 10, label: 'Your room', needsRequest: false }], selectedRoomId: 10 } : { ok: true } }));
  m.patch.mockResolvedValue({ data: { ok: true } });
});
afterEach(async () => { wrapper?.unmount(); await flushPromises(); invalidateScheduleSummaryCacheForUser(501); vi.restoreAllMocks(); vi.useRealTimers(); });

it('requires an occurrence choice, uses the destination reservation, and moves the existing appointment', async () => {
  wrapper = mount(Panel, { props: { appointmentId: 18141, initialStart: '2026-11-19T17:00:00', initialEnd: '2026-11-19T18:00:00' } });
  await flushPromises();
  expect(wrapper.text()).toContain('Your reserved room will be used');
  expect(wrapper.get('button').element.disabled).toBe(true);
  await wrapper.get('select').setValue('single');
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(m.post).toHaveBeenCalledWith('/appointments/18141/reschedule', expect.objectContaining({ startAt: '2026-11-19T17:00:00', endAt: '2026-11-19T18:00:00', scope: 'single', roomId: 10, expectedStartAt: info.startAt }), expect.anything());
  expect(wrapper.emitted('saved')[0][0]).toMatchObject({ rescheduled: true, ok: true });
  expect(m.post.mock.calls.some(([url]) => url === '/appointments')).toBe(false);
});

it('preserves the session length when choosing a new start and makes unassigned-room requests explicit', async () => {
  m.post.mockImplementation(async url => ({ data: url.endsWith('/options') ? { rooms: [{ id: 7, label: 'Original office', needsRequest: true }], selectedRoomId: 7 } : { ok: true, pendingApproval: true } }));
  wrapper = mount(Panel, { props: { appointmentId: 18141 } }); await flushPromises();
  await wrapper.findAll('input')[0].setValue('2026-11-19T17:00'); await flushPromises();
  expect(wrapper.findAll('input')[1].element.value).toBe('2026-11-19T18:00');
  expect(wrapper.text()).toContain('current session stays in place until approval');
  await wrapper.get('select').setValue('single');
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(wrapper.emitted('saved')[0][0].pendingApproval).toBe(true);
});

it('ignores an older room check after the user changes the destination again', async () => {
  let finish;
  m.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  wrapper = mount(Panel, { props: { appointmentId: 18141, initialStart: '2026-11-19T17:00', initialEnd: '2026-11-19T18:00' } }); await flushPromises();
  await wrapper.findAll('input')[0].setValue('2026-11-20T17:00'); await flushPromises();
  finish({ data: { rooms: [{ id: 99, label: 'Stale room' }], selectedRoomId: 99 } }); await flushPromises();
  expect(wrapper.text()).not.toContain('Stale room'); expect(wrapper.text()).toContain('Your room');
});

it('prevents blindly repeating a move whose response was lost', async () => {
  wrapper = mount(Panel, { props: { appointmentId: 18141, initialStart: '2026-11-19T17:00', initialEnd: '2026-11-19T18:00' } }); await flushPromises();
  await wrapper.get('select').setValue('single');
  m.post.mockRejectedValueOnce(new Error('response lost'));
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Refresh the schedule'); expect(wrapper.get('button').element.disabled).toBe(true);
});

it('converts a dropped calendar time into the appointment timezone before checking rooms', async () => {
  wrapper = mount(Panel, { props: { appointmentId: 18141, initialStart: '2026-11-19T17:00', initialEnd: '2026-11-19T18:00', initialTimeZone: 'America/New_York' } }); await flushPromises();
  expect(wrapper.findAll('input').map(i => i.element.value)).toEqual(['2026-11-19T15:00', '2026-11-19T16:00']);
  expect(m.post).toHaveBeenCalledWith('/appointments/18141/reschedule/options', { startAt: '2026-11-19T15:00:00', endAt: '2026-11-19T16:00:00' }, expect.anything());
});

async function grid() {
  wrapper = shallowMount(Grid, { props: { userId: 501, agencyId: 2 }, global: { stubs: { Teleport: false, RouterLink: true } } });
  await flushPromises();
  const s = wrapper.vm.$.setupState;
  s.weekStart = '2026-11-16';
  const event = { id: -18141, appointmentId: 18141, kind: 'PERSONAL_EVENT', title: 'Client session', clientId: 8,
    agencyId: 2, providerId: 501, canEdit: true, canReschedule: true, modality: 'IN_PERSON', timeZone: 'America/Denver',
    startAt: info.startAt, endAt: info.endAt };
  s.summary = { weekStart: '2026-11-16', scheduleEvents: [event] };
  return { s, event };
}

it('shows a draggable appointment for a past session with a display-only negative event ID', async () => {
  const { s } = await grid();
  const block = s.cellBlocks('Tuesday', 17, 0).find(b => b.kind === 'sevt');
  expect(block.appointmentId).toBe(18141); expect(s.isAppointmentBlockDraggable(block)).toBe(true);
  s.onAppointmentPointerDown({ button: 0, clientX: 10, clientY: 10, stopPropagation() {} }, block, 'Tuesday', 17, 0);
  expect(s.appointmentDragState.appointmentId).toBe(18141);
  s.openAppointmentMoveConfirm(s.appointmentDragState, { dayName: 'Thursday', hour: 17, minute: 0 });
  expect(s.appointmentMoveDraft).toMatchObject({ appointmentId: 18141, newStartAt: '2026-11-19T17:00:00' });
});

it('routes edits of a display-only session through its appointment instead of PATCHing a negative event ID', async () => {
  const { s, event } = await grid();
  const item = s.buildScheduleStackItemFromEvent(event);
  await s.openAppointmentEditInScheduleModal({ item, dayName: 'Tuesday', hour: 17 }); await flushPromises();
  s.scheduleEventEditForm.startAt = '2026-11-19T17:00'; s.scheduleEventEditForm.endAt = '2026-11-19T18:00';
  const saving = s.saveScheduleStackItem(item);
  await flushPromises();
  expect(s.scheduleConfirmation?.title).toBe('Update a past event?');
  s.resolveScheduleConfirmation(true);
  await saving;
  expect(s.appointmentMoveDraft).toMatchObject({ appointmentId: 18141, newStartAt: '2026-11-19T17:00:00' });
  expect(m.patch.mock.calls.some(([url]) => url.includes('schedule-events/-'))).toBe(false);
});
