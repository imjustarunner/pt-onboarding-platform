import {mount,flushPromises} from '@vue/test-utils';
import {ref} from 'vue';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({post:vi.fn(),capture:null,start:vi.fn(),stop:vi.fn()}));
vi.mock('../../services/api',()=>({default:{post:m.post}}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({user:{firstName:'Alex'}})}));
vi.mock('../browserSpeechCapture.js',()=>({createBrowserSpeechCapture:opts=>{m.capture=opts;return {start:m.start,stop:m.stop};}}));
import {useTeamMeetingLiveTranscript} from '../useTeamMeetingLiveTranscript';
describe('team live caption saves',()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();m.start.mockReturnValue(true);m.post.mockResolvedValue({});});
  afterEach(()=>vi.useRealTimers());
  it('publishes captions every five seconds and drains in-flight speech on leaving',async()=>{
    let transcript;
    const w=mount({setup(){transcript=useTeamMeetingLiveTranscript({eventId:ref(4),enabled:ref(true)});return()=>null;}});
    let finish;
    m.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    m.capture.onTranscript('First chunk');
    await vi.advanceTimersByTimeAsync(5000);
    expect(m.post).toHaveBeenCalledTimes(1);
    m.capture.onTranscript('Last words');
    const leaving=transcript.stopAndFlush();
    expect(m.post).toHaveBeenCalledTimes(1);
    finish({});await leaving;await flushPromises();
    expect(m.post).toHaveBeenCalledTimes(2);
    expect(m.post.mock.calls[1][1].transcript).toBe('Last words');
    expect(m.stop).toHaveBeenCalled();w.unmount();
  });
});
