import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), workspace: {}, agenda: [], host: true, failContent: false }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post } }));
vi.mock('../../../utils/orgScopedPath', () => ({ resolveHostImpliedPortalSlug: () => '' }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 9, role: 'provider' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('../../../utils/activityTracker', () => ({ suspendInactivityTimeout: vi.fn(), resumeInactivityTimeout: vi.fn() }));
vi.mock('../../../composables/useActiveMeeting', () => ({ useActiveMeeting: () => ({ setMiniMode: vi.fn(), takeReturnMedia: vi.fn() }) }));
vi.mock('../../../composables/consentedAudioCapture.js', () => ({ createConsentedAudioCapture: () => ({ start: vi.fn(), stop: vi.fn(), flush: vi.fn() }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { eventId: '101', organizationSlug: 'tenant' }, fullPath: '/tenant/join/team-meeting/101' }), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
import JoinTeamMeetingView from '../JoinTeamMeetingView.vue';

let wrapper;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); m.host = true; m.failContent = false;
  m.workspace = { goals: [], actionItems: [] }; m.agenda = [];
  m.get.mockImplementation(async url => {
    if (url.endsWith('/workspace')) {
      if (m.failContent) throw new Error('Offline');
      return { data: { workspace: m.workspace, meetingSettings: { agenda: false, goals: false, actionItems: false }, participants: [], meetingSubtype: 'general' } };
    }
    if (url === '/meeting-agendas') return { data: { items: m.agenda } };
    if (url.includes('join-info')) return { data: { orgSlug: 'tenant', eventId: 101, meetingSubtype: 'general' } };
    if (url.includes('video-token')) return { data: { token: 'video', sessionId: 'room', applicationId: 'app', eventId: 101, isHost: m.host, identity: 'user-9', meetingSubtype: 'general' } };
    if (url.includes('meeting-candidates')) return { data: { users: [{ id: 12, firstName: 'Test', lastName: 'Attendee' }] } };
    return { data: {} };
  });
  m.post.mockResolvedValue({ data: { ok: true, canEndForEveryone: true } });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } });
});
afterEach(() => { wrapper?.unmount(); vi.clearAllTimers(); vi.useRealTimers(); });
async function render() {
  wrapper = shallowMount(JoinTeamMeetingView, { global: { stubs: { SupervisionVideoRoom: { name: 'SupervisionVideoRoom', props: ['videoFullscreen', 'tileFocus'], template: '<div><slot name="extra-controls" /></div>' } } } });
  await flushPromises();
}
const video = () => wrapper.findComponent({ name: 'SupervisionVideoRoom' });
const button = label => wrapper.findAll('button').find(b => b.text() === label);

describe('meeting layout follows content', () => {
  it('uses equal/full video for empty content even when options exist, and lets either participant reveal editors', async () => {
    m.host = false;
    await render();
    expect(video().props()).toMatchObject({ videoFullscreen: true, tileFocus: 'equal' });
    await button('Show goals, agenda & actions').trigger('click');
    expect(video().props('videoFullscreen')).toBe(false);
    expect(wrapper.findComponent({ name: 'MeetingAgendaPanel' }).props('canAddItem')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'MeetingGoalsActionsPanel' })).toHaveLength(2);
    expect(wrapper.findComponent({ name: 'MeetingAttendancePanel' }).exists()).toBe(false);
  });
  it('reveals content added by another participant and respects subsequent manual fullscreen choice', async () => {
    await render();
    m.workspace = { goals: [{ id: 'goal-a', text: 'A shared goal' }], actionItems: [] };
    await vi.advanceTimersByTimeAsync(8000); await flushPromises();
    expect(video().props('videoFullscreen')).toBe(false);
    expect(wrapper.findAllComponents({ name: 'MeetingGoalsActionsPanel' })).toHaveLength(2);
    video().vm.$emit('update:videoFullscreen', true); await flushPromises();
    await vi.advanceTimersByTimeAsync(8000); await flushPromises();
    expect(video().props('videoFullscreen')).toBe(true);
  });
  it('keeps existing agenda content visible and does not assume failed content loads mean empty', async () => {
    m.agenda = [{ id: 7, title: 'Discuss the plan' }];
    await render(); expect(video().props('videoFullscreen')).toBe(false);
    wrapper.unmount(); m.failContent = true;
    await render(); expect(video().props('videoFullscreen')).toBe(false);
  });
  it('waits until screen sharing ends before automatically revealing new meeting content', async () => {
    await render();
    video().vm.$emit('screen-sharing-change', true); await flushPromises();
    m.workspace = { goals: [{ id: 'goal-a', text: 'Discuss after the presentation' }], actionItems: [] };
    await vi.advanceTimersByTimeAsync(8000); await flushPromises();
    expect(video().props('videoFullscreen')).toBe(true);
    video().vm.$emit('screen-sharing-change', false); await flushPromises();
    expect(video().props('videoFullscreen')).toBe(false);
  });
});

describe('guest link and invitation feedback', () => {
  it('does not expose guest-link creation to a cohost granted only by an in-room signal', async () => {
    m.host = false;
    await render();
    video().vm.$emit('cohost-granted'); await flushPromises();
    await button('Invite someone').trigger('click'); await flushPromises();
    expect(button('Copy guest join link')).toBeUndefined();
  });
  it.each([true, false])('copies a guest link while preserving waitingRoomEnabled=%s', async waitingRoomEnabled => {
    m.post.mockImplementation(async url => ({ data: url.endsWith('/guest-link')
      ? { joinUrl: 'https://example.test/join/meeting/opaque', guestLinkEnabled: true, waitingRoomEnabled, roomOpen: !waitingRoomEnabled }
      : { ok: true, canEndForEveryone: true } }));
    await render(); await button('Invite someone').trigger('click'); await flushPromises();
    await button('Copy guest join link').trigger('click'); await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.test/join/meeting/opaque');
    expect(wrapper.get('.join-guest-link-status').text()).toContain(waitingRoomEnabled ? 'Guests wait for admission' : 'This room is open');
    expect(m.post.mock.calls.some(([url]) => url.includes('lobby-settings') || url.includes('admit'))).toBe(false);
  });
  it('retains a selectable guest URL when clipboard access fails', async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error('Denied'));
    m.post.mockResolvedValue({ data: { joinUrl: 'https://example.test/guest', guestLinkEnabled: true, waitingRoomEnabled: true } });
    await render(); await button('Invite someone').trigger('click'); await flushPromises();
    await button('Copy guest join link').trigger('click'); await flushPromises();
    expect(wrapper.get('input[aria-label="Guest join link"]').element.value).toBe('https://example.test/guest');
    expect(wrapper.text()).toContain('Select the link above to copy it');
  });
  it('reports a notification failure instead of claiming the invitation was sent', async () => {
    m.post.mockImplementation(async url => ({ data: url.endsWith('/attendees') ? { notificationSent: false, notificationWarning: 'Added, but the notification could not be sent.' } : { ok: true } }));
    await render(); await button('Invite someone').trigger('click'); await flushPromises();
    await wrapper.get('.join-add-attendee-item').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Added, but the notification could not be sent.');
    expect(wrapper.text()).not.toContain('Invitation queued');
  });
});
