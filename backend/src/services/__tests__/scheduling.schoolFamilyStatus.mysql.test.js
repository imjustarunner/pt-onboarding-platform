/** Disposable local schema only; no live accounts, directory calls or mail. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({schema:`codex_school_family_${process.pid}_${Date.now()}`}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {createSchoolFamilyStatusEmailWorker,schoolFamilyStatusEmailContext} from '../schoolFamilyStatusEmail.service.js';
import {schoolClientStatusContext} from '../schoolClientStatusEmail.service.js';
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('school family transition outbox with real MySQL',()=>{
 let admin,pool,d,context,worker,sourceHash;
 beforeAll(async()=>{
  const options={host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:'',timezone:'+00:00'};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${m.schema}`);
  pool=mysql.createPool({...options,database:m.schema,connectionLimit:6});
  for(const sql of [
   'CREATE TABLE school_client_status_emails(id BIGINT PRIMARY KEY,agency_id INT,school_organization_id INT,client_id INT,state_hash CHAR(64),state_json JSON)',
   'CREATE TABLE school_client_status_email_states(client_id INT,school_organization_id INT,revision INT,state_hash CHAR(64),PRIMARY KEY(client_id,school_organization_id))',
   'CREATE TABLE user_communications(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,client_id INT,recipient_address VARCHAR(255),generated_by_user_id INT,template_type VARCHAR(100),channel VARCHAR(20),metadata JSON,delivery_status VARCHAR(30))',
   'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80),organization_type VARCHAR(30),is_active TINYINT,is_archived TINYINT)',
   'CREATE TABLE organization_affiliations(organization_id INT,agency_id INT,is_active TINYINT)',
   'CREATE TABLE agency_schools(school_organization_id INT,agency_id INT,is_active TINYINT)',
   'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,client_status_id INT,provider_id INT,status VARCHAR(30))',
   'CREATE TABLE client_statuses(id INT PRIMARY KEY,status_key VARCHAR(30))',
   'CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active TINYINT)',
   'CREATE TABLE client_provider_assignments(client_id INT,organization_id INT,provider_user_id INT,is_active TINYINT)',
   'CREATE TABLE users(id INT PRIMARY KEY,is_active TINYINT,is_archived TINYINT,role VARCHAR(30))',
   'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT)'
  ])await pool.query(sql);
  const migration=await readFile(new URL('../../../../database/migrations/1746_school_family_status_emails.sql',import.meta.url),'utf8');
  for(const statement of splitSqlStatements(migration))await pool.query(statement);
 });
 beforeEach(async()=>{
  for(const table of ['school_family_status_emails','school_client_status_emails','school_client_status_email_states','user_communications'])await pool.query(`DELETE FROM ${table}`);
  await pool.query('DELETE FROM user_agencies');await pool.query('DELETE FROM users');
  await pool.query("INSERT INTO users VALUES(555,1,0,'staff')");await pool.query('INSERT INTO user_agencies VALUES(555,2,1)');
  context={client:{id:8,agency_id:2},school:{id:3,name:'School'},providers:[{id:5,first_name:'Provider'}],state:{agencyId:2,kind:'assigned',providerIds:[5],reason:null}};
  sourceHash=createHash('sha256').update(JSON.stringify(context.state)).digest('hex');
  await pool.execute('INSERT INTO school_client_status_emails VALUES(70,2,3,8,?,?)',[sourceHash,JSON.stringify(context.state)]);
  await pool.execute('INSERT INTO school_client_status_email_states VALUES(8,3,1,?)',[sourceHash]);
  const contacts=[11,12].map(id=>({key:`guardian:${id}`,userId:id,email:`parent${id}@example.test`,operationalOnly:true,source:'affiliated_guardian'}));
  d={database:pool,context:async()=>context,contacts:async()=>({contacts,recipients:contacts}),allowed:vi.fn(async()=>true),
   encrypt:value=>'ENC:'+Buffer.from(value).toString('base64'),decrypt:value=>value?.startsWith('ENC:')?Buffer.from(value.slice(4),'base64').toString():value,
   emailContext:async()=>({brand:{name:'ITSCO',products:[],replyTo:'support@itsco.health'}}),domain:async()=> 'itsco.health',mailbox:async()=>({identity:{id:9,agency_id:2,is_active:1}}),
   communication:async args=>{const [row]=await pool.execute('INSERT INTO user_communications(agency_id,client_id,recipient_address,generated_by_user_id,template_type,channel,metadata,delivery_status) VALUES(?,?,?,?,?,?,?,?)',
    [args.agencyId,args.clientId,args.recipientAddress || null,args.generatedByUserId,args.templateType,args.channel,JSON.stringify(args.metadata),args.deliveryStatus]);return {id:row.insertId};},
   updateCommunication:async(id,status)=>pool.execute('UPDATE user_communications SET delivery_status=? WHERE id=?',[status,id]),
   send:vi.fn(async args=>{await schoolFamilyStatusEmailContext(args,{...d,verifyEnvelope:true});return {id:`accepted-${args.existingCommunicationId}`};})};
  worker=createSchoolFamilyStatusEmailWorker(d);
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP DATABASE ${m.schema}`);await admin.end();}});
 const enqueue=db=>db.execute(`INSERT IGNORE INTO school_family_status_emails
  (school_status_email_id,agency_id,school_organization_id,client_id,actor_user_id,revision,state_hash,results_json) VALUES(70,2,3,8,555,1,?,'{}')`,[sourceHash]);
 it('rolls the new family outbox back with its source assignment transaction',async()=>{
  const db=await pool.getConnection();try{await db.beginTransaction();await enqueue(db);await db.rollback();}finally{db.release();}
  expect((await pool.query('SELECT id FROM school_family_status_emails'))[0]).toEqual([]);expect(d.send).not.toHaveBeenCalled();
 });
 it('keeps one durable transition under duplicate insertion and concurrent workers, and never resends accepted mail',async()=>{
  const inserts=await Promise.all([enqueue(pool),enqueue(pool)]);expect(inserts.reduce((count,[row])=>count+row.affectedRows,0)).toBe(1);
  await Promise.all([worker(),worker()]);expect(d.send).toHaveBeenCalledTimes(2);await worker();expect(d.send).toHaveBeenCalledTimes(2);
  const [[job]]=await pool.query('SELECT * FROM school_family_status_emails');expect(job.delivery_status).toBe('processed');expect(job.plan_json).not.toContain('@example.test');
  expect(Object.values(job.results_json).every(result=>result.status==='sent')).toBe(true);
 });
 it('blocks a persisted retry after contact permission or current transition changes',async()=>{
  await enqueue(pool);await worker();const input=d.send.mock.calls[0][0];
  expect(await schoolFamilyStatusEmailContext(input,{...d,verifyEnvelope:true})).toMatchObject({schoolFamilyStatus:true});
  d.allowed.mockResolvedValue(false);await expect(schoolFamilyStatusEmailContext(input,d)).rejects.toThrow('permission changed');
  d.allowed.mockResolvedValue(true);await pool.execute('UPDATE school_client_status_email_states SET revision=2');
  await expect(schoolFamilyStatusEmailContext(input,d)).rejects.toThrow('no longer current');
 });
 it('requires a current staff actor affiliated with the tenant or school even on a persisted retry',async()=>{
  await enqueue(pool);await worker();const input=d.send.mock.calls[0][0];
  await pool.query("UPDATE users SET role='client_guardian' WHERE id=555");
  await expect(schoolFamilyStatusEmailContext(input,d)).rejects.toThrow('no longer current');
  await pool.query("UPDATE users SET role='staff' WHERE id=555");await pool.query('UPDATE user_agencies SET is_active=0');
  await expect(schoolFamilyStatusEmailContext(input,d)).rejects.toThrow('no longer current');
  await pool.query('UPDATE user_agencies SET agency_id=3,is_active=1');
  expect(await schoolFamilyStatusEmailContext(input,d)).toMatchObject({schoolFamilyStatus:true});
 });
 it('retires obsolete future work without sending or reconstructing any historical events',async()=>{
  await enqueue(pool);await pool.execute('UPDATE school_client_status_email_states SET revision=2');await worker();
  expect(d.send).not.toHaveBeenCalled();expect((await pool.query('SELECT delivery_status FROM school_family_status_emails'))[0][0].delivery_status).toBe('obsolete');
 });
 it('uses current active canonical or legacy school affiliation and the required unicode collation',async()=>{
  const [[table]]=await pool.query("SELECT TABLE_COLLATION FROM information_schema.tables WHERE table_schema=? AND table_name='school_family_status_emails'",[m.schema]);
  expect(table.TABLE_COLLATION).toBe('utf8mb4_unicode_ci');
  await pool.query("INSERT INTO agencies VALUES(2,'Owner','agency',1,0),(3,'School','school',1,0),(4,'Other','agency',1,0)");
  await pool.query("INSERT INTO clients VALUES(8,2,3,NULL,NULL,'ACTIVE')");
  await pool.query('INSERT INTO agency_schools VALUES(3,2,1)');
  expect(await schoolClientStatusContext(pool,{clientId:8,schoolId:3})).toMatchObject({school:{id:3}});
  await pool.query('UPDATE agency_schools SET is_active=0');expect(await schoolClientStatusContext(pool,{clientId:8,schoolId:3})).toBeNull();
  await pool.query('INSERT INTO organization_affiliations VALUES(3,4,1)');expect(await schoolClientStatusContext(pool,{clientId:8,schoolId:3})).toBeNull();
  await pool.query('INSERT INTO organization_affiliations VALUES(3,2,1)');expect(await schoolClientStatusContext(pool,{clientId:8,schoolId:3})).toMatchObject({school:{id:3}});
  await pool.query('UPDATE agencies SET is_archived=1 WHERE id=3');expect(await schoolClientStatusContext(pool,{clientId:8,schoolId:3})).toBeNull();
 });
});
