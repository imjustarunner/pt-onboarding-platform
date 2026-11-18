import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {clearScheduleSummaryCache,getScheduleSummaryStale,setScheduleSummary,invalidateScheduleSummaryCacheForUser} from '../scheduleSummaryCache';
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
const key='7|all|2026-11-16|monday|false|false||tz:America/Denver';
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();sessionStorage.clear();clearScheduleSummaryCache();});
afterEach(()=>vi.useRealTimers());
it('keeps stale in-memory weeks available even if browser storage is unavailable',()=>{
 const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
 setScheduleSummary(key,{weekStart:'2026-11-16'});vi.advanceTimersByTime(120000);
 expect(getScheduleSummaryStale(key)).toEqual({fresh:false,data:{weekStart:'2026-11-16'}});storage.mockRestore();
});
it('isolates cached patient calendars by viewer, login and active organization',()=>{
 localStorage.setItem('user',JSON.stringify({id:1}));setScheduleSummary(key,{marker:'first'});
 localStorage.setItem('user',JSON.stringify({id:2}));expect(getScheduleSummaryStale(key)).toBeNull();
 localStorage.setItem('user',JSON.stringify({id:1}));expect(getScheduleSummaryStale(key).data.marker).toBe('first');
 localStorage.setItem('sessionId','new-session');expect(getScheduleSummaryStale(key)).toBeNull();
});
it('invalidates every week for a provider after a booking',()=>{
 setScheduleSummary(key,{a:1});setScheduleSummary(key.replace('11-16','11-23'),{a:2});invalidateScheduleSummaryCacheForUser(7);
 expect(getScheduleSummaryStale(key)).toBeNull();expect(getScheduleSummaryStale(key.replace('11-16','11-23'))).toBeNull();
});
it('bounds the warm-week cache and expires old snapshots',()=>{
 for(let i=0;i<13;i++)setScheduleSummary(`${key}|${i}`,{i});
 expect(getScheduleSummaryStale(`${key}|0`)).toBeNull();expect(sessionStorage.length).toBe(12);
 vi.advanceTimersByTime(31*60000);expect(getScheduleSummaryStale(`${key}|12`)).toBeNull();
});
