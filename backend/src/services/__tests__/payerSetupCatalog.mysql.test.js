import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {importPayerSetupCatalog,listPayerSetupRequests,saveDirectoryPayer} from '../payerSetupCatalog.service.js';
test('payer imports are scoped, repeatable and do not create enrollment or claim records',{skip:process.env.PAYER_CATALOG_MYSQL_TEST!=='1'},async()=>{
 const db=await mysql.createConnection({host:'127.0.0.1',port:33316,user:'root',database:'mysql'});
 const schema=`payer_catalog_test_${randomUUID().replaceAll('-','')}`;
 try {
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  await db.query('CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(100))');
  await db.query('CREATE TABLE office_locations(id INT,agency_id INT,practice_npi VARCHAR(10),is_active INT,use_as_billing_address INT)');
  await db.query("INSERT INTO agencies VALUES(2,'ITSCO','itsco'),(6,'Next Level Up','nlu'),(377,'Inner Strength','tisi')");
  await db.query("INSERT INTO office_locations VALUES(1,2,'1972246940',1,1),(5,6,'1942945316',1,1),(8,377,'1306688650',1,1)");
  await db.query(`CREATE TABLE medical_payer_setup_requests(id BIGINT AUTO_INCREMENT PRIMARY KEY,agency_id INT,payer_name VARCHAR(120),created_by_user_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY(agency_id,payer_name))`);
  await db.query(await readFile(new URL('../../../../database/migrations/1499_medical_payer_setup_details.sql',import.meta.url),'utf8'));
  const catalog=JSON.parse(await readFile(new URL('../../../../docs/billing/payer-import-2026-09-26.json',import.meta.url),'utf8'));
  const input={...catalog,directory:[{payerid:'00050',payer_name:'CO BCBS','1500_claims':'yes'}]};
  await importPayerSetupCatalog(input,db);
  assert.equal((await listPayerSetupRequests(377,db)).length,0);
  await importPayerSetupCatalog({...input,apply:true},db);await importPayerSetupCatalog({...input,apply:true},db);
  for(const agency of catalog.agencies)assert.equal((await listPayerSetupRequests(agency.id,db)).length,36);
  assert.equal((await listPayerSetupRequests(99,db)).length,0);
  const [[[count]]]=await Promise.all([db.query('SELECT COUNT(*) AS n FROM medical_payer_setup_details')]);assert.equal(count.n,108);
  await assert.rejects(importPayerSetupCatalog({...input,apply:true,agencies:[{...catalog.agencies[0],slug:'other'}]},db),/identity mismatch/);
  const verified={payerid:'00050',payer_name:'Blue Cross Blue Shield of Colorado','1500_claims':'yes',era:'enrollment'};
  const original=(await listPayerSetupRequests(377,db)).find(r=>r.claimmd_payer_id==='00050').id;
  assert.equal(await saveDirectoryPayer({agencyId:377,payer:verified,actorUserId:9},db),original);
  assert.equal(await saveDirectoryPayer({agencyId:377,payer:verified,actorUserId:9},db),original);
  assert.equal((await listPayerSetupRequests(377,db)).length,36);
  const added=await saveDirectoryPayer({agencyId:377,payer:{...verified,payerid:'TEST01',payer_name:'Synthetic Payer'},actorUserId:9},db);
  await assert.rejects(saveDirectoryPayer({agencyId:377,payer:{...verified,payerid:'DIFFERENT',payer_name:'Synthetic Payer'},actorUserId:9},db),/different electronic route/);
  assert.ok(added); assert.equal((await listPayerSetupRequests(377,db)).length,37);
  assert.equal((await listPayerSetupRequests(2,db)).length,36);
  assert.equal((await listPayerSetupRequests(377,db)).find(r=>r.id===original).directory_status,'id_match');
  const [tables]=await db.query('SHOW TABLES');assert.equal(tables.length,4);
 }finally{await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
});
