import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute:vi.fn(), time:vi.fn(), timeList:vi.fn(), approve:vi.fn(), returnTime:vi.fn(), reimb:vi.fn(), approveReimb:vi.fn(), period:vi.fn(), card:vi.fn(), codes:vi.fn(), assignment:vi.fn(), enabled:vi.fn(), pay:vi.fn(), travel:vi.fn(), materialize:vi.fn() }));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/PayrollTimeClaim.model.js',()=>({default:{findById:m.time,listForAgency:m.timeList,approve:m.approve,returnForChanges:m.returnTime}}));
vi.mock('../../models/PayrollReimbursementClaim.model.js',()=>({default:{findById:m.reimb,approve:m.approveReimb}}));
vi.mock('../../models/PayrollPeriod.model.js',()=>({default:{findById:m.period}}));
vi.mock('../../models/PayrollRateCard.model.js',()=>({default:{findForUser:m.card}}));
vi.mock('../../models/PayrollRate.model.js',()=>({default:{listForUser:m.codes}}));
vi.mock('../../models/PayrollCompensationLevel.model.js',()=>({default:{getForUser:m.assignment}}));
vi.mock('../../models/PayrollPaySystemRate.model.js',()=>({default:{isAgencyEnabled:m.enabled}}));
vi.mock('../../services/paySystem.service.js',async original=>({...await original(),loadUserPaySystemContext:m.pay}));
vi.mock('../../services/eventTravelReport.service.js',async original=>({...await original(),assertEventTravelReviewed:m.travel}));
vi.mock('../../services/recurringPayroll.service.js',async original=>({...await original(),materializeRecurring:m.materialize}));
import { batchPayrollClaims, listTimeClaims, getTimeClaim } from '../payroll.controller.js';
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const req=(items,extra={})=>({user:{id:1,role:'super_admin'},query:{},params:{},body:{agencyId:2,action:'approve',items},...extra});
let times, reimbursements;
const time=id=>({id,agency_id:2,user_id:7,status:'submitted',claim_type:'indirect_time',claim_date:'2026-10-23',created_at:'2026-10-24',payload:{amount:21,totalMinutes:60}});
beforeEach(()=>{
 vi.clearAllMocks(); times=[time(1),time(2)];reimbursements=[{id:3,agency_id:2,status:'submitted',amount:25,expense_date:'2026-10-23',created_at:'2026-10-24'}];
 m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type FROM agencies')?[[{id:2,organization_type:'agency'}]]:[[]]);
 m.time.mockImplementation(async id=>times.find(c=>c.id===Number(id)));m.timeList.mockImplementation(async()=>times);
 m.reimb.mockImplementation(async id=>reimbursements.find(c=>c.id===Number(id)));
 m.period.mockResolvedValue({id:8,agency_id:2,status:'staged',period_start:'2026-10-10',period_end:'2026-10-23'});
 m.travel.mockResolvedValue(null);m.materialize.mockResolvedValue();
 const approve=(rows,options)=>{const c=rows.find(c=>c.id===options.id);Object.assign(c,{status:'approved',applied_amount:options.appliedAmount,target_payroll_period_id:options.targetPayrollPeriodId});return {...c};};
 m.approve.mockImplementation(async options=>approve(times,options));m.approveReimb.mockImplementation(async options=>approve(reimbursements,options));
 m.card.mockResolvedValue({indirect_rate:21,direct_rate:26});m.codes.mockResolvedValue([]);m.assignment.mockResolvedValue(null);m.enabled.mockResolvedValue(false);m.pay.mockResolvedValue({enabled:false});
});
it('authorizes payroll access before reading or changing any selected claim',async()=>{
 const r=res();await batchPayrollClaims(req([{kind:'time',id:1}],{user:{id:7,role:'provider'}}),r,vi.fn());
 expect(r.status).toHaveBeenCalledWith(403);expect(m.time).not.toHaveBeenCalled();expect(m.approve).not.toHaveBeenCalled();
});
it('rejects duplicates and oversized selections before any writes',async()=>{
 for(const items of [[null],[{kind:'constructor',id:1}],[{kind:'time',id:1},{kind:'time',id:1}],Array.from({length:101},(_,id)=>({kind:'time',id:id+1}))]){
  const r=res();await batchPayrollClaims(req(items),r,vi.fn());expect(r.status).toHaveBeenCalledWith(400);
 }
 expect(m.approve).not.toHaveBeenCalled();
});
it('saves independent approvals, preserves required reviews, and never touches another agency',async()=>{
 times[1].event_travel_report_id=7;times.push({...time(4),agency_id:6});
 m.travel.mockImplementation(async claim=>{if(claim.event_travel_report_id)throw Object.assign(new Error('Open the Event travel report, verify its trips, and save the review before approving payroll.'),{status:409});return null;});
 const r=res(),next=vi.fn();await batchPayrollClaims(req([1,2,4].map(id=>({kind:'time',id,targetPayrollPeriodId:8,overrideDeadline:true}))),r,next);
 expect(next).not.toHaveBeenCalled();const body=r.json.mock.calls[0][0];expect(body).toMatchObject({succeeded:1,failed:2});
 expect(body.results).toMatchObject([{id:1,ok:true,claim:{status:'approved',applied_amount:21}},{id:2,ok:false,status:409,reviewRequired:{type:'event_travel',reportId:7}},{id:4,ok:false,status:404}]);
 expect(m.approve).toHaveBeenCalledOnce();expect(m.approve).toHaveBeenCalledWith(expect.objectContaining({id:1,requireSubmitted:true}));
});
it('keeps a no-longer-pending row unchanged and reports a concurrent decision conflict',async()=>{
 times[0].status='approved';m.approve.mockRejectedValue(Object.assign(new Error('Submission changed before approval.'),{status:409,code:'PAYROLL_SOURCE_CHANGED'}));
 const r=res();await batchPayrollClaims(req([1,2].map(id=>({kind:'time',id,targetPayrollPeriodId:8,overrideDeadline:true}))),r,vi.fn());
 expect(r.json.mock.calls[0][0]).toMatchObject({succeeded:0,results:[{id:1,ok:false,status:409},{id:2,ok:false,status:409,error:{code:'PAYROLL_SOURCE_CHANGED'}}]});
});
it('refuses a posted target even when a deadline override was requested',async()=>{
 m.period.mockResolvedValue({id:8,agency_id:2,status:'ran',posted_at:'2026-11-11'});
 const r=res();await batchPayrollClaims(req([{kind:'time',id:1,targetPayrollPeriodId:8,overrideDeadline:true}]),r,vi.fn());
 expect(r.json.mock.calls[0][0].results[0]).toMatchObject({ok:false,status:409});expect(m.approve).not.toHaveBeenCalled();
});
it('requests a conditional update for sending back, so another reviewer’s approval is protected',async()=>{
 m.returnTime.mockRejectedValue(Object.assign(new Error('Submission changed before this decision.'),{status:409}));
 const r=res();const request=req([{kind:'time',id:1,note:'Please check the date'}]);request.body.action='return';
 await batchPayrollClaims(request,r,vi.fn());
 expect(m.returnTime).toHaveBeenCalledWith(expect.objectContaining({id:1,requireSubmitted:true}));expect(r.json.mock.calls[0][0].failed).toBe(1);
});
it('recalculates a shared period once and invalidates the run if recalculation fails',async()=>{
 m.period.mockResolvedValue({id:8,agency_id:2,status:'ran',period_start:'2026-10-10',period_end:'2026-10-23'});
 m.materialize.mockRejectedValue(new Error('Recalculation unavailable'));
 const r=res();await batchPayrollClaims(req([{kind:'time',id:1,targetPayrollPeriodId:8,overrideDeadline:true},{kind:'time',id:2,targetPayrollPeriodId:8,overrideDeadline:true},{kind:'reimbursement',id:3,targetPayrollPeriodId:8,overrideDeadline:true}]),r,vi.fn());
 expect(m.materialize).toHaveBeenCalledOnce();expect(r.json.mock.calls[0][0]).toMatchObject({succeeded:3,warnings:[{payrollPeriodId:8}]});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes("SET status='staged'"))).toBe(true);
});
it('enriches a large queue with shared worker rates instead of repeating them per claim',async()=>{
 times=Array.from({length:100},(_,i)=>({...time(i+1),payload:{totalMinutes:60},credits_hours:1}));
 const r=res(),next=vi.fn();await listTimeClaims({...req(),query:{agencyId:2,status:'submitted'}},r,next);
 expect(next).not.toHaveBeenCalled();expect(r.json.mock.calls[0][0]).toHaveLength(100);
 for(const mock of [m.card,m.codes,m.assignment,m.enabled,m.pay])expect(mock).toHaveBeenCalledOnce();
 expect(r.json.mock.calls[0][0][0].payEstimate.amount).toBe(21);
});
it('keeps approved historical amounts and provides full detail only on explicit review',async()=>{
 Object.assign(times[0],{status:'approved',applied_amount:17,payload:{transcriptText:'A detailed transcript',totalMinutes:60}});
 const r=res();await listTimeClaims({...req(),query:{agencyId:2,status:'approved'}},r,vi.fn());
 expect(r.json.mock.calls[0][0][0]).toMatchObject({payEstimate:{amount:17},hasTranscript:true});expect(r.json.mock.calls[0][0][0].payload.transcriptText).toBeUndefined();
 const detail=res();await getTimeClaim({...req(),params:{id:'1'}},detail,vi.fn());expect(detail.json.mock.calls[0][0].claim.payload.transcriptText).toBe('A detailed transcript');
});
it('pays supervision notes at half the signed supervision rate and labels the actual Admin Time rate',async()=>{
 times=[{...time(1),credits_hours:0.5,payload:{categoryGroup:'supervision_note',serviceCode:'Admin Time',totalMinutes:30,allocations:[{serviceTypeId:9}]}}];
 m.pay.mockResolvedValue({enabled:true,status:{useReducedRates:true},rateProfile:{indirectRate:24,supportActivityRate:18,roleCompensation:{supervisor:{hourlyRate:65}}}});
 const r=res(),next=vi.fn();await listTimeClaims({...req(),query:{agencyId:2,status:'submitted'}},r,next);
 expect(next).not.toHaveBeenCalled();expect(r.json.mock.calls[0][0][0]).toMatchObject({payEstimate:{amount:16.25,hourlyRate:32.5,rateLabel:'Admin Time rate (supervision notes)',rateBucket:'indirect'}});
 expect(r.json.mock.calls[0][0][0].payEstimate.availableRates).toContainEqual(expect.objectContaining({key:'supervision_note_admin',amount:32.5,unit:'hour',bucket:'indirect'}));
 const batch=res();await batchPayrollClaims(req([{kind:'time',id:1,targetPayrollPeriodId:8,creditsHours:0.5,bucket:'indirect',overrideDeadline:true}]),batch,next);
 expect(m.approve).toHaveBeenCalledWith(expect.objectContaining({appliedAmount:16.25,bucket:'indirect'}));
});
