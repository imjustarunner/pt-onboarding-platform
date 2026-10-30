import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../appointmentStaffTools.service.js',()=>({default:{authorize:vi.fn()}}));
import { createInPersonLearningWorkspace } from '../inPersonLearningWorkspace.service.js';
const appointment={id:8,agencyId:6,providerUserId:20,businessType:'tutoring',modality:'IN_PERSON',status:'scheduled'};
let conn,db,authorize,bridge,open,visit,students;
beforeEach(()=>{
 visit={id:8,agency_id:6,provider_user_id:20,business_type:'tutoring',modality:'IN_PERSON',status:'scheduled',learning_service_code:'HOMEWORK HELP',starts_at:'2026-10-29 20:00:00',ends_at:'2026-10-29 21:00:00'};
 students=[{id:40}];
 conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
  if(sql.includes('FROM appointments a'))return [[visit]];
  if(sql.includes('FROM appointment_participants'))return [students];
  if(sql.includes('FROM tutoring_appointment_sessions'))return [[{session_id:90}]];
  throw Error('Unexpected query');
 })};
 db={getConnection:vi.fn(async()=>conn)};authorize=vi.fn(async()=>appointment);bridge=vi.fn(async()=>({learningSessionId:90}));
 open=createInPersonLearningWorkspace({db,authorize,bridge});
});
it('opens an explicitly selected in-person Homework Help visit without a virtual room or billing action',async()=>{
 expect(await open({id:20},8)).toEqual({sessionId:90,destination:'/in-person-tutoring-session/90'});
 expect(authorize).toHaveBeenCalledWith({id:20},8);
 expect(bridge).toHaveBeenCalledWith({agencyId:6,userId:20},expect.objectContaining({modality:'IN_PERSON',learning_service_code:'HOMEWORK HELP',participants:[{id:40}]}),conn,{allowEnded:true});
 expect(conn.commit).toHaveBeenCalled();expect(conn.rollback).not.toHaveBeenCalled();
 expect(conn.execute.mock.calls.some(([q])=>/charge|payroll|^(UPDATE|INSERT)/.test(q))).toBe(false);
});
it('requires existing schedule authorization and the assigned provider',async()=>{
 await expect(open({id:21},8)).rejects.toHaveProperty('status',403);
 expect(db.getConnection).not.toHaveBeenCalled();
 authorize.mockRejectedValueOnce(Object.assign(new Error('No agency access'),{status:403}));
 await expect(open({id:20},8)).rejects.toHaveProperty('status',403);
 expect(db.getConnection).not.toHaveBeenCalled();
});
it.each([{status:'no_show'},{business_type:'mental_health'},{modality:'VIRTUAL'},{provider_user_id:21}])('rechecks changed appointment data before creating a workspace: %j',async patch=>{
 Object.assign(visit,patch);await expect(open({id:20},8)).rejects.toHaveProperty('status',409);
 expect(bridge).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalled();
});
it('rejects a missing or group Homework Help roster and clinical/legacy indirect codes',async()=>{
 students=[];await expect(open({id:20},8)).rejects.toThrow(/student roster/);
 students=[{id:40},{id:41}];await expect(open({id:20},8)).rejects.toThrow(/one student/);
 students=[{id:40}];visit.learning_service_code='H2014';await expect(open({id:20},8)).rejects.toHaveProperty('status',409);
 visit.learning_service_code='HOMEWORK';await expect(open({id:20},8)).rejects.toHaveProperty('status',409);
 expect(bridge).not.toHaveBeenCalled();
});
it('opens an existing completed visit for review but does not create a historical session',async()=>{
 visit.status='completed';expect(await open({id:20},8)).toHaveProperty('sessionId',90);
 bridge.mockClear();conn.execute.mockImplementation(async sql=>sql.includes('FROM appointments a')?[[visit]]:sql.includes('FROM appointment_participants')?[students]:[[]]);
 await expect(open({id:20},8)).rejects.toThrow(/no linked learning session/);expect(bridge).not.toHaveBeenCalled();
});
