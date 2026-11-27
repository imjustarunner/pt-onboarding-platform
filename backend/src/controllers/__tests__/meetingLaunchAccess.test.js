import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({prune:vi.fn(),summary:vi.fn(),execute:vi.fn(),event:vi.fn(),artifact:vi.fn(),ensure:vi.fn(),append:vi.fn(),participants:vi.fn(),open:vi.fn(),close:vi.fn(),rebuild:vi.fn(),interview:vi.fn(),videoToken:vi.fn(),user:vi.fn(),interviewAccess:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{findById:m.event,resolveByJoinRef:m.event,classifyJoinTokenRole:(row,ref)=>ref===row.host_join_token?'host':ref===row.participant_join_token?'participant':null}}));
vi.mock('../../models/ProviderScheduleEventAttendee.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{transcriptControls:vi.fn(async()=>({transcript_paused:1})),findByEventId:m.artifact,ensureTagged:m.ensure,appendTranscriptChunk:m.append}}));
vi.mock('../../models/HiringInterview.model.js',()=>({default:{findByScheduleEventId:m.interview}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=>'https://tenant.example'}));
vi.mock('../../utils/uploads.js',()=>({publicUploadsUrlFromStoredPath:vi.fn()}));
vi.mock('../../services/meetingParticipants.service.js',()=>({meetingParticipantRows:m.participants}));
vi.mock('../../services/hiringInterviewAccess.service.js',()=>({canAccessHiringInterview:m.interviewAccess}));
vi.mock('../../services/meetingAttendanceSegments.service.js',()=>({isAttendanceTrackingEnabledForEvent:event=>event?.meeting_subtype==='training',pruneStaleJoinPresenceForEvent:m.prune,listAttendanceSummary:m.summary,openAttendanceSegment:m.open,closeAttendanceSegment:m.close,rebuildAttendanceRollupsFromSegments:m.rebuild}));
vi.mock('../interviewHub.controller.js',()=>({buildInterviewEndedGuestPayload:vi.fn()}));
vi.mock('../../services/video.service.js',()=>({isVideoConfigured:()=>true,createOrGetRoomByUniqueName:vi.fn(),createAccessTokenAsync:m.videoToken,completeRoom:vi.fn(),setHostOnlyRecordingRules:vi.fn(),setRecordAllRecordingRules:vi.fn(),resolveVideoProjectId:()=> 'test-project',getVideoClientDiagnostics:vi.fn()}));

import { setTeamMeetingWaitingRoomLive, getTeamMeetingAttendance, getTeamMeetingLobbyParticipants, getTeamMeetingJoinInfo, getTeamMeetingVideoToken, getTeamMeetingAdmissionStatus, postTeamMeetingJoinPresence } from '../teamMeetings.controller.js';
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
const event={id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING',status:'ACTIVE',waiting_room_enabled:0,host_join_token:'PRIVATE-HOST',participant_join_token:'PRIVATE-PARTICIPANT'};
const req=(ref='9',user={id:7,role:'staff'})=>({params:{eventId:ref},user,body:{identity:'user-999',isGuest:true},query:{}});
beforeEach(()=>{
  vi.clearAllMocks();m.event.mockResolvedValue({...event});m.artifact.mockResolvedValue(null);
  m.execute.mockImplementation(async sql=>sql.includes('FROM users u JOIN agencies')?[[{active:1}]]:sql.includes('SELECT a.slug')?[[{slug:'tenant'}]]:[[]]);
  m.interviewAccess.mockResolvedValue(false);m.open.mockResolvedValue({created:true});m.interview.mockResolvedValue(null);
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
  it('handles 50 simultaneous training heartbeats without rebuilding room-wide attendance', async () => {
    m.event.mockResolvedValue({...event, meeting_subtype: 'training'});
    m.execute.mockImplementation(async sql =>
      sql.includes('FROM users u JOIN agencies') || sql.includes('FROM provider_schedule_event_attendees WHERE')
        ? [[{allowed: 1}]] : [[]]);
    m.open.mockResolvedValue({alreadyOpen: true});
    const next = vi.fn();
    const attendees = Array.from({length: 50}, (_, i) => req('9', {id: i + 20, role: 'staff'}));
    const responses = attendees.map(response);
    await Promise.all(attendees.map((request, i) => postTeamMeetingJoinPresence(request, responses[i], next)));
    expect(next).not.toHaveBeenCalled();
    expect(responses.every(res => res.json.mock.calls[0]?.[0]?.admitted === true)).toBe(true);
    expect(m.open).toHaveBeenCalledTimes(50);
    expect(m.rebuild).not.toHaveBeenCalled();
    attendees[0].body.action = 'leave';
    await postTeamMeetingJoinPresence(attendees[0], response(), next);
    expect(m.close).toHaveBeenCalledWith({eventId: 9, joinIdentity: 'user-20'});
    expect(m.rebuild).toHaveBeenCalledWith(9, {syncClaims: true});
  });
  it('reads training time from segments without opening attendance for waiting users', async () => {
    m.event.mockResolvedValue({...event, meeting_subtype:'training', waiting_room_enabled:1});
    m.summary.mockResolvedValue({participants:[{userId:7,totalSeconds:60}]});
    m.participants.mockResolvedValue([]);
    const res = response(), next = vi.fn();
    await getTeamMeetingAttendance(req(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({participants:[{userId:7,totalSeconds:60}]}));
    expect(m.prune).toHaveBeenCalledWith(9, {staleSeconds:45});
    expect(m.open).not.toHaveBeenCalled();
    expect(m.rebuild).not.toHaveBeenCalled();
  });
  it('reads connected training status without repeating lobby admission or opening attendance', async () => {
    m.event.mockResolvedValue({...event, meeting_subtype: 'training'});
    const request = req();
    request.query.statusOnly = '1';
    const res = response(), next = vi.fn();
    await getTeamMeetingAdmissionStatus(request, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({meetingCompleted: false, transcriptState: expect.objectContaining({paused:true})}));
    expect(m.artifact).not.toHaveBeenCalled();
    expect(m.execute.mock.calls.every(([sql]) => !/^\s*(INSERT|UPDATE)/i.test(sql))).toBe(true);
    expect(m.videoToken).not.toHaveBeenCalled();
    expect(m.open).not.toHaveBeenCalled();
    const outsider = req('9', {id: 88, role: 'staff'});
    outsider.query.statusOnly = '1';
    await getTeamMeetingAdmissionStatus(outsider, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
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

it.each(['9', 'PRIVATE-PARTICIPANT', 'PRIVATE-HOST'])('assigned interviewer on %s gets workspace access without host powers', async ref => {
  m.event.mockResolvedValue({...event, meeting_subtype:'interview', waiting_room_enabled:1, twilio_room_sid:'interview-room'});
  m.interview.mockResolvedValue({id:5, candidate_user_id:30, status:'in_progress'});
  m.interviewAccess.mockResolvedValue(true);m.user.mockResolvedValue({first_name:'Elena',last_name:'Interviewer'});
  m.videoToken.mockResolvedValue('staff-video-token');
  const request=req(ref,{id:8,role:'provider'}),res=response(),next=vi.fn();
  await getTeamMeetingJoinInfo(request,res,next);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({isInterviewer:true}));
  await getTeamMeetingVideoToken(request,res,next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({isHost:false,isInterviewer:true,isGuest:false,roomMode:'main',roleLabel:'Interviewer'}));
  await getTeamMeetingAdmissionStatus(request,res,next);
  expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({admitted:true,roomMode:'main'}));
  await getTeamMeetingLobbyParticipants(request,res,next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({participants:[], waitingRoomEnabled:true}));
  await setTeamMeetingWaitingRoomLive(request,res,next);
  expect(res.status).toHaveBeenCalledWith(403);
});
