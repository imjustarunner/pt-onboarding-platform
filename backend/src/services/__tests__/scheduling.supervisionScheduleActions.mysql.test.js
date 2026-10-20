/** Runs only against a disposable localhost database; no application credentials. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({schema:`codex_supv_actions_${process.pid}_${Date.now()}`,send:vi.fn()}));
vi.mock('../../config/database.js',async()=>({onTableWrite:()=>{},default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT || 1),user:'root',password:'',database:m.schema,timezone:'+00:00',connectionLimit:6})}));
vi.mock('../meetingInvitations.service.js',()=>({sendMeetingScheduleChange:m.send}));
import pool from '../../config/database.js';
import {applySupervisionOutcome,processSupervisionMissedNotices} from '../supervisionScheduleActions.service.js';
import {cancelMeetingOccurrences} from '../recurringScheduleCancellation.service.js';
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('supervision calendar outcomes in MySQL',()=>{
 let admin,created=false;
 beforeAll(async()=>{
  admin=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:''});
  await admin.query(`CREATE DATABASE ${m.schema}`);created=true;
  for(const sql of [
   'CREATE TABLE supervision_sessions (id INT PRIMARY KEY,agency_id INT,supervisor_user_id INT,supervisee_user_id INT,co_facilitator_user_id INT,session_type VARCHAR(20),start_at DATETIME,end_at DATETIME,status VARCHAR(20),finalized_at DATETIME,meeting_completed_at DATETIME,recurrence_series_id VARCHAR(80),recurrence_stopped INT DEFAULT 0,recurrence_horizon_held INT DEFAULT 0,recurrence_calendar_pending INT DEFAULT 0,recurrence_calendar_generation INT DEFAULT 0,cancel_reason VARCHAR(500),updated_at DATETIME)',
   'CREATE TABLE user_agencies (user_id INT,agency_id INT,is_active INT)',
   'CREATE TABLE supervision_session_attendance_rollups (session_id INT,user_id INT,total_seconds INT)',
   'CREATE TABLE supervision_session_hour_credits (session_id INT,user_id INT,individual_hours DECIMAL(10,2),group_hours DECIMAL(10,2))',
   'CREATE TABLE supervision_session_join_presence (session_id INT,left_at DATETIME,last_seen_at DATETIME)',
   'CREATE TABLE supervision_session_attendees (session_id INT,user_id INT,is_required INT,participant_role VARCHAR(30),status VARCHAR(30))',
   'CREATE TABLE meeting_schedule_change_deliveries (change_key CHAR(64),user_id INT,delivery_status VARCHAR(24))',
   'CREATE TABLE notification_triggers (trigger_key VARCHAR(80) PRIMARY KEY,name VARCHAR(100),description TEXT,default_enabled INT,default_channels_json JSON,default_recipients_json JSON)'
  ])await pool.query(sql);
  const migration=await readFile(new URL('../../../../database/migrations/1666_supervision_schedule_actions.sql',import.meta.url),'utf8');
  for(const sql of splitSqlStatements(migration))await pool.query(sql);
 });
 beforeEach(async()=>{
  m.send.mockReset().mockResolvedValue({sent:2,skipped:0,failed:0});
  for(const table of ['supervision_schedule_actions','supervision_session_attendees','supervision_session_attendance_rollups','supervision_session_hour_credits','supervision_session_join_presence','user_agencies','supervision_sessions'])await pool.query(`DELETE FROM ${table}`);
  await pool.query('INSERT INTO user_agencies VALUES (10,2,1)');
  await pool.query("INSERT INTO supervision_sessions (id,agency_id,supervisor_user_id,supervisee_user_id,session_type,start_at,end_at,status,recurrence_series_id) VALUES (1,2,10,20,'individual','2026-01-01 16:00','2026-01-01 17:00','SCHEDULED','series'),(2,2,10,20,'individual','2026-01-08 16:00','2026-01-08 17:00','SCHEDULED','series')");
 });
 afterAll(async()=>{await pool.end();if(created)await admin.query(`DROP DATABASE ${m.schema}`);await admin?.end();});
 const missed=(args={})=>applySupervisionOutcome({sessionId:1,actorUserId:10,action:'missed',reason:'Supervisee did not attend.',now:new Date('2026-01-02T00:00Z'),...args});
 it('serializes two submissions, changes only the selected occurrence and queues one notice',async()=>{
  const results=await Promise.all([missed(),missed()]);
  expect(results.filter(r=>r.alreadyRecorded)).toHaveLength(1);
  const [sessions]=await pool.query('SELECT id,status,recurrence_series_id FROM supervision_sessions ORDER BY id');
  expect(sessions.map(s=>s.status)).toEqual(['MISSED','SCHEDULED']);expect(sessions.every(s=>s.recurrence_series_id==='series')).toBe(true);
  expect((await pool.query('SELECT * FROM supervision_schedule_actions'))[0]).toHaveLength(1);
  await processSupervisionMissedNotices();await processSupervisionMissedNotices();
  expect(m.send).toHaveBeenCalledOnce();expect(m.send).toHaveBeenCalledWith([expect.objectContaining({status:'MISSED'})],'missed',expect.objectContaining({recipientUserIds:[10,20],actorUserId:10}));
  expect((await pool.query('SELECT * FROM supervision_session_hour_credits'))[0]).toHaveLength(0);
 });
 it('denies non-supervisors, future missed statuses and attended or credited sessions',async()=>{
  await expect(missed({actorUserId:20})).rejects.toMatchObject({status:403});
  await expect(missed({now:new Date('2026-01-01T16:30Z')})).rejects.toMatchObject({status:409});
  await pool.query('INSERT INTO supervision_session_attendance_rollups VALUES (1,20,90)');
  await expect(missed()).rejects.toMatchObject({status:409});
  await pool.query('DELETE FROM supervision_session_attendance_rollups');
  await pool.query('INSERT INTO supervision_session_hour_credits VALUES (1,20,0.5,0)');
  await expect(missed()).rejects.toMatchObject({status:409});
  expect((await pool.query('SELECT * FROM supervision_schedule_actions'))[0]).toHaveLength(0);
  expect((await pool.query('SELECT status FROM supervision_sessions WHERE id=1'))[0][0].status).toBe('SCHEDULED');
 });
 it('deletes only terminal calendar entries and preserves their outcome and audit history',async()=>{
  await expect(missed({action:'deleted'})).rejects.toMatchObject({status:409});
  await missed();await missed({action:'deleted',reason:'Duplicate calendar entry'});
  const [[row]]=await pool.query('SELECT * FROM supervision_sessions WHERE id=1');
  expect(row.status).toBe('MISSED');expect(row.calendar_deleted_at).toBeTruthy();
  expect((await pool.query('SELECT * FROM supervision_schedule_actions'))[0]).toHaveLength(2);
  expect((await pool.query('SELECT calendar_deleted_at FROM supervision_sessions WHERE id=2'))[0][0].calendar_deleted_at).toBeNull();
 });
 it('retains cancelled series dates with attribution and does not overwrite a missed occurrence',async()=>{
  await missed();
  const result=await cancelMeetingOccurrences({kind:'supervision',eventId:2,scope:'future',actorUserId:10,cancelReason:'Supervisor is unavailable',cancelAttribution:'supervisor'});
  expect(result.ids).toEqual([2]);
  const [rows]=await pool.query('SELECT * FROM supervision_sessions ORDER BY id');
  expect(rows[0].status).toBe('MISSED');expect(rows[1]).toMatchObject({status:'CANCELLED',cancel_attribution:'supervisor',calendar_deleted_at:null});
 });
 it('group missed notices exclude optional and already-declined attendees',async()=>{
  await pool.query("UPDATE supervision_sessions SET session_type='group' WHERE id=1");
  await pool.query("INSERT INTO supervision_session_attendees VALUES (1,20,1,'supervisee','INVITED'),(1,30,0,'supervisee','INVITED'),(1,40,1,'supervisee','DECLINED')");
  await missed();await processSupervisionMissedNotices();
  expect(m.send.mock.calls[0][2].recipientUserIds).toEqual([10,20]);
 });
});
