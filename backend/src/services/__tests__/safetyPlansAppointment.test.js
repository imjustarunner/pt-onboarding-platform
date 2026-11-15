import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../safetyPlans/access.js',()=>({clientAccess:vi.fn()}));
import pool from '../../config/database.js';
import {clientAccess} from '../safetyPlans/access.js';
import {appointmentPrefill} from '../safetyPlans/appointment.js';
const event={id:17,client_id:41,start_at:'2026-10-10 16:00:00',end_at:'2026-10-10 16:50:00',event_timezone:'America/Denver',location_name:'437 Windchime',status:'BOOKED'};
beforeEach(()=>{vi.resetAllMocks();pool.execute.mockImplementation(async sql=>sql.includes('FROM appointments')? [[]]:[[event]]);clientAccess.mockResolvedValue({id:41,agency_id:2,full_name:'Synthetic Client'});});
describe('appointment attendance prefill',()=>{
 it('resolves the authorized appointment organization without relying on an ambient page agency',async()=>{const p=await appointmentPrefill({id:7},{eventType:'provider',eventId:17});expect(p.client.agencyId).toBe(2);expect(p.data.letterType).toBe('Scheduled appointment');});
 it('uses the selected clinical session’s times instead of its longer room reservation',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('FROM appointments')?[[{id:77,agency_id:2,start_at:'2026-10-10 16:15:00',end_at:'2026-10-10 16:45:00',source_timezone:'America/Denver'}]]:sql.includes('FROM appointment_participants')?[[{client_id:41}]]:[[event]]);
  const result=await appointmentPrefill({id:7},{eventType:'office',eventId:17,appointmentId:77,clientId:41});expect(result.data).toMatchObject({startTime:'10:15',endTime:'10:45'});expect(result.source.appointmentId).toBe(77);
 });
 it('rejects an appointment ID from another calendar event and ambiguous session links',async()=>{
  await expect(appointmentPrefill({id:7},{eventType:'office',eventId:17,appointmentId:99})).rejects.toMatchObject({status:404});
  pool.execute.mockImplementation(async sql=>sql.includes('FROM appointments')?[[{id:77},{id:78}]]:[[event]]);await expect(appointmentPrefill({id:7},{eventType:'office',eventId:17})).rejects.toMatchObject({status:409});
 });
 it('prefills the session in its time zone but does not claim attendance from a booking',async()=>{const p=await appointmentPrefill({id:7},{agencyId:2,eventType:'office',eventId:17});expect(p.data).toMatchObject({appointmentDate:'2026-10-10',startTime:'10:00',endTime:'10:50',location:'437 Windchime',attendanceStatus:'Not yet confirmed'});expect(p.source.eventId).toBe(17);expect(clientAccess).toHaveBeenCalledWith({id:7},41,{write:true});});
 it('rejects the wrong agency, wrong client, and inaccessible client',async()=>{await expect(appointmentPrefill({id:7},{agencyId:3,eventType:'office',eventId:17})).rejects.toMatchObject({status:403});await expect(appointmentPrefill({id:7},{agencyId:2,clientId:42,eventType:'office',eventId:17})).rejects.toMatchObject({status:403});clientAccess.mockRejectedValue(Object.assign(Error('no access'),{status:403}));await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'provider',eventId:17})).rejects.toMatchObject({status:403});});
 it('rejects cancelled, unlinked, and invalid appointment types',async()=>{pool.execute.mockResolvedValueOnce([[{...event,status:'CANCELLED'}]]);await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'office',eventId:17})).rejects.toMatchObject({status:409});pool.execute.mockResolvedValueOnce([[{...event,client_id:null}]]);await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'office',eventId:17})).rejects.toMatchObject({status:404});await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'evil',eventId:17})).rejects.toMatchObject({status:400});});
});
