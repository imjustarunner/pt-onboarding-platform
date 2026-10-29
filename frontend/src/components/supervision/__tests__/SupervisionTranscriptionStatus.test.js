import { shallowMount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), capture: null }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post, put: vi.fn() }, isApiRateLimited: () => false }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 9, role: 'provider' } }) }));
vi.mock('../../../utils/activityTracker', () => ({ suspendInactivityTimeout: vi.fn(), resumeInactivityTimeout: vi.fn() }));
vi.mock('../../../composables/consentedAudioCapture.js', () => ({ createConsentedAudioCapture: options => {
  m.capture = options;
  return { start: () => true, stop: vi.fn(), flush: vi.fn(), control: vi.fn() };
} }));
import GroupRoom from '../GroupSupervisionLiveRoom.vue';
import IndividualRoom from '../IndividualSupervisionLiveRoom.vue';

const rooms = [[GroupRoom, '.gsl__transcript-banner'], [IndividualRoom, '.isl__transcript-banner']];
const props = { supervisionSessionId: 101, isSupervisor: true, isInLobby: false, token: 'token', vonageSessionId: 'room', applicationId: 'app', presenceManagedExternally: true };
let wrapper;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); m.capture = null;
  // Nonempty content keeps the workspace visible while testing its status and polling.
  m.get.mockResolvedValue({ data: { artifact: { goals: [{ id: 'goal', text: 'Discuss progress' }] }, items: [], activity: [] } });
  m.post.mockResolvedValue({ data: {} });
});
afterEach(async () => { wrapper?.unmount(); await flushPromises(); vi.clearAllTimers(); vi.useRealTimers(); });

it.each(rooms)('keeps the notice mounted across recorder segments and shows actual session status', async (component, selector) => {
  wrapper = shallowMount(component, { props }); await flushPromises();
  const banner = wrapper.get(selector).element;
  expect(wrapper.get(selector).text()).toContain('Checking transcription status');
  wrapper.findComponent({ name: 'SupervisionVideoRoom' }).vm.$emit('connected');
  await vi.advanceTimersByTimeAsync(3000);
  const state = { allowed: true, requested: true, paused: false, stopped: false };
  m.capture.onState(state); m.capture.onCapturing(true); await flushPromises();
  expect(wrapper.get(selector).text()).toContain('This session is being transcribed');
  for (let segment = 0; segment < 3; segment++) {
    m.capture.onCapturing(false); await flushPromises();
    expect(wrapper.get(selector).element).toBe(banner);
    expect(wrapper.get(selector).text()).toContain('This session is being transcribed');
    m.capture.onCapturing(true); await flushPromises();
  }
  m.capture.onState({ ...state, paused: true }); await flushPromises();
  expect(wrapper.get(selector).element).toBe(banner);
  expect(wrapper.get(selector).text()).toContain('Transcription paused');
  m.capture.onState({ ...state, stopped: true }); await flushPromises();
  expect(wrapper.get(selector).element).toBe(banner);
  expect(wrapper.get(selector).text()).toContain('Transcription stopped');
  await wrapper.get('button[aria-label="Dismiss transcription notice"]').trigger('click');
  m.capture.onState(state); m.capture.onCapturing(true); await flushPromises();
  expect(wrapper.find('button[aria-label="Dismiss transcription notice"]').exists()).toBe(false);
});

it.each(rooms)('leaves activity fetching to the chat panel and presence to the join page', async component => {
  wrapper = shallowMount(component, { props }); await flushPromises();
  wrapper.findComponent({ name: 'SupervisionVideoRoom' }).vm.$emit('connected');
  await vi.advanceTimersByTimeAsync(60000);
  expect(m.get.mock.calls.filter(([url]) => url.endsWith('/activity'))).toHaveLength(0);
  expect(m.post.mock.calls.filter(([url]) => url.endsWith('/join-presence'))).toHaveLength(0);
});

it('pauses group agenda and attendance polling when their panels are collapsed', async () => {
  wrapper = shallowMount(GroupRoom, { props }); await flushPromises();
  for (const [label, name, flag] of [['Agenda', 'MeetingAgendaPanel', 'live'], ['Attendance', 'MeetingAttendancePanel', 'livePoll']]) {
    expect(wrapper.findComponent({ name }).props(flag)).toBe(true);
    await wrapper.findAll('button.gsl__section-head').find(button => button.text().includes(label)).trigger('click');
    expect(wrapper.findComponent({ name }).props(flag)).toBe(false);
  }
});
