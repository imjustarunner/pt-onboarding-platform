/** Insert missing editable role-library rows only; never issue a contract. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {CONTRACT_SERVICE_ROLES,CONTRACT_SERVICE_ROLE_VERSION} from '../content/contractServiceRoles.js';
dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const apply=process.argv.includes('--apply'),actor=Number(option('actor'));
if(apply&&(!Number.isSafeInteger(actor)||actor<=0))throw Error('An accountable actor is required.');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z'});
try {
 await db.beginTransaction();
 const [agencies]=await db.query("SELECT id,slug FROM agencies WHERE slug IN ('itsco','nlu','tisi') ORDER BY id");
 if(agencies.length!==3)throw Error('Expected the three explicit target agencies.');
 const snapshots=[];
 for(const agency of agencies) {
  const [clauses]=await db.query(`SELECT * FROM contract_clauses WHERE agency_id=? AND clause_key IN (${CONTRACT_SERVICE_ROLES.map(()=>'?').join(',')}) ORDER BY clause_key,id FOR UPDATE`,[agency.id,...CONTRACT_SERVICE_ROLES.map(r=>r.clause_key)]);
  if(new Set(clauses.map(c=>c.clause_key)).size!==clauses.length)throw Error('Duplicate role clauses require reconciliation.');
  snapshots.push({agency,clauses});
 }
 const stateHash=hash(snapshots);
 const report={mode:apply?'applied':'dry-run',version:CONTRACT_SERVICE_ROLE_VERSION,stateHash,agencies:snapshots.map(s=>({agencyId:s.agency.id,slug:s.agency.slug,add:CONTRACT_SERVICE_ROLES.filter(r=>!s.clauses.some(c=>c.clause_key===r.clause_key)).map(r=>r.clause_key),preserve:s.clauses.map(c=>c.clause_key)})),contractsIssued:0,messagesSent:0};
 if(apply) {
  if(option('expected-state')!==stateHash)throw Error('Role library changed; review a fresh dry run.');
  if(!option('backup'))throw Error('A new private backup path is required.');
  fs.writeFileSync(option('backup'),JSON.stringify(snapshots,null,2),{mode:0o600,flag:'wx'});
  for(const snapshot of snapshots)for(const [index,role] of CONTRACT_SERVICE_ROLES.entries()) {
   if(snapshot.clauses.some(c=>c.clause_key===role.clause_key))continue;
   await db.query('INSERT INTO contract_clauses(agency_id,clause_key,title,body_html,sort_hint,is_active,created_by_user_id) VALUES(?,?,?,?,?,1,?)',[snapshot.agency.id,role.clause_key,role.title,role.body_html,600+index,actor]);
  }
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify(report,null,2));
}catch(error){await db.rollback();console.error(error.message);process.exitCode=1;}finally{await db.end();}
