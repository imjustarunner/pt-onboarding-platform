import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import VideoSessionRoom from '../VideoSessionRoom.vue';
const m = vi.hoisted(() => ({ session: null, publisher: null, track: null, connect: null, init: vi.fn() }));
vi.mock('@vonage/client-sdk-video', () => ({ default: {
 initSession: () => (m.session = { connection: { connectionId: 'local' }, streams: {}, on: vi.fn(), connect: (_token, callback) => { m.connect = callback; },
  publish: (_publisher, done) => done(null), unpublish: vi.fn(), disconnect: vi.fn(), signal: vi.fn(), unsubscribe: vi.fn() }),
 initPublisher: m.init, hasMediaProcessorSupport: () => false
} }));
let wrapper;
const makeTrack = () => {
 let settings = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, voiceIsolation: false };
 return Object.assign(new EventTarget(), { kind: 'audio', readyState: 'live', getSettings: () => settings,
  applyConstraints: vi.fn(async value => { settings = { ...settings, ...value }; }) });
};
beforeEach(() => {
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
 m.track = makeTrack();
 const handlers = {};
 m.publisher = { handlers, on: vi.fn((name, handler) => { handlers[name] = handler; }), publishAudio: vi.fn(), publishVideo: vi.fn(), destroy: vi.fn(),
  getAudioSource: () => m.track,
  setAudioSource: vi.fn(async () => { m.track = makeTrack(); }) };
 m.init.mockReset().mockImplementation((_el, _options, done) => { queueMicrotask(() => done(null)); return m.publisher; });
});
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.clearAllTimers(); vi.useRealTimers(); });
async function join(props = {}) {
 wrapper = mount(VideoSessionRoom, { props: { applicationId: '11111111-1111-4111-8111-111111111111', sessionId: 'mic-recovery', token: 'eyJ.test.token', playJoinTone: false, ...props } });
 await flushPromises(); await vi.dynamicImportSettled(); m.connect(null); await flushPromises();
 return wrapper;
}
const problem = () => m.publisher.handlers.audioAcquisitionProblem({ method: 'getStats' });
it('reconnects an interrupted microphone once without recreating the call or camera', async () => {
 await join(); const initialTrack = m.track;
 problem(); problem(); await flushPromises();
 expect(wrapper.text()).toContain('stopped sending audio');
 expect(wrapper.emitted('connection-status').filter(([value]) => value.event === 'microphone-problem')).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(2999); expect(m.publisher.setAudioSource).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1); await flushPromises();
 expect(m.publisher.setAudioSource).toHaveBeenCalledExactlyOnceWith('default');
 expect(m.track).not.toBe(initialTrack); expect(m.publisher.publishAudio).toHaveBeenLastCalledWith(true);
 expect(m.init).toHaveBeenCalledOnce(); expect(m.publisher.destroy).not.toHaveBeenCalled(); expect(m.session.disconnect).not.toHaveBeenCalled();
 m.publisher.handlers.audioAcquisitionProblemResolved(); problem();
 await vi.advanceTimersByTimeAsync(10000); expect(m.publisher.setAudioSource).toHaveBeenCalledOnce();
});
it('allows a transient capture problem to recover before replacing the source', async () => {
 await join(); problem(); await vi.advanceTimersByTimeAsync(1000);
 m.publisher.handlers.audioAcquisitionProblemResolved(); await vi.advanceTimersByTimeAsync(4000);
 expect(m.publisher.setAudioSource).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('stopped sending audio');
 expect(wrapper.emitted('connection-status').at(-1)[0]).toMatchObject({ event: 'microphone-recovered', reason: 'audio-flow-restored' });
});
it.each(['mute','host lock'])('preserves %s during the recovery delay', async action => {
 await join(); problem();
 if(action === 'mute') await wrapper.vm.toggleMic();
 else await wrapper.setProps({ trainingPolicy: { userId: 9, proctor: false, canUnmute: false } });
 await vi.advanceTimersByTimeAsync(3000);
 expect(m.publisher.setAudioSource).not.toHaveBeenCalled();
 if(action === 'mute') expect(m.publisher.publishAudio).toHaveBeenLastCalledWith(false);
});
it('lets the participant mute immediately while microphone recovery is pending', async () => {
 await join(); let release;
 m.publisher.setAudioSource.mockImplementation(() => new Promise(resolve => { release = resolve; }));
 problem(); await vi.advanceTimersByTimeAsync(3000); await flushPromises();
 await wrapper.vm.toggleMic(); expect(m.publisher.publishAudio).toHaveBeenLastCalledWith(false);
 release(); await flushPromises(); expect(m.publisher.publishAudio).toHaveBeenLastCalledWith(false);
});
it('cancels recovery when leaving and ignores callbacks from an old publisher', async () => {
 await join(); const callbacks = m.publisher.handlers; problem();
 wrapper.vm.disconnect(false); callbacks.audioAcquisitionProblem(); callbacks.audioAcquisitionProblemResolved();
 await vi.advanceTimersByTimeAsync(5000); expect(m.publisher.setAudioSource).not.toHaveBeenCalled();
});
it('offers basic audio without changing the camera or unmuting the participant', async () => {
 await join({ startMuted: true });
 await wrapper.findAll('button').find(button => button.text() === 'Use basic microphone audio').trigger('click'); await flushPromises();
 expect(m.publisher.setAudioSource).toHaveBeenCalledExactlyOnceWith('default');
 expect(m.track.applyConstraints).toHaveBeenLastCalledWith(expect.objectContaining({ echoCancellation: true, autoGainControl: true, noiseSuppression: false, voiceIsolation: false }));
 expect(m.publisher.publishAudio).toHaveBeenLastCalledWith(false); expect(m.init).toHaveBeenCalledOnce(); expect(m.publisher.destroy).not.toHaveBeenCalled();
 expect(wrapper.text()).toContain('Basic microphone audio is on');
});
it('keeps recovery failures visible and does not retry indefinitely', async () => {
 await join(); m.publisher.setAudioSource.mockRejectedValue(new Error('capture unavailable')); problem();
 await vi.advanceTimersByTimeAsync(3000); await flushPromises();
 expect(wrapper.emitted('connection-status').at(-1)[0]).toMatchObject({ event: 'microphone-recovery-failed' });
 expect(wrapper.find('.vsr__audio-problem').exists()).toBe(true);
 problem(); await vi.advanceTimersByTimeAsync(30000); expect(m.publisher.setAudioSource).toHaveBeenCalledOnce();
});
it('does not reconfigure live microphone processing again after the initial join', async () => {
 await join(); const track = m.track; const count = track.applyConstraints.mock.calls.length;
 await vi.advanceTimersByTimeAsync(1000); await wrapper.vm.toggleMic(); await wrapper.vm.toggleMic(); await flushPromises();
 expect(track.applyConstraints).toHaveBeenCalledTimes(count);
});
it('does not claim basic audio is active when the browser refuses its constraints', async () => {
 await join();
 m.publisher.setAudioSource.mockImplementation(async () => {
  m.track=makeTrack();m.track.applyConstraints.mockRejectedValue(new Error('unsupported processing'));
 });
 await wrapper.findAll('button').find(button => button.text() === 'Use basic microphone audio').trigger('click');await flushPromises();
 expect(wrapper.text()).not.toContain('Basic microphone audio is on');
 expect(wrapper.text()).toContain('could not enable basic microphone audio');
 expect(wrapper.emitted('connection-status').at(-1)[0]).toMatchObject({event:'microphone-recovery-failed'});
});
