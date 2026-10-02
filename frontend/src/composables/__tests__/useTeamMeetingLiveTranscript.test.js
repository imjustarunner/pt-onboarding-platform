import {mount,flushPromises} from '@vue/test-utils';
import {ref} from 'vue';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({options:null,start:vi.fn(),stop:vi.fn(),flush:vi.fn()}));
vi.mock('../consentedAudioCapture.js',()=>({createConsentedAudioCapture:opts=>{m.options=opts;return {start:m.start,stop:m.stop,flush:m.flush};}}));
import {useTeamMeetingLiveTranscript} from '../useTeamMeetingLiveTranscript';
describe('secure team meeting capture',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.flush.mockResolvedValue();});
 it('uses the authenticated recording endpoint and the meeting microphone stream, and waits for uploads before leaving',async()=>{
  let transcript,finish;const getStream=vi.fn();
  const w=mount({setup(){transcript=useTeamMeetingLiveTranscript({eventId:ref(4),enabled:ref(true),getStream});return()=>null;}});
  expect(m.options.baseUrl).toBe('/team-meetings/4');expect(m.options.getStream).toBe(getStream);expect(m.start).toHaveBeenCalledOnce();
  m.flush.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  let done=false;const leaving=transcript.stopAndFlush().then(()=>{done=true;});await flushPromises();expect(done).toBe(false);finish();await leaving;expect(done).toBe(true);w.unmount();
 });
 it('drops pending audio on pause and does not start while disabled',async()=>{
  let transcript;const enabled=ref(false);
  const w=mount({setup(){transcript=useTeamMeetingLiveTranscript({eventId:ref(4),enabled});return()=>null;}});
  expect(m.start).not.toHaveBeenCalled();enabled.value=true;await flushPromises();await transcript.pause();expect(m.stop).toHaveBeenCalledWith({drop:true});expect(transcript.paused.value).toBe(true);w.unmount();
 });
});
