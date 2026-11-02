import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn()}));
vi.mock('../sessionSecurity.service.js',()=>({loadSessionPolicy:vi.fn()}));
import { createPortalActivityWatch, processPortalActivityWatch } from '../portalActivityWatch.service.js';

const port=Number(process.env.PORTAL_ACTIVITY_MYSQL_PORT);
describe.skipIf(!port)('one-session watch persistence in MySQL',()=>{
 let db, admin;
 const database=`portal_watch_test_${process.pid}`;
 const time=new Date('2026-11-02T17:00:00Z');
 const actor={id:1,role:'super_admin'};
 const input={agencyId:10,targetUserId:2,senderIdentityId:3,recipientEmail:'owner@example.test',requestKey:'next-session-test',notBefore:'2026-11-02T16:00:00Z'};
 const send=vi.fn(async()=>({id:'mail-receipt',communicationId:50}));
 const policy=async()=>({idleBeforeTimedownSeconds:900,timedownSeconds:60});
 const run=id=>processPortalActivityWatch(id,{db,send,policy,now:()=>time});
 beforeAll(async()=>{
  const options={host:'127.0.0.1',port,user:'root',timezone:'Z',multipleStatements:true};
  admin=await mysql.createConnection(options);
  await admin.query(`CREATE DATABASE ${database}`);
  db=mysql.createPool({...options,database,connectionLimit:5});
  await db.query(`CREATE TABLE users (id INT PRIMARY KEY, first_name VARCHAR(50),last_name VARCHAR(50),role VARCHAR(30),email VARCHAR(100),work_email VARCHAR(100),status VARCHAR(30),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0);
   INSERT INTO users (id,first_name,last_name,role,email,status) VALUES (1,'Owner','Example','super_admin','owner@example.test','ACTIVE_EMPLOYEE'),(2,'Guardian','Example','client_guardian','guardian@example.test','ACTIVE_EMPLOYEE');
   CREATE TABLE user_agencies (user_id INT,agency_id INT,is_active TINYINT DEFAULT 1); INSERT INTO user_agencies VALUES (2,10,1);
   CREATE TABLE clients (id INT,agency_id INT); INSERT INTO clients VALUES (20,10);
   CREATE TABLE client_guardians (guardian_user_id INT,client_id INT,access_enabled TINYINT); INSERT INTO client_guardians VALUES (2,20,1);
   CREATE TABLE user_login_emails (user_id INT,agency_id INT,email VARCHAR(100));
   CREATE TABLE email_sender_identities (id INT,agency_id INT,is_active TINYINT,from_email VARCHAR(100)); INSERT INTO email_sender_identities VALUES (3,10,1,'messages@example.test');
   CREATE TABLE security_evidence (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,request_id VARCHAR(100),session_ref CHAR(64),occurred_at DATETIME(3),phase VARCHAR(30),action VARCHAR(50),status_code INT,details JSON,route VARCHAR(255),method VARCHAR(10),outcome VARCHAR(30));
   CREATE TABLE auth_session_security (user_id INT,session_ref CHAR(64),last_activity_at DATETIME(3),absolute_expires_at DATETIME(3),revoked_at DATETIME(3),end_reason VARCHAR(64));
   CREATE TABLE user_activity_log (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,agency_id INT,session_id VARCHAR(100),created_at DATETIME(3),action_type VARCHAR(100));
   CREATE TABLE notification_triggers (trigger_key VARCHAR(100) PRIMARY KEY,name VARCHAR(255),description TEXT,default_enabled TINYINT,default_channels_json JSON,default_recipients_json JSON);`);
  await db.query(await readFile(new URL('../../../../database/migrations/1724_portal_activity_watches.sql',import.meta.url),'utf8'));
 },15000);
 beforeEach(async()=>{
  send.mockClear();
  await db.query('DELETE FROM portal_activity_watches; DELETE FROM security_evidence; DELETE FROM auth_session_security; DELETE FROM user_activity_log;');
 });
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE ${database}`);await admin.end();}});
 const create=(overrides={})=>createPortalActivityWatch(actor,{...input,...overrides},{db,now:time});
 const addLogin=async({ref='a'.repeat(64),at='2026-11-02 16:30:00',status=200,details=null}={})=>{
  await db.execute("INSERT INTO security_evidence (user_id,request_id,session_ref,occurred_at,phase,action,status_code,details,route,method,outcome) VALUES (2,UUID(),?,?,'completed','login',?,?,'/api/auth/login','POST','success')",[ref,at,status,details]);
 };
 it('enforces a single open watch and idempotent creation, without sending at creation',async()=>{
  const first=await create();expect((await create()).id).toBe(first.id);
  await expect(create({requestKey:'different-request'})).rejects.toMatchObject({status:409});
  expect(send).not.toHaveBeenCalled();
  const [triggers]=await db.execute("SELECT * FROM notification_triggers WHERE trigger_key LIKE 'portal_activity_%'");
  expect(triggers).toHaveLength(2);
  expect(triggers.every(row=>row.default_enabled && row.default_channels_json.email)).toBe(true);
 });
 it('excludes earlier, failed and impersonated logins',async()=>{
  const watch=await create();
  await addLogin({at:'2026-11-02 15:00:00'});await addLogin({status:401});await addLogin({details:JSON.stringify({switchedFromUserId:1})});
  await run(watch.id);expect(send).not.toHaveBeenCalled();
  const [[saved]]=await db.execute('SELECT status FROM portal_activity_watches WHERE id=?',[watch.id]);expect(saved.status).toBe('armed');
 });
 it('persists exactly one login and end report across workers, and stops after completion',async()=>{
  const watch=await create();await addLogin();
  await db.execute("INSERT INTO auth_session_security VALUES (2,?,'2026-11-02 17:00:00','2026-11-02 18:00:00',NULL,NULL)",['a'.repeat(64)]);
  await Promise.all([run(watch.id),run(watch.id)]);await run(watch.id);expect(send).toHaveBeenCalledTimes(1);
  await db.query("UPDATE auth_session_security SET revoked_at='2026-11-02 16:59:30',end_reason='Signed out'");
  await Promise.all([run(watch.id),run(watch.id)]);await run(watch.id);expect(send).toHaveBeenCalledTimes(2);
  const [[saved]]=await db.execute('SELECT * FROM portal_activity_watches WHERE id=?',[watch.id]);
  expect(saved).toMatchObject({status:'completed',login_state:'sent',summary_state:'sent',end_reason:'Signed out'});
  expect(saved.report_json.sections).toEqual({'Account access':1});
  expect((await create({requestKey:'explicit-new-request'})).id).not.toBe(watch.id);
 });
 it('holds an interrupted send for review without repeating it after restart',async()=>{
  const watch=await create();await addLogin();
  await db.execute("UPDATE portal_activity_watches SET status='watching',session_ref=?,login_at='2026-11-02 16:30:00',login_state='sending' WHERE id=?",['a'.repeat(64),watch.id]);
  await expect(run(watch.id)).rejects.toThrow('DELIVERY_REQUIRES_REVIEW');await run(watch.id);expect(send).not.toHaveBeenCalled();
  const [[saved]]=await db.execute('SELECT status FROM portal_activity_watches WHERE id=?',[watch.id]);expect(saved.status).toBe('attention');
 });
});
