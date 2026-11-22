import {it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {saveEligibilityAutomation} from '../eligibilityAutomation.service.js';
it.skipIf(!process.env.INSURANCE_TEST_MYSQL_SOCKET&&process.env.FEE_SCHEDULE_MYSQL_TEST!=='1')('saves automatic-on-save settings transactionally while preserving existing agency flags',async()=>{
 const db=await mysql.createConnection(process.env.INSURANCE_TEST_MYSQL_SOCKET?{socketPath:process.env.INSURANCE_TEST_MYSQL_SOCKET,user:'root'}:{host:'127.0.0.1',port:33317,user:'root',password:'synthetic-root-only'}),schema=`insurance_${randomUUID().replaceAll('-','')}`;
 try {
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  await db.query('CREATE TABLE agencies(id INT PRIMARY KEY,feature_flags JSON)');
  await db.query('CREATE TABLE agency_eligibility_automation(agency_id INT PRIMARY KEY,enabled BOOLEAN,cadence VARCHAR(20),monthly_limit INT,reviewer_user_id INT,readiness_reference VARCHAR(1000),revision INT)');
  await db.execute('INSERT INTO agencies VALUES(6,?)',[JSON.stringify({medicalBillingEnabled:true,intakeEligibilityAutomation:{medicaidState:'CO'}})]);
  const pool={getConnection:async()=>({execute:db.execute.bind(db),beginTransaction:db.beginTransaction.bind(db),commit:db.commit.bind(db),rollback:db.rollback.bind(db),release:()=>{}})},profile=vi.fn(async()=>({}));
  const input={agencyId:6,actorUserId:99,enabled:true,cadence:'monthly',monthlyLimit:100,revision:0,readinessReference:'Synthetic setup review',readinessConfirmed:true,intakeEnabled:true,defaultOfficeId:8};
  await saveEligibilityAutomation(input,{pool,profile,audit:async()=>{}});
  const [[agency]]=await db.query('SELECT feature_flags FROM agencies WHERE id=6');expect(agency.feature_flags).toEqual({medicalBillingEnabled:true,intakeEligibilityAutomation:{enabled:true,officeId:8,medicaidState:'CO'}});expect(profile).toHaveBeenCalledWith(6,8);
  const [[policy]]=await db.query('SELECT * FROM agency_eligibility_automation WHERE agency_id=6');expect(policy).toMatchObject({enabled:1,monthly_limit:100,revision:1});
  await expect(saveEligibilityAutomation({...input,defaultOfficeId:123,revision:1},{pool,profile:async()=>{throw Object.assign(new Error('Office belongs to another agency'),{status:409});},audit:async()=>{}})).rejects.toMatchObject({status:409});
  const [[after]]=await db.query('SELECT feature_flags FROM agencies WHERE id=6');expect(after).toEqual(agency);
 }finally{await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
});
