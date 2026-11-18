import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import defaultPool from '../../config/database.js';
import {createJobWithInterviewQuestions} from '../jobInterviewQuestions.service.js';
import Sets from '../../models/InterviewHubJobQuestionSet.model.js';
test('job question migration, transactions and default pinning in isolated MySQL',{skip:!process.env.PLOTLINE_QUESTION_TEST_SOCKET},async t=>{
 assert.match(process.env.PLOTLINE_QUESTION_TEST_SOCKET,/^\/private\/tmp\/plotline-questions-[\w-]+\.sock$/);
 const options={socketPath:process.env.PLOTLINE_QUESTION_TEST_SOCKET,user:'root',timezone:'Z'};
 const setup=await mysql.createConnection(options);let db;
 const name='plotline_job_questions_test';
 try {
  await setup.query(`CREATE DATABASE ${name}`);await setup.query(`USE ${name}`);
  await setup.query(`CREATE TABLE hiring_job_descriptions(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,title VARCHAR(255),description_text TEXT,description_sections_json JSON,posted_date DATE,application_deadline DATE,city VARCHAR(120),state VARCHAR(120),education_level VARCHAR(80),role_type VARCHAR(80),is_featured TINYINT,tags_json JSON,application_page_json JSON,storage_path TEXT,original_name TEXT,mime_type TEXT,is_active TINYINT,created_by_user_id INT,publish_at DATETIME,unpublish_at DATETIME,schedule_text TEXT,credential_mode VARCHAR(20),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
  await setup.query('CREATE TABLE interview_hub_templates(id INT PRIMARY KEY,agency_id INT,is_default TINYINT,standard_questions_json JSON)');
  await setup.query('CREATE TABLE interview_hub_job_question_sets(id BIGINT AUTO_INCREMENT PRIMARY KEY,agency_id INT,job_description_id INT,title VARCHAR(255),questions_json JSON,scorecard_criteria_json JSON,is_active TINYINT,created_by_user_id INT,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
  await setup.query("INSERT INTO hiring_job_descriptions(id,agency_id,title) VALUES(1,6,'Legacy job')");
  await setup.query("INSERT INTO interview_hub_job_question_sets(id,agency_id,job_description_id,title,questions_json,is_active) VALUES(7,6,1,'Legacy guide','[]',1)");
  const source=await fs.readFile(new URL('../../../../database/migrations/1849_job_interview_question_defaults.sql',import.meta.url),'utf8');
  const statements=source.replace(/^--.*$/gm,'').split(';').map(sql=>sql.trim()).filter(Boolean);
  for(const statement of statements)await setup.query(statement);
  db=mysql.createPool({...options,database:name,connectionLimit:8});
  await t.test('migration preserves the previous default and alternative sets cannot replace it',async()=>{
   assert.equal((await Sets.findDefaultForJob(6,1,db)).id,7);
   await db.query("INSERT INTO interview_hub_job_question_sets(agency_id,job_description_id,title,questions_json,is_active) VALUES(6,1,'Alternative','[]',1)");
   await db.query(statements[1]);assert.equal((await Sets.findDefaultForJob(6,1,db)).id,7);
  });
  await t.test('a new posting receives its own five starter questions',async()=>{
   const job=await createJobWithInterviewQuestions({agencyId:6,title:'New operations role',createdByUserId:1434},{db});
   assert.equal((await Sets.findDefaultForJob(6,job.id,db)).questions_json.length,5);
  });
  await t.test('simultaneous guide saves create one default, never competing sets',async()=>{
   const [job]=await db.query("INSERT INTO hiring_job_descriptions(agency_id,title) VALUES(6,'Concurrent guide')");
   const results=await Promise.all(Array.from({length:12},async(_,index)=>{const conn=await db.getConnection();try{await conn.beginTransaction();const id=await Sets.saveDefaultForJob({agencyId:6,jobDescriptionId:job.insertId,title:'Guide',questionsJson:[{key:'q1',text:`Question ${index}`}],createdByUserId:1434,executor:conn});await conn.commit();return id;}catch(error){await conn.rollback();throw error;}finally{conn.release();}}));
   assert.equal(new Set(results).size,1);assert.equal((await db.query('SELECT COUNT(*) n FROM interview_hub_job_question_sets WHERE job_description_id=?',[job.insertId]))[0][0].n,1);
  });
 }finally{if(db)await db.end();await setup.query(`DROP DATABASE IF EXISTS ${name}`);await setup.end();await defaultPool.end();}
});
