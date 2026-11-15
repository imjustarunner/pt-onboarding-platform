import {afterAll,beforeAll,expect,it,vi} from 'vitest';import mysql from'mysql2/promise';import fs from'node:fs/promises';import crypto from'node:crypto';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:()=>state.db.getConnection()}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:async(uid,aid,db)=>{const [[row]]=await db.execute('SELECT role FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[uid,aid]);return row||null;}}));
// The isolated SQL fixture supplies approved synthetic rate schedules; it creates no signed live agreement.
vi.mock('../employmentAgreementPolicy.service.js',()=>({effectiveCompensationAgreement:async({userId})=>({id:100+Number(userId),effectiveOn:'2026-01-01',data:{schedule:{nluCompensationPolicyVersion:'nlu-four-category-2026-11-21',category:2,childcareLevel:3,childcareRatesByBand:Number(userId)===7?{1:26,2:31,3:35,4:39}:{1:22,2:26,3:28,4:30}}}}),agreementRateProfile:(_,agreement)=>agreement.data.schedule}));
import{recordChildcareAction,childcareWorkReview,previewChildcarePay,getChildcareShift,childcareContext,listChildcareShifts}from'../childcare.service.js';import{childcareClaimAmount}from'../childcarePay.service.js';import PayrollTimeClaim from '../../models/PayrollTimeClaim.model.js';
const socket=process.env.EVIDENCE_TEST_SOCKET,schema='childcare_review_'+crypto.randomBytes(5).toString('hex');let admin;
beforeAll(async()=>{if(!socket)return;admin=await mysql.createConnection({socketPath:socket,user:'root',multipleStatements:true});await admin.query(`CREATE DATABASE ${schema}`);state.db=mysql.createPool({socketPath:socket,user:'root',database:schema,timezone:'Z',dateStrings:true,multipleStatements:true,connectionLimit:6});await state.db.query(`
CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(200),slug VARCHAR(100),feature_flags JSON,is_active INT DEFAULT 1,is_archived INT DEFAULT 0);
CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(32),status VARCHAR(32) DEFAULT 'ACTIVE_EMPLOYEE',is_active INT DEFAULT 1,is_archived INT DEFAULT 0,is_assistant_account INT DEFAULT 0,terminated_at DATETIME NULL,first_name VARCHAR(50),last_name VARCHAR(50),email VARCHAR(255));
CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active INT DEFAULT 1,role VARCHAR(32));
CREATE TABLE company_events(id INT PRIMARY KEY,agency_id INT,created_by_user_id INT,title VARCHAR(200),description TEXT,starts_at DATETIME,ends_at DATETIME,timezone VARCHAR(80),school_event_status VARCHAR(32),is_active INT DEFAULT 1);
CREATE TABLE company_event_provider_assignments(id INT AUTO_INCREMENT PRIMARY KEY,company_event_id INT,provider_user_id INT);
CREATE TABLE skill_builders_event_kiosk_punches(id INT AUTO_INCREMENT PRIMARY KEY,company_event_id INT,user_id INT,punch_type VARCHAR(24),punched_at DATETIME(3),payroll_time_claim_id INT NULL);
CREATE TABLE payroll_time_claims(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,user_id INT,submitted_by_user_id INT,status VARCHAR(32),claim_type VARCHAR(32),claim_date DATE,payload_json JSON,credits_hours DECIMAL(12,6),bucket VARCHAR(32));
CREATE TABLE user_activity_log(id INT AUTO_INCREMENT PRIMARY KEY,action_type VARCHAR(100),user_id INT,agency_id INT,metadata JSON);
INSERT INTO agencies VALUES(453,'Synthetic NLU','nlu-qa-demo',JSON_OBJECT(),1,0),(450,'Synthetic other','auricwell-qa-demo',JSON_OBJECT(),1,0);
INSERT INTO users(id,role,first_name,last_name) VALUES(1,'admin','QA','Reviewer'),(7,'provider','QA','Caregiver A'),(8,'staff','QA','Caregiver B'),(9,'admin','QA','Other agency'),(10,'staff','QA','Work reviewer'),(1496,'provider','Finley','QA automation');
INSERT INTO user_agencies VALUES(1,453,1,'admin'),(7,453,1,'provider'),(8,453,1,'staff'),(9,450,1,'admin'),(10,453,1,'staff'),(1496,453,1,'provider');
INSERT INTO company_events VALUES(80,453,1,'Synthetic shift','', '2026-11-01 17:00:00','2026-11-01 20:00:00','America/Denver',NULL,1);
INSERT INTO company_event_provider_assignments(company_event_id,provider_user_id) VALUES(80,7),(80,8),(80,1496);
`);
 for(const name of ['1814_childcare_shifts_and_pay_snapshots.sql','1827_childcare_work_review.sql']){const sql=await fs.readFile(new URL('../../../../database/migrations/'+name,import.meta.url),'utf8');for(const statement of sql.split(';').filter(x=>x.trim()))await state.db.query(statement);}
 await state.db.query("INSERT INTO childcare_service_grants(agency_id,user_id,enabled,self_schedule,manage_schedule,granted_by_user_id) VALUES(453,7,1,1,0,1),(453,8,1,1,0,1),(453,1496,1,1,0,1)");
 await state.db.query("INSERT INTO childcare_shifts(id,agency_id,company_event_id,planned_children,minimum_hourly_rate,wage_floor_jurisdiction,created_by_user_id) VALUES(8,453,80,3,19.29,'Synthetic test jurisdiction',1)");
},30000);
afterAll(async()=>{if(state.db)await state.db.end();if(admin){await admin.query(`DROP DATABASE ${schema}`);await admin.end();}});
it.skipIf(!socket)('keeps co-caregiver actual intervals, count changes, separate approval and corrected time consistent in real SQL',async()=>{
 const action=(userId,kind,actualChildren,at)=>recordChildcareAction({shiftId:8,userId,action:kind,actualChildren,idempotencyKey:kind+'-'+userId+'-'+at,now:new Date(at)});
 await action(7,'clock-in',3,'2026-11-01T17:00:00Z');await action(8,'clock-in',3,'2026-11-01T17:30:00Z');await action(7,'attendance',5,'2026-11-01T18:00:00Z');await action(7,'clock-out',5,'2026-11-01T20:00:00Z');await action(8,'clock-out',5,'2026-11-01T20:00:00Z');
 const payA=await previewChildcarePay({shiftId:8,userId:7}),payB=await previewChildcarePay({shiftId:8,userId:8});expect(payA).toMatchObject({totalMinutes:180,totalAmount:103,claimStatus:'deferred'});expect(payB).toMatchObject({totalMinutes:150,totalAmount:69,claimStatus:'deferred'});
 let [claims]=await state.db.query('SELECT * FROM payroll_time_claims ORDER BY user_id');expect(claims).toHaveLength(2);expect(()=>childcareClaimAmount({...claims[0],payload:claims[0].payload_json})).toThrow('sign off');
 await expect(childcareWorkReview.submit({shiftId:8,userId:7})).rejects.toMatchObject({status:400});await childcareWorkReview.submit({shiftId:8,userId:7,confirmed:true});const retry=await childcareWorkReview.submit({shiftId:8,userId:7,confirmed:true});expect(retry.alreadyProcessed).toBe(true);
 let current=(await getChildcareShift({shiftId:8,userId:1})).shift;const review=current.workReviews.find(r=>r.user_id===7);
 await expect(childcareWorkReview.review({shiftId:8,userId:7,targetUserId:7,decision:'approved',note:'Own work',confirmed:true,snapshotHash:review.snapshot_hash})).rejects.toMatchObject({status:403});
 await expect(childcareWorkReview.review({shiftId:8,userId:9,targetUserId:7,decision:'approved',note:'Wrong agency',confirmed:true,snapshotHash:review.snapshot_hash})).rejects.toMatchObject({status:403});
 await expect(childcareWorkReview.review({shiftId:8,userId:1,agencyId:450,targetUserId:7,decision:'approved',note:'Wrong selected agency',confirmed:true,snapshotHash:review.snapshot_hash})).rejects.toMatchObject({status:403});
 await childcareWorkReview.review({shiftId:8,userId:1,targetUserId:7,decision:'approved',note:'Reviewed actual intervals and counts.',confirmed:true,snapshotHash:review.snapshot_hash});
 const [[approved]]=await state.db.query('SELECT * FROM payroll_time_claims WHERE user_id=7');expect(approved.status).toBe('submitted');expect(childcareClaimAmount({...approved,payload:approved.payload_json})).toBe(103);
 const [[punchesBefore]]=await state.db.query('SELECT COUNT(*) total FROM skill_builders_event_kiosk_punches');
 const correction={shiftId:8,userId:7,intervals:[{startedAt:'2026-11-01T16:45:00Z',endedAt:'2026-11-01T20:00:00Z'}],actualChildren:3,reason:'Synthetic missed first fifteen minutes.',idempotencyKey:'qa-work-correction'};
 await childcareWorkReview.requestCorrection(correction);expect((await childcareWorkReview.requestCorrection(correction)).alreadyProcessed).toBe(true);current=(await getChildcareShift({shiftId:8,userId:1})).shift;const time=current.timeCorrections[0];
 await childcareWorkReview.reviewCorrection({shiftId:8,userId:1,correctionId:time.id,decision:'approved',note:'Verified start and count; original punches retained.'});
 const corrected=await previewChildcarePay({shiftId:8,userId:7});expect(corrected).toMatchObject({totalMinutes:195,totalAmount:111.75,claimStatus:'deferred'});const [[punchesAfter]]=await state.db.query('SELECT COUNT(*) total FROM skill_builders_event_kiosk_punches');expect(punchesAfter.total).toBe(punchesBefore.total);
 current=(await getChildcareShift({shiftId:8,userId:1})).shift;expect(current.workReviews.find(r=>r.user_id===7).status).toBe('draft');
 await expect(childcareWorkReview.review({shiftId:8,userId:1,targetUserId:7,decision:'approved',confirmed:true,note:'Stale review',snapshotHash:review.snapshot_hash})).rejects.toMatchObject({status:409});
 await expect(previewChildcarePay({shiftId:8,userId:7,targetUserId:8})).rejects.toMatchObject({status:403});
 const own=(await getChildcareShift({shiftId:8,userId:8})).shift;expect(own.workReviews).toHaveLength(0);expect(own.timeCorrections).toHaveLength(0);
 const [[audit]]=await state.db.query("SELECT COUNT(*) total FROM user_activity_log WHERE action_type='childcare_work_submitted'");expect(Number(audit.total)).toBe(1);
});

it.skipIf(!socket)('supports an assigned review-only employee without granting scheduling or peer compensation',async()=>{
 await state.db.query("INSERT INTO childcare_service_grants(agency_id,user_id,enabled,self_schedule,manage_schedule,approve_work,granted_by_user_id) VALUES(453,10,1,0,0,1,1)");
 expect(await childcareContext({agencyId:453,userId:10})).toMatchObject({canApprove:true,canManage:false,canManagePay:false,canSchedule:false});
 const data=await listChildcareShifts({agencyId:453,userId:10});expect(data.shifts).toHaveLength(1);
 await expect(previewChildcarePay({shiftId:8,userId:10,targetUserId:7})).rejects.toMatchObject({status:403});
});
it.skipIf(!socket)('blocks corrections overlapping an unclosed punch or another approved correction',async()=>{
 await state.db.query("INSERT INTO company_events VALUES(81,453,1,'Other synthetic shift','','2026-11-02 17:00:00','2026-11-02 19:00:00','America/Denver',NULL,1)");
 await state.db.query("INSERT INTO childcare_shifts(id,agency_id,company_event_id,planned_children,created_by_user_id) VALUES(9,453,81,3,1)");
 await state.db.query("INSERT INTO skill_builders_event_kiosk_punches(company_event_id,user_id,punch_type,punched_at) VALUES(81,7,'clock_in','2026-11-02 17:00:00')");
 await childcareWorkReview.requestCorrection({shiftId:8,userId:7,intervals:[{startedAt:'2026-11-02T18:00:00Z',endedAt:'2026-11-02T19:00:00Z'}],actualChildren:3,reason:'Synthetic overlap negative.',idempotencyKey:'qa-overlap-correction'});
 let shift=(await getChildcareShift({shiftId:8,userId:1})).shift,correctionId=shift.timeCorrections[0].id;
 await expect(childcareWorkReview.reviewCorrection({shiftId:8,userId:1,correctionId,decision:'approved',note:'Should not approve.'})).rejects.toMatchObject({status:409});
 await state.db.query("INSERT INTO childcare_time_corrections(shift_id,user_id,intervals_json,actual_children,reason,request_key,status,reviewed_at) VALUES(9,7,?,3,'Synthetic reviewed interval','other-reviewed-time','approved',UTC_TIMESTAMP(3))",[JSON.stringify([{startedAt:'2026-11-02T18:00:00Z',endedAt:'2026-11-02T19:00:00Z'}])]);
 await expect(childcareWorkReview.reviewCorrection({shiftId:8,userId:1,correctionId,decision:'approved',note:'Should still not approve.'})).rejects.toMatchObject({status:409});
 await childcareWorkReview.reviewCorrection({shiftId:8,userId:1,correctionId,decision:'rejected',note:'Overlaps separately recorded work.'});
 shift=(await getChildcareShift({shiftId:8,userId:1})).shift;expect(shift.timeCorrections.find(c=>c.id===correctionId).status).toBe('rejected');
});

it.skipIf(!socket)('atomically rejects payroll approval if current work signoff was invalidated after the preview',async()=>{
 await state.db.query(`ALTER TABLE payroll_time_claims ADD COLUMN target_payroll_period_id INT NULL,ADD COLUMN applied_amount DECIMAL(12,2),ADD COLUMN approved_by_user_id INT NULL,ADD COLUMN approved_at DATETIME,ADD COLUMN rejection_reason TEXT,ADD COLUMN rejected_by_user_id INT NULL,ADD COLUMN rejected_at DATETIME;
 CREATE TABLE payroll_periods(id INT PRIMARY KEY,agency_id INT,status VARCHAR(32),posted_at DATETIME,finalized_at DATETIME);
 INSERT INTO payroll_periods VALUES(40,453,'draft',NULL,NULL)`);
 const [[claim]]=await state.db.query('SELECT * FROM payroll_time_claims WHERE user_id=7');
 const payload=claim.payload_json;await state.db.query("UPDATE payroll_time_claims SET status='submitted',payload_json=JSON_SET(payload_json,'$.childcareWorkApproved',CAST('false' AS JSON)) WHERE id=?",[claim.id]);
 await expect(PayrollTimeClaim.approve({id:claim.id,approverUserId:1,targetPayrollPeriodId:40,appliedAmount:111.75,childcareSnapshotHash:payload.childcareSnapshotHash,requireSubmitted:true,db:state.db})).rejects.toMatchObject({status:409,code:'PAYROLL_SOURCE_CHANGED'});
 const [[after]]=await state.db.query('SELECT status,applied_amount FROM payroll_time_claims WHERE id=?',[claim.id]);expect(after.status).toBe('submitted');expect(after.applied_amount).toBeNull();
 await state.db.query("UPDATE payroll_time_claims SET payload_json=JSON_SET(payload_json,'$.childcareWorkApproved',CAST('true' AS JSON)) WHERE id=?",[claim.id]);
 const allowed=await PayrollTimeClaim.approve({id:claim.id,approverUserId:1,targetPayrollPeriodId:40,appliedAmount:111.75,childcareSnapshotHash:payload.childcareSnapshotHash,requireSubmitted:true,db:state.db});expect(allowed.status).toBe('approved');
});

it.skipIf(!socket)('requires review for retained unapproved drafts without changing approved or paid earnings',async()=>{
 await state.db.query("INSERT INTO payroll_time_claims(id,agency_id,user_id,status,claim_type,payload_json,applied_amount) VALUES(901,453,7,'submitted','childcare_shift',JSON_OBJECT(),NULL),(902,453,7,'approved','childcare_shift',JSON_OBJECT(),77),(903,453,7,'paid','childcare_shift',JSON_OBJECT(),88)");
 const migration=await fs.readFile(new URL('../../../../database/migrations/1827_childcare_work_review.sql',import.meta.url),'utf8');
 await state.db.query(migration.slice(migration.indexOf('UPDATE payroll_time_claims')));
 const [rows]=await state.db.query('SELECT id,status,applied_amount,payload_json FROM payroll_time_claims WHERE id>=901 ORDER BY id');
 expect(rows.map(r=>r.status)).toEqual(['deferred','approved','paid']);expect(rows[0].payload_json).toMatchObject({childcareWorkApprovalRequired:true,childcareWorkApproved:false});expect(rows[1].applied_amount).toBe('77.00');expect(rows[2].applied_amount).toBe('88.00');
});

it.skipIf(!socket)('new childcare audit rows identify the reserved QA actor and retain action/object facts',async()=>{
 await getChildcareShift({shiftId:8,userId:1496});const [[row]]=await state.db.query("SELECT metadata FROM user_activity_log WHERE user_id=1496 AND action_type='childcare_shift_viewed' ORDER BY id DESC LIMIT 1");expect(row.metadata).toMatchObject({shiftId:8,eventId:80,automationActor:{kind:'qa_automation',actorUserId:1496,qaAgencyBoundary:[453,454]}});
});
