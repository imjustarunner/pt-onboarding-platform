import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),reserve:vi.fn(),book:vi.fn(),actor:vi.fn(),agencies:vi.fn(),office:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.actor,getAgencies:m.agencies}}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{findById:m.office}}));
vi.mock('../ownedOfficeSession.service.js',()=>({findOwnedOfficeSessionReservation:m.reserve,bookSessionInOwnedOffice:m.book,ownedOfficeSessionBookingKey:()=> 'key'}));
import {queueOwnedOfficeSession,readOwnedOfficeSessionJob,processOwnedOfficeSessionJobs} from '../ownedOfficeSessionJobs.service.js';
let row;
const input={office:{id:1},agencyId:377,actorUserId:501,providerId:501,occurrenceCount:26};
beforeEach(()=>{
 vi.resetAllMocks();row={id:'job-1',agency_id:377,created_by_user_id:501,status:'queued',phase:'preparing',completed_count:0,total_count:26,input_json:input,attempts:1};
 m.reserve.mockResolvedValue({id:18510});m.actor.mockResolvedValue({id:501,role:'provider'});m.agencies.mockResolvedValue([{id:377}]);m.office.mockResolvedValue({id:1});
 m.book.mockImplementation(async args=>{await args.onProgress({phase:'saving',completed:7,total:26});return {officeEventId:18510,appointmentIds:[264,265]};});
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT'))return [[...(!sql.includes('created_by_user_id=?') || args[1]===501 ? [row] : [])]];
  return [{affectedRows:1}];
 });
});
it('queues a reservation once without doing the expensive booking in the HTTP request',async()=>{
 expect(await queueOwnedOfficeSession(input)).toMatchObject({kind:'booking_job',job:{id:'job-1',total:26}});
 expect(m.book).not.toHaveBeenCalled();expect(m.execute.mock.calls[0][0]).toContain('ON DUPLICATE KEY UPDATE id=id');
});
it('keeps unowned room requests in the approval workflow',async()=>{
 m.reserve.mockResolvedValue(null);expect(await queueOwnedOfficeSession(input)).toBeNull();expect(m.execute).not.toHaveBeenCalled();
});
it('keeps progress and receipt visible only to the booking actor',async()=>{
 expect(await readOwnedOfficeSessionJob('job-1',999)).toBeNull();expect(await readOwnedOfficeSessionJob('job-1',501)).toMatchObject({id:'job-1'});
});
it('claims a durable lease, reports progress, clears private input and saves the appointment receipt',async()=>{
 await processOwnedOfficeSessionJobs();
 expect(m.book).toHaveBeenCalledTimes(1);expect(m.execute.mock.calls.some(([sql,args])=>sql.includes('SET phase=?')&&args[0]==='saving'&&args[1]===7)).toBe(true);
 const done=m.execute.mock.calls.find(([sql])=>sql.includes("status='completed'"));expect(done[0]).toContain('input_json=NULL');
 expect(JSON.parse(done[1][0])).toMatchObject({appointmentIds:[264,265],agencyId:377});
});
it('rechecks agency access before a queued booking can mutate appointments',async()=>{
 m.agencies.mockResolvedValue([{id:2}]);await processOwnedOfficeSessionJobs();expect(m.book).not.toHaveBeenCalled();
 expect(m.execute.mock.calls.some(([sql,args])=>sql.includes('error_message=?')&&args[0]==='failed'&&args[1].includes('access'))).toBe(true);
});
it('retains interrupted work for retry without exposing an internal error',async()=>{
 m.book.mockRejectedValue(new Error('sensitive database failure'));await processOwnedOfficeSessionJobs();
 expect(m.execute.mock.calls.some(([sql,args])=>sql.includes('error_message=?')&&args[0]==='queued'&&args[1].includes('continue safely'))).toBe(true);
});
