import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
const project='ptonboard-dev',user='packet_recovery_20261123',procedure='ops_packet_recovery_20261123';
const account='packet-recovery-20261123@ptonboard-dev.iam.gserviceaccount.com';
const env=dotenv.parse(fs.readFileSync('/Users/mendez/PTOnboardingApp/backend/.env'));
let db;
try {
 db=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3307),user:env.DB_USER,password:env.DB_PASSWORD,database:'onboarding_stage',connectTimeout:10000});
 const [rows]=await db.query('SELECT draft_id,client_id,task_id,recovery_state,identity_status,completed_at FROM ops_packet_recovery_manifest_20261123 ORDER BY draft_id');
 if(rows.length!==7||rows.some(r=>r.recovery_state!=='scanned'))throw Error('SEVEN_PACKET_RECOVERY_NOT_COMPLETE');
 await db.query(`REVOKE EXECUTE ON PROCEDURE onboarding_stage.${procedure} FROM ?@'%'`,[user]);
 await db.query('REVOKE EXECUTE ON PROCEDURE onboarding_stage.ops_packet_identity_recovery_20261123 FROM ?@\'%\'',[user]);
 await db.query("ALTER USER ?@'%' ACCOUNT LOCK",[user]);
 const cloud=args=>execFileSync('/Users/mendez/google-cloud-sdk/bin/gcloud',[...args,`--project=${project}`,'--quiet'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 cloud(['iam','service-accounts','disable',account]);
 const version=cloud(['secrets','versions','describe','latest','--secret=packet-recovery-20261123-db-password','--format=value(name)']).trim().split('/').at(-1);
 cloud(['secrets','versions','disable',version,'--secret=packet-recovery-20261123-db-password']);
 const evidence={automation:account,retired:true,databaseAccountLocked:true,procedureExecutionRevoked:true,serviceAccountDisabled:true,credentialVersionDisabled:true,originalAuditsPreserved:true,records:rows};
 fs.writeFileSync(new URL('../../../artifacts/packet-draft-recovery-20261123/retirement-verification.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
}catch(error){console.error(JSON.stringify({error:error.code||error.message}));process.exitCode=1;}finally{if(db)await db.end();}
