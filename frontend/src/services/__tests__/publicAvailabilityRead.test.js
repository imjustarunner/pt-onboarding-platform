import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../api',()=>({default:{get:vi.fn()}}));
let api,cache;
const options={agencySlug:'itsco',providerId:9,serviceType:'counseling',weekStart:'2030-01-07'};
const opening={format:'VIRTUAL',startAt:'2030-01-09T17:00:00Z',endAt:'2030-01-09T18:00:00Z'};
const schedule={weekStart:options.weekStart,timeZone:'America/Denver',checkedAt:'2030-01-09T15:00:00Z',virtual:{status:'accepting'},slots:[opening]};
beforeEach(async()=>{vi.resetModules();sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-09T15:00:00Z'));api=(await import('../api')).default;api.get.mockReset();cache=await import('../publicAvailabilityRead');});
afterEach(()=>vi.useRealTimers());
describe('saved public availability',()=>{
 it('shares one week request between components and reuses it for a minute',async()=>{
  api.get.mockResolvedValue({data:schedule});const [a,b]=await Promise.all([cache.readProviderWeek(options),cache.readProviderWeek(options)]);
  a.slots.length=0;expect(b.slots).toHaveLength(1);await cache.readProviderWeek(options);expect(api.get).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(61000);await cache.readProviderWeek(options);expect(api.get).toHaveBeenCalledTimes(2);
 });
 it('hydrates across reloads, keeps saved times after a failed refresh, then replaces withdrawn times',async()=>{
  api.get.mockResolvedValue({data:schedule});await cache.readProviderWeek(options);vi.advanceTimersByTime(61000);
  vi.resetModules();cache=await import('../publicAvailabilityRead');api=(await import('../api')).default;
  expect(cache.getCachedProviderWeek(options).slots).toHaveLength(1);
  api.get.mockRejectedValueOnce(new Error('Offline'));await expect(cache.readProviderWeek(options)).rejects.toThrow('Offline');expect(cache.getCachedProviderWeek(options).slots).toHaveLength(1);
  api.get.mockResolvedValueOnce({data:{...schedule,slots:[]}});await cache.readProviderWeek(options);expect(cache.getCachedProviderWeek(options).slots).toEqual([]);
 });
 it('isolates agencies, providers, services and weeks and rejects mismatched responses',async()=>{
  api.get.mockImplementation(async(url,{params})=>({data:{...schedule,weekStart:params.weekStart}}));
  for(const change of [{},{agencySlug:'other'},{providerId:10},{serviceType:'coaching'},{weekStart:'2030-01-14'}])await cache.readProviderWeek({...options,...change});
  expect(api.get).toHaveBeenCalledTimes(5);
  api.get.mockResolvedValueOnce({data:{...schedule,weekStart:'bad'}});await expect(cache.readProviderWeek(options,{force:true})).rejects.toThrow('updating');expect(cache.getCachedProviderWeek(options).weekStart).toBe(options.weekStart);
 });
 it('shares directory results for five minutes, preserving filter scope and actual check timestamps',async()=>{
  api.get.mockImplementation(async(url,{params})=>({data:{providers:[{id:9,availability:{timeZone:'America/Denver',checkedAt:schedule.checkedAt,nextAvailableAt:opening.startAt,upcomingSlots:params.programType==='VIRTUAL'?[opening]:[]}}]}}));
  const [a,b]=await Promise.all([cache.readDirectoryAvailability('itsco'),cache.readDirectoryAvailability('itsco')]);expect(api.get).toHaveBeenCalledTimes(2);expect(a.checkedAt).toBe(schedule.checkedAt);expect(b.providers[9].virtual.slots).toHaveLength(1);
  vi.advanceTimersByTime(240000);await cache.readDirectoryAvailability('itsco');expect(api.get).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(61000);await cache.readDirectoryAvailability('itsco');expect(api.get).toHaveBeenCalledTimes(4);
  await cache.readDirectoryAvailability('itsco',{officeId:'7'});expect(api.get).toHaveBeenCalledTimes(6);expect(cache.getCachedDirectoryAvailability('other')).toBeNull();
 });
 it('never converts an unavailable refresh into an empty directory or retains passed times',async()=>{
  api.get.mockResolvedValue({data:{providers:[{id:9,availability:{checkedAt:schedule.checkedAt,nextAvailableAt:opening.startAt,slots:[opening]}}]}});await cache.readDirectoryAvailability('itsco');
  api.get.mockRejectedValue(new Error('Offline'));await expect(cache.readDirectoryAvailability('itsco',{}, {force:true})).rejects.toThrow('Offline');expect(cache.getCachedDirectoryAvailability('itsco').providers[9].hasPublishedOpenings).toBe(true);
  vi.advanceTimersByTime(3*3600000);expect(cache.getCachedDirectoryAvailability('itsco').providers[9].nextAvailableAt).toBeNull();expect(cache.getCachedDirectoryAvailability('itsco').providers[9].virtual.slots).toEqual([]);
 });
 it('merges independently loaded weeks without reviving a withdrawn opening',()=>{
  const other={...schedule,weekStart:'2030-01-14',slots:[{...opening,startAt:'2030-01-16T17:00:00Z',endAt:'2030-01-16T18:00:00Z'}]};
  expect(cache.mergeProviderWeeks([schedule,other]).slots).toHaveLength(2);
  expect(cache.mergeProviderWeeks([{...schedule,slots:[]},other]).slots).toEqual(other.slots);
 });
});
