// Explicit demo-only fixture expansion. Never reset passwords or sign agreements.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';

const args = process.argv.slice(2);
const arg = key => args[args.indexOf(key) + 1];
const definitions = [
  {key:'supervisor', first:'Cameron', last:'Reed QA Supervisor', supervisor:1},
  {key:'supervisee', first:'Alex', last:'Rivera QA Supervisee', supervisor:0}
];
if (!args.includes('--apply')) {
  console.log(JSON.stringify({agencyId:450, creates:definitions.map(d=>d.key), role:'provider', clinicalOrganization:true, resetsPasswords:false, signsAgreements:false}));
} else {
  if (!args.includes('--env') || !args.includes('--receipt-dir')) throw new Error('Provide explicit --env and --receipt-dir paths.');
  dotenv.config({path:arg('--env'),quiet:true});
  const directory=path.resolve(arg('--receipt-dir'));
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const result={at:new Date().toISOString(),agencyId:450,accounts:[],status:'preparing'};
  const receipt=path.join(directory,'supervision-provisioning.json');
  const fd=fs.openSync(receipt,'wx',0o600);
  const save=()=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(result,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};
  let committed=false;
  try {
    await db.beginTransaction();
    const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450 FOR UPDATE');
    if (!isAuricwellQaAgency(agency)) throw new Error('Isolated QA agency verification failed.');
    const [members]=await db.execute('SELECT u.id,u.email,u.role,u.is_demo FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=450 AND ua.is_active=1');
    if (!members.some(u=>u.id===1433&&u.email==='qa.provider.auricwell@example.com'&&u.is_demo===1)) throw new Error('Original QA provider not verified.');
    if (members.filter(u=>['provider','provider_plus','supervisor','intern','intern_plus'].includes(u.role)).length+2>10) throw new Error('Provider cap would be exceeded.');
    for (const d of definitions) {
      const email=`qa.provider.${d.key}.auricwell@example.com`;
      const [[exists]]=await db.execute('SELECT id FROM users WHERE email=?',[email]);
      if(exists)throw new Error('Pair already exists. Use the saved receipt; never reset credentials.');
      const password=crypto.randomBytes(24).toString('base64url');
      const [insert]=await db.execute(`INSERT INTO users
        (email,personal_email,username,first_name,last_name,role,status,is_active,is_demo,created_via_dev_fill,password_hash,identity_product,timezone,has_supervisor_privileges,sees_clients,provider_accepting_new_clients,languages_spoken)
        VALUES (?,?,?,?,?,'provider','ACTIVE_EMPLOYEE',1,1,1,?,'full_suite','America/Denver',?,1,1,'English, Spanish')`,
        [email,email,email,d.first,d.last,await bcrypt.hash(password,12),d.supervisor]);
      const userId=Number(insert.insertId);
      await db.execute("INSERT INTO user_agencies (user_id,agency_id,is_active,is_default,agency_role) VALUES (?,450,1,1,'provider')",[userId]);
      await db.execute("INSERT INTO user_preferences (user_id,timezone,sms_enabled,sms_forwarding_enabled,sms_support_mirror_enabled) VALUES (?,'America/Denver',0,0,0)",[userId]);
      result.accounts.push({key:d.key,userId,username:email,password,role:'provider',agencyId:450,login:'https://app.itsco.health/auricwell-qa-demo/login',auricwellLogin:'https://auricwell.com/app/auricwell-qa-demo'});
    }
    const [assignment]=await db.execute("INSERT INTO supervisor_assignments (supervisor_id,supervisee_id,agency_id,supervisor_type,is_primary,created_by_user_id) VALUES (?,?,450,'clinical',1,1435)",result.accounts.map(a=>a.userId));
    result.assignmentId=Number(assignment.insertId);
    const {ensureSupervisionAgreement}=await import('../services/supervisionAgreement.service.js');
    const agreement=await ensureSupervisionAgreement(result.assignmentId,db);
    if(!agreement)throw new Error('Supervision agreement draft was not created.');
    result.agreementId=Number(agreement.id);
    const flags=typeof agency.feature_flags==='string'?JSON.parse(agency.feature_flags):agency.feature_flags;
    flags.qaSandbox.timezone='America/Denver';
    flags.qaSandbox.exchangeProviders=[{id:1433,email:'qa.provider.auricwell@example.com'},...result.accounts.map(a=>({id:a.userId,email:a.username}))];
    await db.execute('UPDATE agencies SET feature_flags=? WHERE id=450',[JSON.stringify(flags)]);
    const [[existingClinic]]=await db.execute("SELECT id FROM agencies WHERE slug='auricwell-qa-demo-clinic'");
    if(existingClinic)throw new Error('Clinical fixture already exists; inspect before rerunning.');
    const [clinic]=await db.execute("INSERT INTO agencies (name,official_name,slug,portal_url,organization_type,is_active,feature_flags) VALUES (?,?,'auricwell-qa-demo-clinic','auricwell-qa-demo-clinic','clinical',1,?)",['Cedar Grove Counseling — DEMO','Cedar Grove Counseling — DEMO',JSON.stringify({qaSandbox:{syntheticOnly:true,inbox:'testing@itsco.health'}})]);
    result.clinicalOrganizationId=Number(clinic.insertId);
    await db.execute('INSERT INTO organization_affiliations (agency_id,organization_id,is_active) VALUES (450,?,1)',[result.clinicalOrganizationId]);
    // Align existing user preferences with the timezone already set on these accounts.
    await db.execute("UPDATE user_preferences SET timezone='America/Denver' WHERE user_id IN (1433,1434) AND timezone IS NULL");
    result.status='prepared_pending_commit';save();await db.commit();committed=true;
    result.status='provisioned';save();
    for(const a of result.accounts)fs.writeFileSync(path.join(directory,`${a.key}.json`),JSON.stringify(a,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({...result,accounts:result.accounts.map(({password,...a})=>a),receipt}));
  } catch(e){if(!committed)await db.rollback();result.status=committed?'committed_check_receipt':'rolled_back';save();throw e;}
  finally{fs.closeSync(fd);await db.end();const {default:pool}=await import('../config/database.js');await pool.end();}
}
