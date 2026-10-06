import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), session: vi.fn(), events: new Map(), admissions: new Set(), rollup: vi.fn(), record: vi.fn(), token: vi.fn(), append: vi.fn(), upsert: vi.fn(), end:vi.fn(), complete:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../utils/tenantMeetingUrl.js', () => ({ tenantMeetingBase: async () => 'https://tenant.example' }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: async () => [{ id: 2 }], findById: async id => ({ id, first_name: id === 7 ? 'Supervisor' : 'Rachel', last_name: 'Example' }) } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: {
  resolveByJoinRef: m.session, findById: m.session, classifyJoinTokenRole: () => null,
  findAttendeeBySessionUser: async (sid, uid) => ({ id: uid + 100 }),
  listAttendanceEventsForSessionUser: async ({ userId }) => m.events.get(userId) || [],
  recordAttendanceEvent: m.record, setAttendeeStatus: vi.fn(), upsertAttendanceRollup: m.rollup, setLiveEnded:m.end
} }));
vi.mock('../../models/SupervisionSessionArtifact.model.js', () => ({ default: { appendTranscriptChunk: m.append, upsertBySessionId: m.upsert, findBySessionId: async () => null } }));
vi.mock('../../services/video.service.js', () => ({ isVideoConfigured: () => true, resolveVideoProjectId: () => 'project', getVideoClientDiagnostics: () => ({}), createAccessTokenAsync: m.token, createOrGetRoomByUniqueName: async name => ({ sid: name }), completeRoom:m.complete }));
import { getSupervisionVideoToken, postSupervisionJoinPresence, saveClientTranscript, upsertSupervisionSessionArtifacts, endSupervisionLiveSession, finalizeSupervisionSession } from '../supervisionSessions.controller.js';
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
  m.append.mockResolvedValue({ transcriptText: 'saved' });
  m.record.mockImplementation(async event => { const events = m.events.get(event.userId) || []; events.push({ event_type: event.eventType, event_at: event.eventAt }); m.events.set(event.userId, events); });
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM users u JOIN agencies')) return [[{ 1: 1 }]];
    if (sql.includes('INSERT INTO supervision_session_video_admissions')) { m.admissions.add(Number(args[1])); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM supervision_session_video_admissions')) return [m.admissions.has(Number(args[1])) ? [{ 1: 1 }] : []];
    if (sql.includes('COUNT(')) return [[{ c: 0 }]];
    return [[]];
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('identified supervision room roles and attendance', () => {
  it.each([7,9])('leaving facilitator %s closes only their attendance and leaves the other facilitator connected',async userId=>{
    session.session_type='group';session.co_facilitator_user_id=9;
    await invoke(postSupervisionJoinPresence,request(userId,{action:'leave'}));
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({userId,eventType:'left'}));
    expect(m.record.mock.calls.every(([e])=>e.userId===userId)).toBe(true);
    expect(m.end).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();
    const remaining=userId===7?9:7;
    const res=await invoke(getSupervisionVideoToken,request(remaining));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({isSupervisor:true,roomMode:'main'}));
  });
  it('does not auto-finalize an overdue room while a cohost or participant remains',async()=>{
    session.session_type='group';session.end_at='2026-10-01 14:00:00';
    m.execute.mockResolvedValue([[{present:1}]]);
    expect(await finalizeSupervisionSession({sessionId:9,source:'auto_plus_15'})).toMatchObject({skipped:true,reason:'session_still_active'});
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('left_at IS NULL'),[9]);
    expect(m.record).not.toHaveBeenCalled();expect(m.rollup).not.toHaveBeenCalled();expect(m.end).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();
  });
  it('fails safely rather than closing a room if automatic cleanup cannot check presence',async()=>{
    m.execute.mockRejectedValue(new Error('database unavailable'));
    await expect(finalizeSupervisionSession({sessionId:9,source:'auto_plus_15'})).rejects.toThrow('database unavailable');
    expect(m.record).not.toHaveBeenCalled();expect(m.rollup).not.toHaveBeenCalled();expect(m.end).not.toHaveBeenCalled();
  });
  it.each([[7, 'supervisor'], [8, 'supervisee']])('joins user %s as %s and counts time once across heartbeats', async (userId, role) => {
    const res = await invoke(getSupervisionVideoToken, request(userId));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ identity: `user-${userId}`, isSupervisor: role === 'supervisor', roomMode: 'main' }));
    expect(m.token).toHaveBeenCalledWith(expect.objectContaining({ identity: `user-${userId}`, metadata: expect.objectContaining({ role }) }));
    expect(m.record).not.toHaveBeenCalled();
    await invoke(postSupervisionJoinPresence,request(userId,{action:'heartbeat',inMainRoom:true}));
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ userId, eventType: 'joined' }));
    vi.advanceTimersByTime(60000);
    await invoke(postSupervisionJoinPresence, request(userId, { action: 'heartbeat', identity: 'user-999' }));
    expect(m.record).toHaveBeenCalledTimes(1);
    expect(m.rollup).toHaveBeenLastCalledWith(expect.objectContaining({ userId, totalSeconds: 60 }));
    await invoke(postSupervisionJoinPresence, request(userId, { action: 'leave' }));
    expect(m.rollup).toHaveBeenLastCalledWith(expect.objectContaining({ userId, totalSeconds: 60, isFinalized: true }));
    expect(m.events.has(999)).toBe(false);
  });
  it('does not count lobby time or accept lobby speech; begins counting after admission', async () => {
    session.waiting_room_enabled = 1;
    const res = await invoke(getSupervisionVideoToken); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ roomMode: 'lobby' }));
    vi.advanceTimersByTime(60000); await invoke(postSupervisionJoinPresence); expect(m.record).not.toHaveBeenCalled();
    const denied = await invoke(saveClientTranscript, request(8, { transcript: 'Lobby speech' })); expect(denied.status).toHaveBeenCalledWith(410); expect(m.append).not.toHaveBeenCalled();
    m.admissions.add(8); await invoke(postSupervisionJoinPresence); vi.advanceTimersByTime(30000);
    await invoke(postSupervisionJoinPresence, request(8, { action: 'leave' }));
    expect(m.rollup).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 8, totalSeconds: 30 }));
  });
  it('does not count a token or a failed video connection as attendance',async()=>{await invoke(getSupervisionVideoToken,request(7));await invoke(postSupervisionJoinPresence,request(7,{action:'heartbeat',inMainRoom:false}));expect(m.record).not.toHaveBeenCalled();});
  it('keeps supervisor host access even when the waiting room is on', async () => {
    session.waiting_room_enabled = 1; const res = await invoke(getSupervisionVideoToken, request(7));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isSupervisor: true, roomMode: 'main' }));
  });
  it.each([7, 8])('rejects retired browser transcript upload for user %s', async userId => {
    const denied = await invoke(saveClientTranscript, request(userId, { transcript:'Unconsented words' }));
    expect(denied.status).toHaveBeenCalledWith(410); expect(m.append).not.toHaveBeenCalled();
  });
  it('does not allow a personal link to replace the transcript through the artifacts route', async () => {
    const res = await invoke(upsertSupervisionSessionArtifacts, request(8, { transcriptText: 'Replacement' }));
    expect(res.status).toHaveBeenCalledWith(403); expect(m.upsert).not.toHaveBeenCalled();
  });
  it('does not promote a supervisee into a host who can end the meeting', async () => {
    const res = await invoke(endSupervisionLiveSession); expect(res.status).toHaveBeenCalledWith(403);
  });
});
