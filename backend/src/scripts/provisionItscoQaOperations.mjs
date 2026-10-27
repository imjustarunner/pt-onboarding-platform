// Owner-run, isolated fixtures. Never changes or resets an existing account.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import {isAuricwellQaAgency} from '../utils/auricwellQaPolicy.js';
const args=process.argv.slice(2),arg=key=>args[args.indexOf(key)+1];
const definitions=[{key:'biller',first:'Jamie',last:'Chen QA Billing',billing:1,active:1},
 {key:'inactive',first:'Inactive',last:'QA Fixture',billing:0,active:0},
 {key:'expired-password',first:'Expired',last:'QA Fixture',billing:0,active:1,expired:true}];
if(!args.includes('--apply'))console.log(JSON.stringify({agencyId:450,role:'support',creates:definitions.map(d=>d.key),billingOnlyFor:'biller'}));
else {
 if(!args.includes('--env')||!args.includes('--receipt-dir'))throw Error('Supply explicit environment and private receipt directory');
 dotenv.config({path:arg('--env'),quiet:true});const directory=path.resolve(arg('--receipt-dir'));fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 try{
  await db.beginTransaction();const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450 FOR UPDATE');if(!isAuricwellQaAgency(agency))throw Error('Wrong workspace');
  const accounts=[];
  for(const d of definitions){
   const username=`qa.${d.key}.auricwell@example.com`;const [[existing]]=await db.execute('SELECT id FROM users WHERE email=?',[username]);if(existing)throw Error(`Fixture ${d.key} already exists; use its receipt`);
   const password=crypto.randomBytes(24).toString('base64url');
   const passwordHash=await bcrypt.hash(password,12);
   const [result]=await db.execute(`INSERT INTO users(email,personal_email,username,first_name,last_name,role,status,is_active,is_demo,created_via_dev_fill,password_hash,password_changed_at,temporary_password_hash,temporary_password_expires_at,identity_product,timezone,sees_clients)
    VALUES(?,?,?,?,?,'support',?,?,1,1,?,?,?,?,'full_suite','America/Denver',0)`,[username,username,username,d.first,d.last,d.active?'ACTIVE_EMPLOYEE':'INACTIVE_EMPLOYEE',d.active,d.expired?null:passwordHash,d.expired?null:new Date(),d.expired?passwordHash:null,d.expired?'2026-05-01 00:00:00':null]);
   await db.execute("INSERT INTO user_agencies(user_id,agency_id,is_active,is_default,agency_role,has_billing_access,include_on_disclosure) VALUES(?,450,1,1,'support',?,0)",[result.insertId,d.billing]);
   await db.execute("INSERT INTO user_preferences(user_id,timezone,sms_enabled,sms_forwarding_enabled,sms_support_mirror_enabled) VALUES(?,'America/Denver',0,0,0)",[result.insertId]);
   accounts.push({key:d.key,userId:result.insertId,username,password,role:'support',billingAccess:!!d.billing,active:!!d.active,expiredPassword:!!d.expired,agencyId:450,login:'https://app.itsco.health/auricwell-qa-demo/login'});
  }
  // Write recoverable private receipts before commit; no credentials enter source control.
  for(const account of accounts)fs.writeFileSync(path.join(directory,`${account.key}.json`),JSON.stringify(account,null,2)+'\n',{flag:'wx',mode:0o600});
  await db.commit();console.log(JSON.stringify(accounts.map(({password,...a})=>a)));
 }catch(e){await db.rollback();throw e;}finally{await db.end();}
}
