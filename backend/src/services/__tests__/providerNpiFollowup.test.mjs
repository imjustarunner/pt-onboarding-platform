import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { providerNpiState, npiTaskContent, validIndividualNpi } from '../providerNpiFollowup.policy.js';
import { loadProviderNpiCandidates, loadNpiCredentialingTeam, reconcileProviderNpiFollowups, assertProviderNpiTaskStatus } from '../providerNpiFollowup.service.js';

const field = (field_key, value, rest = {}) => ({ field_key, value, ...rest });
test('distinguishes explicit help, unanswered questions, reported absence, and existing registrations', () => {
  assert.equal(providerNpiState([field('npi_status','No, and ITSCO can make me one (please contact me).')]).state,'help_requested');
  assert.equal(providerNpiState([field('npi_status','no_itsco_create')]).requestedHelp,true);
  assert.equal(providerNpiState([]).state,'answer_missing');
  assert.equal(providerNpiState([field('npi_status','No')]).state,'no_npi_reported');
  assert.equal(providerNpiState([field('npi_status','Yes')]).state,'existing_number_missing');
  assert.equal(providerNpiState([field('npi_status','No, but I have registered and added ITSCO as a surrogate')]).state,'registration_pending');
  assert.equal(providerNpiState([]).requestedHelp,false);
});
test('blank canonical values do not hide a recorded legacy NPI or a legacy request', () => {
  const s=providerNpiState([field('provider_identity_npi_number',null),field('npi_number','1234567893'),field('provider_identity_npi_status',''),field('npi_status','no_itsco_create')]);
  assert.equal(s.complete,true); assert.equal(s.requestedHelp,true); assert.equal(s.number,'1234567893');
  assert.equal(providerNpiState([field('npi_id','1234567893')]).complete,false);
});
test('invalid checksums and conflicting numbers require review; duplicates of the same number do not', () => {
  assert.equal(validIndividualNpi('1234567893'),true); assert.equal(validIndividualNpi('1234567890'),false);
  assert.equal(providerNpiState([field('npi_number','1234567890')]).state,'invalid_npi');
  assert.equal(providerNpiState([field('npi_number','1234567893'),field('provider_identity_npi_number','1760160022')]).state,'conflicting_npi');
  assert.equal(providerNpiState([field('npi_number','1234567893'),field('provider_identity_npi_number','1234567893')]).complete,true);
});
test('uses the latest answer within a field and labels automation without using a human actor', () => {
  const s=providerNpiState([field('npi_status','Yes',{updated_at:new Date('2026-11-01')}),field('npi_status','no_itsco_create',{updated_at:new Date('2026-11-02')})]);
  assert.equal(s.state,'help_requested');
  const content=npiTaskContent({id:3,agency_id:2,agency_name:'Test Agency',first_name:'Synthetic',last_name:'Provider',status:'ONBOARDING'},s);
  assert.equal(content.metadata.actorType,'automation'); assert.equal(content.metadata.providerUserId,3);
  assert.match(content.description,/Confirm no NPI already exists/); assert.equal('actorUserId' in content.metadata,false);
});
test('effective company grants replace affiliation expansion and honor a local denial',async()=>{
  let expanded=false;
  const db={execute:async()=>[[{user_id:20,agency_id:2},{user_id:21,agency_id:2}]]};
  const team=await loadNpiCredentialingTeam(db,async()=>{expanded=true;return [2,6];},
    {ready:async()=>true,grants:async id=>id===20?[2]:[]});
  assert.equal(expanded,false);assert.deepEqual(team,[{id:20,agencies:[2]},{id:21,agencies:[]}]);
});

test('real MySQL: scope, shared assignments, deduplication, completion, revocation and audit rollback',
  { skip: !process.env.NPI_FOLLOWUP_MYSQL_SOCKET }, async () => {
  const { default: mysql } = await import('mysql2/promise');
  // Only an explicit local socket is accepted. This test never uses DB_*.
  const socketPath=process.env.NPI_FOLLOWUP_MYSQL_SOCKET;
  assert.match(socketPath,/^\/private\/tmp\/pt-npi-mysql-[^/]+\/mysql\.sock$/);
  const schema=`npi_test_${process.pid}_${Date.now()}`;
  const admin=await mysql.createConnection({socketPath,user:'root',multipleStatements:true});
  let pool;
  try {
    await admin.query(`CREATE DATABASE ${schema}; USE ${schema};
      CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(100),organization_type VARCHAR(30) DEFAULT 'agency',is_active INT DEFAULT 1,is_archived INT DEFAULT 0);
      CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(100),last_name VARCHAR(100),role VARCHAR(30),status VARCHAR(30),is_active INT DEFAULT 1,is_archived INT DEFAULT 0,is_demo INT DEFAULT 0,is_assistant_account INT DEFAULT 0,created_at DATETIME,hired_at DATETIME,provider_start_date DATE);
      CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active INT DEFAULT 1,can_manage_credentialing INT DEFAULT 0);
      CREATE TABLE hire_journeys(user_id INT,agency_id INT,onboarding_started_at DATETIME);
      CREATE TABLE user_info_field_definitions(id INT PRIMARY KEY,field_key VARCHAR(100),agency_id INT NULL);
      CREATE TABLE user_info_values(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,field_definition_id INT,value TEXT,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE tasks(id INT AUTO_INCREMENT PRIMARY KEY,task_type VARCHAR(30),title VARCHAR(255),description TEXT,status VARCHAR(30),assigned_to_user_id INT NULL,assigned_to_agency_id INT,assigned_by_user_id INT NOT NULL,source_ref_type VARCHAR(32),source_ref_id VARCHAR(64),metadata JSON,is_private INT,urgency VARCHAR(20),completed_at DATETIME,UNIQUE(source_ref_type,source_ref_id));
      CREATE TABLE task_audit_log(id INT AUTO_INCREMENT PRIMARY KEY,task_id INT,action_type VARCHAR(30),actor_user_id INT NOT NULL,target_user_id INT,metadata JSON);
      CREATE TABLE task_collaborators(task_id INT,user_id INT,UNIQUE(task_id,user_id));
      CREATE TABLE notifications(id INT AUTO_INCREMENT PRIMARY KEY,type VARCHAR(100),severity VARCHAR(20),title VARCHAR(255),message TEXT,user_id INT,agency_id INT,related_entity_type VARCHAR(30),related_entity_id INT,actor_user_id INT NULL,actor_source VARCHAR(100),is_resolved INT DEFAULT 0);
      CREATE TABLE evidence(id INT AUTO_INCREMENT PRIMARY KEY,actor_user_id INT NULL,role VARCHAR(40),details JSON);
      INSERT INTO agencies(id,name,slug) VALUES(2,'Synthetic Care','test-care'),(6,'Other Agency','other');
      INSERT INTO users(id,first_name,last_name,role,status,created_at) VALUES
        (10,'Test','Provider','provider','ONBOARDING','2020-01-01'),
        (11,'Other','Provider','provider','ACTIVE_EMPLOYEE','2026-10-01'),
        (12,'Recent','Provider','provider','PENDING_SETUP','2026-11-01'),
        (13,'Older','Provider','provider','ACTIVE_EMPLOYEE','2020-01-01'),
        (20,'Credentialer','One','admin','ACTIVE_EMPLOYEE','2020-01-01'),
        (21,'Credentialer','Two','staff','ACTIVE_EMPLOYEE','2020-01-01'),
        (22,'No','Grant','super_admin','ACTIVE_EMPLOYEE','2020-01-01');
      INSERT INTO user_agencies(user_id,agency_id,can_manage_credentialing) VALUES(10,2,0),(11,6,0),(12,2,0),(13,2,0),(20,2,1),(21,2,1),(22,2,0);
      INSERT INTO user_info_field_definitions VALUES(1,'npi_status',NULL),(2,'npi_number',NULL),(3,'provider_identity_npi_number',2),(4,'npi_number',6);
      INSERT INTO user_info_values(user_id,field_definition_id,value) VALUES(10,1,'no_itsco_create'),(10,4,'1234567893'),(11,2,'1760160022'),(13,1,'no_itsco_create');`);
    await admin.query(await fs.readFile(new URL('../../../../database/migrations/1836_provider_npi_followups.sql',import.meta.url),'utf8'));
    pool=mysql.createPool({socketPath,user:'root',database:schema,connectionLimit:8});
    const audit=async(event,db)=>db.execute('INSERT INTO evidence(actor_user_id,role,details) VALUES(?,?,?)',[event.userId,event.role,JSON.stringify(event.details)]);
    const d={db:pool,expand:async ids=>ids,audit,profiles:{ready:async()=>false}};
    const options={sinceDate:'2026-08-18',agencyIds:[2,6]};
    const rows=await loadProviderNpiCandidates(options,pool);
    assert.deepEqual(rows.map(p=>p.id),[10,12,11]);
    assert.equal(rows[0].npi.complete,false); // Other tenant's number cannot complete this provider.
    const concurrent=await Promise.all(Array.from({length:5},()=>reconcileProviderNpiFollowups(options,d)));
    assert.equal(concurrent.reduce((n,r)=>n+(r.created||0),0),2);
    const [[count]]=await pool.query('SELECT COUNT(*) AS n FROM tasks');assert.equal(count.n,2);
    const [tasks]=await pool.query('SELECT * FROM tasks ORDER BY id');
    assert.ok(tasks.every(t=>t.assigned_by_user_id===null && t.is_private===1));
    const [[notices]]=await pool.query('SELECT COUNT(*) AS n FROM notifications');assert.equal(notices.n,4);
    assert.equal((await pool.query('SELECT * FROM task_collaborators'))[0].length,2);
    await assert.rejects(assertProviderNpiTaskStatus(tasks[0].id,'completed',pool),{status:409});
    await reconcileProviderNpiFollowups(options,d);
    assert.equal((await pool.query('SELECT COUNT(*) AS n FROM notifications'))[0][0].n,4);
    await pool.execute('INSERT INTO user_info_values(user_id,field_definition_id,value) VALUES(10,2,?)',['1234567893']);
    await reconcileProviderNpiFollowups(options,d);
    await assertProviderNpiTaskStatus(tasks[0].id,'completed',pool);
    assert.equal((await pool.query('SELECT status FROM tasks WHERE id=?',[tasks[0].id]))[0][0].status,'completed');
    // Removing the number reopens the same task and refreshes its notices.
    await pool.execute('DELETE FROM user_info_values WHERE user_id=10 AND field_definition_id=2');
    await reconcileProviderNpiFollowups(options,d);
    assert.equal((await pool.query('SELECT status FROM tasks WHERE id=?',[tasks[0].id]))[0][0].status,'pending');
    await pool.query('UPDATE user_agencies SET can_manage_credentialing=0 WHERE user_id=21');
    await reconcileProviderNpiFollowups(options,d);
    assert.equal((await pool.query('SELECT * FROM task_collaborators'))[0].length,0);
    const [evidence]=await pool.query('SELECT * FROM evidence');assert.ok(evidence.every(e=>e.actor_user_id===null && e.role==='automation'));
    await pool.query("INSERT INTO users(id,first_name,last_name,role,status,created_at) VALUES(14,'Audit','Rollback','provider','ONBOARDING','2026-11-01')");
    await pool.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(14,2)');
    await assert.rejects(reconcileProviderNpiFollowups({...options,userId:14},{...d,audit:async()=>{throw new Error('audit unavailable');}}),/audit unavailable/);
    assert.equal((await pool.query("SELECT COUNT(*) AS n FROM tasks WHERE source_ref_id='2:14'"))[0][0].n,0);
    await pool.query("UPDATE users SET status='ARCHIVED' WHERE id=10");
    await reconcileProviderNpiFollowups(options,d);
    assert.deepEqual((await pool.query('SELECT status,assigned_to_user_id FROM tasks WHERE id=?',[tasks[0].id]))[0][0],{status:'overridden',assigned_to_user_id:null});
  } finally { await pool?.end();await admin.query(`DROP DATABASE IF EXISTS ${schema}`);await admin.end(); }
});
