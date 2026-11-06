import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
test('job guide migration and completed guardian release protection on isolated MySQL',{skip:!process.env.INTERVIEW_FAMILY_TEST_SOCKET},async t=>{
 const socketPath=process.env.INTERVIEW_FAMILY_TEST_SOCKET;
 assert.match(socketPath,/^\/private\/tmp\/interview-family-[\w-]+\.sock$/);
 const db=await mysql.createConnection({socketPath,user:'root'});
 let applicationPool;
 try{
  await db.query('DROP DATABASE IF EXISTS interview_family_test');await db.query('CREATE DATABASE interview_family_test');await db.query('USE interview_family_test');
  await db.query("CREATE USER IF NOT EXISTS 'interview_family_test'@'localhost' IDENTIFIED BY 'synthetic-local-only'");
  await db.query("GRANT ALL ON interview_family_test.* TO 'interview_family_test'@'localhost'");
  await db.query('CREATE TABLE interview_hub_job_question_sets(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,job_description_id INT,title VARCHAR(255),questions_json JSON,is_active BOOLEAN,created_by_user_id INT,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
  await db.query(await fs.readFile(new URL('../../../../database/migrations/1775_job_interview_scorecard.sql',import.meta.url),'utf8'));
  await db.query('CREATE TABLE intake_links(id INT PRIMARY KEY,title VARCHAR(80),language_code VARCHAR(10))');
  await db.query("CREATE TABLE client_school_roi_signing_links(id INT AUTO_INCREMENT PRIMARY KEY,client_id INT,school_organization_id INT,intake_link_id INT,public_key VARCHAR(100),status VARCHAR(30),issued_by_user_id INT,issued_at DATETIME,latest_intake_submission_id INT,signed_at DATETIME,completed_client_phi_document_id INT,roi_context_json JSON,roi_response_json JSON,access_applied_at DATETIME,updated_at DATETIME,UNIQUE KEY(client_id,school_organization_id))");
  Object.assign(process.env,{SKIP_DB_CONNECT:'1',DB_HOST:socketPath,DB_USER:'interview_family_test',DB_PASSWORD:'synthetic-local-only',DB_NAME:'interview_family_test'});
  const Guide=(await import('../../models/InterviewHubJobQuestionSet.model.js')).default;
  const Release=(await import('../../models/ClientSchoolRoiSigningLink.model.js')).default;
  applicationPool=(await import('../../config/database.js')).default;
  await t.test('persists job questions and ratings with strict agency/job isolation',async()=>{
   const ratings=[{key:'judgment',label:'Judgment',weight:1}];
   const guide=await Guide.create({agencyId:6,jobDescriptionId:45,title:'Job guide',questionsJson:['Job question'],scorecardCriteriaJson:ratings});
   await Guide.create({agencyId:2,jobDescriptionId:45,title:'Different agency',questionsJson:['Other question']});
   assert.equal((await Guide.findDefaultForJob(6,45)).id,guide.id);assert.equal(await Guide.findDefaultForJob(6,99),null);
   assert.deepEqual((await Guide.findById(guide.id)).scorecard_criteria_json,ratings);
   await Guide.updateById(guide.id,{scorecardCriteriaJson:null});assert.equal((await Guide.findById(guide.id)).scorecard_criteria_json,null);
  });
  await t.test('opening Documents cannot replace a concurrently completed release or its signed PDF',async()=>{
   const args={clientId:31,schoolOrganizationId:50,intakeLinkId:2,publicKey:'original-key',preserveCompleted:true};
   const issued=await Release.issueForClient(args);
   await db.query("UPDATE client_school_roi_signing_links SET status='completed',signed_at='2026-11-06 12:00:00',completed_client_phi_document_id=999 WHERE id=?",[issued.id]);
   const result=await Release.issueForClient({...args,publicKey:'replacement-key',intakeLinkId:3});
   assert.equal(result.status,'completed');assert.equal(result.public_key,'original-key');assert.equal(result.completed_client_phi_document_id,999);
   await Release.markStarted({id:issued.id,intakeSubmissionId:12});assert.equal((await Release.findById(issued.id)).status,'completed');
  });
 }finally{if(applicationPool)await applicationPool.end();await db.end();}
});
