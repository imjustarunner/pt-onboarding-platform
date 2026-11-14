import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({policies:vi.fn(),used:vi.fn(),snapshot:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
vi.mock('../../models/BookingCancellationPolicy.model.js',()=>({default:{listForAgency:m.policies,countComplimentaryUsed:m.used}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{getBilling:async()=>null}}));
vi.mock('../qaAppointmentBilling.service.js',()=>({qaAttendancePolicy:m.snapshot}));
import {evaluateCancel} from '../bookingCancellationPolicy.service.js';
const appointment={id:1,agencyId:2,businessType:'mental_health',startAt:'2027-01-03 16:00:00',tenantServiceId:7};
beforeEach(()=>{vi.resetAllMocks();m.used.mockResolvedValue(0);m.snapshot.mockResolvedValue(null);});
it.each([24,48])('uses the exact %s-hour cutoff, including a fraction of an hour inside it',async noticeHours=>{
 m.policies.mockResolvedValue([{id:3,scopeLevel:'service',tenantServiceId:7,noticeHours,lateFeeCents:8000,latePackageAction:'forfeit',allowClientCancel:true,requireReason:true}]);
 const deadline=Date.parse('2027-01-03T16:00:00Z')-noticeHours*3600000;
 const onTime=await evaluateCancel({appointment,actorRole:'guardian',clientId:8,now:new Date(deadline)});
 const late=await evaluateCancel({appointment,actorRole:'guardian',clientId:8,now:new Date(deadline+36000)});
 expect(onTime).toMatchObject({withinNotice:true,recommendedFeeCents:0,allowed:true});expect(late).toMatchObject({isLate:true,recommendedFeeCents:8000,requireReason:true});
});
it('keeps the booking policy snapshot and does not apply one complimentary cancellation to every date',async()=>{
 m.policies.mockResolvedValue([{id:9,scopeLevel:'tenant',noticeHours:24,lateFeeCents:0}]);
 m.snapshot.mockResolvedValue({id:3,noticeHours:48,lateFeeCents:8000,allowClientCancel:true,complimentaryCancelsPerPeriod:1,periodDays:90});
 const now=new Date('2027-01-03T15:00:00Z');
 expect(await evaluateCancel({appointment,actorRole:'guardian',clientId:8,now})).toMatchObject({policySource:'booking_snapshot',usedComplimentary:true,recommendedFeeCents:0});
 expect(await evaluateCancel({appointment,actorRole:'guardian',clientId:8,now,plannedComplimentaryCancels:1})).toMatchObject({usedComplimentary:false,recommendedFeeCents:8000});
});
