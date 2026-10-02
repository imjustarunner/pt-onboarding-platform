import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn().mockResolvedValue([[]])}}));
import pool from '../../config/database.js';
import { moveOfficeSessionSeries } from '../officeSessionMove.service.js';
const assignments=[13,14,15].map((hour,index)=>({id:index+1,room_id:11,office_location_id:1,provider_id:9,weekday:4,hour}));
const input={assignment:assignments[0],assignments,newRoomId:11,newWeekday:4,newHour:15,timeZone:'America/Denver',actorUserId:9,bookingAgencyId:6};
let conn,conflict,protectedFuture;
beforeEach(()=>{
 conflict=null;protectedFuture=false;
 conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT id, room_id'))return [assignments];
  if(sql.startsWith('SELECT s.id, s.provider_id'))return [args[3]===17&&conflict?[conflict]:[]];
  if(sql.startsWith('SELECT id FROM office_events WHERE standing_assignment_id'))return [protectedFuture?[{id:88}]:[]];
  if(sql.startsWith('SELECT * FROM office_events'))return [[]];
  return [[]];
 })};pool.getConnection.mockResolvedValue(conn);
});
it('moves all three hours together and preserves the explicit agency',async()=>{
 await moveOfficeSessionSeries(input);
 const updates=conn.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE office_standing_assignments SET room_id'));
 expect(updates.map(([,args])=>args[2])).toEqual([17,16,15]);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('SET booking_agency_id = ?'),[6,1,2,3]);
 expect(conn.commit).toHaveBeenCalledOnce();
});
it('reports the person and only 5–6 PM of the requested 3–6 PM block, without partial changes',async()=>{
 conflict={id:44,provider_id:88,hour:17,first_name:'Synthetic',last_name:'Provider',availability_mode:'AVAILABLE'};
 await expect(moveOfficeSessionSeries(input)).rejects.toMatchObject({code:'OFFICE_MOVE_CONFLICT',conflict:{providerName:'Synthetic Provider',startHour:17,endHour:18,requestedStartHour:15,requestedEndHour:18}});
 expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(conn.commit).not.toHaveBeenCalled();
});
it('retires an expired temporary assignment with no upcoming events in the same transaction',async()=>{
 conflict={id:44,provider_id:88,hour:17,availability_mode:'TEMPORARY',temporary_until_date:'2001-08-13'};
 await moveOfficeSessionSeries(input);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('SET is_active = FALSE, updated_at'),[44]);
 expect(conn.commit).toHaveBeenCalledOnce();
});
it('does not release an expired assignment if it still has upcoming sessions',async()=>{
 conflict={id:44,provider_id:88,hour:17,availability_mode:'TEMPORARY',temporary_until_date:'2001-08-13'};protectedFuture=true;
 await expect(moveOfficeSessionSeries(input)).rejects.toMatchObject({code:'OFFICE_MOVE_CONFLICT'});
 expect(conn.commit).not.toHaveBeenCalled();
});
