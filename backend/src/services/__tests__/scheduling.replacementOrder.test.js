import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../clinicalWorkArchiveRead.service.js',()=>({visibleClinicalWork:vi.fn(async rows=>rows),assertClinicalWorkActive:vi.fn()}));
vi.mock('../publicProviderHold.service.js',()=>({resolveClientProviderHolds:vi.fn()}));
vi.mock('../clientServiceEnrollment.service.js',()=>({ensureClientService:vi.fn()}));
vi.mock('../appointmentConflict.service.js',()=>({withAppointmentWindow:vi.fn(),appointmentOccupiesTime:vi.fn(),assertAppointmentWindowAvailable:vi.fn()}));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
const args={agencyId:2,clientId:8,windowStart:'2026-11-24 00:00:00',windowEnd:'2027-11-24 00:00:00'};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[]]);});
it('selects the nearest client appointments before limiting replacement candidates',async()=>{
 await Appointment.listForAgencyInWindow({...args,order:'upcoming'});
 const [sql,params]=pool.execute.mock.calls[0];expect(sql).toContain('ORDER BY a.start_at ASC,a.id ASC LIMIT 100');expect(params).toEqual([8,2,args.windowEnd,args.windowStart]);
});
it('preserves the existing client history order, without interpolating user-provided SQL',async()=>{
 for(const order of [undefined,'history','ASC; DELETE FROM appointments'])await Appointment.listForAgencyInWindow({...args,order});
 for(const [sql] of pool.execute.mock.calls){expect(sql).toContain('ORDER BY a.start_at DESC LIMIT 100');expect(sql).not.toContain('DELETE');}
});
