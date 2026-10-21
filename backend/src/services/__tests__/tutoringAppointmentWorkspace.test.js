import {expect,it,vi} from 'vitest';
import {ensureTutoringAppointmentWorkspace} from '../tutoringAppointmentWorkspace.service.js';
const room={userId:20,agencyId:6};
const visit={tutoringAppointmentId:8,participants:[{id:40}],starts_at:'2026-10-21 20:00:00',ends_at:'2026-10-21 21:00:00'};
it('reuses one workspace across repeated openings without creating a second session',async()=>{
 const db={execute:vi.fn(async q=>{
  if(q.includes('FROM tutoring_appointment_sessions'))return [[{session_id:90}]];
  if(q.includes('FROM tutoring_session_clients'))return [[{client_id:40}]];
  if(q.includes('s.status,s.provider_user_id'))return [[{status:'scheduled',provider_user_id:20,organization_id:6}]];
  return [[]];
 })};
 expect((await ensureTutoringAppointmentWorkspace(room,visit,db)).learningSessionId).toBe(90);
 expect(db.execute.mock.calls.filter(([q])=>q.startsWith('INSERT'))).toHaveLength(0);
});
it('refuses an old workspace when the appointment student changes',async()=>{
 const db={execute:vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{session_id:90}]]).mockResolvedValueOnce([[{client_id:99}]])};
 await expect(ensureTutoringAppointmentWorkspace(room,visit,db)).rejects.toThrow(/different student roster/);
 expect(db.execute.mock.calls.some(([q])=>q.startsWith('UPDATE'))).toBe(false);
});
it.each([{status:'ended',provider_user_id:20,organization_id:6},{status:'scheduled',provider_user_id:21,organization_id:6},{status:'scheduled',provider_user_id:20,organization_id:2}])('rejects stale provider, tenant, or completed workspace %j',async session=>{
 const db={execute:vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{session_id:90}]]).mockResolvedValueOnce([[{client_id:40}]]).mockResolvedValueOnce([[session]])};
 await expect(ensureTutoringAppointmentWorkspace(room,visit,db)).rejects.toHaveProperty('status',409);
});
