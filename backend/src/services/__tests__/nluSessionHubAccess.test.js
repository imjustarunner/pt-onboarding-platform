import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn(async()=>({full_name:'Synthetic student'}))}}));
vi.mock('../guardianAppointments.service.js',()=>({authorizedAppointmentClient:vi.fn()}));
vi.mock('../clientServiceEnrollment.service.js',()=>({clientAgencyMembership:vi.fn(),listClientServices:vi.fn(),guardianContextAllowsAppointment:vi.fn(),serviceMatchesAppointment:vi.fn()}));
import {authorizedAppointmentClient} from '../guardianAppointments.service.js';
import {clientAgencyMembership,guardianContextAllowsAppointment,listClientServices,serviceMatchesAppointment} from '../clientServiceEnrollment.service.js';
import {nluSessionHubClientAccess} from '../nluSessionHubAccess.service.js';
const a={id:1,agencyId:6,providerUserId:20,serviceCode:'H2014',businessType:'mental_health'};
beforeEach(()=>{vi.clearAllMocks();clientAgencyMembership.mockResolvedValue(true);authorizedAppointmentClient.mockResolvedValue({full_name:'Synthetic student',permissions_json:{canViewAppointments:true}});guardianContextAllowsAppointment.mockReturnValue(true);listClientServices.mockResolvedValue([]);});
it('uses current appointment permission without granting another service’s learning records',async()=>{
 const req={user:{id:30,role:'client_guardian'},query:{serviceId:42}};
 expect(await nluSessionHubClientAccess(req,a,40,false)).toHaveProperty('client.full_name','Synthetic student');
 expect(authorizedAppointmentClient).toHaveBeenCalledWith(30,40,{agencyId:6,serviceId:42});
});
it.each([{permissions_json:{billingOnly:true}},{permissions_json:{canViewAppointments:false}},{permissions_json:{canViewProgress:false}},{portal_access:{limited:true}}])('denies restricted relationships %j',async access=>{
 authorizedAppointmentClient.mockResolvedValue(access);await expect(nluSessionHubClientAccess({user:{id:30},query:{}},a,40,false)).rejects.toHaveProperty('status',403);
});
it('denies another service and another organization before reading private learning data',async()=>{
 guardianContextAllowsAppointment.mockReturnValue(false);await expect(nluSessionHubClientAccess({user:{id:30},query:{}},a,40,false)).rejects.toHaveProperty('status',403);
 clientAgencyMembership.mockResolvedValue(false);authorizedAppointmentClient.mockClear();await expect(nluSessionHubClientAccess({user:{id:20},query:{}},a,40,true)).rejects.toHaveProperty('status',403);expect(authorizedAppointmentClient).not.toHaveBeenCalled();
});
it('requires the selected enrollment to match the booked service and provider',async()=>{
 listClientServices.mockResolvedValue([{id:42,is_active:1}]);serviceMatchesAppointment.mockReturnValue(false);
 await expect(nluSessionHubClientAccess({user:{id:20},query:{serviceId:42}},a,40,true)).rejects.toHaveProperty('status',403);
 serviceMatchesAppointment.mockReturnValue(true);expect(await nluSessionHubClientAccess({user:{id:20},query:{serviceId:42}},a,40,true)).toHaveProperty('client.full_name');
});

it('does not reuse an active tutoring enrollment to open an ended counseling service',async()=>{
 authorizedAppointmentClient.mockResolvedValue({services:[{id:1,is_active:0,service_kind:'counseling'},{id:2,is_active:1,service_kind:'tutoring'}]});
 serviceMatchesAppointment.mockImplementation(s=>s.service_kind==='counseling');
 await expect(nluSessionHubClientAccess({user:{id:30},query:{}},a,40,false)).rejects.toHaveProperty('status',403);
});
