import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import FloatingMeetingBar from '../FloatingMeetingBar.vue';
import { useActiveMeeting } from '../../../composables/useActiveMeeting';
const mocks = vi.hoisted(() => ({ post: vi.fn(), push: vi.fn(), suspend: vi.fn(), resume: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { post: mocks.post } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../../../utils/activityTracker', () => ({ suspendInactivityTimeout: mocks.suspend, resumeInactivityTimeout: mocks.resume }));

describe('Mini meeting continuity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({ data: {} });
    useActiveMeeting().clearMiniMode();
  });
  afterEach(() => { useActiveMeeting().clearMiniMode(); vi.useRealTimers(); });
  it('preserves muted camera-off preferences and maintains presence and visible meeting activity', async () => {
    useActiveMeeting().setMiniMode({ eventId: 9, joinIdentity: 'participant-9', token: 'token',
      vonageSessionId: 'session', applicationId: 'app', startMuted: true, startVideoOff: true });
    const wrapper = mount(FloatingMeetingBar, { global: { stubs: { VideoSessionRoom: {
      name: 'VideoSessionRoom', inheritAttrs: false,
      props: ['startMuted', 'startVideoOff', 'token'],
      methods: { disconnect() {} }, template: '<div />'
    } } } });
    const video = wrapper.findComponent({ name: 'VideoSessionRoom' });
    expect(video.props('startMuted')).toBe(true);
    expect(video.props('startVideoOff')).toBe(true);
    expect(video.props('token')).toBe('token');
    video.vm.$emit('connected');
    await flushPromises();
    expect(mocks.suspend).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledWith('/team-meetings/9/join-presence', expect.objectContaining({ action: 'heartbeat', identity: 'participant-9' }), expect.anything());
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.post).toHaveBeenCalledTimes(2);
    await wrapper.get('[title="Leave meeting"]').trigger('click');
    expect(mocks.resume).toHaveBeenCalledOnce();
    expect(useActiveMeeting().state.active).toBe(false);
    wrapper.unmount();
    expect(mocks.resume).toHaveBeenCalledOnce();
  });
  it('carries the current privacy choices back to the full meeting without sending a leave event', async () => {
    useActiveMeeting().setMiniMode({ eventId: 9, joinIdentity: 'participant-9',
      meetingPath: '/join/team-meeting/9', token: 'token', vonageSessionId: 'session' });
    const disconnect = vi.fn();
    const wrapper = mount(FloatingMeetingBar, { global: { stubs: { VideoSessionRoom: {
      name: 'VideoSessionRoom', inheritAttrs: false,
      data: () => ({ publishAudio: false, publishVideo: true }),
      methods: { disconnect }, template: '<div />'
    } } } });
    await wrapper.get('[title="Back to meeting"]').trigger('click');
    expect(disconnect).toHaveBeenCalledWith(false);
    expect(mocks.push).toHaveBeenCalledWith('/join/team-meeting/9');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(useActiveMeeting().takeReturnMedia('/join/team-meeting/9')).toEqual({ startMuted: true, startVideoOff: false });
    expect(useActiveMeeting().takeReturnMedia('/join/team-meeting/9')).toBeNull();
    wrapper.unmount();
  });
});
