import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import {splitSqlStatements,stripSqlLineComments,isIgnorableSchemaError} from '../../../../database/migrationSqlUtils.js';
import {installPayrollSchema,payrollTables} from './assistantPayroll.mysql.fixtures.js';
import {readPayrollReview,payrollReviewPacket} from '../assistantPayrollReview.service.js';
import {readSupervisionHistory} from '../assistantPayrollSupervision.service.js';
import {createAssistantPayrollApproval} from '../assistantPayrollApproval.service.js';
import {createAssistantPayrollReports,deliverApprovedPayrollReports} from '../assistantPayrollReport.service.js';
import {scopedPayrollCommand} from '../assistantPayrollCommand.service.js';
import Mileage from '../../models/PayrollMileageClaim.model.js';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),query:(...args)=>state.db.query(...args),getConnection:(...args)=>state.db.getConnection(...args)},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../assistantReviewPackets.service.js',()=>({buildClinicalReviewPacket:vi.fn(),readSourceRevision:vi.fn(),inventoryEligibleCharts:vi.fn()}));
import {createAssistantTeamsService} from '../assistantTeams.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {loadAssistantIdentity,assertAssistantMembership} from '../assistantIdentity.service.js';
import {processAssistantAccountAlerts} from '../assistantAccountAlerts.service.js';
import {provisionAssistantAccounts,countAssistantSchools} from '../assistantProvisioning.service.js';
import {queueAssistantPreparation,processAssistantPreparationJobs} from '../assistantPreparation.service.js';
import {ASSISTANT_POLICY_VERSION,assistantDigest,assistantConfigurationHash,assistantStoredConfigurationHash} from '../assistantTeamPolicy.js';
const socket=process.env.ASSISTANT_TEST_SOCKET;
const testHost=process.env.ASSISTANT_TEST_MYSQL_HOST;
const testPort=Number(process.env.ASSISTANT_TEST_MYSQL_PORT||3306);
const roleCollation=process.env.ASSISTANT_TEST_ROLE_COLLATION||'utf8mb4_unicode_ci';
if(!['utf8mb4_unicode_ci','utf8mb4_0900_ai_ci'].includes(roleCollation))throw Error('Choose a known synthetic role collation.');
const connectionOptions=socket?{socketPath:socket,user:'root'}:{host:testHost,port:testPort,user:process.env.ASSISTANT_TEST_MYSQL_USER||'root',password:process.env.ASSISTANT_TEST_MYSQL_PASSWORD||''};
const database=`assistant_teams_integration_${process.pid}`;
let admin,db,service;
const revisions=new Map();
const ref=()=>crypto.randomUUID();
const sourceHash=id=>assistantDigest({fixture:'synthetic-payroll',id,revision:1});
const owner={id:501};
const payload=revision=>({sourceRevision:revision,outcome:'PASS',findings:[{category:'readiness',severity:'review',message:'Synthetic evidence reviewed.',sourceRefs:[],recommendation:'Human review remains required.',uncertainty:''}],evidence:{browser:'Synthetic test browser',viewport:'1280x900',buildId:'synthetic-build-20261102',observedAt:new Date().toISOString(),steps:['Compared the scoped source evidence.']}});
const tables=[...payrollTables,'assistant_preparation_jobs','assistant_marketing_revisions','assistant_source_changes','assistant_verifications','assistant_change_events','assistant_proposals','assistant_runs','assistant_work_items','assistant_accounts','auth_session_security','user_auth_revocations','payroll_time_claims','tasks','agency_schools','organization_affiliations','user_agencies','users','agencies'];
async function makeWork({accountId=1,userId=601,agencyId=2,sourceId=10}={}){
 const workRef=ref(),sourceRevision=sourceHash(sourceId),packet={type:'payroll',summary:'Synthetic private review packet',items:[{ref:ref(),submittedMinutes:45}]};revisions.set(sourceId,sourceRevision);
 await db.execute(`INSERT INTO assistant_work_items(ref,account_id,agency_id,task_kind,title,source_kind,source_id,source_hash,packet_ciphertext,mapping_ciphertext,due_at) VALUES (?,?,?,'payroll.review','Synthetic payroll review','payroll_time_claim',?,?,?,?,UTC_TIMESTAMP(3))`,[workRef,accountId,agencyId,sourceId,sourceRevision,encryptFamilyBilling(packet,`assistant-work:${agencyId}:${accountId}:${workRef}:packet`),encryptFamilyBilling({sourceId,userId},`assistant-work:${agencyId}:${accountId}:${workRef}:mapping`)]);
 return {workRef,sourceRevision,packet};
}
describe.skipIf(!socket&&!testHost)('assistant teams on isolated upstream MySQL',()=>{
 beforeAll(async()=>{
  if(socket&&!/^\/(?:private\/)?tmp\/(?:assistant-teams|assistant-payroll)-mysql8?-20261102\/mysql\.sock$/.test(socket))throw Error('ASSISTANT_TEST_SOCKET must point to this task’s isolated temporary Unix socket; app database settings are never used.');
  if(!socket&&(!['127.0.0.1','localhost','mysql'].includes(testHost)||!Number.isInteger(testPort)||testPort<1||testPort>65535))throw Error('Use an explicitly configured local or CI MySQL test service.');
  if(!/^assistant_teams_integration_\d+$/.test(database))throw Error('Synthetic test database prefix required.');
  vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,23).toString('base64'));vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_ID','assistant-integration-test');
  admin=await mysql.createConnection({...connectionOptions,timezone:'Z'});await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  db=mysql.createPool({...connectionOptions,database,timezone:'Z',connectionLimit:8});db.on('connection',connection=>connection.query("SET time_zone = '+00:00'"));state.db=db;
  for(const sql of [
   `CREATE TABLE users(id INT PRIMARY KEY,email VARCHAR(255) UNIQUE,username VARCHAR(255),work_email VARCHAR(255),personal_email VARCHAR(255),password_hash VARCHAR(255),role ENUM('super_admin','admin','staff','provider','retained_role') CHARACTER SET utf8mb4 COLLATE ${roleCollation} NOT NULL DEFAULT 'staff',status VARCHAR(40),first_name VARCHAR(80),last_name VARCHAR(80),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,login_is_group_email TINYINT DEFAULT 0,sso_password_override TINYINT DEFAULT 0,sees_clients TINYINT DEFAULT 0)`,
   "CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(80),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,organization_type VARCHAR(40) DEFAULT 'agency',feature_flags JSON)",
   'CREATE TABLE user_agencies(user_id INT NOT NULL,agency_id INT NOT NULL,is_active TINYINT DEFAULT 1,UNIQUE KEY(user_id,agency_id))',
   'CREATE TABLE agency_schools(agency_id INT,school_organization_id INT,is_active TINYINT DEFAULT 1)',
   'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active TINYINT DEFAULT 1)',
   'CREATE TABLE user_auth_revocations(user_id INT PRIMARY KEY,reject_issued_before BIGINT,revoked_at DATETIME(3),revoked_by_user_id INT)',
   'CREATE TABLE auth_session_security(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,revoked_at DATETIME(3))',
   'CREATE TABLE tasks(id INT PRIMARY KEY,assigned_to_agency_id INT,status VARCHAR(40),source_ref_type VARCHAR(100),source_ref_id VARCHAR(100),assigned_to_user_id INT,created_at DATETIME(3),updated_at DATETIME(3))',
   'CREATE TABLE payroll_time_claims(id INT PRIMARY KEY,agency_id INT,user_id INT,status VARCHAR(40),claim_type VARCHAR(40),payload_json JSON,suggested_payroll_period_id INT,updated_at DATETIME(3))'
  ])await db.query(sql);
  const migration=await fs.readFile(new URL('../../../../database/migrations/1747_external_assistant_teams.sql',import.meta.url),'utf8');
  for(const sql of splitSqlStatements(stripSqlLineComments(migration)))await db.query(sql);
  await installPayrollSchema(db);
  service=createAssistantTeamsService({db,operationalRevision:async({sourceId})=>revisions.get(Number(sourceId))});
 },20000);
 beforeEach(async()=>{
  revisions.clear();const connection=await db.getConnection();try{await connection.query('SET FOREIGN_KEY_CHECKS=0');for(const table of tables)await connection.query(`TRUNCATE TABLE ${table}`);await connection.query('SET FOREIGN_KEY_CHECKS=1');}finally{connection.release();}
  await db.query("INSERT INTO users(id,email,username,work_email,role,status,first_name,last_name,is_active,is_assistant_account) VALUES (501,'michael@plottwistco.com','owner','michael@plottwistco.com','super_admin','ACTIVE_EMPLOYEE','Synthetic','Owner',1,0),(601,'payroll-assistant@itsco.health','itsco-bot','payroll-assistant@itsco.health','assistant','ACTIVE','Synthetic','ITSCO Bot',1,1),(602,'payroll-assistant@nextleveluplcc.com','nlu-bot','payroll-assistant@nextleveluplcc.com','assistant','ACTIVE','Synthetic','NLU Bot',1,1),(603,'sales-assistant@itsco.health','sales-bot','sales-assistant@itsco.health','assistant','ACTIVE','Synthetic','Sales Bot',1,1)");
  await db.query("INSERT INTO agencies(id,name,slug,feature_flags) VALUES(2,'Synthetic ITSCO','itsco',JSON_OBJECT()),(6,'Synthetic NLU','nlu',JSON_OBJECT())");
  await db.query("INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES(601,2,1),(602,6,1),(603,2,1),(501,2,1)");
  for(const[id,userId,agencyId,subrole,caps,status]of[[1,601,2,'payroll',['payroll.review'],'active'],[2,602,6,'payroll',['payroll.review'],'active'],[3,603,2,'sales',[],'pending']])await db.execute("INSERT INTO assistant_accounts(id,user_id,agency_id,subrole,status,capabilities_json,schedule_json,privacy_policy_json,group_status,credential_set_at) VALUES (?,?,?,?,?,?,?,?,'ready',UTC_TIMESTAMP(3))",[id,userId,agencyId,subrole,status,JSON.stringify(caps),JSON.stringify({enabled:false,timezone:'America/Denver',weekdays:[1,2,3,4,5],localTime:'07:10'}),'{}']);
  for(const id of [1,2,3]){const account=await service.accountById(id);await db.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=?',[assistantStoredConfigurationHash(account),id]);}
  for(const id of [1,2]){const account=await service.accountById(id);await db.execute("INSERT INTO assistant_verifications(account_id,capability,policy_version,configuration_hash,outcome,build_id,evidence_ref,verified_by_user_id) VALUES (?,'payroll.review',?,?,'PASS','synthetic-build-20261102','synthetic-proof',501)",[id,ASSISTANT_POLICY_VERSION,assistantConfigurationHash(account)]);}
 });
 afterAll(async()=>{if(db)await db.end();state.db=null;if(admin){await admin.query(`DROP DATABASE ${database}`);await admin.end();}vi.unstubAllEnvs();});
 it('applies real migration and preserves existing roles/defaults while adding assistant',async()=>{
  const[[version]]=await db.query('SELECT VERSION() version');expect(version.version).toMatch(/^8\.0\./);
  const[[column]]=await db.query("SELECT COLUMN_TYPE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role'");expect(column.COLUMN_TYPE).toContain("'retained_role'");expect(column.COLUMN_TYPE).toContain("'assistant'");expect(column.COLUMN_DEFAULT).toBe('staff');
  const[[priorityColumn]]=await db.query("SELECT DATA_TYPE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assistant_work_items' AND COLUMN_NAME='priority'");expect(priorityColumn.DATA_TYPE).toBe('smallint');expect(String(priorityColumn.COLUMN_DEFAULT)).toBe('0');const work=await makeWork();const[[priorityRow]]=await db.execute('SELECT priority FROM assistant_work_items WHERE ref=?',[work.workRef]);expect(Number(priorityRow.priority)).toBe(0);
  const[triggers]=await db.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()");expect(triggers).toHaveLength(12);
  const identity=await loadAssistantIdentity(601,{db});expect(identity.account.agencyId).toBe(2);expect(await assertAssistantMembership(identity,{db})).toBe(true);
  const baseline=await service.workspace(603);expect(baseline.identity.capabilities).toEqual([]);expect(baseline.tasks).toEqual([]);
 });
 it('retries assistant schema without duplicating or reopening assignment history',async()=>{
  await db.execute("INSERT INTO agencies(id,name,slug,organization_type) VALUES(7,'Synthetic School','synthetic-school','school')");
  await db.execute("INSERT INTO provider_school_assignments(id,provider_user_id,school_organization_id,day_of_week,is_active,created_at,updated_at) VALUES(77,501,7,'Monday',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
  await db.execute("INSERT INTO client_provider_assignments(id,provider_user_id,organization_id,service_day,is_active,created_at,updated_at) VALUES(88,501,7,'Monday',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
  await db.execute("UPDATE provider_school_assignments SET day_of_week='Friday' WHERE id=77");
  const [before]=await db.query('SELECT id,assignment_id,assignment_kind,day_of_week,valid_from,valid_until,evidence_source FROM provider_school_assignment_periods ORDER BY id');
  for(const name of ['1747_external_assistant_teams.sql','1748_payroll_assistant_review_sources.sql','1749_external_payroll_daily_reports.sql']){
   const raw=await fs.readFile(new URL('../../../../database/migrations/'+name,import.meta.url),'utf8');
   for(const statement of splitSqlStatements(stripSqlLineComments(raw)))await db.query(statement);
  }
  const [after]=await db.query('SELECT id,assignment_id,assignment_kind,day_of_week,valid_from,valid_until,evidence_source FROM provider_school_assignment_periods ORDER BY id');
  expect(after).toEqual(before);
  const [[column]]=await db.query("SELECT COLUMN_TYPE,COLUMN_DEFAULT,IS_NULLABLE,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role'");
  expect(column.COLUMN_DEFAULT).toBe('staff');expect(column.IS_NULLABLE).toBe('NO');expect(column.CHARACTER_SET_NAME).toBe('utf8mb4');expect(column.COLLATION_NAME).toBe(roleCollation);
  expect(column.COLUMN_TYPE).toContain("'retained_role'");expect(column.COLUMN_TYPE).toContain("'assistant'");
  const [[trip]]=await db.query("SELECT COLUMN_DEFAULT,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_mileage_claims' AND COLUMN_NAME='trip_structure'");
  expect(trip.COLUMN_DEFAULT).toBe('unknown');expect(trip.COLLATION_NAME).toBe('utf8mb4_unicode_ci');
 });
 it.each([{kind:'school_assignment',table:'provider_school_assignments',field:'day_of_week',trigger:'payroll_school_assignment_update'},
  {kind:'caseload_assignment',table:'client_provider_assignments',field:'service_day',trigger:'payroll_caseload_assignment_update'}])
 ('keeps trigger coverage while retrying $kind installation',async({kind,table,field,trigger})=>{
  await db.execute("INSERT INTO agencies(id,name,slug,organization_type) VALUES(7,'Synthetic School','synthetic-school','school')");
  if(kind==='school_assignment')await db.execute("INSERT INTO provider_school_assignments(id,provider_user_id,school_organization_id,day_of_week,is_active,created_at,updated_at) VALUES(77,501,7,'Monday',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
  else await db.execute("INSERT INTO client_provider_assignments(id,provider_user_id,organization_id,service_day,is_active,created_at,updated_at) VALUES(77,501,7,'Monday',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
  const [before]=await db.query('SELECT TRIGGER_NAME,ACTION_STATEMENT,CREATED FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME');
  const raw=await fs.readFile(new URL('../../../../database/migrations/1748_payroll_assistant_review_sources.sql',import.meta.url),'utf8');
  expect(raw).not.toMatch(/DROP\s+TRIGGER/i);
  let changed=false;
  for(const statement of splitSqlStatements(stripSqlLineComments(raw))){
   if(statement.startsWith(`CREATE TRIGGER IF NOT EXISTS ${trigger} `)){
    // At this point the old DROP/CREATE implementation had no update trigger.
    await db.execute(`UPDATE ${table} SET ${field}='Friday' WHERE id=77`);changed=true;
   }
   await db.query(statement);
  }
  expect(changed).toBe(true);
  const [after]=await db.query('SELECT TRIGGER_NAME,ACTION_STATEMENT,CREATED FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME');
  expect(after).toEqual(before);
  const [history]=await db.execute('SELECT day_of_week,valid_until FROM provider_school_assignment_periods WHERE assignment_kind=? AND assignment_id=77 ORDER BY id',[kind]);
  expect(history).toHaveLength(2);expect(history[0].day_of_week).toBe('Monday');expect(history[0].valid_until).not.toBeNull();
  expect(history[1]).toMatchObject({day_of_week:'Friday',valid_until:null});
 });
 it.each([{migration:'1747_external_assistant_teams.sql',trigger:'assistant_membership_insert',timing:'BEFORE',table:'user_agencies'},
  {migration:'1748_payroll_assistant_review_sources.sql',trigger:'payroll_school_assignment_insert',timing:'AFTER',table:'provider_school_assignments'}])
 ('refuses mismatching installed trigger $trigger instead of replacing it',async({migration,trigger,timing,table})=>{
  const raw=await fs.readFile(new URL('../../../../database/migrations/'+migration,import.meta.url),'utf8');
  const apply=async()=>{for(const statement of splitSqlStatements(stripSqlLineComments(raw)))await db.query(statement);};
  await db.query(`DROP TRIGGER ${trigger}`);
  await db.query(`CREATE TRIGGER ${trigger} ${timing} INSERT ON ${table} FOR EACH ROW BEGIN SET @synthetic_trigger_seen=1; END`);
  try{
   const [[before]]=await db.execute('SELECT ACTION_STATEMENT,CREATED FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?',[trigger]);
   let failure;try{await apply();}catch(error){failure=error;}
   expect(failure).toMatchObject({code:'ER_BAD_FIELD_ERROR'});expect(failure.message).toContain(`trigger_mismatch_${trigger}`);
   expect(isIgnorableSchemaError(failure)).toBe(false);
   const [[after]]=await db.execute('SELECT ACTION_STATEMENT,CREATED FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?',[trigger]);
   expect(after).toEqual(before);
  }finally{await db.query(`DROP TRIGGER ${trigger}`);await apply();}
 });
 it.each([{change:'formatting',accepted:true},{change:'quoted literal whitespace',accepted:false}])
 ('validates installed trigger $change without an overwrite',async({change,accepted})=>{
  const trigger='assistant_membership_delete',raw=await fs.readFile(new URL('../../../../database/migrations/1747_external_assistant_teams.sql',import.meta.url),'utf8');
  const statements=splitSqlStatements(stripSqlLineComments(raw));
  const definition=statements.find(statement=>statement.startsWith(`CREATE TRIGGER IF NOT EXISTS ${trigger} `));
  const changed=accepted?definition.replace(/\n/g,'\n  '):definition.replace('Disable assistants through','Disable  assistants through');
  expect(changed).not.toBe(definition);
  await db.query(`DROP TRIGGER ${trigger}`);await db.query(changed);
  try{
   const [[before]]=await db.execute('SELECT ACTION_STATEMENT,CREATED FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?',[trigger]);
   let failure;try{for(const statement of statements)await db.query(statement);}catch(error){failure=error;}
   if(accepted)expect(failure).toBeUndefined();
   else{expect(failure).toMatchObject({code:'ER_BAD_FIELD_ERROR'});expect(failure.message).toContain(`trigger_mismatch_${trigger}`);}
   const [[after]]=await db.execute('SELECT ACTION_STATEMENT,CREATED FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?',[trigger]);
   expect(after).toEqual(before);
  }finally{await db.query(`DROP TRIGGER ${trigger}`);for(const statement of statements)await db.query(statement);}
 });
 it('enforces one-agency immutable identities in real database triggers',async()=>{
  await expect(db.execute('INSERT INTO user_agencies(user_id,agency_id) VALUES(601,6)')).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION'});
  await expect(db.execute("UPDATE assistant_accounts SET agency_id=6 WHERE id=1")).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION'});
  await expect(db.execute("UPDATE assistant_accounts SET subrole='billing' WHERE id=1")).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION'});
  await expect(db.execute("UPDATE users SET role='admin' WHERE id=601")).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION'});
  await expect(db.execute('DELETE FROM user_agencies WHERE user_id=601')).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION'});
  expect(await assertAssistantMembership(await loadAssistantIdentity(601,{db}),{db})).toBe(true);
 });
 it('concurrent starts resume one saved lease rather than creating duplicate runs',async()=>{
  const w=await makeWork();const [first,second]=await Promise.all([service.startTask(601,w.workRef),service.startTask(601,w.workRef)]);expect(first.runRef).toBe(second.runRef);expect(first.packet).toEqual(w.packet);
  const[[count]]=await db.query('SELECT COUNT(*) n FROM assistant_runs');expect(Number(count.n)).toBe(1);
  const[[stored]]=await db.query('SELECT packet_ciphertext,mapping_ciphertext FROM assistant_work_items');expect(stored.packet_ciphertext).not.toContain('Synthetic private review packet');expect(stored.mapping_ciphertext).not.toContain('sourceId');
 });
 it('serializes competing different tasks for one account',async()=>{
  const a=await makeWork({sourceId:10}),b=await makeWork({sourceId:11});const results=await Promise.allSettled([service.startTask(601,a.workRef),service.startTask(601,b.workRef)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected').reason.code).toBe('ASSISTANT_ALREADY_WORKING');const[[count]]=await db.query('SELECT COUNT(*) n FROM assistant_runs');expect(Number(count.n)).toBe(1);
 });
 it('recovers an expired lease on the same work item and rejects old-run writes',async()=>{
  const w=await makeWork();const old=await service.startTask(601,w.workRef);await db.execute('UPDATE assistant_runs SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE ref=?',[old.runRef]);const restarted=await service.startTask(601,w.workRef);expect(restarted.runRef).not.toBe(old.runRef);await expect(service.heartbeat(601,old.runRef)).rejects.toMatchObject({code:'RUN_LEASE_EXPIRED'});await expect(service.completeRun(601,old.runRef,payload(w.sourceRevision))).rejects.toMatchObject({code:'RUN_LEASE_EXPIRED'});const[[count]]=await db.query('SELECT COUNT(*) n FROM assistant_work_items');expect(Number(count.n)).toBe(1);
 });
 it('rejects stale source completion and creates no proposal',async()=>{
  const w=await makeWork();const run=await service.startTask(601,w.workRef);revisions.set(10,assistantDigest({changed:true}));await expect(service.completeRun(601,run.runRef,payload(w.sourceRevision))).rejects.toMatchObject({code:'ASSISTANT_SOURCE_CHANGED'});const[[work]]=await db.query('SELECT state FROM assistant_work_items');expect(work.state).toBe('stale');const[[count]]=await db.query('SELECT COUNT(*) n FROM assistant_proposals');expect(Number(count.n)).toBe(0);
 });
 it('concurrent completion and browser retry create exactly one proposal',async()=>{
  const w=await makeWork();const run=await service.startTask(601,w.workRef);const results=await Promise.all([service.completeRun(601,run.runRef,payload(w.sourceRevision)),service.completeRun(601,run.runRef,payload(w.sourceRevision))]);expect(results.every(r=>r.completed)).toBe(true);const retry=await service.completeRun(601,run.runRef,payload(w.sourceRevision));expect(retry.reused).toBe(true);const[[count]]=await db.query('SELECT COUNT(*) n FROM assistant_proposals');expect(Number(count.n)).toBe(1);const[[work]]=await db.query('SELECT state FROM assistant_work_items');expect(work.state).toBe('completed');
 });
 it('keeps a run open when evidence is missing and persists server-bound task version on correction',async()=>{
  const w=await makeWork();const run=await service.startTask(601,w.workRef);expect(run.taskVersion).toBe(ASSISTANT_POLICY_VERSION);
  await expect(service.completeRun(601,run.runRef,{...payload(w.sourceRevision),evidence:{}})).rejects.toMatchObject({code:'REVIEW_EVIDENCE_REQUIRED'});
  const[[before]]=await db.query('SELECT COUNT(*) n FROM assistant_proposals');expect(Number(before.n)).toBe(0);
  await expect(service.completeRun(601,run.runRef,payload(w.sourceRevision))).resolves.toMatchObject({completed:true});
  const[[saved]]=await db.execute('SELECT evidence_ciphertext FROM assistant_runs WHERE ref=?',[run.runRef]);const evidence=decryptFamilyBilling(saved.evidence_ciphertext,`assistant-run:2:${run.runRef}`);expect(evidence.taskVersion).toBe(ASSISTANT_POLICY_VERSION);expect(evidence.accountPolicyRevision).toBe(1);
 });
 it('another agency account cannot start or complete the worker’s task',async()=>{
  const w=await makeWork();await expect(service.startTask(602,w.workRef)).rejects.toMatchObject({code:'TASK_NOT_FOUND'});const run=await service.startTask(601,w.workRef);await expect(service.completeRun(602,run.runRef,payload(w.sourceRevision))).rejects.toMatchObject({code:'RUN_NOT_FOUND'});
 });
 it('owner changes revoke sessions and persist a nonsecret alert atomically',async()=>{
  await db.execute('INSERT INTO auth_session_security(user_id) VALUES (601)');const password='Synthetic-Password-20261102';await service.patchAccount(owner,1,{status:'paused',newPassword:password,reason:'Synthetic rotation and pause test.'});const[[session]]=await db.query('SELECT revoked_at FROM auth_session_security WHERE user_id=601');expect(session.revoked_at).not.toBeNull();const[[revocation]]=await db.query('SELECT reject_issued_before FROM user_auth_revocations WHERE user_id=601');expect(Number(revocation.reject_issued_before)).toBeGreaterThan(0);const[[event]]=await db.query('SELECT changes_json,email_status FROM assistant_change_events');expect(JSON.stringify(event)).not.toContain(password);expect(event.email_status).toBe('pending');const[[user]]=await db.query('SELECT password_hash FROM users WHERE id=601');expect(user.password_hash).toMatch(/^\$2/);
 });
 it('alert retries preserve one in-app notification and complete the existing email event',async()=>{
  await service.patchAccount(owner,1,{status:'paused',reason:'Synthetic delivery retry test.'});const notify=vi.fn(),send=vi.fn().mockResolvedValueOnce({queued:true}).mockResolvedValueOnce({id:'synthetic-message'});expect(await processAssistantAccountAlerts({db,notify,send})).toEqual({sent:0});await db.query('UPDATE assistant_change_events SET next_attempt_at=UTC_TIMESTAMP(3)');expect(await processAssistantAccountAlerts({db,notify,send})).toEqual({sent:1});expect(notify).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(2);expect(await processAssistantAccountAlerts({db,notify,send})).toEqual({sent:0});
 });
 it('prepares current operational sources once and never copies free text into the packet',async()=>{
  await db.execute("INSERT INTO payroll_time_claims(id,agency_id,user_id,status,claim_type,payload_json,suggested_payroll_period_id,updated_at) VALUES(10,2,700,'submitted','indirect_time',?,147,UTC_TIMESTAMP(3))",[JSON.stringify({totalMinutes:45,description:'PRIVATE SYNTHETIC SOURCE TEXT',email:'synthetic-private@example.invalid'})]);
  const live=createAssistantTeamsService({db});const first=await live.prepareAccount(1,{actor:owner}),second=await live.prepareAccount(1,{actor:owner});expect(first.queued).toBe(1);expect(second.queued).toBe(0);expect(second.skipped).toBe(1);const workspace=await live.workspace(601);expect(workspace.tasks).toHaveLength(1);const run=await live.startTask(601,workspace.tasks[0].ref);expect(JSON.stringify(run.packet)).not.toMatch(/PRIVATE|synthetic-private|example.invalid/);expect(run.packet.items[0].submittedMinutes).toBe(45);const[[claim]]=await db.query('SELECT status FROM payroll_time_claims WHERE id=10');expect(claim.status).toBe('submitted');
 });
 it('no-school dry-run omits school entities and creates nothing',async()=>{
  const plan=await provisionAssistantAccounts({actor:owner,agencyIds:[2,6],dryRun:true},db);const serialized=JSON.stringify(plan);expect(serialized).toContain('NO_LINKED_SCHOOLS');const rows=Array.isArray(plan)?plan:plan.plan||plan.accounts||[];expect(rows.filter(r=>r.subrole==='school_support').every(r=>r.skipped==='NO_LINKED_SCHOOLS')).toBe(true);const[[count]]=await db.query('SELECT COUNT(*) n FROM assistant_accounts');expect(Number(count.n)).toBe(3);expect(await service.prepareAccount(3,{actor:owner})).toMatchObject({queued:0,skipped:1});
 });
 it('counts only a current relationship with an active nonarchived school',async()=>{
  await db.query("INSERT INTO agencies(id,name,slug,organization_type,is_active,is_archived) VALUES(700,'Synthetic School','synthetic-school','school',1,0)");
  await db.query('INSERT INTO agency_schools(agency_id,school_organization_id,is_active) VALUES(2,700,1)');
  expect(await countAssistantSchools(2,db)).toBe(1);
  await db.query('UPDATE agencies SET is_active=0 WHERE id=700');expect(await countAssistantSchools(2,db)).toBe(0);
  await db.query('UPDATE agencies SET is_active=1,is_archived=1 WHERE id=700');expect(await countAssistantSchools(2,db)).toBe(0);
  await db.query('UPDATE agencies SET is_archived=0 WHERE id=700');await db.query('UPDATE agency_schools SET is_active=0 WHERE school_organization_id=700');expect(await countAssistantSchools(2,db)).toBe(0);
 });
 it('continues an empty filtered clinical page using its cursor and deduplicates preparation requests',async()=>{
  await db.query("UPDATE agencies SET feature_flags=JSON_OBJECT('medicalBillingEnabled',TRUE) WHERE id=2");
  await db.query("INSERT INTO users(id,email,role,status,is_assistant_account) VALUES(604,'clinical-assistant@itsco.health','assistant','ACTIVE',1)");await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(604,2)');const privacy={enabled:true,approved:true,sampleReviewPassed:true,revision:'synthetic-approved-v1',externalService:'Synthetic processor',baaReference:'synthetic-baa-reference',sampleReviewReference:'synthetic-sample-review'};
  await db.execute("INSERT INTO assistant_accounts(id,user_id,agency_id,subrole,status,capabilities_json,schedule_json,privacy_policy_json,group_status,credential_set_at,baa_status) VALUES(4,604,2,'clinical','active',?,? ,?,'ready',UTC_TIMESTAMP(3),'verified')",[JSON.stringify(['clinical.review']),JSON.stringify({enabled:false}),JSON.stringify(privacy)]);
  const clinicalAccount=await service.accountById(4);await db.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=4',[assistantStoredConfigurationHash(clinicalAccount)]);
  await service.verifyCapability(owner,4,{capability:'clinical.review',outcome:'PASS',buildId:'synthetic-build-20261102',evidenceRef:'synthetic-clinical-proof'});
  const inventory=vi.fn().mockResolvedValueOnce({charts:[],nextCursor:40}).mockResolvedValueOnce({charts:[],nextCursor:null}),clinicalPacket=vi.fn(),teams=createAssistantTeamsService({db,inventory,clinicalPacket});
  const [one,two]=await Promise.all([queueAssistantPreparation({accountId:4,actor:owner,slot:'synthetic-empty-page',db,teams}),queueAssistantPreparation({accountId:4,actor:owner,slot:'synthetic-empty-page',db,teams})]);expect(one.preparationRef).toBe(two.preparationRef);
  expect(await processAssistantPreparationJobs({db,teams,maxBatches:1})).toMatchObject({batches:1,queued:0,blocked:0});let [[job]]=await db.query('SELECT state,source_cursor FROM assistant_preparation_jobs');expect(job).toMatchObject({state:'queued',source_cursor:40});
  expect(await processAssistantPreparationJobs({db,teams,maxBatches:1})).toMatchObject({batches:1,queued:0,blocked:0});[[job]]=await db.query('SELECT state,source_cursor FROM assistant_preparation_jobs');expect(job.state).toBe('completed');expect(inventory.mock.calls.map(([arg])=>arg.afterId)).toEqual([0,40]);expect(clinicalPacket).not.toHaveBeenCalled();await db.query("UPDATE agencies SET feature_flags=JSON_OBJECT('medicalBillingEnabled',FALSE) WHERE id=2");await expect(teams.prepareAccount(4,{actor:owner})).rejects.toMatchObject({code:'AGENCY_SERVICE_DISABLED'});expect(inventory).toHaveBeenCalledTimes(2);
 });
 it('completes a verified clinical workflow through locked feature-aware account reads',async()=>{
  await db.query("UPDATE agencies SET feature_flags=JSON_OBJECT('medicalBillingEnabled',TRUE) WHERE id=2");
  await db.query("INSERT INTO users(id,email,role,status,is_assistant_account) VALUES(604,'clinical-assistant@itsco.health','assistant','ACTIVE',1)");await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(604,2)');const privacy={enabled:true,approved:true,sampleReviewPassed:true,revision:'synthetic-approved-v1',externalService:'Synthetic processor',baaReference:'synthetic-baa-reference',sampleReviewReference:'synthetic-sample-review'};
  await db.execute("INSERT INTO assistant_accounts(id,user_id,agency_id,subrole,status,capabilities_json,schedule_json,privacy_policy_json,group_status,credential_set_at,baa_status) VALUES(4,604,2,'clinical','active',?,?,?,'ready',UTC_TIMESTAMP(3),'verified')",[JSON.stringify(['clinical.review']),JSON.stringify({enabled:false}),JSON.stringify(privacy)]);
  const clinicalAccount=await service.accountById(4);await db.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=4',[assistantStoredConfigurationHash(clinicalAccount)]);await service.verifyCapability(owner,4,{capability:'clinical.review',outcome:'PASS',buildId:'synthetic-build-20261102',evidenceRef:'synthetic-positive-clinical-proof'});
  const sourceRef=ref(),sourceRevision=assistantDigest({fixture:'synthetic-signed-clinical-source',revision:1}),packet={reviewKind:'clinical',notes:[{sourceRef,summary:'Screened synthetic documentation evidence.'}],humanReviewRequired:true};const teams=createAssistantTeamsService({db,inventory:async()=>({charts:[{clientId:99}],nextCursor:null}),clinicalRevision:async()=>sourceRevision,clinicalPacket:async()=>({status:'ready',packet,mapping:{agencyId:2,clientId:99,sources:{[sourceRef]:{kind:'note',id:12}}},sourceRevision})});
  expect(await teams.prepareAccount(4,{actor:owner})).toMatchObject({queued:1});const workspace=await teams.workspace(604);expect(workspace.tasks).toHaveLength(1);const run=await teams.startTask(604,workspace.tasks[0].ref);expect(run.packet).toEqual(packet);expect(await teams.heartbeat(604,run.runRef)).toMatchObject({renewed:true});const result=payload(run.sourceRevision);result.findings[0].sourceRefs=[sourceRef];expect(await teams.completeRun(604,run.runRef,result)).toMatchObject({completed:true,outcome:'PASS'});const[[saved]]=await db.execute('SELECT outcome FROM assistant_runs WHERE ref=?',[run.runRef]);expect(saved.outcome).toBe('PASS');const[[proposal]]=await db.query('SELECT COUNT(*) n FROM assistant_proposals WHERE account_id=4');expect(Number(proposal.n)).toBe(1);
 });
 it('rejects an out-of-band schedule change even when the capability proof still matches',async()=>{
  const w=await makeWork();await db.execute("UPDATE assistant_accounts SET schedule_json=JSON_OBJECT('enabled',FALSE,'timezone','America/Denver','weekdays',JSON_ARRAY(1,2,3,4,5),'localTime','11:00') WHERE id=1");await expect(service.startTask(601,w.workRef)).rejects.toMatchObject({status:409});const[[runs]]=await db.query('SELECT COUNT(*) n FROM assistant_runs');expect(Number(runs.n)).toBe(0);
 });
 it('accepts an unchanged verified configuration despite a different JSON key order',async()=>{
  const privacy={sampleReviewReference:'fixture-sample',baaReference:'fixture-baa',externalService:'Synthetic processor',revision:'fixture-v1',sampleReviewPassed:true,approved:true,enabled:true};await service.patchAccount(owner,1,{status:'pending',privacyPolicy:privacy,reason:'Prepare approved synthetic policy.'});await service.verifyCapability(owner,1,{capability:'payroll.review',outcome:'PASS',buildId:'synthetic-build-20261102',evidenceRef:'synthetic-policy-proof'});const reversed=Object.fromEntries(Object.entries(privacy).reverse());const account=await service.patchAccount(owner,1,{status:'active',privacyPolicy:reversed,reason:'Activate identical policy with reordered JSON.'});expect(account.status).toBe('active');
 });
 it('a failed verification pauses the account without leaving a false configuration-drift baseline',async()=>{
  await service.verifyCapability(owner,1,{capability:'payroll.review',outcome:'FAIL',buildId:'synthetic-build-20261102',evidenceRef:'synthetic-failed-proof'});const account=await service.accountById(1);expect(account.status).toBe('paused');expect(account.configuration_fingerprint).toBe(assistantStoredConfigurationHash(account));
 });
 it('a verified capability cannot activate after its release configuration changes',async()=>{
  await service.patchAccount(owner,1,{status:'pending',reason:'Prepare configuration verification.'});await service.verifyCapability(owner,1,{capability:'payroll.review',outcome:'PASS',buildId:'synthetic-build-20261102',evidenceRef:'synthetic-test-evidence'});await expect(service.patchAccount(owner,1,{status:'active',privacyPolicy:{revision:'changed-after-test'},reason:'Changed policy after verification.'})).rejects.toMatchObject({code:'CAPABILITY_NOT_VERIFIED'});const[[account]]=await db.query('SELECT status FROM assistant_accounts WHERE id=1');expect(account.status).toBe('pending');
 });
 async function enablePayroll(caps){await service.patchAccount(owner,1,{status:'pending',capabilities:caps,reason:'Synthetic payroll capability verification.'});for(const capability of caps)await service.verifyCapability(owner,1,{capability,outcome:'PASS',buildId:'synthetic-payroll-build',evidenceRef:'synthetic-isolated-payroll-proof'});await service.patchAccount(owner,1,{status:'active',reason:'Activate verified synthetic payroll duties.'});}
 async function mileageWork(){
  await enablePayroll(['payroll.review','payroll.approve_school_mileage','payroll.report_to_team']);
  await db.query("INSERT INTO agencies(id,name,slug,organization_type) VALUES(800,'Synthetic school','synthetic-school','school')");await db.query("INSERT INTO users(id,email,role,status,first_name,last_name,credential) VALUES(700,'private-canary@example.invalid','provider','ACTIVE_EMPLOYEE','PRIVATE_CANARY','NAME','LPCC')");await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(700,2)');
  await db.query("INSERT INTO payroll_periods(id,agency_id,period_start,period_end,status) VALUES(7,2,'2026-11-01','2026-11-15','draft')");await db.query("INSERT INTO office_locations VALUES(4,'America/Denver')");await db.query('INSERT INTO agency_schools(agency_id,school_organization_id) VALUES(2,800)');await db.query('INSERT INTO agency_mileage_rates VALUES(1,2,1,.50)');
  await db.query("INSERT INTO provider_school_assignments(id,provider_user_id,school_organization_id,day_of_week,is_active,created_at,updated_at) VALUES(1,700,800,'Monday',1,'2026-10-01','2026-10-01')");
  // A retained historical fixture is explicit, not backfilled from the current membership.
  await db.query("UPDATE provider_school_assignment_periods SET valid_from='2026-10-01' WHERE assignment_id=1");
  const claim=await Mileage.create({agencyId:2,userId:700,driveDate:'2026-11-02',schoolOrganizationId:800,officeLocationId:4,tripStructure:'single_school_round_trip',eligibleMiles:12,miles:12,tierLevel:1,suggestedPayrollPeriodId:7,notes:'PRIVATE_CANARY narrative'});
  const source=await readPayrollReview({agencyId:2,kind:'payroll_school_mileage',sourceId:claim.id},db);expect(source.evaluation).toMatchObject({eligible:true});
  const prepared=payrollReviewPacket(source),workRef=ref();await db.execute("INSERT INTO assistant_work_items(ref,account_id,agency_id,task_kind,title,source_kind,source_id,source_hash,packet_ciphertext,mapping_ciphertext,due_at) VALUES(?,1,2,'payroll.review','Synthetic school mileage','payroll_school_mileage',?,?,?,?,UTC_TIMESTAMP(3))",[workRef,claim.id,source.sourceRevision,encryptFamilyBilling(prepared.packet,`assistant-work:2:1:${workRef}:packet`),encryptFamilyBilling(prepared.mapping,`assistant-work:2:1:${workRef}:mapping`)]);
  const run=await service.startTask(601,workRef);return {claim,run,staffRef:prepared.packet.items[0].staffRef};
 }
 function approvalService({afterWrite,notify=vi.fn()}={}){const handler=async(req,res)=>{const authority=scopedPayrollCommand(req);expect(authority).toMatchObject({agencyId:2,kind:'school_mileage'});const claim=await Mileage.approve({db:authority.db,requireSubmitted:true,id:authority.claimId,approverUserId:req.user.id,targetPayrollPeriodId:req.body.targetPayrollPeriodId,tierLevel:1,ratePerMile:.50,appliedAmount:6});if(afterWrite)throw Error('synthetic transactional failure');res.json({claim});};return Object.assign(createAssistantPayrollApproval({db,notify,handlers:async()=>({patchMileageClaim:handler})}),{notify});}
 it('migration tracks assignment changes without treating capacity edits as reassignments',async()=>{await db.query("INSERT INTO provider_school_assignments VALUES(1,700,800,'Monday',1,4,'2026-10-01','2026-10-01')");await db.query('UPDATE provider_school_assignments SET slots_total=8 WHERE id=1');let[[r]]=await db.query('SELECT COUNT(*) n FROM provider_school_assignment_periods');expect(Number(r.n)).toBe(1);await db.query("UPDATE provider_school_assignments SET day_of_week='Tuesday' WHERE id=1");[[r]]=await db.query('SELECT COUNT(*) n,SUM(valid_until IS NULL) current_n FROM provider_school_assignment_periods');expect(Number(r.n)).toBe(2);expect(Number(r.current_n)).toBe(1);await db.query('DELETE FROM provider_school_assignments WHERE id=1');[[r]]=await db.query('SELECT SUM(valid_until IS NULL) n FROM provider_school_assignment_periods');expect(Number(r.n)).toBe(0);});
 it('browser review requires provider-details access and rejects private field overrides',async()=>{const {run,staffRef}=await mileageWork(),approvals=approvalService();const input={sourceRevision:run.sourceRevision,evidence:payload(run.sourceRevision).evidence};await expect(approvals.approve(601,run.runRef,input)).rejects.toMatchObject({code:'PROVIDER_FACTS_REVIEW_REQUIRED'});await expect(approvals.providerDetails(602,run.runRef,staffRef)).rejects.toMatchObject({status:404});const basics=await approvals.providerDetails(601,run.runRef,staffRef);expect(basics.credential).toBe('LPCC');expect(JSON.stringify({run,basics})).not.toMatch(/PRIVATE_CANARY|private-canary|700|800/);await expect(approvals.approve(601,run.runRef,{...input,appliedAmount:100})).rejects.toMatchObject({status:400});});
 it('commits one reviewed approval and one evidence record under concurrent retries, without running payroll',async()=>{const {run,staffRef,claim}=await mileageWork(),approvals=approvalService();await approvals.providerDetails(601,run.runRef,staffRef);const input={sourceRevision:run.sourceRevision,evidence:payload(run.sourceRevision).evidence};const results=await Promise.all([approvals.approve(601,run.runRef,input),approvals.approve(601,run.runRef,input)]);expect(results.every(r=>r.approved)).toBe(true);expect(approvals.notify).toHaveBeenCalledTimes(1);const[[saved]]=await db.query('SELECT status,approved_by_user_id,applied_amount,notes FROM payroll_mileage_claims WHERE id='+claim.id);expect(saved).toMatchObject({status:'approved',approved_by_user_id:601,applied_amount:'6.00',notes:'PRIVATE_CANARY narrative'});const[[count]]=await db.query('SELECT COUNT(*) n FROM assistant_proposals');expect(Number(count.n)).toBe(1);const[[period]]=await db.query('SELECT status FROM payroll_periods WHERE id=7');expect(period.status).toBe('draft');});
 it('rejects changed sources and rolls back a failed approval before any evidence is committed',async()=>{const {run,staffRef,claim}=await mileageWork();let approvals=approvalService();await approvals.providerDetails(601,run.runRef,staffRef);await db.query("UPDATE payroll_mileage_claims SET notes='PRIVATE_CHANGED' WHERE id="+claim.id);await expect(approvals.approve(601,run.runRef,{sourceRevision:run.sourceRevision,evidence:payload(run.sourceRevision).evidence})).rejects.toMatchObject({code:'ASSISTANT_SOURCE_CHANGED'});await db.query("UPDATE payroll_mileage_claims SET notes='PRIVATE_CANARY narrative' WHERE id="+claim.id);const source=await readPayrollReview({agencyId:2,kind:'payroll_school_mileage',sourceId:claim.id},db);await db.execute('UPDATE assistant_runs SET source_hash=? WHERE ref=?',[source.sourceRevision,run.runRef]);await db.execute('UPDATE assistant_work_items SET source_hash=?',[source.sourceRevision]);await approvals.providerDetails(601,run.runRef,staffRef);approvals=approvalService({afterWrite:true});await expect(approvals.approve(601,run.runRef,{sourceRevision:source.sourceRevision,evidence:payload(source.sourceRevision).evidence})).rejects.toThrow('synthetic transactional failure');const[[saved]]=await db.query('SELECT status FROM payroll_mileage_claims WHERE id='+claim.id);expect(saved.status).toBe('submitted');const[[p]]=await db.query('SELECT COUNT(*) n FROM assistant_proposals');expect(Number(p.n)).toBe(0);});
 it('daily report records actual approvals and waits for the external send action; retries do not duplicate email',async()=>{const {run,staffRef}=await mileageWork(),approvals=approvalService();await approvals.providerDetails(601,run.runRef,staffRef);await approvals.approve(601,run.runRef,{sourceRevision:run.sourceRevision,evidence:payload(run.sourceRevision).evidence});const reports=createAssistantPayrollReports({db});const preview=await reports.preview(601);expect(preview.report).toMatchObject({reviewed:1,schoolMileageApproved:1});expect(JSON.stringify(preview)).not.toMatch(/PRIVATE_CANARY|private-canary/);const send=vi.fn().mockResolvedValue({id:'synthetic-gmail-id',internetMessageId:'<synthetic@example.invalid>',communicationId:42});expect(await deliverApprovedPayrollReports({db,send})).toEqual({sent:0});expect(send).not.toHaveBeenCalled();await expect(reports.send(601,{reportRef:preview.reportRef,sourceRevision:preview.sourceRevision,to:'bad@example.invalid'})).rejects.toMatchObject({status:400});await reports.send(601,{reportRef:preview.reportRef,sourceRevision:preview.sourceRevision});await db.query("INSERT INTO email_sender_identities VALUES(8,2,'payroll',1,'payroll@example.invalid'),(9,6,'payroll',1,'other@example.invalid')");await db.query("INSERT INTO communication_inboxes VALUES(8,2,'payroll','shared',1,'payroll@example.invalid',8),(9,6,'payroll','shared',1,'other@example.invalid',9)");expect(await deliverApprovedPayrollReports({db,send})).toEqual({sent:1});expect(send.mock.calls[0][0].to).toBe('payroll@example.invalid');expect(await deliverApprovedPayrollReports({db,send})).toEqual({sent:0});expect(send).toHaveBeenCalledTimes(1);});
 it('supervision history includes all saved tiers and excludes group hours from individual windows',async()=>{await db.query("INSERT INTO users(id,email,role,status) VALUES(700,'synthetic@example.invalid','provider','ACTIVE_EMPLOYEE')");await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(700,2)');await db.query("UPDATE agencies SET supervision_policy_json=JSON_OBJECT('requiredIndividualHours',50,'requiredGroupHours',50) WHERE id=2");await db.query("INSERT INTO supervision_accounts VALUES(1,2,700,51,55,UTC_TIMESTAMP())");await db.query("INSERT INTO payroll_periods(id,agency_id,period_start,period_end,status) VALUES(7,2,'2026-11-01','2026-11-15','draft')");await db.query("INSERT INTO payroll_summaries VALUES(1,2,700,7,20,20,JSON_OBJECT('__tier',JSON_OBJECT('tierLevel',1)),UTC_TIMESTAMP())");await db.query("INSERT INTO supervision_sessions VALUES(1,2,'individual',999,700,'2026-11-02 17:00:00','FINALIZED',UTC_TIMESTAMP()),(2,2,'group',999,NULL,'2026-11-02 18:00:00','FINALIZED',UTC_TIMESTAMP())");await db.query('INSERT INTO supervision_session_attendance_rollups VALUES(1,1,700,2400,1,NULL,1,UTC_TIMESTAMP()),(2,2,700,7200,1,NULL,1,UTC_TIMESTAMP())');await db.query('INSERT INTO supervision_session_attendees VALUES(2,700,1)');const review=await readSupervisionHistory({agencyId:2,userId:700,now:new Date('2026-11-02T23:00:00Z')},db);expect(review.facts.windows.monthIndividualMinutes).toBe(40);expect(review.facts.recordedTotals.individualHours).toBe(51);expect(review.facts.sessionHistory).toHaveLength(2);expect(review.facts.windows.flags).toEqual(expect.arrayContaining(['INDIVIDUAL_PERIOD_FREQUENCY_EXCEEDED','RECORDED_INDIVIDUAL_REQUIREMENT_EXCEEDED']));await expect(readSupervisionHistory({agencyId:6,userId:700},db)).rejects.toMatchObject({status:403});});

 it('never reports a completed exception-only review as a financial approval',async()=>{const {run,staffRef}=await mileageWork(),approvals=approvalService();await approvals.providerDetails(601,run.runRef,staffRef);await service.completeRun(601,run.runRef,{...payload(run.sourceRevision),outcome:'BLOCKED'});await expect(approvals.approve(601,run.runRef,{sourceRevision:run.sourceRevision,evidence:payload(run.sourceRevision).evidence})).rejects.toMatchObject({code:'PAYROLL_RUN_ALREADY_COMPLETED'});const[[claim]]=await db.query('SELECT status FROM payroll_mileage_claims');expect(claim.status).toBe('submitted');});
 it('an uncertain mail transport is retained for human checking rather than resent',async()=>{await enablePayroll(['payroll.review','payroll.report_to_team']);await db.query("INSERT INTO email_sender_identities VALUES(8,2,'payroll',1,'payroll@example.invalid')");await db.query("INSERT INTO communication_inboxes VALUES(8,2,'payroll','shared',1,'payroll@example.invalid',8)");const reports=createAssistantPayrollReports({db}),preview=await reports.preview(601);await reports.send(601,{reportRef:preview.reportRef,sourceRevision:preview.sourceRevision});const send=vi.fn().mockRejectedValue(new Error('synthetic lost transport acknowledgement'));expect(await deliverApprovedPayrollReports({db,send})).toEqual({sent:0});expect(await deliverApprovedPayrollReports({db,send})).toEqual({sent:0});expect(send).toHaveBeenCalledTimes(1);const[[saved]]=await db.query('SELECT status FROM assistant_payroll_reports');expect(saved.status).toBe('delivery_unknown');});
 it('captures school caseload assignment evidence without retaining client identity or unrelated program assignments',async()=>{await db.query("INSERT INTO agencies(id,name,slug,organization_type) VALUES(800,'Synthetic school','fixture-school','school'),(801,'Synthetic program','fixture-program','program')");await db.query("INSERT INTO client_provider_assignments VALUES(1,700,800,'Monday',1,'2026-10-01','2026-10-01'),(2,700,801,'Monday',1,'2026-10-01','2026-10-01')");let[[r]]=await db.query("SELECT COUNT(*) n FROM provider_school_assignment_periods WHERE assignment_kind='caseload_assignment'");expect(Number(r.n)).toBe(1);await db.query("UPDATE client_provider_assignments SET service_day='Tuesday' WHERE id=1");[[r]]=await db.query("SELECT COUNT(*) n,SUM(valid_until IS NULL) active_n FROM provider_school_assignment_periods WHERE assignment_kind='caseload_assignment'");expect(Number(r.n)).toBe(2);expect(Number(r.active_n)).toBe(1);await db.query('DELETE FROM client_provider_assignments WHERE id=1');[[r]]=await db.query("SELECT SUM(valid_until IS NULL) active_n FROM provider_school_assignment_periods WHERE assignment_kind='caseload_assignment'");expect(Number(r.active_n)).toBe(0);const[columns]=await db.query("SHOW COLUMNS FROM provider_school_assignment_periods");expect(columns.map(c=>c.Field)).not.toContain('client_id');});

});
