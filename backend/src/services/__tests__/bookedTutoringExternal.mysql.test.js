import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
const runtime=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>runtime.db.execute(...args),getConnection:()=>runtime.db.getConnection()},onTableWrite:vi.fn()}));
vi.mock('../clinicalWorkArchiveRead.service.js',()=>({assertClinicalWorkActive:vi.fn()}));
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:vi.fn(async()=>{})}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}}))}}));
import {clinicalAudit} from '../clinicalSessionAudit.service.js';
import {startBookedExternalTutoring} from '../bookedTutoringRoom.service.js';
let fixture,appointment;
beforeAll(async()=>{
 if(!recoveryMysqlEnabled)return;
 fixture=await isolatedWorkflowMysql('nlu_video_choice');runtime.db=fixture.db;
 for(const sql of [
 "CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,status VARCHAR(30),start_at DATETIME,end_at DATETIME,modality VARCHAR(20),service_code VARCHAR(30),business_type VARCHAR(30),video_room_mode VARCHAR(30),updated_by_user_id INT,private_meet_url VARCHAR(255))",
 "CREATE TABLE learning_program_classes(id INT PRIMARY KEY,organization_id INT)",
 "CREATE TABLE learning_class_sessions(id INT PRIMARY KEY,learning_class_id INT,provider_user_id INT,status VARCHAR(30),actual_started_at DATETIME,actual_ended_at DATETIME,started_by_user_id INT)",
 "CREATE TABLE tutoring_appointment_sessions(appointment_id INT PRIMARY KEY,session_id INT)",
 "CREATE TABLE tutoring_session_clients(session_id INT,client_id INT)"
 ])await runtime.db.query(sql);
},30000);
beforeEach(async()=>{
 if(!recoveryMysqlEnabled)return;
 vi.clearAllMocks();
 for(const table of ['tutoring_session_clients','tutoring_appointment_sessions','learning_class_sessions','learning_program_classes','appointments'])await runtime.db.query(`DELETE FROM ${table}`);
 const sqlTime=value=>new Date(value).toISOString().slice(0,19).replace('T',' ');
 appointment={id:901,agencyId:453,providerUserId:1496,status:'scheduled',startAt:sqlTime(Date.now()-600000),endAt:sqlTime(Date.now()+3000000),modality:'TELEHEALTH',businessType:'tutoring',serviceCode:'TUTORING',videoRoomMode:'google_meet'};
 await runtime.db.execute("INSERT INTO appointments VALUES(901,453,1496,'scheduled',?,?,'TELEHEALTH','TUTORING','tutoring','google_meet',NULL,'https://meet.google.com/abc-defg-hij')",[appointment.startAt,appointment.endAt]);
 await runtime.db.query("INSERT INTO learning_program_classes VALUES(1,453)");
 await runtime.db.query("INSERT INTO learning_class_sessions VALUES(902,1,1496,'scheduled',NULL,NULL,NULL)");
 await runtime.db.query('INSERT INTO tutoring_appointment_sessions VALUES(901,902)');
 await runtime.db.query('INSERT INTO tutoring_session_clients VALUES(902,903)');
});
afterAll(async()=>{if(fixture)await fixture.close();});
const context=()=>({appointment:{...appointment},clientId:903,host:true,actor:'user-1496',req:{user:{id:1496,role:'provider'}}});
it.skipIf(!recoveryMysqlEnabled)('serializes concurrent external-start retries into one attendance start and one attributed event',async()=>{
 await Promise.all(Array.from({length:4},()=>startBookedExternalTutoring(context(),{body:{attended:true}})));
 const [[row]]=await runtime.db.query('SELECT * FROM learning_class_sessions WHERE id=902');
 const [[saved]]=await runtime.db.query('SELECT * FROM appointments WHERE id=901');
 expect(row).toMatchObject({status:'live',started_by_user_id:1496,actual_ended_at:null});expect(row.actual_started_at).toBeTruthy();expect(saved.status).toBe('in_progress');
 expect(clinicalAudit).toHaveBeenCalledTimes(1);expect(clinicalAudit).toHaveBeenCalledWith(expect.objectContaining({agencyId:453,actor:'user-1496'}),'tutoring_external_attendance_started',expect.objectContaining({source:'tutor_attestation',appointmentId:901}),expect.anything());
});
it.skipIf(!recoveryMysqlEnabled)('rechecks a canceled appointment under the real database lock before recording any attendance',async()=>{
 await runtime.db.query("UPDATE appointments SET status='canceled_by_client' WHERE id=901");
 await expect(startBookedExternalTutoring(context(),{body:{attended:true}})).rejects.toHaveProperty('status',409);
 const [[row]]=await runtime.db.query('SELECT actual_started_at FROM learning_class_sessions WHERE id=902');expect(row.actual_started_at).toBeNull();expect(clinicalAudit).not.toHaveBeenCalled();
});
it.skipIf(!recoveryMysqlEnabled)('rejects a stale external start when the appointment was changed to native video',async()=>{
 await runtime.db.query("UPDATE appointments SET video_room_mode='unique_session' WHERE id=901");
 await expect(startBookedExternalTutoring(context(),{body:{attended:true}})).rejects.toHaveProperty('status',409);
 const [[row]]=await runtime.db.query('SELECT actual_started_at FROM learning_class_sessions WHERE id=902');expect(row.actual_started_at).toBeNull();expect(clinicalAudit).not.toHaveBeenCalled();
});
