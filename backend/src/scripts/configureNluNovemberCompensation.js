import fs from 'node:fs';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {configureNluCompensation} from '../services/nluCompensationSetup.service.js';
dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const apply=process.argv.includes('--apply');
const actor=Number(option('actor'));
if(apply&&(!Number.isSafeInteger(actor)||actor<=0))throw Error('An accountable actor is required for the configuration audit.');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z'});
try {
 const result=await configureNluCompensation(db,{dryRun:!apply,effectiveOn:option('effective-on')||'2026-11-21',beforeApply:async plan=>{
  const stateHash=hash(plan.backup);
  if(option('expected-state')!==stateHash)throw Error('NLU pay configuration changed; review a fresh dry run.');
  if(!option('backup'))throw Error('A new private backup path is required.');
  fs.writeFileSync(option('backup'),JSON.stringify(plan.backup,null,2),{mode:0o600,flag:'wx'});
 }});
 if(result.alreadyConfigured)console.log(JSON.stringify(result));
 else {
  const {backup,...report}=result;
  if(apply) {
   await db.query("INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('workplace_handbook_updated',?,?,?)",[actor,result.agencyId,JSON.stringify({reason:'Owner-requested prospective NLU category configuration',version:result.version,renumbering:result.renumbering,effectiveOn:result.effectiveOn,payrollActivated:false,existingIndividualRatesPreserved:true})]);
  }
  console.log(JSON.stringify({...report,stateHash:hash(backup),messagesSent:0,contractsIssued:0,payrollActivated:false},null,2));
 }
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.end();}
