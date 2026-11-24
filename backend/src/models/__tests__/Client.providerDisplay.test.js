import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
import Client from '../Client.model.js';
let db;
beforeEach(()=>vi.clearAllMocks());
afterEach(()=>db?.close());
it('reads the chart and sibling clinician label from the same agency service assignment as the directory, without rewriting the legacy owner',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('information_schema')?[[]]:[[{id:8,agency_id:2,provider_id:30,directory_provider_id:31,assigned_service_id:70,provider_first_name:'Service',provider_last_name:'Counselor'}]]);
 const client=await Client.findById(8);expect(client.provider_name).toBe('Service Counselor');expect(client.provider_id).toBe(30);
 const query=m.execute.mock.calls[1][0];expect(query).toContain('enrollment.agency_id=c.agency_id');expect(query).toContain('enrollment.is_active=1');expect(query).toContain('enrollment_history');
 expect(m.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
});

function actualDatabase(){
 db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE clients(id INTEGER PRIMARY KEY,agency_id INT,provider_id INT,organization_id INT,client_status_id INT,paperwork_status_id INT,insurance_type_id INT,paperwork_delivery_method_id INT,created_by_user_id INT);
 CREATE TABLE agencies(id INT,name TEXT,slug TEXT,organization_type TEXT,feature_flags TEXT);
 CREATE TABLE users(id INT,first_name TEXT,last_name TEXT);
 CREATE TABLE client_statuses(id INT,label TEXT,status_key TEXT);
 CREATE TABLE paperwork_statuses(id INT,label TEXT,status_key TEXT);
 CREATE TABLE insurance_types(id INT,label TEXT,insurance_key TEXT);
 CREATE TABLE paperwork_delivery_methods(id INT,label TEXT,method_key TEXT);
 CREATE TABLE client_service_enrollments(id INT,client_id INT,agency_id INT,provider_user_id INT,organization_id INT,service_kind TEXT,is_active INT);
 INSERT INTO clients(id,agency_id,provider_id) VALUES (8,2,30);
 INSERT INTO users VALUES(30,'Old','Owner'),(31,'Current','Counselor'),(32,'Other','Agency');`);
 m.execute.mockImplementation(async(sql,args)=>sql.includes('information_schema')?[[]]:[db.prepare(sql).all(...args)]);
}

it('executes the real chart query with the current service, a different agency and an old chart owner',async()=>{
 actualDatabase();db.exec("INSERT INTO client_service_enrollments VALUES(70,8,2,31,0,'counseling',1),(71,8,3,32,0,'counseling',1)");
 const result=await Client.findById(8);expect(result).toMatchObject({provider_name:'Current Counselor',directory_provider_id:31,provider_id:30});
});

it('does not resurrect a legacy provider after its service ends, but retains legacy charts with no service history',async()=>{
 actualDatabase();expect((await Client.findById(8)).provider_name).toBe('Old Owner');
 db.exec("INSERT INTO client_service_enrollments VALUES(70,8,2,31,0,'counseling',0)");
 const result=await Client.findById(8);expect(result.provider_name).toBeNull();expect(result.provider_id).toBe(30);
});
