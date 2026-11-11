/** Disposable native MySQL only. Never reads .env or uses the application pool. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({execute:vi.fn(),query:vi.fn(),getConnection:vi.fn(),clinical:vi.fn(),notices:vi.fn(),notifications:vi.fn(),rollout:vi.fn(async()=>({enabled:true}))}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,query:m.query,getConnection:m.getConnection},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.execute}}));
vi.mock('../clientSessionBookingRollout.service.js',()=>({clientSessionBookingAccess:m.rollout,requireClientSessionBooking:vi.fn()}));
vi.mock('../qaAppointmentBilling.service.js',()=>({recordQaAttendanceTerms:vi.fn(),syncQaAppointmentBalance:vi.fn(),requireQaOutcomeElapsed:vi.fn()}));
vi.mock('../guardianAppointments.service.js',()=>({requireAppointmentRequestProvider:vi.fn(),requireGuardianCancellation:vi.fn()}));
vi.mock('../appointmentClinicalLink.service.js',()=>({assertAppointmentClients:vi.fn(),ensureAppointmentClinicalLink:m.clinical}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:vi.fn(async()=>({kind:'school'}))}));
vi.mock('../sessionNotification.service.js',()=>({scheduleSessionNotifications:m.notifications}));
vi.mock('../appointmentScheduleNotice.service.js',()=>({appointmentScheduleNotices:{queue:m.notices}}));
vi.mock('../appointmentReminder.service.js',()=>({cancelPendingReminders:vi.fn(),listReminders:vi.fn(async()=>[]),listCommunications:vi.fn(async()=>[])}));
vi.mock('../providerCalendarBusy.service.js',()=>({readProviderCalendarBusy:vi.fn(async()=>[])}));
vi.mock('../privateReplacementSlots.service.js',()=>({readPrivateReplacementSlots:vi.fn(async()=>[])}));
import Appointment from '../../models/Appointment.model.js';
import {readSchoolTransition,saveSchoolTransition,schoolAgendaLinkContext,linkSchoolAppointment,listSchoolBookedSessions,moveSchoolBookedSession,assertLinkedSchoolSlotPlanningEdits,requireSchoolTransitionSchema} from '../schoolAppointmentTransition.service.js';
const schema=`codex_school_transition_${process.pid}_${Date.now()}`;
const context={agencyId:450,schoolId:451,providerId:7,timeZone:'America/Denver'};
describe.skipIf(!process.env.SCHOOL_TRANSITION_TEST_MYSQL_PORT)('school transition real MySQL and appointment domain',()=>{
 let admin,db,createSafetyTrigger;
 beforeAll(async()=>{
  const port=Number(process.env.SCHOOL_TRANSITION_TEST_MYSQL_PORT);
  if(port===3307)throw new Error('Never use the live database proxy for this test.');
  const options={host:'127.0.0.1',port,user:'root',password:'',timezone:'+00:00',dateStrings:true};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${schema}`);
  db=mysql.createPool({...options,database:schema,connectionLimit:10});m.execute.mockImplementation((...args)=>db.execute(...args));m.query.mockImplementation((...args)=>db.query(...args));m.getConnection.mockImplementation(()=>db.getConnection());
  for(const sql of [
   'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(60),organization_type VARCHAR(20),timezone VARCHAR(60))',
   'CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(60),last_name VARCHAR(60))',
   'CREATE TABLE tenant_services(id INT UNSIGNED PRIMARY KEY)',
   'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,provider_id INT,initials VARCHAR(20),identifier_code VARCHAR(30))',
   'CREATE TABLE provider_school_assignments(id INT PRIMARY KEY,school_organization_id INT,provider_user_id INT,day_of_week VARCHAR(20),is_active BOOLEAN,start_time TIME,end_time TIME)',
   'CREATE TABLE agency_service_locations(id INT PRIMARY KEY,agency_id INT,school_organization_id INT)',
   'CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active BOOLEAN)',
   'CREATE TABLE client_provider_assignments(client_id INT,organization_id INT,provider_user_id INT,is_active BOOLEAN)',
   'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active BOOLEAN)',
   'CREATE TABLE school_profiles(school_organization_id INT,district_name VARCHAR(60))',
   'CREATE TABLE company_events(id INT,agency_id INT,organization_id INT,district_name VARCHAR(60),event_type VARCHAR(60),title VARCHAR(60),description TEXT,starts_at DATETIME,ends_at DATETIME,timezone VARCHAR(60),created_at DATETIME,created_by_user_id INT,is_active BOOLEAN,school_event_status VARCHAR(30))',
   'CREATE TABLE client_schedule_termination_jobs(id INT,client_id INT,completed_at DATETIME)',
   'CREATE TABLE office_events(id INT,booked_provider_id INT,assigned_provider_id INT,client_id INT,status VARCHAR(30),start_at DATETIME,end_at DATETIME)',
   'CREATE TABLE supervision_sessions(id INT,status VARCHAR(30),start_at DATETIME,end_at DATETIME,supervisor_user_id INT,co_facilitator_user_id INT,session_type VARCHAR(30),supervisee_user_id INT)',
   'CREATE TABLE supervision_session_attendees(session_id INT,user_id INT,is_required BOOLEAN,status VARCHAR(30))',
   'CREATE TABLE clinical_sessions(id INT PRIMARY KEY,appointment_id INT)',
   'CREATE TABLE clinical_notes(id INT PRIMARY KEY,clinical_session_id INT,is_deleted BOOLEAN,provider_signed_at DATETIME)',
   'CREATE TABLE provider_schedule_events(id INT PRIMARY KEY,start_at DATETIME,end_at DATETIME,status VARCHAR(30),updated_by_user_id INT)'
  ])await db.query(sql);
  for(const file of ['979_unified_appointments.sql','238_school_portal_soft_schedule_slots.sql','1786_school_appointment_transition.sql']){
   const contents=await readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8');for(const sql of splitSqlStatements(contents)){await db.query(sql);if(/CREATE TRIGGER school_schedule_slot_identity_detach/.test(sql))createSafetyTrigger=sql;}
  }
  await db.query(`ALTER TABLE appointments ADD service_location_id INT,ADD source_timezone VARCHAR(60),ADD product_origin VARCHAR(30),ADD location_label VARCHAR(100),ADD service_code VARCHAR(30),ADD addon_service_codes_json JSON,ADD office_booking_request_id INT,ADD cancellation_policy_id INT,ADD cancel_deadline_at DATETIME,ADD cancellation_reason TEXT,ADD cancellation_fee_cents INT,ADD cancellation_recommendation_json JSON,ADD canceled_at DATETIME,ADD canceled_by_user_id INT,ADD others_present_names VARCHAR(500),ADD video_room_mode VARCHAR(30),ADD notification_mode VARCHAR(30)`);
  await db.query("INSERT INTO agencies VALUES(450,'Synthetic practice','agency','America/Denver'),(451,'Synthetic school','school','America/Denver'),(452,'Other school','school','America/Denver')");
  await db.query("INSERT INTO users VALUES(7,'Synthetic','Provider'),(12,'Synthetic','School staff'),(99,'Synthetic','Admin')");
  await db.query('INSERT INTO agency_service_locations VALUES(10,450,451),(20,450,452)');
  await db.query('INSERT INTO organization_affiliations VALUES(450,451,1)');
  await db.query("INSERT INTO school_profiles VALUES(451,'Synthetic district')");
  await db.query("INSERT INTO provider_school_assignments VALUES(1,451,7,'Monday',1,'08:00','15:00'),(2,451,7,'Tuesday',1,'08:00','15:00')");
 });
 beforeEach(async()=>{
  for(const table of ['school_schedule_appointment_links','school_schedule_transitions','appointment_participants','appointment_billing','appointments','soft_schedule_slots','clients','client_provider_assignments','client_organization_assignments','clinical_notes','clinical_sessions','provider_schedule_events','company_events'])await db.query(`DELETE FROM ${table}`);
  await db.query("INSERT INTO clients VALUES(1,450,451,7,'AA','SYN-AA'),(2,450,451,7,'BB','SYN-BB'),(3,999,451,7,'XX','OTHER-PRACTICE')");
  await db.query('INSERT INTO client_organization_assignments VALUES(1,451,1),(2,451,1),(3,451,1)');await db.query('INSERT INTO client_provider_assignments VALUES(1,451,7,1),(2,451,7,1)');
  await db.query("INSERT INTO soft_schedule_slots(id,school_organization_id,weekday,provider_user_id,slot_index,start_time,end_time,client_id,created_by_user_id,updated_by_user_id) VALUES(10,451,'Monday',7,1,'09:00','10:00',1,99,99),(11,451,'Monday',7,2,NULL,NULL,2,99,99)");
  await db.query("INSERT INTO appointments(id,agency_id,provider_user_id,start_at,end_at,status,source,service_location_id,source_timezone,product_origin,service_code,provider_schedule_event_id) VALUES(100,450,7,'2028-11-06 16:00:00','2028-11-06 17:00:00','scheduled','school_weekly',10,'America/Denver','full_suite','90837',77)");
  await db.query("INSERT INTO appointment_participants(appointment_id,client_id,role) VALUES(100,1,'client')");await db.query("INSERT INTO provider_schedule_events VALUES(77,'2028-11-06 16:00:00','2028-11-06 17:00:00','ACTIVE',99)");
  m.rollout.mockResolvedValue({enabled:true});m.clinical.mockClear();m.notices.mockClear();m.notifications.mockClear();
 });
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE ${schema}`);await admin.end();}});
 const activate=()=>saveSchoolTransition({context,actorUserId:99,input:{effectiveDate:'2028-11-01',revision:0,reviewed:true},dbPool:db});
 const link=()=>linkSchoolAppointment({agencyId:450,schoolId:451,slotId:10,appointmentId:100,actorUserId:99,seriesKey:'synthetic-series'});
 const list=()=>listSchoolBookedSessions({context,startDate:'2028-11-06',endDate:'2028-11-13',db});
 it('applies the actual migration with foreign keys, explicit cutover, reviewed identity, and idempotent links',async()=>{
  expect(await readSchoolTransition({...context,db})).toBeNull();await expect(link()).rejects.toThrow('effective date');
  await activate();expect(await link()).toMatchObject({alreadyLinked:false});expect(await link()).toMatchObject({alreadyLinked:true});
  expect((await db.query('SELECT * FROM school_schedule_appointment_links'))[0]).toHaveLength(1);
  const result=await list();expect(result.appointments).toHaveLength(1);expect(result.appointments[0]).toMatchObject({id:100,slotId:10,clientLabel:'SYN-AA',startAt:'2028-11-06T16:00:00.000Z',canMove:true});
  await db.query('DELETE FROM soft_schedule_slots WHERE id=10');
  expect((await list()).appointments[0]).toMatchObject({id:100,planningWeekday:'Monday'});
 });
 it('reads provider recurring weekday/time edits directly from the canonical appointment and retains canceled bookings',async()=>{
  await activate();await link();await db.query("UPDATE appointments SET start_at='2028-11-07 17:00:00',end_at='2028-11-07 18:00:00' WHERE id=100");
  const moved=(await list()).appointments[0];expect(moved.startAt).toBe('2028-11-07T17:00:00.000Z');expect(moved.planningWeekday).toBe('Monday');
  await db.query("UPDATE appointments SET status='canceled_by_provider' WHERE id=100");expect((await list()).appointments[0]).toMatchObject({status:'canceled_by_provider',canMove:false});
 });
 it('rejects other schools, wrong clients, and ambiguous slots without creating links',async()=>{
  await activate();await expect(linkSchoolAppointment({db,agencyId:450,schoolId:452,slotId:10,appointmentId:100,actorUserId:99})).rejects.toThrow('service location');
  await expect(linkSchoolAppointment({db,agencyId:450,schoolId:451,slotId:11,appointmentId:100,actorUserId:99})).rejects.toThrow('school slot');
  await db.query("INSERT INTO soft_schedule_slots(school_organization_id,weekday,provider_user_id,slot_index,client_id,created_by_user_id,updated_by_user_id) VALUES(451,'Monday',7,3,1,99,99)");
  await expect(schoolAgendaLinkContext({db,agencyId:450,schoolId:451,providerId:7,clientId:1,date:'2028-11-06'})).rejects.toThrow('exact school slot');
  expect((await db.query('SELECT * FROM school_schedule_appointment_links'))[0]).toHaveLength(0);
 });
 it('updates the actual full-suite appointment and calendar facet through the normal domain service',async()=>{
  await activate();await link();const appointment=(await list()).appointments[0];
  await moveSchoolBookedSession({context,appointmentId:100,actorUserId:12,input:{date:'2028-11-07',startTime:'10:00',endTime:'11:00',fingerprint:appointment.fingerprint},db});
  const [[canonical]]=await db.query('SELECT start_at,end_at FROM appointments WHERE id=100');expect(canonical).toEqual({start_at:'2028-11-07 17:00:00',end_at:'2028-11-07 18:00:00'});
  const [[calendar]]=await db.query('SELECT start_at,end_at FROM provider_schedule_events WHERE id=77');expect(calendar).toEqual(canonical);
  expect(m.clinical).toHaveBeenCalledWith(100,12);expect(m.notifications).toHaveBeenCalledWith(100,{replace:true});expect(m.notices).toHaveBeenCalledWith(100,expect.objectContaining({eventType:'moved',actorUserId:12}));
  expect((await db.query('SELECT * FROM soft_schedule_slots WHERE client_id=1'))[0]).toHaveLength(1);
 });
 it('rejects stale school edits and an atomic UPDATE that raced another writer',async()=>{
  await activate();await link();const appointment=(await list()).appointments[0];await db.query("UPDATE appointments SET start_at='2028-11-06 17:00:00',end_at='2028-11-06 18:00:00' WHERE id=100");
  await expect(moveSchoolBookedSession({context,appointmentId:100,actorUserId:12,input:{date:'2028-11-07',startTime:'10:00',endTime:'11:00',fingerprint:appointment.fingerprint},db})).rejects.toThrow('changed');
  const reviewed=await Appointment.findById(100);let raced=false;
  const executor={execute:async(sql,args)=>{if(sql.startsWith('UPDATE appointments SET')&&!raced){raced=true;await db.query("UPDATE appointments SET status='canceled_by_provider' WHERE id=100");}return db.execute(sql,args);}};
  await expect(Appointment.updateInAvailableWindow(100,{startAt:'2028-11-07 17:00:00',endAt:'2028-11-07 18:00:00'},reviewed,{executor})).rejects.toMatchObject({status:409});
  expect((await db.query('SELECT status FROM appointments WHERE id=100'))[0][0].status).toBe('canceled_by_provider');
 });
 it('atomically rejects moving a school booking after another writer changed its participant',async()=>{
  const reviewed={...await Appointment.findById(100),expectedParticipantClientId:1};let raced=false;
  const executor={execute:async(sql,args)=>{if(sql.startsWith('UPDATE appointments SET')&&!raced){raced=true;await db.query('UPDATE appointment_participants SET client_id=2 WHERE appointment_id=100');}return db.execute(sql,args);}};
  await expect(Appointment.updateInAvailableWindow(100,{startAt:'2028-11-07 17:00:00',endAt:'2028-11-07 18:00:00'},reviewed,{executor})).rejects.toMatchObject({status:409});
  expect((await db.query('SELECT start_at FROM appointments WHERE id=100'))[0][0].start_at).toBe('2028-11-06 16:00:00');
 });
 it('keeps signed clinical records, appointment conflicts, school hours and closure rules enforced',async()=>{
  await activate();await link();let appointment=(await list()).appointments[0];
  const move=input=>moveSchoolBookedSession({context,appointmentId:100,actorUserId:12,input:{date:'2028-11-07',startTime:'10:00',endTime:'11:00',fingerprint:appointment.fingerprint,...input},db});
  await expect(move({startTime:'07:00',endTime:'08:00'})).rejects.toThrow('assigned school hours');
  await db.query("INSERT INTO company_events(id,agency_id,organization_id,event_type,title,starts_at,ends_at,timezone,is_active,school_event_status) VALUES(1,450,451,'school_sessions_prohibited','Synthetic closure','2028-11-07 00:00:00','2028-11-08 00:00:00','America/Denver',1,'scheduled')");
  await expect(move({})).rejects.toThrow('closed');await db.query('DELETE FROM company_events');
  await db.query("INSERT INTO appointments(id,agency_id,provider_user_id,start_at,end_at,status) VALUES(101,450,7,'2028-11-07 17:00:00','2028-11-07 18:00:00','scheduled')");
  await expect(move({})).rejects.toMatchObject({status:409});await db.query('DELETE FROM appointments WHERE id=101');
  await db.query('INSERT INTO clinical_sessions VALUES(1,100)');await db.query("INSERT INTO clinical_notes VALUES(1,1,0,'2028-11-05 17:00:00')");await db.query('UPDATE appointments SET clinical_session_id=1 WHERE id=100');
  appointment=(await list()).appointments[0];await expect(move({})).rejects.toThrow('signed note');
  expect((await db.query('SELECT start_at FROM appointments WHERE id=100'))[0][0].start_at).toBe('2028-11-06 16:00:00');
 });
 it('preserves linked slot capacity and rejects planning edits that would detach the booked client',async()=>{
  await activate();await link();await expect(assertLinkedSchoolSlotPlanningEdits({schoolId:451,providerId:7,weekday:'Monday',db,slots:[{id:10,client_id:1,start_time:'09:00',end_time:'10:00'},{id:11,client_id:2}]})).resolves.toBeUndefined();
  await expect(assertLinkedSchoolSlotPlanningEdits({schoolId:451,providerId:7,weekday:'Monday',db,slots:[{id:11,client_id:2},{id:10,client_id:1,start_time:'09:00',end_time:'10:00'}]})).resolves.toBeUndefined();
  await expect(assertLinkedSchoolSlotPlanningEdits({schoolId:451,providerId:7,weekday:'Monday',db,slots:[{id:10,client_id:2,start_time:'09:00',end_time:'10:00'}]})).rejects.toThrow('actual appointment');
  await expect(saveSchoolTransition({context,actorUserId:99,input:{effectiveDate:'2028-11-10',revision:1,reviewed:true},dbPool:db})).rejects.toThrow('already linked');
 });
 it('retains the canonical school history when a legacy lifecycle repurposes a planning row',async()=>{
  await activate();await link();await db.query('UPDATE soft_schedule_slots SET client_id=2 WHERE id=10');
  const [[saved]]=await db.query('SELECT slot_id,client_id,planning_weekday FROM school_schedule_appointment_links WHERE appointment_id=100');
  expect(saved).toEqual({slot_id:null,client_id:1,planning_weekday:'Monday'});expect((await list()).appointments[0]).toMatchObject({id:100,clientId:1,slotId:null});
 });
 it('blocks activation and school import preflight when the DDL tables exist but the safety trigger failed',async()=>{
  expect(await requireSchoolTransitionSchema({db})).toBe(true);await db.query('DROP TRIGGER school_schedule_slot_identity_detach');
  try {
   await expect(activate()).rejects.toMatchObject({status:503});
   await expect(schoolAgendaLinkContext({db,agencyId:450,schoolId:451,providerId:7,clientId:1,slotId:10,date:'2028-11-06'})).rejects.toMatchObject({status:503});
   expect(await readSchoolTransition({...context,db})).toBeNull();
  }finally{await db.query(createSafetyTrigger);}
 });
 it('saves an unrelated weekday without requiring that day to contain the provider’s linked Monday slots',async()=>{
  await activate();await link();
  await db.query("INSERT INTO soft_schedule_slots(id,school_organization_id,weekday,provider_user_id,slot_index,client_id,created_by_user_id,updated_by_user_id) VALUES(12,451,'Tuesday',7,1,2,99,99)");
  await expect(assertLinkedSchoolSlotPlanningEdits({schoolId:451,providerId:7,weekday:'Tuesday',db,slots:[{id:12,client_id:2,start_time:null,end_time:null}]})).resolves.toBeUndefined();
  await expect(assertLinkedSchoolSlotPlanningEdits({schoolId:451,providerId:7,weekday:'Monday',db,slots:[{id:11,client_id:2}]})).rejects.toThrow('actual appointment');
 });
 it('serializes new links with a source slot identity change and rejects the stale source instead of mislinking clients',async()=>{
  await activate();const editing=await db.getConnection();await editing.beginTransaction();await editing.execute('SELECT id FROM soft_schedule_slots WHERE id=10 FOR UPDATE');
  let done=false;const linking=link().then(value=>{done=true;return{value};},error=>{done=true;return{error};});
  try {
   await new Promise(resolve=>setTimeout(resolve,40));expect(done).toBe(false);
   await editing.execute('UPDATE soft_schedule_slots SET client_id=2 WHERE id=10');await editing.commit();
   const result=await linking;expect(result.error).toMatchObject({status:409});
   expect((await db.query('SELECT * FROM school_schedule_appointment_links'))[0]).toHaveLength(0);
  }finally{await editing.rollback();editing.release();}
 });
});
