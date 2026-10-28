import {it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import Types from '../PayrollIndirectServiceType.model.js';
it('preserves saved activity categories and inactive status while seeding missing defaults',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE payroll_indirect_service_types(id INTEGER PRIMARY KEY,agency_id INTEGER,type_key TEXT,label TEXT,description TEXT,icon_key TEXT,pay_bucket TEXT,sort_order INTEGER,is_active INTEGER,display_code TEXT,UNIQUE(agency_id,type_key))');
 db.exec("INSERT INTO payroll_indirect_service_types(agency_id,type_key,label,pay_bucket,is_active) VALUES(2,'outreach_activities','Custom outreach','support',1),(2,'staff_meeting','Custom meeting','indirect',0)");
 pool.execute.mockImplementation(async(sql,params=[])=>{
  if(sql.includes('INFORMATION_SCHEMA'))return [[{COLUMN_NAME:'pay_bucket'}]];
  const statement=db.prepare(sql.replace('INSERT IGNORE','INSERT OR IGNORE'));
  return [/^\s*SELECT/.test(sql)?statement.all(...params):statement.run(...params)];
 });
 try{
  const all=await Types.listForAgency({agencyId:2});
  expect(all.find(r=>r.typeKey==='outreach_activities')).toMatchObject({label:'Custom outreach',payBucket:'support'});
  expect(all.find(r=>r.typeKey==='staff_meeting')).toMatchObject({label:'Custom meeting',payBucket:'indirect',isActive:false});
  expect(all.find(r=>r.typeKey==='approved_travel')).toMatchObject({payBucket:'support',isActive:true});
 }finally{db.close();}
});
