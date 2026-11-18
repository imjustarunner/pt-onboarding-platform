/** Operational schema/readiness only. Never creates an application session,
 * company, user, membership, email proof, role grant or synthetic audit actor. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pool from '../config/database.js';
import {createPlotlineAccountEmail} from '../services/plotlineAccountEmail.service.js';
const args=process.argv.slice(2),apply=args.includes('--apply');
const value=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
try{
 const expected=value('expected-database');
 const [[database]]=await pool.execute('SELECT DATABASE() name');
 if(!expected||expected!==database.name)throw new Error('Pass the exact --expected-database before inspecting or applying this schema.');
 if(apply){
  const directory=path.dirname(fileURLToPath(import.meta.url));
  const migrationPath=process.env.NODE_ENV==='production'?'/app/database/migrations/1847_plotline_self_service.sql':path.resolve(directory,'../../..','database/migrations/1847_plotline_self_service.sql');
  const source=await fs.readFile(migrationPath,'utf8');
  const statements=source.match(/CREATE TABLE IF NOT EXISTS [\s\S]*?;/g)||[];
  if(statements.length!==5)throw new Error('Unexpected Plotline migration shape. No schema was applied.');
  for(const sql of statements)await pool.query(sql);
  await pool.execute(`INSERT IGNORE INTO migrations_log(migration_name,execution_time_ms,success,error_message)
   VALUES('1847_plotline_self_service',0,1,NULL)`);
 }
 const [[schema]]=await pool.execute("SELECT COUNT(*) count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('plotline_capacity','plotline_signups','plotline_company_drafts','plotline_companies','plotline_audit_events')");
 const [[rollout]]=await pool.execute('SELECT enabled FROM user_agency_access_rollout WHERE id=1');
 const [senders]=await pool.execute(`SELECT e.id,e.from_email FROM email_sender_identities e JOIN agencies a ON a.id=e.agency_id
  WHERE a.slug='plottwistco' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND e.identity_key='notifications' AND e.is_active=1`);
 let sender=null;
 const senderId=value('sender-identity')||process.env.PLOTLINE_SENDER_IDENTITY_ID;
 if(senderId){const found=await createPlotlineAccountEmail({identityId:()=>senderId}).sender();sender={id:found.id,address:found.from_email,verified:true};}
 console.log(JSON.stringify({applied:apply,schemaReady:Number(schema.count)===5,accessProfilesEnabled:Number(rollout?.enabled)===1,
  signupMode:process.env.PLOTLINE_SELF_SERVICE_ENABLED||'false',sender,senderCandidates:senders.map(s=>({id:s.id,address:s.from_email})),
  dailyCompanyLimit:20,normalAccountCompanyLimit:1,registeredQaCompanyLimit:2}));
}catch(error){console.error(JSON.stringify({ready:false,code:error.code||'PLOTLINE_READINESS_FAILED',message:error.status?error.message:'Plotline schema/readiness needs review. No application identity was assumed.'}));process.exitCode=1;}
finally{await pool.end();}
