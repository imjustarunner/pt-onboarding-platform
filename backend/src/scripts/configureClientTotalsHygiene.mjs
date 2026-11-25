// Bootstrap database configuration only; application reads run as the new
// procedure-only identity. No application session or human audit actor is used.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import pool from '../config/database.js';
import {HYGIENE_CLIENTS_SQL,HYGIENE_REGISTRATIONS_SQL,HYGIENE_CONTACTS_SQL,HYGIENE_ACTIVITY_SQL,
  HYGIENE_CLINICAL_ACTIVITY_SQL,buildClientTotalsHygienePlan} from '../services/clientTotalsHygiene.service.js';
import {REFERRAL_TOTALS_SQL,buildReferralTotals} from '../services/referralTotals.service.js';

const source='/Users/mendez/PTOnboardingApp';
const output=`${source}/artifacts/client-totals-hygiene-20261124`;
const user='totals_hygiene_20261124',procedure='ops_client_totals_read_20261124';
const secret='client-totals-hygiene-20261124-db';
const project='ptonboard-dev';
if(!process.argv.includes('--configure-scoped-preview')) {
  console.log(JSON.stringify({mode:'proposal',project,agencyId:2,databaseUser:user,procedure,
    secretReference:`${secret}:latest`,requiresExplicitApproval:true,
    access:'Procedure-only read access to ITSCO registration email evidence and lifecycle metadata; decrypt in memory; save IDs and aggregate counts only',
    cloudChanges:0,clientRecordWrites:0}));
  process.exit(0);
}
const env=dotenv.parse(fs.readFileSync(`${source}/backend/.env`));
const database=env.DB_NAME,clinical=env.CLINICAL_DB_NAME;
if(![database,clinical].every(name=>/^[a-zA-Z0-9_]+$/.test(name)))throw new Error('Unexpected database name');
const cloud=(args,input)=>execFileSync('gcloud',[...args,`--project=${project}`,'--quiet'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:1024*1024});
let phase='configuration',bootstrap,db;
try {
  fs.mkdirSync(output,{recursive:true});
  // Only the encryption settings required to inspect registration emails.
  for(const key of ['INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64','INTAKE_RESPONSES_ENCRYPTION_KEYS_JSON','GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64']) {
    if(env[key])process.env[key]=env[key];
  }
  let password;
  try {password=cloud(['secrets','versions','access','latest',`--secret=${secret}`]).trim();}
  catch(error) {
    if(!/NOT_FOUND|not found/i.test(String(error.stderr)))throw error;
    password=`Tt7!${crypto.randomBytes(32).toString('hex')}`;
    cloud(['secrets','create',secret,'--replication-policy=automatic','--data-file=-'],password);
  }
  bootstrap=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3307),user:env.DB_USER,
    password:env.DB_PASSWORD,database,timezone:'+00:00',connectTimeout:10000,charset:'utf8mb4_unicode_ci'});
  await bootstrap.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?",[user,password]);
  const [grants]=await bootstrap.query("SHOW GRANTS FOR ?@'%'",[user]);
  if(grants.some(row=>Object.values(row).some(grant=>!grant.startsWith('GRANT USAGE ')&&!grant.startsWith(`GRANT EXECUTE ON PROCEDURE \`${database}\`.\`${procedure}\` TO `))))throw new Error('Automation has unexpected privileges');
  const agencySql=sql=>sql.replaceAll('?', '2');
  const referralSql=REFERRAL_TOTALS_SQL.replace('?', '2').replace('?', "'demo|synthetic|hogwarts|durmstrang|fake-school|detention-academy|analytical-engine|onboarding-test|test-school|qa-'");
  const clinicalSql=agencySql(HYGIENE_CLINICAL_ACTIVITY_SQL).replaceAll('FROM clinical_sessions',`FROM \`${clinical}\`.clinical_sessions`).replaceAll('FROM clinical_notes',`FROM \`${clinical}\`.clinical_notes`);
  await bootstrap.query(`DROP PROCEDURE IF EXISTS \`${procedure}\``);
  await bootstrap.query(`CREATE PROCEDURE \`${procedure}\`() SQL SECURITY DEFINER BEGIN
    IF SUBSTRING_INDEX(USER(),'@',1)<>'${user}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Scoped totals automation only'; END IF;
    INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata)
      VALUES('automation_client_totals_audit_read',NULL,2,JSON_OBJECT('actor_type','automation',
        'automation_identity','${user}','database_session_user',USER(),'purpose','Owner-requested registration test and inactivity audit'));
    ${agencySql(HYGIENE_CLIENTS_SQL)};
    ${agencySql(HYGIENE_REGISTRATIONS_SQL)};
    ${agencySql(HYGIENE_CONTACTS_SQL)};
    ${agencySql(HYGIENE_ACTIVITY_SQL)};
    ${clinicalSql};
    ${referralSql};
    SELECT id,status_key FROM client_statuses WHERE agency_id=2 AND status_key='inactive';
    SELECT status,COUNT(*) AS clients FROM clients WHERE agency_id=2 AND COALESCE(is_demo,0)=0
      AND COALESCE(created_via_dev_fill,0)=0 AND compliance_archived_at IS NULL GROUP BY status;
  END`);
  await bootstrap.query(`GRANT EXECUTE ON PROCEDURE \`${database}\`.\`${procedure}\` TO ?@'%'`,[user]);
  await bootstrap.end();bootstrap=null;
  phase='scoped_read';
  db=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3307),user,password,database,
    timezone:'+00:00',connectTimeout:10000,charset:'utf8mb4_unicode_ci'});
  let directReadDenied=false;
  try {await db.query('SELECT id FROM clients LIMIT 1');}catch(error){if(error.code==='ER_TABLEACCESS_DENIED_ERROR')directReadDenied=true;else throw error;}
  if(!directReadDenied)throw new Error('Automation must not have direct table access');
  const [sets]=await db.query(`CALL \`${procedure}\`()`);
  const evidence={clients:sets[0],registrations:sets[1],contacts:sets[2],activities:[...sets[3],...sets[4]]};
  const now=new Date();
  const plan=buildClientTotalsHygienePlan(evidence,{now});
  const report=buildReferralTotals(sets[5],{now});
  const excluded=new Set(plan.changes.filter(row=>row.action==='demo').map(row=>row.clientId));
  const corrected=buildReferralTotals(sets[5].filter(row=>!excluded.has(Number(row.clientId))),{now});
  const week=report.weekly.find(row=>row.start==='2026-11-02');
  const correctedWeek=corrected.weekly.find(row=>row.start==='2026-11-02');
  const configuration={project,databaseUser:user,procedure,secretReference:`${secret}:latest`,agencyId:2,directReadDenied,
    scope:'Read only ITSCO client lifecycle metadata, registration email evidence and aggregate referral sources; no app identity',
    inactiveStatusIds:sets[6].map(row=>row.id),retireAfterCleanup:true};
  const summary={...plan.summary,originalReferrals:{week,month:report.currentMonth,year:report.yearTotal},
    correctedReferrals:{week:correctedWeek,month:corrected.currentMonth,year:corrected.yearTotal},
    columbiaOrganizations:[...new Map(evidence.clients.filter(c=>/\bcolumbia\b/i.test(`${c.organization_name} ${c.organization_slug}`)).map(c=>[c.organization_id,{id:c.organization_id,name:c.organization_name}])).values()],
    reasons:Object.fromEntries([...new Set(plan.changes.map(c=>c.reason))].map(reason=>[reason,plan.changes.filter(c=>c.reason===reason).length])),
    clientDirectoryCounts:sets[7],clientRecordWrites:0,automationReadAuditEvents:1};
  fs.writeFileSync(`${output}/plan.json`,JSON.stringify(plan,null,2),{mode:0o600});
  fs.writeFileSync(`${output}/configuration.json`,JSON.stringify(configuration,null,2),{mode:0o600});
  fs.writeFileSync(`${output}/preview.json`,JSON.stringify(summary,null,2),{mode:0o600});
  console.log(JSON.stringify(summary,null,2));
} catch(error) {console.error(JSON.stringify({phase,code:error.code||'AUDIT_FAILED',message:'Audit stopped; no registration contents or credentials are logged.'}));process.exitCode=1;}
finally {if(bootstrap)await bootstrap.end();if(db)await db.end();await pool.end();}
