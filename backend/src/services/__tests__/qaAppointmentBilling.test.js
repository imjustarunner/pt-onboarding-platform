import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{getBilling:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../familyLedger/receivables.js',()=>({createReceivable:vi.fn()}));
vi.mock('../familyLedger/policy.js',()=>({transaction:vi.fn()}));
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
it('uses the settled no-show amount',async()=>{
 await syncQaAppointmentBalance({...appointment,status:'no_show'},1433);expect(createReceivable).toHaveBeenCalledWith(expect.objectContaining({amountCents:10000,serviceLabel:'Missed appointment'}));
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
