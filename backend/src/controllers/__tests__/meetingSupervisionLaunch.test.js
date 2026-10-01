import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),session:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{resolveByJoinRef:m.session,findById:m.session,classifyJoinTokenRole:()=>null}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://tenant.example'}));
vi.mock('../../services/video.service.js',()=>({isVideoConfigured:()=>true,resolveVideoProjectId:()=> 'project',getVideoClientDiagnostics:()=>({})}));
import { getSupervisionJoinInfo,getSupervisionVideoToken,getAdmissionStatus,postSupervisionJoinPresence,getSupervisionGuestJoin,getGuestAdmissionStatus,saveGuestTranscript } from '../supervisionSessions.controller.js';
import { getSupervisionGuestActivity,postSupervisionGuestActivity } from '../videoMeetingActivity.controller.js';
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
const session={id:9,agency_id:2,supervisor_user_id:7,session_type:'group',status:'SCHEDULED',host_join_token:'PRIVATE-HOST',participant_join_token:'PRIVATE-PARTICIPANT'};
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({...session});m.execute.mockImplementation(async sql=>sql.includes('SELECT a.slug')?[[{slug:'tenant'}]]:[[]]);});
describe('supervision legacy access retirement',()=>{
  it.each([getSupervisionGuestJoin,getGuestAdmissionStatus,saveGuestTranscript,getSupervisionGuestActivity,postSupervisionGuestActivity])('does not expose room credentials or content through retired guest handler %#',async handler=>{
    const res=response();await handler({params:{joinToken:'PRIVATE-PARTICIPANT'}},res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);expect(m.execute).not.toHaveBeenCalled();expect(m.session).not.toHaveBeenCalled();
  });
  it('public metadata preserves the input reference without revealing room tokens',async()=>{
    const res=response(),next=vi.fn();await getSupervisionJoinInfo({params:{sessionId:'9'}},res,next);
    expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalled();const payload=res.json.mock.calls[0][0];
    expect(payload.joinToken).toBe('9');expect(payload.guestJoinAllowed).toBe(false);expect(JSON.stringify(payload)).not.toContain('PRIVATE-');
  });
  it('denies unauthenticated attendance updates',async()=>{
    const res=response();await postSupervisionJoinPresence({params:{id:'9'},body:{identity:'user-7'}},res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);expect(m.execute).not.toHaveBeenCalled();
  });
  it('denies a removed membership even when the user is the original supervisor',async()=>{
    for(const handler of [getSupervisionVideoToken,getAdmissionStatus,postSupervisionJoinPresence]){
      const res=response(),next=vi.fn();await handler({params:{id:'9'},user:{id:7},query:{},body:{identity:'user-999'}},res,next);
      expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(403);
    }
  });
  it('never grants lobby admission for a cancelled session',async()=>{
    m.session.mockResolvedValue({...session,status:'CANCELLED'});const res=response(),next=vi.fn();
    await getAdmissionStatus({params:{id:'9'},user:{id:7}},res,next);
    expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(410);
  });
});
