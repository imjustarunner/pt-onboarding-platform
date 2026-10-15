import {it,expect,vi} from 'vitest';
import {applySupervisionAbsences,absenceCoversSession} from '../supervisionRsvpAbsence.service.js';
it('applies a saved absence to newly generated dates, then resumes normal invitations',async()=>{
 const absence={user_id:8,starts_at:'2026-10-20 23:00:00',ends_at:'2026-11-04 07:00:00',weekday:2,reason:'Class'};
 const session={id:20,agency_id:2,recurrence_series_id:'a',session_type:'group',event_timezone:'America/Denver',start_at:'2026-11-04 00:00:00'};
 const db={execute:vi.fn(async sql=>sql.startsWith('SELECT * FROM supervision_sessions')?[[session]]:sql.startsWith('SELECT * FROM supervision_rsvp_absences')?[[absence]]:[{affectedRows:1}])};
 await applySupervisionAbsences(db,20);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("status='INVITED'"),['Class',20,8]);
 expect(absenceCoversSession(absence,{...session,start_at:'2026-11-11 00:00:00'})).toBe(false);
 expect(absenceCoversSession(absence,{...session,start_at:'2026-10-28 23:00:00'})).toBe(false);
});
