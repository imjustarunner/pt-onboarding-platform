// Disposable localhost databases only. Never reads backend/.env or production data.
import { describe,it,expect,vi,beforeAll,beforeEach,afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements } from '../../utils/migrationSql.js';
const mocks = vi.hoisted(() => ({ release:vi.fn(), google:vi.fn(), invalidate:vi.fn() }));
vi.mock('../../config/database.js', async () => ({ default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT || 1),user:'root',password:'',database:'codex_provider_offboarding_main',timezone:'+00:00',connectionLimit:8}) }));
vi.mock('../../config/clinicalDatabase.js', async () => ({ default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT || 1),user:'root',password:'',database:'codex_provider_offboarding_clinical',timezone:'+00:00'}) }));
vi.mock('../../models/BookingPackage.model.js', () => ({default:{applyAppointmentUsage:mocks.release}}));
vi.mock('../officeScheduleMaterializer.service.js', () => ({default:{invalidateOffice:mocks.invalidate}}));
vi.mock('../googleCalendar.service.js', () => ({default:{cancelBookedOfficeEvent:mocks.google}}));
vi.mock('../publicProviderHold.service.js', () => ({resolveClientProviderHolds:vi.fn()}));
import OfficeEvent from '../../models/OfficeEvent.model.js';
import pool from '../../config/database.js';
import clinical from '../../config/clinicalDatabase.js';
import { processProviderOffboarding,processPendingProviderOffboarding } from '../providerOffboarding.service.js';

const tables = {
 users:"id INT PRIMARY KEY,role VARCHAR(40) DEFAULT 'provider',has_provider_access BOOLEAN DEFAULT 0,status VARCHAR(40),is_archived BOOLEAN DEFAULT 0,is_active BOOLEAN DEFAULT 1,provider_accepting_new_clients BOOLEAN DEFAULT 1,archived_by_user_id INT",
 office_standing_assignments:'id INT PRIMARY KEY,provider_id INT,office_location_id INT,is_active BOOLEAN DEFAULT 1,bookable_in_person BOOLEAN DEFAULT 1,bookable_virtual BOOLEAN DEFAULT 1',
 office_booking_plans:'id INT PRIMARY KEY,standing_assignment_id INT,is_active BOOLEAN DEFAULT 1',
 office_room_assignments:'id INT PRIMARY KEY,assigned_user_id INT,start_at DATETIME,end_at DATETIME',
 office_booking_requests:'id INT PRIMARY KEY,requested_provider_id INT,status VARCHAR(30)',
 office_room_requests:'id INT PRIMARY KEY,user_id INT,status VARCHAR(30)',
 provider_office_availability_requests:'id INT PRIMARY KEY,provider_id INT,status VARCHAR(30)',
 provider_school_availability_requests:'id INT PRIMARY KEY,provider_id INT,status VARCHAR(30)',
 public_appointment_requests:'id INT PRIMARY KEY,provider_id INT,status VARCHAR(30)',
 public_provider_slot_holds:'id INT PRIMARY KEY,provider_id INT,released_at DATETIME(3),resolution VARCHAR(80),resolved_by_user_id INT',

 appointments:'id INT PRIMARY KEY,office_event_id INT,provider_user_id INT,agency_id INT,package_entitlement_id INT,start_at DATETIME,status VARCHAR(40),cancellation_reason TEXT,cancellation_fee_cents INT,canceled_at DATETIME,canceled_by_user_id INT,updated_by_user_id INT',
 appointment_reminders:'id INT PRIMARY KEY,appointment_id INT,status VARCHAR(30)',
 office_events:'id INT PRIMARY KEY AUTO_INCREMENT,room_id INT,client_id INT,clinical_session_id INT,note_context_id INT,billing_context_id INT,source VARCHAR(30),recurrence_group_id VARCHAR(64),notes TEXT,appointment_type_code VARCHAR(40),appointment_subtype_code VARCHAR(40),service_code VARCHAR(40),modality VARCHAR(40),created_by_user_id INT,approved_by_user_id INT,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,office_location_id INT,standing_assignment_id INT,booking_plan_id INT,assigned_provider_id INT,booked_provider_id INT,start_at DATETIME,end_at DATETIME,status VARCHAR(30),slot_state VARCHAR(30),cancellation_reason TEXT,google_provider_event_id VARCHAR(80),FOREIGN KEY (assigned_provider_id) REFERENCES users(id),FOREIGN KEY (booked_provider_id) REFERENCES users(id),FOREIGN KEY (standing_assignment_id) REFERENCES office_standing_assignments(id)',
 provider_schedule_events:'id INT PRIMARY KEY,provider_id INT,start_at DATETIME,start_date DATE,all_day BOOLEAN DEFAULT 0,status VARCHAR(30),recurrence_series_id VARCHAR(80),recurrence_stopped BOOLEAN DEFAULT 0,recurrence_horizon_held BOOLEAN DEFAULT 0,recurrence_calendar_pending BOOLEAN DEFAULT 0,meeting_completed_at DATETIME,updated_by_user_id INT',
 supervision_sessions:'id INT PRIMARY KEY,supervisor_user_id INT,start_at DATETIME,status VARCHAR(30),recurrence_series_id VARCHAR(80),recurrence_stopped BOOLEAN DEFAULT 0,recurrence_horizon_held BOOLEAN DEFAULT 0,recurrence_calendar_pending BOOLEAN DEFAULT 0,finalized_at DATETIME',
 provider_schedule_event_attendees:'event_id INT,user_id INT',
 supervision_session_attendees:'session_id INT,user_id INT,status VARCHAR(30)',
 clients:'id INT PRIMARY KEY,provider_id INT,service_day VARCHAR(30),status VARCHAR(30),updated_by_user_id INT,last_activity_at DATETIME',
 client_provider_assignments:'id INT PRIMARY KEY,client_id INT,provider_user_id INT,service_day VARCHAR(30),is_primary BOOLEAN DEFAULT 0,is_active BOOLEAN DEFAULT 1,updated_by_user_id INT,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP',
 provider_in_person_slot_availability:'id INT PRIMARY KEY,provider_id INT,is_active BOOLEAN DEFAULT 1',
 provider_virtual_slot_availability:'id INT PRIMARY KEY,provider_id INT,is_active BOOLEAN DEFAULT 1',
 provider_in_office_availability:'id INT PRIMARY KEY,provider_id INT,is_available BOOLEAN DEFAULT 1',
 provider_virtual_working_hours:'id INT PRIMARY KEY,provider_id INT',
 soft_schedule_slots:'id INT PRIMARY KEY,provider_user_id INT',
 school_provider_schedule_entries:'id INT PRIMARY KEY,provider_user_id INT',
 provider_school_assignments:'id INT PRIMARY KEY,provider_user_id INT,is_active BOOLEAN DEFAULT 1,slots_available INT DEFAULT 2',
 school_day_provider_assignments:'id INT PRIMARY KEY,provider_user_id INT,is_active BOOLEAN DEFAULT 1',
 user_office_locations:'id INT PRIMARY KEY,user_id INT,is_active BOOLEAN DEFAULT 1'
};
const insert = async (table,rows,db=pool) => {
 for (const row of rows) await db.query(`INSERT INTO ${table} SET ?`,row);
};
const rows = async (table,db=pool) => (await db.query(`SELECT * FROM ${table} ORDER BY id`))[0];
let admin; const created=[];
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('archived provider cleanup in disposable MySQL', () => {
 beforeAll(async () => {
  admin=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:''});
  for (const name of ['codex_provider_offboarding_main','codex_provider_offboarding_clinical']) {await admin.query(`CREATE DATABASE ${name}`);created.push(name);}
  for (const [table,ddl] of Object.entries(tables)) await pool.query(`CREATE TABLE ${table} (${ddl}) ENGINE=InnoDB`);
  await clinical.query(`CREATE TABLE clinical_sessions (id INT PRIMARY KEY,provider_user_id INT,scheduled_start_at DATETIME,encounter_status VARCHAR(30),billing_encounter_id INT,claim_blocked_reason TEXT,updated_at DATETIME,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await insert('users',[{id:99,status:'ARCHIVED',is_archived:1}]);
  const migration=await readFile(new URL('../../../../database/migrations/1611_provider_offboarding_cleanup.sql',import.meta.url),'utf8');
  for (const statement of splitSqlStatements(migration)) await pool.query(statement);
  expect((await rows('provider_offboarding_jobs'))[0].provider_id).toBe(99);
 });
 beforeEach(async () => {
  vi.clearAllMocks();mocks.release.mockResolvedValue({});mocks.google.mockResolvedValue({ok:true});
  await pool.query('DELETE FROM provider_offboarding_items');await pool.query('DELETE FROM provider_offboarding_jobs');
  for (const table of Object.keys(tables).reverse()) await pool.query(`DELETE FROM ${table}`);
  await clinical.query('DELETE FROM clinical_sessions');
  await insert('users',[{id:1,status:'ACTIVE_EMPLOYEE'},{id:2,status:'ACTIVE_EMPLOYEE'}]);
 });
 afterAll(async () => {
  await pool.end();await clinical.end();
  for(const name of created) await admin.query(`DROP DATABASE ${name}`);
  await admin?.end();
 });
 async function archive() {
  await pool.query("UPDATE users SET status='ARCHIVED',is_archived=1 WHERE id=1");
  return (await rows('provider_offboarding_jobs'))[0].id;
 }
 it('queues archiving atomically, catches legacy inactive status, and does not duplicate repeated updates', async () => {
  const c=await pool.getConnection();await c.beginTransaction();
  await c.query("UPDATE users SET status='ARCHIVED' WHERE id=1");await c.rollback();c.release();
  expect(await rows('provider_offboarding_jobs')).toHaveLength(0);
  await archive();await pool.query('UPDATE users SET provider_accepting_new_clients=1,is_active=1 WHERE id=1');
  expect(await rows('provider_offboarding_jobs')).toHaveLength(1);
  expect((await rows('users'))[0]).toMatchObject({is_active:0,provider_accepting_new_clients:0});
  await pool.query("UPDATE users SET status='INACTIVE_EMPLOYEE' WHERE id=2");
  expect(await rows('provider_offboarding_jobs')).toHaveLength(2);
 });
 it('clears future work while preserving client status, history and another clinician’s room claim', async () => {
  await insert('office_standing_assignments',[{id:1,provider_id:1,office_location_id:7},{id:2,provider_id:2,office_location_id:7}]);
  await insert('office_booking_plans',[{id:1,standing_assignment_id:1},{id:2,standing_assignment_id:2}]);
  await insert('office_events',[
   {id:1,office_location_id:7,assigned_provider_id:1,booked_provider_id:1,standing_assignment_id:1,booking_plan_id:1,start_at:'2099-01-01',end_at:'2099-01-02',status:'BOOKED'},
   {id:2,office_location_id:7,assigned_provider_id:1,booked_provider_id:2,standing_assignment_id:1,booking_plan_id:1,start_at:'2099-01-02',end_at:'2099-01-03',status:'BOOKED'},
   {id:3,office_location_id:7,assigned_provider_id:1,booked_provider_id:1,start_at:'2000-01-01',end_at:'2000-01-02',status:'BOOKED'}]);
  await insert('office_room_assignments',[{id:1,assigned_user_id:1,start_at:'2099-01-01'},{id:2,assigned_user_id:2,start_at:'2099-01-01'}]);
  await insert('appointments',[{id:1,provider_user_id:1,agency_id:3,package_entitlement_id:4,start_at:'2099-01-01',status:'scheduled',cancellation_fee_cents:2000},{id:2,provider_user_id:1,start_at:'2000-01-01',status:'completed'},{id:3,provider_user_id:2,start_at:'2099-01-01',status:'scheduled'}]);
  await insert('appointment_reminders',[{id:1,appointment_id:1,status:'pending'}]);
  await insert('clients',[{id:1,provider_id:1,status:'current'},{id:2,provider_id:1,status:'current'},{id:3,provider_id:2,status:'current'}]);
  await insert('client_provider_assignments',[{id:1,client_id:1,provider_user_id:1},{id:2,client_id:2,provider_user_id:1},{id:3,client_id:2,provider_user_id:2,is_primary:1},{id:4,client_id:3,provider_user_id:1}]);
  await insert('clinical_sessions',[{id:1,provider_user_id:1,scheduled_start_at:'2099-01-01',encounter_status:'scheduled'},{id:2,provider_user_id:1,scheduled_start_at:'2000-01-01',encounter_status:'completed'},{id:3,provider_user_id:1,scheduled_start_at:'2099-01-01',encounter_status:'scheduled',billing_encounter_id:4}],clinical);
  await insert('provider_schedule_events',[{id:1,provider_id:1,start_at:'2099-01-01',status:'ACTIVE',recurrence_series_id:'series'},{id:2,provider_id:1,start_at:'2000-01-01',status:'ACTIVE',recurrence_series_id:'series',meeting_completed_at:'2000-01-02'}]);
  await insert('supervision_sessions',[{id:1,supervisor_user_id:1,start_at:'2099-01-01',status:'SCHEDULED',recurrence_series_id:'supervision'}]);
  await insert('provider_in_person_slot_availability',[{id:1,provider_id:1},{id:2,provider_id:2}]);
  const id=await archive();await processProviderOffboarding(id);await processProviderOffboarding(id);
  expect((await rows('office_standing_assignments')).map(r=>r.is_active)).toEqual([0,1]);
  expect((await rows('office_booking_plans')).map(r=>r.is_active)).toEqual([0,1]);
  const events=await rows('office_events');expect(events[0].status).toBe('CANCELLED');expect(events[1]).toMatchObject({status:'BOOKED',assigned_provider_id:2,standing_assignment_id:null,booking_plan_id:null});expect(events[2].status).toBe('BOOKED');
  expect((await rows('office_room_assignments')).map(r=>r.id)).toEqual([2]);
  expect((await rows('appointments')).map(r=>r.status)).toEqual(['canceled_by_organization','completed','scheduled']);
  expect((await rows('appointments'))[0].cancellation_fee_cents).toBe(0);
  expect((await rows('appointment_reminders'))[0].status).toBe('canceled');
  expect((await rows('clients')).map(r=>[r.provider_id,r.status])).toEqual([[null,'current'],[2,'current'],[2,'current']]);
  expect((await rows('client_provider_assignments')).map(r=>r.is_active)).toEqual([0,0,1,0]);
  expect((await rows('clinical_sessions',clinical)).map(r=>r.encounter_status)).toEqual(['cancelled','completed','scheduled']);
  expect((await rows('provider_schedule_events')).map(r=>[r.status,r.recurrence_stopped])).toEqual([['CANCELLED',1],['ACTIVE',1]]);
  expect((await rows('supervision_sessions'))[0]).toMatchObject({status:'CANCELLED',recurrence_stopped:1});
  expect((await rows('provider_in_person_slot_availability')).map(r=>r.is_active)).toEqual([0,1]);
  expect(mocks.release).toHaveBeenCalledTimes(1);
  expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({entitlementId:4,appointmentId:1,mode:'release'}));
  expect((await rows('provider_offboarding_jobs'))[0].completed_at).not.toBeNull();
 });
 it('retries external failures without reopening rooms or losing the cancellation work', async () => {
  await insert('office_events',[{id:1,office_location_id:7,assigned_provider_id:1,start_at:'2099-01-01',end_at:'2099-01-02',status:'BOOKED',google_provider_event_id:'calendar'}]);
  const id=await archive();mocks.google.mockResolvedValueOnce({ok:false});
  await expect(processProviderOffboarding(id)).rejects.toMatchObject({code:'OFFICE_CALENDAR_RETRY'});
  expect((await rows('office_events'))[0].status).toBe('CANCELLED');
  expect((await rows('provider_offboarding_jobs'))[0]).toMatchObject({completed_at:null,last_error_code:'OFFICE_CALENDAR_RETRY'});
  await processPendingProviderOffboarding();
  expect(mocks.google).toHaveBeenCalledTimes(2);expect((await rows('provider_offboarding_jobs'))[0].completed_at).not.toBeNull();
 });
 it('rolls back operational changes and leaves a retry when the main database fails', async () => {
  await insert('office_standing_assignments',[{id:1,provider_id:1}]);const id=await archive();
  await pool.query('RENAME TABLE client_provider_assignments TO missing_assignments');
  try {await expect(processProviderOffboarding(id)).rejects.toMatchObject({code:'ER_NO_SUCH_TABLE'});}
  finally {await pool.query('RENAME TABLE missing_assignments TO client_provider_assignments');}
  expect((await rows('office_standing_assignments'))[0].is_active).toBe(1);
  expect((await rows('provider_offboarding_jobs'))[0].schedule_cleaned_at).toBeNull();
  await processProviderOffboarding(id);expect((await rows('office_standing_assignments'))[0].is_active).toBe(0);
 });
 it('does not offboard an account restored before the queued cleanup began', async () => {
  await insert('office_standing_assignments',[{id:1,provider_id:1}]);const id=await archive();
  await pool.query("UPDATE users SET status='ACTIVE_EMPLOYEE',is_archived=0,is_active=1 WHERE id=1");
  expect(await processProviderOffboarding(id)).toMatchObject({completed:true,skipped:true});
  expect((await rows('office_standing_assignments'))[0].is_active).toBe(1);
 });
 it('creates and retries a seven-hour weekly room assignment with real foreign keys', async () => {
  await insert('office_standing_assignments',Array.from({length:7},(_,i)=>({id:i+1,provider_id:1,office_location_id:7})));
  const reserve = (hour,startAt,endAt) => OfficeEvent.upsertSlotState({officeLocationId:7,roomId:4,startAt,endAt,
    standingAssignmentId:hour-6,assignedProviderId:1,slotState:'ASSIGNED_AVAILABLE',createdByUserId:2,replaceCancelled:true});
  // Initial clicked block and the following year of weekly occurrences, including
  // the same upserts a grid refresh or a retry after a failed request performs.
  for (let week=0;week<53;week++) {
    const day=new Date(Date.UTC(2026,9,15+week*7)).toISOString().slice(0,10);
    for(let hour=7;hour<14;hour++) {
      const startAt=`${day} ${String(hour).padStart(2,'0')}:00:00`;
      const endAt=`${day} ${String(hour+1).padStart(2,'0')}:00:00`;
      const event=await reserve(hour,startAt,endAt);
      expect(event).toMatchObject({assigned_provider_id:1,slot_state:'ASSIGNED_AVAILABLE',status:'RELEASED'});
      expect((await reserve(hour,startAt,endAt)).id).toBe(event.id);
    }
  }
  expect(await rows('office_events')).toHaveLength(371);
 },15000);
 it('reactivates a cancelled room occurrence on the same locked connection', async () => {
  await insert('office_standing_assignments',[{id:1,provider_id:1,office_location_id:7}]);
  await insert('office_events',[{id:1,room_id:4,start_at:'2099-01-01 10:00:00',end_at:'2099-01-01 11:00:00',status:'CANCELLED'}]);
  const event=await OfficeEvent.upsertSlotState({officeLocationId:7,roomId:4,startAt:'2099-01-01 10:00:00',endAt:'2099-01-01 11:00:00',
    standingAssignmentId:1,assignedProviderId:1,slotState:'ASSIGNED_AVAILABLE',createdByUserId:2,replaceCancelled:true});
  expect(event).toMatchObject({id:1,status:'RELEASED',standing_assignment_id:1,assigned_provider_id:1});
 });
 it('rolls back a reservation if reading the new event fails before commit', async () => {
  await insert('office_standing_assignments',[{id:1,provider_id:1,office_location_id:7}]);
  const read=vi.spyOn(OfficeEvent,'findById').mockRejectedValueOnce(new Error('read failure'));
  try {
    await expect(OfficeEvent.upsertSlotState({officeLocationId:7,roomId:4,startAt:'2099-01-01 10:00:00',endAt:'2099-01-01 11:00:00',
      standingAssignmentId:1,assignedProviderId:1,slotState:'ASSIGNED_AVAILABLE',createdByUserId:2})).rejects.toThrow('read failure');
    expect(await rows('office_events')).toHaveLength(0);
  } finally {read.mockRestore();}
 });
 it('refuses to materialize a stale room template immediately after archiving', async () => {
  await insert('office_standing_assignments',[{id:1,provider_id:1,office_location_id:7}]);
  await archive();
  await expect(OfficeEvent.upsertSlotState({officeLocationId:7,roomId:4,startAt:'2099-01-01 10:00:00',endAt:'2099-01-01 11:00:00',standingAssignmentId:1,assignedProviderId:1,slotState:'ASSIGNED_AVAILABLE',createdByUserId:2})).resolves.toBeNull();
  expect(await rows('office_events')).toHaveLength(0);
 });
 it('waits for an in-flight annual renewal and cancels its newly inserted occurrence', async () => {
  const renewal=await pool.getConnection();
  await renewal.query("SELECT GET_LOCK('recurring-schedule-year',2)");
  const id=await archive();const cleanup=processProviderOffboarding(id);
  await insert('provider_schedule_events',[{id:1,provider_id:1,start_at:'2099-01-01',status:'ACTIVE',recurrence_series_id:'renewed'}],renewal);
  await renewal.query("SELECT RELEASE_LOCK('recurring-schedule-year')");renewal.release();
  await cleanup;
  expect((await rows('provider_schedule_events'))[0]).toMatchObject({status:'CANCELLED',recurrence_stopped:1});
 });

 it('retries clinical mirroring without cancelling new sessions after reactivation', async () => {
  await insert('clinical_sessions',[{id:1,provider_user_id:1,scheduled_start_at:'2099-01-01',encounter_status:'scheduled',created_at:'2000-01-01'}],clinical);
  const id=await archive();
  await clinical.query('RENAME TABLE clinical_sessions TO unavailable_sessions');
  try {await expect(processProviderOffboarding(id)).rejects.toMatchObject({code:'ER_NO_SUCH_TABLE'});}
  finally {await clinical.query('RENAME TABLE unavailable_sessions TO clinical_sessions');}
  expect((await rows('provider_offboarding_jobs'))[0].schedule_cleaned_at).not.toBeNull();
  await pool.query("UPDATE users SET status='ACTIVE_EMPLOYEE',is_archived=0,is_active=1 WHERE id=1");
  await insert('clinical_sessions',[{id:2,provider_user_id:1,scheduled_start_at:'2099-01-01',encounter_status:'scheduled',created_at:'2098-01-01'}],clinical);
  await processProviderOffboarding(id);
  expect((await rows('clinical_sessions',clinical)).map(r=>r.encounter_status)).toEqual(['cancelled','scheduled']);
 });

});
