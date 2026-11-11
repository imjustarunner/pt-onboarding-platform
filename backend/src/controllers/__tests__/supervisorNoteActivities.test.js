import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),catalog:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/PayrollIndirectServiceType.model.js',()=>({default:{listForAgency:m.catalog}}));
import Assignment from '../../models/PayrollUserIndirectServiceAssignment.model.js';
import { listMyIndirectServiceTypes } from '../indirectTime.controller.js';
let db;
beforeEach(()=>{
 vi.clearAllMocks();db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,status TEXT,is_active INTEGER,is_archived INTEGER,has_supervisor_privileges INTEGER,is_hourly_worker INTEGER DEFAULT 0,hourly_dual_rate_enabled INTEGER DEFAULT 0);
 CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER);
 CREATE TABLE payroll_indirect_service_types(id INTEGER PRIMARY KEY,agency_id INTEGER,type_key TEXT,label TEXT,pay_bucket TEXT,is_active INTEGER);
 CREATE TABLE payroll_user_indirect_service_assignments(id INTEGER PRIMARY KEY,agency_id INTEGER,user_id INTEGER,service_type_id INTEGER,is_enabled INTEGER,rate_override REAL,sort_order INTEGER,created_at TEXT,updated_at TEXT,UNIQUE(agency_id,user_id,service_type_id));
 INSERT INTO users(id,role,status,is_active,is_archived,has_supervisor_privileges) VALUES
 (7,'provider','ACTIVE_EMPLOYEE',1,0,1),(8,'supervisor','ACTIVE_EMPLOYEE',1,0,0),(9,'provider','ACTIVE_EMPLOYEE',1,0,0),
 (10,'supervisor','ACTIVE_EMPLOYEE',0,0,1),(11,'supervisor','ACTIVE_EMPLOYEE',1,1,1),(12,'supervisor','ONBOARDING',1,0,1),(13,'supervisor','ACTIVE_EMPLOYEE',1,0,1);
 INSERT INTO user_agencies VALUES(7,2,1),(7,6,1),(8,2,1),(9,2,1),(10,2,1),(11,2,1),(12,2,1),(13,2,0);
 INSERT INTO payroll_indirect_service_types VALUES(1,2,'supervision_note_time','Supervision Note Time','supervision_note',1),(2,6,'supervision_note_time','Supervision Note Time','supervision_note',1),(3,2,'private_note_duty','Private duty','supervision_note',1),(4,2,'supervisors_meeting','Supervisor meeting','supervision_note',1);
 INSERT INTO payroll_user_indirect_service_assignments(agency_id,user_id,service_type_id,is_enabled,rate_override) VALUES(2,8,1,1,32.5),(2,8,3,1,NULL),(2,8,4,1,NULL);`);
 m.execute.mockImplementation(async(sql,params=[])=>{
  const adapted=sql.replace(/ON DUPLICATE KEY UPDATE is_enabled = 1/g,'ON CONFLICT(agency_id,user_id,service_type_id) DO UPDATE SET is_enabled = 1');
  if(/^\s*INSERT/.test(adapted))return[{affectedRows:Number(db.prepare(adapted).run(...params).changes)}];
  return[db.prepare(adapted).all(...params)];
 });
 m.catalog.mockImplementation(async({agencyId})=>db.prepare('SELECT * FROM payroll_indirect_service_types WHERE agency_id=?').all(agencyId).map(t=>({id:t.id,agencyId:t.agency_id,typeKey:t.type_key,label:t.label,payBucket:t.pay_bucket,isActive:!!t.is_active})));
});
afterEach(()=>db.close());
async function list(agencyId=2,userId=7){const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await listMyIndirectServiceTypes({query:{agencyId},user:{id:userId,role:'provider'}},res,next);expect(next).not.toHaveBeenCalled();return{res,data:res.json.mock.calls[0]?.[0]};}
it('automatically assigns standard note time to a supervisor in both agencies despite another person’s restricted assignment',async()=>{
 for(const agencyId of [2,6]){const {data}=await list(agencyId);expect(data.types.map(t=>t.typeKey)).toEqual(['supervision_note_time']);expect(data.types[0].assignmentId).toBeTruthy();}
 expect(db.prepare('SELECT agency_id FROM payroll_user_indirect_service_assignments WHERE user_id=7 ORDER BY agency_id').all()).toEqual([{agency_id:2},{agency_id:6}]);
});
it('repairs disabled standard note access under the all-supervisors policy without changing private duties or saved overrides',async()=>{
 db.exec('INSERT INTO payroll_user_indirect_service_assignments(agency_id,user_id,service_type_id,is_enabled,rate_override) VALUES(2,7,1,0,32.5)');
 const {data}=await list();expect(data.types.map(t=>t.typeKey)).toEqual(['supervision_note_time']);
 expect(db.prepare('SELECT is_enabled,rate_override FROM payroll_user_indirect_service_assignments WHERE user_id=7').get()).toMatchObject({is_enabled:1,rate_override:32.5});
});
it('does not grant a non-supervisor note access or accept a forged capability flag',async()=>{
 const {data}=await list(2,9);expect(data.types).toEqual([]);
 await Assignment.ensureSupervisorNoteAssignment({agencyId:2,userId:9});expect(db.prepare('SELECT id FROM payroll_user_indirect_service_assignments WHERE user_id=9').all()).toEqual([]);
});
it('requires active agency membership and never grants another agency’s duty',async()=>{
 expect((await list(6,9)).res.status).toHaveBeenCalledWith(403);
 for(const userId of [10,11,12,13])await Assignment.ensureSupervisorNoteAssignment({agencyId:2,userId});
 expect(db.prepare('SELECT id FROM payroll_user_indirect_service_assignments WHERE user_id IN (10,11,12,13)').all()).toEqual([]);
});
it('assigns newly promoted supervisors on their next visit and is idempotent',async()=>{
 expect((await list(2,9)).data.types).toEqual([]);db.exec('UPDATE users SET has_supervisor_privileges=1 WHERE id=9');
 await list(2,9);await list(2,9);expect(db.prepare('SELECT id FROM payroll_user_indirect_service_assignments WHERE user_id=9').all()).toHaveLength(1);
});
it('backfills both agency rosters, including legacy supervisor roles, without touching claims or personal rates',async()=>{
 const sql=readFileSync(new URL('../../../../database/migrations/1804_supervisor_note_time_assignments.sql',import.meta.url),'utf8');
 await m.execute(sql);await m.execute(sql);
 expect(db.prepare('SELECT agency_id,user_id,service_type_id FROM payroll_user_indirect_service_assignments WHERE service_type_id IN (1,2) ORDER BY agency_id,user_id').all()).toEqual([{agency_id:2,user_id:7,service_type_id:1},{agency_id:2,user_id:8,service_type_id:1},{agency_id:6,user_id:7,service_type_id:2}]);
 expect(db.prepare('SELECT rate_override FROM payroll_user_indirect_service_assignments WHERE user_id=8 AND service_type_id=1').get().rate_override).toBe(32.5);
});
