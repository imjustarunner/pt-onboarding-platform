import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
const runtime=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{getConnection:()=>runtime.db.getConnection()}}));
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:vi.fn()}));
import {startConnectedTutoringSession,endConnectedTutoringVisits} from '../tutoringMediaAttendance.service.js';
let fixture;
const media={session_id:600,media_id:'synthetic-booked-media',agency_id:453};
beforeAll(async()=>{if(!recoveryMysqlEnabled)return;fixture=await isolatedWorkflowMysql('nlu_email_attendance');runtime.db=fixture.db;
 for(const sql of [
  'CREATE TABLE appointments(id INT PRIMARY KEY,status VARCHAR(30))',
  'CREATE TABLE tutoring_appointment_sessions(appointment_id INT PRIMARY KEY,session_id INT)',
  'CREATE TABLE learning_class_sessions(id INT PRIMARY KEY,status VARCHAR(30),booked_media_id VARCHAR(100),actual_started_at DATETIME(3),actual_ended_at DATETIME(3))',
  'CREATE TABLE tutoring_session_visits(id INT PRIMARY KEY,session_id INT,status VARCHAR(30),ended_at DATETIME,duration_seconds INT)',
  'CREATE TABLE clinical_video_sessions(media_id VARCHAR(100) PRIMARY KEY,state VARCHAR(30),session_kind VARCHAR(30),session_id INT)',
  'CREATE TABLE clinical_video_grants(id INT PRIMARY KEY,participant_role VARCHAR(30),visit_id INT,revoked_at DATETIME(3),expires_at DATETIME(3))',
  'CREATE TABLE clinical_video_connections(connection_id INT PRIMARY KEY,media_id VARCHAR(100),grant_id INT,connected_at DATETIME(3),disconnected_at DATETIME(3),disconnect_requested BOOL)'
 ])await runtime.db.query(sql);
},30000);
beforeEach(async()=>{if(!recoveryMysqlEnabled)return;
 for(const table of ['appointments','tutoring_appointment_sessions','learning_class_sessions','tutoring_session_visits','clinical_video_sessions','clinical_video_grants','clinical_video_connections'])await runtime.db.query(`DELETE FROM ${table}`);
 await runtime.db.query("INSERT INTO appointments VALUES(498,'scheduled')");
 await runtime.db.query('INSERT INTO tutoring_appointment_sessions VALUES(498,600)');
 await runtime.db.query("INSERT INTO learning_class_sessions VALUES(600,'scheduled','synthetic-booked-media',NULL,NULL)");
 await runtime.db.query("INSERT INTO tutoring_session_visits(id,session_id,status) VALUES(9,600,'admitted')");
 await runtime.db.query("INSERT INTO clinical_video_sessions VALUES('synthetic-booked-media','active','tutoring',600)");
 await runtime.db.query("INSERT INTO clinical_video_grants VALUES(1,'provider',NULL,NULL,'2099-11-22 14:00:00'),(2,'client',9,NULL,'2099-11-22 14:00:00')");
 await runtime.db.query("INSERT INTO clinical_video_connections VALUES(1,'synthetic-booked-media',1,'2026-11-22 13:40:00',NULL,FALSE)");
});
afterAll(async()=>{await fixture?.close();});
const test=recoveryMysqlEnabled?it:it.skip;
test('an admitted invitation without a connected family device cannot start attendance',async()=>{expect(await startConnectedTutoringSession(media)).toBe(false);const [[row]]=await runtime.db.query('SELECT actual_started_at,status FROM learning_class_sessions WHERE id=600');expect(row.actual_started_at).toBeNull();expect(row.status).toBe('scheduled');});
test('concurrent media events start the exact appointment once, at their verified overlap',async()=>{await runtime.db.query("INSERT INTO clinical_video_connections VALUES(2,'synthetic-booked-media',2,'2026-11-22 13:43:00',NULL,FALSE)");const results=await Promise.all(Array.from({length:6},()=>startConnectedTutoringSession(media)));expect(results.filter(Boolean)).toHaveLength(1);const [[session]]=await runtime.db.query('SELECT actual_started_at FROM learning_class_sessions WHERE id=600');expect(session.actual_started_at.toISOString()).toBe('2026-11-22T13:43:00.000Z');const [[a]]=await runtime.db.query('SELECT status FROM appointments WHERE id=498');expect(a.status).toBe('in_progress');});
test.each(['disconnected','revoked','expired','wrong-session'])('withholds attendance for a %s family connection',async mode=>{await runtime.db.query("INSERT INTO clinical_video_connections VALUES(2,'synthetic-booked-media',2,'2026-11-22 13:43:00',NULL,FALSE)");
 if(mode==='disconnected')await runtime.db.query('UPDATE clinical_video_connections SET disconnected_at=UTC_TIMESTAMP() WHERE connection_id=2');
 if(mode==='revoked')await runtime.db.query('UPDATE clinical_video_grants SET revoked_at=UTC_TIMESTAMP() WHERE id=2');
 if(mode==='expired')await runtime.db.query("UPDATE clinical_video_grants SET expires_at='2026-11-22 13:42:00' WHERE id=2");
 if(mode==='wrong-session')await runtime.db.query('UPDATE tutoring_session_visits SET session_id=601 WHERE id=9');
 expect(await startConnectedTutoringSession(media)).toBe(false);
});

test('records actual connected seconds on end, with no duration invented from admission',async()=>{await runtime.db.query("INSERT INTO clinical_video_connections VALUES(2,'synthetic-booked-media',2,'2026-11-22 13:43:00','2026-11-22 13:43:07',FALSE)");expect(await endConnectedTutoringVisits({id:600},runtime.db)).toBe(true);const [[visit]]=await runtime.db.query('SELECT status,duration_seconds FROM tutoring_session_visits WHERE id=9');expect(visit).toMatchObject({status:'ended',duration_seconds:7});});
