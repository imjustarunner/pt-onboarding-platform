// Disposable CI database only; never reads .env or uses the production proxy.
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
const database = vi.hoisted(() => ({}));
vi.mock('../../config/database.js',()=>({default:database,onTableWrite:()=>{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
import OfficeEvent from '../../models/OfficeEvent.model.js';
import { releaseOfficeReservation } from '../officeReservationRelease.service.js';
import {createAppointmentOfficeDisposition} from '../appointmentOfficeDisposition.service.js';
import {createAppointmentSeriesCancellation} from '../appointmentSeriesCancellation.service.js';
import {createGuardianServiceCancellationService} from '../guardianServiceCancellation.service.js';
import {assertClientServiceSchedulingActive} from '../clientServiceSchedulingGuard.service.js';
let admin,db,created=false;const name=`codex_office_choices_${process.pid}`;
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT||process.env.CI!=='true')('office choices and staff cancellation queue in disposable MySQL',()=>{
 beforeAll(async()=>{
  const port=Number(process.env.SCHEDULING_TEST_MYSQL_PORT);if(port===3307)throw new Error('Never use the production proxy port.');
  const config={host:'127.0.0.1',port,user:'root',password:'',dateStrings:true,timezone:'+00:00'};
  admin=await mysql.createConnection(config);await admin.query(`CREATE DATABASE ${name}`);created=true;db=mysql.createPool({...config,database:name,connectionLimit:6});
  Object.assign(database,{execute:db.execute.bind(db),getConnection:db.getConnection.bind(db)});
  const tables={
   office_locations:'id INT PRIMARY KEY,timezone VARCHAR(60)',
   office_events:`id INT AUTO_INCREMENT PRIMARY KEY,office_location_id INT,room_id INT,start_at DATETIME,end_at DATETIME,status VARCHAR(20),slot_state VARCHAR(30),standing_assignment_id INT,booking_plan_id INT,assigned_provider_id INT,booked_provider_id INT,source VARCHAR(40),recurrence_group_id VARCHAR(80),created_by_user_id INT,client_id INT NULL,clinical_session_id INT NULL,billing_context_id INT NULL,note_context_id INT NULL,
     notes TEXT,appointment_type_code VARCHAR(40),appointment_subtype_code VARCHAR(40),service_code VARCHAR(20),modality VARCHAR(30),approved_by_user_id INT,
     session_context_json JSON,updated_at DATETIME,
     active_room INT GENERATED ALWAYS AS (IF(status<>'CANCELLED',room_id,NULL)) STORED,active_start DATETIME GENERATED ALWAYS AS (IF(status<>'CANCELLED',start_at,NULL)) STORED,UNIQUE KEY active_slot(active_room,active_start)`,
   office_standing_assignments:'id INT PRIMARY KEY, office_location_id INT, provider_id INT',
   users:'id INT PRIMARY KEY, first_name VARCHAR(60), last_name VARCHAR(60)',
   appointments:'id INT PRIMARY KEY,agency_id INT,provider_user_id INT,business_type VARCHAR(30),source VARCHAR(120),start_at DATETIME,end_at DATETIME,status VARCHAR(40),office_event_id INT,office_location_id INT,room_id INT,provider_schedule_event_id INT',
   appointment_participants:'appointment_id INT,client_id INT',provider_schedule_events:'id INT PRIMARY KEY,agency_id INT,provider_id INT,recurrence_series_id VARCHAR(80),recurrence_stopped BOOL',
   office_booking_plans:'id INT PRIMARY KEY,skipped_dates_json JSON,session_context_json JSON,standing_assignment_id INT,is_active BOOL,booked_occurrence_count INT,active_until_date DATE',
   appointment_communications:'id INT AUTO_INCREMENT PRIMARY KEY,appointment_id INT,agency_id INT,direction VARCHAR(20),channel VARCHAR(20),kind VARCHAR(80),body_preview TEXT,metadata_json JSON,created_by_user_id INT',
   appointment_reminders:'appointment_id INT,status VARCHAR(20)',appointment_schedule_notices:'appointment_id INT,status VARCHAR(20),event_type VARCHAR(20)',
   provider_virtual_slot_availability:'source_event_id INT,is_active BOOL,updated_at DATETIME',
   provider_in_person_slot_availability:'source_event_id INT,is_active BOOL,updated_at DATETIME',
   client_service_enrollments:'id INT PRIMARY KEY,client_id INT,agency_id INT,provider_user_id INT,service_kind VARCHAR(30),is_active BOOL',
   notifications:'type VARCHAR(100),severity VARCHAR(20),title VARCHAR(150),message TEXT,user_id INT,agency_id INT,related_entity_type VARCHAR(50),related_entity_id INT,actor_user_id INT,actor_source VARCHAR(40)'
  };
  for(const[table,ddl]of Object.entries(tables))await db.query(`CREATE TABLE ${table} (${ddl})`);
  await db.query(await readFile(new URL('../../../../database/migrations/1818_guardian_service_cancellations.sql',import.meta.url),'utf8'));
  await db.query('ALTER TABLE guardian_service_cancellations ADD COLUMN team_notified_at DATETIME(3)');
  await db.query("INSERT INTO office_locations VALUES (8,'America/Denver')");
  await db.query("INSERT INTO office_booking_plans (id,skipped_dates_json,session_context_json) VALUES (30,JSON_ARRAY(),JSON_OBJECT('agencyId',2,'clientId',31))");
  await db.query("INSERT INTO office_events (id,office_location_id,room_id,start_at,end_at,status,slot_state,standing_assignment_id,booking_plan_id,assigned_provider_id,booked_provider_id,source,created_by_user_id,client_id,clinical_session_id) VALUES (40,8,10,'2027-01-03 18:00','2027-01-03 19:00','BOOKED','ASSIGNED_BOOKED',5,30,7,7,'SUPPORT',7,31,90)");
  await db.query("INSERT INTO appointments VALUES (1,2,7,'mental_health','reserved_office_session:monthly','2027-01-03 18:00','2027-01-03 19:00','scheduled',40,8,10,NULL),(2,2,7,'mental_health','reserved_office_session:monthly','2027-02-07 18:00','2027-02-07 19:00','scheduled',NULL,8,10,NULL),(90,2,7,'mental_health','different-series','2027-02-07 19:00','2027-02-07 20:00','scheduled',NULL,8,10,NULL)");
  await db.query('INSERT INTO appointment_participants VALUES (1,31),(2,31),(90,32)');
 });
 afterAll(async()=>{if(db)await db.end();if(admin){if(created)await admin.query(`DROP DATABASE ${name}`);await admin.end();}});
 const appointment=async id=>{const[[a]]=await db.execute('SELECT * FROM appointments WHERE id=?',[id]);return a&&{id:a.id,agencyId:a.agency_id,providerUserId:a.provider_user_id,businessType:a.business_type,source:a.source,startAt:a.start_at,endAt:a.end_at,status:a.status,officeEventId:a.office_event_id,roomId:a.room_id,officeLocationId:a.office_location_id,providerScheduleEventId:a.provider_schedule_event_id,sourceTimezone:'America/Denver'};};
 it('preserves clinical references while creating a distinct reusable room reservation under the active-slot constraint',async()=>{
  const resource=createAppointmentOfficeDisposition({db,encrypt:value=>JSON.stringify({encrypted:value}),decrypt:value=>JSON.parse(value).encrypted,
   roomLock:async(input,work)=>{const conn=await db.getConnection();try{await conn.beginTransaction();const result=await work(conn);await conn.commit();return result;}catch(error){await conn.rollback();throw error;}finally{conn.release();}}});
  const a=await appointment(1),result=await resource.apply(a,7,'keep');expect(result.officeEventId).not.toBe(40);
  const[[original]]=await db.execute('SELECT status,client_id,clinical_session_id FROM office_events WHERE id=40');expect(original).toMatchObject({status:'CANCELLED',client_id:31,clinical_session_id:90});
  const[[bare]]=await db.execute('SELECT status,client_id,clinical_session_id FROM office_events WHERE id=?',[result.officeEventId]);expect(bare).toMatchObject({status:'BOOKED',client_id:null,clinical_session_id:null});
  expect(await resource.apply(a,7,'keep')).toEqual(result);const[[{n}]]=await db.execute('SELECT COUNT(*) AS n FROM office_events');expect(n).toBe(2);
 });
 it('keeps guardian and staff workers separate, stops only the reviewed client series, and completes its durable request',async()=>{
  const user={id:7,role:'provider',is_active:1},workflows=new Map(),participants=async id=>{const[rows]=await db.execute('SELECT client_id AS clientId FROM appointment_participants WHERE appointment_id=?',[id]);return rows;};
  const staff=createAppointmentSeriesCancellation({db,access:async(actor,id)=>appointment(id),appointment,participants,user:async()=>user,officeCheck:async()=>{},documentation:async()=>{},validate:async()=>{},requestAccess:async()=>{},clientLock:async(ids,work)=>work(),seriesLock:async work=>work(),encrypt:JSON.stringify,decrypt:JSON.parse,
   preview:async id=>({appointment:{id,displayWhen:(await appointment(id)).startAt},classification:'advance_cancel',consequence:{model:'none',feeCents:0},narrative:'Reviewed nonbillable note.'}),workflow:async id=>workflows.get(id),
   complete:async(id,facts)=>{workflows.set(id,{status:'completed',facts});await db.execute("UPDATE appointments SET status='canceled_by_provider' WHERE id=?",[id]);return{ok:true};},now:()=>new Date('2026-11-14T20:00:00Z')});
  const facts={eventType:'canceled',cancellationScope:'future',officeReservationDisposition:'keep',clientId:31,initiator:'provider',reasons:['provider_unavailable'],clientFacingReason:'Unavailable.'},preview=await staff.preview(user,1,facts);
  const requestId='11111111-1111-4111-8111-111111111111';await staff.submit(user,1,{...facts,signatureConfirmed:true,cancellationRequestId:requestId,cancellationReviewToken:preview.seriesChange.reviewToken});
  await expect(assertClientServiceSchedulingActive({clientId:31,agencyId:2,providerUserId:7,businessType:'mental_health',source:'reserved_office_session:monthly'},db)).rejects.toMatchObject({code:'CLIENT_SERIES_ENDED'});
  await expect(assertClientServiceSchedulingActive({clientId:32,agencyId:2,providerUserId:7,businessType:'mental_health',source:'different-series'},db)).resolves.toBeUndefined();
  const[[plan]]=await db.execute('SELECT session_context_json FROM office_booking_plans WHERE id=30');expect(plan.session_context_json).toMatchObject({clientUnscheduleFromDate:'2027-01-03',officeReservationDisposition:'keep'});
  await db.execute(`INSERT INTO guardian_service_cancellations (id,agency_id,client_id,provider_user_id,actor_user_id,appointment_id,scope,service_kind,request_hash,payload_encrypted,review_json,confirmed_at)
    VALUES ('22222222-2222-4222-8222-222222222222',2,99,7,9,90,'single','counseling',?,? ,?,UTC_TIMESTAMP())`,['a'.repeat(64),JSON.stringify({reason:'Test guardian request'}),JSON.stringify({fees:[],count:0,serviceLabel:'counseling'})]);
  const guardian=createGuardianServiceCancellationService({db,authorize:async()=>({agency_id:2}),clientLock:async(ids,work)=>work(),encrypt:JSON.stringify,decrypt:JSON.parse,notify:async()=>{},calendarCleanup:async()=>{}});
  await guardian.processPending();expect((await staff.status(user,1,requestId)).status).toBe('queued');
  await staff.processPending();expect(await staff.status(user,1,requestId)).toMatchObject({status:'completed',completed:2});expect((await appointment(90)).status).toBe('scheduled');
 });
 it('releases a dated office to another provider while retaining its original standing owner', async () => {
  await db.query("INSERT INTO office_standing_assignments VALUES (6,8,9)");
  await db.query("INSERT INTO office_booking_plans (id,skipped_dates_json,standing_assignment_id,is_active) VALUES (31,JSON_ARRAY(),6,TRUE)");
  await db.query("INSERT INTO office_events (id,office_location_id,room_id,start_at,end_at,status,slot_state,standing_assignment_id,booking_plan_id,assigned_provider_id,booked_provider_id) VALUES (80,8,11,'2027-01-04 18:00','2027-01-04 19:00','BOOKED','ASSIGNED_BOOKED',6,31,9,9),(81,8,11,'2027-01-11 18:00','2027-01-11 19:00','BOOKED','ASSIGNED_BOOKED',6,31,9,9)");
  const startAt = '2027-01-04 18:00:00';
  const endAt = '2027-01-04 19:00:00';
  await releaseOfficeReservation({eventId:80,officeLocationId:8,keepAssigned:true,actorUserId:9,
    reviewedOccurrence:{providerId:9,standingAssignmentId:6,startAt,endAt,now:new Date('2027-01-04T16:00:00Z')}});
  expect(await OfficeEvent.findById(80)).toMatchObject({status:'RELEASED',slot_state:'ASSIGNED_AVAILABLE',standing_assignment_id:6,assigned_provider_id:9,booked_provider_id:null});
  const borrow = {officeLocationId:8,roomId:11,startAt,endAt,status:'BOOKED',slotState:'ASSIGNED_BOOKED',
    allowReleasedOffice:true,bookedProviderId:10,createdByUserId:10};
  await expect(OfficeEvent.createIfRoomOpen(borrow)).resolves.toMatchObject({id:80,standing_assignment_id:6,assigned_provider_id:9,booked_provider_id:10});
  await expect(OfficeEvent.createIfRoomOpen({...borrow,bookedProviderId:11})).rejects.toMatchObject({status:409});
  expect(await OfficeEvent.findById(81)).toMatchObject({status:'BOOKED',booked_provider_id:9,booking_plan_id:31});
 });

 it('blocks up to two assigned hours between sessions and releases the gap after either endpoint is canceled', async () => {
  const startAt = '2027-01-18 18:00:00';
  const endAt = '2027-01-18 19:00:00';
  await db.execute(`INSERT INTO office_events
    (id, office_location_id, room_id, start_at, end_at, status, slot_state, assigned_provider_id, standing_assignment_id, session_context_json)
    VALUES (82,8,11,?,?,'RELEASED','ASSIGNED_AVAILABLE',9,6,JSON_OBJECT('officeCancellationDisposition','release'))`, [startAt, endAt]);
  await db.query(`INSERT INTO appointments (id,agency_id,provider_user_id,room_id,start_at,end_at,status) VALUES
    (91,2,9,11,'2027-01-18 17:00','2027-01-18 18:00','scheduled'),
    (92,3,9,11,'2027-01-18 19:00','2027-01-18 20:00','confirmed')`);
  const blocked = async () => Number((await OfficeEvent.findByRoomAndStart(11, startAt)).office_gap_blocked);
  const borrow = {officeLocationId:8, roomId:11, startAt, endAt, status:'BOOKED', slotState:'ASSIGNED_BOOKED',
    allowReleasedOffice:true, bookedProviderId:10, createdByUserId:10};
  expect(await blocked()).toBe(1);
  await expect(OfficeEvent.createIfRoomOpen(borrow)).rejects.toMatchObject({status:409});
  await db.query("UPDATE appointments SET status='canceled_by_provider' WHERE id=91");
  expect(await blocked()).toBe(0);
  await db.query("UPDATE appointments SET status='scheduled' WHERE id=91");
  await db.query("UPDATE appointments SET status='canceled_by_client' WHERE id=92");
  expect(await blocked()).toBe(0);
  await db.query("UPDATE appointments SET status='confirmed', room_id=12 WHERE id=92");
  expect(await blocked()).toBe(0);
  await db.query("UPDATE appointments SET room_id=11, provider_user_id=10 WHERE id=92");
  expect(await blocked()).toBe(0);
  await db.query("UPDATE appointments SET provider_user_id=9, start_at='2027-01-18 20:00', end_at='2027-01-18 21:00' WHERE id=92");
  expect(await blocked()).toBe(1);
  await db.query("UPDATE appointments SET start_at='2027-01-18 20:01' WHERE id=92");
  expect(await blocked()).toBe(0);
  await expect(OfficeEvent.createIfRoomOpen(borrow)).resolves.toMatchObject({id:82, assigned_provider_id:9, booked_provider_id:10});
 });

});
