/** Real disposable-MySQL profile import, encrypted evidence and school-site integration.
 * No clinical, encounter, appointment or session tables exist in this fixture. */
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({schema:`codex_billing_profile_${process.pid}_${Date.now()}`}));
vi.mock('../../config/database.js',async()=>({default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT||1),user:'root',password:'',database:m.schema,timezone:'+00:00',connectionLimit:5})}));
vi.mock('../paySystem.service.js',()=>({loadUserPaySystemContext:vi.fn(),computeLineAmount:vi.fn()}));
import pool from '../../config/database.js';
import PayrollImportRow from '../../models/PayrollImportRow.model.js';
import {enrichPayrollBillingImport} from '../payrollBillingClientImport.service.js';
import {billingImportMetadata} from '../../utils/payrollBillingImportMetadata.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';

describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('payroll billing profile import with actual SQL and encryption',()=>{
 let admin,created=false;
 const profile=extra=>({fullName:'Alex Rivera',dateOfBirth:'2010-04-09',primaryPayer:'Example Health',explicitMemberId:'MEMBER-SYNTHETIC-1',...extra});
 const raw=(extra={},source={})=>({payrollImportId:8,payrollPeriodId:7,agencyId:2,userId:55,providerName:'Synthetic Provider',patientFirstName:'Alex',serviceCode:'90837',serviceDate:'2026-10-20',location:'Synthetic School',noteStatus:'FINALIZED',unitCount:1,rowFingerprint:'a'.repeat(64),...extra,...billingImportMetadata({sourceRowNumber:2,placeOfService:'03',profileFields:profile(),...source})});
 const apply=rows=>enrichPayrollBillingImport({agencyId:2,payrollImportId:8,rows,actorId:99});
 const stored=async table=>(await pool.query(`SELECT * FROM ${table} ORDER BY id`))[0];
 const observations=async()=>(await pool.query('SELECT * FROM billing_client_profile_observations ORDER BY id'))[0];
 const evidence=async()=>(await pool.query('SELECT * FROM payroll_school_client_evidence ORDER BY payroll_import_row_id'))[0];
 const chart=async id=>(await pool.query('SELECT * FROM clients WHERE id=?',[id]))[0][0];
 const decodeObservation=o=>decryptFamilyBilling(o.observed_fields_payload,`billing-client-profile-observation:${o.agency_id}:${o.payroll_import_id}:${o.source_row_number}:${o.row_fingerprint}`);
 beforeAll(async()=>{
  vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,4).toString('base64'));vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_ID','fixture');vi.stubEnv('FAMILY_BILLING_PREVIOUS_KEYS_JSON','{}');
  vi.stubEnv('CLIENT_PHI_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,5).toString('base64'));vi.stubEnv('BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,6).toString('base64'));vi.stubEnv('BILLING_ENCRYPTION_KEY_ID','fixture');
  if(!/^codex_billing_profile_\d+_\d+$/.test(m.schema))throw Error('Disposable schema required');
  admin=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:''});
  await admin.query(`CREATE DATABASE ${m.schema}`);created=true;
  for(const sql of [
   'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(255),organization_type VARCHAR(32))',
   'CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(100),last_name VARCHAR(100))',
   `CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT NOT NULL,organization_id INT,client_type VARCHAR(32),status VARCHAR(32),full_name VARCHAR(255),date_of_birth DATE,gender VARCHAR(64),address_street VARCHAR(255),address_apt VARCHAR(64),address_city VARCHAR(100),address_state VARCHAR(50),address_zip VARCHAR(20),contact_phone VARCHAR(20),email VARCHAR(255),primary_insurer_name VARCHAR(255),insurance_member_id VARCHAR(128),insurance_group_number VARCHAR(128),insurance_subscriber_name VARCHAR(255),billing_insurance_payload JSON,demographics_phi_enc JSON)`,
   'CREATE TABLE client_billing_identities(agency_id INT,client_id INT,member_id_hash CHAR(64))',
   'CREATE TABLE client_provider_assignments(id INT AUTO_INCREMENT PRIMARY KEY,client_id INT,provider_user_id INT,organization_id INT,is_active BOOLEAN)',
   'CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active BOOLEAN)',
   'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active BOOLEAN)',
   'CREATE TABLE agency_service_locations(id INT PRIMARY KEY,agency_id INT,name VARCHAR(255),school_organization_id INT,place_of_service VARCHAR(16),location_kind VARCHAR(32))',
   'CREATE TABLE payroll_periods(id INT PRIMARY KEY,agency_id INT,period_start DATE,period_end DATE,status VARCHAR(32))',
   'CREATE TABLE payroll_imports(id INT PRIMARY KEY,agency_id INT,payroll_period_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
   `CREATE TABLE payroll_import_rows(id INT AUTO_INCREMENT PRIMARY KEY,payroll_import_id INT,payroll_period_id INT,agency_id INT,user_id INT,provider_name VARCHAR(255),patient_first_name VARCHAR(255),provider_name_ciphertext_b64 TEXT,provider_name_iv_b64 VARCHAR(64),provider_name_auth_tag_b64 VARCHAR(64),provider_name_key_id VARCHAR(64),patient_first_name_ciphertext_b64 TEXT,patient_first_name_iv_b64 VARCHAR(64),patient_first_name_auth_tag_b64 VARCHAR(64),patient_first_name_key_id VARCHAR(64),service_code VARCHAR(32),location VARCHAR(255),service_date DATE,note_status VARCHAR(32),appt_type VARCHAR(255),amount_collected DECIMAL(12,2),client_paid_amount DECIMAL(12,2),billed_amount DECIMAL(12,2),paid_status VARCHAR(128),draft_payable BOOLEAN DEFAULT 1,unit_count DECIMAL(12,6),raw_row JSON,row_fingerprint CHAR(64),requires_processing BOOLEAN DEFAULT 0,processed_at DATETIME,processed_by_user_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  ])await pool.query(sql);
  for(const name of ['1715_billing_client_profile_observations.sql','1716_payroll_school_client_evidence.sql','1717_payroll_billing_source_metadata.sql']){
   const sql=await readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');
   for(const statement of splitSqlStatements(sql))await pool.query(statement);
  }
 });
 beforeEach(async()=>{
  await pool.query('DROP TRIGGER IF EXISTS synthetic_school_evidence_failure');
  for(const table of ['payroll_school_client_evidence','billing_client_profile_observations','payroll_import_rows','payroll_imports','payroll_periods','client_billing_identities','client_provider_assignments','client_organization_assignments','agency_service_locations','organization_affiliations','clients','users','agencies'])await pool.query(`DELETE FROM ${table}`);
  await pool.query("INSERT INTO agencies VALUES (2,'Synthetic Agency','agency'),(6,'Foreign Agency','agency'),(100,'Synthetic School','school')");
  await pool.query("INSERT INTO users VALUES (55,'Synthetic','Provider'),(99,'Synthetic','Administrator')");
  await pool.query("INSERT INTO clients(id,agency_id,organization_id,client_type,status,full_name,date_of_birth) VALUES (10,2,100,'school','ACTIVE','Alex Rivera','2010-04-09'),(11,2,2,'clinical','ACTIVE','Maya Chen','2012-01-02'),(20,6,100,'school','ACTIVE','Dana Foreign','2009-05-06')");
  await pool.query('INSERT INTO client_provider_assignments(client_id,provider_user_id,organization_id,is_active) VALUES (10,55,100,1),(11,55,2,1)');
  await pool.query('INSERT INTO client_organization_assignments VALUES (10,100,1)');
  await pool.query('INSERT INTO organization_affiliations VALUES (2,100,1)');
  await pool.query("INSERT INTO agency_service_locations VALUES (1,2,'Synthetic School',100,'03','school'),(2,2,'Synthetic Office',NULL,'11','office')");
  await pool.query("INSERT INTO payroll_periods VALUES (7,2,'2026-10-10','2026-10-23','draft')");
  await pool.query('INSERT INTO payroll_imports(id,agency_id,payroll_period_id) VALUES (8,2,7)');
  delete PayrollImportRow.__hasClientPaidColumn;
 });
 afterAll(async()=>{
  await pool.end();
  if(created)await admin.query(`DROP DATABASE ${m.schema}`);
  await admin?.end();vi.unstubAllEnvs();
 });
 it('fills safe profile blanks, encrypts source evidence and verifies only school-site rows without importing sessions',async()=>{
  const rows=[raw({}, {profileFields:profile({email:'alex@synthetic.test',contactPhone:'(303) 555-0142'})}),raw({location:'Synthetic Office',rowFingerprint:'b'.repeat(64)}, {sourceRowNumber:3,placeOfService:'11'})];
  expect(JSON.stringify(rows)).not.toContain('Alex Rivera');expect(JSON.stringify(rows)).not.toContain('MEMBER-SYNTHETIC-1');
  expect(await PayrollImportRow.bulkInsert(rows)).toBe(2);const result=await apply(rows);
  expect(result).toMatchObject({status:'completed',schoolRows:1,excludedRows:1,schoolReviewRows:0});
  const client=await chart(10);expect(client.email).toBe('alex@synthetic.test');expect(client.contact_phone).toBe('+13035550142');
  expect(decryptFamilyBilling(client.billing_insurance_payload,'client-insurance:2:10')).toMatchObject({verifiedForClaims:false,primary:{insurerName:'Example Health',memberId:'MEMBER-SYNTHETIC-1'}});
  const original=await stored('payroll_import_rows');expect(original).toHaveLength(2);expect(original.every(r=>r.raw_row===null)).toBe(true);expect(original.map(r=>r.source_row_number)).toEqual([2,3]);
  expect(JSON.stringify(original)).not.toContain('Alex Rivera');expect(JSON.stringify(original)).not.toContain('MEMBER-SYNTHETIC-1');expect(JSON.stringify(original)).not.toContain('Example Health');
  const source=await observations();expect(source).toHaveLength(2);expect(decodeObservation(source[0]).fields.fullName).toBe('Alex Rivera');expect(JSON.stringify(source.map(r=>r.observed_fields_payload))).not.toContain('Alex Rivera');
  const classified=await evidence();expect(classified.map(r=>[r.school_service,r.evidence_status])).toEqual([[1,'verified_school'],[0,'excluded']]);
  const [tables]=await pool.query("SHOW TABLES LIKE 'clinical_sessions'");expect(tables).toHaveLength(0);const [encounters]=await pool.query("SHOW TABLES LIKE 'billing_encounters'");expect(encounters).toHaveLength(0);
 });
 it('enriches a payment-row profile without creating another payroll row, school-service row or session',async()=>{
  const payment={sourceRowNumber:4,serviceDate:'2026-10-22',providerName:'Synthetic Provider',placeOfService:'11',location:'Synthetic Office',rowType:'Payment',profileFields:{fullName:'Maya Chen',dateOfBirth:'2012-01-02',primaryPayer:'Payment Report Plan',explicitMemberId:'PAYMENT-MEMBER-2',email:'maya@synthetic.test'}};
  const rows=[raw({}, {additionalProfileRows:[payment]})];
  expect(JSON.stringify(rows)).not.toContain('Maya Chen');expect(JSON.stringify(rows)).not.toContain('PAYMENT-MEMBER-2');
  await PayrollImportRow.bulkInsert(rows);const result=await apply(rows);
  expect(result).toMatchObject({status:'completed',matchedRows:2,schoolRows:1,schoolReviewRows:0});
  const client=await chart(11);expect(client.email).toBe('maya@synthetic.test');expect(decryptFamilyBilling(client.billing_insurance_payload,'client-insurance:2:11')).toMatchObject({verifiedForClaims:false,primary:{insurerName:'Payment Report Plan',memberId:'PAYMENT-MEMBER-2'}});
  const history=await observations();expect(history).toHaveLength(2);const paymentEvidence=history.find(row=>row.source_row_number===4);expect(paymentEvidence.client_id).toBe(11);expect(decodeObservation(paymentEvidence).fields.fullName).toBe('Maya Chen');
  expect(await stored('payroll_import_rows')).toHaveLength(1);expect(await evidence()).toHaveLength(1);expect((await evidence())[0]).toMatchObject({client_id:10,school_service:1});
  expect(await apply(rows)).toMatchObject({alreadyProcessedRows:2,schoolRows:1});expect(await observations()).toHaveLength(2);
  const [clinicalTables]=await pool.query("SHOW TABLES LIKE 'clinical_sessions'");expect(clinicalTables).toHaveLength(0);
 });
 it('re-evaluates a payment-row identity when only the reported provider is corrected',async()=>{
  const payment={sourceRowNumber:4,serviceDate:'2026-10-22',providerName:'Wrong Provider Name',placeOfService:'11',location:'Synthetic Office',rowType:'Payment',profileFields:{fullName:'Maya Chen',dateOfBirth:'',primaryPayer:'Payment Report Plan',email:'maya@synthetic.test'}};
  const initial=[raw({}, {additionalProfileRows:[payment]})];await PayrollImportRow.bulkInsert(initial);
  expect(await apply(initial)).toMatchObject({status:'completed',matchedRows:1,unmatchedRows:1,schoolRows:1});expect((await chart(11)).email).toBeNull();
  const corrected=[raw({}, {additionalProfileRows:[{...payment,providerName:'Synthetic Provider'}]})];
  expect(await apply(corrected)).toMatchObject({status:'completed',alreadyProcessedRows:1,matchedRows:1,schoolRows:1});expect((await chart(11)).email).toBe('maya@synthetic.test');
  const history=(await observations()).filter(row=>row.source_row_number===4);expect(history).toHaveLength(2);expect(history.map(row=>row.client_id)).toEqual([null,11]);expect(history[0].row_fingerprint).not.toBe(history[1].row_fingerprint);expect(history[1].match_method).toBe('exact_full_name_assigned_provider');
  expect(await apply(corrected)).toMatchObject({alreadyProcessedRows:2,schoolRows:1});expect(await observations()).toHaveLength(3);expect(await stored('payroll_import_rows')).toHaveLength(1);expect(await evidence()).toHaveLength(1);
 });
 it('deduplicates an exact batch retry and keeps existing school-client identity',async()=>{
  const rows=[raw()];await PayrollImportRow.bulkInsert(rows);await apply(rows);const result=await apply(rows);
  expect(result).toMatchObject({status:'completed',alreadyProcessedRows:1,schoolRows:1,schoolReviewRows:0});expect(await observations()).toHaveLength(1);expect(await evidence()).toHaveLength(1);
  expect((await evidence())[0]).toMatchObject({client_id:10,match_status:'matched',school_service:1});
 });
 it('accepts a corrected replacement report and preserves previous encrypted source history',async()=>{
  const first=[raw()];await PayrollImportRow.bulkInsert(first);await apply(first);
  await PayrollImportRow.deleteByImportId(8);expect(await evidence()).toHaveLength(0);expect(await observations()).toHaveLength(1);
  const corrected=[raw({rowFingerprint:'c'.repeat(64)},{profileFields:profile({email:'new@synthetic.test',primaryPayer:'Conflicting Report Plan'})})];
  await PayrollImportRow.bulkInsert(corrected);const result=await apply(corrected);expect(result).toMatchObject({status:'completed',schoolRows:1});
  const history=await observations();expect(history).toHaveLength(2);expect(history[0].row_fingerprint).not.toBe(history[1].row_fingerprint);expect(decodeObservation(history[0]).fields.email).toBe('');expect(decodeObservation(history[1]).fields.email).toBe('new@synthetic.test');
  const client=await chart(10);expect(client.email).toBe('new@synthetic.test');expect(decryptFamilyBilling(client.billing_insurance_payload,'client-insurance:2:10').primary.insurerName).toBe('Example Health');
  expect(await apply(corrected)).toMatchObject({alreadyProcessedRows:1,schoolRows:1});expect(await observations()).toHaveLength(2);
 });
 it('retains encrypted profile-change provenance after the raw payroll import is deleted',async()=>{
  const rows=[raw({}, {profileFields:profile({email:'retained@synthetic.test'})})];await PayrollImportRow.bulkInsert(rows);expect(await apply(rows)).toMatchObject({status:'completed',schoolRows:1});
  const original=(await observations())[0];expect(original.payroll_import_id).toBe(8);expect(decodeObservation(original).fields.email).toBe('retained@synthetic.test');
  await PayrollImportRow.deleteByImportId(8);await pool.query('DELETE FROM payroll_imports WHERE id=8 AND agency_id=2');
  const [[imports]]=await pool.query('SELECT COUNT(*) count FROM payroll_imports WHERE id=8');expect(imports.count).toBe(0);expect(await stored('payroll_import_rows')).toHaveLength(0);expect(await evidence()).toHaveLength(0);
  const retained=await observations();expect(retained).toHaveLength(1);expect(retained[0]).toMatchObject({id:original.id,payroll_import_id:8,source_row_number:2,row_fingerprint:original.row_fingerprint,client_id:10});
  expect(decodeObservation(retained[0]).fields.email).toBe('retained@synthetic.test');expect((await chart(10)).email).toBe('retained@synthetic.test');expect(decryptFamilyBilling((await chart(10)).billing_insurance_payload,'client-insurance:2:10').primary.insurerName).toBe('Example Health');
 });
 it('does not overwrite verified coverage, its patient details or verification sources',async()=>{
  const insurance={verifiedForClaims:true,confirmedBy:99,profileId:45,coverageSources:{primary:{profileId:45,slot:'primary'}},patient:{firstName:'Existing',lastName:'Patient',dateOfBirth:'2010-04-09'},primary:{insurerName:'Confirmed Plan',memberId:'MEMBER-SYNTHETIC-1'},secondary:{insurerName:'Confirmed Second'},acceptAssignment:true,updatedAt:'2026-09-01T00:00:00.000Z'};
  await pool.query('UPDATE clients SET billing_insurance_payload=? WHERE id=10',[encryptFamilyBilling(insurance,'client-insurance:2:10')]);const before=(await chart(10)).billing_insurance_payload;
  const rows=[raw({}, {profileFields:profile({primaryPayer:'Reported Other Plan'})})];await PayrollImportRow.bulkInsert(rows);expect(await apply(rows)).toMatchObject({status:'completed',schoolRows:1});
  const client=await chart(10);expect(client.billing_insurance_payload).toEqual(before);expect(decryptFamilyBilling(client.billing_insurance_payload,'client-insurance:2:10')).toEqual(insurance);expect(client.primary_insurer_name).toBe('Confirmed Plan');
 });
 it('uses exact full name plus current provider assignment when the report omits DOB, never first name alone',async()=>{
  const rows=[raw({}, {profileFields:profile({dateOfBirth:''})}),raw({rowFingerprint:'b'.repeat(64)},{sourceRowNumber:3,profileFields:{fullName:'Alex',primaryPayer:'Example Health'}})];
  await PayrollImportRow.bulkInsert(rows);const result=await apply(rows);expect(result).toMatchObject({status:'completed',schoolRows:1,schoolReviewRows:1});
  const source=await observations();expect(source[0].match_method).toBe('exact_full_name_assigned_provider');expect(source[1].client_id).toBeNull();
 });
 it('holds ambiguous identities and foreign-tenant clients for review instead of guessing',async()=>{
  await pool.query("INSERT INTO clients(id,agency_id,organization_id,client_type,status,full_name,date_of_birth) VALUES (12,2,100,'school','ACTIVE','Alex Rivera','2010-04-09')");
  const rows=[raw(),raw({patientFirstName:'Dana',rowFingerprint:'b'.repeat(64)},{sourceRowNumber:3,profileFields:{fullName:'Dana Foreign',dateOfBirth:'2009-05-06'}})];
  await PayrollImportRow.bulkInsert(rows);expect(await apply(rows)).toMatchObject({status:'completed',schoolRows:0,schoolReviewRows:2,ambiguousRows:1,unmatchedRows:1});expect((await evidence()).every(r=>r.client_id===null)).toBe(true);expect((await chart(20)).billing_insurance_payload).toBeNull();
 });
 it('rolls back profile and evidence changes on failure while retaining raw payroll rows and a visible review status',async()=>{
  const rows=[raw({}, {profileFields:profile({email:'rollback@synthetic.test'})})];await PayrollImportRow.bulkInsert(rows);
  await pool.query("CREATE TRIGGER synthetic_school_evidence_failure BEFORE INSERT ON payroll_school_client_evidence FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic school classification failure'");
  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{expect(await apply(rows)).toMatchObject({status:'review_required',errorCode:'client_profile_enrichment_failed',processedRows:0});}finally{warning.mockRestore();}
  const client=await chart(10);expect(client.email).toBeNull();expect(client.primary_insurer_name).toBeNull();expect(client.billing_insurance_payload).toBeNull();expect(await observations()).toHaveLength(0);expect(await evidence()).toHaveLength(0);expect(await stored('payroll_import_rows')).toHaveLength(1);
  const [[upload]]=await pool.query('SELECT client_profile_summary_json FROM payroll_imports WHERE id=8');const summary=typeof upload.client_profile_summary_json==='string'?JSON.parse(upload.client_profile_summary_json):upload.client_profile_summary_json;expect(summary.status).toBe('review_required');
 });
});
