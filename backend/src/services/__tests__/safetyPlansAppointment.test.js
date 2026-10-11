import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../safetyPlans/access.js',()=>({clientAccess:vi.fn()}));
import pool from '../../config/database.js';
import {clientAccess} from '../safetyPlans/access.js';
import {appointmentPrefill} from '../safetyPlans/appointment.js';
const event={id:17,client_id:41,start_at:'2026-10-10 16:00:00',end_at:'2026-10-10 16:50:00',event_timezone:'America/Denver',location_name:'437 Windchime',status:'BOOKED'};
beforeEach(()=>{vi.resetAllMocks();pool.execute.mockResolvedValue([[event]]);clientAccess.mockResolvedValue({id:41,agency_id:2,full_name:'Synthetic Client'});});
describe('appointment attendance prefill',()=>{
 it('prefills the session in its time zone but does not claim attendance from a booking',async()=>{const p=await appointmentPrefill({id:7},{agencyId:2,eventType:'office',eventId:17});expect(p.data).toMatchObject({appointmentDate:'2026-10-10',startTime:'10:00',endTime:'10:50',location:'437 Windchime',attendanceStatus:'Not yet confirmed'});expect(p.source.eventId).toBe(17);expect(clientAccess).toHaveBeenCalledWith({id:7},41,{write:true});});
 it('rejects the wrong agency, wrong client, and inaccessible client',async()=>{await expect(appointmentPrefill({id:7},{agencyId:3,eventType:'office',eventId:17})).rejects.toMatchObject({status:403});await expect(appointmentPrefill({id:7},{agencyId:2,clientId:42,eventType:'office',eventId:17})).rejects.toMatchObject({status:403});clientAccess.mockRejectedValue(Object.assign(Error('no access'),{status:403}));await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'provider',eventId:17})).rejects.toMatchObject({status:403});});
 it('rejects cancelled, unlinked, and invalid appointment types',async()=>{pool.execute.mockResolvedValueOnce([[{...event,status:'CANCELLED'}]]);await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'office',eventId:17})).rejects.toMatchObject({status:409});pool.execute.mockResolvedValueOnce([[{...event,client_id:null}]]);await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'office',eventId:17})).rejects.toMatchObject({status:404});await expect(appointmentPrefill({id:7},{agencyId:2,eventType:'evil',eventId:17})).rejects.toMatchObject({status:400});});
});
