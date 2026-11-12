import fs from 'node:fs/promises';
import {beforeAll,beforeEach,afterAll,it,expect,describe,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
import {createNoteworthyDeletion} from '../noteworthyDeletion.service.js';
import {createNoteworthyLifecycle} from '../noteworthyLifecycle.service.js';
import {requireNoteworthyTrialSchema} from '../noteworthyReleaseReadiness.service.js';

describe.skipIf(!recoveryMysqlEnabled)('NoteWorthy erasure — actual isolated MySQL',()=>{
  let fixture,db,access,erase,remove;
  beforeAll(async()=>{
    fixture=await isolatedWorkflowMysql('noteworthy_erase');db=fixture.db;
    await db.query(`CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(100),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,feature_flags JSON);
      `).catch(error=>{throw error;});
    for(const sql of [
      "CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(100),last_name VARCHAR(100),email VARCHAR(200),role VARCHAR(30),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,is_roster_placeholder TINYINT DEFAULT 0)",
      'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT DEFAULT 1,has_payroll_access TINYINT DEFAULT 1,FOREIGN KEY(agency_id) REFERENCES agencies(id))',
      'CREATE TABLE payroll_periods(id INT PRIMARY KEY,agency_id INT,FOREIGN KEY(agency_id) REFERENCES agencies(id))',
      'CREATE TABLE payroll_imports(id INT PRIMARY KEY,agency_id INT,payroll_period_id INT,FOREIGN KEY(payroll_period_id) REFERENCES payroll_periods(id))',
      'CREATE TABLE payroll_import_rows(id INT PRIMARY KEY,payroll_import_id INT,body TEXT,FOREIGN KEY(payroll_import_id) REFERENCES payroll_imports(id))',
      'CREATE TABLE payroll_shadow_aggregate(id INT PRIMARY KEY,payroll_import_row_id INT,body TEXT)',
      'CREATE TABLE payroll_summaries(id INT PRIMARY KEY,agency_id INT,payroll_period_id INT,breakdown TEXT,FOREIGN KEY(payroll_period_id) REFERENCES payroll_periods(id))',
      'CREATE TABLE payroll_report_email_deliveries(id INT PRIMARY KEY,agency_id INT,payroll_period_id INT,attachment_payload_enc TEXT)',
      'CREATE TABLE payroll_reimbursement_claims(id INT PRIMARY KEY,agency_id INT,receipt_file_path VARCHAR(500))',
      'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT)',
      'CREATE TABLE support_tickets(id INT PRIMARY KEY,agency_id INT)',
      'CREATE TABLE support_ticket_messages(id INT PRIMARY KEY,ticket_id INT,body TEXT,is_internal TINYINT,FOREIGN KEY(ticket_id) REFERENCES support_tickets(id))',
      'CREATE TABLE organization_agreement_records(id CHAR(36) PRIMARY KEY,agency_id INT,kind VARCHAR(30),payload TEXT)',
      'CREATE TABLE organization_agreement_events(id INT PRIMARY KEY,agency_id INT,record_id CHAR(36),FOREIGN KEY(record_id) REFERENCES organization_agreement_records(id))'
    ])await db.query(sql);
    for(const name of ['1810_noteworthy_payroll_onboarding.sql','1811_noteworthy_trial_contact_and_deletion.sql']){
      const source=await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');for(const statement of source.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.query(statement);
    }
    expect(await requireNoteworthyTrialSchema(db)).toMatchObject({ready:true});
    access=createNoteworthyLifecycle({db});
  },30000);
  beforeEach(async()=>{
    for(const table of ['noteworthy_deletion_jobs','noteworthy_message_receipts','noteworthy_contact_threads','support_ticket_messages','support_tickets','organization_agreement_events','organization_agreement_records','noteworthy_employee_invites','noteworthy_roster','noteworthy_credential_rates','noteworthy_import_receipts','noteworthy_email_verifications','noteworthy_signups','noteworthy_practices','payroll_shadow_aggregate','payroll_import_rows','payroll_imports','payroll_summaries','payroll_report_email_deliveries','payroll_reimbursement_claims','payroll_periods','clients','user_agencies','users','agencies'])await db.query(`DELETE FROM ${table}`);
    await db.query(`INSERT INTO agencies(id,name,slug,feature_flags) VALUES(1,'Erase This Practice','erase-this','{"noteworthyPayrollOnly":true}'),(2,'Keep Other Practice','keep-other','{"noteworthyPayrollOnly":true}')`);
    await db.query("INSERT INTO users(id,first_name,last_name,email,role,is_roster_placeholder) VALUES(1,'Shared','Owner','owner@example.test','provider',0),(2,'Other','Owner','other@example.test','provider',0),(3,'Private','Roster',NULL,'provider',1)");
    await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(1,1),(2,2),(3,1)');
    await db.query("INSERT INTO noteworthy_practices(agency_id,owner_user_id,trial_policy_version,trial_policy_accepted_at,deletion_requested_at) VALUES(1,1,1,UTC_TIMESTAMP(),UTC_TIMESTAMP()),(2,2,1,UTC_TIMESTAMP(),NULL)");
    await db.query("INSERT INTO noteworthy_roster(agency_id,payroll_user_id,source_name_key) VALUES(1,3,'private roster')");
    await db.query('INSERT INTO payroll_periods VALUES(10,1),(20,2)');await db.query('INSERT INTO payroll_imports VALUES(100,1,10),(200,2,20)');
    await db.query("INSERT INTO payroll_import_rows VALUES(1000,100,'erase patient data'),(2000,200,'keep other patient data')");
    await db.query("INSERT INTO payroll_shadow_aggregate VALUES(1,1000,'erase derived data'),(2,2000,'keep derived data')");
    await db.query("INSERT INTO payroll_summaries VALUES(1,1,10,'erase prepared pay'),(2,2,20,'keep prepared pay')");
    await db.query("INSERT INTO payroll_report_email_deliveries VALUES(1,1,10,'erase encrypted export'),(2,2,20,'keep encrypted export')");
    await db.query("INSERT INTO payroll_reimbursement_claims VALUES(1,1,'uploads/reimbursements/owned.pdf'),(2,2,'uploads/reimbursements/other.pdf')");
    await db.query("INSERT INTO noteworthy_deletion_jobs(agency_id,reason,requested_by_user_id) VALUES(1,'owner_request',1)");
    remove=vi.fn();erase=createNoteworthyDeletion({db,access,deleteObject:remove,encrypt:v=>({payload:v}),decrypt:v=>v.payload,openAgreement:JSON.parse});
  });
  afterAll(async()=>fixture?.close());
  it('really deletes source, derived, prepared and export records while preserving a different tenant and shared login',async()=>{
    expect(await erase.runOne(1)).toMatchObject({completed:true,deletedObjects:1});expect(remove).toHaveBeenCalledWith('uploads/reimbursements/owned.pdf');
    for(const table of ['payroll_import_rows','payroll_shadow_aggregate','payroll_summaries','payroll_report_email_deliveries']){const [[row]]=await db.query(`SELECT COUNT(*) n FROM ${table}`);expect(Number(row.n)).toBe(1);}
    const [[other]]=await db.query('SELECT body FROM payroll_import_rows');expect(other.body).toBe('keep other patient data');
    const [[owner]]=await db.query('SELECT email FROM users WHERE id=1');expect(owner.email).toBe('owner@example.test');
    const [[roster]]=await db.query('SELECT first_name,is_active FROM users WHERE id=3');expect(roster).toMatchObject({first_name:'Deleted',is_active:0});
    const [[job]]=await db.query('SELECT status,object_manifest_enc FROM noteworthy_deletion_jobs');expect(job).toEqual({status:'completed',object_manifest_enc:null});
    expect(await erase.runOne(1)).toMatchObject({skipped:true});
  });
  it('retains the encrypted retry manifest and database rows until object removal actually succeeds',async()=>{
    remove.mockRejectedValueOnce(new Error('Synthetic storage failure'));expect(await erase.runOne(1)).toMatchObject({completed:false});
    const [[before]]=await db.query('SELECT COUNT(*) n FROM payroll_import_rows');expect(Number(before.n)).toBe(2);
    const [[job]]=await db.query('SELECT status,object_manifest_enc FROM noteworthy_deletion_jobs');expect(job.status).toBe('retry');expect(job.object_manifest_enc).toBeTruthy();
    expect(await erase.runOne(1)).toMatchObject({completed:true});
  });
  it('does not erase a clinical workspace or a shared file used by another tenant',async()=>{
    await db.query('INSERT INTO clients VALUES(1,1)');expect(await erase.runOne(1)).toMatchObject({completed:false,errorCode:'EHR_DATA_REVIEW_REQUIRED'});expect(remove).not.toHaveBeenCalled();
    await db.query('DELETE FROM clients');await db.query("UPDATE payroll_reimbursement_claims SET receipt_file_path='uploads/reimbursements/owned.pdf' WHERE agency_id=2");
    expect(await erase.runOne(1)).toMatchObject({completed:false,errorCode:'DELETION_SHARED_OBJECT_REVIEW'});expect(remove).not.toHaveBeenCalled();
  });
  it('deletes draft agreements while retaining required executed agreements and their evidence',async()=>{
    await db.execute('INSERT INTO organization_agreement_records VALUES(?,?,?,?),(?,?,?,?)',['signed',1,'agreement',JSON.stringify({status:'completed'}),'draft',1,'agreement',JSON.stringify({status:'draft'})]);
    await db.query("INSERT INTO organization_agreement_events VALUES(1,1,'signed'),(2,1,'draft')");
    expect(await erase.runOne(1)).toMatchObject({completed:true});const [rows]=await db.query('SELECT id FROM organization_agreement_records');expect(rows).toEqual([{id:'signed'}]);const [events]=await db.query('SELECT record_id FROM organization_agreement_events');expect(events).toEqual([{record_id:'signed'}]);
  });
  it('automatically removes an expired consented trial while honoring retention, paid plans, legacy and unaccepted policies',async()=>{
    await db.query('DELETE FROM noteworthy_deletion_jobs');
    await db.query("UPDATE noteworthy_practices SET deletion_requested_at=NULL,trial_started_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 DAY),trial_ends_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),retention_days=7 WHERE agency_id=1");
    await db.query("UPDATE noteworthy_practices SET trial_ends_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),commercial_activated_at=UTC_TIMESTAMP() WHERE agency_id=2");
    expect(await erase.tick()).toEqual([]);
    await db.query("UPDATE noteworthy_practices SET retention_days=0,trial_policy_version=0 WHERE agency_id=1");
    expect(await erase.tick()).toEqual([]);
    await db.query('UPDATE noteworthy_practices SET trial_policy_version=1,trial_policy_accepted_at=NULL WHERE agency_id=1');
    expect(await erase.tick()).toEqual([]);
    await db.query('UPDATE noteworthy_practices SET trial_policy_accepted_at=UTC_TIMESTAMP() WHERE agency_id=1');
    expect(await erase.tick()).toMatchObject([{completed:true}]);
    const [[other]]=await db.query('SELECT COUNT(*) n FROM payroll_import_rows WHERE payroll_import_id=200');expect(Number(other.n)).toBe(1);
  });
});
