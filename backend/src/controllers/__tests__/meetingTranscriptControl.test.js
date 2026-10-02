vi.mock('../../services/speechTranscription.service.js',()=>({transcribeLongAudio:m.speech}));
vi.mock('../../services/sessionAiPrivacy.service.js',()=>({requireSessionPrivacyConfiguration:m.privacy}));
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),event:vi.fn(),artifact:vi.fn(),ensure:vi.fn(),append:vi.fn(),participants:vi.fn(),speech:vi.fn(),privacy:vi.fn()}));
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
import {appendTeamMeetingAudio,getTeamMeetingTranscriptionState,postTeamMeetingTranscriptControl,getTeamMeetingAdmissionStatus,saveTeamMeetingClientTranscript,putMeetingParticipantPreferences} from '../teamMeetings.controller.js';
const response=()=>{const res={json:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res;};
describe('room-wide transcript opt-in',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();m.execute.mockImplementation(async sql => sql.includes('FROM users u JOIN agencies') ? [[{active:1}]] : [[]]);m.ensure.mockResolvedValue({});
    m.event.mockResolvedValue({id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING',meeting_subtype:'general'});
    m.artifact.mockResolvedValue({transcript_started_at:'2026-09-21 12:00:00',transcript_paused:0});
  });
  it('persists a host start independently of attendance and returns its state',async()=>{
    const res=response(),next=vi.fn();
    await postTeamMeetingTranscriptControl({params:{eventId:'9'},user:{id:7,role:'staff'},body:{action:'start'}},res,next);
    expect(next).not.toHaveBeenCalled();
    expect(m.execute.mock.calls.some(([sql])=>sql.includes('transcript_started_at=COALESCE'))).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({action:'start',transcriptStartedAt:'2026-09-21 12:00:00'}));
    expect(m.execute.mock.calls.every(([sql])=>!sql.includes('attendance_tracking'))).toBe(true);
  });
  it('returns persisted transcript state during rejoin polling even with attendance off',async()=>{
    m.execute.mockImplementation(async sql => sql.includes('FROM users u JOIN agencies') ? [[{ active: 1 }]] : [[]]);
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
  it('does not auto-capture general meetings even when transcription capability is enabled',async()=>{
    m.event.mockResolvedValue({id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING',meeting_subtype:'general',meeting_settings_json:{transcription:true}});
    m.artifact.mockResolvedValue({transcript_started_at:null,transcript_paused:0});
    const res=response();
    await saveTeamMeetingClientTranscript({params:{eventId:'9'},user:{id:7},body:{transcript:'Not consented'}},res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);expect(m.append).not.toHaveBeenCalled();
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
    vi.clearAllMocks();m.event.mockResolvedValue({id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING'});m.participants.mockResolvedValue([{id:8}]);m.execute.mockImplementation(async sql => sql.includes('FROM users u JOIN agencies') ? [[{active:1}]] : [[]]);
    const req={params:{eventId:9,userId:8},user:{id:7,role:'provider'},body:{isRequired:false,isCohost:true}},res=response(),next=vi.fn();
    await putMeetingParticipantPreferences(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({ok:true});
    m.execute.mockResolvedValue([[{candidate:1}]]);const denied=response();await putMeetingParticipantPreferences(req,denied,next);expect(denied.status).toHaveBeenCalledWith(400);
  });
});


describe('approved team audio transcription',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.privacy.mockReset();m.speech.mockResolvedValue('Private words');m.execute.mockResolvedValue([[{active:1}]]);m.event.mockResolvedValue({id:9,agency_id:2,provider_id:7,kind:'TEAM_MEETING',meeting_subtype:'general'});m.artifact.mockResolvedValue({transcript_started_at:'2026-10-01',transcript_revision:2,transcript_paused:0});});
 const req=()=>({params:{eventId:'9'},user:{id:7,role:'staff',firstName:'Alex'},body:{revision:'2'},file:{buffer:Buffer.from('synthetic'),mimetype:'audio/wav'}});
 it('does not send audio before manual general-meeting start',async()=>{
  m.artifact.mockResolvedValue({transcript_revision:2});const next=vi.fn();await appendTeamMeetingAudio(req(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.speech).not.toHaveBeenCalled();
 });
 it('blocks processing without approved privacy configuration',async()=>{
  m.privacy.mockImplementation(()=>{throw Object.assign(new Error('Unavailable'),{status:503});});const next=vi.fn();await appendTeamMeetingAudio(req(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:503}));expect(m.speech).not.toHaveBeenCalled();
 });
 it('discards in-flight audio when pause and resume changes the revision',async()=>{
  m.speech.mockImplementation(async()=>{m.artifact.mockResolvedValue({transcript_started_at:'2026-10-01',transcript_revision:4,transcript_paused:0});return 'Private words';});const next=vi.fn();await appendTeamMeetingAudio(req(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.append).not.toHaveBeenCalled();
 });
 it('saves with a locked revision check and sends no transcript back in the upload response',async()=>{
  const res=response(),next=vi.fn();await appendTeamMeetingAudio(req(),res,next);expect(next).not.toHaveBeenCalled();expect(m.append).toHaveBeenCalledWith(expect.objectContaining({eventId:9,expectedRevision:2,updatedByUserId:7}));expect(res.json).toHaveBeenCalledWith({ok:true,saved:true});
 });
});
