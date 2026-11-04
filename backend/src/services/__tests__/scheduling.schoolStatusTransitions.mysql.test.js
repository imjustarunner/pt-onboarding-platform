/** Isolated local schema only; no transport, production rows or replay. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({getConnection:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m,onTableWrite:vi.fn()}));
import {queueSchoolClientStatusEmails} from '../schoolClientStatusEmail.service.js';
const schema=`codex_school_status_${process.pid}_${Date.now()}`;
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('school/provider status transition SQL',()=>{
 let admin,pool;
 beforeAll(async()=>{
  const options={host:process.env.SCHEDULING_TEST_MYSQL_HOST||'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:process.env.SCHEDULING_TEST_MYSQL_USER||'root',password:process.env.SCHEDULING_TEST_MYSQL_PASSWORD||'',timezone:'+00:00'};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${schema}`);pool=mysql.createPool({...options,database:schema,connectionLimit:8});m.getConnection.mockImplementation(()=>pool.getConnection());m.execute.mockImplementation((...args)=>pool.execute(...args));
  for(const sql of [
   'CREATE TABLE users(id INT PRIMARY KEY,is_active TINYINT,is_archived TINYINT,role VARCHAR(40))',
   'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT)',
   'CREATE TABLE agencies(id INT PRIMARY KEY,organization_type VARCHAR(20),is_active TINYINT)',
   'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,provider_id INT,client_status_id INT,status VARCHAR(30))',
   'CREATE TABLE client_statuses(id INT PRIMARY KEY,agency_id INT,status_key VARCHAR(40))',
   'CREATE TABLE client_status_history(id INT PRIMARY KEY,client_id INT,changed_by_user_id INT,field_changed VARCHAR(40),from_value VARCHAR(40),to_value VARCHAR(40),changed_at DATETIME)',
   'CREATE TABLE client_provider_assignments(client_id INT,organization_id INT,provider_user_id INT,is_active TINYINT)',
   'CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active TINYINT)',
   'CREATE TABLE user_communications(template_type VARCHAR(60),delivery_status VARCHAR(30),error_message TEXT)'
  ])await pool.query(sql);
  for(const file of ['1481_school_client_status_emails.sql','1746_school_family_status_emails.sql','1754_school_assignment_notifications_school_only.sql']){
   const sql=await readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8');for(const statement of splitSqlStatements(sql))await pool.query(statement);
  }
 });
 beforeEach(async()=>{
  for(const table of ['school_client_status_emails','school_client_status_email_states','school_family_status_emails','client_status_history','clients','client_provider_assignments','user_agencies','users','client_statuses','agencies'])await pool.query(`DELETE FROM ${table}`);
  await pool.query("INSERT INTO users VALUES(555,1,0,'staff'),(5,1,0,'provider')");await pool.query('INSERT INTO user_agencies VALUES(555,2,1),(5,2,1)');
  await pool.query("INSERT INTO agencies VALUES(3,'school',1)");await pool.query("INSERT INTO client_statuses VALUES(10,2,'waitlist'),(11,2,'ready_to_schedule'),(12,2,'scheduled')");
  await pool.query("INSERT INTO clients VALUES(1,2,3,5,11,'ACTIVE')");await pool.query('INSERT INTO client_provider_assignments VALUES(1,3,5,1)');
  await pool.query("INSERT INTO client_status_history VALUES(91,1,555,'client_status_id','10','11',UTC_TIMESTAMP())");
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP DATABASE ${schema}`);await admin.end();}});
 const queue=input=>queueSchoolClientStatusEmails(undefined,{clientId:1,actorUserId:555,...input});
 it('emits one school/provider notice after a baseline was reconciled before activation, with no family work',async()=>{
  await queue({});expect((await pool.query('SELECT id FROM school_client_status_emails'))[0]).toHaveLength(0);
  await queue({statusChangeId:91});await queue({statusChangeId:91});
  const [jobs]=await pool.query('SELECT * FROM school_client_status_emails');expect(jobs).toHaveLength(1);expect(jobs[0].state_json).toMatchObject({kind:'assigned',providerIds:[5],statusChangeId:91});
  expect((await pool.query('SELECT id FROM school_family_status_emails'))[0]).toHaveLength(0);
 });
 it('serializes repeated current status events into one saved job',async()=>{
  await Promise.all([queue({statusChangeId:91}),queue({statusChangeId:91})]);expect((await pool.query('SELECT id FROM school_client_status_emails'))[0]).toHaveLength(1);
 });
 it.each(['old history','wrong current status','wrong actor','wrong tenant','nonstaff actor'])('rejects untrusted activation without historical backfill: %s',async reason=>{
  await queue({});
  if(reason==='old history')await pool.query("UPDATE client_status_history SET changed_at='2026-01-01'");
  if(reason==='wrong current status')await pool.query('UPDATE client_status_history SET to_value=12');
  if(reason==='wrong actor')await pool.query('UPDATE client_status_history SET changed_by_user_id=999');
  if(reason==='wrong tenant')await pool.query('UPDATE client_statuses SET agency_id=9 WHERE id=10');
  if(reason==='nonstaff actor')await pool.query("UPDATE users SET role='client_guardian' WHERE id=555");
  await queue({statusChangeId:91});expect((await pool.query('SELECT id FROM school_client_status_emails'))[0]).toHaveLength(0);
 });
 it('leaves actorless reconciliation and unchanged saves quiet',async()=>{
  await queue({});await queue({});await queue({statusChangeId:91,actorUserId:null});expect((await pool.query('SELECT id FROM school_client_status_emails'))[0]).toHaveLength(0);
 });
 it('retains the1754 database safety hold for an older application writer without deleting history',async()=>{
  await pool.query("INSERT INTO school_family_status_emails(school_status_email_id,agency_id,school_organization_id,client_id,actor_user_id,revision,state_hash) VALUES(7,2,3,1,555,1,REPEAT('a',64))");
  expect((await pool.query('SELECT delivery_status FROM school_family_status_emails'))[0][0].delivery_status).toBe('held');
 });
});
