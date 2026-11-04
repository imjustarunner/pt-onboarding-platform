/** Disposable local schema; no directory provisioning or real accounts. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
const m=vi.hoisted(()=>({getConnection:vi.fn(),schema:`codex_hire_username_${process.pid}_${Date.now()}`}));
vi.mock('../../config/database.js',()=>({default:{getConnection:m.getConnection},onTableWrite:vi.fn()}));
import {savePortalStep} from '../hirePortalWorkflow.service.js';
process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('work username reservations with real MySQL',()=>{
 let admin,pool;
 beforeAll(async()=>{
  const options={host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:'',timezone:'+00:00'};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${m.schema}`);
  pool=mysql.createPool({...options,database:m.schema,connectionLimit:6});m.getConnection.mockImplementation(()=>pool.getConnection());
  await pool.query('CREATE TABLE users(id INT PRIMARY KEY,status VARCHAR(40),email VARCHAR(255),work_email VARCHAR(255),password VARCHAR(80),login_is_group_email TINYINT,sso_password_override TINYINT)');
  await pool.query('CREATE TABLE hire_journeys(user_id INT PRIMARY KEY,prehire_completed_at DATETIME,onboarding_completed_at DATETIME)');
  await pool.query('CREATE TABLE hire_portal_submissions(user_id INT,phase VARCHAR(30),step_key VARCHAR(60),encrypted_value JSON,completed_at DATETIME,PRIMARY KEY(user_id,phase,step_key))');
 });
 beforeEach(async()=>{
  await pool.query('DROP TRIGGER IF EXISTS reject_username_step');
  for(const table of ['hire_portal_submissions','hire_journeys','users'])await pool.query(`DELETE FROM ${table}`);
  await pool.query("INSERT INTO users VALUES(1,'PREHIRE_REVIEW','personal1@example.test',NULL,'unchanged-password',0,0),(2,'PREHIRE_REVIEW','personal2@example.test',NULL,'unchanged-password',0,0)");
  await pool.query("INSERT INTO hire_journeys VALUES(1,'2026-09-01',NULL),(2,'2026-09-01',NULL)");
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP DATABASE ${m.schema}`);await admin.end();}});
 const reserve=(userId,email='newhire@agency.test')=>savePortalStep({userId,agencyId:2,phase:'pre_hire',key:'work-email',value:{email,preferenceOnly:true}});
 it('persists only the reserved work address and encrypted acknowledgement for closed legacy pre-hire',async()=>{
  await reserve(1);const [[user]]=await pool.query('SELECT * FROM users WHERE id=1');
  expect(user).toMatchObject({work_email:'newhire@agency.test',email:'personal1@example.test',status:'PREHIRE_REVIEW',password:'unchanged-password',login_is_group_email:0,sso_password_override:0});
  const [[step]]=await pool.query('SELECT * FROM hire_portal_submissions');expect(JSON.stringify(step.encrypted_value)).not.toContain('newhire@agency.test');
  expect(step.completed_at).toBeTruthy();
 });
 it('rolls the address back with a failed acknowledgement and releases the address claim',async()=>{
  await pool.query("CREATE TRIGGER reject_username_step BEFORE INSERT ON hire_portal_submissions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic submission failure'");
  await expect(reserve(1)).rejects.toThrow('synthetic submission failure');
  expect((await pool.query('SELECT work_email FROM users WHERE id=1'))[0][0].work_email).toBeNull();
  await pool.query('DROP TRIGGER reject_username_step');await expect(reserve(2)).resolves.toBeUndefined();
 });
 it('serializes competing claims so only one candidate can reserve the same address',async()=>{
  const results=await Promise.allSettled([reserve(1),reserve(2)]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(results.find(result=>result.status==='rejected').reason).toMatchObject({status:409});
  expect((await pool.query('SELECT id FROM users WHERE work_email=?',['newhire@agency.test']))[0]).toHaveLength(1);
  expect((await pool.query('SELECT user_id FROM hire_portal_submissions'))[0]).toHaveLength(1);
 });
});
