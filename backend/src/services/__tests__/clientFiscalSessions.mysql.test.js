import {beforeAll,afterAll,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
vi.mock('../../config/database.js',()=>({default:{}}));vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {loadClientFiscalSessions,recordFiscalBaseline,fiscalPeriod} from '../clientFiscalSessions.service.js';
const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET;
describe.skipIf(!socketPath)('fiscal visit totals and append-only history on MySQL',()=>{
 let db,store;const name='fiscal_visits_'+process.pid;
 beforeAll(async()=>{
  db=await mysql.createConnection({socketPath,user:'root',dateStrings:true});await db.query(`CREATE DATABASE ${name}`);await db.query(`USE ${name}`);
  for(const sql of ['CREATE TABLE agencies(id INT PRIMARY KEY)','CREATE TABLE clients(id INT PRIMARY KEY)','CREATE TABLE users(id INT PRIMARY KEY)',
   'CREATE TABLE clinical_sessions(id INT,agency_id INT,client_id INT,appointment_id INT,office_event_id INT,billing_encounter_id INT,scheduled_start_at DATETIME,source_timezone VARCHAR(64),service_code VARCHAR(32),encounter_status VARCHAR(32),units INT)',
   'CREATE TABLE billing_encounters(id INT,agency_id INT,client_id INT,clinical_session_id INT,service_date DATE,service_code VARCHAR(32))',
   'CREATE TABLE appointments(id INT,agency_id INT,start_at DATETIME,clinical_session_id INT,office_event_id INT,source_timezone VARCHAR(64),status VARCHAR(32),business_type VARCHAR(32))',
   'CREATE TABLE clinical_work_archives(id INT,archived_at DATETIME,restored_at DATETIME)',
   'CREATE TABLE clinical_work_archive_resources(archive_id INT,resource_type VARCHAR(40),resource_id INT)',
   'CREATE TABLE appointment_participants(appointment_id INT,client_id INT,role VARCHAR(20))',
   'INSERT INTO clinical_work_archives VALUES(1,NOW(),NULL)',
   "INSERT INTO clinical_work_archive_resources VALUES(1,'clinical_session',3)",
   'INSERT INTO agencies VALUES(2),(3)','INSERT INTO clients VALUES(12)','INSERT INTO users VALUES(9)'])await db.query(sql);
  for(const table of ['clinical_sessions','billing_encounters','appointments'])await db.query(`ALTER TABLE ${table} ADD provider_user_id INT`);
  await db.query('CREATE TABLE agency_psychotherapy_report_rows(client_id INT,agency_id INT,provider_user_id INT,service_date DATE,service_code VARCHAR(32))');
  const countMigration=readFileSync(new URL('../../../../database/migrations/1873_client_session_count_evidence.sql',import.meta.url),'utf8');
  for(const ddl of countMigration.split(';').filter(s=>s.trim()))await db.query(ddl);
  const migration=readFileSync(new URL('../../../../database/migrations/1866_client_fiscal_session_history.sql',import.meta.url),'utf8');
  // The migration comment contains a semicolon; execute the complete single DDL statement.
  await db.query(migration);
  store={getConnection:async()=>({execute:(...args)=>db.execute(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>{}})};
  const day=fiscalPeriod().start+' 16:00:00';
  await db.execute("INSERT INTO clinical_sessions(id,agency_id,client_id,appointment_id,office_event_id,billing_encounter_id,scheduled_start_at,service_code,encounter_status,units) VALUES(1,2,12,10,NULL,20,?,'H0004','completed',3),(2,2,12,NULL,NULL,NULL,?,'H0004','completed',2),(3,2,12,NULL,NULL,NULL,?,'H0004','completed',2),(4,3,12,NULL,NULL,NULL,?,'H0004','completed',9),(5,2,12,NULL,NULL,NULL,?,'H0004','no_show',1)",[day,day,day,day,day]);
  await db.execute("INSERT INTO billing_encounters(id,agency_id,client_id,clinical_session_id,service_date,service_code) VALUES(20,2,12,1,?,'H0004'),(21,2,12,NULL,?,'90837'),(22,2,12,NULL,?,'90840')",[day,day,day]);
  await db.execute("INSERT INTO appointments(id,agency_id,start_at,clinical_session_id,office_event_id,status,business_type) VALUES(10,2,?,1,NULL,'completed','clinical'),(11,2,?,NULL,NULL,'completed','learning'),(12,2,?,NULL,NULL,'completed','clinical')",[day,day,day]);
  await db.query("INSERT INTO appointment_participants VALUES(10,12,'client'),(11,12,'client'),(12,12,'client')");
 });
 afterAll(async()=>{if(db){await db.query(`DROP DATABASE ${name}`);await db.end();}});
 it('counts all known completed sources once while preserving distinct same-day sessions and agency boundaries',async()=>{
  const total=await loadClientFiscalSessions({agencyId:2,clientId:12},db,db);expect(total).toMatchObject({total:4,unavailable:false});
 });
 it('replaces a verified period, retains every prior revision and rejects stale saves',async()=>{
  const throughDate=fiscalPeriod().today;
  await recordFiscalBaseline({agencyId:2,clientId:12,actorUserId:9,input:{throughDate,count:22,reason:'Verified prior provider records',expectedRevisionId:0}},store);
  const first=await loadClientFiscalSessions({agencyId:2,clientId:12},db,db);expect(first.total).toBe(22);
  await expect(recordFiscalBaseline({agencyId:2,clientId:12,actorUserId:9,input:{throughDate,count:23,reason:'Reconciled prior records',expectedRevisionId:0}},store)).rejects.toHaveProperty('status',409);
  await recordFiscalBaseline({agencyId:2,clientId:12,actorUserId:9,input:{throughDate,count:23,reason:'Reconciled prior records',expectedRevisionId:first.baseline.id}},store);
  const second=await loadClientFiscalSessions({agencyId:2,clientId:12},db,db);expect(second.total).toBe(23);expect(second.history.map(r=>r.count)).toEqual([23,22]);expect(second.history.every(r=>r.actorUserId===9)).toBe(true);
  const other=await loadClientFiscalSessions({agencyId:3,clientId:12},db,db);expect(other.baseline).toBeNull();expect(other.total).toBe(1);
 });
});
