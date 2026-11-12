import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute:m.execute }, onTableWrite:vi.fn() }));
import Time from '../PayrollTimeClaim.model.js';
import Mileage from '../PayrollMileageClaim.model.js';
import Reimbursement from '../PayrollReimbursementClaim.model.js';
let db;
const models = [[Time,'payroll_time_claims'],[Mileage,'payroll_mileage_claims'],[Reimbursement,'payroll_reimbursement_claims']];
beforeEach(() => {
 db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id INTEGER,first_name TEXT,last_name TEXT,email TEXT);
 CREATE TABLE payroll_periods(id INTEGER,agency_id INTEGER,status TEXT,posted_at TEXT,finalized_at TEXT,posted_by_user_id INTEGER,finalized_by_user_id INTEGER);
 INSERT INTO payroll_periods VALUES(8,2,'staged',NULL,NULL,NULL,NULL),(9,6,'staged',NULL,NULL,NULL,NULL),(10,2,'posted','2026-11-11',NULL,NULL,NULL);`);
 for(const [,table] of models) db.exec(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY,agency_id INTEGER,user_id INTEGER,submitted_by_user_id INTEGER,status TEXT,
  target_payroll_period_id INTEGER,applied_amount REAL,approved_by_user_id INTEGER,approved_at TEXT,bucket TEXT,credits_hours REAL,
  tier_level INTEGER,rate_per_mile REAL,eligible_miles REAL,rejection_reason TEXT,rejected_by_user_id INTEGER,rejected_at TEXT,payload_json TEXT);
  INSERT INTO ${table}(id,agency_id,status) VALUES(1,2,'submitted');`);
 m.execute.mockImplementation(async(sql,params=[])=>{
   if (sql.includes('UPDATE payroll_mileage_claims c') && sql.includes('JOIN payroll_periods')) {
     const set=sql.slice(sql.indexOf('SET ')+4,sql.indexOf('WHERE c.id')).trim().replace(/c\./g,'');
     const where=sql.slice(sql.indexOf('WHERE c.id')+6).replace(/<=>/g,'IS');
     const joins=sql.includes('JOIN payroll_periods source')
       ? 'FROM payroll_periods source JOIN payroll_periods target ON target.id=? AND target.agency_id=c.agency_id WHERE source.id=c.target_payroll_period_id AND source.agency_id=c.agency_id'
       : 'FROM payroll_periods p WHERE p.id=c.target_payroll_period_id AND p.agency_id=c.agency_id';
     const adapted=`UPDATE payroll_mileage_claims AS c SET ${set} WHERE EXISTS (SELECT 1 ${joins} AND ${where})`;
     const args=sql.includes('JOIN payroll_periods source')?[...params.slice(1,6),params[0],...params.slice(6)]:params;
     return [{affectedRows:Number(db.prepare(adapted).run(...args).changes)}];
   }
   const adapted=sql.replace(/NOW\(\)/g,"CURRENT_TIMESTAMP").replace(/LIMIT 1\s*$/,'');
   if(/^\s*UPDATE/.test(adapted))return [{affectedRows:Number(db.prepare(adapted).run(...params).changes)}];
   return [db.prepare(adapted).all(...params)];
 });
});
afterEach(()=>db.close());
it.each(models)('allows exactly one conditional approval: model %#',async(model,table)=>{
 const options={id:1,approverUserId:99,targetPayrollPeriodId:8,appliedAmount:21,tierLevel:2,ratePerMile:.35,requireSubmitted:true};
 expect(await model.approve(options)).toMatchObject({status:'approved',applied_amount:21});
 await expect(model.approve({...options,appliedAmount:100})).rejects.toMatchObject({status:409});
 expect(db.prepare(`SELECT applied_amount FROM ${table} WHERE id=1`).get().applied_amount).toBe(21);
});
it.each(models)('checks target agency and current posting metadata in the actual approval update: model %#',async(model,table)=>{
 for(const periodId of [9,10]) await expect(model.approve({id:1,approverUserId:99,targetPayrollPeriodId:periodId,appliedAmount:21,tierLevel:2,ratePerMile:.35,requireSubmitted:true})).rejects.toMatchObject({status:409});
 db.exec("UPDATE payroll_periods SET status='ran',finalized_at='2026-11-11' WHERE id=8");
 await expect(model.approve({id:1,approverUserId:99,targetPayrollPeriodId:8,appliedAmount:21,tierLevel:2,ratePerMile:.35,requireSubmitted:true})).rejects.toMatchObject({status:409});
 expect(db.prepare(`SELECT status FROM ${table}`).get().status).toBe('submitted');
});
it.each(models)('does not let a delayed send-back or reject overwrite an approval: model %#',async(model,table)=>{
 db.exec(`UPDATE ${table} SET status='approved',applied_amount=21 WHERE id=1`);
 await expect(model.returnForChanges({id:1,actorUserId:99,note:'Check date',requireSubmitted:true})).rejects.toMatchObject({status:409});
 await expect(model.reject({id:1,rejectorUserId:99,rejectionReason:'Check date',requireSubmitted:true})).rejects.toMatchObject({status:409});
 expect(db.prepare(`SELECT status,applied_amount FROM ${table}`).get()).toMatchObject({status:'approved',applied_amount:21});
});

it('edits approved mileage atomically and refuses another edit based on a stale amount',async()=>{
 db.exec("UPDATE payroll_mileage_claims SET status='approved',target_payroll_period_id=8,applied_amount=.61 WHERE id=1");
 const edit={id:1,expectedPeriodId:8,expectedAmount:.61,targetPayrollPeriodId:8,eligibleMiles:4,tierLevel:2,ratePerMile:.35,appliedAmount:1.4};
 expect(await Mileage.updateApproved(edit)).toMatchObject({applied_amount:1.4,eligible_miles:4});
 await expect(Mileage.updateApproved({...edit,appliedAmount:2})).rejects.toMatchObject({status:409});
});
it('checks both source and destination posting locks and agency inside approved-mileage writes',async()=>{
 db.exec("UPDATE payroll_mileage_claims SET status='approved',target_payroll_period_id=8,applied_amount=.61 WHERE id=1");
 const edit={id:1,expectedPeriodId:8,expectedAmount:.61,targetPayrollPeriodId:9,eligibleMiles:4,tierLevel:2,ratePerMile:.35,appliedAmount:1.4};
 for(const targetPayrollPeriodId of [9,10])await expect(Mileage.updateApproved({...edit,targetPayrollPeriodId})).rejects.toMatchObject({status:409});
 db.exec("UPDATE payroll_periods SET status='ran',posted_by_user_id=501 WHERE id=8");
 await expect(Mileage.updateApproved({...edit,targetPayrollPeriodId:8})).rejects.toMatchObject({status:409});
 await expect(Mileage.unapprove({id:1})).rejects.toMatchObject({status:409});
 expect(db.prepare('SELECT status,applied_amount FROM payroll_mileage_claims').get()).toMatchObject({status:'approved',applied_amount:.61});
});
it('unapproves mileage once while retaining the original claim for review',async()=>{
 db.exec("UPDATE payroll_mileage_claims SET status='approved',target_payroll_period_id=8,applied_amount=.61 WHERE id=1");
 expect(await Mileage.unapprove({id:1})).toMatchObject({status:'submitted',target_payroll_period_id:null,applied_amount:null});
 await expect(Mileage.unapprove({id:1})).rejects.toMatchObject({status:409});
});
