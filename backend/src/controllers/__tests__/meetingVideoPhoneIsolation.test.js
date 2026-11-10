import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), session: vi.fn(), events: new Map(), admissions: new Set(), rollup: vi.fn(), record: vi.fn(), token: vi.fn(), append: vi.fn(), upsert: vi.fn(), end:vi.fn(), complete:vi.fn(), create:vi.fn(), team:null }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => ({ execute:m.execute, release:vi.fn() }) }, onTableWrite: vi.fn() }));
vi.mock('../../utils/tenantMeetingUrl.js', () => ({ tenantMeetingBase: async () => 'https://tenant.example' }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: async () => [{ id: 2 }], findById: async id => ({ id, first_name: id === 7 ? 'Supervisor' : 'Rachel', last_name: 'Example' }) } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: {
  resolveByJoinRef: m.session, findById: m.session, classifyJoinTokenRole: () => null, setVideoRoom:vi.fn(),
  findAttendeeBySessionUser: async (sid, uid) => ({ id: uid + 100 }),
  listAttendanceEventsForSessionUser: async ({ userId }) => m.events.get(userId) || [],
  recordAttendanceEvent: m.record, setAttendeeStatus: vi.fn(), upsertAttendanceRollup: m.rollup, setLiveEnded:m.end
} }));
vi.mock('../../models/SupervisionSessionArtifact.model.js', () => ({ default: { appendTranscriptChunk: m.append, upsertBySessionId: m.upsert, findBySessionId: async () => null } }));
vi.mock('../../services/vonageVideo.service.js',()=>({resolveVideoProjectId:()=> 'project',default:{isVideoConfigured:()=>true,createSession:m.create,endLiveSession:m.complete}}));
vi.mock('../../services/video.service.js',async original=>({...await original(),createAccessTokenAsync:m.token,getVideoClientDiagnostics:()=>({})}));
vi.mock('../../services/meetingDialInPolicy.js',async original=>({...await original(),dialInConfigured:()=>true}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{resolveByJoinRef:async()=>m.team,findById:async()=>m.team,classifyJoinTokenRole:()=>null,setVideoRoom:vi.fn()}}));
vi.mock('../../models/HiringInterview.model.js',()=>({default:{findByScheduleEventId:async()=>null}}));
import {getTeamMeetingVideoToken,getTeamMeetingAdmissionStatus} from '../teamMeetings.controller.js';
import { postSupervisionConnectionEvent, getSupervisionVideoToken, postSupervisionJoinPresence, saveClientTranscript, upsertSupervisionSessionArtifacts, endSupervisionLiveSession, finalizeSupervisionSession } from '../supervisionSessions.controller.js';
let session;
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() });
const request = (id = 8, body = {}) => ({ params: { id: '9' }, query: {}, body: {inMainRoom:true,...body}, user: { id, role: 'provider', first_name: id === 7 ? 'Supervisor' : 'Rachel', last_name: 'Example' }, supervisionInvitationAccess: { sessionId: 9 } });
async function invoke(handler, req = request()) {
  const res = response(), next = vi.fn(); await handler(req, res, next); expect(next).not.toHaveBeenCalled(); return res;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T15:00:00Z')); m.events.clear(); m.admissions.clear();
  session = { id: 9, agency_id: 2, supervisor_user_id: 7, supervisee_user_id: 8, session_type: 'individual', status: 'SCHEDULED', waiting_room_enabled: 0, start_at: '2026-10-01 15:00:00', end_at: '2026-10-01 16:00:00', twilio_room_sid: 'video-room' };
  m.session.mockImplementation(async () => session); m.token.mockResolvedValue('provider-video-token');
  m.append.mockResolvedValue({ transcriptText: 'saved' }); m.create.mockResolvedValue('fresh-shared-room');
  session.twilio_room_sid=null;session.modality='virtual';session.meeting_settings_json={reminders:[5]};
  m.team={...session,kind:'TEAM_MEETING',status:'ACTIVE',provider_id:7,platform_video_link:1};
  m.record.mockImplementation(async event => { const events = m.events.get(event.userId) || []; events.push({ event_type: event.eventType, event_at: event.eventAt }); m.events.set(event.userId, events); });
  m.execute.mockImplementation(async (sql, args) => {
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('UNIX_TIMESTAMP() AS reserved_at'))return [[{reserved_at:Math.floor(Date.now()/1000)}]];
    if(sql.startsWith('SELECT * FROM supervision_sessions'))return [[session]];
    if(sql.startsWith('SELECT * FROM provider_schedule_events'))return [[m.team]];
    if(sql.startsWith('UPDATE')&&sql.includes('twilio_room_sid'))return [{affectedRows:1}];
    if(sql.includes('FROM provider_schedule_event_attendees WHERE'))return [[{allowed:1}]];
    if (sql.includes('FROM users u JOIN agencies')) return [[{ 1: 1 }]];
    if (sql.includes('INSERT INTO supervision_session_video_admissions')) { m.admissions.add(Number(args[1])); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM supervision_session_video_admissions')) return [m.admissions.has(Number(args[1])) ? [{ 1: 1 }] : []];
    if (sql.includes('COUNT(')) return [[{ c: 0 }]];
    return [[]];
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });


it.each([[7,'supervisor'],[8,'supervisee']])('issues a fresh video token to the %s/%s with phone access off',async(userId,role)=>{
 const res=await invoke(getSupervisionVideoToken,request(userId));
 expect(res.status).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({sessionId:'fresh-shared-room',roomMode:'main'}));
 expect(m.token).toHaveBeenCalledWith(expect.objectContaining({metadata:expect.objectContaining({role})}));
 expect(m.create).toHaveBeenCalledOnce();expect(m.record).not.toHaveBeenCalled();expect(session.meeting_settings_json.dialIn).toBeUndefined();
});
it.each(['TEAM_MEETING','HUDDLE'])('issues a fresh %s browser token with phone access off',async kind=>{
 m.team.kind=kind;const req=request(7);req.params={eventId:'9'};
 const res=await invoke(getTeamMeetingVideoToken,req);
 expect(res.status).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({sessionId:'fresh-shared-room',roomMode:'main'}));
 expect(m.create).toHaveBeenCalledOnce();expect(m.team.meeting_settings_json.dialIn).toBeUndefined();
});
it('admits an invited team participant into a fresh room when phone access is off',async()=>{
 const req=request(8);req.params={eventId:'9'};const res=await invoke(getTeamMeetingAdmissionStatus,req);
 expect(res.status).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({sessionId:'fresh-shared-room',admitted:true}));
 expect(m.create).toHaveBeenCalledOnce();
});
