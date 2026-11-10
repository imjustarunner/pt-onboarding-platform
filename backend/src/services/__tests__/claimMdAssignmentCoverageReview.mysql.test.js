import {it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {readClientInsurance,writeClientInsurance} from '../clientInsurance.service.js';
import {coverageReviewToken,listCoverageEvidence,saveCoverageReview} from '../coverageVerification.service.js';
import {assertNewProviderCoverageAdmission,clientCoverageAdmission} from '../clientCoverageAdmission.service.js';

it.skipIf(!process.env.BILLING_TEST_MYSQL_SOCKET&&process.env.BILLING_FOLLOWUP_MYSQL_TEST!=='1')('MySQL manual coverage save clears school assignment with immutable audit; stale or foreign reviews cannot write',async()=>{
 const socket=process.env.BILLING_TEST_MYSQL_SOCKET;
 if(socket&&!/^\/private\/tmp\/pt-hannah-mysql-[A-Za-z0-9_-]+\/mysql\.sock$/.test(socket))throw Error('Only the isolated Hannah synthetic MySQL socket is allowed');
 const db=await mysql.createConnection(socket?{socketPath:socket,user:'root',timezone:'+00:00'}:{host:'127.0.0.1',port:33316,user:'root',password:'synthetic-root-only',timezone:'+00:00'});
 const schema=`assignment_review_${randomUUID().replaceAll('-','')}`;
 const connection={execute:db.execute.bind(db),beginTransaction:db.beginTransaction.bind(db),commit:db.commit.bind(db),rollback:db.rollback.bind(db),release(){}};
 const deps={pool:{getConnection:async()=>connection}};
 vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
 const serviceDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const info={primary:{insurerName:'Synthetic Medicaid',memberId:'D123456',isMedicaid:true},patient:{firstName:'DEMO QA',lastName:'Student'}};
 const input={agencyId:2,clientId:10,actorUserId:559,serviceDate,status:'verified',source:'payer_portal',reference:'Synthetic payer portal checked',assignmentReview:true,primaryChecked:true,otherCoverageChecked:true,orderConfirmed:true,medicaidTplChecked:true};
 const token=async()=>coverageReviewToken({...input,insurance:await readClientInsurance(10,2,db),...await listCoverageEvidence(input,db)});
 try {
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  await db.query('CREATE TABLE agencies(id INT PRIMARY KEY,feature_flags JSON,organization_type VARCHAR(30))');
  await db.query('CREATE TABLE insurance_types(id INT,agency_id INT,label VARCHAR(50))');
  await db.query('CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,client_type VARCHAR(30),provider_id INT,insurance_type_id INT,primary_insurer_name VARCHAR(80),billing_insurance_payload LONGTEXT,insurance_member_id VARCHAR(80),insurance_group_number VARCHAR(80),insurance_subscriber_name VARCHAR(80),full_name VARCHAR(255),date_of_birth DATE,gender VARCHAR(20),address_street VARCHAR(255),address_apt VARCHAR(50),address_city VARCHAR(100),address_state VARCHAR(50),address_zip VARCHAR(20))');
  await db.query('CREATE TABLE client_provider_assignments(id INT,client_id INT,provider_user_id INT,is_active INT)');
  await db.query('CREATE TABLE client_coverage_checks(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,client_id INT,policy_slot VARCHAR(20),service_date DATE,status VARCHAR(20),insurance_fingerprint VARCHAR(64),completed_at DATETIME(6),evidence_encrypted LONGTEXT)');
  await db.query('CREATE TABLE client_coverage_reviews(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,client_id INT,service_date DATE,insurance_fingerprint VARCHAR(64),status VARCHAR(20),through_check_id INT,evidence_encrypted LONGTEXT,created_by_user_id INT,created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6))');
  await db.query('CREATE TABLE family_billing_audit(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,actor_user_id INT,client_id INT,action VARCHAR(80),object_id INT)');
  await db.query(`INSERT INTO agencies VALUES(2,'{"medicalBillingEnabled":true}','agency'),(446,NULL,'school')`);
  await db.execute("INSERT INTO clients(id,agency_id,organization_id,client_type,billing_insurance_payload) VALUES(10,2,446,'basic_nonclinical',?)",[encryptFamilyBilling(info,'client-insurance:2:10')]);
  await db.execute("INSERT INTO client_coverage_checks(agency_id,client_id,policy_slot,service_date,status) VALUES(2,10,'primary',?,'pending')",[serviceDate]);

  await expect(assertNewProviderCoverageAdmission(10,90,{db})).rejects.toMatchObject({code:'INSURANCE_VERIFICATION_REQUIRED'});
  const firstToken=await token(),saved=await saveCoverageReview({...input,reviewToken:firstToken},deps);
  expect(await assertNewProviderCoverageAdmission(10,90,{db})).toMatchObject({ready:true,required:true});
  const [[review]]=await db.execute('SELECT * FROM client_coverage_reviews WHERE id=?',[saved.id]);
  expect(review.created_by_user_id).toBe(559);expect(decryptFamilyBilling(review.evidence_encrypted,'coverage:2:10')).toMatchObject({reference:input.reference,reviewPurpose:'provider_assignment'});
  const [audit]=await db.execute('SELECT agency_id,actor_user_id,client_id,action,object_id FROM family_billing_audit');
  expect(audit).toEqual([{agency_id:2,actor_user_id:559,client_id:10,action:'insurance_coordination_reviewed',object_id:saved.id}]);
  const [[client]]=await db.execute('SELECT provider_id FROM clients WHERE id=10');expect(client.provider_id).toBeNull();

  await expect(saveCoverageReview({...input,reviewToken:firstToken},deps)).rejects.toMatchObject({status:409,code:'COVERAGE_REVIEW_STALE'});
  const freshToken=await token();
  await db.query("UPDATE client_coverage_checks SET status='returned',completed_at=CURRENT_TIMESTAMP(6) WHERE id=1");
  await expect(saveCoverageReview({...input,reviewToken:freshToken},deps)).rejects.toMatchObject({status:409,code:'COVERAGE_REVIEW_STALE'});
  expect(await clientCoverageAdmission(10,{db})).toMatchObject({ready:false});
  await saveCoverageReview({...input,reviewToken:await token()},deps);
  expect(await assertNewProviderCoverageAdmission(10,90,{db})).toMatchObject({ready:true});

  const beforeChange=await token();
  await writeClientInsurance({clientId:10,agencyId:2,...info,primary:{...info.primary,memberId:'D654321'}},db);
  await expect(saveCoverageReview({...input,reviewToken:beforeChange},deps)).rejects.toMatchObject({code:'COVERAGE_REVIEW_STALE'});
  await expect(saveCoverageReview({...input,agencyId:3,reviewToken:beforeChange},deps)).rejects.toMatchObject({status:404});
  const [[count]]=await db.query('SELECT COUNT(*) AS total FROM client_coverage_reviews'),[[auditCount]]=await db.query('SELECT COUNT(*) AS total FROM family_billing_audit');
  expect(count.total).toBe(2);expect(auditCount.total).toBe(2);
  const [[original]]=await db.execute('SELECT evidence_encrypted FROM client_coverage_reviews WHERE id=?',[saved.id]);expect(original.evidence_encrypted).toBe(review.evidence_encrypted);
 }finally {await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
},20000);
