// Owner-approved, immutable ITSCO cleanup. Bootstrap writes configuration only;
// client updates execute as the procedure-only task identity, with null actors.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import pool from '../config/database.js';
import {ACTIVE_CLIENT_ASSIGNMENT_SQL,HYGIENE_REGISTRATIONS_SQL,HYGIENE_CONTACTS_SQL,
  HYGIENE_ACTIVITY_SQL,HYGIENE_CLINICAL_ACTIVITY_SQL} from '../services/clientTotalsHygiene.service.js';
import {buildReferralTotals} from '../services/referralTotals.service.js';

const source='/Users/mendez/PTOnboardingApp',output=`${source}/artifacts/client-totals-hygiene-20261124`;
const user='totals_hygiene_20261124',reader='ops_client_totals_read_20261124';
// Retain the first held manifest as incident evidence; never reset its states.
const procedure='ops_client_totals_apply_20261124',manifest='ops_client_totals_manifest_20261124_v2';
const secret='client-totals-hygiene-20261124-db',project='ptonboard-dev';
if(!process.argv.includes('--apply-approved-policy'))throw new Error('Choose the owner-approved apply explicitly');
const env=dotenv.parse(fs.readFileSync(`${source}/backend/.env`));
const database=env.DB_NAME,clinical=env.CLINICAL_DB_NAME;
if(![database,clinical].every(name=>/^[a-zA-Z0-9_]+$/.test(name)))throw new Error('Unexpected database name');
const plan=JSON.parse(fs.readFileSync(`${output}/plan.json`));
if(!plan.changes?.length||plan.changes.some(c=>c.agencyId!==2||!['demo','inactive'].includes(c.action)
  ||!Array.isArray(c.registrationEvidence)||c.registrationEvidence.some(e=>!/^[a-f0-9]{64}$/.test(e.version||''))
  ||!Array.isArray(c.contactEvidence)||c.contactEvidence.some(e=>!/^[a-f0-9]{64}$/.test(e.version||''))))throw new Error('A scoped, versioned plan is required');
const hash=crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const cloud=(args,input)=>execFileSync('gcloud',[...args,`--project=${project}`,'--quiet'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:1024*1024});
const scoped=sql=>sql.replaceAll('WHERE c.agency_id=?','WHERE c.agency_id=2 AND c.id=p_client_id');
const registrations=scoped(HYGIENE_REGISTRATIONS_SQL),contacts=scoped(HYGIENE_CONTACTS_SQL);
const activities=scoped(HYGIENE_ACTIVITY_SQL);
const clinicalActivities=HYGIENE_CLINICAL_ACTIVITY_SQL.replaceAll('WHERE agency_id=?','WHERE agency_id=2 AND client_id=p_client_id')
  .replaceAll('FROM clinical_sessions',`FROM \`${clinical}\`.clinical_sessions`).replaceAll('FROM clinical_notes',`FROM \`${clinical}\`.clinical_notes`);
const skip=(condition,reason)=>`IF ${condition} THEN
  UPDATE \`${manifest}\` SET state='skipped',skip_reason='${reason}' WHERE client_id=p_client_id;
  COMMIT; DO RELEASE_LOCK(CONCAT('client-schedule:',p_client_id)); SET held=0;
  SELECT 'skipped' AS state,'${reason}' AS reason; LEAVE main; END IF;`;
const sql=`CREATE PROCEDURE \`${procedure}\`(IN p_hash CHAR(64),IN p_client_id INT,IN p_apply BOOLEAN)
SQL SECURITY DEFINER main: BEGIN
  DECLARE held INT DEFAULT 0;
  DECLARE target_action VARCHAR(20);
  DECLARE target_reason VARCHAR(100);
  DECLARE target_state VARCHAR(20);
  DECLARE expected_updated DATETIME(3);
  DECLARE expected_status VARCHAR(40);
  DECLARE expected_status_id INT;
  DECLARE expected_demo INT;
  DECLARE expected_registrations JSON;
  DECLARE expected_contacts JSON;
  DECLARE inactive_status INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN
    ROLLBACK;
    IF held=1 THEN DO RELEASE_LOCK(CONCAT('client-schedule:',p_client_id)); END IF;
    RESIGNAL;
  END;
  IF SUBSTRING_INDEX(USER(),'@',1)<>'${user}' OR p_hash IS NULL OR p_hash<>'${hash}' OR p_apply IS NULL
    OR NOT EXISTS(SELECT 1 FROM \`${manifest}\` WHERE client_id=p_client_id AND manifest_hash=p_hash) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only this immutable owner-approved ITSCO cleanup is authorized';
  END IF;
  SELECT GET_LOCK(CONCAT('client-schedule:',p_client_id),8) INTO held;
  IF held<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Scheduling is changing; retry'; END IF;
  START TRANSACTION;
  SELECT m.action,m.reason,m.state,m.expected_updated_at,m.expected_status,m.expected_status_id,m.expected_demo,m.registration_versions,m.contact_versions
    INTO target_action,target_reason,target_state,expected_updated,expected_status,expected_status_id,expected_demo,expected_registrations,expected_contacts
    FROM \`${manifest}\` m WHERE m.client_id=p_client_id AND m.manifest_hash=p_hash FOR UPDATE;
  IF target_state<>'pending' THEN COMMIT; DO RELEASE_LOCK(CONCAT('client-schedule:',p_client_id)); SET held=0;
    SELECT target_state AS state; LEAVE main; END IF;
  SELECT id FROM clients WHERE id=p_client_id AND agency_id=2 FOR UPDATE;
  SELECT id FROM client_provider_assignments WHERE client_id=p_client_id FOR UPDATE;
  SELECT id FROM client_service_enrollments WHERE client_id=p_client_id FOR UPDATE;
  ${skip(`NOT EXISTS(SELECT 1 FROM clients WHERE id=p_client_id AND agency_id=2 AND updated_at=expected_updated
    AND BINARY status=BINARY expected_status AND (client_status_id<=>expected_status_id) AND COALESCE(is_demo,0)=expected_demo)`, 'client_changed_since_audit')}
  ${skip(`(SELECT COUNT(*) FROM (${registrations}) r)<>JSON_LENGTH(expected_registrations)
    OR EXISTS(SELECT 1 FROM (${registrations}) r LEFT JOIN JSON_TABLE(expected_registrations,'$[*]'
      COLUMNS(id INT PATH '$.id',version CHAR(64) PATH '$.version')) v ON v.id=r.id
      WHERE v.id IS NULL OR NOT(BINARY v.version<=>BINARY r.evidence_version))`, 'registration_changed_since_audit')}
  ${skip(`(SELECT COUNT(*) FROM (${contacts}) r)<>JSON_LENGTH(expected_contacts)
    OR EXISTS(SELECT 1 FROM (${contacts}) r LEFT JOIN JSON_TABLE(expected_contacts,'$[*]'
      COLUMNS(evidence_key VARCHAR(80) PATH '$.key',version CHAR(64) PATH '$.version')) v ON BINARY v.evidence_key=BINARY r.evidence_key
      WHERE v.evidence_key IS NULL OR NOT(BINARY v.version<=>BINARY r.evidence_version))`, 'contact_changed_since_audit')}
  IF target_action='inactive' THEN
    ${skip(`EXISTS(SELECT 1 FROM clients c WHERE c.id=p_client_id AND (${ACTIVE_CLIENT_ASSIGNMENT_SQL}
      OR GREATEST(c.created_at,COALESCE(c.last_activity_at,c.created_at),COALESCE(c.services_started_at,c.created_at),
        COALESCE(c.first_service_at,c.created_at))>=UTC_TIMESTAMP()-INTERVAL 3 MONTH))
      OR EXISTS(SELECT 1 FROM (${activities}) a WHERE a.activity_at>=UTC_TIMESTAMP()-INTERVAL 3 MONTH)
      OR EXISTS(SELECT 1 FROM (${clinicalActivities}) a WHERE a.activity_at>=UTC_TIMESTAMP()-INTERVAL 3 MONTH)
      OR EXISTS(SELECT 1 FROM (${registrations}) r WHERE r.activity_at>=UTC_TIMESTAMP()-INTERVAL 3 MONTH)`, 'active_assignment_or_recent_activity')}
    SELECT MIN(id) INTO inactive_status FROM client_statuses WHERE agency_id=2 AND status_key='inactive' AND is_active=1;
    IF inactive_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inactive catalog status is required'; END IF;
  END IF;
  IF NOT p_apply THEN COMMIT; DO RELEASE_LOCK(CONCAT('client-schedule:',p_client_id)); SET held=0;
    SELECT 'eligible' AS state,target_action AS action; LEAVE main; END IF;
  INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata)
    VALUES('automation_client_totals_classified',NULL,2,JSON_OBJECT('actor_type','automation',
      'automation_identity','${user}','database_session_user',USER(),'manifest_hash',p_hash,'clientId',p_client_id,
      'reason',target_reason,'before',JSON_OBJECT('status',expected_status,'client_status_id',expected_status_id,'is_demo',expected_demo),
      'after',IF(target_action='demo',JSON_OBJECT('is_demo',1),JSON_OBJECT('status','ARCHIVED','client_status_id',inactive_status))));
  IF target_action='demo' THEN
    INSERT INTO client_status_history(client_id,changed_by_user_id,field_changed,from_value,to_value,note)
      VALUES(p_client_id,NULL,'is_demo',CAST(expected_demo AS CHAR),'1',CONCAT('Automation ${user}: ',target_reason,'. Original records and audit history retained.'));
    UPDATE clients SET is_demo=1,updated_by_user_id=NULL WHERE id=p_client_id AND agency_id=2;
  ELSE
    INSERT INTO client_status_history(client_id,changed_by_user_id,field_changed,from_value,to_value,note)
      VALUES(p_client_id,NULL,'status',expected_status,'ARCHIVED',CONCAT('Automation ${user}: ',target_reason,'. Historical referrals remain counted.')),
        (p_client_id,NULL,'client_status_id',CAST(expected_status_id AS CHAR),CAST(inactive_status AS CHAR),CONCAT('Automation ${user}: inactive catalog state; original records retained.'));
    UPDATE clients SET status='ARCHIVED',client_status_id=inactive_status,updated_by_user_id=NULL WHERE id=p_client_id AND agency_id=2;
  END IF;
  UPDATE \`${manifest}\` SET state='applied',applied_at=UTC_TIMESTAMP() WHERE client_id=p_client_id;
  COMMIT; DO RELEASE_LOCK(CONCAT('client-schedule:',p_client_id)); SET held=0;
  SELECT 'applied' AS state,target_action AS action;
END`;

let bootstrap,db,phase='configuration';
const connection=password=>({host:env.DB_HOST,port:Number(env.DB_PORT||3307),user,password,database,timezone:'+00:00',connectTimeout:10000,charset:'utf8mb4_unicode_ci'});
try {
  const password=cloud(['secrets','versions','access','latest',`--secret=${secret}`]).trim();
  bootstrap=await mysql.createConnection({...connection(env.DB_PASSWORD),user:env.DB_USER});
  await bootstrap.query(`CREATE TABLE IF NOT EXISTS \`${manifest}\`(
    client_id INT PRIMARY KEY,manifest_hash CHAR(64) NOT NULL,action VARCHAR(20) NOT NULL,reason VARCHAR(100) NOT NULL,
    expected_updated_at DATETIME(3),expected_status VARCHAR(40),expected_status_id INT NULL,expected_demo INT NOT NULL,
    registration_versions JSON NOT NULL,contact_versions JSON NOT NULL,state VARCHAR(20) NOT NULL DEFAULT 'pending',
    applied_at DATETIME NULL,skip_reason VARCHAR(100) NULL) ENGINE=InnoDB`);
  const [[existing]]=await bootstrap.execute(`SELECT COUNT(*) total,SUM(manifest_hash=?) same_plan FROM \`${manifest}\``,[hash]);
  if(Number(existing.total)&&Number(existing.same_plan)!==plan.changes.length)throw new Error('An immutable manifest already exists with a different plan');
  if(!Number(existing.total)) {
    await bootstrap.beginTransaction();
    for(const c of plan.changes)await bootstrap.execute(`INSERT INTO \`${manifest}\`(client_id,manifest_hash,action,reason,
      expected_updated_at,expected_status,expected_status_id,expected_demo,registration_versions,contact_versions) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [c.clientId,hash,c.action,c.reason,new Date(c.expectedUpdatedAt),c.previousStatus,c.previousStatusId,c.previousDemo,JSON.stringify(c.registrationEvidence),JSON.stringify(c.contactEvidence)]);
    await bootstrap.commit();
  }
  await bootstrap.query(`DROP PROCEDURE IF EXISTS \`${procedure}\``);
  await bootstrap.query(sql);
  await bootstrap.query(`GRANT EXECUTE ON PROCEDURE \`${database}\`.\`${procedure}\` TO ?@'%'`,[user]);
  await bootstrap.end();bootstrap=null;
  db=await mysql.createConnection(connection(password));
  await db.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
  phase='boundary_checks';
  let directWriteDenied=false;
  try{await db.query('UPDATE clients SET is_demo=is_demo WHERE id=-1');}catch(e){if(e.code==='ER_TABLEACCESS_DENIED_ERROR')directWriteDenied=true;else throw e;}
  if(!directWriteDenied)throw new Error('Direct client writes must be denied');
  for(const [invalidHash,invalidId] of [['0'.repeat(64),plan.changes[0].clientId],[hash,-1]]) {
    let denied=false;try{await db.execute(`CALL \`${procedure}\`(?,?,?)`,[invalidHash,invalidId,false]);}catch(e){if(e.sqlState==='45000')denied=true;else throw e;}
    if(!denied)throw new Error('Unapproved apply must be denied');
  }
  phase='preflight';
  let eligible=0;
  for(const c of plan.changes) {
    const [sets]=await db.execute(`CALL \`${procedure}\`(?,?,?)`,[hash,c.clientId,false]);
    const state=sets.filter(Array.isArray).at(-1)?.[0]?.state;
    if(['eligible','applied'].includes(state))eligible++;
  }
  console.log(JSON.stringify({phase,eligible,candidates:plan.changes.length}));
  if(!eligible)throw new Error('No records passed the independent preflight');
  phase='apply';
  const outcomes=[];
  for(const c of [...plan.changes].sort((a,b)=>(a.action==='demo'?0:1)-(b.action==='demo'?0:1)||a.clientId-b.clientId)) {
    const [sets]=await db.execute(`CALL \`${procedure}\`(?,?,?)`,[hash,c.clientId,true]);
    const result=sets.filter(Array.isArray).at(-1)?.[0];
    outcomes.push({clientId:c.clientId,action:c.action,...result});
    if(outcomes.length%25===0)console.log(JSON.stringify({phase,processed:outcomes.length,candidates:plan.changes.length}));
  }
  phase='verification';
  const [sets]=await db.query(`CALL \`${reader}\`()`);
  const clients=new Map(sets[0].map(c=>[Number(c.id),c]));
  const inactiveIds=new Set(sets[6].map(s=>Number(s.id)));
  let verified=0;
  for(const c of plan.changes) {
    const result=outcomes.find(row=>row.clientId===c.clientId),current=clients.get(c.clientId);
    if(result?.state!=='applied')continue;
    if(c.action==='demo'?Number(current?.is_demo)!==1:current?.status!=='ARCHIVED'||!inactiveIds.has(Number(current.client_status_id)))throw new Error('A changed client did not verify');
    verified++;
  }
  const now=new Date(),report=buildReferralTotals(sets[5],{now});
  const result={applied:verified>0,automationIdentity:user,manifestHash:hash,manifest,directWriteDenied,invalidHashDenied:true,unapprovedClientDenied:true,
    demo:outcomes.filter(r=>r.state==='applied'&&r.action==='demo').length,inactive:outcomes.filter(r=>r.state==='applied'&&r.action==='inactive').length,
    skipped:outcomes.filter(r=>r.state==='skipped').length,verified,
    referrals:{week:report.weekly.find(row=>row.start==='2026-11-02'),month:report.currentMonth,year:report.yearTotal},
    clientDirectoryCounts:sets[7],recordsDeleted:0,appliedAt:now.toISOString()};
  fs.writeFileSync(`${output}/apply-results.json`,JSON.stringify({summary:result,outcomes},null,2),{mode:0o600});
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({phase,code:error.code||'CLEANUP_FAILED',message:'Cleanup stopped; no registration contents or credentials are logged.'}));process.exitCode=1;}
finally{if(bootstrap)await bootstrap.end();if(db)await db.end();await pool.end();}
