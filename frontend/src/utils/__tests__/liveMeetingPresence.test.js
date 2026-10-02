import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {startLiveMeetingPresence,hasLiveMeeting,LIVE_MEETING_TTL} from '../liveMeetingPresence';
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();localStorage.setItem('user','{"id":7}');localStorage.setItem('sessionId','one');});
afterEach(()=>{vi.useRealTimers();localStorage.clear();});
it('isolates simultaneous rooms and login changes',()=>{const a=startLiveMeetingPresence(),b=startLiveMeetingPresence();expect(hasLiveMeeting()).toBe(true);a();expect(hasLiveMeeting()).toBe(true);localStorage.setItem('sessionId','two');expect(hasLiveMeeting()).toBe(false);b();});
it('expires a crashed tab without renewing the lease',()=>{const stop=startLiveMeetingPresence();vi.setSystemTime(Date.now()+LIVE_MEETING_TTL+1);expect(hasLiveMeeting()).toBe(false);stop();});
it('cleans up on closing the page',()=>{const stop=startLiveMeetingPresence();window.dispatchEvent(new Event('pagehide'));expect(hasLiveMeeting()).toBe(false);stop();});
