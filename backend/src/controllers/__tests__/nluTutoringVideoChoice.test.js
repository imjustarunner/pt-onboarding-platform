import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(),supervisorHasAccess:vi.fn()}}));
vi.mock('../../services/staffAppointmentMeet.service.js',()=>({prepareStaffAppointmentMeet:vi.fn()}));
vi.mock('../../services/appointment.service.js',()=>({createAppointment:vi.fn(),updateAppointment:vi.fn(),cancelAppointment:vi.fn(),getAppointmentBundle:vi.fn(),linkProviderScheduleEvent:vi.fn(),settleAppointment:vi.fn()}));
vi.mock('../../services/schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:vi.fn(),schedulingResponseForUser:vi.fn(async(user,agency,body)=>body)}));
import Appointment from '../../models/Appointment.model.js';
import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import {updateAppointment} from '../../services/appointment.service.js';
import {prepareStaffAppointmentMeet} from '../../services/staffAppointmentMeet.service.js';
import {updateAppointmentHandler} from '../appointment.controller.js';
let saved,original;
beforeEach(()=>{
 vi.clearAllMocks();original={id:84,agencyId:6,providerUserId:501,businessType:'tutoring',serviceCode:'TUTORING',videoRoomMode:'unique_session',endAt:'2099-01-01 18:00:00'};saved={...original,videoRoomMode:'google_meet'};
 Appointment.findById.mockImplementation(async()=>({...original}));Agency.findById.mockResolvedValue({id:6,slug:'nlu'});User.getAgencies.mockResolvedValue([{id:6}]);
 updateAppointment.mockImplementation(async()=>({...saved}));prepareStaffAppointmentMeet.mockResolvedValue('https://meet.google.com/abc-defg-hij');
});
async function request(){const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await updateAppointmentHandler({params:{id:'84'},body:{videoRoomMode:'google_meet'},user:{id:501,role:'provider'}},res,next);return{res,next};}
it('prepares the existing NLU booking after changing its meeting option without changing its service',async()=>{
 const {res,next}=await request();expect(next).not.toHaveBeenCalled();expect(prepareStaffAppointmentMeet).toHaveBeenCalledWith(saved);
 expect(res.json).toHaveBeenCalledWith({ok:true,appointment:saved});expect(updateAppointment).toHaveBeenCalledTimes(1);
});
it('preserves the saved booking and provides a retry warning when Google workspace preparation fails',async()=>{
 prepareStaffAppointmentMeet.mockRejectedValue(Object.assign(Error('Workspace unavailable'),{status:409}));const{res,next}=await request();
 expect(next).not.toHaveBeenCalled();expect(updateAppointment).toHaveBeenCalledTimes(1);
 expect(res.json).toHaveBeenCalledWith({ok:true,appointment:{...saved,calendarWarnings:[expect.stringContaining('appointment is saved')]}});
});
it('leaves another agency’s existing meeting preparation unchanged',async()=>{
 Agency.findById.mockResolvedValue({id:6,slug:'another-agency'});await request();expect(prepareStaffAppointmentMeet).not.toHaveBeenCalled();
});
it('does not prepare a second Meet for an unchanged selection or an ended appointment',async()=>{
 original.videoRoomMode='google_meet';await request();expect(prepareStaffAppointmentMeet).not.toHaveBeenCalled();
 original.videoRoomMode='unique_session';saved.endAt='2020-01-01 18:00:00';await request();expect(prepareStaffAppointmentMeet).not.toHaveBeenCalled();
});
it('denies a revoked agency membership before saving or preparing a meeting',async()=>{
 User.getAgencies.mockResolvedValue([]);const{res}=await request();expect(res.status).toHaveBeenCalledWith(403);expect(updateAppointment).not.toHaveBeenCalled();expect(prepareStaffAppointmentMeet).not.toHaveBeenCalled();
});
