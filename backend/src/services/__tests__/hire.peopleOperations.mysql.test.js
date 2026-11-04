/** Real local schema/claims only. No email transport or real employee records. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({pool:null,storage:0}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.pool.execute(...args),getConnection:()=>m.pool.getConnection()},onTableWrite:vi.fn()}));
vi.mock('../workspaceRelayConfig.js',()=>({relaySelected:()=>true}));
vi.mock('../workspaceRelaySender.js',()=>({verifyWorkspaceRelaySender:async()=>{}}));
vi.mock('../storage.service.js',()=>({default:{readObject:async()=>Buffer.from('synthetic-original'),saveAdminDoc:async()=>({relativePath:`synthetic/receipt-${++m.storage}.pdf`})}}));
import {savePrehireDocumentReceipt} from '../prehireSignedReceipt.service.js';
import {queuePeopleOperationsSubmission,createPeopleOperationsSubmissionWorker,assertPeopleOperationsSubmissionRecipient,savePeopleOperationsNotificationSettings,peopleOperationsSubmissionSource} from '../peopleOperationsSubmissionNotifications.service.js';
const schema=`codex_peopleops_${process.pid}_${Date.now()}`;
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('PeopleOps real migration and future-only claims',()=>{
 let admin,pool,migration,d;
 const runMigration=async()=>{for(const statement of splitSqlStatements(migration))await pool.query(statement);};
 beforeAll(async()=>{
  const options={host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:'',timezone:'+00:00'};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${schema}`);pool=mysql.createPool({...options,database:schema,connectionLimit:6});m.pool=pool;pool.on('connection',connection=>connection.query("SET time_zone='+00:00'"));
  for(const sql of [
   'CREATE TABLE users(id INT PRIMARY KEY,email VARCHAR(255),work_email VARCHAR(255),first_name VARCHAR(80),last_name VARCHAR(80),role VARCHAR(40),status VARCHAR(40),is_active TINYINT,is_archived TINYINT,terminated_at DATETIME,has_hiring_access TINYINT)',
   'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80),slug VARCHAR(80),custom_domain VARCHAR(100),is_active TINYINT,is_archived TINYINT,feature_flags JSON)',
   'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT)',
   'CREATE TABLE hire_journeys(user_id INT,agency_id INT,prehire_completed_at DATETIME(6),onboarding_completed_at DATETIME(6))',
   'CREATE TABLE tasks(id INT PRIMARY KEY,assigned_to_user_id INT,reference_id INT,task_type VARCHAR(30),status VARCHAR(30),title VARCHAR(100),completed_at DATETIME(6),metadata JSON,assigned_to_agency_id INT NULL,task_list_id INT NULL)',
   'CREATE TABLE task_lists(id INT PRIMARY KEY,agency_id INT NULL)',
   'CREATE TABLE hiring_prehire_checklist_items(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,agency_id INT,item_key VARCHAR(120),title VARCHAR(255),instructions TEXT,completed_on DATE,UNIQUE KEY(user_id,item_key))',
   'CREATE TABLE user_admin_docs(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,title VARCHAR(255),doc_type VARCHAR(120),note_text TEXT,storage_path VARCHAR(255),original_name VARCHAR(255),mime_type VARCHAR(120),created_by_user_id INT,is_legal_hold TINYINT,is_deleted TINYINT DEFAULT 0,created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6))',
   'CREATE TABLE document_templates(id INT PRIMARY KEY,agency_id INT)',
   'CREATE TABLE email_sender_identities(id INT PRIMARY KEY,agency_id INT,identity_key VARCHAR(40),from_email VARCHAR(255),reply_to VARCHAR(255),is_active TINYINT)',
   'CREATE TABLE user_communications(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,user_id INT,generated_by_user_id INT,channel VARCHAR(20),template_type VARCHAR(60),recipient_address VARCHAR(255),metadata JSON,client_id INT NULL)'
  ])await pool.query(sql);
  migration=await readFile(new URL('../../../../database/migrations/1750_people_operations_submission_notifications.sql',import.meta.url),'utf8');await runMigration();await runMigration();
 });
 beforeEach(async()=>{
  for(const table of ['people_operations_submission_notifications','people_operations_notification_recipients','users','agencies','user_agencies','hire_journeys','user_communications','tasks','document_templates','email_sender_identities','task_lists','hiring_prehire_checklist_items','user_admin_docs'])await pool.query(`DELETE FROM ${table}`);
  await pool.query("INSERT INTO users VALUES(3,'admin@tenant.test','admin@tenant.test','Admin','User','admin','ACTIVE_EMPLOYEE',1,0,NULL,1),(7,'login@tenant.test','reviewer@tenant.test','Reviewer','User','staff','ACTIVE_EMPLOYEE',1,0,NULL,1),(31,'candidate@example.test',NULL,'Candidate','Example','provider','PREHIRE_REVIEW',1,0,NULL,0)");
  await pool.query("INSERT INTO email_sender_identities VALUES(11,2,'people_operations','po@tenant.test',NULL,1)");
  await pool.query("INSERT INTO agencies VALUES(2,'Tenant','tenant',NULL,1,0,JSON_OBJECT())");await pool.query('INSERT INTO user_agencies VALUES(3,2,1),(7,2,1),(31,2,1)');
  d={database:pool,communication:async input=>{const [row]=await pool.execute('INSERT INTO user_communications(agency_id,user_id,generated_by_user_id,channel,template_type,recipient_address,metadata) VALUES(?,?,?,?,?,?,?)',[input.agencyId,input.userId,input.generatedByUserId,input.channel,input.templateType,input.recipientAddress,JSON.stringify(input.metadata)]);return {id:row.insertId};},
   updateCommunication:vi.fn(),notify:vi.fn(),identity:vi.fn(async()=>({id:11,agency_id:2,from_email:'po@tenant.test'})),send:vi.fn(async input=>{await assertPeopleOperationsSubmissionRecipient(input,{database:pool});return {id:'synthetic-accepted'};})};
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP DATABASE ${schema}`);await admin.end();}});
 const enable=()=>savePeopleOperationsNotificationSettings({agencyId:2,actorUserId:3,enabled:true,recipientIds:[7],senderIdentityId:11},pool,{senders:async()=>[{id:11,ready:true}]});
 const queue=()=>queuePeopleOperationsSubmission({agencyId:2,userId:31,kind:'prehire_complete',id:31},pool);
 it('reapplies1750 idempotently and leaves historical source-less rows inert',async()=>{
  await pool.query("INSERT INTO people_operations_submission_notifications(agency_id,candidate_user_id,recipient_user_id,event_key,event_type) VALUES(2,31,7,'old','prehire_complete')");
  await createPeopleOperationsSubmissionWorker(d)();expect(d.send).not.toHaveBeenCalled();
  const [[old]]=await pool.query('SELECT source_json,communication_id,email_status FROM people_operations_submission_notifications');expect(old).toMatchObject({source_json:null,communication_id:null,email_status:'pending'});
 });
 it('is off before review, ignores historical completion and enqueues one future event per reviewer',async()=>{
  await pool.query("INSERT INTO hire_journeys VALUES(31,2,'2026-01-01',NULL)");await queue();expect((await pool.query('SELECT id FROM people_operations_submission_notifications'))[0]).toHaveLength(0);
  await enable();await queue();expect((await pool.query('SELECT id FROM people_operations_submission_notifications'))[0]).toHaveLength(0);
  await pool.query('UPDATE hire_journeys SET prehire_completed_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 2 SECOND)');
  await Promise.all([queue(),queue()]);expect((await pool.query('SELECT id FROM people_operations_submission_notifications'))[0]).toHaveLength(1);
  const worker=createPeopleOperationsSubmissionWorker(d);await Promise.all([worker(),worker()]);expect(d.send).toHaveBeenCalledOnce();await worker();expect(d.send).toHaveBeenCalledOnce();
 });
 it('rejects current membership or official-address changes on persisted retry',async()=>{
  await enable();await pool.query('INSERT INTO hire_journeys VALUES(31,2,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 2 SECOND),NULL)');await queue();await createPeopleOperationsSubmissionWorker(d)();const input=d.send.mock.calls[0][0];
  await pool.query('UPDATE user_agencies SET is_active=0 WHERE user_id=7');await expect(assertPeopleOperationsSubmissionRecipient(input,{database:pool})).rejects.toMatchObject({status:403});
  await pool.query('UPDATE user_agencies SET is_active=1 WHERE user_id=7');await pool.query("UPDATE users SET work_email='changed@tenant.test' WHERE id=7");await expect(assertPeopleOperationsSubmissionRecipient(input,{database:pool})).rejects.toMatchObject({status:403});
 });
 it.each(['inactive','foreign agency','different mailbox class'])('denies a no-longer-valid selected sender on persisted retry: %s',async reason=>{
  await enable();await pool.query('INSERT INTO hire_journeys VALUES(31,2,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 2 SECOND),NULL)');await queue();await createPeopleOperationsSubmissionWorker(d)();const input=d.send.mock.calls[0][0];
  if(reason==='inactive')await pool.query('UPDATE email_sender_identities SET is_active=0');
  if(reason==='foreign agency')await pool.query('UPDATE email_sender_identities SET agency_id=4');
  if(reason==='different mailbox class')await pool.query("UPDATE email_sender_identities SET identity_key='billing'");
  await expect(assertPeopleOperationsSubmissionRecipient(input,{database:pool})).rejects.toMatchObject({status:403});
 });
 it('matches actual task schema and rejects another tenant template or explicit source agency',async()=>{
  await pool.query('INSERT INTO document_templates VALUES(5,2),(6,4)');
  await pool.query("INSERT INTO tasks VALUES(9,31,5,'document','completed','Hiring document',UTC_TIMESTAMP(6),JSON_OBJECT(),2,NULL)");
  expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toMatchObject({title:'Hiring document'});
  await pool.query('UPDATE tasks SET reference_id=6');expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toBeNull();
  await pool.query("UPDATE tasks SET reference_id=5,metadata=JSON_OBJECT('agencyId',4)");expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toBeNull();
 });
 it('requires consistent explicit task agency ownership and records global-template assignment authority',async()=>{
  await pool.query('INSERT INTO document_templates VALUES(5,NULL)');
  await pool.query("INSERT INTO tasks VALUES(9,31,5,'document','completed','Global template',UTC_TIMESTAMP(6),JSON_OBJECT(),2,NULL)");
  expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toMatchObject({authority:{type:'agency_assigned_global_document',assignedAgencyId:2}});
  await pool.query('UPDATE tasks SET assigned_to_agency_id=NULL');expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toBeNull();
  await pool.query('INSERT INTO task_lists VALUES(4,4)');await pool.query('UPDATE tasks SET assigned_to_agency_id=2,task_list_id=4');expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toBeNull();
  await pool.query('UPDATE task_lists SET agency_id=2');expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toMatchObject({authority:{taskListAgencyId:2}});
  await pool.query('UPDATE tasks SET assigned_to_agency_id=4');expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'task',id:9},pool)).toBeNull();
 });
 it('binds a new receipt to its exact agency checklist transaction, never another membership or unbound older doc',async()=>{
  await pool.query("UPDATE users SET status='PREHIRE_OPEN' WHERE id=31");await pool.query('INSERT INTO hire_journeys VALUES(31,2,NULL,NULL)');await pool.query('INSERT INTO user_agencies VALUES(31,4,1)');
  await savePrehireDocumentReceipt({userId:31,agencyId:2,doc:{id:'sample',filePath:'synthetic',title:'Private hiring document',fileName:'source.pdf'},recipientName:'Synthetic Candidate'});
  const [[item]]=await pool.query('SELECT * FROM hiring_prehire_checklist_items');const ref={agencyId:2,userId:31,kind:'receipt',id:item.submission_admin_doc_id};
  expect(await peopleOperationsSubmissionSource(ref,pool)).toMatchObject({authority:{type:'agency_checklist_receipt',agencyId:2,checklistId:item.id}});
  expect(await peopleOperationsSubmissionSource({...ref,agencyId:4},pool)).toBeNull();
  await savePrehireDocumentReceipt({userId:31,agencyId:4,doc:{id:'sample',filePath:'synthetic',title:'Other agency document',fileName:'source.pdf'},recipientName:'Synthetic Candidate'});
  expect((await pool.query('SELECT submission_admin_doc_id FROM hiring_prehire_checklist_items'))[0][0].submission_admin_doc_id).toBe(ref.id);
  expect(await peopleOperationsSubmissionSource({...ref,agencyId:4},pool)).toBeNull();
  const [[unbound]]=await pool.query('SELECT id FROM user_admin_docs WHERE id<>?',[ref.id]);expect(await peopleOperationsSubmissionSource({...ref,id:unbound.id},pool)).toBeNull();
  await pool.query('UPDATE hiring_prehire_checklist_items SET submission_admin_doc_id=?',[unbound.id]);expect(await peopleOperationsSubmissionSource(ref,pool)).toBeNull();
 });
 it('rolls a new receipt and exact checklist source link back together if queuing fails',async()=>{
  await enable();await pool.query("UPDATE agencies SET feature_flags=JSON_SET(feature_flags,'$.peopleOperationsSubmissionReview.reviewedAt',?)",[new Date(Date.now()-60000).toISOString()]);
  await pool.query("UPDATE users SET status='PREHIRE_OPEN' WHERE id=31");await pool.query('INSERT INTO hire_journeys VALUES(31,2,NULL,NULL)');
  await pool.query("CREATE TRIGGER fixture_reject_notice BEFORE INSERT ON people_operations_submission_notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic queue rejection'");
  try{await expect(savePrehireDocumentReceipt({userId:31,agencyId:2,doc:{id:'rollback',filePath:'synthetic',title:'Synthetic',fileName:'source.pdf'},recipientName:'Synthetic Candidate'})).rejects.toThrow('synthetic queue rejection');}
  finally{await pool.query('DROP TRIGGER fixture_reject_notice');}
  expect((await pool.query('SELECT id FROM user_admin_docs'))[0]).toHaveLength(0);expect((await pool.query('SELECT id FROM hiring_prehire_checklist_items'))[0]).toHaveLength(0);
 });
 it('rolls reviewer selection back when current actor authority no longer permits activation',async()=>{
  await pool.query('UPDATE user_agencies SET is_active=0 WHERE user_id=3');await expect(enable()).rejects.toMatchObject({status:403});
  expect((await pool.query('SELECT user_id FROM people_operations_notification_recipients'))[0]).toHaveLength(0);expect((await pool.query('SELECT feature_flags FROM agencies'))[0][0].feature_flags).toEqual({});
 });
});
