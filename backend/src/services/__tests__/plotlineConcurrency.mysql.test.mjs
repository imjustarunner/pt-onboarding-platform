import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {splitSqlStatements} from '../../../../database/migrationSqlUtils.js';
import {createPlotlineSelfService} from '../plotlineSelfService.service.js';

test('Plotline migration and shared creation limits under concurrent MySQL transactions',{skip:!process.env.PLOTLINE_TEST_SOCKET},async t=>{
 assert.match(process.env.PLOTLINE_TEST_SOCKET,/^\/private\/tmp\/plotline-selfservice-[\w-]+\.sock$/);
 const options={socketPath:process.env.PLOTLINE_TEST_SOCKET,user:'root',timezone:'Z'};
 const setup=await mysql.createConnection(options);let db;
 try{
  await setup.query('CREATE DATABASE plotline_selfservice_test');await setup.query('USE plotline_selfservice_test');
  await setup.query(`CREATE TABLE users(id INT AUTO_INCREMENT PRIMARY KEY,email VARCHAR(254) UNIQUE,username VARCHAR(254),personal_email VARCHAR(254),password_hash VARCHAR(255),first_name VARCHAR(100),last_name VARCHAR(100),role VARCHAR(64),status VARCHAR(64),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,email_verified_at DATETIME,has_provider_access TINYINT DEFAULT 0,has_staff_access TINYINT DEFAULT 0,has_hiring_access TINYINT DEFAULT 0)`);
  await setup.query(`CREATE TABLE agencies(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(255),slug VARCHAR(100) UNIQUE,portal_url VARCHAR(100),organization_type VARCHAR(40),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,feature_flags JSON,color_palette JSON,theme_settings JSON,careers_page_json JSON,logo_url VARCHAR(500),timezone VARCHAR(80))`);
  await setup.query('CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT,agency_role VARCHAR(64),PRIMARY KEY(user_id,agency_id))');
  await setup.query('CREATE TABLE user_agency_access_profiles(user_id INT,agency_id INT,role_baseline VARCHAR(64),permissions_baseline JSON,role_override VARCHAR(64),permissions_overrides JSON,effective_role VARCHAR(64),effective_permissions JSON,PRIMARY KEY(user_id,agency_id))');
  await setup.query('CREATE TABLE agency_business_types(agency_id INT,business_type VARCHAR(64),is_enabled TINYINT)');
  await setup.query('CREATE TABLE email_sender_identities(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,identity_key VARCHAR(64),display_name VARCHAR(255),from_email VARCHAR(254),reply_to VARCHAR(254),is_active TINYINT)');
  await setup.query('CREATE TABLE user_agency_access_rollout(id INT PRIMARY KEY,enabled TINYINT)');await setup.query('INSERT INTO user_agency_access_rollout VALUES(1,1)');
  const migration=await fs.readFile(new URL('../../../../database/migrations/1847_plotline_self_service.sql',import.meta.url),'utf8');
  for(let repeat=0;repeat<2;repeat++)for(const sql of splitSqlStatements(migration))await setup.query(sql);
  db=mysql.createPool({...options,database:'plotline_selfservice_test',connectionLimit:8});
  const service=createPlotlineSelfService({db,enabled:()=>true,now:()=>new Date('2026-11-18T17:00:00Z'),send:async()=>({sent:true}),resolveSender:async()=>({id:100,from_email:'notifications@plottwistco.com'})});
  const addUser=async id=>db.execute("INSERT INTO users(id,email,role,status,email_verified_at) VALUES(?,?,'staff','ACTIVE_EMPLOYEE','2026-11-18 12:00:00')",[id,`owner${id}@example.test`]);
  const draft=async(id,name)=>{const d=await service.startDraft(id,{newCompany:true});return service.saveDraft(id,d.id,{...d,name,revision:d.revision});};
  const create=(id,d)=>service.createCompany(id,{draftId:d.id,revision:d.revision,authorized:true,acceptTerms:true});
  await t.test('simultaneous retries yield one company and one trial',async()=>{await addUser(1);const d=await draft(1,'Concurrent business');const results=await Promise.all(Array.from({length:30},()=>create(1,d)));assert.equal(new Set(results.map(r=>r.agencyId)).size,1);assert.equal((await db.execute('SELECT COUNT(*) n FROM agencies'))[0][0].n,1);});
  await t.test('three simultaneous drafts cannot bypass the single-company limit',async()=>{await addUser(2);const drafts=await Promise.all([draft(2,'A'),draft(2,'B'),draft(2,'C')]);const results=await Promise.allSettled(drafts.map(d=>create(2,d)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='COMPANY_LIMIT').length,2);});
  await t.test('all instances share the platform daily cap and failed attempts leave no partial company',async()=>{const drafts=[];for(let id=10;id<35;id++){await addUser(id);drafts.push({id,draft:await draft(id,`Company ${id}`)});}const results=await Promise.allSettled(drafts.map(d=>create(d.id,d.draft)));assert.equal(results.filter(r=>r.status==='fulfilled').length,18);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='PLOTLINE_CAPACITY_LIMIT').length,7);for(const table of ['agencies','plotline_companies','user_agencies','user_agency_access_profiles'])assert.equal((await db.execute(`SELECT COUNT(*) n FROM ${table}`))[0][0].n,20);});
 }finally{if(db)await db.end();await setup.query('DROP DATABASE IF EXISTS plotline_selfservice_test');await setup.end();}
});
