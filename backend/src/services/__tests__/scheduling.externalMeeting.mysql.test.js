// Disposable localhost schema only; never loads application credentials.
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
vi.mock('../../config/database.js',()=>({default:{}}));
import Appointment from '../../models/Appointment.model.js';
import {guardianAppointmentJoin} from '../guardianVirtualJoin.js';
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('external appointment migration and persistence',()=>{
 let admin,db,created=false;
 const name=`codex_external_meetings_${process.pid}`;
 beforeAll(async()=>{
  const settings={host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:'',timezone:'+00:00'};
  admin=await mysql.createConnection(settings);await admin.query(`CREATE DATABASE ${name}`);created=true;
  db=await mysql.createConnection({...settings,database:name});
  for(const sql of ['CREATE TABLE agencies(id INT PRIMARY KEY)','CREATE TABLE users(id INT PRIMARY KEY)','CREATE TABLE tenant_services(id INT UNSIGNED PRIMARY KEY)'])await db.query(sql);
  for(const [file,pattern] of [
   ['979_unified_appointments.sql',/^CREATE TABLE IF NOT EXISTS appointments /],
   ['981_booking_cancellation_policies.sql',/^ALTER TABLE appointments /],
   ['987_appointment_office_booking_request.sql',/^ALTER TABLE appointments /],
   ['1403_book_session_overhaul.sql',/^ALTER TABLE appointments /],
   ['1419_recurring_session_context.sql',/^ALTER TABLE appointments /],
   ['1512_auricwell_shared_appointments.sql',/^ALTER TABLE appointments /],
   ['1843_appointment_external_meeting_url.sql',/^ALTER TABLE appointments /],
   ['1844_appointment_google_dial_in_instructions.sql',/^ALTER TABLE appointments /]
  ]){
   const source=await readFile(new URL('../../../../database/migrations/'+file,import.meta.url),'utf8');
   for(const sql of splitSqlStatements(stripSqlLineComments(source)))if(pattern.test(sql.replace(/\s+/g,' ').trim()))await db.query(sql);
  }
  await db.query('INSERT INTO agencies VALUES(6)');await db.query('INSERT INTO users VALUES(20)');
  await db.query('CREATE TABLE counseling_sessions(id INT AUTO_INCREMENT PRIMARY KEY,appointment_id INT,agency_id INT,provider_user_id INT,status VARCHAR(32),guest_invite_token VARCHAR(100),guest_invite_expires_at DATETIME)');
 });
 afterAll(async()=>{if(db)await db.end();if(created)await admin.query(`DROP DATABASE ${name}`);if(admin)await admin.end();});
 it('keeps the appointment and optional link together across creation and later edits',async()=>{
  const row=await Appointment.createInAvailableWindow({agencyId:6,providerUserId:20,startAt:'2030-01-01 17:00:00',endAt:'2030-01-01 18:00:00',status:'scheduled',modality:'TELEHEALTH',videoRoomMode:'external'},{executor:db});
  expect(row).toMatchObject({videoRoomMode:'external',externalMeetingUrl:null});
  const updated=await Appointment.updateInAvailableWindow(row.id,{externalMeetingUrl:'https://video.example.test/session',includeGoogleDialIn:true},null,{executor:db});
  expect(updated).toMatchObject({id:row.id,videoRoomMode:'external',externalMeetingUrl:'https://video.example.test/session',includeGoogleDialIn:true});
  const cleared=await Appointment.updateInAvailableWindow(row.id,{videoRoomMode:'unique_session'},null,{executor:db});
  expect(cleared).toMatchObject({id:row.id,videoRoomMode:'unique_session',externalMeetingUrl:null});
 });
 it('joins only the active room attached to the same appointment, agency and provider',async()=>{
  await db.query("INSERT INTO counseling_sessions(appointment_id,agency_id,provider_user_id,status,guest_invite_token,guest_invite_expires_at) VALUES(91,6,20,'joining','synthetic-invite','2050-01-01 00:00:00')");
  const appointment={id:91,agencyId:6,providerUserId:20,status:'scheduled',modality:'TELEHEALTH',businessType:'mental_health'};
  expect(await guardianAppointmentJoin(appointment,{},db)).toBe('/counseling/invite/synthetic-invite');
  expect(await guardianAppointmentJoin({...appointment,providerUserId:21},{},db)).toBeNull();
  expect(await guardianAppointmentJoin(appointment,{permissions_json:{billingOnly:true}},db)).toBeNull();
  await db.query("UPDATE counseling_sessions SET status='ended'");expect(await guardianAppointmentJoin(appointment,{},db)).toBeNull();
 });
 it('adds client portal accounts without replacing deployed roles or changing existing users',async()=>{
  await db.query("ALTER TABLE users ADD COLUMN role ENUM('provider','client_guardian','assistant','custom_role') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'provider'");
  await db.query("INSERT INTO users(id,role) VALUES(30,'client_guardian'),(31,'assistant'),(32,'custom_role')");
  const source=await readFile(new URL('../../../../database/migrations/1845_preserve_roles_add_client_portal.sql',import.meta.url),'utf8');
  for(let pass=0;pass<2;pass++)for(const sql of splitSqlStatements(stripSqlLineComments(source)))await db.query(sql);
  await db.query("INSERT INTO users(id,role) VALUES(33,'client')");
  const [rows]=await db.query('SELECT id,role FROM users ORDER BY id');expect(rows).toEqual([{id:20,role:'provider'},{id:30,role:'client_guardian'},{id:31,role:'assistant'},{id:32,role:'custom_role'},{id:33,role:'client'}]);
  const [[column]]=await db.query("SELECT COLUMN_DEFAULT,IS_NULLABLE,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role'");expect(column).toMatchObject({COLUMN_DEFAULT:'provider',IS_NULLABLE:'YES',COLLATION_NAME:'utf8mb4_unicode_ci'});
 });
});
