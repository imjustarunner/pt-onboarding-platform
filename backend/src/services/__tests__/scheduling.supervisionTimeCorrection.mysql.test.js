/** Disposable localhost MySQL only; never reads application credentials. */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements } from '../../utils/migrationSql.js';
const fixture = vi.hoisted(() => ({schema:`codex_supervision_correction_${process.pid}_${Date.now()}`}));
vi.mock('../../config/database.js',async() => ({onTableWrite:() => {},default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT || 1),user:'root',password:'',database:fixture.schema,timezone:'+00:00',connectionLimit:8})}));
vi.mock('../meetingJoinPolicy.service.js',() => ({hasActiveMeetingMembership:async() => true,canJoinSupervision:async() => true}));
vi.mock('../supervisionFinalizePipeline.service.js',() => ({creditSuperviseeHoursFromFinalizedSession:async() => ({ok:true}),createSupervisorSupervisionTimeClaim:async() => ({ok:true})}));
import pool from '../../config/database.js';
import SupervisionSession from '../../models/SupervisionSession.model.js';
import { getSupervisionRecord, submitSupervisionTimeCorrection, reviewSupervisionTimeCorrection } from '../supervisionTimeCorrection.service.js';
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('supervision correction MySQL ledger',() => {
  let admin,created=false;
  const host={id:10,role:'provider'},student={id:20,role:'provider'};
  const input = () => ({userIds:[10,20],startAt:'2026-01-01T16:00:00Z',endAt:'2026-01-01T17:00:00Z',minutes:55,reason:'Continued supervision by phone after video ended.',modality:'MIXED',attested:true,requestKey:'original-correction'});
  beforeAll(async() => {
    admin=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:''});
    await admin.query(`CREATE DATABASE ${fixture.schema}`);created=true;
    for(const sql of [
      'CREATE TABLE users (id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),preferred_name VARCHAR(80))',
      'CREATE TABLE agencies (id INT PRIMARY KEY,name VARCHAR(80))',
      'CREATE TABLE supervision_sessions (id INT PRIMARY KEY,agency_id INT,supervisor_user_id INT,supervisee_user_id INT,co_facilitator_user_id INT,session_type VARCHAR(30),start_at DATETIME,end_at DATETIME,status VARCHAR(30),finalized_at DATETIME,finalized_by_user_id INT,finalize_source VARCHAR(40),final_total_seconds INT,live_ended_at DATETIME)',
      'CREATE TABLE supervision_session_attendees (session_id INT,user_id INT,status VARCHAR(30))',
      'CREATE TABLE supervision_session_attendance_rollups (session_id INT,user_id INT,first_joined_at DATETIME,last_left_at DATETIME,total_seconds INT,segment_count INT,is_finalized BOOLEAN,updated_at DATETIME,PRIMARY KEY(session_id,user_id))',
      'CREATE TABLE supervision_session_attendance_events (id INT PRIMARY KEY,session_id INT,user_id INT,event_type VARCHAR(30),event_at DATETIME)',
      'CREATE TABLE supervision_session_join_presence (session_id INT,left_at DATETIME,last_seen_at DATETIME)',
      'CREATE TABLE supervision_review_time (id INT,supervisor_user_id INT,start_at DATETIME,end_at DATETIME,status VARCHAR(30))',
      'CREATE TABLE cosign_review_activity_intervals (id INT,supervisor_user_id INT,start_at DATETIME,end_at DATETIME)'
    ]) await pool.query(sql);
    for(const sql of splitSqlStatements(await readFile(new URL('../../../../database/migrations/1638_supervision_time_corrections.sql',import.meta.url),'utf8')))await pool.query(sql);
    await pool.query("INSERT INTO users VALUES (10,'Test','Supervisor',NULL),(20,'Lauryn','Student','Ryn')");
    await pool.query("INSERT INTO agencies VALUES (2,'ITSCO')");
  });
  beforeEach(async() => {
    for(const table of ['supervision_time_corrections','supervision_session_attendance_rollups','supervision_session_attendance_events','supervision_sessions'])await pool.query(`DELETE FROM ${table}`);
    await pool.query("INSERT INTO supervision_sessions (id,agency_id,supervisor_user_id,supervisee_user_id,session_type,start_at,end_at,status) VALUES (1,2,10,20,'individual','2026-01-01 16:00:00','2026-01-01 17:00:00','FINALIZED')");
    for(const uid of [10,20])await SupervisionSession.upsertAttendanceRollup({sessionId:1,userId:uid,firstJoinedAt:'2026-01-01 16:00:00',lastLeftAt:'2026-01-01 16:10:00',totalSeconds:600,segmentCount:1,isFinalized:true});
    await pool.query("INSERT INTO supervision_session_attendance_events VALUES (1,1,10,'joined','2026-01-01 16:00:00')");
  });
  afterAll(async() => {await pool.end();if(created)await admin.query(`DROP DATABASE ${fixture.schema}`);await admin?.end();});
  it('serializes duplicate requests and preserves corrected time across late platform rollup writes',async() => {
    const results=await Promise.all([submitSupervisionTimeCorrection(1,host,input()),submitSupervisionTimeCorrection(1,host,input())]);
    expect(results.every(r => r.status==='approved')).toBe(true);
    await SupervisionSession.upsertAttendanceRollup({sessionId:1,userId:10,totalSeconds:800,firstJoinedAt:'2026-01-01 16:00:00',lastLeftAt:'2026-01-01 16:13:20'});
    const record=await getSupervisionRecord(1,host);
    expect(record.corrections).toHaveLength(2);expect(record.participants.every(p => p.totalSeconds===3300)).toBe(true);
    expect(record.events).toHaveLength(1);expect(record.session.startAt.toISOString()).toBe('2026-01-01T16:00:00.000Z');
    const previous=record.corrections[0].previous_record_json;
    expect((typeof previous==='string'?JSON.parse(previous):previous).total_seconds).toBe(600);
  });
  it('leaves a student request pending until a supervisor approves it and blocks a repeated review',async() => {
    await submitSupervisionTimeCorrection(1,student,{...input(),userIds:[20]});
    let record=await getSupervisionRecord(1,host);const id=record.corrections[0].id;
    expect(record.corrections[0].status).toBe('pending');expect(record.participants.find(p => p.userId===20).totalSeconds).toBe(600);
    await reviewSupervisionTimeCorrection(1,id,host,'approve');
    record=await getSupervisionRecord(1,host);expect(record.participants.find(p => p.userId===20).totalSeconds).toBe(3300);
    await expect(reviewSupervisionTimeCorrection(1,id,host,'approve')).rejects.toMatchObject({status:409});
  });
});
