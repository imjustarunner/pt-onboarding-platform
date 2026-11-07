import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
const mocks=vi.hoisted(()=>({execute:vi.fn(),authorize:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:{execute:mocks.execute},onTableWrite:vi.fn()}));
vi.mock('../../narrivaAccess.service.js',async original=>({...await original(),requireNarrivaAgency:mocks.authorize}));
import {authorizedMobileClientCards,sanitizeMobileWorkItem} from '../../mobileClinicalPrivacy.service.js';
describe.runIf(process.env.MOBILE_MYSQL_TEST==='1')('My Work against the deployed full-name-only client schema',()=>{
 let admin,db;const name=`auricwell_mobile_privacy_${process.pid}`;
 beforeAll(async()=>{
  const options={...(process.env.MOBILE_MYSQL_SOCKET?{socketPath:process.env.MOBILE_MYSQL_SOCKET}:{host:'127.0.0.1',port:Number(process.env.MOBILE_MYSQL_PORT||3412)}),user:'root',password:process.env.MOBILE_MYSQL_PASSWORD||'',multipleStatements:true};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  db=await mysql.createConnection({...options,database:name});
  await db.query(`CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,client_type VARCHAR(20),provider_id INT,full_name VARCHAR(120),date_of_birth DATE);
   CREATE TABLE client_agency_assignments(client_id INT,agency_id INT,is_active BOOLEAN);
   CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active BOOLEAN);
   INSERT INTO clients VALUES(1,10,'clinical',7,'Michael Anderson','2014-04-14'),(2,20,'clinical',7,'Other Tenant','2014-04-14'),(3,10,'school',9,'Not Assigned','2014-04-14'),(4,20,'school',9,'Shared Student','2014-04-14'),(5,10,'learning',7,'Unrelated Type','2014-04-14'),(6,10,'clinical',9,'Revoked Assignment','2014-04-14');
   INSERT INTO client_agency_assignments VALUES(4,10,1);INSERT INTO client_provider_assignments VALUES(4,7,1),(6,7,0);`);
 });
 beforeEach(()=>{vi.setSystemTime(new Date('2026-11-06T19:00:00Z'));mocks.execute.mockReset().mockImplementation((...args)=>db.execute(...args));mocks.authorize.mockReset().mockResolvedValue(undefined);});
 afterEach(()=>vi.useRealTimers());
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}});
 it('loads masked cards without selecting nonexistent first_name/last_name columns',async()=>{
  const cards=await authorizedMobileClientCards({id:7,role:'provider'},10,[1,2,3,4,5,6]);
  expect([...cards.keys()]).toEqual([1,4]);expect(cards.get(1)).toMatchObject({id:1,maskedName:'Mic* And*',age:12});expect(Object.keys(cards.get(1)).sort()).toEqual(['age','id','maskedName']);expect(JSON.stringify([...cards.values()])).not.toMatch(/Michael|Anderson|2014-04-14/);
  const item=sanitizeMobileWorkItem({id:51,clientId:1,clientName:'Michael Anderson',clientDob:'2014-04-14',agencyId:10,clinicalSessionId:9,status:'started'},cards.get(1));
  expect(item).toMatchObject({id:51,clientId:1,clientName:'Mic* And*',maskedName:'Mic* And*',clinicalSessionId:9});expect(JSON.stringify(item)).not.toMatch(/Michael|Anderson|2014-04-14/);
 });
 it('retains workspace and client-type restrictions for broad clinical roles',async()=>{expect([...(await authorizedMobileClientCards({id:7,role:'admin'},10,[1,2,3,4,5,6])).keys()]).toEqual([1,3,4,6]);});
 it('rejects revoked workspace access before reading any client rows',async()=>{mocks.authorize.mockRejectedValue(Object.assign(new Error('Access revoked'),{status:403}));await expect(authorizedMobileClientCards({id:7,role:'provider'},10,[1])).rejects.toMatchObject({status:403});expect(mocks.execute).not.toHaveBeenCalled();});
 it('does not query clients when the queue has no valid client IDs',async()=>{expect((await authorizedMobileClientCards({id:7,role:'provider'},10,[null,'bad',0])).size).toBe(0);expect(mocks.execute).not.toHaveBeenCalled();});
});
