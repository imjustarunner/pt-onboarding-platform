import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import mysql from 'mysql2/promise';
const m=vi.hoisted(()=>({pool:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.pool.execute(...args),getConnection:()=>m.pool.getConnection()}}));
vi.mock('../clientSessionBookingRollout.service.js',()=>({sessionBookingProviders:async()=>[{id:1,name:'Example One'},{id:2,name:'Example Two'}]}));
import {readTransitionWeek,saveTransitionWeek} from '../transitionWeek.service.js';
import {transitionPractices,transitionWorkspaceRoster,transitionClients,transitionMeetings} from '../transitionWorkspace.service.js';
const port=Number(process.env.TRANSITION_WEEK_TEST_MYSQL_PORT);
describe.skipIf(!port)('native MySQL transition workspace',()=>{
 let admin,database,oldKey;
 beforeAll(async()=>{
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Use an explicit disposable loopback port.');
  oldKey=process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=randomBytes(32).toString('base64');
  admin=await mysql.createConnection({host:'127.0.0.1',port,user:'root',multipleStatements:true});database=`transition_workspace_test_${process.pid}`;await admin.query(`CREATE DATABASE \`${database}\``);
  m.pool=mysql.createPool({host:'127.0.0.1',port,user:'root',database,connectionLimit:5,multipleStatements:true});
  await m.pool.query(await fs.readFile(new URL('../../../../database/migrations/1830_practice_transition_week.sql',import.meta.url),'utf8'));
  await m.pool.query(`CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),preferred_name VARCHAR(80),role VARCHAR(32),is_active TINYINT,is_archived TINYINT,is_demo TINYINT,status VARCHAR(30));
   CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT);
   CREATE TABLE agencies(id INT PRIMARY KEY,feature_flags JSON);
   CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,provider_id INT,full_name VARCHAR(120),initials VARCHAR(20),status VARCHAR(30));
   CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active TINYINT);
   CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,start_at DATETIME,status VARCHAR(30));
   CREATE TABLE appointment_participants(appointment_id INT,client_id INT);
   CREATE TABLE provider_schedule_events(id INT PRIMARY KEY,agency_id INT,provider_id INT,kind VARCHAR(32),meeting_subtype VARCHAR(32),status VARCHAR(24),meeting_completed_at DATETIME,title VARCHAR(200),start_at DATETIME,end_at DATETIME,event_timezone VARCHAR(80));
   CREATE TABLE provider_schedule_event_attendees(event_id INT,user_id INT);
   INSERT INTO agencies VALUES (2,JSON_OBJECT()),(6,JSON_OBJECT()),(377,JSON_OBJECT());
   INSERT INTO users VALUES(1,'Example','One',NULL,'provider',1,0,0,'ACTIVE'),(2,'Example','Two',NULL,'staff',1,0,0,'ACTIVE_EMPLOYEE'),(3,'Inactive','Example',NULL,'provider',0,0,0,'INACTIVE'),(9,'Other','Practice',NULL,'provider',1,0,0,'ACTIVE'),(99,'Example','Manager',NULL,'admin',1,0,0,'ACTIVE');
   INSERT INTO user_agencies VALUES(1,2,1),(2,2,1),(3,2,1),(9,6,1),(99,2,1),(99,6,1),(99,377,0);
   INSERT INTO clients VALUES(41,2,1,'Fictional client A','FCA','ACTIVE'),(42,2,2,'Fictional client B','FCB','DISCHARGED'),(49,6,1,'Foreign chart','FC','ACTIVE');
   INSERT INTO client_provider_assignments VALUES(42,1,1);
   INSERT INTO appointments VALUES(1,2,1,'2026-10-19 06:00:00','completed'),(2,2,1,'2026-11-15 18:00:00','COMPLETED'),(3,2,1,'2026-11-16 06:30:00','completed'),(4,6,1,'2026-11-15 18:00:00','completed'),(5,2,1,'2026-11-16 18:00:00','scheduled'),(6,2,1,'2026-11-17 18:00:00','cancelled'),(7,2,1,'2026-10-19 05:59:59','completed');
   INSERT INTO provider_schedule_events VALUES(101,2,99,'TEAM_MEETING','training','ACTIVE',NULL,'Fictional training',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),'America/Denver'),(102,6,99,'TEAM_MEETING','training','ACTIVE',NULL,'Other practice',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),'America/Denver'),(103,2,1,'TEAM_MEETING','general','ACTIVE',NULL,'Private meeting',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),'America/Denver'),(104,2,99,'TEAM_MEETING','interview','ACTIVE',NULL,'Private interview',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),'America/Denver');`);
 });
 beforeEach(async()=>{await m.pool.query('DELETE FROM practice_transition_weeks; DELETE FROM practice_transition_week_events;');});
 afterAll(async()=>{if(m.pool)await m.pool.end();if(admin){if(database)await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);await admin.end();}if(oldKey===undefined)delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=oldKey;});
 const save=input=>saveTransitionWeek({agencyId:2,actorUserId:99,input:{revision:0,...input}});
 it('counts canonical completed sessions using correct Mountain-Time boundaries and active staff',async()=>{
  expect((await transitionPractices({id:99,role:'admin'})).map(p=>p.id)).toEqual([2,6]);
  const roster=await transitionWorkspaceRoster(2);expect(roster.map(p=>p.id).sort((a,b)=>a-b)).toEqual([1,2,99]);
  expect(roster.find(p=>p.id===1)).toMatchObject({appCompleted:3,appUpcoming:1});
  const clients=await transitionClients(2,1);expect(clients.map(c=>c.id)).toEqual([41,42]);
 });
 it('persists assigned client steps and their actual actor encrypted across reloads',async()=>{
  await save({action:'workspace_item',kind:'clients',key:'1:41',patch:{recordsOwnerUserId:2,scheduleOwnerUserId:99,checks:{upToDate:true,schedule:true}}});
  const board=await readTransitionWeek(2);expect(board.state.workspace.clients['1:41']).toMatchObject({recordsOwnerUserId:2,scheduleOwnerUserId:99,checks:{upToDate:{done:true,by:99}}});
  const [[row]]=await m.pool.execute('SELECT payload_json FROM practice_transition_weeks WHERE agency_id=2');expect(JSON.stringify(row.payload_json)).not.toContain('recordsOwnerUserId');
  const [[event]]=await m.pool.execute('SELECT actor_user_id FROM practice_transition_week_events');expect(event.actor_user_id).toBe(99);
 });
 it('rolls back cross-practice client writes and mismatched owners without recording false completion',async()=>{
  await expect(save({action:'workspace_item',kind:'clients',key:'1:49',patch:{recordsOwnerUserId:2,checks:{upToDate:true}}})).rejects.toMatchObject({status:404});
  await expect(save({action:'workspace_item',kind:'people',key:'1',patch:{ownerUserId:9}})).rejects.toMatchObject({status:400});
  expect((await readTransitionWeek(2)).revision).toBe(0);const [[count]]=await m.pool.execute('SELECT COUNT(*) n FROM practice_transition_week_events');expect(count.n).toBe(0);
 });
 it('preserves one winner under concurrent revisions and leaves the other edit retryable',async()=>{
  const results=await Promise.allSettled([save({action:'workspace_item',kind:'people',key:'1',patch:{ownerUserId:2}}),save({action:'workspace_item',kind:'people',key:'2',patch:{ownerUserId:1}})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected').reason.status).toBe(409);
  expect((await readTransitionWeek(2)).revision).toBe(1);
 });
 it('freezes the complete named staff list, including non-client employees, with explicit reviewed counts',async()=>{
  await save({action:'freeze_workspace_ranking',sourceReference:'Fictional verified source',rows:[{providerId:1,completedFourWeeks:12,upcomingWeek:3},{providerId:2,completedFourWeeks:0,upcomingWeek:0},{providerId:99,completedFourWeeks:0,upcomingWeek:0}]});
  const board=await readTransitionWeek(2);expect(board.state.ranking.rows.map(r=>r.providerId)).toEqual([2,99,1]);
  const [[agency]]=await m.pool.execute('SELECT feature_flags FROM agencies WHERE id=2');expect(agency.feature_flags.transitionWeek.enforceCohorts).toBe(true);
 });
 it('lists and links only eligible meetings without expanding private meeting visibility',async()=>{
  expect((await transitionMeetings(2,99)).map(e=>e.id)).toEqual([101]);
  await expect(save({action:'link_meeting',kind:'people',key:'1',eventId:102})).rejects.toMatchObject({status:403});
  const board=await save({action:'link_meeting',kind:'people',key:'1',eventId:101});expect(board.state.workspace.people[1].meetingIds).toEqual([101]);
 });
});
