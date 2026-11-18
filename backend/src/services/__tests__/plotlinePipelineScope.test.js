import {DatabaseSync} from 'node:sqlite';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({db:null,members:[],access:vi.fn(),user:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.db(...args)}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:async()=>m.members,findById:m.user}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:m.access}));
import {loadPipelineBoard} from '../hiringPipelineBoard.service.js';
let sql;
beforeEach(()=>{
 sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE users(id INTEGER,first_name TEXT,last_name TEXT,email TEXT,personal_email TEXT,status TEXT,created_at TEXT,hired_at TEXT,is_archived INTEGER);
 CREATE TABLE agencies(id INTEGER,name TEXT,organization_type TEXT,is_active INTEGER);
 CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER);
 CREATE TABLE hiring_profiles(id INTEGER,candidate_user_id INTEGER,stage TEXT,applied_role TEXT,updated_at TEXT,job_description_id INTEGER);
 CREATE TABLE hiring_job_descriptions(id INTEGER,agency_id INTEGER,title TEXT);
 CREATE TABLE tasks(assigned_to_user_id INTEGER,assigned_to_agency_id INTEGER,task_type TEXT,document_action_type TEXT,status TEXT);
 INSERT INTO agencies VALUES(463,'Juniper','agency',1),(464,'Maple','agency',1);
 INSERT INTO users VALUES(10,'Juniper person','','j@example.test',NULL,'PREHIRE_OPEN',NULL,NULL,0),(20,'Maple person','','m@example.test',NULL,'PROSPECTIVE',NULL,NULL,0);
 INSERT INTO user_agencies VALUES(10,463),(20,464);
 INSERT INTO hiring_job_descriptions VALUES(42,463,'Juniper consultant'),(44,464,'Maple designer');
 INSERT INTO hiring_profiles VALUES(1,10,'applied',NULL,'2026-11-18',42),(2,20,'applied',NULL,'2026-11-18',44);
 INSERT INTO tasks VALUES(10,464,'document','signature','pending');`);
 m.db=async(query,args=[])=>[sql.prepare(query).all(...args)];m.members=[{id:463,name:'Juniper'},{id:464,name:'Maple'}];
 m.user.mockResolvedValue({id:1434,role:'support',status:'ACTIVE_EMPLOYEE',is_active:1});
 m.access.mockResolvedValue({role:'staff',permissions:{has_hiring_access:true}});
});
afterEach(()=>{sql.close();vi.clearAllMocks();});
it('queries and returns only the selected company including its task counts',async()=>{
 const board=await loadPipelineBoard({userId:1434,role:'support',agencyId:463});
 expect(board.agencies.map(a=>a.id)).toEqual([463]);expect(board.candidates.map(c=>c.userId)).toEqual([10]);
 expect(board.candidates[0].pendingSignatures).toBe(0);expect(board.counts.pendingSignature).toBe(0);
});
it('excludes another company even when the same candidate has membership there',async()=>{
 sql.exec('INSERT INTO user_agencies VALUES(10,464)');
 const board=await loadPipelineBoard({userId:1434,role:'support',agencyId:464});
 expect(board.candidates.find(c=>c.userId===10)?.jobTitle).not.toBe('Juniper consultant');
});
it('does not reuse one company’s hiring permission for another membership',async()=>{
 m.access.mockImplementation(async(_,id)=>({role:'staff',permissions:{has_hiring_access:id===463}}));
 const board=await loadPipelineBoard({userId:1434,role:'support'});
 expect(board.agencies.map(a=>a.id)).toEqual([463]);expect(board.candidates.map(c=>c.userId)).toEqual([10]);
});
it('does not fall back to every company for support with no memberships',async()=>{
 m.members=[];const board=await loadPipelineBoard({userId:1434,role:'support'});expect(board.candidates).toEqual([]);expect(board.agencies).toEqual([]);
});
it('returns no candidates for a company outside the operator’s memberships',async()=>{
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:999})).candidates).toEqual([]);
});
