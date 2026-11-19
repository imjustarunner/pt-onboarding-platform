import {it,expect,vi,afterEach} from 'vitest';
import {createVideoConnectAttempt} from '../videoConnectAttempt';
afterEach(()=>vi.useRealTimers());
it('turns a missing callback into a finite actionable error',async()=>{
 vi.useFakeTimers();const attempt=createVideoConnectAttempt({timeoutMs:100});const pending=attempt.wait(()=>new Promise(()=>{}),'Connecting to video');const result=expect(pending).rejects.toMatchObject({code:'VIDEO_CONNECTION_WAIT_EXPIRED'});await vi.advanceTimersByTimeAsync(101);await result;expect(vi.getTimerCount()).toBe(0);
});
it('cancels pending work and ignores a late callback',async()=>{
 const attempt=createVideoConnectAttempt();let finish;const pending=attempt.wait(()=>new Promise(resolve=>finish=resolve),'Starting camera');const result=expect(pending).rejects.toMatchObject({name:'AbortError'});attempt.cancel();await result;finish('late');expect(attempt.canceled).toBe(true);
});
it('does not start a canceled operation and preserves actual vendor failures',async()=>{
 const attempt=createVideoConnectAttempt();attempt.cancel();const start=vi.fn();await expect(attempt.wait(start,'Video')).rejects.toMatchObject({name:'AbortError'});expect(start).not.toHaveBeenCalled();
 const second=createVideoConnectAttempt();await expect(second.wait(()=>{throw new Error('Vendor error')},'Video')).rejects.toThrow('Vendor error');
});
