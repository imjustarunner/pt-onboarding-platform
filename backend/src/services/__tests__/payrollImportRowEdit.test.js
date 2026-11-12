import {DatabaseSync} from 'node:sqlite';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {savePayrollImportProcessing} from '../payrollImportRowEdit.service.js';
let db,conn;
const args={rowId:4,periodId:12,agencyId:2,actorUserId:501};
const save=extra=>savePayrollImportProcessing({...args,...extra},async()=>conn);
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE payroll_periods(id INTEGER,agency_id INTEGER,status TEXT,posted_at TEXT,finalized_at TEXT,ran_at TEXT,ran_by_user_id INTEGER);INSERT INTO payroll_periods VALUES(12,2,'ran',NULL,NULL,'2026-11-11',501);CREATE TABLE payroll_import_rows(id INTEGER,payroll_period_id INTEGER,agency_id INTEGER,payroll_import_id INTEGER,requires_processing INTEGER,service_code TEXT,unit_count REAL,processed_at TEXT,processed_by_user_id INTEGER);INSERT INTO payroll_import_rows VALUES(4,12,2,20,1,'H0031',60,NULL,NULL);CREATE TABLE payroll_import_row_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,payroll_import_row_id INTEGER,payroll_import_id INTEGER,payroll_period_id INTEGER,agency_id INTEGER,field_changed TEXT,from_value TEXT,to_value TEXT,changed_by_user_id INTEGER);CREATE TABLE payroll_summaries(payroll_period_id INTEGER,agency_id INTEGER,amount REAL);INSERT INTO payroll_summaries VALUES(12,2,44);`);
 conn={execute:vi.fn(async(sql,values=[])=>{if(sql.includes('BIT_XOR'))return [[{row_count:1,row_revision:4,content_revision:123}]];const s=db.prepare(sql.replace(/ FOR UPDATE/g,'')),params=values.map(v=>v instanceof Date?v.toISOString():v);if(sql.startsWith('SELECT'))return[s.all(...params)];const r=s.run(...params);return[{insertId:Number(r.lastInsertRowid),affectedRows:Number(r.changes)}];}),beginTransaction:async()=>db.exec('BEGIN'),commit:async()=>db.exec('COMMIT'),rollback:async()=>db.exec('ROLLBACK'),release:vi.fn()};
});
afterEach(()=>db.close());
it('saves minutes and Done atomically, audits both and requires a rerun rather than recomputing providers',async()=>{
 const result=await save({unitCount:23,processed:true});expect(result.row).toMatchObject({unit_count:23,processed_by_user_id:501});expect(result.row.processed_at).toBeTruthy();expect(result).toMatchObject({payrollInvalidated:true,period:{status:'staged'},import:{id:20,row_revision:'4:123',mutationSequence:2}});expect(db.prepare('SELECT COUNT(*) n FROM payroll_summaries').get().n).toBe(0);expect(db.prepare('SELECT field_changed,from_value,to_value FROM payroll_import_row_audit ORDER BY id').all()).toEqual([{field_changed:'unit_count',from_value:'60',to_value:'23'},{field_changed:'processed',from_value:'0',to_value:'1'}]);
 expect(conn.execute.mock.calls.every(([sql])=>!sql.includes('users')&&!sql.includes('payroll_rate'))).toBe(true);
});
it('rolls back the row if audit storage fails',async()=>{
 const execute=conn.execute;conn.execute=async(sql,params)=>{if(sql.startsWith('INSERT INTO'))throw Error('Audit failed');return execute(sql,params);};await expect(save({unitCount:20})).rejects.toThrow('Audit failed');expect(db.prepare('SELECT unit_count FROM payroll_import_rows').get().unit_count).toBe(60);expect(db.prepare('SELECT status FROM payroll_periods').get().status).toBe('ran');
});
it('protects a period that was posted between access checking and the edit',async()=>{
 db.exec("UPDATE payroll_periods SET status='posted',posted_at='2026-11-11'");await expect(save({processed:true})).rejects.toMatchObject({status:409});expect(db.prepare('SELECT processed_at FROM payroll_import_rows').get().processed_at).toBeNull();
});
it('allows explicit catch-up processing without altering posted totals or status',async()=>{
 db.exec("UPDATE payroll_periods SET status='posted',posted_at='2026-11-11'");const result=await save({unitCount:15,allowPostedProcessing:true});expect(result.payrollInvalidated).toBe(false);expect(result.period.status).toBe('posted');expect(db.prepare('SELECT COUNT(*) n FROM payroll_summaries').get().n).toBe(1);
});
it('does not repeat the audit or invalidate a run for a no-op save',async()=>{
 const r=await save({unitCount:60});expect(r.payrollInvalidated).toBe(false);expect(db.prepare('SELECT COUNT(*) n FROM payroll_import_row_audit').get().n).toBe(0);
});
it('rejects other agencies, unsupported rows and invalid minutes',async()=>{
 await expect(savePayrollImportProcessing({...args,agencyId:6,processed:true},async()=>conn)).rejects.toMatchObject({status:404});await expect(save({unitCount:0})).rejects.toMatchObject({status:400});db.exec("UPDATE payroll_import_rows SET service_code='90837'");await expect(save({processed:true})).rejects.toMatchObject({status:409});
});
