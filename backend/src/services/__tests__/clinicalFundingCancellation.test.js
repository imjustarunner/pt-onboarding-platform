import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../models/Appointment.model.js',()=>({default:{getBilling:vi.fn(),upsertBilling:vi.fn()}}));
vi.mock('../../models/BookingCancellationPolicy.model.js',()=>({default:{listForAgency:vi.fn()}}));
vi.mock('../../models/BookingPackage.model.js',()=>({default:{}}));
vi.mock('../../models/TenantService.model.js',()=>({default:{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../qaAppointmentBilling.service.js',()=>({qaAttendancePolicy:vi.fn().mockResolvedValue(null)}));
import Appointment from '../../models/Appointment.model.js';
import Policy from '../../models/BookingCancellationPolicy.model.js';
import {evaluateCancel} from '../bookingCancellationPolicy.service.js';
const appointment={id:20,agencyId:1,serviceCode:'90837',startAt:'2026-01-01 15:00:00',businessType:'mental_health'};
let policy;
beforeEach(()=>{vi.clearAllMocks();policy={id:5,scopeLevel:'tenant',noticeHours:24,lateFeeCents:8000,noShowFeeCents:10000,latePackageAction:'forfeit',allowClientCancel:true,requireReason:true};Policy.listForAgency.mockImplementation(async()=>[policy]);Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay'});});
describe('new cancellation fees and pro bono funding',()=>{
 it('suppresses a new pro bono fee while retaining the actual policy, deadline and reason requirement',async()=>{
  const result=await evaluateCancel({appointment:{...appointment,serviceCode:'PRO-BONO SERVICE'},actorRole:'client'});
  expect(result).toMatchObject({allowed:true,isLate:true,requireReason:true,recommendedFeeCents:0,recommendedPackageAction:'release',fundingDisposition:'pro_bono',policy:{lateFeeCents:8000,noShowFeeCents:10000}});expect(Appointment.upsertBilling).not.toHaveBeenCalled();
 });
 it('honors an explicit saved pro bono funding mode even with an underlying clinical code',async()=>{
  Appointment.getBilling.mockResolvedValue({settlementMode:'pro_bono',paymentStatus:'paid',amountCents:25000});
  expect(await evaluateCancel({appointment,actorRole:'client'})).toMatchObject({recommendedFeeCents:0,fundingDisposition:'pro_bono'});expect(Appointment.upsertBilling).not.toHaveBeenCalled();
 });
 it('preserves client cancellation permissions and non-pro-bono fees',async()=>{
  expect(await evaluateCancel({appointment,actorRole:'client'})).toMatchObject({recommendedFeeCents:8000,fundingDisposition:null});
  policy.allowClientCancel=false;expect(await evaluateCancel({appointment:{...appointment,serviceCode:'PRO-BONO SERVICE'},actorRole:'client'})).toMatchObject({allowed:false,requireReason:true,recommendedFeeCents:0});
 });
});
