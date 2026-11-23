import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args)},onTableWrite:vi.fn()}));vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:(...args)=>state.db.execute(...args)}}));
import {parsePayrollFile} from '../../controllers/payroll.controller.js';
import {previewSessionCountImport,applySessionCountImport,sessionCountSourceKey} from '../sessionCountImport.service.js';
import {getSessionTotalsByClient} from '../billingReportIngest.service.js';
import {listSessionLimitItems} from '../payrollCompliance.service.js';
import {getPsychotherapyComplianceSummary} from '../../controllers/psychotherapyCompliance.controller.js';
import {loadAgencyFiscalSessions} from '../clientFiscalSessions.service.js';
const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET,port=Number(process.env.SCHEDULING_TEST_MYSQL_PORT||0);
const connection={...(socketPath?{socketPath}:{host:'127.0.0.1',port}),user:'root',password:process.env.SESSION_COUNT_TEST_MYSQL_PASSWORD||''};
describe.skipIf(!socketPath&&!port)('count-only payroll-format catch-up on isolated MySQL',()=>{
 let server,db;const name=`session_count_import_${process.pid}`;
 const headers='Date of Service,Clinician Name,First Name,Last Name,Patient DOB,Service Code,Units,Type,Appointment Status';
 const inputRows=[
 '07/02/2026,Example Provider,Alex,Rivera,04/09/1990,H0004,3,Appointment,Completed',
 '07/02/2026,Example Provider,Alex,Rivera,04/09/1990,H0004,2,Appointment,Completed',
 '07/03/2026,Example Provider,Alex,Rivera,04/09/1990,90837,1,Appointment,Completed',
 '07/04/2026,Example Provider,Alex,Rivera,04/09/1990,H0004,2,Appointment,Cancelled',
 '07/04/2026,Example Provider,Ambiguous,Person,,H0004,1,Appointment,Completed',
 '07/04/2026,Foreign Provider,Alex,Rivera,04/09/1990,H0004,1,Appointment,Completed',
 '07/04/2026,Example Provider,Alex,Rivera,04/09/1990,TUTORING,1,Appointment,Completed',
 '07/04/2026,Example Provider,Alex,Rivera,04/09/1990,90840,1,Appointment,Completed'];
 const parse=lines=>{const file=Buffer.from([headers,...lines].join('\n'));return {agencyId:2,sourceKey:sessionCountSourceKey(file),rows:parsePayrollFile(file,'synthetic.csv').rows};};
 beforeAll(async()=>{
  vi.stubEnv('BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
  server=await mysql.createConnection(connection);await server.query(`CREATE DATABASE ${name}`);db=mysql.createPool({...connection,database:name,dateStrings:true,connectionLimit:4});state.db=db;
  for(const sql of [
   'CREATE TABLE agencies(id INT PRIMARY KEY)',
   'CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),role VARCHAR(32))',
   'CREATE TABLE user_agencies(user_id INT,agency_id INT)',
   'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,status VARCHAR(32),initials VARCHAR(32),full_name VARCHAR(255),date_of_birth DATE,gender VARCHAR(64),address_street VARCHAR(255),address_apt VARCHAR(64),address_city VARCHAR(100),address_state VARCHAR(50),address_zip VARCHAR(20),contact_phone VARCHAR(20),email VARCHAR(255),primary_insurer_name VARCHAR(255),insurance_member_id VARCHAR(128),insurance_group_number VARCHAR(128),insurance_subscriber_name VARCHAR(255),billing_insurance_payload JSON,demographics_phi_enc JSON)',
   'CREATE TABLE client_billing_identities(agency_id INT,client_id INT,member_id_hash CHAR(64))',
   'CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active INT)',
   'CREATE TABLE clinical_sessions(id INT,agency_id INT,client_id INT,provider_user_id INT,appointment_id INT,office_event_id INT,billing_encounter_id INT,scheduled_start_at DATETIME,source_timezone VARCHAR(64),service_code VARCHAR(32),encounter_status VARCHAR(32))',
   'CREATE TABLE billing_encounters(id INT,agency_id INT,client_id INT,provider_user_id INT,clinical_session_id INT,service_date DATE,service_code VARCHAR(32))',
   'CREATE TABLE appointments(id INT,agency_id INT,provider_user_id INT,start_at DATETIME,clinical_session_id INT,office_event_id INT,source_timezone VARCHAR(64),status VARCHAR(32),business_type VARCHAR(32))',
   'CREATE TABLE appointment_participants(appointment_id INT,client_id INT,role VARCHAR(20))',
   'CREATE TABLE agency_psychotherapy_report_rows(client_id INT,agency_id INT,provider_user_id INT,service_date DATE,service_code VARCHAR(32),client_key_hash VARCHAR(80),client_abbrev VARCHAR(80),patient_initials_normalized VARCHAR(32),fiscal_year_start DATE)',
   'INSERT INTO agencies VALUES(2),(3)',
   "INSERT INTO users VALUES(9,'Example','Provider','provider'),(10,'Second','Provider','provider'),(11,'Foreign','Provider','provider'),(99,'Test','Admin','admin')",
   'INSERT INTO user_agencies VALUES(9,2),(10,2),(11,3),(99,2)',
   "INSERT INTO clients(id,agency_id,status,full_name,date_of_birth) VALUES(12,2,'ACTIVE','Alex Rivera','1990-04-09'),(13,2,'ACTIVE','Ambiguous Person',NULL),(14,2,'ACTIVE','Ambiguous Person',NULL),(15,3,'ACTIVE','Alex Rivera','1990-04-09')",
   'INSERT INTO client_provider_assignments VALUES(12,9,1),(13,9,1),(14,9,1)',
   "INSERT INTO clinical_sessions(id,agency_id,client_id,provider_user_id,scheduled_start_at,service_code,encounter_status) VALUES(1,2,12,9,'2026-07-02 15:00:00','H0004','completed')"
  ])await db.query(sql);
  for(const filename of ['1866_client_fiscal_session_history.sql','1873_client_session_count_evidence.sql']){const migration=readFileSync(new URL(`../../../../database/migrations/${filename}`,import.meta.url),'utf8');for(const sql of migration.split(';').filter(s=>s.trim()))await db.query(sql);}
 });
 afterAll(async()=>{await db?.end();if(server){await server.query(`DROP DATABASE IF EXISTS ${name}`);await server.end();}vi.unstubAllEnvs();});
 it('previews strict matches without profile, payroll or financial writes and rejects cross-agency provider mappings',async()=>{
  const input=parse(inputRows),preview=await previewSessionCountImport(input,db);
  expect(preview.summary).toEqual({serviceRows:8,matchedRows:3,reviewRows:2,excludedRows:3});
  expect(preview.rows.filter(r=>r.clientId).map(r=>r.clientId)).toEqual([12,12,12]);
  expect((await db.query('SELECT COUNT(*) n FROM client_session_count_imports'))[0][0].n).toBe(0);
  await expect(previewSessionCountImport({...input,providerMap:{'Foreign Provider':11}},db)).rejects.toHaveProperty('status',403);
  expect((await db.query('SELECT primary_insurer_name FROM clients WHERE id=12'))[0][0].primary_insurer_name).toBeNull();
 });
 it('requires the reviewed snapshot, records actual actor and is idempotent on exact retries',async()=>{
  const input=parse(inputRows),preview=await previewSessionCountImport(input,db);
  await expect(applySessionCountImport({...input,actorUserId:99,expectedSnapshot:'stale'},db)).rejects.toHaveProperty('status',409);
  const saved=await applySessionCountImport({...input,actorUserId:99,expectedSnapshot:preview.snapshot},db);
  const retry=await applySessionCountImport({...input,actorUserId:99,expectedSnapshot:preview.snapshot},db);
  expect(saved.alreadyImported).toBe(false);expect(retry).toMatchObject({importId:saved.importId,alreadyImported:true});
  const [audit]=await db.query('SELECT actor_user_id FROM client_session_count_imports');expect(audit).toEqual([{actor_user_id:99}]);
  const totals=await loadAgencyFiscalSessions({agencyId:2,clientIds:[12]},db,db);expect(totals.get(12)).toMatchObject({total:3,recorded:1,reportAdded:2,unavailable:false,psychotherapyTotal:1});
 });
 it('merges overlapping exports, retains two same-day H0004 visits, and combines providers and legacy evidence',async()=>{
  const input=parse([...inputRows.slice(0,3),'07/05/2026,Second Provider,Alex,Rivera,04/09/1990,H0004,9,Appointment,Completed']);
  const preview=await previewSessionCountImport(input,db);await applySessionCountImport({...input,actorUserId:99,expectedSnapshot:preview.snapshot},db);
  await db.query("INSERT INTO agency_psychotherapy_report_rows(client_id,agency_id,provider_user_id,service_date,service_code) VALUES(12,2,9,'2026-07-03','90837')");
  const totals=await loadAgencyFiscalSessions({agencyId:2},db,db);expect(totals.get(12)).toMatchObject({total:4,psychotherapyTotal:1,perCode:{H0004:3,'90837':1},providerIds:expect.arrayContaining([9,10]),unavailable:false});
  expect((await loadAgencyFiscalSessions({agencyId:3},db,db)).size).toBe(0);
 });
 it('exposes the identical all-provider count in the chart, caseload, payroll review and legacy compliance page',async()=>{
  const input=parse([...Array(22).fill(inputRows[0]),inputRows[2],'07/05/2026,Second Provider,Alex,Rivera,04/09/1990,H0004,9,Appointment,Completed']);
  const preview=await previewSessionCountImport(input,db);await applySessionCountImport({...input,actorUserId:99,expectedSnapshot:preview.snapshot},db);
  const chart=(await loadAgencyFiscalSessions({agencyId:2,clientIds:[12]},db,db)).get(12);
  const caseload=await getSessionTotalsByClient({agencyId:2,fiscalYearStart:'2026-07-01',providerUserId:9});
  const payroll=await listSessionLimitItems({agencyId:2});
  const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
  await getPsychotherapyComplianceSummary({user:{id:99,role:'admin'},query:{agencyId:'2',fiscalYearStart:'2026-07-01'}},res,next);
  expect(next).not.toHaveBeenCalled();expect(chart.total).toBe(24);expect(caseload[12].total).toBe(24);
  expect(payroll.filter(r=>r.clientId===12).map(r=>[r.providerUserId,r.total])).toEqual([[9,24],[10,24]]);
  expect(res.json.mock.calls[0][0].matched).toHaveLength(1);expect(res.json.mock.calls[0][0].matched[0].total).toBe(24);
 });

});
