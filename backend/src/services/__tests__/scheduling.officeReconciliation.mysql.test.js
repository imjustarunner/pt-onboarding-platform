// Disposable CI database only. Never reads .env or connects to the user's proxy.
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import mysql from 'mysql2/promise';
import {syncPersonalMailboxDisplayName} from '../personalMailboxDisplayName.service.js';
import {insertOfficeRequestWindows,distinctOfficeRequestWindows,splitPendingOfficeRequest} from '../officeRequestWindows.service.js';
import {listPendingOfficeBookingRequests} from '../pendingOfficeBookingRequests.service.js';
let db; const database='codex_office_reconciliation';
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('office request and name reconciliation in MySQL',()=>{
 beforeAll(async()=>{
  db=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:'',timezone:'+00:00'});
  await db.query(`CREATE DATABASE ${database}`);await db.query(`USE ${database}`);
  const tables={provider_office_availability_requests:'id INT AUTO_INCREMENT PRIMARY KEY, agency_id INT, provider_id INT, preferred_office_ids_json JSON, preferred_rooms_json JSON, notes TEXT, status VARCHAR(30), requested_frequency VARCHAR(30), requested_occurrence_count INT, requested_start_date DATE',
   provider_office_availability_request_slots:'id INT AUTO_INCREMENT PRIMARY KEY, request_id INT, weekday INT, start_hour INT, end_hour INT, room_id INT',
   users:'id INT PRIMARY KEY,first_name TEXT,last_name TEXT,is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0,status VARCHAR(30)',
   communication_inboxes:'id INT PRIMARY KEY,owner_user_id INT,agency_id INT,sender_identity_id INT,kind VARCHAR(20),display_name TEXT,from_email TEXT',
   email_sender_identities:'id INT PRIMARY KEY,agency_id INT,identity_key VARCHAR(40),display_name TEXT,from_email TEXT',
   office_locations:'id INT PRIMARY KEY,name TEXT,timezone VARCHAR(50)',office_rooms:'id INT PRIMARY KEY,room_number INT,label TEXT,name TEXT',
   office_location_agencies:'office_location_id INT,agency_id INT',
   office_booking_requests:'id INT PRIMARY KEY,requested_provider_id INT,office_location_id INT,room_id INT,start_at DATETIME,end_at DATETIME,recurrence VARCHAR(30),booked_occurrence_count INT,created_at DATETIME,status VARCHAR(30),request_type VARCHAR(40)'};
  for(const [table,ddl] of Object.entries(tables))await db.query(`CREATE TABLE ${table} (${ddl})`);
  await db.query("INSERT INTO users (id,first_name,last_name,status) VALUES (8,'Test','Provider','ACTIVE'),(9,'Other','Provider','ACTIVE')");
 });
 afterAll(async()=>{if(db){await db.query(`DROP DATABASE ${database}`);await db.end();}});
 it('updates personal inbox and sender labels while preserving addresses and shared identities',async()=>{
  await db.query("INSERT INTO email_sender_identities VALUES (1,2,'personal_8','Old Name','original@example.test'),(2,2,'messages','Shared Team','team@example.test')");
  await db.query("INSERT INTO communication_inboxes VALUES (1,8,2,1,'personal','Old Name (My Inbox)','original@example.test'),(2,8,2,2,'shared','Shared Team','team@example.test')");
  await syncPersonalMailboxDisplayName(db,8);
  const [inboxes]=await db.query('SELECT display_name,from_email FROM communication_inboxes ORDER BY id');
  const [senders]=await db.query('SELECT display_name,from_email FROM email_sender_identities ORDER BY id');
  expect(inboxes).toEqual([{display_name:'Test Provider (My Inbox)',from_email:'original@example.test'},{display_name:'Shared Team',from_email:'team@example.test'}]);
  expect(senders).toEqual([{display_name:'Test Provider',from_email:'original@example.test'},{display_name:'Shared Team',from_email:'team@example.test'}]);
  await syncPersonalMailboxDisplayName(db,8);expect((await db.query('SELECT display_name FROM communication_inboxes WHERE id=1'))[0][0].display_name).toBe('Test Provider (My Inbox)');
 });
 it('returns both pending weekdays only within the requested provider and agency',async()=>{
  await db.query("INSERT INTO office_locations VALUES (1,'Office','America/Denver'),(2,'Other office','America/Denver')");
  await db.query('INSERT INTO office_location_agencies VALUES (1,2),(2,3)');
  for(const [id,provider,office,status] of [[40,8,1,'PENDING'],[41,8,1,'PENDING'],[42,9,1,'PENDING'],[43,8,2,'PENDING'],[44,8,1,'APPROVED']])
   await db.execute("INSERT INTO office_booking_requests (id,requested_provider_id,office_location_id,start_at,end_at,recurrence,booked_occurrence_count,status,request_type) VALUES (?,?,?,?,'2026-10-15 00:00:00','WEEKLY',6,?,'PROVIDER_REQUEST')",[id,provider,office,id===40?'2026-10-13 23:00:00':'2026-10-14 23:00:00',status]);
  const rows=await listPendingOfficeBookingRequests(db,{agencyIds:[2],providerId:8});expect(rows.map(r=>r.id)).toEqual([40,41]);expect(rows[0].startAt).toBe('2026-10-13T23:00:00.000Z');
 });
 it('saves each weekday for separate review and splits historical requests without dropping hours',async()=>{
  const request={agencyId:2,providerId:8,recurrence:'WEEKLY',occurrenceCount:6,officesJson:[1],roomsJson:[{roomId:3}],notes:'Original request'};
  const windows=distinctOfficeRequestWindows([{weekday:2,startHour:8,endHour:20,roomId:3},{weekday:3,startHour:17,endHour:19,roomId:9}],'2026-10-12');
  await db.beginTransaction();
  const ids=await insertOfficeRequestWindows(db,request,windows);await db.commit();
  expect(ids).toHaveLength(2);
  expect((await db.query('SELECT weekday,start_hour,end_hour FROM provider_office_availability_request_slots ORDER BY id'))[0])
   .toEqual([{weekday:2,start_hour:8,end_hour:20},{weekday:3,start_hour:17,end_hour:19}]);
  // Simulate an older request with both days under one header.
  await db.execute('INSERT INTO provider_office_availability_request_slots (request_id,weekday,start_hour,end_hour,room_id) VALUES (?,3,17,19,9)',[ids[0]]);
  const pool={getConnection:async()=>({execute:db.execute.bind(db),beginTransaction:db.beginTransaction.bind(db),commit:db.commit.bind(db),rollback:db.rollback.bind(db),release:()=>{}})};
  const splitIds=await splitPendingOfficeRequest(pool,{requestId:ids[0],agencyId:2});expect(splitIds).toHaveLength(2);
  const [rows]=await db.execute(`SELECT r.status,s.weekday,s.start_hour,s.end_hour,DATE_FORMAT(r.requested_start_date,'%Y-%m-%d') AS startDate
   FROM provider_office_availability_requests r JOIN provider_office_availability_request_slots s ON s.request_id=r.id WHERE r.id IN (?,?) ORDER BY r.id`,splitIds);
  expect(rows).toEqual([
   {status:'PENDING',weekday:2,start_hour:8,end_hour:20,startDate:'2026-10-13'},
   {status:'PENDING',weekday:3,start_hour:17,end_hour:19,startDate:'2026-10-14'}]);
  expect(await splitPendingOfficeRequest(pool,{requestId:ids[0],agencyId:2})).toEqual([]);
  expect(await splitPendingOfficeRequest(pool,{requestId:ids[0],agencyId:99})).toEqual([]);
 });

});
