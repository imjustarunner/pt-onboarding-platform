import {it,expect,vi} from 'vitest';
import {resolveOfficeRequestPreferences} from '../officeRequestPreferences.service.js';
import {indexPendingRoomRequest} from '../../utils/officePendingRequests.js';
const rooms=[{id:5,officeId:1,officeName:'Windchime',room_number:'10',label:'Counseling'},{id:7,officeId:1,officeName:'Windchime',room_number:'12',label:'Tutoring'},{id:9,officeId:6,officeName:'Denver',label:'Office'}];
const db=()=>({execute:vi.fn(async()=>[rooms])});
const slot={weekday:2,startHour:17,endHour:18,roomId:null};
it('saves the preferred room from the My Schedule field even when the slot has no room',async()=>{
 const result=await resolveOfficeRequestPreferences(db(),{agencyId:2,officeIds:[1],preferredRoomId:5,slots:[slot]});
 expect(result.slots[0].roomId).toBe(5);expect(result.preferredRooms).toEqual([{id:5,officeId:1,officeName:'Windchime',label:'Office #10'}]);
});
it('keeps ranked alternatives as one request without claiming each room',async()=>{
 const result=await resolveOfficeRequestPreferences(db(),{agencyId:2,officeIds:[1],preferredRoomIds:[7,5],slots:[slot]});
 expect(result.preferredRooms.map(r=>r.id)).toEqual([7,5]);expect(result.slots).toEqual([slot]);
});
it('explicit Any open room clears a previous single-room choice',async()=>{
 const result=await resolveOfficeRequestPreferences(db(),{agencyId:2,officeIds:[1],preferredRoomIds:[],slots:[{...slot,roomId:5}]});expect(result.slots[0].roomId).toBeNull();
});
it('rejects an inaccessible room or room from another building',async()=>{
 for(const id of [9,999])await expect(resolveOfficeRequestPreferences(db(),{agencyId:2,officeIds:[1],preferredRoomIds:[id],slots:[slot]})).rejects.toMatchObject({status:400});
});
it('validates legacy slot room IDs as well as new preference fields',async()=>{
 await expect(resolveOfficeRequestPreferences(db(),{agencyId:2,officeIds:[1],slots:[{...slot,roomId:999}]})).rejects.toMatchObject({status:400});
});
it.each([[5,7,9,10],['invalid'],[1.2]])('rejects invalid preferences %j',async ids=>{
 const database=db();await expect(resolveOfficeRequestPreferences(database,{agencyId:2,preferredRoomIds:ids,slots:[slot]})).rejects.toMatchObject({status:400});expect(database.execute).not.toHaveBeenCalled();
});
it('shows a multi-hour any-room request once without soft-holding every room',()=>{
 const pending=new Map(),queue=new Map(),request={id:867,providerName:'Randy',date:'2026-10-13',startHour:17,endHour:19,roomId:null};
 indexPendingRoomRequest(pending,queue,request);indexPendingRoomRequest(pending,queue,request);
 expect(pending.size).toBe(0);expect([...queue.values()]).toEqual([request]);
 indexPendingRoomRequest(pending,queue,{...request,id:868,roomId:5});
 expect(pending.size).toBe(2);expect(pending.get('2026-10-13:17:5')).toHaveLength(1);expect(pending.has('2026-10-13:17:7')).toBe(false);
});
