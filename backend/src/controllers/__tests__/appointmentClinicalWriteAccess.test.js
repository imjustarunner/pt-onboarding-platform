import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(),supervisorHasAccess:vi.fn()}}));
vi.mock('../../services/appointment.service.js',()=>({createAppointment:vi.fn(),updateAppointment:vi.fn(),cancelAppointment:vi.fn(),getAppointmentBundle:vi.fn(),linkProviderScheduleEvent:vi.fn(),settleAppointment:vi.fn()}));
vi.mock('../../services/schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:vi.fn(),schedulingResponseForUser:vi.fn(async(user,agency,body)=>body)}));
import Appointment from '../../models/Appointment.model.js';
import User from '../../models/User.model.js';
import {updateAppointment} from '../../services/appointment.service.js';
import {hasSchedulingBillingAccess} from '../../services/schedulingBillingAccess.service.js';
import {updateAppointmentHandler} from '../appointment.controller.js';
beforeEach(()=>{
 vi.clearAllMocks();Appointment.findById.mockResolvedValue({id:84,agencyId:450,providerUserId:1433});
 User.getAgencies.mockResolvedValue([{id:450}]);User.supervisorHasAccess.mockResolvedValue(false);
 hasSchedulingBillingAccess.mockResolvedValue(false);updateAppointment.mockResolvedValue({id:84,agencyId:450});
});
async function request(user){const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await updateAppointmentHandler({params:{id:'84'},body:{serviceCode:'90791'},user},res,next);return{res,next};}
it('denies another provider in the same agency before changing clinical appointment details',async()=>{
 const {res,next}=await request({id:1439,role:'provider'});expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(403);expect(updateAppointment).not.toHaveBeenCalled();
});
it.each([{id:1433,role:'provider'},{id:1434,role:'support'},{id:1435,role:'admin'}])('retains authorized appointment editing for %j',async user=>{
 const {res,next}=await request(user);expect(next).not.toHaveBeenCalled();expect(res.status).not.toHaveBeenCalled();expect(updateAppointment).toHaveBeenCalledWith(84,{serviceCode:'90791'},{actorUserId:user.id});
});
it('denies users outside the agency even if they have a scheduling role',async()=>{
 User.getAgencies.mockResolvedValue([{id:2}]);const{res}=await request({id:99,role:'support'});expect(res.status).toHaveBeenCalledWith(403);expect(updateAppointment).not.toHaveBeenCalled();
});
