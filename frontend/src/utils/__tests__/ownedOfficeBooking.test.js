import { expect, it, vi } from 'vitest';
import { submitOfficeBooking } from '../ownedOfficeBooking.js';
it('queues once, shows real progress, then returns the saved appointment receipt', async () => {
 const job={id:'job-1',status:'queued',phase:'preparing',completed:0,total:26};
 const result={kind:'auto_booked',appointmentIds:[264,265]};
 const api={post:vi.fn(async()=>({data:{kind:'booking_job',job}})),get:vi.fn()
  .mockResolvedValueOnce({data:{job:{...job,status:'processing',phase:'saving',completed:7}}})
  .mockResolvedValueOnce({data:{job:{...job,status:'completed',phase:'complete',completed:26,result}}})};
 const progress=vi.fn();expect((await submitOfficeBooking(api,{clientId:81},{onProgress:progress,pause:async()=>{}})).data).toEqual(result);
 expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][1].asyncOwnedSession).toBe(true);
 expect(progress.mock.calls.flat().join(' ')).toContain('Saving client sessions: 7 of 26');
});
it('does not resubmit or claim failure if progress cannot be checked', async () => {
 const api={post:vi.fn(async()=>({data:{kind:'booking_job',job:{id:'job-1',status:'processing',total:26}}})),get:vi.fn().mockRejectedValue(new Error('offline'))};
 await expect(submitOfficeBooking(api,{}, {pause:async()=>{}})).rejects.toThrow('continues in the background');expect(api.post).toHaveBeenCalledTimes(1);
});
it('keeps the normal approval flow for a room that is not already reserved to the provider',async()=>{
 const response={data:{kind:'request',request:{id:9}}},api={post:vi.fn(async()=>response),get:vi.fn()};
 expect(await submitOfficeBooking(api,{})).toBe(response);expect(api.get).not.toHaveBeenCalled();
});
