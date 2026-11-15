import { beforeEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[{id:2}])}}));
vi.mock('../hubPeopleAccess.service.js',()=>({canAccessHubClient:vi.fn(async()=>false)}));
import pool from '../../config/database.js';
import Client from '../../models/Client.model.js';
import { getClients } from '../../controllers/client.controller.js';
import { listUserVirtualSessionClients } from '../../controllers/user.controller.js';
import { providerHasAssignedClientAccess } from '../clientRecordAccess.service.js';
import { clientServiceAssignments } from '../../utils/clientServiceAssignments.js';

// Execute the production SQL against disposable fictional records. No app DB is used.
const fixture = String.raw`
import sqlite3,json,sys
request=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
schema='''
CREATE TABLE clients(id INTEGER,agency_id INTEGER,provider_id INTEGER,organization_id INTEGER,client_status_id INTEGER,paperwork_status_id INTEGER,insurance_type_id INTEGER,paperwork_delivery_method_id INTEGER,compliance_archived_at TEXT,submission_date TEXT,created_at TEXT,initials TEXT,full_name TEXT,status TEXT,client_type TEXT,identifier_code TEXT);
CREATE TABLE agencies(id INTEGER,name TEXT,slug TEXT,organization_type TEXT);
CREATE TABLE users(id INTEGER,first_name TEXT,last_name TEXT);
CREATE TABLE client_statuses(id INTEGER,label TEXT,status_key TEXT);
CREATE TABLE paperwork_statuses(id INTEGER,label TEXT,status_key TEXT);
CREATE TABLE insurance_types(id INTEGER,label TEXT,insurance_key TEXT);
CREATE TABLE paperwork_delivery_methods(id INTEGER,label TEXT,method_key TEXT);
CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER);
CREATE TABLE client_agency_assignments(client_id INTEGER,agency_id INTEGER,is_active INTEGER);
CREATE TABLE client_service_enrollments(id INTEGER,client_id INTEGER,agency_id INTEGER,provider_user_id INTEGER,service_kind TEXT,is_active INTEGER,service_status TEXT,organization_id INTEGER,label TEXT);
CREATE TABLE client_provider_assignments(client_id INTEGER,provider_user_id INTEGER,is_active INTEGER);
INSERT INTO agencies VALUES(2,'Practice A','practice-a','agency'),(3,'Practice B','practice-b','agency'),(30,'Student Support','support','program'),(31,'Counseling and Therapy','counseling','clinical');
INSERT INTO user_agencies VALUES(8,2,1),(8,3,1),(9,2,1),(10,2,0);
INSERT INTO client_agency_assignments VALUES(6,2,1),(8,3,1);
INSERT INTO client_service_enrollments VALUES
(20,2,2,8,'counseling',1,'active',30,'Counseling'),
(21,2,2,8,'counseling',1,'active',31,'Counseling'),
(22,3,2,8,'tutoring',1,'active',30,'Tutoring'),
(23,4,2,8,'counseling',0,'completed',30,'Counseling'),
(24,5,3,8,'counseling',1,'active',30,'Counseling'),
(25,6,2,8,'counseling',1,'active',30,'Counseling'),
(26,7,2,9,'counseling',1,'active',30,'Counseling'),
(27,8,3,8,'counseling',1,'active',30,'Counseling'),
(28,9,2,10,'counseling',1,'active',30,'Counseling');
'''
db.executescript(schema)
for i in range(1,10):db.execute("INSERT INTO clients(id,agency_id,provider_id,organization_id,initials,status,client_type) VALUES(?,?,?,?,?,'ACTIVE','clinical')",(i,3 if i in (5,6) else 2,8 if i==1 else None,30,'F'+str(i)))
print(json.dumps([dict(r) for r in db.execute(request['sql'],request['params'])]))
`;
function query(sql,params=[]){
 const result=spawnSync('python3',['-c',fixture],{input:JSON.stringify({sql,params}),encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr);
 return JSON.parse(result.stdout);
}
beforeEach(()=>{
 vi.clearAllMocks();
 pool.execute.mockImplementation(async(sql,params=[])=>sql.toLowerCase().includes('information_schema')?[[]]:[query(sql,params)]);
});
const ids=rows=>rows.map(row=>row.id).sort((a,b)=>a-b);
it('includes active counseling assignments, deduplicates programs, and respects the selected agency',async()=>{
 expect(ids(await Client.findByAgencyId(2,{provider_id:8}))).toEqual([1,2,6]);
 expect(ids(await Client.findByAgencyId(3,{provider_id:8}))).toEqual([5,8]);
});
it('does not put ended services, other providers or inactive provider memberships on the caseload',async()=>{
 expect(ids(await Client.findByAgencyId(2,{provider_id:9}))).toEqual([7]);
 expect(await Client.findByAgencyId(2,{provider_id:10})).toEqual([]);
});
it('keeps a service-only client in the actual provider Clients endpoint, including its service detail',async()=>{
 const req={query:{agency_id:'2',provider_id:'8',includeServiceContext:'1'},user:{id:8,role:'provider'}};
 const res={json:vi.fn(),status:vi.fn().mockReturnThis()},next=vi.fn();
 await getClients(req,res,next);expect(next).not.toHaveBeenCalled();
 expect(ids(res.json.mock.calls[0][0])).toEqual([1,2,6]);
 expect(res.json.mock.calls[0][0].find(row=>row.id===2).service_contexts).toEqual(expect.arrayContaining([expect.objectContaining({service_kind:'counseling',agency_id:2})]));
});
it('opens the assigned counseling chart while a tutoring-only or ended service does not grant clinical chart access',async()=>{
 expect(await providerHasAssignedClientAccess({userId:8,clientId:2,client:{id:2,agency_id:2}})).toBe(true);
 for(const clientId of [3,4,7])expect(await providerHasAssignedClientAccess({userId:8,clientId,client:{id:clientId,agency_id:2}})).toBe(false);
});
it('allows two different services in one program without merging them',()=>{
 const rows=[{id:1,client_id:2,agency_id:2,provider_user_id:8,service_kind:'counseling',organization_id:30,is_active:1},{id:2,client_id:2,agency_id:2,provider_user_id:8,service_kind:'tutoring',organization_id:30,is_active:1}];
 const services=clientServiceAssignments(rows);expect(services.map(s=>s.service_kind)).toEqual(['counseling','tutoring']);expect(services.map(s=>s.organization_id)).toEqual([30,30]);
});

it('includes the counseling service assignment in the actual appointment client picker with the same agency scope',async()=>{
 const req={params:{id:'8'},query:{agencyId:'2'},user:{id:8,role:'provider'}};const res={json:vi.fn(),status:vi.fn().mockReturnThis()},next=vi.fn();
 await listUserVirtualSessionClients(req,res,next);expect(next).not.toHaveBeenCalled();expect(ids(res.json.mock.calls[0][0].clients)).toEqual([1,2,6]);
});
