import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {createBusinessOnboardingService,validateBusinessApplication,validateBusinessSlug,businessInvitationDeliveryStatus} from '../businessOnboarding.service.js';
const application=()=>({businessName:'Synthetic Company',firstName:'Sample',lastName:'Owner',email:`sample-${crypto.randomUUID()}@example.test`,phone:'555-0100',path:'hq',businessType:'consulting',stage:'established',goals:'Organize our synthetic test business.',services:['hq','people'],consent:true,websiteTrap:''});
test('business intake accepts only validated contact, business, and service fields',()=>{
 const data=validateBusinessApplication({...application(),role:'super_admin',agencyId:1,organizationType:'school'});
 assert.equal(data.role,undefined);assert.equal(data.agencyId,undefined);assert.equal(data.organizationType,undefined);
 for(const patch of [{businessType:'school'},{path:'anything'},{stage:'unknown'},{services:['hidden-feature']},{consent:false},{email:'x\nBcc: a@example.test'},{goals:'x'.repeat(1001)},{businessName:''},{websiteTrap:'spam'}]) assert.throws(()=>validateBusinessApplication({...application(),...patch}),e=>e.status===400);
});
test('email status never calls held, redirected, or blocked mail sent',()=>{for(const result of [{blocked:true},{skipped:true},{success:false}])assert.equal(businessInvitationDeliveryStatus(result),'not_sent');assert.equal(businessInvitationDeliveryStatus({pendingApproval:true}),'pending_approval');assert.equal(businessInvitationDeliveryStatus({redirected:true,id:'test'}),'redirected');assert.equal(businessInvitationDeliveryStatus({id:'message'}),'sent');assert.equal(businessInvitationDeliveryStatus({}),'failed');});
test('workspace URLs reject reserved paths, traversal, and invalid slugs',()=>{
 assert.equal(validateBusinessSlug('sample-company'),'sample-company');
 for(const slug of ['admin','ptco','a','../school','//evil.example','space name','123company'])assert.throws(()=>validateBusinessSlug(slug),e=>e.status===400);
});
// Optional integration suite. It creates and drops its own database, never reads .env,
// and accepts only a localhost port explicitly supplied for a disposable test server.
test('MySQL: encrypted intake, invitation lifecycle, isolation, races, and atomic rollback',{skip:!process.env.PTCO_TEST_MYSQL_PORT},async t=>{
 const dbName=`ptco_test_${crypto.randomBytes(6).toString('hex')}`;
 const config={host:'127.0.0.1',port:Number(process.env.PTCO_TEST_MYSQL_PORT),user:'root',password:process.env.PTCO_TEST_MYSQL_PASSWORD,multipleStatements:true};
 const root=await mysql.createConnection(config);let pool;
 const prior=process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64;
 process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,19).toString('base64');
 try{
  await root.query(`CREATE DATABASE ${dbName}`);pool=mysql.createPool({...config,database:dbName,connectionLimit:6});
  await pool.query(`CREATE TABLE users(id INT AUTO_INCREMENT PRIMARY KEY,email VARCHAR(255) UNIQUE NOT NULL,username VARCHAR(255) UNIQUE,password_hash VARCHAR(255) NOT NULL,role VARCHAR(30),status VARCHAR(30),first_name VARCHAR(100),last_name VARCHAR(100),is_active BOOLEAN DEFAULT TRUE);
  CREATE TABLE agencies(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(255),slug VARCHAR(100) UNIQUE,portal_url VARCHAR(100),organization_type VARCHAR(30),is_active BOOLEAN,color_palette JSON,account_owner_user_id INT);
  CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOLEAN,PRIMARY KEY(user_id,agency_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(agency_id) REFERENCES agencies(id));
  INSERT INTO users(email,username,password_hash,role,status) VALUES('reviewer@example.test','reviewer@example.test','synthetic','super_admin','active');`);
  await pool.query(await readFile(new URL('../../../../database/migrations/598_public_marketing_pages.sql',import.meta.url),'utf8'));
  const migration=await readFile(new URL('../../../../database/migrations/1421_ptco_business_onboarding.sql',import.meta.url),'utf8');await pool.query(migration);await pool.query(migration);
  const svc=createBusinessOnboardingService({pool,resolveActiveStatus:async()=> 'active'});
  await t.test('submissions are encrypted and retries are idempotent',async()=>{
   const id=crypto.randomUUID(),b=application();await svc.submit(b,id);await svc.submit(b,id);
   const [[row]]=await pool.execute('SELECT * FROM business_onboarding_requests WHERE id=?',[id]);
   assert.equal(row.private_payload.toString().includes(b.businessName),false);assert.equal((await svc.list()).find(r=>r.id===id).email,b.email);
   await assert.rejects(svc.submit({...b,goals:'Changed'},id),e=>e.status===409);
   assert.equal((await pool.query("SELECT COUNT(*) n FROM public_marketing_pages WHERE slug='ptco'"))[0][0].n,1);
  });
  await t.test('approval and activation create only the approved root company and its owner',async()=>{
   const id=crypto.randomUUID(),b=application();await svc.submit(b,id);const {token}=await svc.approve(id,'approved-company',1);
   assert.equal((await svc.inspect(token)).email,b.email);
   const [[before]]=await pool.execute('SELECT invite_hash FROM business_onboarding_requests WHERE id=?',[id]);assert.notEqual(before.invite_hash,token);
   await assert.rejects(svc.activate(token,'short',true),e=>e.status===400);
   await assert.rejects(svc.activate(token,'synthetic-strong-password',false),e=>e.status===400);
   const results=await Promise.allSettled([svc.activate(token,'synthetic-strong-password',true),svc.activate(token,'synthetic-strong-password',true)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const result=results.find(r=>r.status==='fulfilled').value;
   const [[agency]]=await pool.execute('SELECT * FROM agencies WHERE id=?',[result.agencyId]);assert.equal(agency.organization_type,'agency');assert.equal(agency.slug,'approved-company');
   const [members]=await pool.execute('SELECT * FROM user_agencies WHERE user_id=?',[agency.account_owner_user_id]);assert.equal(members.length,1);assert.equal(members[0].agency_id,agency.id);
   const [[owner]]=await pool.execute('SELECT * FROM users WHERE id=?',[agency.account_owner_user_id]);assert.equal(owner.role,'admin');assert.equal(owner.email,b.email);assert.notEqual(owner.password_hash,'synthetic-strong-password');
   await assert.rejects(svc.inspect(token),e=>e.status===410);
  });
  await t.test('replaced, expired, and declined invitations cannot activate',async()=>{
   const id=crypto.randomUUID();await svc.submit(application(),id);const first=await svc.approve(id,'replacement-company',1),second=await svc.approve(id,'replacement-company',1);
   await assert.rejects(svc.inspect(first.token),e=>e.status===410);
   await pool.execute('UPDATE business_onboarding_requests SET invite_expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[id]);await assert.rejects(svc.inspect(second.token),e=>e.status===410);
   const third=await svc.approve(id,'replacement-company',1);await svc.decline(id,1);await assert.rejects(svc.activate(third.token,'synthetic-strong-password',true),e=>e.status===410);
  });
  await t.test('existing owners and company URLs cannot be reassigned',async()=>{
   const id=crypto.randomUUID();await svc.submit({...application(),email:'reviewer@example.test'},id);await assert.rejects(svc.approve(id,'takeover',1),e=>e.status===409);
   const other=crypto.randomUUID();await svc.submit(application(),other);await assert.rejects(svc.approve(other,'approved-company',1),e=>e.status===409);
  });
  await t.test('membership write failure rolls back company, user, invitation consumption, and audit',async()=>{
   const id=crypto.randomUUID(),b=application();await svc.submit(b,id);const {token}=await svc.approve(id,'rollback-company',1);
   await pool.query("CREATE TRIGGER reject_test_membership BEFORE INSERT ON user_agencies FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic failure'");
   try{await assert.rejects(svc.activate(token,'synthetic-strong-password',true));}finally{await pool.query('DROP TRIGGER reject_test_membership');}
   assert.equal((await pool.execute('SELECT id FROM agencies WHERE slug=?',['rollback-company']))[0].length,0);
   assert.equal((await pool.execute('SELECT id FROM users WHERE email=?',[b.email]))[0].length,0);
   assert.equal((await svc.inspect(token)).email,b.email);
   assert.equal((await pool.execute("SELECT id FROM business_onboarding_events WHERE request_id=? AND action='workspace_activated'",[id]))[0].length,0);
  });
 }finally{if(prior===undefined)delete process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64;else process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64=prior;await pool?.end();await root.query(`DROP DATABASE IF EXISTS ${dbName}`);await root.end();}
});
