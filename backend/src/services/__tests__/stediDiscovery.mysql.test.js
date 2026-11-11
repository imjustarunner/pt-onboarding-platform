import {it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),insuranceDemographics:vi.fn()}));
vi.mock('../claimMdBillingProfile.service.js',()=>({listClaimMdBillingProfiles:vi.fn()}));
vi.mock('../insuranceVerificationTask.service.js',()=>({queueInsuranceVerificationSafely:vi.fn()}));
vi.mock('../syntheticClearinghouseGuard.service.js',()=>({assertLiveClearinghouseAgency:vi.fn()}));
vi.mock('../familyBillingPolicy.service.js',()=>({auditBilling:vi.fn(),billingError:(status,message)=>Object.assign(new Error(message),{status})}));
import {reserveDiscovery} from '../stediDiscovery.service.js';
import {reserveCob} from '../stediCob.service.js';
import {cobFingerprint} from '../stediCobPolicy.js';
import {discoveryFingerprint} from '../stediDiscoveryPolicy.js';
it.skipIf(process.env.BILLING_FOLLOWUP_MYSQL_TEST!=='1')('serializes duplicate searches and accurately counts concurrent requests without a hard cap in real MySQL',async()=>{
 const config={host:'127.0.0.1',port:33316,user:'root',password:'synthetic-root-only',timezone:'+00:00',multipleStatements:true};
 const admin=await mysql.createConnection(config),schema=`stedi_test_${randomUUID().replaceAll('-','')}`;let db;
 vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,9).toString('base64'));
 try{
  await admin.query(`CREATE DATABASE ${schema}`);db=mysql.createPool({...config,database:schema,connectionLimit:5});
  await db.query(readFileSync(new URL('../../../../database/migrations/1790_stedi_insurance_discovery.sql',import.meta.url),'utf8'));
  await db.query(readFileSync(new URL('../../../../database/migrations/1791_stedi_coordination_of_benefits.sql',import.meta.url),'utf8'));
  await db.query('CREATE TABLE clients (id INT PRIMARY KEY,agency_id INT NOT NULL)');
  const patient={firstName:'Synthetic',lastName:'Person',dateOfBirth:'2000-01-01',state:'CO',addressLine1:'1 Test St',city:'Testville',postalCode:'80000'};
  const deps={pool:db,patientFor:async()=>patient,offices:async()=>[{id:7,practice_npi:'1306688650'}],audit:async()=>{}};
  const make=(clientId,agencyId=2)=>({agencyId,clientId,actorUserId:1,requestKey:randomUUID(),fingerprint:discoveryFingerprint(patient),serviceDate:'2026-11-10',nameConfirmed:true,birthdateConfirmed:true,addressConfirmed:true,costConfirmed:true,reason:'unknown_insurance',billingOfficeId:7});
  await db.query('INSERT INTO clients VALUES (1,2)');
  const duplicates=await Promise.all([reserveDiscovery(make(1),deps),reserveDiscovery(make(1),deps)]);
  expect(duplicates.filter(r=>r.reused)).toHaveLength(1);expect(duplicates[0].row.id).toBe(duplicates[1].row.id);
  for(let i=2;i<=31;i++)await db.execute('INSERT INTO clients VALUES (?,?)',[i,[2,6,377][i%3]]);
  const attempts=await Promise.allSettled(Array.from({length:30},(_,j)=>reserveDiscovery(make(j+2,[2,6,377][(j+2)%3]),deps)));
  expect(attempts.filter(r=>r.status==='rejected').map(r=>({code:r.reason.code,message:r.reason.message}))).toEqual([]);
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(30);
  await db.query("UPDATE stedi_insurance_discoveries SET status='complete' WHERE client_id=1");
  const repeat=await reserveDiscovery({...make(1),freshSearch:true,repeatReason:'Client confirmed a coverage change'},deps);expect(repeat.reused).toBe(false);
  const [[budget]]=await db.query('SELECT SUM(reserved_count) AS n FROM stedi_discovery_budget');expect(Number(budget.n)).toBe(32);
  const [[rows]]=await db.query('SELECT COUNT(*) AS n FROM stedi_insurance_discoveries');expect(Number(rows.n)).toBe(32);
  // Migration reruns preserve discovery rows and both products share a consistent lock order.
  await db.query(readFileSync(new URL('../../../../database/migrations/1791_stedi_coordination_of_benefits.sql',import.meta.url),'utf8'));
  const snapshot={patient,insurance:{verifiedForClaims:true,primary:{insurerName:'Synthetic payer',memberId:'TEST-1',relationshipToSubscriber:'self',subscriberFirstName:patient.firstName,subscriberLastName:patient.lastName,subscriberDob:patient.dateOfBirth}}};
  const cobInput=()=>({...make(1),fingerprint:cobFingerprint(snapshot),slot:'primary',stediPayerId:'TESTS',reason:'billing_order_unclear',policyConfirmed:true,payerConfirmed:true});
  const cobDeps={pool:db,snapshotFor:async()=>snapshot,offices:async()=>[{id:7,practice_npi:'1306688650',practice_name:'Synthetic Practice'}],audit:async()=>{},payer:{stediId:'TESTS',primaryPayerId:'00540',transactionSupport:{coordinationOfBenefits:'SUPPORTED'}}};
  const cob=await Promise.all([reserveCob(cobInput(),cobDeps),reserveCob(cobInput(),cobDeps)]);
  expect(cob.filter(r=>r.reused)).toHaveLength(1);expect(cob[0].row.id).toBe(cob[1].row.id);
  // An unresolved discovery does not stop COB from investigating its coverage order.
  expect(cob[0].row.id).not.toBe(repeat.row.id);
  await expect(reserveCob({...cobInput(),freshSearch:true,repeatReason:'Trying to bypass an uncertain check'},cobDeps)).rejects.toThrow('Resolve the previous COB');
  const stillDiscovery=await reserveDiscovery(make(1),deps);expect(stillDiscovery.row.id).toBe(repeat.row.id);
  await db.execute("UPDATE stedi_insurance_discoveries SET status='reconciled',review_required=0 WHERE id=?",[cob[0].row.id]);
  expect((await reserveCob({...cobInput(),freshSearch:true,repeatReason:'Payer confirmed changed coverage'},cobDeps)).reused).toBe(false);
  const [[combined]]=await db.query('SELECT SUM(reserved_count) AS n FROM stedi_discovery_budget');expect(Number(combined.n)).toBe(34);

 }finally{if(db)await db.end();await admin.query(`DROP DATABASE IF EXISTS ${schema}`);await admin.end();}
},30000);
