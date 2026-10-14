// Disposable database only; never loads .env or connects to a production database.
import {describe,it,expect,vi,beforeAll,afterAll} from 'vitest';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {splitSqlStatements} from '../../utils/migrationSql.js';
vi.mock('../../config/database.js',async()=>({default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.AURICWELL_TEST_MYSQL_PORT||1),user:'root',password:'',database:'codex_auricwell_pricing_validation',timezone:'+00:00',connectionLimit:4})}));
import pool from '../../config/database.js';
import {auricwellPricingRoster,getAuricwellPricingDraft,saveAuricwellPricingDraft} from '../auricwellPricing.service.js';
let admin,created=false;
describe.skipIf(!process.env.AURICWELL_TEST_MYSQL_PORT)('AuricWell draft pricing in disposable MySQL',()=>{
 beforeAll(async()=>{
  admin=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.AURICWELL_TEST_MYSQL_PORT),user:'root',password:''});
  await admin.query('CREATE DATABASE codex_auricwell_pricing_validation');created=true;
  await pool.query('CREATE TABLE agencies (id INT PRIMARY KEY)');
  await pool.query('CREATE TABLE users (id INT PRIMARY KEY,first_name VARCHAR(100),last_name VARCHAR(100),role VARCHAR(40),has_provider_access BOOLEAN DEFAULT 0,is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0,is_demo BOOLEAN DEFAULT 0,status VARCHAR(40) DEFAULT \'ACTIVE_EMPLOYEE\')');
  await pool.query('CREATE TABLE user_agencies (user_id INT,agency_id INT,is_active BOOLEAN DEFAULT 1)');
  const migration=await readFile(new URL('../../../../database/migrations/1624_auricwell_pricing_drafts.sql',import.meta.url),'utf8');
  for(const sql of splitSqlStatements(migration))await pool.query(sql);
  await pool.query('INSERT INTO agencies VALUES (1),(2)');
  await pool.query("INSERT INTO users (id,first_name,last_name,role,is_demo,is_active,is_archived) VALUES (1,'Active','Admin','admin',0,1,0),(2,'Active','Provider','provider',0,1,0),(3,'Demo','Provider','provider',1,1,0),(4,'Inactive','Provider','provider',0,0,0),(5,'Archived','Provider','provider',0,1,1),(6,'Other','Agency','provider',0,1,0),(7,'Former','Member','provider',0,1,0)");
  await pool.query('INSERT INTO user_agencies VALUES (1,1,1),(2,1,1),(3,1,1),(4,1,1),(5,1,1),(6,2,1),(7,1,0)');
 });
 afterAll(async()=>{await pool.end();if(created)await admin.query('DROP DATABASE codex_auricwell_pricing_validation');await admin?.end();});
 it('returns only active non-demo employees affiliated with the selected practice',async()=>{
  expect((await auricwellPricingRoster(1)).map(p=>p.id)).toEqual([1,2]);
  expect((await auricwellPricingRoster(2)).map(p=>p.id)).toEqual([6]);
 });
 it('serializes concurrent edits and retains the signed-rate-independent pricing snapshot',async()=>{
  const input={revision:0,tier:'premium',seats:[{userId:1,category:'administrator',clinical:true},{userId:2,category:'supervised',clinical:true,signingProviderId:1,requiresCosign:true,billsUnderOtherLicense:true}]};
  const results=await Promise.allSettled([saveAuricwellPricingDraft(1,99,input),saveAuricwellPricingDraft(1,100,input)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected').reason.status).toBe(409);
  await saveAuricwellPricingDraft(1,99,{...input,revision:1,tier:'premium_plus'});
  const [rows]=await pool.query('SELECT * FROM auricwell_pricing_drafts WHERE agency_id=1 ORDER BY revision');
  expect(rows).toHaveLength(2);
  const parse=v=>typeof v==='string'?JSON.parse(v):v;
  expect(parse(rows[0].quote_json).totalCents).toBe(12900);expect(parse(rows[1].quote_json).totalCents).toBe(18900);
  expect((await getAuricwellPricingDraft(1)).draft.revision).toBe(2);
  await pool.query('UPDATE users SET is_active=0 WHERE id=2');
  await expect(saveAuricwellPricingDraft(1,99,{...input,revision:2})).rejects.toMatchObject({status:409});
 });
});
