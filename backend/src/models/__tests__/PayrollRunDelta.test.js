import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
vi.mock('../../config/database.js',()=>({default:{}}));
import PayrollRunDelta from '../PayrollRunDelta.model.js';
const legacy=['status_change','code_change','unit_change','added','removed','overpaid_deleted','location_changed','service_code_changed'];
const args={payrollPeriodId:148,agencyId:2,baselineRunId:321,compareRunId:325,createdByUserId:9};
const identity={rowMatchKey:'changed-name',deltaType:'identity_changed',fromStatus:'FINALIZED',toStatus:'FINALIZED',fromServiceCode:'90837',toServiceCode:'90837',fromUnits:1,toUnits:1,paidState:'PAID',metadataJson:{baselineRowId:1,compareRowId:2}};
let db,connection,modern;
beforeEach(()=>{
 db=new DatabaseSync(':memory:');modern=false;
 db.exec(`CREATE TABLE payroll_run_deltas(id INTEGER PRIMARY KEY,payroll_period_id INTEGER,agency_id INTEGER,baseline_run_id INTEGER,compare_run_id INTEGER,row_match_key TEXT,delta_type TEXT CHECK(delta_type IN (${[...legacy,'identity_changed'].map(v=>"'"+v+"'").join(',')})),from_status TEXT,to_status TEXT,from_service_code TEXT,to_service_code TEXT,from_units REAL,to_units REAL,paid_state TEXT,metadata_json TEXT,created_by_user_id INTEGER);
 INSERT INTO payroll_run_deltas(payroll_period_id,agency_id,baseline_run_id,compare_run_id,row_match_key,delta_type) VALUES(148,2,321,325,'previous','status_change'),(148,6,321,325,'other-agency','status_change'),(148,2,320,325,'other-comparison','status_change');`);
 connection={execute:vi.fn(async(sql,params=[])=>{
  if(sql.startsWith('SHOW COLUMNS'))return [[{Type:`enum(${(modern?[...legacy,'identity_changed']:legacy).map(v=>"'"+v+"'").join(',')})`}]];
  const statement=db.prepare(sql);if(/^SELECT/.test(sql.trim()))return[statement.all(...params)];
  const result=statement.run(...params);return[{affectedRows:Number(result.changes),insertId:Number(result.lastInsertRowid)}];
 }),beginTransaction:async()=>db.exec('BEGIN'),commit:async()=>db.exec('COMMIT'),rollback:vi.fn(async()=>db.exec('ROLLBACK')),release:vi.fn()};
});
afterEach(()=>db.close());
const replace=rows=>PayrollRunDelta.replaceForRunComparison({...args,rows},async()=>connection);
const rows=()=>db.prepare('SELECT * FROM payroll_run_deltas ORDER BY id').all();
it('stores name reviews on a legacy schema with the exact subtype and source references in metadata',async()=>{
 expect(await replace([identity])).toBe(1);const saved=rows().find(r=>r.row_match_key==='changed-name');expect(saved.delta_type).toBe('status_change');expect(JSON.parse(saved.metadata_json)).toEqual({baselineRowId:1,compareRowId:2,deltaType:'identity_changed'});
 expect(identity.deltaType).toBe('identity_changed');expect(identity.metadataJson).toEqual({baselineRowId:1,compareRowId:2});expect(connection.release).toHaveBeenCalledOnce();
});
it('uses the dedicated enum value immediately after migration without a stale schema cache',async()=>{
 await replace([identity]);modern=true;await replace([identity]);expect(rows().find(r=>r.row_match_key==='changed-name').delta_type).toBe('identity_changed');expect(connection.execute.mock.calls.filter(([sql])=>sql.startsWith('SHOW COLUMNS'))).toHaveLength(2);
});
it('rolls back deletion if insertion fails and preserves the previous comparison',async()=>{
 const before=rows();await expect(replace([{...identity,deltaType:'invalid-type'}])).rejects.toThrow(/CHECK/);expect(rows()).toEqual(before);expect(connection.rollback).toHaveBeenCalledOnce();
});
it('keeps replacements within the agency and exact comparison, including an empty result',async()=>{
 await replace([]);expect(rows().map(r=>r.row_match_key)).toEqual(['other-agency','other-comparison']);
});
it('does not delete results if schema inspection fails',async()=>{
 const before=rows(),execute=connection.execute;connection.execute=async(sql,params)=>{if(sql.startsWith('SHOW COLUMNS'))throw Error('Schema unavailable');return execute(sql,params);};
 await expect(replace([identity])).rejects.toThrow('Schema unavailable');expect(rows()).toEqual(before);expect(connection.release).toHaveBeenCalledOnce();
});
it('keeps existing delta types and serialized metadata unchanged',async()=>{
 await replace([{...identity,deltaType:'service_code_changed',metadataJson:JSON.stringify({baselineRowId:1,compareRowId:2})}]);const saved=rows().find(r=>r.row_match_key==='changed-name');expect(saved.delta_type).toBe('service_code_changed');expect(JSON.parse(saved.metadata_json)).toEqual({baselineRowId:1,compareRowId:2});
});
it('appends the enum value while preserving every existing value and its position',()=>{
 const migration=readFileSync(new URL('../../../../database/migrations/1883_payroll_run_delta_identity_changed.sql',import.meta.url),'utf8');const values=[...migration.matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);expect(values).toEqual([...legacy,'identity_changed']);
});
