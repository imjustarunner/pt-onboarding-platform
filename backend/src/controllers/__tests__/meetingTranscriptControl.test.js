import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),event:vi.fn(),artifact:vi.fn(),ensure:vi.fn(),append:vi.fn(),participants:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{findById:m.event,resolveByJoinRef:m.event,classifyJoinTokenRole:()=>null}}));
vi.mock('../../models/ProviderScheduleEventAttendee.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{findByEventId:m.artifact,ensureTagged:m.ensure,appendTranscriptChunk:m.append}}));
vi.mock('../../models/HiringInterview.model.js',()=>({default:{}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:vi.fn()}));
vi.mock('../../utils/uploads.js',()=>({publicUploadsUrlFromStoredPath:vi.fn()}));
vi.mock('../../services/meetingParticipants.service.js',()=>({meetingParticipantRows:m.participants}));
vi.mock('../../services/hiringInterviewAccess.service.js',()=>({canAccessHiringInterview:vi.fn()}));
vi.mock('../../services/meetingAttendanceSegments.service.js',()=>({isAttendanceTrackingEnabledForEvent:()=>false}));
vi.mock('../interviewHub.controller.js',()=>({buildInterviewEndedGuestPayload:vi.fn()}));
vi.mock('../../services/video.service.js',()=>({isVideoConfigured:vi.fn(),createOrGetRoomByUniqueName:vi.fn(),createAccessTokenAsync:vi.fn(),completeRoom:vi.fn(),setHostOnlyRecordingRules:vi.fn(),setRecordAllRecordingRules:vi.fn(),resolveVideoProjectId:vi.fn(),getVideoClientDiagnostics:vi.fn()}));
import {postTeamMeetingTranscriptControl,getTeamMeetingAdmissionStatus,saveTeamMeetingClientTranscript,putMeetingParticipantPreferences} from '../teamMeetings.controller.js';
const response=()=>{const res={json:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res;};
describe('room-wide transcript opt-in',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.ensure.mockResolvedValue({});
    m.event.mockResolvedValue({id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING',meeting_subtype:'general'});
    m.artifact.mockResolvedValue({transcript_started_at:'2026-09-21 12:00:00',transcript_paused:0});
  });
  it('persists a host start independently of attendance and returns its state',async()=>{
    const res=response(),next=vi.fn();
    await postTeamMeetingTranscriptControl({params:{eventId:'9'},user:{id:7,role:'staff'},body:{action:'start'}},res,next);
    expect(next).not.toHaveBeenCalled();
    expect(m.execute.mock.calls[0][0]).toContain('transcript_started_at=COALESCE');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({action:'start',transcriptStartedAt:'2026-09-21 12:00:00'}));
    expect(m.execute.mock.calls.every(([sql])=>!sql.includes('attendance_tracking'))).toBe(true);
  });
  it('returns persisted transcript state during rejoin polling even with attendance off',async()=>{
    const res=response(),next=vi.fn();
    await getTeamMeetingAdmissionStatus({params:{eventId:'9'},user:{id:7,role:'staff'}},res,next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({attendanceTrackingEnabled:false,transcriptState:{startedAt:'2026-09-21 12:00:00',paused:false,stoppedAt:null,stoppedByName:null}}));
  });
  it('does not allow ordinary invitees to start transcription',async()=>{
    const res=response();
    await postTeamMeetingTranscriptControl({params:{eventId:'9'},user:{id:8,role:'provider'},body:{action:'start'}},res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
  });
  it('acknowledges live captions after atomic saving without an AI summary dependency',async()=>{
    m.append.mockResolvedValue({transcript_text:'[Alex] Hello'});
    const res=response(),next=vi.fn();
    await saveTeamMeetingClientTranscript({params:{eventId:'9'},user:{id:7},body:{transcript:'Hello',speakerLabel:'Alex'}},res,next);
    expect(next).not.toHaveBeenCalled();
    expect(m.append).toHaveBeenCalledWith({eventId:9,text:'[Alex] Hello',updatedByUserId:7});
    expect(res.json).toHaveBeenCalledWith({ok:true,eventId:9,chars:12});
  });
});

 describe('meeting participant controls',()=>{
  it('prevents ordinary invitees from promoting cohosts',async()=>{
    m.event.mockResolvedValue({id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING'});
    m.execute.mockResolvedValue([[{invited:1}]]);const res=response();
    await putMeetingParticipantPreferences({params:{eventId:9,userId:8},user:{id:8,role:'provider'},body:{isRequired:true,isCohost:true}},res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('allows the host to update an invited participant but never promotes interview candidates',async()=>{
    vi.clearAllMocks();m.event.mockResolvedValue({id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING'});m.participants.mockResolvedValue([{id:8}]);m.execute.mockResolvedValue([[]]);
    const req={params:{eventId:9,userId:8},user:{id:7,role:'provider'},body:{isRequired:false,isCohost:true}},res=response(),next=vi.fn();
    await putMeetingParticipantPreferences(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({ok:true});
    m.execute.mockResolvedValue([[{candidate:1}]]);const denied=response();await putMeetingParticipantPreferences(req,denied,next);expect(denied.status).toHaveBeenCalledWith(400);
  });
});
