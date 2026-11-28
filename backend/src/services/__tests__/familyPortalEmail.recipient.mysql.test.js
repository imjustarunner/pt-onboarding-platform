import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {writeFile} from 'node:fs/promises';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
const m=vi.hoisted(()=>({db:null,emails:new Map(),denied:new Set()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.db.execute(...args)},onTableWrite:()=>()=>{}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../sessionNotification.service.js',()=>({
 loadClientConsent:async(_client,_agency,user)=>({email:!m.denied.has(user),emailAddress:m.emails.get(user)}),
 getClientPreferences:async()=>({channels:{email:true},optionalRemindersEnabled:true,confirmationRequestsEnabled:true})
}));
vi.mock('../clientPortalEmail.service.js',()=>({
 clientEmailContext:async()=>({tenant:{name:'Synthetic agency'},brand:{},url:path=>'https://example.test/agency/'+path}),
 sendClientPortalEmail:vi.fn()
}));
import {createAppointmentEmailLink,buildAppointmentEmail} from '../appointmentEmailActions.service.js';
let fixture;
const appointment={id:44,agencyId:2,startAt:'2099-01-02T20:00:00Z',endAt:'2099-01-02T21:00:00Z',status:'scheduled'};
const input=(user,overrides={})=>({appointment,clientId:22,to:m.emails.get(user),guardianUserId:user,
 context:{tenant:{name:'Synthetic agency'},brand:{},url:path=>'https://example.test/agency/'+path},...overrides});
beforeAll(async()=>{
 if(!recoveryMysqlEnabled)return;
 fixture=await isolatedWorkflowMysql('rsvp_recipient');m.db=fixture.db;
 for(const sql of [
  'CREATE TABLE users(id INT PRIMARY KEY,email VARCHAR(255),is_active BOOL,is_archived BOOL,terminated_at DATETIME,status_expires_at DATETIME)',
  'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,date_of_birth DATE,guardian_portal_enabled BOOL,status VARCHAR(30),onboarding_docs_json JSON)',
  'CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,relationship_type VARCHAR(30),permissions_json JSON,access_enabled BOOL,created_at DATETIME)',
  'CREATE TABLE appointment_participants(id INT PRIMARY KEY,appointment_id INT,client_id INT)',
  'CREATE TABLE dependent_portal_access(client_id INT,user_id INT,revoked_at DATETIME)',
  'CREATE TABLE appointment_email_actions(token_hash CHAR(64) PRIMARY KEY,appointment_id INT,agency_id INT,client_id INT,guardian_user_id INT,recipient_hash CHAR(64),appointment_start DATETIME,appointment_end DATETIME,expires_at DATETIME)'
 ])await m.db.query(sql);
});
beforeEach(async()=>{
 if(!recoveryMysqlEnabled)return;
 for(const table of ['appointment_email_actions','dependent_portal_access','appointment_participants','client_guardians','clients','users'])await m.db.query('DELETE FROM '+table);
 m.emails=new Map([[10,'secondary@example.test'],[20,'primary@example.test']]);m.denied=new Set();
 await m.db.query("INSERT INTO users VALUES(10,'secondary@example.test',1,0,NULL,NULL),(20,'primary@example.test',1,0,NULL,NULL)");
 await m.db.query("INSERT INTO clients VALUES(22,2,'2014-01-01',1,'CURRENT',JSON_OBJECT('paperProcessing',JSON_OBJECT('guardian1Id',20)))");
 await m.db.query("INSERT INTO client_guardians VALUES(22,10,'parent',JSON_OBJECT(),1,'2020-01-01'),(22,20,'parent',JSON_OBJECT(),1,'2025-01-01')");
 await m.db.query('INSERT INTO appointment_participants VALUES(11,44,22)');
});
afterAll(async()=>{await fixture?.close();});
const test=recoveryMysqlEnabled?it:it.skip;
test('uses the actual paperwork primary even when another guardian was linked and emailed first',async()=>{
 expect(await createAppointmentEmailLink(input(10))).toBeNull();expect(await createAppointmentEmailLink(input(20))).toBeTruthy();
 expect((await m.db.query('SELECT guardian_user_id FROM appointment_email_actions'))[0]).toEqual([{guardian_user_id:20}]);
 if(process.env.RSVP_EMAIL_PREVIEW_DIR){
  for(const [name,user] of [['primary',20],['secondary',10]]){
   const content=await buildAppointmentEmail({...input(user),kind:'confirmation'});
   await writeFile(process.env.RSVP_EMAIL_PREVIEW_DIR+'/'+name+'.html',content.html);
  }
 }
});
test('falls back when the primary has no email consent',async()=>{
 m.denied.add(20);expect(await createAppointmentEmailLink(input(10))).toBeTruthy();
 expect((await m.db.query('SELECT guardian_user_id FROM appointment_email_actions'))[0]).toEqual([{guardian_user_id:10}]);
});
test('withholds response capability from a shared email address',async()=>{
 await m.db.query("UPDATE users SET email='secondary@example.test' WHERE id=20");
 expect(await createAppointmentEmailLink(input(10))).toBeNull();expect((await m.db.query('SELECT * FROM appointment_email_actions'))[0]).toHaveLength(0);
});
test('rejects a recipient whose supplied guardian identity does not match',async()=>{
 expect(await createAppointmentEmailLink(input(20,{guardianUserId:10}))).toBeNull();
 expect((await m.db.query('SELECT * FROM appointment_email_actions'))[0]).toHaveLength(0);
});
test('excludes revoked portal access before selecting the next eligible guardian',async()=>{
 await m.db.query('INSERT INTO dependent_portal_access VALUES(22,20,UTC_TIMESTAMP())');
 expect(await createAppointmentEmailLink(input(10))).toBeTruthy();
 expect((await m.db.query('SELECT guardian_user_id FROM appointment_email_actions'))[0]).toEqual([{guardian_user_id:10}]);
});
test('does not mint a capability for a different agency',async()=>{
 expect(await createAppointmentEmailLink(input(20,{appointment:{...appointment,agencyId:3}}))).toBeNull();
 expect((await m.db.query('SELECT * FROM appointment_email_actions'))[0]).toHaveLength(0);
});
test('selects an adult client’s self relationship ahead of the former guardian',async()=>{
 await m.db.query("UPDATE clients SET date_of_birth='1990-01-01' WHERE id=22");
 await m.db.query("INSERT INTO users VALUES(30,'self@example.test',1,0,NULL,NULL)");
 await m.db.query("INSERT INTO client_guardians VALUES(22,30,'self',JSON_OBJECT(),1,'2026-01-01')");m.emails.set(30,'self@example.test');
 expect(await createAppointmentEmailLink(input(20))).toBeNull();expect(await createAppointmentEmailLink(input(30))).toBeTruthy();
 expect((await m.db.query('SELECT guardian_user_id FROM appointment_email_actions'))[0]).toEqual([{guardian_user_id:30}]);
});
