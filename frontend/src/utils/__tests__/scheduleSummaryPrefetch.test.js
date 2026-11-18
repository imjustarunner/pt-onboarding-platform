import { expect, it, vi, beforeEach } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),cached:vi.fn(),save:vi.fn(),revision:vi.fn()}));
vi.mock('../scheduleSummaryRequests.js',()=>({getScheduleSummaryResponse:m.get}));
vi.mock('../scheduleSummaryCache.js',()=>({getScheduleSummary:m.cached,setScheduleSummary:m.save,scheduleSummaryRevision:m.revision}));
import {prefetchNextScheduleWeek,prefetchAdjacentScheduleWeeks} from '../scheduleSummaryPrefetch.js';
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue({data:{weekStart:'2026-11-30',officeEvents:[{id:18510,agencyId:377}]}});});
it('warms the next week in the normal cache without materializing whole-building reservations',async()=>{
 await prefetchNextScheduleWeek('/users/501/schedule-summary',{params:{weekStart:'2026-11-23',includeAllAgencies:true}},'501|all|2026-11-23|monday|false');
 expect(m.get).toHaveBeenCalledWith('/users/501/schedule-summary',expect.objectContaining({params:expect.objectContaining({weekStart:'2026-11-30',skipOfficeMaterialize:'true'})}));
 expect(m.save).toHaveBeenCalledWith('501|all|2026-11-30|monday|false',expect.objectContaining({officeEvents:[expect.objectContaining({_agencyId:377})]}));
});
it('does not fetch a fresh cached week or store a result after the account changes',async()=>{
 m.cached.mockReturnValue({});await prefetchNextScheduleWeek('/users/501/schedule-summary',{params:{weekStart:'2026-11-23'}},'501|all|2026-11-23');expect(m.get).not.toHaveBeenCalled();
 m.cached.mockReturnValue(null);let current=true;m.get.mockImplementation(async()=>{current=false;return {data:{}};});
 await prefetchNextScheduleWeek('/users/501/schedule-summary',{params:{weekStart:'2026-11-23'}},'501|all|2026-11-23',()=>current);expect(m.save).not.toHaveBeenCalled();
});

it('warms both neighbors sequentially and preserves timezone, scope and request policy', async()=>{
 let finish; m.get.mockImplementationOnce(()=>new Promise(r=>{finish=r;})).mockResolvedValueOnce({data:{weekStart:'2026-10-26'}});
 const run=prefetchAdjacentScheduleWeeks('/users/501/schedule-summary',{timeout:12000,params:{weekStart:'2026-11-02',timeZone:'America/Denver',skipGoogleSync:true}},'501|all|2026-11-02|monday');
 expect(m.get).toHaveBeenCalledTimes(1);
 finish({data:{weekStart:'2026-11-09'}});await run;
 expect(m.get.mock.calls.map(([,config])=>config.params.weekStart)).toEqual(['2026-11-09','2026-10-26']);
 expect(m.get.mock.calls[1][1]).toMatchObject({timeout:12000,skipGlobalLoading:true,params:{timeZone:'America/Denver',skipGoogleSync:true,skipOfficeMaterialize:'true'}});
});
it('discards speculative data invalidated by a booking before the read completes', async()=>{
 m.revision.mockReturnValue('before');let finish;m.get.mockImplementation(()=>new Promise(r=>{finish=r;}));
 const run=prefetchNextScheduleWeek('/users/501/schedule-summary',{params:{weekStart:'2026-11-23'}},'501|all|2026-11-23');
 m.revision.mockReturnValue('after');finish({data:{weekStart:'2026-11-30'}});await run;expect(m.save).not.toHaveBeenCalled();
});
