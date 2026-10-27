// Owner-run synthetic second-parent fixture. Never reset passwords or sign consent.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {isAuricwellQaAgency} from '../utils/auricwellQaPolicy.js';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
const plan={agencyId:450,clientId:2271,email:'qa.family.second.auricwell@example.com',role:'client_guardian',createsClient:false,resetsPasswords:false,signsConsent:false};
if(!args.includes('--apply'))console.log(JSON.stringify(plan));
else{
 if(!args.includes('--env')||!args.includes('--receipt-dir'))throw Error('Provide --env and --receipt-dir explicitly.');
 dotenv.config({path:arg('--env'),quiet:true});
 const directory=path.resolve(arg('--receipt-dir'));fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const receipt=path.join(directory,'second-parent.json');
 if(fs.existsSync(receipt))throw Error('The private second-parent receipt already exists; use it without resetting credentials.');
 const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 let saved=null,committed=false;
 try{
  await db.beginTransaction();
  const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450 FOR UPDATE');
  if(!isAuricwellQaAgency(agency))throw Error('Expected isolated demo agency.');
  const [[client]]=await db.execute('SELECT id,full_name FROM clients WHERE id=2271 AND agency_id=450 FOR UPDATE');
  if(!client?.full_name.includes('QA-OfficeEN-1027'))throw Error('Expected retained fictional Rowan client.');
  const [[parent]]=await db.execute("SELECT u.id FROM users u JOIN client_guardians cg ON cg.guardian_user_id=u.id WHERE u.id=1440 AND u.role='client_guardian' AND u.is_demo=1 AND cg.client_id=2271 AND cg.access_enabled=1");
  if(!parent)throw Error('Expected first synthetic parent link.');
  const [[existing]]=await db.execute('SELECT id FROM users WHERE email=?',[plan.email]);
  if(existing)throw Error('Second-parent account already exists; inspect the existing receipt.');
  const password=crypto.randomBytes(24).toString('base64url');
  const [result]=await db.execute(`INSERT INTO users(email,personal_email,username,first_name,last_name,role,status,is_active,is_demo,created_via_dev_fill,password_hash,identity_product,timezone)
   VALUES(?,?,?,'Second','Parent QA','client_guardian','ACTIVE_EMPLOYEE',1,1,1,?,'full_suite','America/Denver')`,[plan.email,plan.email,plan.email,await bcrypt.hash(password,12)]);
  const userId=Number(result.insertId);
  await db.execute("INSERT INTO user_agencies(user_id,agency_id,is_active,is_default,agency_role) VALUES(?,450,1,1,'client_guardian')",[userId]);
  await db.execute("INSERT INTO user_preferences(user_id,timezone,sms_enabled,sms_forwarding_enabled,sms_support_mirror_enabled) VALUES(?,'America/Denver',0,0,0)",[userId]);
  await db.execute(`INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id)
   VALUES(2271,?,'guardian','Parent',1,?,1435)`,[userId,JSON.stringify({canMessage:true,canSignDocs:false,canViewDocs:false,canViewLinks:false,canViewProgress:false,canViewProgramMaterials:false})]);
  await db.execute("INSERT INTO family_billing_audit(agency_id,actor_user_id,client_id,action,object_id) VALUES(450,1435,2271,'qa_second_parent_provisioned',?)",[userId]);
  saved={key:'second-parent',userId,username:plan.email,password,role:plan.role,agencyId:450,clientId:2271,login:'https://app.itsco.health/auricwell-qa-demo/login',status:'prepared_pending_commit'};
  fs.writeFileSync(receipt,JSON.stringify(saved,null,2)+'\n',{flag:'wx',mode:0o600});
  await db.commit();committed=true;saved.status='provisioned';fs.writeFileSync(receipt,JSON.stringify(saved,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({...plan,userId,provisioned:true,receipt}));
 }catch(e){if(!committed)await db.rollback();if(saved){saved.status=committed?'committed_check_receipt':'rolled_back';fs.writeFileSync(receipt,JSON.stringify(saved,null,2)+'\n',{mode:0o600});}throw e;}finally{await db.end();}
}
