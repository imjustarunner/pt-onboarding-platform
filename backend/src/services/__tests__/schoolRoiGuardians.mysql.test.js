import { beforeAll, afterAll, beforeEach, expect, it, describe, vi } from 'vitest';
import fs from 'node:fs/promises';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
const m=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.db.execute(...args),getConnection:()=>m.db.getConnection()}}));
import { recordGuardianRoiConsent, loadGuardianRoiConsent } from '../schoolRoiGuardianConsent.service.js';
import { prepareGuardianConsentUpdates } from '../guardianConsentUpdateRequests.service.js';
import SigningLink from '../../models/ClientSchoolRoiSigningLink.model.js';
const guardians=[{guardian_user_id:1,access_enabled:1},{guardian_user_id:2,access_enabled:1}];
describe.skipIf(!recoveryMysqlEnabled)('guardian consent with isolated SQL transactions',()=>{
 let fixture;
 const migration=async name=>{const text=await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');for(const sql of text.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await m.db.query(sql);};
 beforeAll(async()=>{
  fixture=await isolatedWorkflowMysql('school_guardians_test');m.db=fixture.db;
  await migration('541_school_roi_signing_links.sql');await migration('547_client_school_roi_signing_link_payloads.sql');await migration('554_roi_signing_link_email_tracking.sql');await migration('1752_client_update_workflows.sql');
  await m.db.execute("INSERT INTO client_school_roi_signing_links(client_id,school_organization_id,intake_link_id,public_key,status,signed_at) VALUES(10,20,30,'existing-signed','completed','2026-11-07')");
  await migration('1776_school_roi_guardian_decisions.sql');
  for(const sql of [
   'CREATE TABLE clients(id INT PRIMARY KEY)',
   'CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(50),last_name VARCHAR(50))',
   'CREATE TABLE intake_links(id INT PRIMARY KEY,organization_id INT,title VARCHAR(100),language_code VARCHAR(4))',
   'CREATE TABLE intake_submissions(id INT PRIMARY KEY,intake_link_id INT,guardian_user_id INT)',
   'CREATE TABLE intake_submission_documents(id INT PRIMARY KEY,client_id INT,intake_submission_id INT,signed_at DATETIME,audit_trail JSON)',
   'CREATE TABLE document_templates(id INT PRIMARY KEY,agency_id INT,document_type VARCHAR(40))',
   'CREATE TABLE fixture_access(staff_id INT PRIMARY KEY,access_state VARCHAR(20))',
   'INSERT INTO clients VALUES(10)',
   "INSERT INTO users VALUES(1,'First','Guardian'),(2,'Second','Guardian')",
   "INSERT INTO intake_links VALUES(30,20,'School release','en')",
   "INSERT INTO document_templates VALUES(50,40,'disclosure'),(51,40,'other')"
  ])await m.db.query(sql);
 });
 afterAll(async()=>{if(fixture)await fixture.close();});
 beforeEach(async()=>{for(const table of ['client_school_roi_guardian_decisions','intake_submission_documents','intake_submissions','fixture_access','client_update_items','client_update_requests'])await m.db.query(`DELETE FROM ${table}`);});
 const record=(guardianUserId,decision,submissionId=guardianUserId)=>recordGuardianRoiConsent({clientId:10,schoolOrganizationId:20,guardianUserId,submissionId,response:{staffDecisions:[{schoolStaffUserId:90,decision}]},db:m.db,loadGuardians:async()=>guardians,applyState:async({schoolStaffUserId,nextState,db})=>db.execute('INSERT INTO fixture_access VALUES(?,?) ON DUPLICATE KEY UPDATE access_state=VALUES(access_state)',[schoolStaffUserId,nextState])});
 it('preserves the old completed link and creates two independent guardian links',async()=>{
  const old=await SigningLink.findForClient({clientId:10,schoolOrganizationId:20});expect(old.status).toBe('completed');expect(old.public_key).toBe('existing-signed');
  const a=await SigningLink.issueForClient({clientId:10,schoolOrganizationId:20,intakeLinkId:30,publicKey:'first-guardian',recipientGuardianUserId:1});
  const b=await SigningLink.issueForClient({clientId:10,schoolOrganizationId:20,intakeLinkId:30,publicKey:'second-guardian',recipientGuardianUserId:2});
  expect(a.id).not.toBe(b.id);await SigningLink.markCompleted({id:a.id,intakeSubmissionId:1,signedAt:new Date()});expect((await SigningLink.findById(b.id)).status).toBe('issued');
 });
 it('serializes concurrent guardian responses so an approval cannot overwrite a denial',async()=>{
  await Promise.all([record(1,'none'),record(2,'roi_docs')]);
  const [[state]]=await m.db.query('SELECT * FROM fixture_access');expect(state.access_state).toBe('packet');
  const consent=await loadGuardianRoiConsent({clientId:10,schoolOrganizationId:20,db:m.db});expect(consent[0]).toMatchObject({effectiveDecision:'none',conflict:true});expect(consent[0].decisions).toHaveLength(2);
 });
 it('uses one signed permission while another is pending, and retains historical signed denials',async()=>{
  await record(1,'roi_docs');expect((await loadGuardianRoiConsent({clientId:10,schoolOrganizationId:20,db:m.db}))[0].effectiveDecision).toBe('roi_docs');
  await m.db.query('INSERT INTO intake_submissions VALUES(99,30,2)');
  await m.db.execute('INSERT INTO intake_submission_documents VALUES(99,10,99,UTC_TIMESTAMP(),?)',[JSON.stringify({smartSchoolRoi:true,roiResponse:{staffDecisions:[{schoolStaffUserId:90,decision:'none'}]}})]);
  expect((await loadGuardianRoiConsent({clientId:10,schoolOrganizationId:20,db:m.db}))[0].effectiveDecision).toBe('none');
 });
 it('creates only one disclosure request per guardian under concurrent retries',async()=>{
  const [insert]=await m.db.execute("INSERT INTO client_update_requests(agency_id,client_id,status) VALUES(40,10,'draft')");
  const request={id:insert.insertId,agency_id:40,client_id:10};
  await m.db.execute("INSERT INTO client_update_items(request_id,item_type,reference_key,title) VALUES(?,'document','50','Disclosure')",[request.id]);
  const args={request,items:[{item_type:'document',reference_key:'50',title:'Disclosure'},{item_type:'document',reference_key:'51',title:'Other form'}],primaryGuardianUserId:1,db:m.db,loadGuardians:async()=>guardians};
  await Promise.all([prepareGuardianConsentUpdates(args),prepareGuardianConsentUpdates(args)]);
  const [rows]=await m.db.query('SELECT * FROM client_update_requests');expect(rows).toHaveLength(2);expect(new Set(rows.map(row=>row.guardian_user_id))).toEqual(new Set([1,2]));
  const [items]=await m.db.query('SELECT * FROM client_update_items');expect(items).toHaveLength(2);expect(items.every(item=>item.reference_key==='50')).toBe(true);
 });
});
