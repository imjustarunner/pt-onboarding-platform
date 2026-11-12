import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const state=vi.hoisted(()=>({connection:null,db:null,schema:null,cloned:new Set()}));
vi.mock('../../config/database.js',()=>({
 default:{execute:(...args)=>state.db.execute(...args),query:(...args)=>state.db.query(...args),getConnection:async()=>({...state.db,release(){}})},
 onTableWrite:()=>{}
}));
// These two unrelated scheduling/access dependencies are deliberately isolated;
// agreement selection, rates, time/attendance, claims and payroll remain real.
vi.mock('../appointmentConflict.service.js',()=>({assertAppointmentWindowAvailable:async()=>{}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:async userId=>({role:Number(userId)===900001?'admin':'staff',capabilities:{}})}));
import {createEmployeeCompensationDraft} from '../employeeCompensationDraft.service.js';
import {saveCompensationDraft,releaseCompensationDraft} from '../compensationDraft.service.js';
import {effectiveCompensationAgreement,agreementRateProfile} from '../employmentAgreementPolicy.service.js';
import {saveChildcareGrant,createChildcareShift,recordChildcareAction,previewChildcarePay} from '../childcare.service.js';
import {calculateChildcarePay,childcareClaimAmount,childcareSnapshotHash} from '../childcarePay.service.js';
import {computeNluServicePay,NLU_COMPENSATION_POLICY_VERSION} from '../../content/nluCompensationPolicy.js';
import {SERVICE_CREDIT_POLICY_VERSION} from '../../utils/serviceCreditPolicy.js';
import PayrollTimeClaim from '../../models/PayrollTimeClaim.model.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollSummary from '../../models/PayrollSummary.model.js';
import {recomputeSummariesFromStaging,listMyPayroll} from '../../controllers/payroll.controller.js';

const SOURCE_SCHEMA='onboarding_stage',ADMIN=900001,FIRST=900002,SECOND=900003,AGENCY=453;
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const initialSchedule={nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,category:2,level:3,clinicalEligible:false,creditRate:null,creditRateProbation:null,hcodeRate:null,hcodeRateProbation:null,indirectRate:20,supportRate:20,autoIndirectMinutes:20,tier3LevelBonus:9,tutoringLevel:4,tutoringCategory:2,tutoringRates:{virtual:25,in_person:27},childcareLevel:1,childcareRatesByBand:{1:17,2:20,3:22,4:23},serviceRoles:['tutoring']};
let pushId,oldAgreementId,newAgreementId,secondAgreementId,shiftId,periodId;

async function cloneDefinition(table){
 if(!/^[a-z][a-z0-9_]*$/.test(table))throw new Error('Unsafe table definition reference.');
 if(state.cloned.has(table))return;
 const [[definition]]=await state.connection.query(`SHOW CREATE TABLE ${SOURCE_SCHEMA}.${table}`);
 const sql=definition['Create Table'].split('\n').filter(line=>!line.includes('FOREIGN KEY')).join('\n').replace(/,\s*\)/g,')');
 await state.connection.query(sql);state.cloned.add(table);
}
async function isolatedQuery(method,sql,params){
 if(!state.schema||!/^nlu_childcare_signed_test_\d+_\d+$/.test(state.schema))throw new Error('The owned test schema must be selected.');
 if(/\b(?:onboarding_stage|onboarding_prod)\s*\./i.test(sql))throw new Error('Application data access is prohibited in this isolated test.');
 try{return await state.connection[method](sql,params);}catch(error){
  // Payroll probes a wide optional surface. Add only missing table definitions,
  // never rows. All statements still execute in the owned synthetic schema.
  const missing=error.code==='ER_NO_SUCH_TABLE'&&String(error.sqlMessage).match(/Table '([^']+)\.([a-z][a-z0-9_]*)' doesn't exist/);
  if(!missing||missing[1]!==state.schema)throw error;
  await cloneDefinition(missing[2]);return state.connection[method](sql,params);
 }
}
async function executedFixture({userId,effectiveDate,schedule,generationId=null,mergeTokens=false,agencyId=AGENCY}){
 let taskId;
 if(generationId){const [[g]]=await state.db.execute('SELECT task_id FROM contract_generations WHERE id=?',[generationId]);taskId=g.task_id;}
 else{
  const [task]=await state.db.execute("INSERT INTO tasks(task_type,document_action_type,title,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,metadata,status,is_required) VALUES ('document','signature',?,?,?,?,?,'completed',1)",['SYNTHETIC TEST FIXTURE — not a real signature',userId,agencyId,ADMIN,JSON.stringify({contractGeneration:true,effectiveDate})]);taskId=task.insertId;
  const data=mergeTokens?{COMPENSATION_POLICY_VERSION:NLU_COMPENSATION_POLICY_VERSION,COMPENSATION_SCHEDULE:schedule,EFFECTIVE_DATE:effectiveDate,CONTRACT_SERVICE_ROLES:['tutoring']}:{draftKind:'provider_update_compensation',compensationPolicyVersion:SERVICE_CREDIT_POLICY_VERSION,effectiveDate,schedule};
  const [generation]=await state.db.execute('INSERT INTO contract_generations(agency_id,candidate_user_id,token_values_json,rendered_html,created_by_user_id,task_id) VALUES (?,?,?,?,?,?)',[agencyId,userId,JSON.stringify(data),'SYNTHETIC SQL FIXTURE ONLY',ADMIN,taskId]);generationId=generation.insertId;
 }
 // Synthetic execution metadata tests the reader. It is not a human attestation,
 // a signing-flow pass, a generated PDF or a real employee agreement.
 await state.db.execute('INSERT INTO signed_documents(template_version,user_id,task_id,signed_pdf_path,signed_at,audit_trail) VALUES (1,?,?,?,?,?)',[userId,taskId,'SYNTHETIC-TEST-NOT-A-REAL-SIGNED-PDF',`${effectiveDate} 18:00:00`,JSON.stringify({syntheticTestFixture:true,adminCountersign:{signedAt:`${effectiveDate}T18:00:00Z`,userId:ADMIN}})]);
 return generationId;
}
async function issueReviewedFixture(userId,bands,{initialAgreement=false}={}){
 const created=await createEmployeeCompensationDraft(AGENCY,{userId,pushId,countersignerUserId:ADMIN,effectiveDate:'2026-11-19',initialAgreement},ADMIN,{now:new Date('2026-11-12T20:00:00Z')});
 const saved=await saveCompensationDraft(AGENCY,created.id,{expectedHtml:created.html,schedule:{category:2,level:3,childcareLevel:3,childcareRatesByBand:bands,indirectRate:20,supportRate:20}},ADMIN);
 expect(saved.issues).toEqual([]);
 await releaseCompensationDraft(AGENCY,created.id,{expectedHtml:saved.html,pushId},ADMIN);
 await executedFixture({userId,effectiveDate:'2026-11-19',generationId:created.id});
 return created.id;
}

describe.runIf(process.env.CHILDCARE_SIGNED_MYSQL_TESTS==='1')('signed childcare compensation through isolated MySQL payroll and paystub snapshots',()=>{
 beforeAll(async()=>{
  if(process.env.DB_HOST!=='127.0.0.1'||process.env.DB_NAME!==SOURCE_SCHEMA)throw new Error('Use the reviewed localhost proxy for definition-only source reads.');
  const mysql=await import('mysql2/promise');
  state.connection=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:SOURCE_SCHEMA,timezone:'Z',dateStrings:true,charset:'utf8mb4_unicode_ci'});
  const schema=`nlu_childcare_signed_test_${Date.now()}_${process.pid}`;
  if(!/^nlu_childcare_signed_test_\d+_\d+$/.test(schema))throw new Error('Invalid owned test schema name.');
  await state.connection.query(`CREATE DATABASE ${schema}`);state.schema=schema;await state.connection.changeUser({database:schema});
  console.info(`Created ${schema}: definitions and synthetic fixtures only; application data untouched.`);
  state.db={execute:(sql,params=[])=>isolatedQuery('execute',sql,params),query:(sql,params=[])=>isolatedQuery('query',sql,params),beginTransaction:()=>state.connection.beginTransaction(),commit:()=>state.connection.commit(),rollback:()=>state.connection.rollback(),release(){}};
  for(const table of ['agencies','users','user_agencies','company_events','company_event_provider_assignments','company_event_audiences','skill_builders_event_kiosk_punches','payroll_time_claims','user_activity_log','tasks','contract_generations','signed_documents','user_specific_documents','provider_update_pushes','provider_update_recipients','payroll_compensation_authorizations','payroll_periods','payroll_summaries','payroll_user_compensation_levels','payroll_compensation_levels','payroll_pay_system_rates'])await cloneDefinition(table);
  const migration=await fs.readFile(new URL('../../../../database/migrations/1814_childcare_shifts_and_pay_snapshots.sql',import.meta.url),'utf8');
  for(const statement of migration.split(';').map(value=>value.trim()).filter(Boolean))await state.connection.query(statement);
  const flags={qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6},nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,nluCompensationEffectiveOn:'2026-11-12'};
  await state.db.execute('INSERT INTO agencies(id,name,slug,is_active,feature_flags) VALUES (453,?,?,1,?)',['SYNTHETIC SQL QA ONLY','nlu-qa-demo',JSON.stringify(flags)]);
  for(const [id,role]of [[ADMIN,'admin'],[FIRST,'staff'],[SECOND,'staff']]){
   await state.db.execute("INSERT INTO users(id,email,first_name,last_name,role,status,is_active) VALUES (?,?,?,?,?,'ACTIVE_EMPLOYEE',1)",[id,`synthetic-isolated-${id}@example.com`,'Synthetic',`Isolated ${id}`,role]);
   await state.db.execute('INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES (?,453,1)',[id]);
  }
  const [push]=await state.db.execute("INSERT INTO provider_update_pushes(agency_id,title,status,section_config_json,created_by_user_id,amendment_plan_json) VALUES (453,?,'draft',?,?,?)",['SYNTHETIC ISOLATED COMPENSATION TEST',JSON.stringify({amendments:true}),ADMIN,JSON.stringify({mode:'compensation'})]);pushId=push.insertId;
  oldAgreementId=await executedFixture({userId:FIRST,effectiveDate:'2026-11-12',schedule:initialSchedule,mergeTokens:true});
  newAgreementId=await issueReviewedFixture(FIRST,{1:21,2:26,3:30,4:33});
  secondAgreementId=await issueReviewedFixture(SECOND,{1:25,2:31,3:36,4:40},{initialAgreement:true});
 },120000);
 afterAll(async()=>{try{if(state.schema){await state.connection.query(`DROP DATABASE ${state.schema}`);console.info(`Removed owned isolated schema ${state.schema}.`);}}finally{await state.connection?.end();}},30000);

 it('selects the actual signed old/new/future schedule by work date and preserves unaffected tutoring pay/indirect terms',async()=>{
  await executedFixture({userId:FIRST,effectiveDate:'2026-11-21',schedule:{...initialSchedule,childcareLevel:3,childcareRatesByBand:{1:50,2:60,3:70,4:80}}});
  const before=await effectiveCompensationAgreement({agencyId:AGENCY,userId:FIRST,asOfDate:'2026-11-18'},state.db);
  const current=await effectiveCompensationAgreement({agencyId:AGENCY,userId:FIRST,asOfDate:'2026-11-19'},state.db);
  const future=await effectiveCompensationAgreement({agencyId:AGENCY,userId:FIRST,asOfDate:'2026-11-21'},state.db);
  expect(before.id).toBe(oldAgreementId);expect(current.id).toBe(newAgreementId);expect(future.data.schedule.childcareRatesByBand[3]).toBe(70);
  const profile=agreementRateProfile({},current);
  expect(profile).toMatchObject({childcareLevel:3,childcareRatesByBand:{1:21,2:26,3:30,4:33},tutoringRates:{virtual:25,in_person:27},autoIndirectMinutesPerHour:20});
  expect(computeNluServicePay({profile,status:{asOfDate:'2026-11-19'},serviceCode:'TUTORING',actualMinutes:60,serviceContext:{format:'in_person',minimumHourlyRate:15,wageFloorJurisdiction:'Synthetic test jurisdiction'}})).toMatchObject({rate:27,amount:27,autoIndirectHours:20/60});
  const [[old]]=await state.db.execute('SELECT token_values_json FROM contract_generations WHERE id=?',[oldAgreementId]);expect(parse(old.token_values_json).COMPENSATION_SCHEDULE).toEqual(initialSchedule);
 });

 it('persists real punches, changing co-caregiver ratios and separate signed overrides in immutable approved claim snapshots',async()=>{
  for(const userId of [FIRST,SECOND])await saveChildcareGrant({agencyId:AGENCY,userId:ADMIN,targetUserId:userId,enabled:true,selfSchedule:true});
  const result=await createChildcareShift({agencyId:AGENCY,userId:ADMIN,startsAt:'2026-11-19T16:00:00-07:00',endsAt:'2026-11-19T19:00:00-07:00',timezone:'America/Denver',plannedChildren:3,providerUserIds:[FIRST,SECOND],minimumHourlyRate:15,wageFloorJurisdiction:'SYNTHETIC TEST ONLY — not an asserted legal wage floor'});shiftId=result.shift.id;
  for(const [userId,action,at]of [[FIRST,'clock-in','2026-11-19T23:00:00Z'],[SECOND,'clock-in','2026-11-20T00:00:00Z'],[SECOND,'clock-out','2026-11-20T01:00:00Z'],[FIRST,'clock-out','2026-11-20T02:00:00Z']])await recordChildcareAction({shiftId,userId,action,actualChildren:3,idempotencyKey:`isolated-${userId}-${action}`,now:new Date(at)});
  await recordChildcareAction({shiftId,userId:FIRST,action:'clock-out',actualChildren:3,idempotencyKey:`isolated-${FIRST}-clock-out`,now:new Date('2026-11-20T02:00:00Z')});
  const first=await previewChildcarePay({shiftId,userId:FIRST}),second=await previewChildcarePay({shiftId,userId:SECOND});
  expect(first).toMatchObject({totalMinutes:180,totalAmount:86,reviewRequired:false});expect(second).toMatchObject({totalMinutes:60,totalAmount:31,reviewRequired:false});
  expect(first.segments.map(segment=>({band:segment.band,rate:segment.rate,minutes:segment.minutes,scheduleId:segment.scheduleId}))).toEqual([{band:3,rate:30,minutes:60,scheduleId:newAgreementId},{band:2,rate:26,minutes:60,scheduleId:newAgreementId},{band:3,rate:30,minutes:60,scheduleId:newAgreementId}]);
  expect(second.segments[0]).toMatchObject({band:2,caregivers:2,rate:31,scheduleId:secondAgreementId});
  const period=await PayrollPeriod.create({agencyId:AGENCY,label:'SYNTHETIC ISOLATED DRAFT — NEVER EXPORT',periodStart:'2026-11-15',periodEnd:'2026-11-28',createdByUserId:ADMIN});periodId=period.id;
  const [claims]=await state.db.execute("SELECT id FROM payroll_time_claims WHERE claim_type='childcare_shift' ORDER BY user_id");expect(claims).toHaveLength(2);
  for(const {id}of claims){const claim=await PayrollTimeClaim.findById(id,state.db);expect(claim.payload.childcareSnapshotHashVersion).toBe(2);expect(claim.payload.childcareSnapshotHash).toBe(childcareSnapshotHash(claim.payload.childcareSnapshot));const amount=childcareClaimAmount(claim);await PayrollTimeClaim.approve({id,approverUserId:ADMIN,targetPayrollPeriodId:periodId,appliedAmount:amount,bucket:'direct',creditsHours:claim.payload.childcareSnapshot.totalMinutes/60,childcareSnapshotHash:claim.payload.childcareSnapshotHash,requireSubmitted:true,db:state.db});}
  // Reproduce the previous writer's native object-order hash and MySQL JSON
  // roundtrip for an already-approved historical fixture. Its earnings remain
  // the original snapshot amount and are never reinterpreted at today's rates.
  const [[shift]]=await state.db.execute('SELECT * FROM childcare_shifts WHERE id=?',[shiftId]);
  const [punchRows]=await state.db.execute('SELECT * FROM skill_builders_event_kiosk_punches WHERE company_event_id=?',[shift.company_event_id]);
  const [attendanceRows]=await state.db.execute('SELECT * FROM childcare_attendance_events WHERE shift_id=?',[shiftId]);
  const native=await calculateChildcarePay({shift,userId:FIRST,punches:punchRows,attendance:attendanceRows,db:state.db});
  const historic=await PayrollTimeClaim.findById(claims[0].id,state.db),legacyHash=createHash('sha256').update(JSON.stringify(native)).digest('hex');
  expect(historic.payload.childcareSnapshot).toEqual(native);delete historic.payload.childcareSnapshotHashVersion;historic.payload.childcareSnapshotHash=legacyHash;
  await state.db.execute('UPDATE payroll_time_claims SET payload_json=? WHERE id=?',[JSON.stringify(historic.payload),historic.id]);
  await state.db.execute('UPDATE childcare_pay_snapshots SET snapshot_hash=? WHERE payroll_time_claim_id=?',[legacyHash,historic.id]);
  expect(childcareClaimAmount(await PayrollTimeClaim.findById(historic.id,state.db))).toBe(86);
  await recordChildcareAction({shiftId,userId:ADMIN,action:'attendance',actualChildren:3,idempotencyKey:'unchanged-historical-attendance',now:new Date('2026-11-20T02:05:00Z')});
  const unchanged=await PayrollTimeClaim.findById(historic.id,state.db);expect(unchanged.payload.childcareSnapshotHash).toBe(legacyHash);expect(unchanged.payload).not.toHaveProperty('childcareSnapshotHashVersion');expect(Number(unchanged.applied_amount)).toBe(86);
  expect(await previewChildcarePay({shiftId,userId:FIRST})).toMatchObject({totalAmount:86,reviewRequired:false,correctionReviewRequired:false,claimStatus:'approved'});
  const [[corrections]]=await state.db.execute("SELECT COUNT(*) AS count FROM user_activity_log WHERE action_type='childcare_pay_correction_required'");expect(Number(corrections.count)).toBe(0);
  const [[punches]]=await state.db.execute('SELECT COUNT(*) AS count FROM skill_builders_event_kiosk_punches');expect(Number(punches.count)).toBe(4);
 });

 it('runs the real payroll recompute and reads stored paystub lines with exact bands, override labels and no duplicate indirect compensation',async()=>{
  await recomputeSummariesFromStaging({payrollPeriodId:periodId,agencyId:AGENCY});
  const summaries=await PayrollSummary.listForPeriod(periodId);expect(summaries).toHaveLength(2);
  const first=summaries.find(row=>Number(row.user_id)===FIRST),second=summaries.find(row=>Number(row.user_id)===SECOND);
  expect(Number(first.total_amount)).toBe(86);expect(Number(first.direct_hours)).toBe(3);expect(Number(first.indirect_hours)).toBe(0);expect(Number(second.total_amount)).toBe(31);
  const lines=first.breakdown.__adjustments.lines.filter(line=>line.meta?.childcareShiftId===shiftId);
  expect(lines.map(line=>({amount:line.amount,band:line.meta.band,rate:line.meta.rate}))).toEqual([{amount:30,band:3,rate:30},{amount:26,band:2,rate:26},{amount:30,band:3,rate:30}]);expect(lines.every(line=>line.label.includes('employee rate override'))).toBe(true);
  const before=JSON.stringify(first.breakdown.__adjustments.lines);await recomputeSummariesFromStaging({payrollPeriodId:periodId,agencyId:AGENCY});expect(JSON.stringify((await PayrollSummary.listForPeriod(periodId)).find(row=>Number(row.user_id)===FIRST).breakdown.__adjustments.lines)).toBe(before);
  // The own-paystub API exposes posted snapshots. Only this owned fixture row is
  // marked posted to test that reader; no payroll run, external export or payment.
  await state.db.execute("UPDATE payroll_periods SET status='posted' WHERE id=?",[periodId]);
  const req={user:{id:FIRST,role:'staff'},query:{agencyId:AGENCY}},res={json:vi.fn(),status:vi.fn().mockReturnThis()},next=vi.fn();await listMyPayroll(req,res,next);expect(next).not.toHaveBeenCalled();
  const own=res.json.mock.calls[0][0];expect(own).toHaveLength(1);expect(Number(own[0].user_id)).toBe(FIRST);expect(own[0].breakdown.__adjustments.lines.map(line=>line.meta?.rate)).toEqual([30,26,30]);
  const [[exports]]=await state.db.execute('SELECT COUNT(*) AS count FROM payroll_adp_export_jobs');expect(Number(exports.count)).toBe(0);
 });
});
