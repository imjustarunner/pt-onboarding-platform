import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
const m=vi.hoisted(()=>({connection:null,rate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m.connection}}));
vi.mock('../sickLeaveRate.service.js',()=>({currentEligibleSickRate:m.rate}));
vi.mock('../paySystem.service.js',()=>({loadUserPaySystemContext:vi.fn()}));
import {approveLeaveAtomically} from '../payrollLeaveApproval.service.js';
let db,failApproval;
const args={agencyId:2,requestId:1,actorId:9,targetPayrollPeriodId:10,policy:{},defaultPayRate:0};
const approve=(patch={})=>approveLeaveAtomically({...args,...patch});
beforeEach(()=>{
 db=new DatabaseSync(':memory:');failApproval=false;m.rate.mockReset().mockResolvedValue(42);
 db.exec(`CREATE TABLE payroll_pto_accounts(agency_id INTEGER,user_id INTEGER,sick_balance_hours REAL,pto_pay_rate REAL,updated_by_user_id INTEGER);
 INSERT INTO payroll_pto_accounts VALUES(2,7,37.59,42,NULL);
 CREATE TABLE payroll_periods(id INTEGER PRIMARY KEY,agency_id INTEGER,status TEXT,period_end TEXT,ran_at TEXT,ran_by_user_id INTEGER);
 INSERT INTO payroll_periods(id,agency_id,status,period_end) VALUES(10,2,'staged','2026-11-20'),(11,2,'staged','2026-12-04');
 CREATE TABLE payroll_summaries(payroll_period_id INTEGER,agency_id INTEGER,total_amount REAL);
 CREATE TABLE payroll_pto_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,user_id INTEGER,submitted_by_user_id INTEGER,status TEXT,request_type TEXT,total_hours REAL,notes TEXT,training_description TEXT,training_cost REAL,proof_file_path TEXT,proof_original_name TEXT,proof_mime_type TEXT,proof_size_bytes INTEGER,policy_warnings_json TEXT,policy_ack_json TEXT,source_appointment_id INTEGER,approved_by_user_id INTEGER,approved_at TEXT,approved_payroll_period_id INTEGER,approved_rates_json TEXT,rejected_by_user_id INTEGER,rejected_at TEXT,rejection_reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO payroll_pto_requests(id,agency_id,user_id,submitted_by_user_id,status,request_type,total_hours,notes,created_at) VALUES(1,2,7,7,'submitted','sick',15,'Original request','2026-11-14');
 CREATE TABLE payroll_pto_request_items(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER,agency_id INTEGER,request_date TEXT,hours REAL);
 INSERT INTO payroll_pto_request_items(request_id,agency_id,request_date,hours) VALUES(1,2,'2026-11-25',5),(1,2,'2026-11-26',5),(1,2,'2026-11-27',5);
 CREATE TABLE payroll_adjustments(payroll_period_id INTEGER,agency_id INTEGER,user_id INTEGER,updated_by_user_id INTEGER,sick_pto_hours REAL,training_pto_hours REAL,pto_hours REAL,pto_rate REAL,UNIQUE(payroll_period_id,user_id));
 CREATE TABLE payroll_pto_ledger(id INTEGER PRIMARY KEY,agency_id INTEGER,user_id INTEGER,entry_type TEXT,pto_bucket TEXT,hours_delta REAL,effective_date TEXT,payroll_period_id INTEGER,request_id INTEGER,note TEXT,created_by_user_id INTEGER);`);
 m.connection={execute:vi.fn(async(sql,params=[])=>{
  if(failApproval&&sql.startsWith("UPDATE payroll_pto_requests SET status='approved'"))throw Error('Approval storage failed');
  const adapted=sql.replace(/ FOR UPDATE/g,'').replace(/NOW\(\)/g,'CURRENT_TIMESTAMP').replace(/CONCAT\(COALESCE\(notes,''\),'\n',\?\)/g,"(COALESCE(notes,'') || char(10) || ?)").replace('ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)','ON CONFLICT(payroll_period_id,user_id) DO UPDATE SET user_id=excluded.user_id');
  const statement=db.prepare(adapted);if(/^SELECT/.test(sql))return[statement.all(...params)];
  const result=statement.run(...params);return[{affectedRows:Number(result.changes),insertId:Number(result.lastInsertRowid)}];
 }),beginTransaction:async()=>db.exec('BEGIN'),commit:async()=>db.exec('COMMIT'),rollback:async()=>db.exec('ROLLBACK'),release:vi.fn()};
});
afterEach(()=>db.close());
const requests=()=>db.prepare('SELECT * FROM payroll_pto_requests ORDER BY id').all();
const items=id=>db.prepare('SELECT request_date,hours FROM payroll_pto_request_items WHERE request_id=? ORDER BY request_date').all(id);
it('approves only the chosen hours and preserves dated pending hours with linked history',async()=>{
 const result=await approve({approvalHours:8});expect(result).toMatchObject({approvedHours:8,remainingHours:7,remainderRequestId:2});
 expect(requests()[0]).toMatchObject({status:'approved',total_hours:8,approved_by_user_id:9,created_at:'2026-11-14'});expect(requests()[0].notes).toContain('15 original hours');
 expect(requests()[1]).toMatchObject({status:'submitted',total_hours:7,submitted_by_user_id:9});expect(requests()[1].notes).toContain('request #1');
 expect(items(1)).toEqual([{request_date:'2026-11-25',hours:5},{request_date:'2026-11-26',hours:3}]);expect(items(2)).toEqual([{request_date:'2026-11-26',hours:2},{request_date:'2026-11-27',hours:5}]);
 expect(db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours).toBeCloseTo(29.59);
 expect(db.prepare('SELECT SUM(hours_delta) hours FROM payroll_pto_ledger').get().hours).toBe(-8);expect(db.prepare('SELECT sick_pto_hours,pto_rate FROM payroll_adjustments').get()).toMatchObject({sick_pto_hours:8,pto_rate:42});
});
it('pays the remainder in a later payroll exactly once without deducting or paying the first portion again',async()=>{
 const first=await approve({approvalHours:8});await approve({requestId:first.remainderRequestId,targetPayrollPeriodId:11,approvalHours:7});
 expect(requests()).toHaveLength(2);expect(requests().every(r=>r.status==='approved')).toBe(true);
 expect(db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours).toBeCloseTo(22.59);expect(db.prepare('SELECT SUM(hours_delta) hours FROM payroll_pto_ledger').get().hours).toBe(-15);
 await expect(approve({approvalHours:8})).rejects.toThrow('not pending');expect(db.prepare('SELECT SUM(sick_pto_hours) hours FROM payroll_adjustments').get().hours).toBe(15);
});
it('rolls back the split, dated items, payroll pay and deduction if the final approval fails',async()=>{
 failApproval=true;await expect(approve({approvalHours:8})).rejects.toThrow('Approval storage failed');expect(requests()).toHaveLength(1);expect(requests()[0]).toMatchObject({status:'submitted',total_hours:15});expect(items(1)).toHaveLength(3);
 expect(db.prepare('SELECT COUNT(*) n FROM payroll_adjustments').get().n).toBe(0);expect(db.prepare('SELECT COUNT(*) n FROM payroll_pto_ledger').get().n).toBe(0);expect(db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours).toBe(37.59);
});
it('preserves the original request and balance if no valid leave rate is configured',async()=>{
 m.rate.mockResolvedValue(0);await expect(approve({approvalHours:8})).rejects.toMatchObject({status:409,code:'LEAVE_PAYMENT_RATE_REQUIRED'});expect(requests()).toHaveLength(1);expect(requests()[0].total_hours).toBe(15);expect(items(1)).toHaveLength(3);
});
it.each([0,-1,16,NaN,2.001])('rejects invalid approval hours %s before any split or pay',async approvalHours=>{
 await expect(approve({approvalHours})).rejects.toMatchObject({status:400});expect(requests()).toHaveLength(1);expect(db.prepare('SELECT COUNT(*) n FROM payroll_pto_ledger').get().n).toBe(0);
});
it('keeps a full approval as a single request',async()=>{
 const result=await approve();expect(result).toMatchObject({approvedHours:15,remainingHours:0,remainderRequestId:null});expect(requests()).toHaveLength(1);expect(requests()[0]).toMatchObject({status:'approved',total_hours:15});
});
it('refuses a partial approval into a posted payroll',async()=>{
 db.exec("UPDATE payroll_periods SET status='posted' WHERE id=10");await expect(approve({approvalHours:8})).rejects.toThrow('open payroll');expect(requests()).toHaveLength(1);
});
it('invalidates calculated payroll totals after a partial approval so they must be rerun',async()=>{
 db.exec("UPDATE payroll_periods SET status='ran',ran_at='2026-11-25',ran_by_user_id=9 WHERE id=10; INSERT INTO payroll_summaries VALUES(10,2,100)");
 await approve({approvalHours:8});expect(db.prepare('SELECT status,ran_at FROM payroll_periods WHERE id=10').get()).toMatchObject({status:'staged',ran_at:null});expect(db.prepare('SELECT COUNT(*) n FROM payroll_summaries').get().n).toBe(0);
});

it('returns only a selected approval to pending, preserves other PTO and appends ledger reversals',async()=>{
 const {returnApprovedLeaveToPending}=await import('../payrollLeaveReturn.service.js');
 db.exec('INSERT INTO payroll_adjustments VALUES(10,2,7,9,2.5,0,2.5,28)');
 const first=await approve({approvalHours:10});await approve({requestId:first.remainderRequestId,approvalHours:5});
 const before=db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours;
 const result=await returnApprovedLeaveToPending({agencyId:2,requestId:1,actorUserId:9,expectedHours:10,confirmed:true},async()=>m.connection);
 expect(result).toMatchObject({returned:true,returnedHours:10,removedPay:420,requiresRerun:true});expect(requests()[0]).toMatchObject({status:'submitted',total_hours:10,approved_payroll_period_id:null});expect(requests()[1]).toMatchObject({status:'approved',total_hours:5});
 const adjustment=db.prepare('SELECT sick_pto_hours,pto_hours,pto_rate FROM payroll_adjustments').get();expect(adjustment.pto_hours).toBe(7.5);expect(adjustment.sick_pto_hours).toBe(7.5);expect(adjustment.pto_rate*7.5).toBeCloseTo(280);
 expect(db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours).toBeCloseTo(before+10);
 const ledger=db.prepare('SELECT * FROM payroll_pto_ledger WHERE request_id=1').all();expect(ledger.filter(l=>l.entry_type==='usage')).toHaveLength(2);expect(ledger.filter(l=>l.entry_type==='manual_adjustment')).toHaveLength(2);expect(ledger.reduce((sum,l)=>sum+l.hours_delta,0)).toBe(0);expect(JSON.parse(ledger.find(l=>l.entry_type==='manual_adjustment').note)).toMatchObject({op:'return_pto_to_pending',originalApprover:9});
 await expect(returnApprovedLeaveToPending({agencyId:2,requestId:1,actorUserId:9,expectedHours:10,confirmed:true},async()=>m.connection)).rejects.toMatchObject({status:409});
 await approve({approvalHours:10,targetPayrollPeriodId:11});expect(db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours).toBeCloseTo(before);
});
it('does not return a posted approval, stale hours or missing payment evidence',async()=>{
 const {returnApprovedLeaveToPending}=await import('../payrollLeaveReturn.service.js');await approve();
 const args={agencyId:2,requestId:1,actorUserId:9,expectedHours:15,confirmed:true};
 await expect(returnApprovedLeaveToPending({...args,expectedHours:10},async()=>m.connection)).rejects.toMatchObject({status:409});
 db.exec("UPDATE payroll_periods SET status='posted' WHERE id=10");await expect(returnApprovedLeaveToPending(args,async()=>m.connection)).rejects.toThrow('posted payroll');
 db.exec("UPDATE payroll_periods SET status='staged' WHERE id=10; UPDATE payroll_pto_requests SET approved_rates_json=NULL WHERE id=1");await expect(returnApprovedLeaveToPending(args,async()=>m.connection)).rejects.toThrow('saved payment details');expect(requests()[0].status).toBe('approved');
});
it('rolls back the returned pay and balance if saving pending status fails',async()=>{
 const {returnApprovedLeaveToPending}=await import('../payrollLeaveReturn.service.js');await approve();const before=db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours;
 const execute=m.connection.execute;m.connection.execute=async(sql,params)=>{if(sql.startsWith("UPDATE payroll_pto_requests SET status='submitted'"))throw Error('Pending update failed');return execute(sql,params);};
 await expect(returnApprovedLeaveToPending({agencyId:2,requestId:1,actorUserId:9,expectedHours:15,confirmed:true},async()=>m.connection)).rejects.toThrow('Pending update failed');expect(requests()[0].status).toBe('approved');expect(db.prepare('SELECT sick_balance_hours FROM payroll_pto_accounts').get().sick_balance_hours).toBe(before);expect(db.prepare("SELECT COUNT(*) n FROM payroll_pto_ledger WHERE entry_type='manual_adjustment'").get().n).toBe(0);expect(db.prepare('SELECT sick_pto_hours FROM payroll_adjustments').get().sick_pto_hours).toBe(15);
});
