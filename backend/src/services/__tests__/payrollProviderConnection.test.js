import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
vi.mock('../../config/database.js',()=>({default:{}}));
import {previewPayrollProviderConnection,connectPayrollProvider} from '../payrollProviderConnection.service.js';
let db,conn,failRow;
const args={agencyId:2,periodId:149,providerName:'Synthetic Original-Name',targetUserId:474};
const preview=()=>previewPayrollProviderConnection(args,conn);
const apply=(token,extra={})=>connectPayrollProvider({...args,reviewToken:token,confirmedSamePerson:true,actorUserId:9,...extra},async()=>conn);
beforeEach(()=>{
 db=new DatabaseSync(':memory:');failRow=null;
 db.exec(`CREATE TABLE payroll_periods(id INTEGER PRIMARY KEY,agency_id INTEGER,period_start TEXT,period_end TEXT,status TEXT,ran_at TEXT,ran_by_user_id INTEGER,posted_at TEXT,finalized_at TEXT,posted_by_user_id INTEGER,finalized_by_user_id INTEGER);
 INSERT INTO payroll_periods VALUES(147,2,'2026-10-10','2026-10-23','posted',NULL,NULL,'2026-10-29',NULL,9,NULL),(148,2,'2026-10-24','2026-11-06','posted',NULL,NULL,'2026-11-12',NULL,9,NULL),(149,2,'2026-11-07','2026-11-20','ran','2026-11-25',9,NULL,NULL,NULL,NULL),(150,6,'2026-11-07','2026-11-20','staged',NULL,NULL,NULL,NULL,NULL,NULL);
 CREATE TABLE payroll_imports(id INTEGER PRIMARY KEY,agency_id INTEGER,payroll_period_id INTEGER,slot_number INTEGER);
 INSERT INTO payroll_imports VALUES(187,2,147,1),(193,2,148,1),(199,2,149,1),(200,2,148,2),(201,2,147,3),(300,6,150,1);
 CREATE TABLE users(id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT,role TEXT,status TEXT,is_archived INTEGER,is_assistant_account INTEGER);
 INSERT INTO users VALUES(474,'Synthetic','Original-Name','provider','ARCHIVED',1,0),(1935,'Synthetic','Name','provider','PENDING_SETUP',0,0),(8,'Other','Employee','provider','ACTIVE_EMPLOYEE',0,0),(19,'Wrong','Agency','provider','ACTIVE_EMPLOYEE',0,0),(20,'Assistant','Identity','provider','ACTIVE_EMPLOYEE',0,1),(21,'Guardian','Identity','client_guardian','ACTIVE',0,0);
 CREATE TABLE user_agencies(agency_id INTEGER,user_id INTEGER);
 INSERT INTO user_agencies VALUES(2,474),(2,1935),(2,8),(6,19),(2,20),(2,21);
 CREATE TABLE payroll_import_rows(id INTEGER PRIMARY KEY,agency_id INTEGER,payroll_period_id INTEGER,payroll_import_id INTEGER,user_id INTEGER,provider_name TEXT,service_code TEXT,service_date TEXT,unit_count REAL,note_status TEXT,draft_payable INTEGER,row_fingerprint TEXT);
 INSERT INTO payroll_import_rows VALUES(1,2,149,199,1935,'Synthetic Original-Name','90834','2026-11-10',1,'FINALIZED',0,'a'),(2,2,149,199,1935,'Synthetic Original-Name','90837','2026-11-11',1,'FINALIZED',0,'b'),(3,2,148,200,1935,'Synthetic Original-Name','90834','2026-10-28',1,'FINALIZED',0,'c'),(4,2,147,201,1935,'Synthetic Original-Name','90837','2026-10-15',1,'FINALIZED',0,'d'),(5,2,148,193,474,'Synthetic Original-Name','90834','2026-10-28',1,'FINALIZED',0,'c'),(6,2,147,187,474,'Synthetic Original-Name','90837','2026-10-15',1,'FINALIZED',0,'d'),(7,6,150,300,19,'Synthetic Original-Name','90837','2026-11-15',1,'FINALIZED',0,'other-agency');
 CREATE TABLE payroll_summaries(agency_id INTEGER,payroll_period_id INTEGER,user_id INTEGER,total_amount REAL);
 INSERT INTO payroll_summaries VALUES(2,149,1935,0),(2,148,474,162.5),(2,147,474,100);
 CREATE TABLE payroll_manual_pay_lines(id INTEGER PRIMARY KEY,agency_id INTEGER,payroll_period_id INTEGER,user_id INTEGER);
 CREATE TABLE payroll_stage_carryovers(agency_id INTEGER,payroll_period_id INTEGER,user_id INTEGER);
 CREATE TABLE payroll_staging_overrides(agency_id INTEGER,payroll_period_id INTEGER,user_id INTEGER);
 CREATE TABLE payroll_adjustments(agency_id INTEGER,payroll_period_id INTEGER,user_id INTEGER,other_taxable_amount REAL,sick_pto_hours REAL,pto_rate REAL);
 CREATE TABLE payroll_import_row_audit(id INTEGER PRIMARY KEY, payroll_import_row_id INTEGER,payroll_import_id INTEGER,payroll_period_id INTEGER,agency_id INTEGER,field_changed TEXT,from_value TEXT,to_value TEXT,changed_by_user_id INTEGER);`);
 conn={execute:vi.fn(async(sql,params=[])=>{
  if(failRow&&sql.startsWith('UPDATE payroll_import_rows')&&Number(params[1])===failRow)throw Error('Storage failed');
  const statement=db.prepare(sql.replace(/ FOR UPDATE/g,''));if(/^SELECT/.test(sql))return[statement.all(...params)];const result=statement.run(...params);return[{affectedRows:Number(result.changes),insertId:Number(result.lastInsertRowid)}];
 }),beginTransaction:async()=>db.exec('BEGIN'),commit:async()=>db.exec('COMMIT'),rollback:async()=>db.exec('ROLLBACK'),release:vi.fn()};
});
afterEach(()=>db.close());
it('offers archived employee payroll history without exposing guardians or automation identities',async()=>{
 const options=await previewPayrollProviderConnection({agencyId:2,periodId:149},conn);expect(options.providers).toEqual([{name:'Synthetic Original-Name',rowCount:2}]);expect(options.candidates.map(c=>c.id)).toEqual(expect.arrayContaining([474,1935,8]));expect(options.candidates.map(c=>c.id)).not.toEqual(expect.arrayContaining([19,20,21]));expect(options.candidates.find(c=>c.id===474).archived).toBe(true);
});
it('previews only current and successive catch-up snapshots and performs no writes',async()=>{
 const r=await preview();expect(r).toMatchObject({changedRows:4,currentRows:2,catchupRows:2,target:{id:474,archived:true}});expect(r.changes).toBeUndefined();expect(conn.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('connects only reviewed rows, records the actual reviewer and requires a new calculation without reactivating or rewriting posted payroll',async()=>{
 const r=await preview();expect(await apply(r.reviewToken)).toMatchObject({connected:true,changedRows:4,requiresRerun:true});
 expect(db.prepare('SELECT user_id FROM payroll_import_rows WHERE id<=4').all().every(r=>r.user_id===474)).toBe(true);expect(db.prepare('SELECT user_id FROM payroll_import_rows WHERE id IN (5,6)').all().every(r=>r.user_id===474)).toBe(true);expect(db.prepare('SELECT user_id FROM payroll_import_rows WHERE id=7').get().user_id).toBe(19);
 const audits=db.prepare('SELECT * FROM payroll_import_row_audit').all();expect(audits).toHaveLength(4);expect(audits.every(a=>a.changed_by_user_id===9&&a.field_changed==='provider_connection')).toBe(true);expect(JSON.parse(audits[0].to_value)).toMatchObject({userId:474,confirmedSamePerson:true,targetArchived:true});
 expect(db.prepare('SELECT is_archived,status FROM users WHERE id=474').get()).toEqual({is_archived:1,status:'ARCHIVED'});expect(db.prepare('SELECT status,ran_at FROM payroll_periods WHERE id=149').get()).toEqual({status:'staged',ran_at:null});expect(db.prepare('SELECT total_amount FROM payroll_summaries WHERE payroll_period_id=148').get().total_amount).toBe(162.5);expect(db.prepare('SELECT COUNT(*) n FROM payroll_summaries WHERE payroll_period_id=149').get().n).toBe(0);
});
it('rejects repeat or stale confirmations without writing another audit',async()=>{
 const r=await preview();db.exec('UPDATE payroll_import_rows SET unit_count=2 WHERE id=1');await expect(apply(r.reviewToken)).rejects.toMatchObject({status:409});expect(db.prepare('SELECT COUNT(*) n FROM payroll_import_row_audit').get().n).toBe(0);
 const fresh=await preview();await apply(fresh.reviewToken);await expect(apply(fresh.reviewToken)).rejects.toMatchObject({status:409});expect(db.prepare('SELECT COUNT(*) n FROM payroll_import_row_audit').get().n).toBe(4);
});
it('rolls back partial row moves and audit inserts together if a later row fails',async()=>{
 const r=await preview();failRow=2;await expect(apply(r.reviewToken)).rejects.toThrow('Storage failed');expect(db.prepare('SELECT user_id FROM payroll_import_rows WHERE id=1').get().user_id).toBe(1935);expect(db.prepare('SELECT COUNT(*) n FROM payroll_import_row_audit').get().n).toBe(0);expect(db.prepare('SELECT status FROM payroll_periods WHERE id=149').get().status).toBe('ran');
});
it('requires explicit confirmation and rejects a foreign, guardian or assistant target',async()=>{
 await expect(apply('token',{confirmedSamePerson:false})).rejects.toMatchObject({status:400});for(const targetUserId of [19,20,21])await expect(previewPayrollProviderConnection({...args,targetUserId},conn)).rejects.toMatchObject({status:403});
});
it('does not move source profiles with existing calculated pay or manual corrections',async()=>{
 db.exec('UPDATE payroll_summaries SET total_amount=1 WHERE payroll_period_id=149');await expect(preview()).rejects.toThrow('already has calculated pay');db.exec('UPDATE payroll_summaries SET total_amount=0 WHERE payroll_period_id=149; INSERT INTO payroll_manual_pay_lines VALUES(1,2,149,474)');await expect(preview()).rejects.toThrow('manual pay');
});
it('does not move staged carryovers, overrides or nonzero adjustments implicitly',async()=>{
 for(const table of ['payroll_stage_carryovers','payroll_staging_overrides']){db.exec(`INSERT INTO ${table} VALUES(2,149,1935)`);await expect(preview()).rejects.toThrow('staging overrides');db.exec(`DELETE FROM ${table}`);}
 db.exec('INSERT INTO payroll_adjustments VALUES(2,149,1935,0,2,42)');await expect(preview()).rejects.toThrow('payroll adjustments');
});
it('permits zero adjustments and an unmatched current provider without activating an account',async()=>{
 db.exec('INSERT INTO payroll_adjustments VALUES(2,149,1935,0,0,42); UPDATE payroll_import_rows SET user_id=NULL WHERE id<=4');const r=await preview();await apply(r.reviewToken);expect(db.prepare('SELECT user_id FROM payroll_import_rows WHERE id=1').get().user_id).toBe(474);
});
it('rejects a posted destination including stale posting markers and ambiguous multiple source identities',async()=>{
 db.exec("UPDATE payroll_periods SET posted_at='2026-11-25' WHERE id=149");await expect(preview()).rejects.toMatchObject({status:409});db.exec('UPDATE payroll_periods SET posted_at=NULL WHERE id=149; UPDATE payroll_import_rows SET user_id=8 WHERE id=2');await expect(preview()).rejects.toThrow('multiple payroll profiles');
});
