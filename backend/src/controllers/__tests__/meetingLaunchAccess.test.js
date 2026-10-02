import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),event:vi.fn(),artifact:vi.fn(),ensure:vi.fn(),append:vi.fn(),participants:vi.fn(),open:vi.fn(),close:vi.fn(),rebuild:vi.fn(),interview:vi.fn(),videoToken:vi.fn(),user:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{findById:m.event,resolveByJoinRef:m.event,classifyJoinTokenRole:(row,ref)=>ref===row.host_join_token?'host':ref===row.participant_join_token?'participant':null}}));
vi.mock('../../models/ProviderScheduleEventAttendee.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{findByEventId:m.artifact,ensureTagged:m.ensure,appendTranscriptChunk:m.append}}));
vi.mock('../../models/HiringInterview.model.js',()=>({default:{findByScheduleEventId:m.interview}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=>'https://tenant.example'}));
vi.mock('../../utils/uploads.js',()=>({publicUploadsUrlFromStoredPath:vi.fn()}));
vi.mock('../../services/meetingParticipants.service.js',()=>({meetingParticipantRows:m.participants}));
vi.mock('../../services/hiringInterviewAccess.service.js',()=>({canAccessHiringInterview:vi.fn()}));
vi.mock('../../services/meetingAttendanceSegments.service.js',()=>({isAttendanceTrackingEnabledForEvent:()=>false,openAttendanceSegment:m.open,closeAttendanceSegment:m.close,rebuildAttendanceRollupsFromSegments:m.rebuild}));
vi.mock('../interviewHub.controller.js',()=>({buildInterviewEndedGuestPayload:vi.fn()}));
vi.mock('../../services/video.service.js',()=>({isVideoConfigured:()=>true,createOrGetRoomByUniqueName:vi.fn(),createAccessTokenAsync:m.videoToken,completeRoom:vi.fn(),setHostOnlyRecordingRules:vi.fn(),setRecordAllRecordingRules:vi.fn(),resolveVideoProjectId:()=> 'test-project',getVideoClientDiagnostics:vi.fn()}));

import { getTeamMeetingJoinInfo, getTeamMeetingVideoToken, getTeamMeetingAdmissionStatus, postTeamMeetingJoinPresence } from '../teamMeetings.controller.js';
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
const event={id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING',status:'ACTIVE',waiting_room_enabled:0,host_join_token:'PRIVATE-HOST',participant_join_token:'PRIVATE-PARTICIPANT'};
const req=(ref='9',user={id:7,role:'staff'})=>({params:{eventId:ref},user,body:{identity:'user-999',isGuest:true},query:{}});
beforeEach(()=>{
  vi.clearAllMocks();m.event.mockResolvedValue({...event});m.artifact.mockResolvedValue(null);
  m.execute.mockImplementation(async sql=>sql.includes('FROM users u JOIN agencies')?[[{active:1}]]:sql.includes('SELECT a.slug')?[[{slug:'tenant'}]]:[[]]);
  m.open.mockResolvedValue({created:true});m.interview.mockResolvedValue(null);
});
describe('launch room and presence boundaries',()=>{
  it.each(['9','PRIVATE-PARTICIPANT'])('public join metadata for %s never reveals another role token',async ref=>{
    const res=response(),next=vi.fn();await getTeamMeetingJoinInfo(req(ref,null),res,next);
    expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalled();
    const payload=res.json.mock.calls[0][0];
    expect(payload.joinToken).toBe(ref);expect(payload.canonicalJoinUrl).toBe(`https://tenant.example/join/team-meeting/${ref}`);
    expect(JSON.stringify(payload)).not.toContain('PRIVATE-HOST');
    if(ref==='9')expect(JSON.stringify(payload)).not.toContain('PRIVATE-PARTICIPANT');
    expect(payload).not.toHaveProperty('hostJoinToken');
  });
  it('rejects anonymous ordinary-meeting presence before writing attendance',async()=>{
    const res=response();await postTeamMeetingJoinPresence(req('PRIVATE-PARTICIPANT',null),res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);expect(m.open).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
  });
  it('ignores forged identities and guest flags for authenticated attendance',async()=>{
    const res=response(),next=vi.fn();await postTeamMeetingJoinPresence(req(),res,next);
    expect(next).not.toHaveBeenCalled();expect(m.open).toHaveBeenCalledWith(expect.objectContaining({userId:7,joinIdentity:'user-7'}));
    const presence=m.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO provider_schedule_event_join_presence'));
    expect(presence[1]).toEqual([9,'user-7',null,0]);
  });
  it('does not let an uninvited staff member create attendance or obtain admission',async()=>{
    for(const handler of [postTeamMeetingJoinPresence,getTeamMeetingAdmissionStatus,getTeamMeetingVideoToken]){
      const res=response();await handler(req('9',{id:8,role:'staff'}),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(m.open).not.toHaveBeenCalled();
  });
  it('does not promote an invited administrator merely because they opened a legacy host link',async()=>{
    m.execute.mockImplementation(async sql=>sql.includes('FROM users u JOIN agencies') || sql.includes('FROM provider_schedule_event_attendees WHERE') ? [[{allowed:1}]] : [[]]);
    const res=response(),next=vi.fn();await getTeamMeetingVideoToken(req('PRIVATE-HOST',{id:8,role:'admin'}),res,next);
    expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(403);
    expect(m.open).not.toHaveBeenCalled();
  });
  it.each([['CANCELLED',1,410],['ACTIVE',0,400]])('blocks %s/platform=%s through all room entry points',async(status,platform_video_link,code)=>{
    m.event.mockResolvedValue({...event,status,platform_video_link});
    for(const handler of [postTeamMeetingJoinPresence,getTeamMeetingAdmissionStatus,getTeamMeetingVideoToken]){
      const res=response();await handler(req(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(code);
    }
    expect(m.open).not.toHaveBeenCalled();
  });
  it('preserves candidate guest presence, bound to the interview token rather than a supplied staff identity',async()=>{
    m.event.mockResolvedValue({...event,meeting_subtype:'interview'});
    const next=vi.fn();await postTeamMeetingJoinPresence(req('PRIVATE-PARTICIPANT',null),response(),next);
    expect(next).not.toHaveBeenCalled();expect(m.open).toHaveBeenCalledWith(expect.objectContaining({userId:null,joinIdentity:expect.stringMatching(/^guest-iv-/)}));
  });
  it('allows authenticated leave cleanup after a meeting is cancelled',async()=>{
    m.event.mockResolvedValue({...event,status:'CANCELLED'});const request=req();request.body.action='leave';
    await postTeamMeetingJoinPresence(request,response(),vi.fn());
    expect(m.close).toHaveBeenCalledWith({eventId:9,joinIdentity:'user-7'});expect(m.open).not.toHaveBeenCalled();
  });
  it('mints applicant video credentials and retains their identity after waiting-room admission',async()=>{
    m.event.mockResolvedValue({...event,meeting_subtype:'interview',twilio_room_sid:'interview-room'});
    m.interview.mockResolvedValue({candidate_user_id:30}); m.user.mockResolvedValue({first_name:'Jamie',last_name:'Applicant'});
    m.videoToken.mockResolvedValue('applicant-video-token');
    for(const handler of [getTeamMeetingVideoToken,getTeamMeetingAdmissionStatus]){
      const res=response(),next=vi.fn();await handler(req('PRIVATE-PARTICIPANT',null),res,next);
      expect(next).not.toHaveBeenCalled();expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({token:'applicant-video-token',sessionId:'interview-room',isHost:false,displayName:'Jamie Applicant',roleLabel:'Applicant'}));
    }
    expect(m.videoToken).toHaveBeenCalledWith(expect.objectContaining({identity:expect.stringMatching(/^guest-iv-/),metadata:expect.objectContaining({role:'participant',roleLabel:'Applicant'})}));
    expect(m.open).not.toHaveBeenCalled();
  });
});
