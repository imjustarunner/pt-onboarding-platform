import {beforeAll,afterAll,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import {skipSyntheticQaRecoveryCaptcha} from '../syntheticQaCaptcha.service.js';
let admin,db;
const schema=`qa_captcha_${process.pid}_${Date.now()}`;
beforeAll(async()=>{
 const socketPath=process.env.QA_CAPTCHA_MYSQL_SOCKET;
 const local=socketPath==='/private/tmp/pt-1111b-mysql.sock';
 const ci=process.env.CI==='true' && process.env.REQUIRE_QA_CAPTCHA_MYSQL==='1'
   && process.env.QA_CAPTCHA_MYSQL_HOST==='127.0.0.1' && process.env.QA_CAPTCHA_MYSQL_PORT==='33316';
 if(!local && !ci)throw new Error('Use only the explicit disposable local socket or CI MySQL service, never a shared/default database');
 const connection=local?{socketPath,user:'root'}:{host:'127.0.0.1',port:33316,user:'root',password:''};
 admin=await mysql.createConnection(connection);
 await admin.query(`CREATE DATABASE \`${schema}\``);
 db=await mysql.createConnection({...connection,database:schema});
 await db.query('CREATE TABLE users(id INT PRIMARY KEY,username VARCHAR(255),email VARCHAR(255),is_demo INT,is_active INT,is_archived INT)');
 await db.query('CREATE TABLE agencies(id INT PRIMARY KEY,slug VARCHAR(120),portal_url VARCHAR(120),organization_type VARCHAR(30),feature_flags JSON,is_active INT,is_archived INT)');
 await db.query('CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active INT)');
 await db.query('CREATE TABLE organization_affiliations(organization_id INT,agency_id INT,is_active INT)');
 await db.query(`INSERT INTO users VALUES(1496,'finley','finley@example.com',1,1,0),(1433,'avery','avery@example.com',1,1,0),(20,'real','real@example.com',0,1,0),(21,'mixed','mixed@example.com',1,1,0)`);
 for(const a of [[450,'auricwell-qa-demo','agency',{qaSandbox:{syntheticOnly:true}}],[453,'nlu-qa-demo','agency',{qaSandbox:{syntheticOnly:true,program:'tutoring'}}],[454,'nlu-qa-learning','learning',{qaSandbox:{syntheticOnly:true,program:'tutoring'}}],[456,'scb-qa-company','agency',{qaCaptcha:{syntheticOnly:true}}],[6,'nlu','agency',{}]])await db.execute('INSERT INTO agencies VALUES(?,?,?,?,?,1,0)',[a[0],a[1],a[1],a[2],JSON.stringify(a[3])]);
 await db.query('INSERT INTO organization_affiliations VALUES(454,453,1)');
 await db.query('INSERT INTO user_agencies VALUES(1496,453,1),(1496,454,1),(1433,450,1),(1433,456,1),(20,450,1),(21,450,1),(21,6,1)');
});
afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS \`${schema}\``);await admin.end();}});
it('executes the real minimal-identity query and active affiliation binding',async()=>{
 expect(await skipSyntheticQaRecoveryCaptcha({identifier:'FINLEY',organizationSlug:'nlu-qa-learning'},db)).toBe(true);
 expect(await skipSyntheticQaRecoveryCaptcha({identifier:'avery@example.com',organizationSlug:'scb-qa-company'},db)).toBe(true);
});
it('real users, mixed memberships, unknown identities and wrong tenants retain CAPTCHA',async()=>{
 for(const identifier of ['real','mixed','unknown'])expect(await skipSyntheticQaRecoveryCaptcha({identifier,organizationSlug:'auricwell-qa-demo'},db)).toBe(false);
 expect(await skipSyntheticQaRecoveryCaptcha({identifier:'finley',organizationSlug:'nlu'},db)).toBe(false);
});
it('a child with ambiguous/live parent, marker removal or inactive tenant revokes immediately',async()=>{
 await db.query('INSERT INTO organization_affiliations VALUES(454,999,1)');
 expect(await skipSyntheticQaRecoveryCaptcha({identifier:'finley',organizationSlug:'nlu-qa-demo'},db)).toBe(false);
 await db.query('DELETE FROM organization_affiliations WHERE agency_id=999');
 await db.query('UPDATE organization_affiliations SET agency_id=6 WHERE organization_id=454');
 expect(await skipSyntheticQaRecoveryCaptcha({identifier:'finley',organizationSlug:'nlu-qa-demo'},db)).toBe(false);
 await db.query('UPDATE agencies SET feature_flags=JSON_OBJECT() WHERE id=456');
 expect(await skipSyntheticQaRecoveryCaptcha({identifier:'avery',organizationSlug:'auricwell-qa-demo'},db)).toBe(false);
 await db.query('UPDATE agencies SET is_active=0 WHERE id=450');
 expect(await skipSyntheticQaRecoveryCaptcha({identifier:'avery',organizationSlug:'auricwell-qa-demo'},db)).toBe(false);
});

it('deployment marker migration touches only exact active456, preserves namespace/other flags and is idempotent',async()=>{
 const migration=readFileSync(new URL('../../../../database/migrations/1812_verified_demo_captcha_config.sql',import.meta.url),'utf8');
 await db.query('DELETE FROM agencies');
 await db.query('ALTER TABLE agencies MODIFY feature_flags LONGTEXT');
 const rows=[
  [456,'scb-qa-company','agency',{schoolCareBridgeOnly:true,preserve:{nested:'exact'},qaCaptcha:{reason:'retained fixture'}},1,0],
  [6,'nlu','agency',{qaCaptcha:{syntheticOnly:false},preserve:'real'},1,0],
  [450,'auricwell-qa-demo','agency',{qaSandbox:{syntheticOnly:true}},1,0],
  [457,'scb-qa-company','agency',{preserve:'wrong id'},1,0]
 ];
 for(const [id,slug,type,flags,active,archived] of rows)await db.execute('INSERT INTO agencies VALUES(?,?,?,?,?,?,?)',[id,slug,slug,type,JSON.stringify(flags),active,archived]);
 await db.query(migration);await db.query(migration);
 const [actual]=await db.query('SELECT id,feature_flags FROM agencies ORDER BY id');
 const flags=id=>{const raw=actual.find(r=>r.id===id).feature_flags;return typeof raw==='string'?JSON.parse(raw):raw;};
 expect(flags(456)).toEqual({...rows[0][3],qaCaptcha:{reason:'retained fixture',syntheticOnly:true}});
 for(const r of rows.slice(1))expect(flags(r[0])).toEqual(r[3]);
 await db.execute('UPDATE agencies SET feature_flags=? WHERE id=456',['{invalid']);
 await db.query(migration);const [[invalid]]=await db.query('SELECT feature_flags FROM agencies WHERE id=456');expect(invalid.feature_flags).toBe('{invalid');
 for(const [slug,type,active,archived] of [['real-company','agency',1,0],['scb-qa-company','school',1,0],['scb-qa-company','agency',0,0],['scb-qa-company','agency',1,1]]){
  await db.execute('UPDATE agencies SET slug=?,organization_type=?,is_active=?,is_archived=?,feature_flags=? WHERE id=456',[slug,type,active,archived,JSON.stringify({keep:'same'})]);
  await db.query(migration);const [[row]]=await db.query('SELECT feature_flags FROM agencies WHERE id=456');expect(typeof row.feature_flags==='string'?JSON.parse(row.feature_flags):row.feature_flags).toEqual({keep:'same'});
 }
});
