import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{getBilling:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../familyLedger/receivables.js',()=>({createReceivable:vi.fn()}));
vi.mock('../familyLedger/policy.js',()=>({transaction:vi.fn(),billingCalendarDate:(zone,date)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}));
vi.mock('../qaPaymentSimulator.service.js',()=>({qaPaymentSimulationConfig:vi.fn(async()=>({enabled:false}))}));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import {createReceivable} from '../familyLedger/receivables.js';
import {transaction} from '../familyLedger/policy.js';
import {syncQaAppointmentBalance,recordQaAttendanceTerms,qaAttendancePolicy,requireQaOutcomeElapsed} from '../qaAppointmentBilling.service.js';
const agency={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}};
const appointment={id:72,agencyId:450,status:'late_canceled',startAt:'2026-10-26 16:00:00',endAt:'2026-10-26 17:00:00',cancellationFeeCents:8000};
beforeEach(()=>{
 vi.resetAllMocks();pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[agency]]:[[{metadata_json:{policy:{id:3,lateFeeCents:8000,noShowFeeCents:10000}}}]]);
 Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay_only',amountCents:10000});Appointment.listParticipants.mockResolvedValue([{clientId:2271,isBillingResponsible:true}]);
 createReceivable.mockResolvedValue({id:9});
});
it('records the assessed cancellation fee under a stable source and mandatory review',async()=>{
 expect(await syncQaAppointmentBalance(appointment,1440)).toEqual({id:9});
 expect(createReceivable).toHaveBeenCalledWith(expect.objectContaining({agencyId:450,clientId:2271,amountCents:8000,sourceType:'qa_appointment',sourceKey:'72',reviewRequired:true,payload:expect.objectContaining({syntheticOnly:true,noCollection:true})}));
});
it('uses the assessed no-show fee rather than the booked session price',async()=>{
 Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay_only',amountCents:12000});
 await syncQaAppointmentBalance({...appointment,status:'no_show',cancellationFeeCents:10000},1433);expect(createReceivable).toHaveBeenCalledWith(expect.objectContaining({amountCents:10000,serviceLabel:'Missed appointment'}));
});
it.each([2,451,452])('does not touch billing outside isolated agency 450 (%s)',async agencyId=>{
 expect(await syncQaAppointmentBalance({...appointment,agencyId},1433)).toBeNull();expect(pool.execute).not.toHaveBeenCalled();expect(createReceivable).not.toHaveBeenCalled();
});
it('requires the synthetic tenant flag and self-pay settlement',async()=>{
 pool.execute.mockResolvedValue([[{...agency,feature_flags:{}}]]);await syncQaAppointmentBalance(appointment,1433);expect(Appointment.getBilling).not.toHaveBeenCalled();
 pool.execute.mockResolvedValue([[agency]]);Appointment.getBilling.mockResolvedValue({settlementMode:'insurance'});await syncQaAppointmentBalance(appointment,1433);expect(createReceivable).not.toHaveBeenCalled();
});
it('creates no balance for a free cancellation or a scheduled appointment',async()=>{
 await syncQaAppointmentBalance({...appointment,cancellationFeeCents:0},1433);await syncQaAppointmentBalance({...appointment,status:'scheduled'},1433);expect(createReceivable).not.toHaveBeenCalled();
});
it('does not overwrite previously recorded policy terms',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{id:1}]])};transaction.mockImplementation(fn=>fn(db));
 await recordQaAttendanceTerms(appointment,{noShowFeeCents:50000},1433);expect(db.execute).toHaveBeenCalledTimes(2);expect(await qaAttendancePolicy(appointment)).toEqual({id:3,lateFeeCents:8000,noShowFeeCents:10000});
});

it('rejects a future outcome before its status can change',async()=>{
 await expect(requireQaOutcomeElapsed({...appointment,endAt:new Date(Date.now()+3600000).toISOString()},'no_show')).rejects.toMatchObject({status:409});
 await expect(requireQaOutcomeElapsed(appointment,'no_show')).resolves.toBeUndefined();
});

it.each([0,null,undefined])('does not post the full booked price when a no-show fee is absent or held (%s)',async cancellationFeeCents=>{
 Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay_only',amountCents:12000});
 await syncQaAppointmentBalance({...appointment,status:'no_show',cancellationFeeCents},1433);expect(createReceivable).not.toHaveBeenCalled();
});

const nlu={id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}};
const tutoring={...appointment,agencyId:453,businessType:'tutoring',serviceCode:'TUTORING',status:'completed'};
it('retains the completed one-dollar tutoring balance as synthetic and noncollectible',async()=>{
 pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[nlu]]:[[]]);
 Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay',amountCents:100,paymentStatus:'fee_pending'});
 await syncQaAppointmentBalance(tutoring,1496);
 expect(createReceivable).toHaveBeenCalledWith(expect.objectContaining({agencyId:453,amountCents:100,serviceDomain:'tutoring',serviceLabel:'General tutoring',reviewRequired:true,payload:expect.objectContaining({syntheticOnly:true,noCollection:true,appointmentId:72})}));
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE id=?'),[453]);
});
it.each(['package_consumed','free_rebook','waived','paid'])('does not duplicate a covered tutoring balance (%s)',async paymentStatus=>{
 pool.execute.mockResolvedValue([[nlu]]);Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay',amountCents:100,paymentStatus});
 expect(await syncQaAppointmentBalance(tutoring,1496)).toBeNull();expect(createReceivable).not.toHaveBeenCalled();
});
it.each([{agencyId:6},{businessType:'mental_health'},{serviceCode:'90837'}])('keeps the NLU example out of live or clinical billing: %j',async patch=>{
 pool.execute.mockResolvedValue([[nlu]]);await syncQaAppointmentBalance({...tutoring,...patch},1496);expect(createReceivable).not.toHaveBeenCalled();
});
it('keeps future tutoring completion and no-show blocked',async()=>{
 pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[nlu]]:[[]]);await expect(requireQaOutcomeElapsed({...tutoring,endAt:new Date(Date.now()+3600000).toISOString()},'completed')).rejects.toMatchObject({status:409});
});

it('dates an evening tutoring service in its booked Denver zone rather than the UTC calendar day',async()=>{
 pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[{id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}}]]:sql.includes('FROM client_service_enrollments')?[[{label:'Math tutoring'}]]:[[]]);
 Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay',amountCents:100});
 await syncQaAppointmentBalance({...appointment,agencyId:453,providerUserId:1496,businessType:'tutoring',serviceCode:'TUTORING',status:'completed',sourceTimezone:'America/Denver',startAt:'2026-11-17 03:00:00',endAt:'2026-11-17 04:00:00'},1496);
 expect(createReceivable).toHaveBeenCalledWith(expect.objectContaining({serviceDate:'2026-11-16',serviceLabel:'Math tutoring'}));
});

it('permits an actually ended, exactly linked QA tutoring visit to complete early, without allowing an early no-show',async()=>{
 const future={...tutoring,id:360,agencyId:453,providerUserId:1496,endAt:'2099-11-17 16:00:00'};
 pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[nlu]]:sql.includes('FROM tutoring_appointment_sessions')?[[{id:600}]]:[[]]);
 await expect(requireQaOutcomeElapsed(future,'completed')).resolves.toBeUndefined();
 await expect(requireQaOutcomeElapsed(future,'no_show')).rejects.toMatchObject({status:409});
 pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[nlu]]:[[]]);
 await expect(requireQaOutcomeElapsed(future,'completed')).rejects.toMatchObject({status:409});
});
