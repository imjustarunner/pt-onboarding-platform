import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

// An isolated local schema only; never application credentials or a remote DB.
test('office openings require an active assigned room in the agency without an overlapping occupant', {skip:!process.env.PUBLIC_SNAPSHOT_TEST_SOCKET}, async()=>{
 assert.match(process.env.PUBLIC_SNAPSHOT_TEST_SOCKET,/^\/private\/tmp\/public-snapshot-[^/]+\/mysql\.sock$/);
 const db=await mysql.createConnection({socketPath:process.env.PUBLIC_SNAPSHOT_TEST_SOCKET,user:'root'});
 const schema=`public_rooms_test_${process.pid}`;
 await db.query(`CREATE DATABASE ${schema}`);
 try {
  await db.query(`USE ${schema}`);
  await db.query('CREATE TABLE office_rooms (id INT,location_id INT,is_active BOOLEAN,room_number VARCHAR(20),label VARCHAR(20),name VARCHAR(20))');
  await db.query('CREATE TABLE office_locations (id INT,is_active BOOLEAN,timezone VARCHAR(40),name VARCHAR(40))');
  await db.query('CREATE TABLE office_location_agencies (office_location_id INT,agency_id INT)');
  await db.query('CREATE TABLE office_events (id INT,start_at DATETIME,end_at DATETIME,status VARCHAR(30),slot_state VARCHAR(30),office_location_id INT,room_id INT,assigned_provider_id INT,booked_provider_id INT)');
  await db.query('CREATE TABLE provider_in_person_slot_availability (agency_id INT,provider_id INT,source_event_id INT,start_at DATETIME,end_at DATETIME,office_location_id INT,is_active BOOLEAN)');
  await db.query("INSERT INTO office_rooms VALUES (1,7,1,'1','One','One')");
  await db.query("INSERT INTO office_locations VALUES (7,1,'UTC','Assigned office')");
  await db.query('INSERT INTO office_location_agencies VALUES (7,2)');
  await db.query("INSERT INTO office_events VALUES (1,'2030-01-07 17:00','2030-01-07 18:00','RELEASED','ASSIGNED_AVAILABLE',7,1,9,NULL)");
  await db.query('INSERT INTO provider_in_person_slot_availability VALUES (2,9,1,NULL,NULL,7,1)');
  const source=await fs.readFile(new URL('../providerAvailability.service.js',import.meta.url),'utf8');
  const sql=source.match(/`(SELECT\s+e\.id,[\s\S]+?ORDER BY e\.start_at ASC)`/)[1];
  const read=async()=>{const [rows]=await db.execute(sql,[2,2,9,2,9,9,'2030-01-14 00:00:00','2030-01-07 00:00:00']);return rows;};
  assert.equal((await read())[0].room_available,1);
  for(const [table,column] of [['office_rooms','is_active'],['office_locations','is_active']]){
   await db.query(`UPDATE ${table} SET ${column}=0`);assert.equal((await read())[0].room_available,0);await db.query(`UPDATE ${table} SET ${column}=1`);
  }
  await db.query('UPDATE office_rooms SET location_id=8');assert.equal((await read())[0].room_available,0);await db.query('UPDATE office_rooms SET location_id=7');
  await db.query('UPDATE office_location_agencies SET agency_id=3');assert.equal((await read()).length,0);await db.query('UPDATE office_location_agencies SET agency_id=2');
  await db.query("INSERT INTO office_events VALUES (2,'2030-01-07 17:30','2030-01-07 18:30','BOOKED','ASSIGNED_BOOKED',7,1,10,10)");
  assert.equal((await read())[0].room_available,0);
  await db.query("UPDATE office_events SET status='RELEASED',slot_state='ASSIGNED_AVAILABLE',booked_provider_id=NULL WHERE id=2");assert.equal((await read())[0].room_available,0);
  await db.query("UPDATE office_events SET slot_state=NULL WHERE id=2");assert.equal((await read())[0].room_available,0);
  await db.query("UPDATE office_events SET status='CANCELLED' WHERE id=2");assert.equal((await read())[0].room_available,1);
  await db.query("UPDATE office_events SET status='BOOKED',start_at='2030-01-07 18:00',end_at='2030-01-07 19:00' WHERE id=2");assert.equal((await read())[0].room_available,1);
  await db.query('UPDATE office_events SET assigned_provider_id=NULL,booked_provider_id=9 WHERE id=1');assert.equal((await read())[0].room_available,0);
 }finally{await db.query(`DROP DATABASE ${schema}`);await db.end();}
});
