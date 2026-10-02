import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
vi.mock('../familyLedger/senders.js',()=>({requireReadySender:vi.fn(async()=>({id:6,from_email:'billing@tenant.test'}))}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn(async()=>({id:'synthetic-gmail-id',communicationId:77}))}));
const enabled=process.env.GUARDIAN_MYSQL_TEST==='1';
let db,pool,shared,appointments,notifications;
const databaseName=`guardian_access_test_${process.pid}`;
describe.skipIf(!enabled)('isolated MySQL guardian workflows',()=>{
 beforeAll(async()=>{
  Object.assign(process.env,{SKIP_DB_CONNECT:'1',DB_HOST:'127.0.0.1',DB_PORT:'33479',DB_NAME:databaseName,DB_USER:databaseName,DB_PASSWORD:'synthetic-test-only',DB_CONNECTION_LIMIT:'4',FAMILY_BILLING_ENCRYPTION_KEY_BASE64:Buffer.alloc(32,13).toString('base64'),FRONTEND_URL:'https://portal.example.test'});
  db=await mysql.createConnection({host:'127.0.0.1',port:33479,user:'root',password:'',multipleStatements:true});
  await db.query(`CREATE DATABASE ${databaseName}; CREATE USER '${databaseName}'@'localhost' IDENTIFIED BY 'synthetic-test-only'; GRANT ALL ON ${databaseName}.* TO '${databaseName}'@'localhost'; USE ${databaseName};`);
  await db.query(`
   CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(100),portal_url VARCHAR(100),logo_url VARCHAR(100),organization_type VARCHAR(30));
   CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(100),last_name VARCHAR(100),email VARCHAR(200),status VARCHAR(30),role VARCHAR(30));
   CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,full_name VARCHAR(100),initials VARCHAR(10),date_of_birth DATE,grade VARCHAR(10),status VARCHAR(30),document_status VARCHAR(30),submission_date DATETIME,client_type VARCHAR(30),guardian_portal_enabled BOOLEAN,provider_id INT,billing_insurance_payload TEXT,primary_insurer_name VARCHAR(100));
   CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled BOOLEAN,relationship_type VARCHAR(30),relationship_title VARCHAR(100),permissions_json JSON,PRIMARY KEY(client_id,guardian_user_id));
   CREATE TABLE client_provider_assignments(id INT PRIMARY KEY,client_id INT,organization_id INT,provider_user_id INT,is_active BOOLEAN);
   CREATE TABLE guardian_clinical_grants(agency_id INT,client_id INT,guardian_user_id INT,access_level VARCHAR(20),medical_rights_verified BOOLEAN,consent_basis VARCHAR(50),scopes_json JSON,review_due_date DATE,revoked_at DATETIME);
   CREATE TABLE chat_threads(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,organization_id INT,thread_type VARCHAR(30),name VARCHAR(100));
   CREATE TABLE chat_thread_participants(thread_id INT,user_id INT,PRIMARY KEY(thread_id,user_id));
   CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,start_at DATETIME,end_at DATETIME,status VARCHAR(40),modality VARCHAR(20),source_timezone VARCHAR(40),cancellation_reason TEXT,canceled_by_user_id INT);
   CREATE TABLE appointment_participants(id INT PRIMARY KEY,appointment_id INT,client_id INT);
   CREATE TABLE notifications(id INT AUTO_INCREMENT PRIMARY KEY,type VARCHAR(80),severity VARCHAR(20),title VARCHAR(255),message TEXT,user_id INT,agency_id INT,related_entity_type VARCHAR(50),related_entity_id INT,actor_user_id INT,actor_source VARCHAR(80));
   CREATE TABLE client_billing_payers(agency_id INT,client_id INT,guardian_user_id INT,status VARCHAR(20));
   CREATE TABLE family_billing_audit(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,actor_user_id INT,client_id INT,action VARCHAR(100),object_id INT);
   CREATE TABLE family_statement_shares(agency_id INT,client_id INT,guardian_user_id INT,active BOOLEAN);
   CREATE TABLE family_receivable_allocations(id INT PRIMARY KEY,receivable_id INT,payer_user_id INT,amount_cents INT,paid_cents INT,agency_id INT);
   INSERT INTO agencies VALUES(2,'Synthetic Clinic','clinic','clinic',NULL,'agency'),(3,'Other Clinic','other','other',NULL,'agency');
   INSERT INTO users VALUES(1,'Parent','One','one@example.test','ACTIVE_EMPLOYEE','client_guardian'),(2,'Parent','Two','two@example.test','active','client_guardian'),(9,'Assigned','Provider','provider@example.test','ACTIVE_EMPLOYEE','provider'),(10,'Other','Provider','other@example.test','active','provider');
   INSERT INTO clients(id,agency_id,organization_id,full_name,client_type,guardian_portal_enabled,provider_id,date_of_birth) VALUES(8,2,2,'Synthetic Child','clinical',1,9,'2020-01-01'),(88,3,3,'Other Child','clinical',1,10,'2020-01-01');
   INSERT INTO client_guardians VALUES(8,1,1,'guardian','Parent',JSON_OBJECT()),(8,2,1,'guardian','Parent',JSON_OBJECT());
   INSERT INTO guardian_clinical_grants VALUES(2,8,1,'full',1,'legal_representative','["clinical_messages","session_frequency"]','2099-01-01',NULL),(2,8,2,'full',1,'legal_representative','["clinical_messages","session_frequency"]','2099-01-01',NULL);
   INSERT INTO appointments VALUES(40,2,9,'2030-01-01 16:00:00','2030-01-01 17:00:00','scheduled','VIDEO','America/Denver',NULL,NULL);
   INSERT INTO appointment_participants VALUES(1,40,8);
   INSERT INTO client_billing_payers VALUES(2,8,1,'active'),(2,8,2,'active');
   INSERT INTO family_receivable_allocations VALUES(1,60,1,4000,0,2);
  `);
  for(const file of ['1518_guardian_shared_conversations.sql','1519_guardian_appointment_requests.sql','1520_guardian_shared_billing.sql'])await db.query(await fs.readFile(new URL('../../../../database/migrations/'+file,import.meta.url),'utf8'));
  ({default:pool}=await import('../../config/database.js'));
  shared=await import('../guardianSharedMessages.service.js');appointments=await import('../guardianAppointments.service.js');notifications=await import('../familyLedger/balanceNotifications.js');
 },30000);
 afterAll(async()=>{if(pool)await pool.end();if(db){await db.query(`DROP DATABASE ${databaseName}; DROP USER '${databaseName}'@'localhost'`);await db.end();}});
 it('concurrent opens create one child thread with both parents and the active provider',async()=>{
  const results=await Promise.all([1,2,9].map(userId=>shared.ensureSharedChildThread({clientId:8,agencyId:2,userId})));
  expect(new Set(results.map(r=>r.threadId)).size).toBe(1);
  const [rows]=await db.query('SELECT user_id FROM chat_thread_participants ORDER BY user_id');expect(rows.map(r=>r.user_id)).toEqual([1,2,9]);
  await expect(shared.ensureSharedChildThread({clientId:8,agencyId:3,userId:1})).rejects.toMatchObject({status:404});
 });
 it('revoking a clinical grant removes access without removing message history',async()=>{
  await db.query('UPDATE guardian_clinical_grants SET revoked_at=NOW() WHERE guardian_user_id=2');
  await expect(shared.assertSharedChildThreadAccess(2,1)).rejects.toMatchObject({status:403});
  await shared.assertSharedChildThreadAccess(9,1);
  const [rows]=await db.query('SELECT user_id FROM chat_thread_participants ORDER BY user_id');expect(rows.map(r=>r.user_id)).toEqual([1,9]);
  await db.query('UPDATE guardian_clinical_grants SET revoked_at=NULL WHERE guardian_user_id=2');
 });
 it('a parent request is visible to the other parent but does not cancel the appointment',async()=>{
  await appointments.requestGuardianAppointmentChange({userId:1,clientId:8,appointmentId:40,type:'cancel',reason:'School event'});
  const rows=await appointments.listGuardianAppointments({userId:2,clientId:8});
  expect(rows[0]).toMatchObject({status:'scheduled',requests:[{requestedBy:'Parent One',reason:'School event',status:'pending'}]});
  const [[notification]]=await db.query('SELECT user_id FROM notifications');expect(notification.user_id).toBe(9);
  await expect(appointments.requestGuardianAppointmentChange({userId:2,clientId:8,appointmentId:40,type:'cancel',reason:'Same request'})).rejects.toMatchObject({status:409});
 });
 it('a different provider cannot decide; assigned provider decline records actor and reason',async()=>{
  await expect(appointments.declineGuardianAppointmentRequest({appointmentId:40,requestId:1,userId:10,reason:'No'})).rejects.toMatchObject({status:403});
  await appointments.declineGuardianAppointmentRequest({appointmentId:40,requestId:1,userId:9,reason:'Please discuss another time first'});
  expect((await appointments.listGuardianAppointments({userId:1,clientId:8}))[0].requests[0]).toMatchObject({status:'declined',decidedBy:'Assigned Provider',decisionReason:'Please discuss another time first'});
 });
 it('only newly queued balances reach both authorized shared-billing parents, once each',async()=>{
  await db.query('INSERT INTO guardian_portal_policies(agency_id,client_id,shared_billing) VALUES(2,8,1)');
  await db.query('DELETE FROM client_billing_payers WHERE guardian_user_id=2');
  const {requireStatementAccess,requireResponsiblePayer}=await import('../familyBillingPolicy.service.js');
  await requireStatementAccess(2,8,2);await expect(requireResponsiblePayer(2,8,2)).rejects.toMatchObject({status:403});
  await notifications.queueBalanceNotifications({agencyId:2,clientId:8,receivableId:60});await notifications.queueBalanceNotifications({agencyId:2,clientId:8,receivableId:60});
  const [rows]=await db.query('SELECT guardian_user_id,status FROM family_balance_notifications ORDER BY guardian_user_id');expect(rows).toEqual([{guardian_user_id:1,status:'pending'},{guardian_user_id:2,status:'pending'}]);
 });
 it('payment proposals are private, validated, and do not authorize charges',async()=>{
  const {saveGuardianPaymentPreference,guardianPaymentPreference}=await import('../familyLedger/guardianPreferences.js');
  await saveGuardianPaymentPreference({agencyId:2,clientId:8,userId:2,arrangement:'part',percent:40,notes:'Discuss with the other parent'});
  expect(await guardianPaymentPreference({agencyId:2,clientId:8,userId:2})).toMatchObject({arrangement:'part',percent:40,status:'proposed'});
  expect(await guardianPaymentPreference({agencyId:2,clientId:8,userId:1})).toBeNull();
  await expect(saveGuardianPaymentPreference({agencyId:3,clientId:8,userId:2,arrangement:'all'})).rejects.toMatchObject({status:403});
 });
});
