import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';import fs from 'node:fs/promises';import crypto from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
import {createGuardianDemographicsService} from '../guardianDemographics.service.js';
const socket=process.env.EVIDENCE_TEST_SOCKET;
describe.skipIf(!socket)('isolated demographic review SQL',()=>{
 let pool,admin,service;const database=`guardian_details_test_${crypto.randomBytes(5).toString('hex')}`;
 const parent={id:9,role:'client_guardian'},staff={id:4,role:'admin'};
 beforeAll(async()=>{
  admin=await mysql.createConnection({socketPath:socket,user:'root',multipleStatements:true});await admin.query(`CREATE DATABASE ${database}`);
  pool=mysql.createPool({socketPath:socket,user:'root',database,multipleStatements:true});
  await pool.query(`CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(50),last_name VARCHAR(50));INSERT INTO users VALUES(9,'Parent','One'),(10,'Parent','Two');
   CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,full_name VARCHAR(255),date_of_birth DATE,preferred_language VARCHAR(255),gender VARCHAR(64),grade VARCHAR(32),contact_phone VARCHAR(20),email VARCHAR(255),address_street VARCHAR(255),address_apt VARCHAR(64),address_city VARCHAR(100),address_state VARCHAR(50),address_zip VARCHAR(20),ethnicity VARCHAR(100),updated_by_user_id INT,last_activity_at DATETIME);
   CREATE TABLE support_tickets(id INT AUTO_INCREMENT PRIMARY KEY,school_organization_id INT,client_id INT,created_by_user_id INT,agency_id INT,subject TEXT,question TEXT,status VARCHAR(32));
   CREATE TABLE intake_links(id INT PRIMARY KEY,public_key VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci);
   CREATE TABLE intake_submissions(id INT PRIMARY KEY,guardian_user_id INT,client_id INT,intake_link_id INT,status VARCHAR(32));
   CREATE TABLE intake_submission_clients(intake_submission_id INT,client_id INT);
   CREATE TABLE co_guardian_invites(id INT PRIMARY KEY,accepted_user_id INT,status VARCHAR(32),agency_id INT,public_key VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci);
   CREATE TABLE co_guardian_invite_clients(invite_id INT,client_id INT);`);
  await pool.query(await fs.readFile(new URL('../../../../database/migrations/1652_guardian_demographic_review.sql',import.meta.url),'utf8'));
  process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,8).toString('base64');
  service=createGuardianDemographicsService({db:pool,guardianAccess:async()=>({agency_id:2,organization_id:2}),staffAccess:async()=>({agency_id:2})});
 });
 beforeEach(async()=>{
  await pool.query('DELETE FROM guardian_demographic_requests;DELETE FROM support_tickets;DELETE FROM clients;DELETE FROM intake_submissions;DELETE FROM intake_submission_clients;DELETE FROM intake_links;DELETE FROM co_guardian_invites;DELETE FROM co_guardian_invite_clients');
  await pool.execute('INSERT INTO clients (id,agency_id,organization_id,full_name,date_of_birth,preferred_name,preferred_language) VALUES (5,2,2,?,?,?,?)',['Susanne Example','2018-01-01','Susanne','English']);
  await pool.query("INSERT INTO intake_links VALUES(8,'synthetic-packet');INSERT INTO intake_submissions VALUES(18,9,5,8,'submitted');INSERT INTO co_guardian_invites VALUES(3,9,'accepted',2,'synthetic-packet');INSERT INTO co_guardian_invite_clients VALUES(3,5)");
 });
 afterAll(async()=>{if(pool)await pool.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.end();}});
 it('encrypts both conflicting values, keeps separate parent submissions, and applies only reviewed fields',async()=>{
  let record=await service.read({user:parent,clientId:5});
  const update=await service.submit({user:parent,clientId:5,values:{preferred_name:'Susie'},revision:record.revision});
  await service.submit({user:{...parent,id:10},clientId:5,values:{preferred_name:'Sue'},revision:record.revision});
  const [[stored]]=await pool.execute('SELECT changes_encrypted FROM guardian_demographic_requests WHERE id=?',[update.id]);expect(stored.changes_encrypted).not.toContain('Susie');
  record=await service.read({user:parent,clientId:5});expect(record.requests).toHaveLength(1);expect(record.values.preferred_name).toBe('Susanne');
  const review=await service.read({user:staff,clientId:5,staff:true});expect(review.requests).toHaveLength(2);
  await service.review({user:staff,clientId:5,requestId:update.id,acceptedFields:['preferred_name'],reason:'Confirmed by support',revision:review.revision});
  const [[client]]=await pool.query('SELECT * FROM clients WHERE id=5');expect(client.full_name).toBe('Susanne Example');expect(client.preferred_name).toBe('Susie');expect(client.updated_by_user_id).toBe(4);
  await expect(service.review({user:staff,clientId:5,requestId:update.id,acceptedFields:['preferred_name'],reason:'Duplicate',revision:review.revision})).rejects.toHaveProperty('status',409);
 });
 it('rolls back a proposal if the support queue cannot be written',async()=>{
  const record=await service.read({user:parent,clientId:5});await pool.query('RENAME TABLE support_tickets TO support_tickets_unavailable');
  try{await expect(service.submit({user:parent,clientId:5,values:{preferred_name:'Susie'},revision:record.revision})).rejects.toBeDefined();const[[count]]=await pool.query('SELECT COUNT(*) n FROM guardian_demographic_requests');expect(count.n).toBe(0);}finally{await pool.query('RENAME TABLE support_tickets_unavailable TO support_tickets');}
 });
 it('queues encrypted enrollment differences separately from portal updates and deduplicates retries',async()=>{
  const original=await service.read({user:parent,clientId:5});
  const portal=await service.submit({user:parent,clientId:5,values:{preferred_name:'Susie'},revision:original.revision});
  const input={clientId:5,submissionId:18,guardianUserId:9,values:{full_name:'Susanne Updated',date_of_birth:'2018-02-02',preferred_language:'Spanish'}};
  const enrollment=await service.enqueueFromEnrollment(input);
  expect(enrollment.id).not.toBe(portal.id);
  expect(await service.enqueueFromEnrollment(input)).toEqual(enrollment);
  const [[count]]=await pool.query('SELECT COUNT(*) n FROM guardian_demographic_requests');expect(count.n).toBe(2);
  const [[tasks]]=await pool.query('SELECT COUNT(*) n FROM support_tickets');expect(tasks.n).toBe(2);
  const [[stored]]=await pool.execute('SELECT intake_submission_id,changes_encrypted FROM guardian_demographic_requests WHERE id=?',[enrollment.id]);
  expect(stored.intake_submission_id).toBe(18);expect(stored.changes_encrypted).not.toContain('Susanne Updated');
  const details=await service.read({user:parent,clientId:5});
  expect(details.values.full_name).toBe('Susanne Example');
  expect(details.requests.find(r=>r.id===enrollment.id)).toMatchObject({intakeSubmissionId:18,proposed:input.values});
  expect(details.requests.find(r=>r.id===portal.id)).toMatchObject({intakeSubmissionId:null,proposed:{preferred_name:'Susie'}});
 });
 it('requires the submitted enrollment owner, invited dependent, packet, and agency to match',async()=>{
  const input={clientId:5,submissionId:18,guardianUserId:9,values:{preferred_name:'Susie'}};
  await expect(service.enqueueFromEnrollment({...input,guardianUserId:10})).rejects.toHaveProperty('status',403);
  await pool.query("UPDATE intake_submissions SET status='in_progress' WHERE id=18");
  await expect(service.enqueueFromEnrollment(input)).rejects.toHaveProperty('status',403);
  await pool.query("UPDATE intake_submissions SET status='submitted' WHERE id=18;UPDATE co_guardian_invites SET public_key='other-packet' WHERE id=3");
  await expect(service.enqueueFromEnrollment(input)).rejects.toHaveProperty('status',403);
  await pool.query("UPDATE co_guardian_invites SET public_key='synthetic-packet',agency_id=99 WHERE id=3");
  await expect(service.enqueueFromEnrollment(input)).rejects.toHaveProperty('status',403);
  await pool.query('UPDATE co_guardian_invites SET agency_id=2 WHERE id=3;DELETE FROM co_guardian_invite_clients');
  await expect(service.enqueueFromEnrollment(input)).rejects.toHaveProperty('status',403);
  const [[count]]=await pool.query('SELECT COUNT(*) n FROM guardian_demographic_requests');expect(count.n).toBe(0);
 });
 it('permits a sibling only when both the signed submission and the invitation bind that child',async()=>{
  await pool.query("INSERT INTO clients (id,agency_id,organization_id,full_name,date_of_birth) VALUES(6,2,2,'Sibling Example','2016-01-01');INSERT INTO co_guardian_invite_clients VALUES(3,6)");
  const input={clientId:6,submissionId:18,guardianUserId:9,values:{preferred_name:'Sibling nickname'}};
  await expect(service.enqueueFromEnrollment(input)).rejects.toHaveProperty('status',403);
  await pool.query('INSERT INTO intake_submission_clients VALUES(18,6)');
  expect(await service.enqueueFromEnrollment(input)).toMatchObject({status:'pending'});
 });
 it('rolls back the enrollment proposal when creating its support task fails',async()=>{
  await pool.query('RENAME TABLE support_tickets TO support_tickets_unavailable');
  try{
   await expect(service.enqueueFromEnrollment({clientId:5,submissionId:18,guardianUserId:9,values:{preferred_name:'Susie'}})).rejects.toBeDefined();
   const[[count]]=await pool.query('SELECT COUNT(*) n FROM guardian_demographic_requests');expect(count.n).toBe(0);
  }finally{await pool.query('RENAME TABLE support_tickets_unavailable TO support_tickets');}
 });
});
