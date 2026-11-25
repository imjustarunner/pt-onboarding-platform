import fs from 'node:fs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {execFileSync} from 'node:child_process';
const output='/Users/mendez/PTOnboardingApp/artifacts/client-totals-hygiene-20261124';
const env=dotenv.parse(fs.readFileSync('/Users/mendez/PTOnboardingApp/backend/.env'));
const result=JSON.parse(fs.readFileSync(`${output}/apply-results.json`)).summary;
const user='totals_hygiene_20261124',reader='ops_client_totals_read_20261124';
const apply='ops_client_totals_apply_20261124',verify='ops_client_totals_verify_20261124';
const secret='client-totals-hygiene-20261124-db',project='ptonboard-dev';
if(!process.argv.includes('--retire-approved-task')||!result.applied||result.verified!==result.demo+result.inactive||result.skipped!==0)throw new Error('Verified approved cleanup is required before retiring task access');
const cloud=args=>execFileSync('gcloud',[...args,`--project=${project}`,'--quiet'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:1024*1024});
let bootstrap,db;
try {
  const password=cloud(['secrets','versions','access','latest',`--secret=${secret}`]).trim();
  const connection={host:env.DB_HOST,port:Number(env.DB_PORT||3307),database:env.DB_NAME,timezone:'+00:00',charset:'utf8mb4_unicode_ci'};
  bootstrap=await mysql.createConnection({...connection,user:env.DB_USER,password:env.DB_PASSWORD});
  await bootstrap.query(`CREATE PROCEDURE ${verify}() SQL SECURITY DEFINER BEGIN
    IF SUBSTRING_INDEX(USER(),'@',1)<>'${user}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Scoped totals verification only'; END IF;
    SELECT COUNT(*) AS manifest_clients,SUM(m.action='demo' AND c.is_demo=1) AS verified_demos,
      SUM(m.action='inactive' AND c.status='ARCHIVED' AND s.status_key='inactive') AS verified_inactive,
      SUM(m.state='applied') AS applied_manifest_entries
      FROM ops_client_totals_manifest_20261124_v2 m JOIN clients c ON c.id=m.client_id AND c.agency_id=2
      LEFT JOIN client_statuses s ON s.id=c.client_status_id;
    SELECT COUNT(*) AS automation_audit_events,COALESCE(SUM(user_id IS NOT NULL),0) AS incorrect_human_actors
      FROM user_activity_log WHERE agency_id=2 AND action_type='automation_client_totals_classified'
      AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.manifest_hash'))='${result.manifestHash}';
    SELECT COUNT(*) AS appended_history_events,COALESCE(SUM(changed_by_user_id IS NOT NULL),0) AS incorrect_human_history_actors
      FROM client_status_history WHERE note LIKE 'Automation ${user}:%';
    SELECT COUNT(*) AS retained_held_attempt_entries FROM ops_client_totals_manifest_20261124 WHERE state='skipped';
  END`);
  await bootstrap.query(`GRANT EXECUTE ON PROCEDURE ${env.DB_NAME}.${verify} TO ?@'%'`,[user]);
  db=await mysql.createConnection({...connection,user,password});
  const [sets]=await db.query(`CALL ${verify}()`);
  const checks=Object.assign({},...sets.filter(Array.isArray).map(rows=>rows[0]));
  for(const [key,expected] of Object.entries({manifest_clients:result.verified,verified_demos:result.demo,verified_inactive:result.inactive,
    applied_manifest_entries:result.verified,automation_audit_events:result.verified,incorrect_human_actors:0,
    appended_history_events:result.demo+2*result.inactive,incorrect_human_history_actors:0,
    retained_held_attempt_entries:result.verified}))if(Number(checks[key])!==expected)throw new Error('Cleanup attribution or record verification failed');
  await db.end();db=null;
  for(const procedure of [reader,apply,verify])await bootstrap.query(`REVOKE EXECUTE ON PROCEDURE ${env.DB_NAME}.${procedure} FROM ?@'%'`,[user]);
  await bootstrap.query("ALTER USER ?@'%' ACCOUNT LOCK",[user]);
  const [grants]=await bootstrap.query("SHOW GRANTS FOR ?@'%'",[user]);
  if(grants.some(row=>Object.values(row).some(value=>!value.startsWith('GRANT USAGE '))))throw new Error('Task account still has privileges');
  const version=cloud(['secrets','versions','describe','latest',`--secret=${secret}`,'--format=value(name)']).trim().split('/').at(-1);
  cloud(['secrets','versions','disable',version,`--secret=${secret}`]);
  const report={verified:true,automationIdentity:user,checks,accountLocked:true,allProcedureGrantsRevoked:true,
    secretVersionDisabled:true,originalAuditEvidenceRetained:true,retiredAt:new Date().toISOString()};
  fs.writeFileSync(`${output}/verification-and-retirement.json`,JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({code:error.code||'VERIFICATION_FAILED',message:'Verification or retirement stopped without logging protected data.'}));process.exitCode=1;}
finally{if(db)await db.end();if(bootstrap)await bootstrap.end();}
