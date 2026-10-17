import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

// Opt-in, isolated local socket only. Never uses application database credentials.
test('managed billing SQL enforces memberships, explicit grants, revocation and agency archives', {skip: !process.env.MANAGED_BILLING_TEST_SOCKET}, async () => {
  assert.match(process.env.MANAGED_BILLING_TEST_SOCKET, /^\/private\/tmp\/managed-billing-[\w-]+\.sock$/);
  const db = await mysql.createConnection({socketPath:process.env.MANAGED_BILLING_TEST_SOCKET,user:'root'});
  const {managedBillingAgencies,directBillingAgencyIds,isActiveBillingAgency} = await import('../managedBillingAccess.service.js');
  try {
    await db.query('CREATE DATABASE IF NOT EXISTS managed_billing_test');
    await db.query('USE managed_billing_test');
    await db.query('CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),is_active BOOLEAN,is_archived BOOLEAN,organization_type VARCHAR(20) DEFAULT \'agency\',feature_flags JSON,icon_id INT)');
    await db.query('CREATE TABLE icons(id INT PRIMARY KEY,file_path VARCHAR(255))');
    await db.query('CREATE TABLE users(id INT PRIMARY KEY,is_active BOOLEAN,is_archived BOOLEAN,status VARCHAR(40))');
    await db.query('CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOLEAN,has_billing_access BOOLEAN,PRIMARY KEY(user_id,agency_id))');
    await db.query(await fs.readFile(new URL('../../../../database/migrations/1625_managed_medical_billing.sql',import.meta.url),'utf8'));
    await db.query("INSERT INTO agencies(id,name,is_active,is_archived) VALUES (1,'Management',1,0),(2,'Practice',1,0),(3,'Closed',1,1),(4,'Inactive',0,0),(5,'Unrelated',1,0)");
    await db.query("INSERT INTO users VALUES (10,1,0,'ACTIVE'),(11,1,0,'ACTIVE'),(12,1,0,'ACTIVE')");
    await db.query('INSERT INTO user_agencies VALUES(10,1,1,1),(11,1,1,0),(12,2,1,1),(10,3,1,1),(10,4,1,1)');
    await db.query('INSERT INTO agency_billing_management(agency_id,manager_agency_id) VALUES(2,1),(3,1),(4,1)');
    assert.deepEqual((await managedBillingAgencies(10,db)).map(a=>a.id),[2]);
    assert.deepEqual(await managedBillingAgencies(11,db),[]);
    assert.deepEqual(await managedBillingAgencies(12,db),[]);
    assert.deepEqual(await directBillingAgencyIds(10,db),[1]);
    assert.equal(await isActiveBillingAgency(3,db),false);
    assert.equal(await isActiveBillingAgency(4,db),false);
    const rejectAfter = async (change,undo) => { await db.query(change); assert.deepEqual(await managedBillingAgencies(10,db),[]); await db.query(undo); };
    await rejectAfter('UPDATE user_agencies SET has_billing_access=0 WHERE user_id=10 AND agency_id=1','UPDATE user_agencies SET has_billing_access=1 WHERE user_id=10 AND agency_id=1');
    await rejectAfter('UPDATE user_agencies SET is_active=0 WHERE user_id=10 AND agency_id=1','UPDATE user_agencies SET is_active=1 WHERE user_id=10 AND agency_id=1');
    await rejectAfter('UPDATE agencies SET is_archived=1 WHERE id=1','UPDATE agencies SET is_archived=0 WHERE id=1');
    await rejectAfter('UPDATE agencies SET is_active=0 WHERE id=2','UPDATE agencies SET is_active=1 WHERE id=2');
    await rejectAfter('UPDATE users SET is_archived=1 WHERE id=10','UPDATE users SET is_archived=0 WHERE id=10');
    await rejectAfter("UPDATE users SET status='TERMINATED' WHERE id=10","UPDATE users SET status='ACTIVE' WHERE id=10");
    await rejectAfter('UPDATE agency_billing_management SET is_active=0 WHERE agency_id=2','UPDATE agency_billing_management SET is_active=1 WHERE agency_id=2');
    assert.deepEqual((await managedBillingAgencies(10,db)).map(a=>a.id),[2]);
  } finally { await db.query('DROP DATABASE IF EXISTS managed_billing_test'); await db.end(); const {default:pool}=await import('../../config/database.js'); await pool.end(); }
});
