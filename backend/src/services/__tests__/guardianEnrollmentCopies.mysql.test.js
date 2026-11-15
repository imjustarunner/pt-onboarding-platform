import {afterAll,beforeAll,expect,it,vi}from'vitest';import mysql from'mysql2/promise';import crypto from'node:crypto';
const m=vi.hoisted(()=>({pool:null}));vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>m.pool.execute(...a)},onTableWrite:vi.fn()}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{getLink:async({clientId,guardianUserId})=>Number(clientId)===2271&&Number(guardianUserId)===1456?{access_enabled:1,relationship_type:'guardian',permissions_json:{}}:null}}));
vi.mock('../clientServiceEnrollment.service.js',()=>({guardianServiceContext:async({userId,clientId,agencyId,serviceId})=>{if(userId!==1456||clientId!==2271||agencyId!==453||![1043,1044].includes(serviceId))throw Object.assign(new Error('Not this family service'),{status:403});return {service:{service_kind:serviceId===1043?'tutoring':'counseling'}};}}));
import{guardianEnrollmentCopies}from'../guardianEnrollmentCopies.service.js';import IntakeSubmissionDocument from'../../models/IntakeSubmissionDocument.model.js';
const socket=process.env.EVIDENCE_TEST_SOCKET,schema='enrollment_context_'+crypto.randomBytes(5).toString('hex');let admin;
beforeAll(async()=>{if(!socket)return;admin=await mysql.createConnection({socketPath:socket,user:'root',multipleStatements:true});await admin.query(`CREATE DATABASE ${schema}`);m.pool=mysql.createPool({socketPath:socket,user:'root',database:schema,multipleStatements:true});await m.pool.query(`
CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,date_of_birth DATE);CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled INT);
CREATE TABLE client_agency_assignments(client_id INT,agency_id INT,is_active INT);
CREATE TABLE intake_links(id INT PRIMARY KEY,organization_id INT,language_code VARCHAR(3),title VARCHAR(100),master_channel VARCHAR(32),scope_type VARCHAR(32),form_type VARCHAR(32));
CREATE TABLE intake_submissions(id INT PRIMARY KEY,intake_link_id INT,guardian_user_id INT,status VARCHAR(32),submitted_at DATETIME,combined_pdf_path VARCHAR(255));
CREATE TABLE intake_submission_clients(id INT PRIMARY KEY,intake_submission_id INT,client_id INT,bundle_pdf_path VARCHAR(255));
CREATE TABLE intake_submission_documents(id INT PRIMARY KEY,intake_submission_id INT,client_id INT,document_template_id INT,signed_pdf_path VARCHAR(255),pdf_hash VARCHAR(100),signed_at DATETIME,audit_trail JSON);
CREATE TABLE document_templates(id INT PRIMARY KEY,name VARCHAR(100));CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active INT);CREATE TABLE agency_schools(agency_id INT,school_organization_id INT,is_active INT);
INSERT INTO clients VALUES(2271,450,'2016-01-01');INSERT INTO client_guardians VALUES(2271,1456,1);INSERT INTO client_agency_assignments VALUES(2271,453,1);
INSERT INTO intake_links VALUES(1,450,'en','ITSCO Counseling','office','agency','intake'),(2,453,'en','NLU Tutoring','tutoring','agency','intake'),(3,453,'en','NLU Counseling','office','agency','intake');
INSERT INTO intake_submissions VALUES(30,1,1456,'submitted','2026-11-01 12:00:00','clinical450.pdf'),(31,2,1456,'submitted','2026-11-02 12:00:00','tutoring453.pdf'),(32,3,1456,'submitted','2026-11-03 12:00:00','clinical453.pdf');
INSERT INTO intake_submission_clients VALUES(1,30,2271,'clinical450.pdf'),(2,31,2271,'tutoring453.pdf'),(3,32,2271,'clinical453.pdf');
INSERT INTO intake_submission_documents(id,intake_submission_id,client_id,signed_pdf_path,signed_at) VALUES(130,30,2271,'clinical450.pdf','2026-11-01'),(131,31,2271,'tutoring453.pdf','2026-11-02'),(132,32,2271,'clinical453.pdf','2026-11-03');
`);});
afterAll(async()=>{if(m.pool)await m.pool.end();if(admin){await admin.query(`DROP DATABASE ${schema}`);await admin.end();}});
it.skipIf(!socket)('separates primary-company and same-agency tutoring/counseling copies while retaining the same guardian and child',async()=>{
 expect((await guardianEnrollmentCopies({userId:1456,clientId:2271,agencyId:450})).map(r=>r.id)).toEqual([30]);
 expect((await guardianEnrollmentCopies({userId:1456,clientId:2271,agencyId:453,serviceId:1043})).map(r=>r.id)).toEqual([31]);
 expect((await guardianEnrollmentCopies({userId:1456,clientId:2271,agencyId:453,serviceId:1044})).map(r=>r.id)).toEqual([32]);
 expect((await IntakeSubmissionDocument.listSignedForGuardianClient({guardianUserId:1456,clientId:2271,agencyId:453,serviceKind:'tutoring'})).map(r=>r.id)).toEqual([131]);
 expect((await IntakeSubmissionDocument.listSignedForGuardianClient({guardianUserId:1456,clientId:2271,agencyId:453,serviceKind:'counseling'})).map(r=>r.id)).toEqual([132]);
 await expect(guardianEnrollmentCopies({userId:1437,clientId:2271,agencyId:453,serviceId:1043})).rejects.toMatchObject({status:403});
});
