import { expect, it, vi, beforeEach } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),cached:vi.fn(),save:vi.fn()}));
vi.mock('../scheduleSummaryRequests.js',()=>({getScheduleSummaryResponse:m.get}));
vi.mock('../scheduleSummaryCache.js',()=>({getScheduleSummary:m.cached,setScheduleSummary:m.save}));
import {prefetchNextScheduleWeek} from '../scheduleSummaryPrefetch.js';
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
