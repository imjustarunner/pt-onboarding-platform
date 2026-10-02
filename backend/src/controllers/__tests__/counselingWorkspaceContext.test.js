import { beforeEach, describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),appointment:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/CounselingSession.model.js',()=>({default:{findByIdOrPublicId:m.session,ensureInviteToken:async()=>({id:9}),toPublic:()=>({id:9,agencyId:7})}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.appointment}}));
vi.mock('../../models/CounselingSessionActivityRuntime.model.js',()=>({default:{findActiveForSession:async()=>null}}));
vi.mock('../../services/video.service.js',()=>({isVideoConfigured:()=>false,createOrGetRoomByUniqueName:vi.fn(),createAccessTokenAsync:vi.fn(),resolveVideoProjectId:vi.fn(),getVideoClientDiagnostics:vi.fn()}));
import {getSession} from '../counselingSessions.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({id:9,public_id:'public9',agency_id:7,provider_user_id:5,appointment_id:12});});
describe('counseling workspace context',()=>{
 it.each(['tutoring','mental_health'])('returns %s context without exposing appointment details',async businessType=>{
  m.appointment.mockResolvedValue({businessType,clientName:'Private',billing:{balance:12}});
  const res={json:vi.fn(),status:vi.fn().mockReturnThis()};
  await getSession({params:{sessionId:'public9'},user:{id:5,role:'provider'}},res);
  expect(res.json.mock.calls[0][0].session).toEqual({id:9,agencyId:7,businessType});
 });
 it('checks participant access before looking up appointment context',async()=>{
  const res={json:vi.fn(),status:vi.fn().mockReturnThis()};
  await getSession({params:{sessionId:'public9'},user:{id:8,role:'provider'}},res);
  expect(res.status).toHaveBeenCalledWith(403);expect(m.appointment).not.toHaveBeenCalled();
 });
});
