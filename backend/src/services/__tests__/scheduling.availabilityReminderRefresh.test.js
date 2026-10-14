import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{}}));
vi.mock('../../models/Task.model.js',()=>({default:{}}));
vi.mock('../../models/Notification.model.js',()=>({default:{}}));
vi.mock('../providerAvailability.service.js',()=>({default:{}}));
import {createProviderAvailabilityReminders} from '../providerAvailabilityReminders.service.js';
import {invalidateAvailabilityReminders} from '../../utils/invalidateAvailabilityReminders.js';

function fixture({fresh=false,available=true,acquired=1}={}) {
 const rows=['IN_PERSON','VIRTUAL'].map((format,i)=>({id:i+1,agencyId:2,providerId:9,agencyName:'ITSCO',format,task_id:i+11,notification_id:i+21,is_missing:1,isFresh:Number(fresh)}));
 const connection={query:vi.fn(async()=>[[{acquired}]]),release:vi.fn()};
 const pool={getConnection:vi.fn(async()=>connection),execute:vi.fn(async(sql,args)=>{
  if(sql.includes('AS isFresh'))return [rows.filter(r=>r.is_missing).map(r=>({...r}))];
  if(sql.startsWith('SELECT id FROM provider_availability_reminders'))return [rows.filter(r=>!r.isFresh)];
  if(sql.startsWith('SELECT requested_start_at')||sql.startsWith('INSERT IGNORE'))return [[]];
  if(sql.startsWith('SELECT * FROM provider_availability'))return [[rows.find(r=>r.format===args[2])]];
  if(sql.startsWith('UPDATE provider_availability_reminders SET checked_at=NULL')){for(const r of rows)r.isFresh=0;return [{}];}
  if(sql.startsWith('UPDATE provider_availability')){const r=rows.find(r=>r.id===args.at(-1));r.is_missing=Number(sql.includes('is_missing=1'));r.isFresh=1;r.checkedAt=new Date().toISOString();return [{}];}
  throw Error(sql);
 })};
 const Availability={computeWeekAvailability:vi.fn(async()=>({inPersonSlots:[],virtualSlots:available?[{startAt:new Date(Date.now()+86400000).toISOString(),endAt:new Date(Date.now()+90000000).toISOString()}]:[]}))};
 const Task={findById:vi.fn(async()=>({id:11,status:'pending'})),updateStatus:vi.fn()};
 const Notification={setViewerState:vi.fn()};
 const service=createProviderAvailabilityReminders({pool,User:{findById:async()=>({sees_clients:1,provider_accepting_new_clients:1})},Profile:{getForProvider:async()=>({details:{inPersonEnabled:true,virtualEnabled:true}})},Availability,Task,Notification});
 return {...service,rows,pool,connection,Availability,Task,Notification};
}
it('rechecks an old missing warning and removes only the format with real openings',async()=>{
 const h=fixture();const result=await h.readMyAvailabilityReminders(9);
 expect(result.map(r=>r.format)).toEqual(['IN_PERSON']);expect(result[0].checkedAt).toBeTruthy();expect(result[0]).not.toHaveProperty('isFresh');
 expect(h.Task.updateStatus).toHaveBeenCalledWith(12,'completed');expect(h.Notification.setViewerState).toHaveBeenCalledWith(22,9,expect.objectContaining({dismissed:true}));
 expect(h.Availability.computeWeekAvailability).toHaveBeenCalledWith(expect.objectContaining({providerId:9,agencyId:2,intakeOnly:true,includeGoogleBusy:false}));
 expect(h.pool.getConnection).toHaveBeenCalledTimes(1);
});
it('keeps fresh warnings cheap on repeated polls without rebuilding calendars',async()=>{
 const h=fixture({fresh:true});expect(await h.readMyAvailabilityReminders(9)).toHaveLength(2);await h.readMyAvailabilityReminders(9);
 expect(h.Availability.computeWeekAvailability).not.toHaveBeenCalled();expect(h.pool.getConnection).not.toHaveBeenCalled();
});
it('publication invalidation triggers a check even inside the five-minute cache window',async()=>{
 const h=fixture({fresh:true});await invalidateAvailabilityReminders(h.pool,9);
 expect((await h.readMyAvailabilityReminders(9)).map(r=>r.format)).toEqual(['IN_PERSON']);expect(h.Availability.computeWeekAvailability).toHaveBeenCalled();
});
it('preserves a verified warning when saved hours have no conflict-free future slots',async()=>{
 const h=fixture({available:false});expect(await h.readMyAvailabilityReminders(9)).toHaveLength(2);expect(h.Availability.computeWeekAvailability).toHaveBeenCalledTimes(4);
 expect(h.Task.updateStatus).not.toHaveBeenCalled();
});
it('does not display an old warning as fact when the calendar cannot be checked',async()=>{
 const h=fixture();h.Availability.computeWeekAvailability.mockRejectedValue(Error('calendar unavailable'));vi.spyOn(console,'warn').mockImplementation(()=>{});
 expect(await h.readMyAvailabilityReminders(9)).toEqual([]);expect(h.Task.updateStatus).not.toHaveBeenCalled();expect(h.connection.release).toHaveBeenCalled();
});
it('does not run a competing calendar check when another process holds the provider lock',async()=>{
 const h=fixture({acquired:0});expect(await h.readMyAvailabilityReminders(9)).toEqual([]);expect(h.Availability.computeWeekAvailability).not.toHaveBeenCalled();
});
it('rechecks freshness under the lock so another tab can satisfy the request',async()=>{
 const h=fixture();h.connection.query.mockImplementation(async()=>{for(const r of h.rows)r.isFresh=1;return [[{acquired:1}]];});
 expect(await h.readMyAvailabilityReminders(9)).toHaveLength(2);expect(h.Availability.computeWeekAvailability).not.toHaveBeenCalled();
});
