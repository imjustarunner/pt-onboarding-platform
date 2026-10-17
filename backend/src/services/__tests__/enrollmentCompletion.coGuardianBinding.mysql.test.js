import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
const m=vi.hoisted(()=>({pool:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.pool.execute(...args)}}));
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
const socket=process.env.EVIDENCE_TEST_SOCKET;
describe.skipIf(!socket)('isolated immutable guardian enrollment binding SQL',()=>{
 let admin;const database=`guardian_binding_${crypto.randomBytes(5).toString('hex')}`;
 const oldKey=process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64;
 beforeAll(async()=>{
  admin=await mysql.createConnection({socketPath:socket,user:'root',multipleStatements:true});await admin.query(`CREATE DATABASE ${database}`);
  m.pool=mysql.createPool({socketPath:socket,user:'root',database,multipleStatements:true});
  await m.pool.query(`CREATE TABLE intake_submissions(
   id INT AUTO_INCREMENT PRIMARY KEY,intake_link_id INT,status VARCHAR(32),signer_name TEXT,signer_initials TEXT,signer_email TEXT,signer_phone TEXT,intake_data LONGTEXT,
   intake_data_hash VARCHAR(255),payload_encrypted MEDIUMBLOB,payload_iv_b64 VARCHAR(64),payload_auth_tag_b64 VARCHAR(64),payload_key_id VARCHAR(50),
   consent_given_at DATETIME,submitted_at DATETIME,ip_address VARCHAR(64),user_agent TEXT,client_id INT,guardian_user_id INT,
   combined_pdf_path TEXT,combined_pdf_hash TEXT,retention_expires_at DATETIME,session_token VARCHAR(255));`);
  await m.pool.query(await fs.readFile(new URL('../../../../database/migrations/1654_co_guardian_enrollment_binding.sql',import.meta.url),'utf8'));
  process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,11).toString('base64');
 });
 beforeEach(async()=>{await m.pool.query('DELETE FROM intake_submissions');});
 afterAll(async()=>{
  if(oldKey===undefined)delete process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64;else process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64=oldKey;
  if(m.pool)await m.pool.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.end();}
 });
 it('persists the invitation atomically at creation and retains it through encrypted autosaves',async()=>{
  const created=await IntakeSubmission.create({intakeLinkId:8,coGuardianInviteId:3,sessionToken:'synthetic-session',intakeData:{clients:[{fullName:'Synthetic Child'}]}});
  expect(created.co_guardian_invite_id).toBe(3);
  const saved=await IntakeSubmission.updateById(created.id,{intake_data:JSON.stringify({clients:[{fullName:'Updated answer'}]})});
  expect(saved.co_guardian_invite_id).toBe(3);
  const [[raw]]=await m.pool.execute('SELECT intake_data,payload_encrypted,co_guardian_invite_id FROM intake_submissions WHERE id=?',[created.id]);
  expect(raw.intake_data).toBeNull();expect(String(raw.payload_encrypted)).not.toContain('Updated answer');expect(raw.co_guardian_invite_id).toBe(3);
  await expect(IntakeSubmission.updateById(created.id,{co_guardian_invite_id:null})).rejects.toHaveProperty('status',409);
  await expect(IntakeSubmission.updateById(created.id,{co_guardian_invite_id:4})).rejects.toHaveProperty('status',409);
 });
 it('binds a legacy draft once and permits only the same invitation on retries',async()=>{
  const created=await IntakeSubmission.create({intakeLinkId:8});
  expect(created.co_guardian_invite_id).toBeNull();
  expect((await IntakeSubmission.bindCoGuardianInvite(created.id,3)).co_guardian_invite_id).toBe(3);
  expect((await IntakeSubmission.bindCoGuardianInvite(created.id,3)).co_guardian_invite_id).toBe(3);
  await expect(IntakeSubmission.bindCoGuardianInvite(created.id,4)).rejects.toHaveProperty('status',403);
  expect((await IntakeSubmission.findById(created.id)).co_guardian_invite_id).toBe(3);
 });
 it('does not let concurrent requests bind the same draft to two invitations',async()=>{
  const created=await IntakeSubmission.create({intakeLinkId:8});
  const results=await Promise.allSettled([IntakeSubmission.bindCoGuardianInvite(created.id,3),IntakeSubmission.bindCoGuardianInvite(created.id,4)]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
  expect([3,4]).toContain((await IntakeSubmission.findById(created.id)).co_guardian_invite_id);
 });
});
