import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
const m=vi.hoisted(()=>({pool:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.pool.execute(...args)}}));
vi.mock('../coGuardianInvite.service.js',()=>({emailCoGuardianInvite:vi.fn(),invitePublicUrl:vi.fn(),insertGuardianAccessTicket:vi.fn()}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
import {listGuardianInvitations,assertInvitationOwner} from '../coGuardianDelivery.service.js';
const socket=process.env.EVIDENCE_TEST_SOCKET;
describe.skipIf(!socket)('isolated guardian invitation status SQL',()=>{
 let admin;const database=`guardian_invite_status_${crypto.randomBytes(5).toString('hex')}`;
 beforeAll(async()=>{
  admin=await mysql.createConnection({socketPath:socket,user:'root',multipleStatements:true});await admin.query(`CREATE DATABASE ${database}`);
  m.pool=mysql.createPool({socketPath:socket,user:'root',database,multipleStatements:true});
  await m.pool.query(`CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,guardian_portal_enabled TINYINT,date_of_birth DATE);
   CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled TINYINT,permissions_json TEXT);
   CREATE TABLE co_guardian_invites(id INT PRIMARY KEY,agency_id INT,invited_by_user_id INT,invited_email VARCHAR(255),status VARCHAR(32),source VARCHAR(32),created_at DATETIME,expires_at DATETIME,accepted_at DATETIME,accepted_user_id INT);
   CREATE TABLE co_guardian_invite_clients(invite_id INT,client_id INT);
   CREATE TABLE co_guardian_invite_deliveries(id INT PRIMARY KEY,invite_id INT,created_at DATETIME,delivery_status VARCHAR(32),failure_kind VARCHAR(32));`);
 });
 beforeEach(async()=>{
  await m.pool.query(`DELETE FROM co_guardian_invite_deliveries;DELETE FROM co_guardian_invite_clients;DELETE FROM co_guardian_invites;DELETE FROM client_guardians;DELETE FROM clients;
   INSERT INTO clients VALUES(5,2,1,'2015-01-01');INSERT INTO client_guardians VALUES(5,9,1,'{}');
   INSERT INTO co_guardian_invites VALUES(18,2,501,'other@example.test','pending','office','2026-10-01','2026-11-01',NULL,NULL);
   INSERT INTO co_guardian_invite_clients VALUES(18,5);
   INSERT INTO co_guardian_invite_deliveries VALUES(21,18,'2026-10-01','failed','send_failed'),(22,18,'2026-10-02','sent',NULL);`);
 });
 afterAll(async()=>{if(m.pool)await m.pool.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.end();}});
 it('shows a staff-created invitation’s latest progress to the linked guardian with a masked email',async()=>{
  const [row]=await listGuardianInvitations({userId:9,agencyId:2});
  expect(row).toMatchObject({id:18,email:'o•••@•••',canManage:false,deliveryStatus:'sent',deliveryAttempts:2,accountConnected:0});
  expect(row.lastSentAt).toBeTruthy();expect(row.invitedAt).toBeTruthy();
  expect(JSON.stringify(row)).not.toContain('other@example.test');
  const [[invite]]=await m.pool.query('SELECT * FROM co_guardian_invites WHERE id=18');
  await expect(assertInvitationOwner({invite,userId:9,agencyId:2,db:m.pool})).rejects.toHaveProperty('status',404);
  expect(invite.invited_by_user_id).toBe(501);
 });
 it('shows accepted and account-connected status while keeping the original inviter’s controls separate',async()=>{
  await m.pool.query("UPDATE co_guardian_invites SET status='accepted',accepted_at='2026-10-03',accepted_user_id=10 WHERE id=18");
  expect((await listGuardianInvitations({userId:9,agencyId:2}))[0]).toMatchObject({status:'accepted',accountConnected:1,canManage:false});
  await m.pool.query("UPDATE co_guardian_invites SET status='pending',invited_by_user_id=9 WHERE id=18");
  expect((await listGuardianInvitations({userId:9,agencyId:2}))[0]).toMatchObject({email:'other@example.test',canManage:true});
 });
 it('does not reveal invitation status to another guardian or agency',async()=>{
  expect(await listGuardianInvitations({userId:10,agencyId:2})).toEqual([]);
  expect(await listGuardianInvitations({userId:9,agencyId:3})).toEqual([]);
 });
 it('hides revoked, no-view, malformed-permission, disabled-portal, and adult relationships',async()=>{
  for(const permissions of ['{"noView":true}','{"noViewOtherGuardian":true}','{','[]']){
   await m.pool.execute('UPDATE client_guardians SET permissions_json=?',[permissions]);
   expect(await listGuardianInvitations({userId:9,agencyId:2})).toEqual([]);
  }
  await m.pool.query("UPDATE client_guardians SET permissions_json='{}',access_enabled=0");
  expect(await listGuardianInvitations({userId:9,agencyId:2})).toEqual([]);
  await m.pool.query('UPDATE client_guardians SET access_enabled=1;UPDATE clients SET guardian_portal_enabled=0');
  expect(await listGuardianInvitations({userId:9,agencyId:2})).toEqual([]);
  await m.pool.query("UPDATE clients SET guardian_portal_enabled=1,date_of_birth='1990-01-01'");
  expect(await listGuardianInvitations({userId:9,agencyId:2})).toEqual([]);
 });
});
