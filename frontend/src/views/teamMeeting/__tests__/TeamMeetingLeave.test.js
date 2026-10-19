import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), host: true, subtype: 'general' }));
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
  vi.clearAllMocks(); vi.useFakeTimers(); m.host = true; m.subtype = 'general';
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  m.get.mockImplementation(async url => ({ data: url.includes('join-info')
    ? { orgSlug: 'tenant', eventId: 101, meetingSubtype: m.subtype }
    : url.includes('video-token')
      ? { token: 'video', sessionId: 'room', applicationId: 'app', eventId: 101, isHost: m.host, identity: 'user-9', meetingSubtype: m.subtype }
      : { meetingSubtype: m.subtype } }));
  m.post.mockImplementation(async url => ({ data: url.endsWith('/complete')
    ? { meetingCompletedAt: '2026-10-19T23:00:00Z' }
    : { ok: true, canEndForEveryone: m.host } }));
});
afterEach(() => { wrapper?.unmount(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function render() {
  wrapper = shallowMount(JoinTeamMeetingView); await flushPromises();
  return wrapper.findAll('button').find(b => b.text() === (m.host ? 'Leave / End meeting' : 'Leave meeting'));
}
describe.each(['general', 'training', 'leadership_circle', 'interview'])('%s leave and end actions', subtype => {
  it('lets the host leave without ending the meeting', async () => {
    m.subtype = subtype; const leave = await render(); await leave.trigger('click');
    await wrapper.get('[role="dialog"]').findAll('button').find(b => b.text() === 'Leave without ending').trigger('click'); await flushPromises();
    expect(m.post.mock.calls.some(([url]) => url.endsWith('/complete'))).toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: 'MeetingSessionExitPanel' }).props('canRejoin')).toBe(true);
  });
  it('requires the explicit confirmation before ending for everyone', async () => {
    m.subtype = subtype; const leave = await render(); await leave.trigger('click');
    const end = wrapper.get('[role="dialog"]').findAll('button').find(b => b.text() === 'Leave and end meeting for everyone');
    window.confirm.mockReturnValue(false); await end.trigger('click'); await flushPromises();
    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to end this meeting for everyone?');
    expect(m.post.mock.calls.some(([url]) => url.endsWith('/complete'))).toBe(false);
    expect(wrapper.findComponent({ name: 'MeetingSessionExitPanel' }).exists()).toBe(false);
    window.confirm.mockReturnValue(true); await end.trigger('click'); await flushPromises();
    expect(m.post).toHaveBeenCalledWith('/team-meetings/101/complete', {}, { skipGlobalLoading: true });
    expect(wrapper.findComponent({ name: 'MeetingSessionExitPanel' }).props('canRejoin')).toBe(false);
  });
});
it('lets participants leave without offering host controls', async () => {
  m.host = false; const leave = await render(); await leave.trigger('click'); await flushPromises();
  expect(wrapper.find('.join-modal-backdrop').exists()).toBe(false);
  expect(m.post.mock.calls.some(([url]) => url.endsWith('/complete'))).toBe(false);
  expect(window.confirm).not.toHaveBeenCalled();
});
