import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import { buildPayrollCorrectionReview,postPayrollCorrectionReduction,postPayrollCorrectionAdditionalPay,originalServicePay } from '../payrollCorrectionReview.service.js';
let db,conn;
const profile={creditRate:30,hcodeRate:28,indirectRate:20,autoIndirectMinutesPerHour:0};
const breakdown=()=>({'90837':{amount:30,finalizedUnits:1,rateAmount:30,rateUnit:'per_hour_equivalent',creditValue:1,payDivisor:1,hourEquivalent:1,category:'direct',payMethod:'fixed_rate',agreementRateProfile:profile,rateEraStatus:{useReducedRates:false,asOfDate:'2026-10-21'}},__paySystem:{paySystemBonusTotal:0}});
const args={agencyId:2,destinationPeriodId:12,sourcePayrollPeriodId:11,baselineRowId:1,compareRowId:2};
const review=()=>buildPayrollCorrectionReview({...args,db:conn});
const post=async(token,extra={})=>postPayrollCorrectionReduction({...args,reviewToken:token,actorUserId:501,...extra},async()=>conn);
beforeEach(()=>{
 db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE payroll_periods(id INTEGER PRIMARY KEY,agency_id INTEGER,period_start TEXT,period_end TEXT,status TEXT,posted_at TEXT,finalized_at TEXT,posted_by_user_id INTEGER,finalized_by_user_id INTEGER,ran_at TEXT,ran_by_user_id INTEGER);
 INSERT INTO payroll_periods VALUES(11,2,'2026-10-10','2026-10-23','posted','2026-10-27',NULL,501,NULL,NULL,NULL),(12,2,'2026-10-24','2026-11-06','raw_imported',NULL,NULL,NULL,NULL,NULL,NULL),(13,6,'2026-10-24','2026-11-06','staged',NULL,NULL,NULL,NULL,NULL,NULL),(14,2,'2026-11-07','2026-11-20','staged',NULL,NULL,NULL,NULL,NULL,NULL);
 CREATE TABLE payroll_imports(id INTEGER PRIMARY KEY,agency_id INTEGER,payroll_period_id INTEGER,slot_number INTEGER);
 INSERT INTO payroll_imports VALUES(101,2,11,1),(102,2,11,2);
 CREATE TABLE payroll_import_rows(id INTEGER PRIMARY KEY,agency_id INTEGER,payroll_period_id INTEGER,payroll_import_id INTEGER,user_id INTEGER,provider_name TEXT,patient_first_name TEXT,service_date TEXT,service_code TEXT,note_status TEXT,draft_payable INTEGER,unit_count REAL,row_fingerprint TEXT);
 INSERT INTO payroll_import_rows VALUES(1,2,11,101,7,'Test Provider','Test client','2026-10-21','90837','FINALIZED',1,1,'original'),(2,2,11,102,7,'Test Provider','Test client','2026-10-21','H0004','FINALIZED',1,3,'corrected');
 CREATE TABLE payroll_summaries(id INTEGER PRIMARY KEY,payroll_period_id INTEGER,agency_id INTEGER,user_id INTEGER,breakdown TEXT,computed_at TEXT);
 CREATE TABLE payroll_stage_carryovers(agency_id INTEGER,user_id INTEGER,payroll_period_id INTEGER,service_code TEXT,carryover_meta_json TEXT);
 CREATE TABLE payroll_service_code_rules(agency_id INTEGER,service_code TEXT,pay_divisor REAL,credit_value REAL,category TEXT,pay_system_bucket TEXT);
 INSERT INTO payroll_service_code_rules VALUES(2,'H0004',4,.25,'direct','hcode');
 CREATE TABLE payroll_manual_pay_lines(id INTEGER PRIMARY KEY,payroll_period_id INTEGER,agency_id INTEGER,user_id INTEGER,line_type TEXT,label TEXT,category TEXT,credits_hours REAL,amount REAL,metadata_json TEXT,correction_key TEXT,created_by_user_id INTEGER,UNIQUE(agency_id,correction_key));`);
 db.prepare('INSERT INTO payroll_summaries VALUES(1,11,2,7,?,?)').run(JSON.stringify(breakdown()),'2026-10-27');
 conn={execute:vi.fn(async(sql,params=[])=>{
  const adapted=sql.replace(/ FOR UPDATE/g,'').replace(/JSON_UNQUOTE\((JSON_EXTRACT\([^)]*\))\)/g,'$1');
  const statement=db.prepare(adapted);
  if(/^\s*SELECT/.test(adapted))return[statement.all(...params)];
  const result=statement.run(...params);return[{insertId:Number(result.lastInsertRowid),affectedRows:Number(result.changes)}];
 }),beginTransaction:async()=>db.exec('BEGIN'),commit:async()=>db.exec('COMMIT'),rollback:async()=>db.exec('ROLLBACK'),release:vi.fn()};
});
afterEach(()=>db.close());
it('quotes only the net historical overpayment and includes the applicable automatic indirect allowance without rewriting the original paid amount',async()=>{
 const r=await review();expect(r.original).toMatchObject({total:30,payrollPeriodId:11,periodEnd:'2026-10-23'});
 expect(r.corrected).toMatchObject({total:23.5,autoIndirectAmount:2.5});expect(r).toMatchObject({reductionAmount:6.5,canPostReduction:true});
 expect(conn.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('posts one standalone negative pay line with complete source details and requires a rerun of the destination',async()=>{
 const r=await review(),result=await post(r.reviewToken);expect(result.alreadyPosted).toBe(false);
 const line=db.prepare('SELECT * FROM payroll_manual_pay_lines').get();expect(line).toMatchObject({amount:-6.5,credits_hours:null,payroll_period_id:12,user_id:7});
 const meta=JSON.parse(line.metadata_json);expect(meta.overpaymentReview.original).toMatchObject({code:'90837',payrollPeriodId:11,total:30});expect(meta.overpaymentReview.corrected.total).toBe(23.5);expect(meta.details.some(x=>x.label==='Reason')).toBe(true);
 expect(db.prepare('SELECT status FROM payroll_periods WHERE id=12').get().status).toBe('staged');expect(db.prepare('SELECT COUNT(*) n FROM payroll_summaries WHERE payroll_period_id=11').get().n).toBe(1);
});
it('does not repeat a correction in the same or a different destination period',async()=>{
 const r=await review();await post(r.reviewToken);
 expect((await post(r.reviewToken)).alreadyPosted).toBe(true);
 expect((await post(r.reviewToken,{destinationPeriodId:14})).alreadyPosted).toBe(true);
 expect(db.prepare('SELECT COUNT(*) n FROM payroll_manual_pay_lines').get().n).toBe(1);
 const line=db.prepare('SELECT * FROM payroll_manual_pay_lines').get();expect(()=>db.prepare('INSERT INTO payroll_manual_pay_lines(agency_id,correction_key) VALUES(?,?)').run(2,line.correction_key)).toThrow();
});
it('rejects a changed calculation after review without inserting a reduction',async()=>{
 const r=await review();db.exec('UPDATE payroll_import_rows SET unit_count=2 WHERE id=2');
 await expect(post(r.reviewToken)).rejects.toMatchObject({status:409});expect(db.prepare('SELECT COUNT(*) n FROM payroll_manual_pay_lines').get().n).toBe(0);
});
it('rolls back the line if payroll invalidation fails',async()=>{
 const r=await review(),original=conn.execute;conn.execute=async(sql,params)=>{if(sql.startsWith('DELETE FROM payroll_summaries'))throw new Error('Storage failed');return original(sql,params);};
 await expect(post(r.reviewToken)).rejects.toThrow('Storage failed');expect(db.prepare('SELECT COUNT(*) n FROM payroll_manual_pay_lines').get().n).toBe(0);
});
it('does not permit a reduction in a posted destination or across agencies',async()=>{
 const r=await review();db.exec("UPDATE payroll_periods SET status='ran',posted_at='2026-11-11' WHERE id=12");await expect(post(r.reviewToken)).rejects.toMatchObject({status:409});
 await expect(buildPayrollCorrectionReview({...args,agencyId:6,destinationPeriodId:13,db:conn})).rejects.toMatchObject({status:400});
});
it('rejects a different client or a stale comparison import',async()=>{
 db.exec("UPDATE payroll_import_rows SET patient_first_name='Different' WHERE id=2");await expect(review()).rejects.toMatchObject({status:400});
 db.exec("UPDATE payroll_import_rows SET patient_first_name='Test client' WHERE id=2; INSERT INTO payroll_imports VALUES(103,2,11,3)");await expect(review()).rejects.toMatchObject({status:409});
});
it('requires evidence of posted payment rather than a payable flag on a later report',async()=>{
 db.exec("UPDATE payroll_import_rows SET note_status='NO_NOTE',draft_payable=0 WHERE id=1");const r=await review();expect(r.canPostReduction).toBe(false);expect(r.original.total).toBeNull();expect(r.blockers.join(' ')).toContain('No posted payment');
});
it('does not post for underpayments, bonus-reconciliation cases, or incomplete replacements',async()=>{
 db.exec('UPDATE payroll_import_rows SET unit_count=8 WHERE id=2');expect((await review()).canPostReduction).toBe(false);
 db.exec('UPDATE payroll_import_rows SET unit_count=3 WHERE id=2');const b=breakdown();b.__paySystem.paySystemBonusTotal=50;db.prepare('UPDATE payroll_summaries SET breakdown=?').run(JSON.stringify(b));expect((await review()).blockers.join(' ')).toContain('bonus');
 db.exec("UPDATE payroll_import_rows SET note_status='NO_NOTE' WHERE id=2");expect((await review()).blockers.join(' ')).toContain('incomplete');
});
it('confirms an actual removal before quoting a complete reversal',async()=>{
 db.exec('DELETE FROM payroll_import_rows WHERE id=2');const r=await buildPayrollCorrectionReview({...args,compareRowId:null,db:conn});expect(r).toMatchObject({reductionAmount:30,canPostReduction:true});
 db.exec("INSERT INTO payroll_import_rows SELECT 3,agency_id,payroll_period_id,102,user_id,provider_name,patient_first_name,service_date,service_code,note_status,draft_payable,unit_count,'still-present' FROM payroll_import_rows WHERE id=1");await expect(buildPayrollCorrectionReview({...args,compareRowId:null,db:conn})).rejects.toMatchObject({status:409});
});
it('includes the original paid auto-indirect amount and refuses mixed historical rates',()=>{
 const row={service_code:'H0032',unit_count:30};const b={H0032:{amount:16,hcodeGrossAmount:17.83,finalizedUnits:30,payMethod:'fixed_rate'}};
 expect(originalServicePay({breakdown:b,row}).total).toBe(17.83);
 expect(originalServicePay({breakdown:{...b,H0032_other:{...b.H0032,displayServiceCode:'H0032'}},row})).toBeNull();
});

it('shows and posts verified underpayment as a separate positive pay-only line',async()=>{
 db.exec('UPDATE payroll_import_rows SET unit_count=8 WHERE id=2');const r=await review();expect(r).toMatchObject({adjustmentType:'additional_pay',additionalPayAmount:32.67,adjustmentAmount:32.67,canPostAdditionalPay:true,canPostReduction:false});
 await postPayrollCorrectionAdditionalPay({...args,reviewToken:r.reviewToken,actorUserId:501},async()=>conn);
 expect(db.prepare('SELECT amount,credits_hours FROM payroll_manual_pay_lines').get()).toMatchObject({amount:32.67,credits_hours:null});
 const meta=JSON.parse(db.prepare('SELECT metadata_json FROM payroll_manual_pay_lines').get().metadata_json);expect(meta.kind).toBe('raw_audit_adjustment');expect(meta.details.some(d=>d.label==='Underpayment addition'&&d.value===32.67)).toBe(true);
});
it('does not allow an underpayment to be posted through the reduction action',async()=>{
 db.exec('UPDATE payroll_import_rows SET unit_count=8 WHERE id=2');const r=await review();await expect(post(r.reviewToken)).rejects.toMatchObject({status:409});expect(db.prepare('SELECT COUNT(*) n FROM payroll_manual_pay_lines').get().n).toBe(0);
});
it('requires review of the existing correction when a later report changes the same session again',async()=>{
 const r=await review();await post(r.reviewToken);db.exec('UPDATE payroll_import_rows SET unit_count=8 WHERE id=2');const changed=await review();expect(changed.correctionKey).toBe(r.correctionKey);expect(changed.canPostAdjustment).toBe(false);expect(changed.existingAdjustment).toBeTruthy();
});

it('also identifies underpayment when the code stays the same and quantity increases',async()=>{
 db.exec("UPDATE payroll_import_rows SET service_code='90837',unit_count=2 WHERE id=2");const r=await review();expect(r).toMatchObject({adjustmentAmount:30,adjustmentType:'additional_pay',canPostAdditionalPay:true});
});

it('does not recoup an apparent service line suppressed by a salary override',async()=>{
 const b=breakdown();b.__adjustments={salaryAmount:2000,salaryIncludeServicePay:false,basePayIsSalaryOverride:true};db.prepare('UPDATE payroll_summaries SET breakdown=?').run(JSON.stringify(b));const r=await review();expect(r.canPostAdjustment).toBe(false);expect(r.original.total).toBeNull();expect(r.blockers.join(' ')).toContain('salary');
});

it('does not reverse a removed code in full when a replacement service is present',async()=>{
 await expect(buildPayrollCorrectionReview({...args,compareRowId:null,db:conn})).rejects.toMatchObject({status:409,message:expect.stringContaining('replacement service')});
});

it('still permits review of a real removal when another unchanged service exists that day',async()=>{
 db.exec("INSERT INTO payroll_import_rows SELECT 3,agency_id,payroll_period_id,101,user_id,provider_name,patient_first_name,service_date,service_code,note_status,draft_payable,unit_count,'other-service' FROM payroll_import_rows WHERE id=2");const r=await buildPayrollCorrectionReview({...args,compareRowId:null,db:conn});expect(r).toMatchObject({reductionAmount:30,canPostReduction:true});
});

it('does not turn an unrecognized replacement code into a zero-pay reversal',async()=>{
 db.exec("UPDATE payroll_import_rows SET service_code='UNCONFIGURED-CODE' WHERE id=2");await expect(review()).rejects.toMatchObject({status:409,message:expect.stringContaining('configured payroll rule')});expect(db.prepare('SELECT COUNT(*) n FROM payroll_manual_pay_lines').get().n).toBe(0);
});
