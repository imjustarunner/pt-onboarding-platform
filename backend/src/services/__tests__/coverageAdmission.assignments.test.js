import {it,expect,vi,beforeEach} from 'vitest';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
const m=vi.hoisted(()=>({insurance:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:m.insurance}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {evaluateCoverageAdmission,clientCoverageAdmission,assertNewProviderCoverageAdmission,assertNewClientProviderCoverage,assignPublicIntakeProviderWhenVerified} from '../clientCoverageAdmission.service.js';
import {coverageFingerprint} from '../coverageVerification.service.js';
const insurance={primary:{insurerName:'Synthetic coverage',memberId:'DEMO-001'}};
beforeEach(()=>m.insurance.mockResolvedValue(insurance));

it('uses the same seven-day review window as claim submission and invalidates changed primary/secondary evidence',()=>{
 const now=new Date('2026-11-03T18:00:00Z'),input={now,client:{client_type:'clinical'},agency:{feature_flags:{medicalBillingEnabled:true}},insurance,review:{status:'verified',insurance_fingerprint:coverageFingerprint(insurance),created_at:'2026-10-27T18:00:00Z'}};
 expect(evaluateCoverageAdmission(input).ready).toBe(true);
 expect(evaluateCoverageAdmission({...input,insurance:{},client:{client_type:'clinical',primary_insurer_name:'Self Pay'}})).toMatchObject({ready:true,required:false,selfPay:true});
 for(const created_at of ['2026-10-27T17:59:59Z','2026-11-03T18:00:01Z','invalid'])expect(evaluateCoverageAdmission({...input,review:{...input.review,created_at}}).ready).toBe(false);
 expect(evaluateCoverageAdmission({...input,hasNewEvidence:true}).ready).toBe(false);
 const changed={...insurance,secondary:{insurerName:'Second synthetic plan'}};
 expect(evaluateCoverageAdmission({...input,insurance:changed}).ready).toBe(false);
 expect(evaluateCoverageAdmission({...input,insurance:changed,review:{...input.review,insurance_fingerprint:coverageFingerprint(changed)}}).ready).toBe(true);
 const expired={...insurance,secondary:{insurerName:'Second synthetic plan',terminationDate:'2026-11-02'}};
 expect(evaluateCoverageAdmission({...input,insurance:expired,review:{...input.review,insurance_fingerprint:coverageFingerprint(expired)}}).ready).toBe(false);
});

it.skipIf(!process.env.BILLING_TEST_MYSQL_SOCKET && process.env.BILLING_FOLLOWUP_MYSQL_TEST!=='1')('MySQL admission blocks new insured assignment, preserves existing care and retains deferred public intake',async()=>{
 const db=await mysql.createConnection(process.env.BILLING_TEST_MYSQL_SOCKET?{socketPath:process.env.BILLING_TEST_MYSQL_SOCKET,user:'root',timezone:'+00:00'}:{host:'127.0.0.1',port:33316,user:'root',password:'synthetic-root-only',timezone:'+00:00'}),schema=`coverage_assign_${randomUUID().replaceAll('-','')}`;
 try{
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  await db.query('CREATE TABLE agencies(id INT,feature_flags JSON,organization_type VARCHAR(30))');
  await db.query('CREATE TABLE insurance_types(id INT,agency_id INT,label VARCHAR(40))');
  await db.query('CREATE TABLE clients(id INT,agency_id INT,organization_id INT,client_type VARCHAR(30),provider_id INT,insurance_type_id INT,primary_insurer_name VARCHAR(80) NULL)');
  await db.query('CREATE TABLE client_provider_assignments(id INT,client_id INT,provider_user_id INT,is_active INT)');
  await db.query('CREATE TABLE client_coverage_reviews(id INT,agency_id INT,client_id INT,status VARCHAR(20),insurance_fingerprint VARCHAR(64),through_check_id INT,created_at DATETIME(6))');
  await db.query('CREATE TABLE client_coverage_checks(id INT,agency_id INT,client_id INT,completed_at DATETIME(6))');
  await db.query(`INSERT INTO agencies VALUES(1,'{"medicalBillingEnabled":true}','agency'),(2,NULL,'school')`);
  await db.query(`INSERT INTO clients(id,agency_id,organization_id,client_type,provider_id,insurance_type_id) VALUES(10,1,2,'basic_nonclinical',NULL,NULL),(11,1,2,'school',90,NULL),(12,1,2,'school',NULL,NULL)`);
  await db.query('INSERT INTO client_provider_assignments VALUES(1,12,90,1)');
  await expect(assertNewProviderCoverageAdmission(10,90,{db})).rejects.toMatchObject({status:409,code:'INSURANCE_VERIFICATION_REQUIRED'});
  expect(await clientCoverageAdmission(10,{db,client:{id:10,agency_id:1,client_type:'basic_nonclinical'}})).toMatchObject({ready:false,required:true});
  expect(await assertNewProviderCoverageAdmission(11,90,{db})).toMatchObject({ready:true,existingAssignment:true});
  expect(await assertNewProviderCoverageAdmission(12,90,{db})).toMatchObject({ready:true,existingAssignment:true});
  const deferred=await assignPublicIntakeProviderWhenVerified(10,90,{db});expect(deferred).toMatchObject({assigned:false,assignmentDeferred:true});
  const [[saved]]=await db.query('SELECT id,provider_id FROM clients WHERE id=10');expect(saved).toEqual({id:10,provider_id:null});
  await expect(assertNewClientProviderCoverage({agency_id:1,organization_id:2,provider_id:90,client_type:'school'},{db})).rejects.toMatchObject({status:409});
  await db.query(`INSERT INTO client_coverage_reviews VALUES(1,1,10,'verified',?,0,UTC_TIMESTAMP(6))`,[coverageFingerprint(insurance)]);
  expect(await assignPublicIntakeProviderWhenVerified(10,90,{db})).toMatchObject({assigned:true,assignmentDeferred:false});
  const [[assigned]]=await db.query('SELECT provider_id FROM clients WHERE id=10');expect(assigned.provider_id).toBe(90);
  // A new provider still needs a current review; the existing one is never removed.
  await db.query("UPDATE client_coverage_reviews SET created_at='2025-01-01' WHERE id=1");
  await expect(assertNewProviderCoverageAdmission(10,91,{db})).rejects.toMatchObject({status:409});
  expect(await assertNewProviderCoverageAdmission(10,90,{db})).toMatchObject({ready:true,existingAssignment:true});
  await db.query("INSERT INTO insurance_types VALUES(7,1,'Self pay')");
  await expect(assertNewClientProviderCoverage({agency_id:1,organization_id:2,provider_id:90,client_type:'school',insurance_type_id:7},{db})).resolves.toBeUndefined();
 }finally{await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
},20000);
