import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
vi.mock('../nluTutoringVideoChoice.service.js',()=>({nluTutoringVideoChoice:vi.fn(async()=>true)}));
import {ensureTutoringAppointmentWorkspace} from '../tutoringAppointmentWorkspace.service.js';
let fixture,db;
beforeAll(async()=>{
 if(!recoveryMysqlEnabled)return;
 fixture=await isolatedWorkflowMysql('nlu_hub_any_service');db=fixture.db;
 for(const sql of [
  'CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,service_code VARCHAR(50),business_type VARCHAR(50),office_event_id INT,amount_cents INT)',
  'CREATE TABLE learning_program_classes(id INT AUTO_INCREMENT PRIMARY KEY,organization_id INT,class_name VARCHAR(100),class_code VARCHAR(100),delivery_mode VARCHAR(30),status VARCHAR(30),is_active INT,created_by_user_id INT)',
  "CREATE TABLE learning_class_sessions(id INT AUTO_INCREMENT PRIMARY KEY,learning_class_id INT,title VARCHAR(100),mode VARCHAR(30),session_subtype VARCHAR(30),delivery_context VARCHAR(30),starts_at DATETIME,ends_at DATETIME,provider_user_id INT,created_by_user_id INT,metadata_json JSON,student_subject_id INT,status VARCHAR(30) DEFAULT 'scheduled')",
  'CREATE TABLE public_appointment_requests(agency_id INT,linked_session_id INT,linked_office_event_id INT)',
  'CREATE TABLE tutoring_appointment_sessions(appointment_id INT PRIMARY KEY,session_id INT UNIQUE)',
  'CREATE TABLE tutoring_session_clients(session_id INT,client_id INT,UNIQUE(session_id,client_id))',
  'CREATE TABLE learning_class_session_participants(session_id INT,user_id INT,role VARCHAR(30),UNIQUE(session_id,user_id))'
 ])await db.query(sql);
},30000);
beforeEach(async()=>{
 if(!recoveryMysqlEnabled)return;
 for(const table of ['tutoring_appointment_sessions','tutoring_session_clients','learning_class_session_participants','learning_class_sessions','learning_program_classes','appointments'])await db.query(`DELETE FROM ${table}`);
 await db.query("INSERT INTO appointments VALUES(1,6,20,'H2014','mental_health',NULL,3700)");
});
afterAll(async()=>{if(fixture)await fixture.close();});
const visit={tutoringAppointmentId:1,sessionHubSource:{code:'H2014',businessType:'mental_health'},learning_service_code:'H2014',participants:[{id:40}],modality:'TELEHEALTH',starts_at:'2026-11-28 17:00:00',ends_at:'2026-11-28 18:00:00'};
const open=async()=>{const c=await db.getConnection();try{await c.beginTransaction();const result=await ensureTutoringAppointmentWorkspace({agencyId:6,userId:20},visit,c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}};
it.skipIf(!recoveryMysqlEnabled)('creates one NLU activity workspace across concurrent opens without changing its selected service or price',async()=>{
 const results=await Promise.all([open(),open(),open()]);expect(new Set(results.map(r=>r.learningSessionId)).size).toBe(1);
 const [[a]]=await db.query('SELECT * FROM appointments WHERE id=1');expect(a).toMatchObject({service_code:'H2014',business_type:'mental_health',amount_cents:3700});
 const [[s]]=await db.query('SELECT metadata_json FROM learning_class_sessions');const m=typeof s.metadata_json==='string'?JSON.parse(s.metadata_json):s.metadata_json;
 expect(m).toMatchObject({learningServiceCode:'H2014',sessionHubActivitiesOnly:true,sourceServiceCode:'H2014',sourceBusinessType:'mental_health'});
});
it.skipIf(!recoveryMysqlEnabled)('rejects a changed service before creating any activity workspace',async()=>{
 await db.query("UPDATE appointments SET service_code='CUSTOM-NLU' WHERE id=1");await expect(open()).rejects.toHaveProperty('status',409);
 const [[n]]=await db.query('SELECT COUNT(*) AS n FROM learning_class_sessions');expect(Number(n.n)).toBe(0);
});
