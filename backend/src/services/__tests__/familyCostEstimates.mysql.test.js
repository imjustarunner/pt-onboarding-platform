import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';

// Extends the isolated billing fixture without resetting any existing tables.
// Never run this against an application database or with production credentials.
test('staged estimates and welcome/benefit reservations work with real MySQL', {skip:process.env.FAMILY_PORTAL_ESTIMATE_MYSQL_TEST!=='1'}, async t=>{
 for(const prefix of ['DB','CLINICAL_DB'])for(const [key,value]of Object.entries({HOST:'127.0.0.1',PORT:'33316',NAME:'family_billing_test',USER:'family_billing_test'}))assert.equal(process.env[`${prefix}_${key}`],value);
 assert.equal(process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64,Buffer.alloc(32).toString('base64'));
 const {default:mysql}=await import('mysql2/promise');
 const db=await mysql.createConnection({host:'127.0.0.1',port:33316,user:'family_billing_test',password:process.env.DB_PASSWORD,database:'family_billing_test',timezone:'Z'});
 let pool,clinical;
 try{
  const {splitSqlStatements}=await import('../../utils/migrationSql.js');
  for(const name of ['1674_portal_migration_benefit_notices.sql','1675_family_cost_estimates.sql']){
   const sql=await readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');
   for(const statement of splitSqlStatements(sql))await db.query(statement);
  }
  const [[grants]]=await db.execute("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='guardian_clinical_grants'");
  if(!grants.n)for(const statement of splitSqlStatements(await readFile(new URL('../../../../database/migrations/1415_guardian_clinical_disclosure_grants.sql',import.meta.url),'utf8')))await db.query(statement);
  const addColumn=async(table,column,type)=>{const [[found]]=await db.execute('SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?',[table,column]);if(!found.n)await db.query(`ALTER TABLE ${table} ADD ${column} ${type}`);};
  for(const [table,column,type]of [['users','terminated_at','DATETIME NULL'],['clients','provider_id','INT NULL'],['clients','guardian_portal_enabled','BOOLEAN DEFAULT 0'],['clients','is_demo','BOOLEAN DEFAULT 0'],['clients','terminated_at','DATETIME NULL'],['clients','status',"VARCHAR(30) DEFAULT 'ACTIVE'"],['clients','client_type',"VARCHAR(30) DEFAULT 'clinical'"],['agencies','tax_id','VARCHAR(50)'],['agencies','tax_id_ciphertext','TEXT'],['agencies','tax_id_iv','VARCHAR(100)'],['agencies','tax_id_auth_tag','VARCHAR(100)'],['agencies','tax_id_key_id','VARCHAR(100)']])await addColumn(table,column,type);
  for(const sql of [
   'CREATE TABLE IF NOT EXISTS user_info_field_definitions(id INT PRIMARY KEY,field_key VARCHAR(100))',
   'CREATE TABLE IF NOT EXISTS user_info_values(user_id INT,field_definition_id INT,value VARCHAR(255))',
   'CREATE TABLE IF NOT EXISTS office_locations(id INT PRIMARY KEY,agency_id INT,name VARCHAR(100),practice_name VARCHAR(100),practice_npi VARCHAR(20),street_address VARCHAR(150),city VARCHAR(80),state VARCHAR(2),postal_code VARCHAR(20),phone VARCHAR(30),is_active BOOLEAN,use_as_billing_address BOOLEAN)',
   'CREATE TABLE IF NOT EXISTS agency_group_npis(id INT PRIMARY KEY,agency_id INT,office_location_id INT,npi_number VARCHAR(20),is_active BOOLEAN)',
   'CREATE TABLE IF NOT EXISTS clinical_diagnoses(id INT PRIMARY KEY,agency_id INT,client_id INT,icd10_code VARCHAR(20),is_primary BOOLEAN,is_active BOOLEAN,created_at DATETIME)'
  ])await db.query(sql);
  await db.execute("INSERT INTO users(id,first_name,last_name,role,email,status) VALUES(40,'Estimate','Guardian','client_guardian','estimate@example.invalid','ACTIVE') ON DUPLICATE KEY UPDATE is_active=1,is_archived=0,status='ACTIVE',status_expires_at=NULL,terminated_at=NULL");
  await db.execute("INSERT INTO clients(id,agency_id,full_name,initials,date_of_birth,provider_id) VALUES(401,1,'Synthetic Estimate Child','SE','2018-01-01',45) ON DUPLICATE KEY UPDATE provider_id=45,billing_insurance_payload=NULL");
  const [[link]]=await db.execute('SELECT id FROM client_guardians WHERE client_id=401 AND guardian_user_id=40');
  if(!link)await db.execute("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,access_enabled,permissions_json) VALUES(401,40,'guardian',1,'{}')");
  await db.execute("UPDATE client_guardians SET access_enabled=1,permissions_json='{}' WHERE client_id=401 AND guardian_user_id=40");
  await db.execute("INSERT INTO guardian_clinical_grants(agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,evidence_encrypted,reviewed_by_user_id,review_due_date) VALUES(1,401,40,'full',1,'legal_representative','[\"clinical_documents\"]','synthetic',99,'2099-01-01') ON DUPLICATE KEY UPDATE revoked_at=NULL");
  await db.execute("INSERT IGNORE INTO user_info_field_definitions(id,field_key) VALUES(401,'provider_identity_npi_number')");
  await db.execute('DELETE FROM user_info_values WHERE user_id=45 AND field_definition_id=401');
  await db.execute("INSERT INTO user_info_values(user_id,field_definition_id,value) VALUES(45,401,'1234567893')");
  await db.execute("UPDATE agencies SET tax_id='123456789' WHERE id=1");
  await db.execute("INSERT IGNORE INTO office_locations VALUES(401,1,'Synthetic office','Synthetic practice','1234567893','123 Test Street','Denver','CO','80202','5550100',1,1)");
  await db.execute("INSERT IGNORE INTO clinical_diagnoses VALUES(401,1,401,'F43.9',1,1,UTC_TIMESTAMP())");
  pool=(await import('../../config/database.js')).default;clinical=(await import('../../config/clinicalDatabase.js')).default;
  const estimates=await import('../familyCostEstimates.service.js');
  const {activeBillingBenefitRecipient,benefitNoticeFingerprint,billingBenefitNoticeContext}=await import('../billingBenefitsEmail.service.js');
  const {migrationPaymentReady}=await import('../portalMigration.service.js');
  const {writeClientInsurance}=await import('../clientInsurance.service.js');
  const {encryptFamilyBilling}=await import('../familyBillingEncryption.service.js');
  const {coverageFingerprint}=await import('../coverageVerification.service.js');
  let created;
  const requestKey=`synthetic-estimate-${Date.now()}`;
  await t.test('reviewed agency price, full draft creation, issue, encrypted receipt, and access checks',async()=>{
   const rates=await estimates.listCostEstimateRates(1),rate=rates.find(r=>r.serviceCode==='90837');
   const saved=await estimates.saveCostEstimateRate({agencyId:1,actorUserId:99,serviceCode:'90837',description:'Synthetic individual session',amountCents:10000,approved:true,revision:rate.revision,reason:'Synthetic isolated test'});
   const input={agencyId:1,actorUserId:99,clientId:401,guardianUserId:40,officeId:401,serviceLocation:{useBillingOfficeAddress:true},requestKey,startDate:'2026-10-26',coverageEvidence:'Uninsured synthetic fixture',lines:[{serviceCode:'90837',quantity:6,rateRevision:saved.revision}]};
   created=await estimates.createCostEstimate(input);assert.deepEqual(created.missing,[]);
   const again=await estimates.createCostEstimate(input);assert.equal(again.id,created.id);assert.equal(again.existing,true);
   await assert.rejects(estimates.getCostEstimate({agencyId:1,estimateId:created.id,userId:40}),{status:404});
   await estimates.issueCostEstimate({agencyId:1,estimateId:created.id,actorUserId:99});
   const item=await estimates.getCostEstimate({agencyId:1,estimateId:created.id,userId:40});assert.equal(item.snapshot.totalCents,60000);
   assert.equal((await estimates.renderCostEstimatePdf(item)).subarray(0,4).toString(),'%PDF');
   await estimates.acknowledgeCostEstimate({agencyId:1,estimateId:created.id,userId:40,snapshotHash:item.snapshotHash,accepted:true,signatureName:'Synthetic Guardian'});
   assert.equal((await estimates.acknowledgeCostEstimate({agencyId:1,estimateId:created.id,userId:40,snapshotHash:item.snapshotHash,accepted:true,signatureName:'Synthetic Guardian'})).existing,true);
   const [[stored]]=await db.execute('SELECT * FROM family_cost_estimates WHERE id=?',[created.id]);assert.equal(stored.status,'acknowledged');assert.equal(stored.snapshot_encrypted.includes('Synthetic Estimate Child'),false);assert.equal(stored.acknowledgment_encrypted.includes('Synthetic Guardian'),false);
   await assert.rejects(estimates.getCostEstimate({agencyId:2,estimateId:created.id,userId:40}),{status:404});
   await assert.rejects(estimates.getCostEstimate({agencyId:1,estimateId:created.id,userId:10}),{status:404});
   await db.execute('UPDATE guardian_clinical_grants SET revoked_at=UTC_TIMESTAMP() WHERE agency_id=1 AND client_id=401 AND guardian_user_id=40');
   await assert.rejects(estimates.getCostEstimate({agencyId:1,estimateId:created.id,userId:40}),{status:403});
   await db.execute('UPDATE guardian_clinical_grants SET revoked_at=NULL WHERE agency_id=1 AND client_id=401 AND guardian_user_id=40');
  });
  await t.test('same benefit facts and same cohort reserve exactly once under concurrent inserts',async()=>{
   const fingerprint=benefitNoticeFingerprint({insuranceFingerprint:requestKey,facts:{copayCents:2500,coinsuranceBasisPoints:2000,deductibleCents:100000,deductibleRemainingCents:25000}});
   const insert=check=>pool.execute("INSERT IGNORE INTO family_benefit_email_deliveries(agency_id,client_id,coverage_check_id,guardian_user_id,benefit_fingerprint) VALUES(1,401,?,40,?)",[check,fingerprint]);
   const check=Date.now();const values=await Promise.all([insert(check),insert(check+1)]);assert.equal(values.reduce((sum,[r])=>sum+r.affectedRows,0),1);
   const cohort=crypto.createHash('sha256').update(requestKey).digest('hex');
   const claim=()=>pool.execute('INSERT IGNORE INTO family_portal_migration_deliveries(agency_id,guardian_user_id,cohort_label,cohort_fingerprint,created_by_user_id) VALUES(1,40,?,?,99)',[requestKey,cohort]);
   assert.equal((await Promise.all([claim(),claim()])).reduce((sum,[r])=>sum+r.affectedRows,0),1);
   await pool.execute("UPDATE family_portal_migration_deliveries SET status='unknown' WHERE agency_id=1 AND guardian_user_id=40 AND cohort_fingerprint=?",[cohort]);assert.equal((await claim())[0].affectedRows,0);
   await db.execute('INSERT INTO family_portal_migration_enrollments(agency_id,client_id,guardian_user_id,cohort_label,created_by_user_id) VALUES(1,401,40,?,99) ON DUPLICATE KEY UPDATE cohort_label=VALUES(cohort_label)',[requestKey]);
   await db.execute("UPDATE family_portal_migration_enrollments SET information_revision=?,information_confirmed_at=UTC_TIMESTAMP() WHERE agency_id=1 AND client_id=401 AND guardian_user_id=40",['a'.repeat(64)]);
  });
  await t.test('active recipient SQL and current coverage context remain tenant scoped',async()=>{
   assert.equal((await activeBillingBenefitRecipient({agencyId:1,clientId:401,guardianUserId:40,expectedEmail:'estimate@example.invalid'})).id,40);
   await assert.rejects(activeBillingBenefitRecipient({agencyId:2,clientId:401,guardianUserId:40}),{status:409});
   await db.execute('UPDATE users SET status_expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=40');await assert.rejects(activeBillingBenefitRecipient({agencyId:1,clientId:401,guardianUserId:40}),{status:409});await db.execute('UPDATE users SET status_expires_at=NULL WHERE id=40');
   assert.equal(await migrationPaymentReady({agencyId:1,userId:40}),false);
   const insurance=await writeClientInsurance({agencyId:1,clientId:401,primary:{insurerName:'Synthetic commercial',payerId:'SYNTHETIC',memberId:'TEST401',subscriberFirstName:'Synthetic',subscriberLastName:'Parent',subscriberDob:'1985-01-01',relationshipToSubscriber:'self'}});
   const result={elig:{payerid:'SYNTHETIC',eligid:'SYNTHETIC-271',ins_number:'TEST401',ins_name_f:'Synthetic',ins_name_l:'Parent',ins_dob:'19850101',benefit:[{benefit_code:'30',benefit_coverage_code:'1'},...[['B','27','benefit_amount','25'],['A','27','benefit_percent','0.2'],['C','23','benefit_amount','1000'],['C','29','benefit_amount','250']].map(([code,period,key,value])=>({benefit_code:'MH',benefit_coverage_code:code,benefit_period_code:period,benefit_level_code:'IND',inplan_network:'Y',[key]:value}))]}};
   const [check]=await db.execute("INSERT INTO client_coverage_checks(agency_id,client_id,policy_slot,service_date,insurance_fingerprint,request_key,status,evidence_encrypted,created_by_user_id) VALUES(1,401,'primary',UTC_DATE(),?,?,'returned',?,99)",[coverageFingerprint(insurance),requestKey,encryptFamilyBilling({result},'coverage:1:401')]);
   const context=await billingBenefitNoticeContext({agencyId:1,clientId:401,coverageCheckId:check.insertId});assert.equal(context.ready,true,context.reasons.join('; '));
   await assert.rejects(billingBenefitNoticeContext({agencyId:2,clientId:401,coverageCheckId:check.insertId}),{status:404});
  });
 }finally{await db.end();if(pool)await pool.end();if(clinical)await clinical.end();}
});
