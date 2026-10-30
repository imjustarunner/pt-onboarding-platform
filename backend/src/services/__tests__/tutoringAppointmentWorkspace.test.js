import {expect,it,vi} from 'vitest';
import {ensureTutoringAppointmentWorkspace} from '../tutoringAppointmentWorkspace.service.js';
const room={userId:20,agencyId:6};
const visit={tutoringAppointmentId:8,participants:[{id:40}],starts_at:'2026-10-21 20:00:00',ends_at:'2026-10-21 21:00:00'};
it('reuses one workspace across repeated openings without creating a second session',async()=>{
 const db={execute:vi.fn(async q=>{
  if(q.includes('FROM tutoring_appointment_sessions'))return [[{session_id:90}]];
  if(q.includes('FROM tutoring_session_clients'))return [[{client_id:40}]];
  if(q.includes('s.status,s.provider_user_id'))return [[{status:'scheduled',provider_user_id:20,organization_id:6,metadata_json:{learningServiceCode:'TUTORING'}}]];
  if(q.includes('FROM learning_class_session_participants'))return [[{user_id:20}]];
  return [[]];
 })};
 expect((await ensureTutoringAppointmentWorkspace(room,visit,db)).learningSessionId).toBe(90);
 expect(db.execute.mock.calls.filter(([q])=>q.startsWith('INSERT'))).toHaveLength(0);
});

function workspaceDb({ serviceCode = null, status = 'scheduled', presenters = [] } = {}) {
 return {execute:vi.fn(async q=>{
  if(q.includes('FROM tutoring_appointment_sessions'))return [[{session_id:90}]];
  if(q.includes('FROM tutoring_session_clients'))return [[{client_id:40}]];
  if(q.includes('s.status,s.provider_user_id'))return [[{status,provider_user_id:20,organization_id:6,metadata_json:{existingKey:'preserved',...(serviceCode?{learningServiceCode:serviceCode}:{})}}]];
  if(q.includes('FROM learning_class_session_participants'))return [presenters];
  return [[]];
 })};
}
it('links the checked appointment provider as presenter and preserves explicit Homework Help metadata',async()=>{
 const db=workspaceDb();
 await ensureTutoringAppointmentWorkspace(room,{...visit,learning_service_code:'HOMEWORK HELP'},db);
 expect(db.execute.mock.calls.find(([q])=>q.includes('INSERT INTO learning_class_session_participants'))[1]).toEqual([90,20]);
 const metadata=JSON.parse(db.execute.mock.calls.find(([q])=>q.includes('SET metadata_json='))[1][0]);
 expect(metadata).toEqual({existingKey:'preserved',learningServiceCode:'HOMEWORK HELP'});
});
it('rejects a different presenter without replacing that assignment',async()=>{
 const db=workspaceDb({presenters:[{user_id:21}]});
 await expect(ensureTutoringAppointmentWorkspace(room,visit,db)).rejects.toThrow(/different presenter/);
 expect(db.execute.mock.calls.some(([q])=>/^(INSERT|UPDATE)/.test(q))).toBe(false);
});
it('does not infer Homework Help from the appointment title',async()=>{
 const db=workspaceDb();
 await ensureTutoringAppointmentWorkspace(room,{...visit,title:'Homework Help'},db);
 expect(JSON.parse(db.execute.mock.calls.find(([q])=>q.includes('SET metadata_json='))[1][0]).learningServiceCode).toBe('TUTORING');
});
it('rejects a service changed after linking or starting the visit',async()=>{
 await expect(ensureTutoringAppointmentWorkspace(room,{...visit,learning_service_code:'HOMEWORK HELP'},workspaceDb({serviceCode:'TUTORING'}))).rejects.toThrow(/service differs/);
 await expect(ensureTutoringAppointmentWorkspace(room,{...visit,learning_service_code:'HOMEWORK HELP'},workspaceDb({status:'live'}))).rejects.toThrow(/cannot be relabeled/);
});
it.each(['H2014','HOMEWORK'])('does not turn %s into a tutoring payroll visit',async code=>{
 const db=workspaceDb();
 await expect(ensureTutoringAppointmentWorkspace(room,{...visit,learning_service_code:code},db)).rejects.toHaveProperty('status',409);
 expect(db.execute).not.toHaveBeenCalled();
});
it.each(['TUTORING VIRTUAL','TUTORING IN PERSON','TUTORING 15 MIN'])('retains existing tutoring booking code %s',async code=>{
 const db=workspaceDb();
 await ensureTutoringAppointmentWorkspace(room,{...visit,learning_service_code:code},db);
 expect(JSON.parse(db.execute.mock.calls.find(([q])=>q.includes('SET metadata_json='))[1][0]).learningServiceCode).toBe('TUTORING');
});
it('opens an ended linked learning visit without rewriting its presenter, metadata or recorded time',async()=>{
 const db=workspaceDb({status:'ended',serviceCode:'HOMEWORK HELP'});
 expect(await ensureTutoringAppointmentWorkspace(room,{...visit,modality:'IN_PERSON',learning_service_code:'HOMEWORK HELP'},db,{allowEnded:true})).toHaveProperty('learningSessionId',90);
 expect(db.execute.mock.calls.some(([q])=>/^(INSERT|UPDATE)/.test(q))).toBe(false);
});
it('creates a physical learning workspace with the appointment service preserved',async()=>{
 const db={execute:vi.fn(async sql=>{
  if(sql.includes('FROM learning_program_classes WHERE'))return [[{id:7}]];
  if(sql.includes('INSERT INTO learning_class_sessions'))return [{insertId:90}];
  if(sql.includes('FROM tutoring_session_clients'))return [[{client_id:40}]];
  if(sql.includes('s.status,s.provider_user_id'))return [[{status:'scheduled',provider_user_id:20,organization_id:6,delivery_context:'in_person',metadata_json:{learningServiceCode:'HOMEWORK HELP'}}]];
  return [[]];
 })};
 await ensureTutoringAppointmentWorkspace(room,{...visit,modality:'IN_PERSON',learning_service_code:'HOMEWORK HELP'},db,{allowEnded:true});
 const parameters=db.execute.mock.calls.find(([q])=>q.includes('INSERT INTO learning_class_sessions'))[1];
 expect(parameters[3]).toBe('in_person');expect(JSON.parse(parameters.at(-1))).toEqual({learningServiceCode:'HOMEWORK HELP'});
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
