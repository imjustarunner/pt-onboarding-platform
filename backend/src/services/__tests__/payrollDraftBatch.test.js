import {DatabaseSync} from 'node:sqlite';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {savePayrollDraftBatch} from '../payrollDraftBatch.service.js';
let db,conn;
const args={periodId:12,agencyId:2,importId:20,actorUserId:501,draftPayable:true};
const save=extra=>savePayrollDraftBatch({...args,decisions:[{id:1,expectedDraftPayable:1}],...extra},async()=>conn);
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE payroll_periods(id INTEGER,agency_id INTEGER,status TEXT,posted_at TEXT,finalized_at TEXT,ran_at TEXT,ran_by_user_id INTEGER);INSERT INTO payroll_periods VALUES(12,2,'ran',NULL,NULL,'2026-11-11',501);CREATE TABLE payroll_imports(id INTEGER,payroll_period_id INTEGER,agency_id INTEGER,slot_number INTEGER,created_at TEXT);INSERT INTO payroll_imports VALUES(20,12,2,1,'2026-11-10');CREATE TABLE payroll_import_rows(id INTEGER,payroll_period_id INTEGER,agency_id INTEGER,payroll_import_id INTEGER,note_status TEXT,draft_payable INTEGER);CREATE TABLE payroll_import_row_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,payroll_import_row_id INTEGER,payroll_import_id INTEGER,payroll_period_id INTEGER,agency_id INTEGER,field_changed TEXT,from_value TEXT,to_value TEXT,changed_by_user_id INTEGER);CREATE TABLE payroll_summaries(payroll_period_id INTEGER,agency_id INTEGER,amount REAL);INSERT INTO payroll_summaries VALUES(12,2,44);`);
 for(let id=1;id<=299;id++)db.prepare("INSERT INTO payroll_import_rows VALUES(?,12,2,20,'DRAFT',1)").run(id);
 conn={execute:vi.fn(async(sql,values=[])=>{if(sql.includes('BIT_XOR'))return [[{row_count:299,row_revision:299,content_revision:123}]];const s=db.prepare(sql.replace(/ FOR UPDATE/g,''));if(sql.startsWith('SELECT'))return[s.all(...values)];const r=s.run(...values);return[{insertId:Number(r.lastInsertRowid)-Number(r.changes)+1,affectedRows:Number(r.changes)}];}),beginTransaction:async()=>db.exec('BEGIN'),commit:async()=>db.exec('COMMIT'),rollback:async()=>db.exec('ROLLBACK'),release:vi.fn()};
});
afterEach(()=>db.close());
it('reviews 299 drafts with one update and one multi-row audit insert, retaining an unchanged calculated run',async()=>{
 const result=await save({decisions:Array.from({length:299},(_,i)=>({id:i+1,expectedDraftPayable:1}))});expect(result.rows).toHaveLength(299);expect(result.payrollInvalidated).toBe(false);expect(db.prepare('SELECT COUNT(*) n FROM payroll_import_row_audit WHERE changed_by_user_id=501').get().n).toBe(299);expect(db.prepare('SELECT status FROM payroll_periods').get().status).toBe('ran');expect(conn.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE payroll_import_rows'))).toHaveLength(1);expect(conn.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO payroll_import_row_audit'))).toHaveLength(1);
});
it('invalidates calculated amounts once when the selected payment choices change',async()=>{
 const result=await save({draftPayable:false});expect(result).toMatchObject({payrollInvalidated:true,period:{status:'staged'}});expect(db.prepare('SELECT COUNT(*) n FROM payroll_summaries').get().n).toBe(0);expect(db.prepare('SELECT draft_payable FROM payroll_import_rows WHERE id=1').get().draft_payable).toBe(0);
});
it('rolls the entire batch back if audit persistence fails',async()=>{
 const execute=conn.execute;conn.execute=async(sql,params)=>{if(sql.startsWith('INSERT INTO'))throw Error('Audit unavailable');return execute(sql,params);};await expect(save({draftPayable:false})).rejects.toThrow('Audit unavailable');expect(db.prepare('SELECT draft_payable FROM payroll_import_rows WHERE id=1').get().draft_payable).toBe(1);expect(db.prepare('SELECT status FROM payroll_periods').get().status).toBe('ran');
});
it('rejects stale choices, duplicate IDs, out-of-scope rows and non-drafts without recording success',async()=>{
 await expect(save({decisions:[{id:1,expectedDraftPayable:0}]})).rejects.toMatchObject({status:409});await expect(save({decisions:[{id:1,expectedDraftPayable:1},{id:1,expectedDraftPayable:1}]})).rejects.toMatchObject({status:400});await expect(save({agencyId:6})).rejects.toMatchObject({status:404});db.exec("UPDATE payroll_import_rows SET note_status='FINALIZED' WHERE id=1");await expect(save()).rejects.toMatchObject({status:409});expect(db.prepare('SELECT COUNT(*) n FROM payroll_import_row_audit').get().n).toBe(0);
});
it('locks originals and paid baseline sessions while allowing new posted catch-up draft reviews',async()=>{
 db.exec("UPDATE payroll_periods SET status='posted',posted_at='2026-11-09'");await expect(save()).rejects.toMatchObject({status:409});db.exec("INSERT INTO payroll_imports VALUES(19,12,2,1,'2026-11-08');UPDATE payroll_imports SET slot_number=2 WHERE id=20");await expect(save({allowPostedDraftReview:true,annotateBaseline:()=>[{id:1,already_paid_in_baseline:1}]})).rejects.toMatchObject({status:409});const r=await save({allowPostedDraftReview:true,draftPayable:false,annotateBaseline:()=>[]});expect(r.period.status).toBe('posted');expect(r.payrollInvalidated).toBe(false);expect(db.prepare('SELECT COUNT(*) n FROM payroll_summaries').get().n).toBe(1);
});
