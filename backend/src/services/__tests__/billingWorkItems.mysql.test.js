import {it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:async({agencyId,claimId,eventType},db)=>{await db.execute('INSERT INTO test_events(agency_id,claim_id,event_type) VALUES(?,?,?)',[agencyId,claimId,eventType]);}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {loadBillingWorkItems} from '../billingWorkItems.service.js';
import {createClaimResubmission} from '../claimResubmission.service.js';

it.skipIf(!process.env.BILLING_TEST_MYSQL_SOCKET && process.env.BILLING_FOLLOWUP_MYSQL_TEST!=='1')('MySQL work queue and immutable follow-up claims retain source records and exact tenant/encounter links',async()=>{
 const db=await mysql.createConnection(process.env.BILLING_TEST_MYSQL_SOCKET?{socketPath:process.env.BILLING_TEST_MYSQL_SOCKET,user:'root',timezone:'+00:00'}:{host:'127.0.0.1',port:33316,user:'root',password:'synthetic-root-only',timezone:'+00:00'});
 const schema=`billing_work_${randomUUID().replaceAll('-','')}`;
 try{
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  for(const ddl of [
   `CREATE TABLE clinical_sessions(id INT PRIMARY KEY,agency_id INT,client_id INT,appointment_id INT,office_event_id INT,provider_user_id INT,service_code VARCHAR(10),place_of_service VARCHAR(3),updated_at DATETIME,scheduled_start_at DATETIME,scheduled_end_at DATETIME,source_timezone VARCHAR(64),metadata_json JSON,encounter_status VARCHAR(20))`,
   `CREATE TABLE clinical_notes(id INT PRIMARY KEY,agency_id INT,client_id INT,clinical_session_id INT,is_deleted INT DEFAULT 0,provider_signed_at DATETIME,supervisor_cosigned_at DATETIME,supervisor_cosigned_by_user_id INT,is_billable INT,metadata_json JSON,note_type VARCHAR(30))`,
   `CREATE TABLE clinical_note_revision_heads(clinical_note_id INT,agency_id INT,effective_revision_id INT,pending_revision_id INT)`,
   `CREATE TABLE clinical_note_revisions(id INT,agency_id INT,requires_supervisor_cosign INT,responsible_supervisor_user_id INT,snapshot_json JSON,origin VARCHAR(20))`,
   `CREATE TABLE clinical_note_revision_approvals(revision_id INT,agency_id INT,approved_at DATETIME)`,
   `CREATE TABLE clinical_note_revision_signatures(revision_id INT,signature_action VARCHAR(40))`,
   `CREATE TABLE clinical_claims(id INT PRIMARY KEY AUTO_INCREMENT,clinical_session_id INT,agency_id INT,client_id INT,claim_status VARCHAR(20),amount_cents INT,currency_code VARCHAR(3),claim_payload TEXT,metadata_json JSON,created_by_user_id INT,clinical_note_id INT,payer_name VARCHAR(100),destination_payer_id VARCHAR(30),billing_npi VARCHAR(10),rendering_npi VARCHAR(10),taxonomy_code VARCHAR(10),place_of_service VARCHAR(3),date_of_service DATE,claim_lifecycle VARCHAR(30),diagnosis_codes_json JSON,payer_sequence INT DEFAULT 1,parent_claim_id INT,is_deleted INT DEFAULT 0,claim_number VARCHAR(30),billing_revision INT DEFAULT 0,claimmd_last_status VARCHAR(30),updated_at DATETIME)`,
   `CREATE TABLE clinical_claim_lines(id INT PRIMARY KEY AUTO_INCREMENT,clinical_claim_id INT,line_number INT,procedure_code VARCHAR(10),modifiers_json JSON,units DECIMAL(8,2),charge_cents INT,diagnosis_pointers JSON,clinical_note_id INT,service_date DATE)`,
   `CREATE TABLE clinical_claim_change_requests(agency_id INT,clinical_session_id INT,status VARCHAR(30))`,
   `CREATE TABLE clinical_note_drafts(id INT,agency_id INT,client_id INT,user_id INT,clinical_session_id INT,office_event_id INT,service_code VARCHAR(10),date_of_service DATE,updated_at DATETIME,archived_at DATETIME)`,
   `CREATE TABLE appointments(id INT,agency_id INT,clinical_session_id INT,office_event_id INT,provider_user_id INT,service_code VARCHAR(10),start_at DATETIME,end_at DATETIME,source_timezone VARCHAR(64),updated_at DATETIME,status VARCHAR(20))`,
   `CREATE TABLE appointment_participants(appointment_id INT,client_id INT,role VARCHAR(20))`,
   `CREATE TABLE clients(id INT,agency_id INT,full_name VARCHAR(100),initials VARCHAR(10),billing_insurance_payload TEXT)`,
   `CREATE TABLE users(id INT,first_name VARCHAR(40),last_name VARCHAR(40))`,
   `CREATE TABLE test_events(agency_id INT,claim_id INT,event_type VARCHAR(40))`
  ])await db.query(ddl);
  await db.query(`INSERT INTO clients(id,agency_id,full_name) VALUES(10,1,'DEMO One'),(20,2,'DEMO Other')`);
  await db.query(`INSERT INTO users VALUES(90,'DEMO','Provider'),(91,'DEMO','Supervisor')`);
  await db.query(`INSERT INTO clinical_sessions(id,agency_id,client_id,provider_user_id,service_code,scheduled_start_at,scheduled_end_at,encounter_status) VALUES(1,1,10,90,'H0002','2025-01-02','2025-01-02 01:00','completed'),(2,1,10,90,'90834','2025-01-03','2025-01-03 01:00','completed'),(3,1,10,90,'90834','2099-01-03','2099-01-03 01:00','scheduled'),(4,2,20,90,'H0002','2025-01-02','2025-01-02 01:00','completed')`);
  await db.query(`INSERT INTO clinical_notes(id,agency_id,client_id,clinical_session_id,provider_signed_at,supervisor_cosigned_at,supervisor_cosigned_by_user_id,is_billable) VALUES(11,1,10,1,'2025-01-02','2025-01-02',91,1),(14,2,20,4,'2025-01-02','2025-01-02',91,1)`);
  await db.query(`INSERT INTO clinical_note_revision_heads VALUES(11,1,101,NULL),(14,2,104,NULL)`);
  await db.query(`INSERT INTO clinical_note_revisions VALUES(101,1,1,91,'{"isBillable":true,"encounterContext":{"dateOfService":"2025-01-02","serviceCode":"H0002","placeOfService":"10","billingPrimaryUnits":1}}','original'),(104,2,1,91,'{}','original')`);
  await db.query(`INSERT INTO clinical_note_drafts(id,agency_id,client_id,user_id,clinical_session_id,service_code,date_of_service) VALUES(21,1,10,90,2,'90834','2025-01-03'),(22,1,10,90,NULL,'90791','2025-01-04')`);
  const deps={clinical:db,main:db};let result=await loadBillingWorkItems([1],deps);
  expect(result.items).toHaveLength(3);expect(result.items.find(r=>r.clinical_note_id===11)).toMatchObject({stage:'ready_to_submit',canPrepareClaim:true,client_name:'DEMO One',supervisor_name:'DEMO Supervisor',place_of_service:'10'});
  expect(result.items.filter(r=>r.stage==='draft')).toHaveLength(2);expect(result.items.some(r=>r.clinical_session_id===3)).toBe(false);
  await db.query(`INSERT INTO clinical_claims(id,clinical_session_id,agency_id,client_id,clinical_note_id,claim_lifecycle,billing_revision,amount_cents,payer_name,metadata_json,diagnosis_codes_json,date_of_service) VALUES(30,1,1,10,11,'paid',2,1000,'Synthetic payer','{"clinicalVersion":{"revisionId":101,"contentHash":"saved"}}','["R69"]','2025-01-02')`);
  await db.query(`INSERT INTO clinical_claim_lines(clinical_claim_id,line_number,procedure_code,units,charge_cents,diagnosis_pointers,clinical_note_id,service_date) VALUES(30,1,'H0002',1,1000,'[1]',11,'2025-01-02')`);
  const [[before]]=await db.query('SELECT * FROM clinical_claims WHERE id=30');
  const pool={getConnection:async()=>({...db,execute:db.execute.bind(db),beginTransaction:db.beginTransaction.bind(db),commit:db.commit.bind(db),rollback:db.rollback.bind(db),release:()=>{}})};
  const input={agencyId:1,claimId:30,actorUserId:91,kind:'replacement',revision:2,reason:'Correct approved diagnosis context',attested:true,payerSupportsElectronicCorrection:true,payerControlNumber:'TEST-ICN'};
  const created=await createClaimResubmission(input,pool);expect(created.claimTransmitted).toBe(false);expect(created.claimId).not.toBe(30);
  const repeated=await createClaimResubmission(input,pool);expect(repeated).toMatchObject({claimId:created.claimId,alreadyExists:true});
  const [[after]]=await db.query('SELECT * FROM clinical_claims WHERE id=30');expect(after).toEqual(before);
  const [[clone]]=await db.query('SELECT * FROM clinical_claims WHERE id=?',[created.claimId]);expect(clone.claim_lifecycle).toBe('draft');expect(clone.claim_number).toBe(null);expect(clone.metadata_json.clinicalVersion).toEqual(before.metadata_json.clinicalVersion);
  const [[lines]]=await db.query('SELECT COUNT(*) n FROM clinical_claim_lines WHERE clinical_claim_id=?',[created.claimId]);expect(lines.n).toBe(1);
  const [[events]]=await db.query('SELECT COUNT(*) n FROM test_events');expect(events.n).toBe(2);
  result=await loadBillingWorkItems([1],deps);expect(result.items.find(r=>r.claimId===created.claimId)).toMatchObject({stage:'ready_to_submit',canReviewClaim:true,resubmission_type:'replacement',billing_revision:0});
  await expect(createClaimResubmission({...input,kind:'void'},pool)).rejects.toThrow('already exists');
 }finally{await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
},20000);
