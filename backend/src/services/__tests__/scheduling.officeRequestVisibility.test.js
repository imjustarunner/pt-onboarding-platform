import {it,expect,vi} from 'vitest';
import {pendingBookingOccurrences,indexPendingRoomRequest} from '../../utils/officePendingRequests.js';
import {assertOfficeRequestNotExpired} from '../../utils/roomBookingWindow.js';
import {listPendingOfficeBookingRequests} from '../pendingOfficeBookingRequests.service.js';

it('keeps both weekly weekday requests on their requested room across daylight saving time',()=>{
 const requests=[{id:40,roomId:3,startAt:'2026-10-13T23:00:00Z',endAt:'2026-10-14T00:00:00Z'},
  {id:41,roomId:9,startAt:'2026-10-14T23:00:00Z',endAt:'2026-10-15T00:00:00Z'}]
  .map(r=>({...r,frequency:'WEEKLY',occurrenceCount:6,timeZone:'America/Denver'}));
 const result=pendingBookingOccurrences(requests,['2026-11-03','2026-11-04']);
 expect(result.map(r=>[r.id,r.date,r.startHour,r.endHour,r.roomId])).toEqual([
  ['booking-40','2026-11-03',17,18,3],['booking-41','2026-11-04',17,18,9]]);
 const slots=new Map(),unassigned=new Map();result.forEach(r=>indexPendingRoomRequest(slots,unassigned,r));
 expect([...slots.keys()]).toEqual(['2026-11-03:17:3','2026-11-04:17:9']);expect(unassigned.size).toBe(0);
 expect(pendingBookingOccurrences(requests,['2026-12-01'])).toEqual([]);
});
it('does not confuse a pending request with an assigned room or expose client details',async()=>{
 const db={execute:vi.fn(async()=>[[{id:40,startAt:'2026-10-13 23:00:00',endAt:new Date('2026-10-14T00:00:00Z')} ]])};
 const result=await listPendingOfficeBookingRequests(db,{agencyIds:[2],providerId:8});
 expect(result[0]).toMatchObject({id:40,startAt:'2026-10-13T23:00:00Z',endAt:'2026-10-14T00:00:00.000Z',status:'PENDING'});
 const [sql,args]=db.execute.mock.calls[0];expect(args).toEqual([2,8,8,null,null]);
 expect(sql).toContain("r.status='PENDING'");expect(sql).toContain('ola.agency_id IN (?)');expect(sql).toContain('r.requested_provider_id=?');
 expect(sql).not.toContain('client_id');expect(sql).not.toContain('r.*');
 db.execute.mockClear();expect(await listPendingOfficeBookingRequests(db,{agencyIds:[]})).toEqual([]);expect(db.execute).not.toHaveBeenCalled();
});
it('rejects approval of an expired one-time request without moving its date or making it recurring',()=>{
 const now=new Date('2026-10-13T16:18:00Z');
 expect(()=>assertOfficeRequestNotExpired({startDate:'2026-10-12',recurrence:'ONCE',endHour:20},now)).toThrow('already ended');
 expect(()=>assertOfficeRequestNotExpired({startDate:'2026-10-13',recurrence:'ONCE',endHour:10},now)).toThrow('already ended');
 expect(()=>assertOfficeRequestNotExpired({startDate:'2026-10-13',recurrence:'ONCE',endHour:11},now)).not.toThrow();
 expect(()=>assertOfficeRequestNotExpired({startDate:'2026-10-12',recurrence:'WEEKLY',endHour:20},now)).not.toThrow();
 // UTC is tomorrow, but the office's current date has not changed yet.
 expect(()=>assertOfficeRequestNotExpired({startDate:'2026-10-12',recurrence:'ONCE',endHour:23},new Date('2026-10-13T03:00:00Z'))).not.toThrow();
});

it('preserves every requested day and hour range and aligns each first occurrence',async()=>{
 const {distinctOfficeRequestWindows,insertOfficeRequestWindows}=await import('../officeRequestWindows.service.js');
 const windows=distinctOfficeRequestWindows([
  {weekday:2,startHour:8,endHour:20,roomId:3},
  {weekday:3,startHour:17,endHour:19,roomId:9},
  {weekday:2,startHour:8,endHour:20,roomId:3}
 ],'2026-10-12');
 expect(windows).toEqual([
  {weekday:2,startHour:8,endHour:20,roomId:3,startDate:'2026-10-13'},
  {weekday:3,startHour:17,endHour:19,roomId:9,startDate:'2026-10-14'}
 ]);
 let id=0;const db={execute:vi.fn(async()=>[{insertId:++id}])};
 const ids=await insertOfficeRequestWindows(db,{agencyId:2,providerId:8,recurrence:'WEEKLY',occurrenceCount:6},windows);
 expect(ids).toEqual([1,3]);
 expect(db.execute.mock.calls.filter(([sql])=>sql.includes('(request_id,')).map(([,args])=>args)).toEqual([[1,2,8,20,3],[3,3,17,19,9]]);
});
