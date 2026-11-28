import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../../models/CounselingSession.model.js',()=>({default:{findByAppointmentId:vi.fn(),create:vi.fn()}}));
vi.mock('../../services/nluTutoringVideoChoice.service.js',()=>({nluTutoringVideoChoice:vi.fn(async()=>true)}));
vi.mock('../../services/video.service.js',()=>({isVideoConfigured:()=>false,createOrGetRoomByUniqueName:vi.fn(),createAccessTokenAsync:vi.fn(),resolveVideoProjectId:vi.fn(),getVideoClientDiagnostics:vi.fn()}));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Appointment from '../../models/Appointment.model.js';
import CounselingSession from '../../models/CounselingSession.model.js';
import {findOrCreateFromAppointment} from '../counselingSessions.controller.js';
beforeEach(()=>{vi.clearAllMocks();User.getAgencies.mockResolvedValue([{id:6}]);Appointment.findById.mockResolvedValue({id:1,agencyId:6,providerUserId:20,businessType:'mental_health',serviceCode:'H2014',videoRoomMode:'unique_session'});Appointment.listParticipants.mockResolvedValue([{clientId:40}]);});
async function open(user={id:20,role:'provider'}){const res={status:vi.fn().mockReturnThis(),json:vi.fn()};await findOrCreateFromAppointment({body:{appointmentId:1,agencyId:6},user},res);return res;}
it('routes a native NLU appointment to the full Hub without creating a second counseling/video session',async()=>{
 const res=await open();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({session:{publicId:'tutoring-appointment:1'},sharePath:'/tutoring/appointment/1?agencyId=6&clientId=40'}));
 expect(pool.getConnection).not.toHaveBeenCalled();expect(CounselingSession.create).not.toHaveBeenCalled();
});
it('rejects another provider or revoked membership before returning a Hub destination',async()=>{
 expect((await open({id:21,role:'provider'})).status).toHaveBeenCalledWith(403);User.getAgencies.mockResolvedValue([]);expect((await open()).status).toHaveBeenCalledWith(403);
});
