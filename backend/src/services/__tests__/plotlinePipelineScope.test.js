import {DatabaseSync} from 'node:sqlite';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({db:null,members:[],access:vi.fn(),user:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.db(...args)}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:async()=>m.members,findById:m.user}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:m.access}));
import {loadPipelineBoard} from '../hiringPipelineBoard.service.js';
import {hiringSqliteRead} from './hiringSqliteDialect.js';
let sql;
beforeEach(()=>{
 sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE users(id INTEGER,first_name TEXT,last_name TEXT,email TEXT,personal_email TEXT,status TEXT,created_at TEXT,hired_at TEXT,is_archived INTEGER);
 ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'provider';
 CREATE TABLE agencies(id INTEGER,name TEXT,organization_type TEXT,is_active INTEGER);
 CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER);
 CREATE TABLE hiring_profiles(id INTEGER,candidate_user_id INTEGER,stage TEXT,applied_role TEXT,updated_at TEXT,job_description_id INTEGER);
 CREATE TABLE hiring_job_descriptions(id INTEGER,agency_id INTEGER,title TEXT);
 CREATE TABLE tasks(assigned_to_user_id INTEGER,assigned_to_agency_id INTEGER,task_type TEXT,document_action_type TEXT,status TEXT);
 ALTER TABLE tasks ADD COLUMN metadata TEXT;
 CREATE TABLE hire_journeys(user_id INTEGER,agency_id INTEGER);
 INSERT INTO agencies VALUES(463,'Juniper','agency',1),(464,'Maple','agency',1);
 INSERT INTO users(id,first_name,last_name,email,personal_email,status,created_at,hired_at,is_archived) VALUES(10,'Juniper person','','j@example.test',NULL,'PREHIRE_OPEN',NULL,NULL,0),(20,'Maple person','','m@example.test',NULL,'PROSPECTIVE',NULL,NULL,0);
 INSERT INTO user_agencies VALUES(10,463),(20,464);
 INSERT INTO hiring_job_descriptions VALUES(42,463,'Juniper consultant'),(44,464,'Maple designer');
 INSERT INTO hiring_profiles VALUES(1,10,'applied',NULL,'2026-11-18',42),(2,20,'applied',NULL,'2026-11-18',44);
 INSERT INTO tasks(assigned_to_user_id,assigned_to_agency_id,task_type,document_action_type,status) VALUES(10,464,'document','signature','pending');`);
 m.db=async(query,args=[])=>[sql.prepare(hiringSqliteRead(query)).all(...args)];m.members=[{id:463,name:'Juniper'},{id:464,name:'Maple'}];
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
 expect(board.candidates.some(c=>c.userId===10)).toBe(false);
});

it.each(['client_guardian','guardian','client','parent','school_staff','school_admin','athlete',''])('excludes setup-only %s accounts from every bucket and leaves the original rows intact',async role=>{
 const insert=sql.prepare('INSERT INTO users(id,first_name,role,status,is_archived) VALUES(?,?,?,?,0)');
 for(const [i,status]of ['PROSPECTIVE','PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING'].entries()){
  insert.run(30+i,'Synthetic portal account',role,status);sql.prepare('INSERT INTO user_agencies VALUES(?,463)').run(30+i);
  sql.prepare("INSERT INTO tasks(assigned_to_user_id,assigned_to_agency_id,task_type,document_action_type,status) VALUES(?,463,'document','signature','pending')").run(30+i);
 }
 const before=sql.prepare('SELECT * FROM users WHERE id>=30 ORDER BY id').all();
 const board=await loadPipelineBoard({userId:1434,role:'support',agencyId:463});
 expect(board.candidates.map(c=>c.userId)).toEqual([10]);expect(Object.values(board.counts).reduce((a,b)=>a+b,0)).toBe(1);
 expect(sql.prepare('SELECT * FROM users WHERE id>=30 ORDER BY id').all()).toEqual(before);
});

it('does not infer a hire from a workforce setup status without hiring evidence',async()=>{
 sql.exec("INSERT INTO users(id,first_name,role,status,is_archived) VALUES(30,'Synthetic staff invite','staff','PENDING_SETUP',0);INSERT INTO user_agencies VALUES(30,463)");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates.some(c=>c.userId===30)).toBe(false);
 sql.exec("UPDATE users SET hired_at='2026-11-23' WHERE id=30");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates.find(c=>c.userId===30)?.bucket).toBe('inPrehire');
});

it.each(['PROSPECTIVE','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING'])('preserves explicit legacy workforce %s without inventing a historical hired_at value',async status=>{
 sql.prepare("INSERT INTO users(id,first_name,role,status,is_archived) VALUES(30,'Synthetic legacy workforce','staff',?,0)").run(status);
 sql.exec('INSERT INTO user_agencies VALUES(30,463)');
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates.some(c=>c.userId===30)).toBe(true);
 expect(sql.prepare('SELECT hired_at FROM users WHERE id=30').get().hired_at).toBeNull();
});

it('does not confuse an affiliated school with a second hiring company for a legacy hire',async()=>{
 sql.exec("INSERT INTO agencies VALUES(465,'Synthetic school','school',1);INSERT INTO users(id,first_name,role,status,hired_at,is_archived) VALUES(30,'Synthetic legacy hire','provider','PENDING_SETUP','2026-11-23',0);INSERT INTO user_agencies VALUES(30,463),(30,465)");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates.some(c=>c.userId===30)).toBe(true);
});

it('keeps a genuine guardian applicant but excludes clinical documents from their hiring counts',async()=>{
 sql.exec("INSERT INTO users(id,first_name,role,status,is_archived) VALUES(30,'Synthetic guardian applicant','client_guardian','PENDING_SETUP',0);INSERT INTO user_agencies VALUES(30,463);INSERT INTO hiring_profiles VALUES(3,30,'applied',NULL,'2026-11-23',42)");
 sql.exec("INSERT INTO tasks VALUES(30,463,'document','signature','pending',NULL)");
 let board=await loadPipelineBoard({userId:1434,role:'support',agencyId:463});
 expect(board.candidates.find(c=>c.userId===30)).toMatchObject({bucket:'newApplicants',pendingDocs:0,pendingSignatures:0});
 sql.exec(`INSERT INTO tasks VALUES(30,463,'document','signature','pending','{"portalPhase":"pre_hire"}')`);
 board=await loadPipelineBoard({userId:1434,role:'support',agencyId:463});
 expect(board.candidates.find(c=>c.userId===30)).toMatchObject({bucket:'pendingSignature',pendingSignatures:1});
 sql.exec("UPDATE hiring_profiles SET stage='hired' WHERE id=3");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates.find(c=>c.userId===30)?.pendingSignatures).toBe(1);
 expect(sql.prepare('SELECT role FROM users WHERE id=30').get().role).toBe('client_guardian');
});

it('keeps explicit agency hire journeys and scopes jobless manual profiles without borrowing another membership',async()=>{
 sql.exec("INSERT INTO users(id,first_name,role,status,is_archived) VALUES(30,'Synthetic journey hire','staff','PREHIRE_OPEN',0);INSERT INTO user_agencies VALUES(30,463),(30,464);INSERT INTO hire_journeys VALUES(30,463);INSERT INTO hiring_profiles VALUES(3,30,'hired',NULL,'2026-11-23',NULL)");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates.some(c=>c.userId===30)).toBe(true);
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:464})).candidates.some(c=>c.userId===30)).toBe(false);
});

it('does not keep completed employees or rejected applicants in the in-progress pipeline',async()=>{
 sql.exec("UPDATE users SET status='ACTIVE_EMPLOYEE' WHERE id=10;UPDATE hiring_profiles SET stage='hired' WHERE id=1");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates).toEqual([]);
 sql.exec("UPDATE hiring_profiles SET stage='applied' WHERE id=1");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates[0].bucket).toBe('newApplicants');
 sql.exec("UPDATE hiring_profiles SET stage='not_hired' WHERE id=1");
 expect((await loadPipelineBoard({userId:1434,role:'support',agencyId:463})).candidates).toEqual([]);
});

it('filters portal accounts before the row cap so they cannot displace genuine candidates',async()=>{
 const user=sql.prepare("INSERT INTO users(id,first_name,role,status,created_at,is_archived) VALUES(?,'Synthetic guardian','client_guardian','PENDING_SETUP','2030-01-01',0)");
 const membership=sql.prepare('INSERT INTO user_agencies VALUES(?,463)');
 for(let i=100;i<550;i++){user.run(i);membership.run(i);}
 const board=await loadPipelineBoard({userId:1434,role:'support',agencyId:463});
 expect(board.candidates.map(c=>c.userId)).toEqual([10]);
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
