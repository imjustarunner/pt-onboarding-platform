import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),findUser:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.findUser}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async id=>({id,name:'Synthetic company',slug:'qa-company'})}}));
vi.mock('../hireCandidateProgress.service.js',()=>({candidatePrehireProgress:async()=>({total:0,completed:0,percent:0})}));
import { getCandidate, listCandidates, listPrehireCandidates, listOnboardingCandidates } from '../../controllers/hiring.controller.js';
import { hiringSqliteRead } from './hiringSqliteDialect.js';
let db;
beforeEach(()=>{
 vi.clearAllMocks();db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id INTEGER,first_name TEXT,last_name TEXT,email TEXT,personal_email TEXT,phone_number TEXT,role TEXT,status TEXT,hired_at TEXT,created_at TEXT,is_archived INTEGER,is_active INTEGER,work_email TEXT,passwordless_token TEXT,passwordless_token_expires_at TEXT);
 CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER);
 CREATE TABLE agencies(id INTEGER,organization_type TEXT);
 CREATE TABLE hiring_profiles(id INTEGER,candidate_user_id INTEGER,job_description_id INTEGER,stage TEXT,source TEXT,applied_role TEXT,created_at TEXT,updated_at TEXT,interview_date TEXT);
 CREATE TABLE hiring_job_descriptions(id INTEGER,agency_id INTEGER,title TEXT);
 CREATE TABLE hire_journeys(user_id INTEGER,agency_id INTEGER,onboarding_started_at TEXT,onboarding_completed_at TEXT);
 CREATE TABLE hiring_candidate_views(agency_id INTEGER,candidate_user_id INTEGER,viewer_user_id INTEGER,first_viewed_at TEXT);
 CREATE TABLE intake_links(id INTEGER,organization_id INTEGER,form_type TEXT);
 CREATE TABLE intake_submissions(intake_link_id INTEGER,guardian_user_id INTEGER,status TEXT,submitted_at TEXT,created_at TEXT);
 CREATE TABLE tasks(assigned_to_user_id INTEGER,task_type TEXT,document_action_type TEXT,metadata TEXT,status TEXT,due_date TEXT);
 INSERT INTO users(id,first_name,email,role,status,is_archived,is_active) VALUES(10,'Synthetic portal','portal@example.test','client_guardian','PENDING_SETUP',0,1),(20,'Synthetic applicant','applicant@example.test','client_guardian','PENDING_SETUP',0,1),(30,'Synthetic hire','hire@example.test','staff','PENDING_SETUP',0,1),(40,'Synthetic onboarding portal','portal2@example.test','client','ONBOARDING',0,1);
 INSERT INTO user_agencies VALUES(10,463),(20,463),(20,464),(30,463),(40,463);
 INSERT INTO agencies VALUES(463,'agency'),(464,'agency');
 INSERT INTO hiring_job_descriptions VALUES(42,463,'QA Consultant');
 INSERT INTO hiring_profiles VALUES(1,20,42,'applied','job_application_link',NULL,'2026-11-23','2026-11-23',NULL);
 UPDATE users SET hired_at='2026-11-23' WHERE id=30;`);
 m.execute.mockImplementation(async(sql,args=[])=>[db.prepare(hiringSqliteRead(sql)).all(...args)]);
});
afterEach(()=>db.close());
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const request=(query={})=>({method:'GET',user:{id:1434,role:'support'},query:{agencyId:'463',...query},params:{}});
it.each([{stageFilter:'applied'},{status:'PENDING_SETUP'},{stageFilter:'all'},{}])('excludes guardian-only accounts from applicant filters %j while keeping their actual application',async query=>{
 const res=response(),next=vi.fn();await listCandidates(request(query),res,next);
 expect(next).not.toHaveBeenCalled();
 const ids=res.json.mock.calls[0][0].map(person=>person.id);
 expect(ids).toContain(20);expect(ids).not.toContain(10);expect(ids).not.toContain(40);
});
it('denies a direct hiring-chart link for a guardian-only account before reading its profile',async()=>{
 const req=request();req.params.userId='10';const res=response(),next=vi.fn();
 await getCandidate(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(404);expect(m.findUser).not.toHaveBeenCalled();
});
it('does not borrow a candidate’s job in another agency for direct hiring access',async()=>{
 const req=request({agencyId:'464'});req.params.userId='20';const res=response();
 await getCandidate(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(m.findUser).not.toHaveBeenCalled();
});
it('keeps a legacy hired staff member in pre-hire and excludes portal-only accounts',async()=>{
 const res=response(),next=vi.fn();await listPrehireCandidates(request(),res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].map(person=>person.id)).toEqual([30]);
});
it('excludes portal setup from onboarding even if it has an onboarding-like global status',async()=>{
 const res=response(),next=vi.fn();await listOnboardingCandidates(request(),res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith([]);
});
it('does not alter any family account or membership while cleaning the hiring views',async()=>{
 const before=db.prepare('SELECT * FROM users ORDER BY id').all();
 const memberships=db.prepare('SELECT * FROM user_agencies ORDER BY user_id,agency_id').all();
 for(const handler of [listCandidates,listPrehireCandidates,listOnboardingCandidates])await handler(request(),response(),vi.fn());
 expect(db.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(before);
 expect(db.prepare('SELECT * FROM user_agencies ORDER BY user_id,agency_id').all()).toEqual(memberships);
});
