import {it,expect,vi,beforeEach} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute}}));
import {officeAppointmentWindow,officeVisitWindowOpen,tutoringOfficeAppointments} from '../tutoringOfficeWindow.service.js';
const appointment={id:12,source:'appointment',status:'scheduled',starts_at:'2026-10-21T20:00:00Z',ends_at:'2026-10-21T21:00:00Z'};
beforeEach(()=>vi.clearAllMocks());
it('opens exactly 30 minutes before and closes 30 minutes after the scheduled end',()=>{
 for(const [time,expected] of [['19:29:59',false],['19:30:00',true],['20:30:00',true],['21:30:00',true],['21:30:01',false]])expect(officeAppointmentWindow(appointment,Date.parse(`2026-10-21T${time}Z`)).available).toBe(expected);
});
it('never opens cancelled, missed, draft, invalid or reversed appointments',()=>{
 for(const status of ['cancelled','canceled','no_show','missed','draft'])expect(officeAppointmentWindow({...appointment,status},Date.parse(appointment.starts_at)).available).toBe(false);
 expect(officeAppointmentWindow({...appointment,ends_at:null}).available).toBe(false);
 expect(officeAppointmentWindow({...appointment,ends_at:'2026-10-21T19:00:00Z'}).available).toBe(false);
});
it('scopes scheduled presence to the selected client, agency and provider with an exact tutoring roster',async()=>{
 execute.mockResolvedValue([[]]);await tutoringOfficeAppointments({clientId:4,agencyId:6,providerId:7});const [sql,values]=execute.mock.calls[0];expect(values).toEqual([4,6,7,7,4,6,7,7]);expect(sql).toContain('tutoring_session_clients');expect(sql).toContain("business_type IN ('learning','tutoring')");
});
it('rechecks revoked guardians and cancelled/rescheduled appointments on a bound visit',async()=>{
 execute.mockReset().mockResolvedValueOnce([[{client_id:4,guardian_user_id:8,agency_id:6,provider_user_id:7,appointment_source:'appointment',appointment_id:12}]]).mockResolvedValueOnce([[]]);
 expect(await officeVisitWindowOpen(9)).toBe(false);expect(execute).toHaveBeenCalledTimes(2);
 execute.mockReset().mockResolvedValueOnce([[{client_id:4,guardian_user_id:8,agency_id:6,provider_user_id:7,appointment_source:'appointment',appointment_id:12}]]).mockResolvedValueOnce([[{allowed:1}]]).mockResolvedValueOnce([[]]);
 expect(await officeVisitWindowOpen(9)).toBe(false);
});
it('preserves ordinary permanent-office messaging without a scheduled appointment',async()=>{execute.mockResolvedValueOnce([[]]);expect(await officeVisitWindowOpen(9)).toBe(true);});
