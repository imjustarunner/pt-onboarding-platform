import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements,stripSqlLineComments} from '../../utils/migrationSql.js';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {claimFinancialReview} from '../claimFinancialReview.service.js';
import {excludeNoteFromBilling,assertNoteBillingAllowed} from '../noteBillingDisposition.service.js';
const socket=process.env.CLAIM_BILLING_MYSQL_SOCKET;
const suite=socket?describe:describe.skip;
suite('claim billing changes against isolated synthetic MySQL',()=>{
 let admin,db;
 beforeEach(()=>vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64')));
 async function migration(file){const sql=await readFile(new URL(`../../../../database/${file}`,import.meta.url),'utf8');for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await db.query(statement);}
 beforeAll(async()=>{
  if(socket!=='/private/tmp/pt-claim-billing-mysql-20261125/mysql.sock')throw Error('This test requires its owned, socket-only synthetic MySQL instance');
  vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
  admin=await mysql.createConnection({socketPath:socket,user:'root'});await admin.query('CREATE DATABASE claim_billing_review_qa');
  db=mysql.createPool({socketPath:socket,user:'root',database:'claim_billing_review_qa',connectionLimit:3});
  for(const sql of [
   'CREATE TABLE agency_medical_service_codes(agency_id INT,service_code VARCHAR(32))',
   'CREATE TABLE tenant_services(id INT PRIMARY KEY,agency_id INT,service_code VARCHAR(32),price_cents INT)',
   'CREATE TABLE medical_fee_schedule_items(id INT PRIMARY KEY,procedure_code VARCHAR(32),unit_price_cents INT)',
   'CREATE TABLE clinical_sessions(id INT PRIMARY KEY,agency_id INT,claim_blocked_reason VARCHAR(255),provider_user_id INT DEFAULT 8)',
   'CREATE TABLE clinical_notes(id INT PRIMARY KEY,agency_id INT,clinical_session_id INT,provider_signed_at DATETIME,is_deleted TINYINT DEFAULT 0,note_payload TEXT)',
   'CREATE TABLE clinical_claims(id INT PRIMARY KEY,agency_id INT,clinical_session_id INT,claim_lifecycle VARCHAR(32),claim_status VARCHAR(32),billing_revision INT,metadata_json JSON,amount_cents INT,is_deleted TINYINT DEFAULT 0,client_id INT DEFAULT 3,clinical_note_id INT DEFAULT 5,date_of_service DATE,destination_payer_id VARCHAR(32),payer_name VARCHAR(100),parent_claim_id INT,payer_sequence INT DEFAULT 1)',
   'CREATE TABLE clinical_claim_lines(id INT PRIMARY KEY,clinical_claim_id INT,procedure_code VARCHAR(32))',
   'CREATE TABLE claimmd_payment_postings(id INT PRIMARY KEY,agency_id INT,clinical_claim_id INT,paid_cents INT,adjustment_cents INT,responsibility_cents INT,posted_at DATETIME)',
   'CREATE TABLE claimmd_claim_events(id BIGINT PRIMARY KEY AUTO_INCREMENT,agency_id INT,clinical_claim_id INT,connection_id VARCHAR(100),event_key VARCHAR(255) UNIQUE,event_type VARCHAR(100),status VARCHAR(50),payload_encrypted MEDIUMTEXT,actor_user_id INT)',
   "INSERT INTO agency_medical_service_codes VALUES(2,'90791'),(6,'90791'),(2,'90834')",
   "INSERT INTO tenant_services VALUES(1,2,'90791',13000),(2,6,'90791',15000),(3,2,'90834',10000)",
   "INSERT INTO medical_fee_schedule_items VALUES(1,'90791',13000),(2,'90834',10000)",
   'INSERT INTO clinical_sessions(id,agency_id,claim_blocked_reason) VALUES(4,2,NULL)',
   "INSERT INTO clinical_notes VALUES(5,2,4,'2026-11-20',0,'Original signed clinical text')",
   "INSERT INTO clinical_claims(id,agency_id,clinical_session_id,claim_lifecycle,claim_status,billing_revision,metadata_json,amount_cents,is_deleted) VALUES(7,2,4,'ready','READY',2,'{}',13000,0),(8,2,4,'submitted','SUBMITTED',2,'{}',13000,0)"
  ])await db.query(sql);
  await migration('migrations/1740_canonical_fee_schedules.sql');
  await db.query("INSERT INTO medical_fee_schedule_state VALUES('agency:2',3,NOW()),('agency:6',0,NOW())");
  await db.query("INSERT INTO medical_fee_schedule_rates(owner_key,agency_id,revision,record_type,mode,scope_key,service_code,rate_cents,rate_unit,action,actor_user_id) VALUES('agency:2',2,1,'rate','insurance','practice','90791',13000,'unit','set',90),('agency:2',2,2,'rate','insurance','payer:AET','90791',14000,'unit','set',90),('agency:2',2,3,'rate','insurance','client:3','90791',15000,'unit','set',90)");
  await migration('migrations/1882_owner_requested_90791_charge.sql');
  await migration('clinical_migrations/039_note_billing_exclusions.sql');
  await migration('clinical_migrations/040_owner_requested_90791_charge.sql');
 },20000);
 afterAll(async()=>{if(db)await db.end();if(admin){await admin.query('DROP DATABASE claim_billing_review_qa');await admin.end();}});
 it('updates current rates and services to $135 with automation attribution while preserving old claim charges and fee history',async()=>{
  const [current]=await db.query('SELECT r.* FROM medical_fee_schedule_rates r JOIN(SELECT MAX(id) id FROM medical_fee_schedule_rates GROUP BY owner_key,mode,scope_key,service_code) latest ON latest.id=r.id');
  expect(current.length).toBeGreaterThan(5);expect(current.every(r=>r.rate_cents===13500&&r.actor_user_id===null&&r.actor_automation_key==='github-actions:release-migration:1882')).toBe(true);
  const [[old]]=await db.query('SELECT rate_cents,actor_user_id FROM medical_fee_schedule_rates WHERE id=1');expect(old).toEqual({rate_cents:13000,actor_user_id:90});
  const [[claim]]=await db.query('SELECT amount_cents FROM clinical_claims WHERE id=7');expect(claim.amount_cents).toBe(13000);
  const [services]=await db.query('SELECT price_cents FROM tenant_services ORDER BY id');expect(services.map(s=>s.price_cents)).toEqual([13500,13500,10000]);
  const [[legacy]]=await db.query('SELECT unit_price_cents FROM medical_fee_schedule_items WHERE id=1');expect(legacy.unit_price_cents).toBe(13500);
 });
 it('persists chart-only audit and claim closure without modifying signed text or submitted history',async()=>{
  await excludeNoteFromBilling({agencyId:2,noteId:5,actor:{id:90,role:'super_admin'},disposition:'therapy_notes',reason:'Already documented in Therapy Notes',confirmed:true},db);
  const [[note]]=await db.query('SELECT note_payload,provider_signed_at FROM clinical_notes WHERE id=5');expect(note.note_payload).toBe('Original signed clinical text');expect(note.provider_signed_at).toBeTruthy();
  const [claims]=await db.query('SELECT id,claim_lifecycle,amount_cents,metadata_json FROM clinical_claims ORDER BY id');expect(claims[0]).toMatchObject({claim_lifecycle:'closed',amount_cents:13000,metadata_json:{claimClosure:{actorUserId:90}}});expect(claims[1].claim_lifecycle).toBe('submitted');
  const [[events]]=await db.query('SELECT COUNT(*) n FROM claimmd_claim_events WHERE actor_user_id=90');expect(events.n).toBe(2);
  await expect(assertNoteBillingAllowed({agencyId:2,noteId:5,sessionId:4},db)).rejects.toMatchObject({status:409});
  await expect(assertNoteBillingAllowed({agencyId:6,noteId:5,sessionId:4},db)).resolves.toBeUndefined();
  await expect(db.query('UPDATE clinical_note_billing_exclusions SET reason=\'rewrite\'')).rejects.toHaveProperty('sqlState','45000');
  await expect(db.query('DELETE FROM clinical_note_billing_exclusions')).rejects.toHaveProperty('sqlState','45000');
 });
 it('queries scoped reimbursement history and flags against the real SQL schema',async()=>{
  await db.query("UPDATE clinical_claims SET date_of_service='2026-11-20',destination_payer_id='AET',payer_name='Synthetic payer'");
  await db.query("INSERT INTO clinical_claim_lines VALUES(1,7,'90791'),(2,8,'90791')");
  await db.query("INSERT INTO claimmd_payment_postings VALUES(1,2,7,13000,0,0,NOW()),(2,2,8,8000,5000,2000,NOW())");
  const data=await claimFinancialReview({agencyId:2,claimId:7},{clinical:db,main:{execute:async()=>[[]]},insurance:async()=>({primary:{payerId:'AET',copay:'25'}}),coverage:async()=>({checks:[]})});
  expect(data.flags.map(f=>f.code)).toEqual(['paid_exact_billed']);expect(data.policy).toMatchObject({copayCents:2500,coinsuranceBasisPoints:null});
  expect(data.history).toHaveLength(1);expect(data.history[0]).toMatchObject({id:8,same_client:1,same_provider:1,paid_cents:'8000'});expect(data.history[0].flags[0].code).toBe('adjustment_over_five');
 });
 it('rolls back the note exclusion, session hold and claim closure if the immutable audit event cannot be stored',async()=>{
  await db.query("INSERT INTO clinical_sessions(id,agency_id) VALUES(14,2)");
  await db.query("INSERT INTO clinical_notes(id,agency_id,clinical_session_id) VALUES(15,2,14)");
  await db.query("INSERT INTO clinical_claims(id,agency_id,clinical_session_id,claim_lifecycle,claim_status,billing_revision,metadata_json) VALUES(17,2,14,'ready','READY',0,'{}')");
  await db.query("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON claimmd_claim_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit unavailable'");
  await expect(excludeNoteFromBilling({agencyId:2,noteId:15,actor:{id:90,role:'super_admin'},disposition:'chart_only',reason:'Synthetic rollback validation',confirmed:true},db)).rejects.toThrow('Synthetic audit unavailable');
  const [[hold]]=await db.query('SELECT claim_blocked_reason FROM clinical_sessions WHERE id=14');expect(hold.claim_blocked_reason).toBeNull();
  const [[claim]]=await db.query('SELECT claim_lifecycle FROM clinical_claims WHERE id=17');expect(claim.claim_lifecycle).toBe('ready');
  const [[annotations]]=await db.query('SELECT COUNT(*) n FROM clinical_note_billing_exclusions WHERE clinical_note_id=15');expect(annotations.n).toBe(0);
 });

});
