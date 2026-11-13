import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
import fs from 'node:fs';
const m=vi.hoisted(()=>({pool:null,email:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.pool.execute(...args),getConnection:()=>m.pool.getConnection()}}));
vi.mock('../coGuardianInvite.service.js',()=>({emailCoGuardianInvite:m.email,invitePublicUrl:()=> 'https://example.test/private',insertGuardianAccessTicket:vi.fn()}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async id=>({id,name:'Synthetic'})}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async id=>(await m.pool.execute('SELECT * FROM users WHERE id=?',[id]))[0][0],findByEmail:async email=>(await m.pool.execute('SELECT * FROM users WHERE LOWER(email)=?',[email]))[0][0]}}));
import {runGuardianInvitationReminders} from '../coGuardianDelivery.service.js';
describe.skipIf(!recoveryMysqlEnabled)('durable guardian reminder delivery',()=>{
 let fixture;
 const batch=async sql=>{for(const part of sql.replace(/^\s*--.*$/gm,'').split(';').filter(value=>value.trim()))await m.pool.query(part);};
 beforeAll(async()=>{
  fixture=await isolatedWorkflowMysql('guardian_reminders');m.pool=fixture.db;
  await batch(`CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(32),email VARCHAR(255),is_active TINYINT,is_archived TINYINT DEFAULT 0,status VARCHAR(32));
   CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,date_of_birth DATE);
   CREATE TABLE intake_submissions(id INT PRIMARY KEY,intake_link_id INT,co_guardian_invite_id INT,session_token VARCHAR(80),status VARCHAR(24),submitted_at DATETIME,updated_at DATETIME,draft_expires_at DATETIME,retention_expires_at DATETIME);
   CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled INT,permissions_json JSON);
   CREATE TABLE co_guardian_invites(id INT PRIMARY KEY,agency_id INT,status VARCHAR(24),invited_email VARCHAR(255),invited_first_name VARCHAR(64),invited_by_user_id INT,public_key VARCHAR(100),source VARCHAR(24),token_hash VARCHAR(64),expires_at DATETIME);
   CREATE TABLE co_guardian_invite_clients(invite_id INT,client_id INT);
   CREATE TABLE intake_links(id INT,public_key VARCHAR(100),is_active INT,create_guardian INT,master_channel VARCHAR(24),scope_type VARCHAR(24),organization_id INT);`);
  await batch(fs.readFileSync(new URL('../../../../database/migrations/1643_co_guardian_invite_delivery.sql',import.meta.url),'utf8'));
  await batch(fs.readFileSync(new URL('../../../../database/migrations/1701_guardian_invitation_reminders.sql',import.meta.url),'utf8'));
 });
 beforeEach(async()=>{
  vi.clearAllMocks();m.email.mockImplementation(async()=>{await new Promise(resolve=>setTimeout(resolve,20));return {sent:true,communicationId:9};});
  await batch(`DELETE FROM co_guardian_invite_reminders;DELETE FROM co_guardian_invite_deliveries;DELETE FROM co_guardian_invite_clients;DELETE FROM co_guardian_invites;DELETE FROM clients;DELETE FROM intake_links;DELETE FROM client_guardians;DELETE FROM intake_submissions;DELETE FROM users;
   INSERT INTO users(id,role,email,is_active,status) VALUES(8,'client_guardian','parent@example.test',1,'ACTIVE'),(10,'client_guardian','other@example.test',1,'ACTIVE');
   INSERT INTO clients VALUES(5,2,'2016-01-01');INSERT INTO co_guardian_invite_clients VALUES(3,5);INSERT INTO client_guardians VALUES(5,8,1,'{}'),(5,10,1,'{"noView":true,"noViewOtherGuardian":true,"coGuardianInviteRestricted":true,"coGuardianInviteId":3}');
   INSERT INTO co_guardian_invites VALUES(3,2,'pending','other@example.test','Jamie',8,'packet','school','old',DATE_ADD(NOW(),INTERVAL 14 DAY));
   INSERT INTO intake_links VALUES(7,'packet',1,1,'counseling','agency',2);
   INSERT INTO co_guardian_invite_deliveries(invite_id,recipient_email,delivery_status,created_at) VALUES(3,'other@example.test','sent',DATE_SUB(NOW(),INTERVAL 3 DAY));
   INSERT INTO co_guardian_invite_reminders(invite_id,recipient_email,first_sent_at,next_due_at) VALUES(3,'other@example.test',DATE_SUB(NOW(),INTERVAL 3 DAY),DATE_SUB(NOW(),INTERVAL 1 DAY));`);
 });
 afterAll(async()=>{if(fixture)await fixture.close();});
 it('sends one school reminder across simultaneous worker ticks and records its history',async()=>{
  await Promise.all([runGuardianInvitationReminders(),runGuardianInvitationReminders()]);
  expect(m.email).toHaveBeenCalledTimes(1);expect(m.email).toHaveBeenCalledWith(expect.objectContaining({school:true,reminder:true,to:'other@example.test'}));
  const [[schedule]]=await m.pool.query('SELECT * FROM co_guardian_invite_reminders');expect(schedule.reminders_attempted).toBe(1);
  const [[delivery]]=await m.pool.query('SELECT * FROM co_guardian_invite_deliveries ORDER BY id DESC LIMIT 1');expect(delivery).toMatchObject({delivery_kind:'reminder',automatic_reminder:1,delivery_status:'sent'});
  await runGuardianInvitationReminders();expect(m.email).toHaveBeenCalledTimes(1);
 });
 it('does not send for completed enrollment or enroll old invitations without an explicit schedule',async()=>{
  await m.pool.query("UPDATE co_guardian_invites SET status='accepted'");await runGuardianInvitationReminders();expect(m.email).not.toHaveBeenCalled();
  await batch("UPDATE co_guardian_invites SET status='pending';DELETE FROM co_guardian_invite_reminders");await runGuardianInvitationReminders();expect(m.email).not.toHaveBeenCalled();
 });
 it('holds uncertain transport rather than sending duplicate reminders on retry',async()=>{
  m.email.mockRejectedValueOnce(new Error('Transport interrupted'));
  await runGuardianInvitationReminders();await runGuardianInvitationReminders();expect(m.email).toHaveBeenCalledTimes(1);
  const [[schedule]]=await m.pool.query('SELECT * FROM co_guardian_invite_reminders');expect(schedule.state).toBe('held');
 });
 it('caps automatic reminders at two',async()=>{
  await m.pool.query('UPDATE co_guardian_invite_reminders SET reminders_attempted=1');
  await runGuardianInvitationReminders();await runGuardianInvitationReminders();expect(m.email).toHaveBeenCalledTimes(1);
  const [[schedule]]=await m.pool.query('SELECT * FROM co_guardian_invite_reminders');expect(schedule).toMatchObject({state:'complete',reminders_attempted:2,next_due_at:null});
 });
 it('stops if the first guardian loses access before a reminder is due',async()=>{
  await m.pool.query('UPDATE client_guardians SET access_enabled=0');await runGuardianInvitationReminders();expect(m.email).not.toHaveBeenCalled();
  const [[schedule]]=await m.pool.query('SELECT * FROM co_guardian_invite_reminders');expect(schedule.state).toBe('held');
 });
 it('holds automatic outreach when the existing recipient account is suspended',async()=>{
  await m.pool.query("UPDATE users SET status='SUSPENDED' WHERE id=10");await runGuardianInvitationReminders();expect(m.email).not.toHaveBeenCalled();
  const [[schedule]]=await m.pool.query('SELECT state,reminders_attempted FROM co_guardian_invite_reminders');expect(schedule).toMatchObject({state:'held',reminders_attempted:0});
 });
 it('holds automatic outreach after explicit target no-contact/revocation, preserving its prior sent history',async()=>{
  await m.pool.query(`UPDATE client_guardians SET permissions_json='{"noContact":true,"coGuardianInviteId":3}' WHERE guardian_user_id=10`);
  await runGuardianInvitationReminders();expect(m.email).not.toHaveBeenCalled();
  const [[schedule]]=await m.pool.query('SELECT state,reminders_attempted FROM co_guardian_invite_reminders');expect(schedule).toMatchObject({state:'held',reminders_attempted:0});
  const [[history]]=await m.pool.query('SELECT COUNT(*) AS n FROM co_guardian_invite_deliveries');expect(Number(history.n)).toBe(1);
 });

});
