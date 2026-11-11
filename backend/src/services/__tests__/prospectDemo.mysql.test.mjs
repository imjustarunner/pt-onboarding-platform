import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { createProspectDemoService, prospectPlan } from '../prospectDemo.service.js';

let directory, server, database, service, provisioned;
const research = { meta: {primary_url:'https://practice.example'}, organization: {brand_name:{value:'Example Practice'},legal_name:{value:'Example Practice LLC'}},
  locations:[{name:'North office',address:{street:'123 Example Way',city:'Example',state:'CO',postal_code:'80000'}}],
  providers:[{name:'Avery Owner',title_role:'Owner',website_listed_credentials:['LPC'],office:'North office',short_bio_summary:'Public factual owner profile.',source_url:'https://practice.example/team'},
    {name:'Casey Clinician',title_role:'LPCC',website_listed_credentials:['LPCC'],office:'Telehealth',short_bio_summary:'Public factual clinician profile.',source_url:'https://practice.example/team'}] };
const options = {slug:'example',actorUserId:1,ownerEmail:'owner@example.org',fixtureCount:4};
before(async () => {
  directory = await fs.mkdtemp('/private/tmp/pt-prospect-mysql-');
  const binary = process.env.PROSPECT_MYSQLD || '/opt/homebrew/opt/mysql/bin/mysqld';
  execFileSync(binary,['--no-defaults','--initialize-insecure',`--datadir=${directory}/data`,`--log-error=${directory}/mysql.log`],{stdio:'pipe',timeout:120000});
  server=spawn(binary,['--no-defaults',`--datadir=${directory}/data`,`--socket=${directory}/mysql.sock`,`--pid-file=${directory}/mysql.pid`,`--log-error=${directory}/mysql.log`,'--skip-networking','--mysqlx=0','--skip-log-bin','--innodb-buffer-pool-size=67108864','--innodb-redo-log-capacity=67108864'],{stdio:'ignore'});
  let connection;
  for(let i=0;i<150;i++){
    try{connection=await mysql.createConnection({socketPath:`${directory}/mysql.sock`,user:'root',multipleStatements:true});break;}
    catch(error){if(server.exitCode!==null)throw new Error(await fs.readFile(`${directory}/mysql.log`,'utf8'));await new Promise(r=>setTimeout(r,100));}
  }
  if(!connection)throw new Error('Disposable MySQL did not become ready.');
  await connection.query('CREATE DATABASE prospect_test; USE prospect_test');
  await connection.query(await fs.readFile(new URL('../testing/prospectDemoSchema.sql',import.meta.url),'utf8'));
  await connection.query(await fs.readFile(new URL('../../../../database/migrations/1790_prospect_demo_instances.sql',import.meta.url),'utf8'));
  await connection.query("INSERT INTO users(id,email,first_name,last_name,role,status,is_active,is_archived) VALUES(1,'admin@example.test','Test','Administrator','super_admin','ACTIVE_EMPLOYEE',1,0),(2,'foreign@example.org','Foreign','Administrator','admin','ACTIVE_EMPLOYEE',1,0)");
  await connection.query("INSERT INTO agencies(id,name,slug,is_active,feature_flags) VALUES(450,'QA','qa',1,'{\"qaSandbox\":{\"syntheticOnly\":true}}'),(451,'Foreign','foreign',1,'{}')");
  await connection.query("INSERT INTO user_agencies(user_id,agency_id,is_active,agency_role) VALUES(2,451,1,'admin')");
  await connection.query("INSERT INTO clients(id,agency_id,organization_id,full_name,initials,status,submission_date,source,is_demo) VALUES(501,450,450,'Synthetic Example','SE','ACTIVE','2026-11-01','ADMIN_CREATED',1)");
  await connection.end();
  database=mysql.createPool({socketPath:`${directory}/mysql.sock`,user:'root',database:'prospect_test',connectionLimit:3});
  service=createProspectDemoService({database,hashPassword:async()=>'$2b$12$synthetic-test-hash-never-used-for-authentication'});
},{timeout:180000});
after(async()=>{
  await database?.end();
  if(server&&server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}
  if(directory)await fs.rm(directory,{recursive:true});
});
test('research parsing rejects invalid slugs and preserves names and ambiguity',()=>{
  assert.throws(()=>prospectPlan(research,{...options,slug:'../foreign'}));
  const plan=prospectPlan({...research,providers:[...research.providers,{name:"Emily Sack's",title_role:'Intern',website_listed_credentials:['Intern']}]},options);
  assert.equal(plan.providers[2].lastName,"Sack's");assert.equal(plan.providers[1].credential,'LPCC');
});
test('provisions a tenant with DEMO accounts, isolated client copies and complete ownership',async()=>{
  provisioned=await service.provision(research,options);
  const summary=await service.summary(provisioned.agencyId,{id:1});
  assert.equal(summary.status,'DEMO');assert.equal(summary.providers.length,2);assert.ok(summary.providers.every(p=>p.status==='DEMO'));
  const [clients]=await database.execute('SELECT * FROM clients WHERE agency_id=?',[provisioned.agencyId]);
  assert.equal(clients.length,4);assert.ok(clients.every(c=>c.id!==501&&c.organization_id===provisioned.agencyId&&c.is_demo===1));
  assert.equal(new Set(clients.map(c=>c.provider_id)).size,2);
  const [[source]]=await database.execute('SELECT agency_id,organization_id,provider_id,is_demo FROM clients WHERE id=501');
  assert.deepEqual(source,{agency_id:450,organization_id:450,provider_id:null,is_demo:1});
  const page=await service.publicPage('exampleproviders','providers');
  assert.equal(page.providers.length,2);assert.ok(page.providers.every(p=>p.availability.length===3));assert.ok(!JSON.stringify(page).includes('owner@example.org'));
  assert.equal(page.offices[0].street_address,'123 Example Way');assert.ok(page.jobs.every(j=>j.isExample));
  const [[column]] = await database.execute("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status'");
  assert.ok(column.COLUMN_TYPE.includes("'EHR_ONLY'"));assert.ok(column.COLUMN_TYPE.includes("'DEMO'"));
});
test('repeat provisioning is idempotent and cannot overwrite a different tenant',async()=>{
  const again=await service.provision(research,options);assert.equal(again.existing,true);assert.equal(again.agencyId,provisioned.agencyId);
  await assert.rejects(service.provision(research,{...options,slug:'foreign'}),/already exists/);
});
test('enforces administrator membership and cleanup scope',async()=>{
  await assert.rejects(service.summary(provisioned.agencyId,{id:2}),/administrator access/);
  await assert.rejects(service.clearFixtures(provisioned.agencyId,{id:1},{confirmSlug:'foreign'}),/confirm cleanup/);
  await assert.rejects(service.clearFixtures(provisioned.agencyId,{id:1},{confirmSlug:'example',activate:true}),/real email addresses/);
  const [[count]]=await database.execute('SELECT COUNT(*) AS count FROM clients WHERE agency_id=?',[provisioned.agencyId]);assert.equal(count.count,4);
});
test('temporary identity assignment retains provider ID and invalidates old credentials',async()=>{
  const id=provisioned.providerIds[1];
  await database.execute('INSERT INTO user_login_emails(user_id,agency_id,email) VALUES(?,?,?)',[id,provisioned.agencyId,'old@example.demo.invalid']);
  await database.execute("UPDATE users SET passwordless_token='old-token',invitation_token='old-invitation' WHERE id=?",[id]);
  await assert.rejects(service.updateEmployee(provisioned.agencyId,id,'foreign@example.org',{id:1}),/already belongs/);
  const result=await service.updateEmployee(provisioned.agencyId,id,'casey@example.org',{id:1});assert.equal(result.id,id);
  const [[user]]=await database.execute('SELECT email,username,work_email,status,passwordless_token,invitation_token FROM users WHERE id=?',[id]);
  assert.deepEqual(user,{email:'casey@example.org',username:'casey@example.org',work_email:'casey@example.org',status:'DEMO',passwordless_token:null,invitation_token:null});
  const [[aliases]]=await database.execute('SELECT COUNT(*) AS count FROM user_login_emails WHERE user_id=?',[id]);assert.equal(aliases.count,0);
  const [[cutoff]]=await database.execute('SELECT reject_issued_before FROM user_auth_revocations WHERE user_id=?',[id]);assert.ok(cutoff.reject_issued_before>0);
  const [[password]]=await database.execute('SELECT password_hash FROM users WHERE id=?',[id]);assert.equal(password.password_hash,null);
});
test('cleanup and activation reject later shared client or provider affiliations',async()=>{
  const clientId=provisioned.clientIds[0],providerId=provisioned.providerIds[1];
  await database.execute('INSERT INTO client_agency_assignments(client_id,agency_id,is_active) VALUES(?,451,1)',[clientId]);
  await assert.rejects(service.clearFixtures(provisioned.agencyId,{id:1},{confirmSlug:'example'}),/affiliations outside/);
  await database.execute('DELETE FROM client_agency_assignments WHERE client_id=? AND agency_id=451',[clientId]);
  await database.execute("INSERT INTO user_agencies(user_id,agency_id,is_active,agency_role) VALUES(?,451,1,'provider')",[providerId]);
  await assert.rejects(service.clearFixtures(provisioned.agencyId,{id:1},{confirmSlug:'example',activate:true}),/shared with another/);
  await database.execute('DELETE FROM user_agencies WHERE user_id=? AND agency_id=451',[providerId]);
});
test('cleanup rolls back when ledger records have moved outside the tenant',async()=>{
  const [[job]]=await database.execute('SELECT id FROM hiring_job_descriptions WHERE agency_id=? LIMIT 1',[provisioned.agencyId]);
  await database.execute('UPDATE hiring_job_descriptions SET agency_id=451 WHERE id=?',[job.id]);
  await assert.rejects(service.clearFixtures(provisioned.agencyId,{id:1},{confirmSlug:'example'}),/another organization/);
  const [[remaining]]=await database.execute('SELECT COUNT(*) AS count FROM clients WHERE agency_id=?',[provisioned.agencyId]);assert.equal(remaining.count,4);
  await database.execute('UPDATE hiring_job_descriptions SET agency_id=? WHERE id=?',[provisioned.agencyId,job.id]);
});
test('cleanup includes later appointments and draft notes attached to owned sample clients',async()=>{
  const [appointment]=await database.execute("INSERT INTO appointments(agency_id,provider_user_id,start_at,end_at,title) VALUES(?,?,'2026-11-15 16:00:00','2026-11-15 16:53:00','Later sample appointment')",[provisioned.agencyId,provisioned.providerIds[0]]);
  await database.execute("INSERT INTO appointment_participants(appointment_id,client_id,role) VALUES(?,?,'client')",[appointment.insertId,provisioned.clientIds[0]]);
  await database.execute("INSERT INTO clinical_note_drafts(agency_id,client_id,input_text) VALUES(?,?,'Fictional later draft')",[provisioned.agencyId,provisioned.clientIds[0]]);
});
test('go-live removes only owned fixtures, keeps profiles and never changes QA clients',async()=>{
  const result=await service.clearFixtures(provisioned.agencyId,{id:1},{confirmSlug:'example',activate:true});
  assert.equal(result.status,'LIVE');assert.equal(result.removed.client,4);assert.equal(result.removed.draft,1);assert.equal(result.removed.appointment,5);
  const page=await service.publicPage('exampleproviders','providers');assert.equal(page.status,'LIVE');assert.equal(page.notice,null);assert.equal(page.jobs.length,0);
  assert.equal(page.providers.length,2);assert.ok(page.providers.every(p=>p.availability.length===0));
  const summary=await service.summary(provisioned.agencyId,{id:1});assert.ok(summary.providers.every(p=>p.status==='ACTIVE_EMPLOYEE'));
  assert.ok(summary.records.every(r=>r.record_kind==='configuration'));
  const [[source]]=await database.execute('SELECT agency_id,is_demo FROM clients WHERE id=501');assert.deepEqual(source,{agency_id:450,is_demo:1});
  await assert.rejects(service.clearFixtures(provisioned.agencyId,{id:1},{confirmSlug:'example'}),/already switched to live/);
});
