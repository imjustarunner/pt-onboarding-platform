import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),providers:vi.fn(),rollout:vi.fn(),services:vi.fn(),assigned:vi.fn(),availability:vi.fn(),policy:vi.fn(),quote:vi.fn(),selfPay:vi.fn(),create:vi.fn(),event:vi.fn(),link:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../guardianAppointments.service.js',()=>({authorizedAppointmentClient:m.access}));
vi.mock('../clientSessionBookingRollout.service.js',()=>({sessionBookingProviders:m.providers,requireClientSessionBooking:m.rollout}));
vi.mock('../../models/TenantService.model.js',()=>({default:{listForAgency:m.services}}));
vi.mock('../../models/StaffServiceAssignment.model.js',()=>({default:{listServiceIdsForUser:m.assigned}}));
vi.mock('../providerAvailability.service.js',()=>({default:{computeWeekAvailability:m.availability}}));
vi.mock('../bookingCancellationPolicy.service.js',()=>({resolvePolicyForAppointmentContext:m.policy}));
vi.mock('../selfPayRates.service.js',()=>({resolveSelfPayQuote:m.quote,getAgencySelfPayOnly:m.selfPay}));
vi.mock('../appointment.service.js',()=>({createAppointment:m.create,linkProviderScheduleEvent:m.link}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{create:m.event}}));
import {guardianBookingOptions,bookGuardianSession} from '../guardianSessionBooking.service.js';
const terms={policyId:3,noticeHours:24,lateFeeCents:8000,noShowFeeCents:10000,sessionFeeCents:12000};
const startAt=new Date(Date.now()+86400000*7).toISOString();const endAt=new Date(+new Date(startAt)+3600000).toISOString();
const input={userId:1450,clientId:2272,agencyId:450,providerId:1433,tenantServiceId:287,startAt,endAt,modality:'VIRTUAL',confirmed:true,acknowledgedTerms:terms};
beforeEach(()=>{
 vi.resetAllMocks();m.access.mockResolvedValue({agency_id:450});m.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[{id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}}]]:[[{id:1433}]]);
 m.providers.mockResolvedValue([{id:1433,name:'Avery'},{id:1438,name:'Cameron'}]);m.assigned.mockResolvedValue([287]);m.selfPay.mockResolvedValue(true);
 m.services.mockResolvedValue([{id:287,isActive:true,isPubliclyBookable:true,billingMethod:'self_pay',businessType:'mental_health',defaultDurationMinutes:60,modality:'EITHER',cancellationPolicyId:3}]);
 m.policy.mockResolvedValue({policy:{id:3,noticeHours:24,lateFeeCents:8000,noShowFeeCents:10000}});m.quote.mockResolvedValue({amountCents:12000});
 m.availability.mockResolvedValue({timeZone:'America/Denver',virtualSlots:[{startAt,endAt}],inPersonSlots:[]});m.create.mockResolvedValue({id:51});m.event.mockResolvedValue({id:52});
});
it('shows only assigned approved providers and disclosed fees',async()=>{
 const result=await guardianBookingOptions(input);expect(result.choices).toHaveLength(1);expect(result.choices[0]).toMatchObject({providerId:1433,terms});
});
it('uses the authenticated family and creates a real linked self-pay session',async()=>{
 const result=await bookGuardianSession(input);expect(result.appointmentId).toBe(51);
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({agencyId:450,providerUserId:1433,createdByUserId:1450,participants:[{role:'client',clientId:2272,isBillingResponsible:true}]}));
 expect(m.link).toHaveBeenCalledWith(51,52);
});
it('rejects another family, provider, workspace, unavailable slot and unacknowledged terms',async()=>{
 m.access.mockRejectedValueOnce(Object.assign(new Error('Forbidden'),{status:403}));await expect(bookGuardianSession(input)).rejects.toMatchObject({status:403});
 await expect(bookGuardianSession({...input,providerId:1438})).rejects.toMatchObject({status:403});
 m.execute.mockResolvedValueOnce([[{id:2,slug:'itsco'}]]);await expect(bookGuardianSession(input)).rejects.toMatchObject({status:409});
 await expect(bookGuardianSession({...input,startAt:new Date(+new Date(startAt)+60000).toISOString()})).rejects.toMatchObject({status:409});
 await expect(bookGuardianSession({...input,acknowledgedTerms:{...terms,lateFeeCents:0}})).rejects.toMatchObject({status:409});
 expect(m.create).not.toHaveBeenCalled();
});
it('reports a saved appointment if calendar linking fails, without creating another',async()=>{
 m.link.mockRejectedValue(new Error('db down'));await expect(bookGuardianSession(input)).rejects.toMatchObject({status:409,appointmentId:51});expect(m.create).toHaveBeenCalledOnce();
});
