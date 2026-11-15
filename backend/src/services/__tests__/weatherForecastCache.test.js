import { afterEach, expect, it, vi } from 'vitest';
import { createWeatherForecastCache } from '../weatherForecastCache.js';
afterEach(()=>vi.restoreAllMocks());
const data={timezone:'America/Denver',daily:{time:['2026-11-14']}};
const location={latitude:38.8,longitude:-104.8};
it('coalesces simultaneous top-bar and calendar requests and includes the current week’s past days',async()=>{
 let finish;const get=vi.fn(()=>new Promise(resolve=>{finish=resolve;})),read=createWeatherForecastCache({get});
 const one=read(location),two=read(location);expect(get).toHaveBeenCalledOnce();finish({data});
 expect((await one).data).toEqual((await two).data);
 expect(get).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({params:expect.objectContaining({forecast_days:16,past_days:6})}));
 await read(location);expect(get).toHaveBeenCalledOnce();
});
it('retains a recent successful forecast during an outage and retries after a minute',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 let time=1_000_000;const get=vi.fn().mockResolvedValueOnce({data}).mockRejectedValueOnce(Object.assign(new Error('upstream'),{response:{status:429}})).mockResolvedValue({data});
 const read=createWeatherForecastCache({get,now:()=>time});await read(location);time+=600_001;
 expect(await read(location)).toMatchObject({data,stale:true});await read(location);expect(get).toHaveBeenCalledTimes(2);
 time+=60_001;expect((await read(location)).stale).toBe(false);expect(get).toHaveBeenCalledTimes(3);
});
it('does not cache an initial failure for ten minutes or reuse forecasts older than six hours',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 let time=1_000_000;const get=vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({data}).mockRejectedValue(new Error('outage'));
 const read=createWeatherForecastCache({get,now:()=>time});await expect(read(location)).rejects.toThrow('temporarily unavailable');
 await expect(read(location)).rejects.toThrow();expect(get).toHaveBeenCalledOnce();
 time+=60_001;expect((await read(location)).stale).toBe(false);
 time+=6*60*60_000+1;await expect(read(location)).rejects.toThrow();
});
