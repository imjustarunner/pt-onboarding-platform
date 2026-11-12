import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:vi.fn(async(_uid,_aid,db)=>({role:db.scopedRole||'provider'}))}));
vi.mock('../employmentAgreementPolicy.service.js',()=>({
 effectiveCompensationAgreement:vi.fn(async()=>({id:72,effectiveOn:'2026-11-18',data:{schedule:{nluCompensationPolicyVersion:'nlu-four-category-2026-11-21',category:2,childcareLevel:3,childcareRatesByBand:{1:26,2:31,3:35,4:39}}}})),
 agreementRateProfile:vi.fn((_,agreement)=>agreement.data.schedule)
}));
import pool from '../../config/database.js';
import {recordChildcareAction} from '../childcare.service.js';
import {childcareClaimAmount} from '../childcarePay.service.js';

function memoryShift({role='provider'}={}) {
 const state={shift:{id:8,agency_id:453,company_event_id:80,title:'Childcare',planned_children:3,actual_children:null,attendance_version:0,attendance_review_required:0,starts_at:'2026-11-19T23:00:00Z',ends_at:'2026-11-20T02:00:00Z',timezone:'America/Denver',status:'scheduled',is_active:1,minimum_hourly_rate:17,wage_floor_jurisdiction:'QA confirmed location'},punches:[],attendance:[],receipts:new Map(),snapshot:null,claim:null};
 let nextId=100;
 const db={scopedRole:role,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,p=[])=>{
  if(sql.startsWith('SELECT id FROM users'))return [[{id:7}]];
  if(sql.startsWith('SELECT s.*,e.title'))return [[{...state.shift}]];
  if(sql.startsWith('SELECT id,slug,name'))return [[{id:453,slug:'nlu-qa-demo',is_active:1}]];
  if(sql.includes('SELECT u.*,ua.is_active'))return [[{id:7,role,is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE',membership_active:1}]];
  if(sql.startsWith('SELECT enabled,self_schedule'))return [[{enabled:1,self_schedule:1}]];
  if(sql.startsWith('SELECT id FROM company_event_provider_assignments'))return [[{id:1}]];
  if(sql.startsWith('SELECT id,user_id,punch_type,punched_at'))return [state.punches.map(row=>({...row}))];
  if(sql.startsWith('SELECT * FROM childcare_attendance_events'))return [state.attendance.map(row=>({...row}))];
  if(sql.startsWith('SELECT actual_children FROM childcare_attendance_events'))return [[...state.attendance].sort((a,b)=>String(b.effective_at).localeCompare(String(a.effective_at))||b.version-a.version).slice(0,1)];
  if(sql.startsWith('INSERT IGNORE INTO childcare_action_receipts')){const key=p[3],exists=state.receipts.has(key);if(!exists)state.receipts.set(key,p[2]);return [{affectedRows:exists?0:1,insertId:++nextId}];}
  if(sql.startsWith('SELECT action FROM childcare_action_receipts'))return [[{action:state.receipts.get(p[2])}]];
  if(sql.startsWith('SELECT p.id FROM skill_builders_event_kiosk_punches'))return [[]];
  if(sql.startsWith('INSERT INTO childcare_attendance_events')){state.attendance.push({id:++nextId,actual_children:p[2],effective_at:p[3],version:p[4]});return [{insertId:nextId}];}
  if(sql.startsWith('UPDATE childcare_shifts SET actual_children')){state.shift.actual_children=p[0];state.shift.attendance_version=p[1];if(p[2])state.shift.attendance_review_required=1;return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE childcare_shifts SET attendance_review_required=1')){state.shift.attendance_review_required=1;return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE childcare_shifts SET attendance_review_required=0')){state.shift.attendance_review_required=0;return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO skill_builders_event_kiosk_punches')){state.punches.push({id:++nextId,user_id:p[1],punch_type:sql.includes("'clock_in'")?'clock_in':'clock_out',punched_at:p[2]});return [{insertId:nextId}];}
  if(sql.startsWith('SELECT s.*,c.status claim_status'))return [state.snapshot?[{...state.snapshot,claim_status:state.claim?.status}]:[]];
  if(sql.startsWith('INSERT INTO childcare_pay_snapshots')){state.snapshot={snapshot_json:p[2],snapshot_hash:p[3],payroll_time_claim_id:p[4]};return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO payroll_time_claims')){state.claim={id:++nextId,status:p[3],claim_type:'childcare_shift',payload:JSON.parse(p[5]),credits_hours:p[6]};return [{insertId:nextId}];}
  if(sql.startsWith('UPDATE payroll_time_claims SET payload_json')){state.claim.payload=JSON.parse(p[0]);state.claim.status=p[1];state.claim.credits_hours=p[2];return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE skill_builders_event_kiosk_punches'))return [{affectedRows:2}];
  if(sql.startsWith("UPDATE childcare_shifts SET status='completed'")){state.shift.status='completed';return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO user_activity_log'))return [{insertId:++nextId}];
  if(sql.startsWith('SELECT u.id,u.first_name'))return [[{id:7,first_name:'QA',last_name:'Caregiver',last_punch:state.punches.at(-1)?.punch_type}]];
  throw new Error(`Unexpected SQL: ${sql}`);
 })};
 return {state,db};
}
beforeEach(()=>vi.clearAllMocks());
describe('childcare real punch to reviewable payroll claim',()=>{
 it('records one actual shift and one linked claim; app retries never duplicate pay',async()=>{
  const {state,db}=memoryShift();pool.getConnection.mockResolvedValue(db);
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-in',confirmPlannedCount:true,idempotencyKey:'clock-in-unique',now:new Date('2026-11-19T23:00:00Z')});
  expect(state.punches).toHaveLength(1);expect(state.claim).toBeNull();
  const result=await recordChildcareAction({shiftId:8,userId:7,action:'clock-out',confirmPlannedCount:true,idempotencyKey:'clock-out-unique',now:new Date('2026-11-20T02:00:00Z')});
  expect(result.shift.status).toBe('completed');expect(state.claim).toMatchObject({status:'submitted',credits_hours:3});
  expect(childcareClaimAmount(state.claim)).toBe(105);
  const retry=await recordChildcareAction({shiftId:8,userId:7,action:'clock-out',confirmPlannedCount:true,idempotencyKey:'clock-out-unique',now:new Date('2026-11-20T02:01:00Z')});
  expect(retry.alreadyProcessed).toBe(true);expect(state.punches).toHaveLength(2);
  expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO payroll_time_claims'))).toHaveLength(1);
 });
 it('saves the real clock-out with a missing/invalid count and defers pay for review',async()=>{
  for(const invalid of [undefined,-4]) {
   const {state,db}=memoryShift();pool.getConnection.mockResolvedValue(db);
   await recordChildcareAction({shiftId:8,userId:7,action:'clock-in',actualChildren:3,now:new Date('2026-11-19T23:00:00Z')});
   await recordChildcareAction({shiftId:8,userId:7,action:'clock-out',actualChildren:invalid,now:new Date('2026-11-20T02:00:00Z')});
   expect(state.punches.at(-1).punch_type).toBe('clock_out');expect(state.claim.status).toBe('deferred');
   expect(state.claim.payload.childcareSnapshot.totalMinutes).toBe(180);expect(()=>childcareClaimAmount(state.claim)).toThrow('snapshot');
  }
 });
 it('does not store equal-second punches that cannot form a valid work interval',async()=>{
  const {state,db}=memoryShift();pool.getConnection.mockResolvedValue(db);
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-in',actualChildren:3,now:new Date('2026-11-19T23:00:00.100Z')});
  await expect(recordChildcareAction({shiftId:8,userId:7,action:'clock-out',actualChildren:3,now:new Date('2026-11-19T23:00:00.900Z')})).rejects.toMatchObject({status:409});
  expect(state.punches).toHaveLength(1);
 });
 it('preserves an already-approved employee snapshot when later events require correction',async()=>{
  const {state,db}=memoryShift();pool.getConnection.mockResolvedValue(db);
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-in',actualChildren:3,now:new Date('2026-11-19T23:00:00Z')});
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-out',actualChildren:3,now:new Date('2026-11-20T02:00:00Z')});
  state.claim.status='approved';const hash=state.snapshot.snapshot_hash;
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-in',actualChildren:2,now:new Date('2026-11-20T02:05:00Z')});
  expect(state.snapshot.snapshot_hash).toBe(hash);expect(childcareClaimAmount(state.claim)).toBe(105);
  expect(db.execute.mock.calls.some(([sql,p])=>sql.startsWith('INSERT INTO user_activity_log')&&p[0]==='childcare_pay_correction_required')).toBe(true);
 });
 it('lets a manager append a dated count correction without changing original attendance or punches',async()=>{
  const {state,db}=memoryShift({role:'admin'});pool.getConnection.mockResolvedValue(db);
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-in',actualChildren:3,now:new Date('2026-11-19T23:00:00Z')});
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-out',now:new Date('2026-11-20T02:00:00Z')});
  expect(state.claim.status).toBe('deferred');
  const original=structuredClone(state.attendance[0]),punches=structuredClone(state.punches);
  await recordChildcareAction({shiftId:8,userId:7,action:'attendance',actualChildren:2,resolveReview:true,reviewNote:'Reviewed count at work start; two were present throughout.',effectiveAt:'2026-11-19T23:00:00Z',now:new Date('2026-11-20T03:00:00Z')});
  expect(state.attendance).toHaveLength(2);expect(state.attendance[0]).toEqual(original);expect(state.punches).toEqual(punches);
  expect(state.claim.status).toBe('submitted');expect(childcareClaimAmount(state.claim)).toBe(93);
  const correction=db.execute.mock.calls.find(([sql,p])=>sql.startsWith('INSERT INTO childcare_attendance_events')&&p[5]==='manager_timeline_correction');
  expect(correction[1][7]).toContain('two were present');
 });
 it('rejects retroactive count changes from a caregiver and corrections outside actual work',async()=>{
  let fixture=memoryShift();pool.getConnection.mockResolvedValue(fixture.db);
  await expect(recordChildcareAction({shiftId:8,userId:7,action:'attendance',actualChildren:2,resolveReview:true,reviewNote:'Unsafe',effectiveAt:'2026-11-19T23:00:00Z'})).rejects.toMatchObject({status:403});
  fixture=memoryShift({role:'admin'});pool.getConnection.mockResolvedValue(fixture.db);
  await recordChildcareAction({shiftId:8,userId:7,action:'clock-in',actualChildren:3,now:new Date('2026-11-19T23:00:00Z')});
  await expect(recordChildcareAction({shiftId:8,userId:7,action:'attendance',actualChildren:2,resolveReview:true,reviewNote:'Reviewed',effectiveAt:'2026-11-19T22:00:00Z',now:new Date('2026-11-19T23:30:00Z')})).rejects.toMatchObject({status:400});
  expect(fixture.state.attendance).toHaveLength(1);
 });
});
