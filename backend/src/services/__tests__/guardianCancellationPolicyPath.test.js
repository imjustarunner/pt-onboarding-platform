import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),update:vi.fn(),guardian:vi.fn(),provider:vi.fn(),evaluate:vi.fn(),release:vi.fn(),reminders:vi.fn(),entitlement:vi.fn(),usage:vi.fn(),expiration:vi.fn()}));
vi.mock('../../models/BookingPackage.model.js',()=>({default:{findEntitlementById:m.entitlement,applyAppointmentUsage:m.usage}}));
vi.mock('../bookingPackagePricing.js',()=>({assertPackageProviderBinding:vi.fn(),assertPackageExpiration:m.expiration}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.find,update:m.update,listParticipants:vi.fn(async()=>[{clientId:8}]),getBilling:vi.fn(async()=>null),normalizeStatus:s=>s}}));
vi.mock('../guardianAppointments.service.js',()=>({requireGuardianCancellation:m.guardian,requireAppointmentRequestProvider:m.provider,recordGuardianAppointmentApproval:vi.fn()}));
vi.mock('../bookingCancellationPolicy.service.js',()=>({evaluateCancel:m.evaluate,resolvePolicyForAppointmentContext:vi.fn()}));
vi.mock('../appointmentReminder.service.js',()=>({cancelPendingReminders:m.reminders,listReminders:vi.fn(async()=>[]),listCommunications:vi.fn(async()=>[])}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:vi.fn(async()=>null)}));
vi.mock('../appointmentCalendarMaintenance.service.js',()=>({releaseAppointmentCalendar:m.release}));
import {cancelAppointment,updateAppointment} from '../appointment.service.js';
beforeEach(()=>{
 vi.resetAllMocks();m.find.mockResolvedValue({id:1,agencyId:2,providerUserId:7,status:'scheduled',startAt:'2027-01-01 16:00:00',endAt:'2027-01-01 17:00:00'});
 m.provider.mockRejectedValue(Object.assign(new Error('Pending requests require provider'),{status:403}));
 m.evaluate.mockResolvedValue({allowed:true,policy:{id:4},recommendedFeeCents:2500,recommendedPackageAction:'release',statusSuggestion:'late_canceled'});
});
it('does not reintroduce provider approval inside the underlying status update',async()=>{
 await cancelAppointment(1,{actorUserId:9,actorRole:'guardian',clientId:8,reason:'Changing our schedule'});
 expect(m.guardian).toHaveBeenCalledTimes(2);expect(m.provider).not.toHaveBeenCalled();
 expect(m.update).toHaveBeenCalledWith(1,expect.objectContaining({status:'late_canceled',cancellationFeeCents:2500,canceledByUserId:9}));
 expect(m.reminders).toHaveBeenCalledWith(1);expect(m.release).toHaveBeenCalled();
});
it('the cancellation authorization cannot be reused to reschedule or mark attendance completed',async()=>{
 for(const patch of [{status:'completed'},{status:'canceled_by_client',startAt:'2027-01-02 16:00:00'}]){
  await expect(updateAppointment(1,patch,{actorUserId:9,guardianCancellationClientId:8})).rejects.toMatchObject({status:403});
 }
 expect(m.update).not.toHaveBeenCalled();
});
it('can release an expired package reservation while preserving cancellation fees',async()=>{
 const appointment=await m.find();m.find.mockResolvedValue({...appointment,packageEntitlementId:21});
 m.entitlement.mockResolvedValue({pricingSnapshot:{},activatedAt:'2020-01-01'});
 m.expiration.mockImplementation(()=>{throw new Error('Package expired');});
 await cancelAppointment(1,{actorUserId:9,actorRole:'guardian',clientId:8,reason:'Cancel remaining sessions'});
 expect(m.expiration).not.toHaveBeenCalled();
 expect(m.usage).toHaveBeenCalledWith(expect.objectContaining({entitlementId:21,mode:'release'}));
 expect(m.update).toHaveBeenCalledWith(1,expect.objectContaining({cancellationFeeCents:2500}));
});
