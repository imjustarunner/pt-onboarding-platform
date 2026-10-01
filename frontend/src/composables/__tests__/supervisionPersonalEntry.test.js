import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), capture: null, start: vi.fn(), stop: vi.fn(), flush: vi.fn(), control: vi.fn(), auth: { isAuthenticated: false, user: null } }));
vi.mock('../../services/api', () => ({ default: { get: m.get, post: m.post } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => m.auth }));
vi.mock('../../utils/activityTracker', () => ({ suspendInactivityTimeout: vi.fn(), resumeInactivityTimeout: vi.fn() }));
vi.mock('../consentedAudioCapture.js', () => ({ createConsentedAudioCapture: options => { m.capture = options; return { start: m.start, stop: m.stop, flush:m.flush, control:m.control }; } }));
import { useSupervisionLiveSession } from '../useSupervisionLiveSession';
import { saveSupervisionAccess } from '../../utils/supervisionInvitationAccess';
let wrapper, live, props;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); m.capture = null;
  m.start.mockReturnValue(true); m.get.mockResolvedValue({ data: { artifact: null, activity: [] } }); m.post.mockResolvedValue({ data: { ok: true } });
  saveSupervisionAccess({ sessionId: 9, token: 'scoped', expiresAt: Date.now() + 60000 });
  props = reactive({ supervisionSessionId: 9, isSupervisor: false, isInLobby: false, localDisplayName: 'Rachel Example', joinIdentity: 'user-8' });
});
afterEach(async () => { wrapper?.unmount(); await flushPromises(); vi.clearAllTimers(); vi.useRealTimers(); });
async function render() {
  wrapper = mount(defineComponent({ setup() { live = useSupervisionLiveSession(props, vi.fn(), { enableActivityFeed: false }); return () => null; } }));
  await flushPromises();
}
describe('supervision session without app authentication', () => {
  it.each([false, true])('saves identified speech and presence for supervisor=%s', async supervisor => {
    props.isSupervisor = supervisor; await render(); live.onVideoConnected();
    await vi.advanceTimersByTimeAsync(3000); expect(m.start).toHaveBeenCalledOnce();
    expect(m.capture.baseUrl).toBe('/supervision/sessions/9');
    expect(m.capture.isHost).toBe(supervisor);
    await vi.advanceTimersByTimeAsync(8000);
    expect(m.post).toHaveBeenCalledWith('/supervision/sessions/9/join-presence', expect.objectContaining({ action: 'heartbeat' }), expect.any(Object));
    expect(m.post.mock.calls.some(([url]) => /guest-transcript|meeting-lifecycle/.test(url))).toBe(false);
    expect(m.auth).toEqual({ isAuthenticated: false, user: null });
    wrapper.unmount(); wrapper = null; await flushPromises();
    expect(m.flush).toHaveBeenCalled();
    expect(m.post).toHaveBeenCalledWith('/supervision/sessions/9/join-presence', expect.objectContaining({ action: 'leave' }), expect.any(Object));
  });
  it('waits for main-room admission before recording speech', async () => {
    props.isInLobby = true; await render(); live.onVideoConnected(); await vi.advanceTimersByTimeAsync(5000);
    expect(m.start).not.toHaveBeenCalled(); expect(m.get.mock.calls.some(([url]) => url.endsWith('/artifacts'))).toBe(false);
    props.isInLobby = false; await flushPromises(); await vi.advanceTimersByTimeAsync(3100); expect(m.start).toHaveBeenCalledOnce();
  });
  it('lets the supervisee pause and resume server transcription', async () => {
    await render();live.onVideoConnected();await vi.advanceTimersByTimeAsync(3000);
    await live.pauseLiveTranscript();expect(m.control).toHaveBeenCalledWith('pause');
    await live.resumeLiveTranscript();expect(m.control).toHaveBeenCalledWith('resume');
  });
});
