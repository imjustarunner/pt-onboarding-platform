import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
const m = vi.hoisted(() => ({ access: vi.fn(), room: vi.fn(), actor: vi.fn(), event: vi.fn(), interview: vi.fn(),
  list: vi.fn(), create: vi.fn(), user: vi.fn(), requireStaff: vi.fn() }));
vi.mock('../interviewApplicantAccess.service.js', () => ({ interviewApplicantAccess: m.access, requireApplicantInRoom: m.room }));
vi.mock('../hiringInterviewAccess.service.js', () => ({ requireHiringInterviewAccess: m.requireStaff }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.user } }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { findById: m.event } }));
vi.mock('../../models/HiringInterview.model.js', () => ({ default: { findByScheduleEventId: m.interview } }));
vi.mock('../../models/VideoMeetingActivity.model.js', () => ({ default: { list: m.list, create: m.create } }));
vi.mock('../../controllers/teamMeetings.controller.js', () => ({
  getTeamMeetingVideoToken: (req, res) => { m.actor(req.user); res.json({ token: 'video', sessionId: 'room', displayName: 'Jamie', roleLabel: 'Applicant', roomMode: 'lobby', hostJoinUrl: 'secret', meetingSettings: { private: true } }); },
  getTeamMeetingAdmissionStatus: (req, res) => { m.actor(req.user); res.json({ admitted: true, token: 'admitted-video', roomMode: 'main', goals: ['private'], agenda: ['private'], transcriptState: { private: true } }); },
  postTeamMeetingJoinPresence: (req, res) => { m.actor(req.user); res.json({ ok: true }); }
}));
import routes from '../../routes/interviewApplicant.routes.js';
import { getInterviewSharedChat, postInterviewSharedChat } from '../../controllers/interviewSharedChat.controller.js';
let server, base;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  // Even an upstream/stale staff identity must not change applicant authority.
  app.use((req, res, next) => { req.user = { id: 99, role: 'super_admin' }; next(); });
  app.use('/applicant/:eventId', routes);
  app.get('/staff/:eventId/chat', getInterviewSharedChat); app.post('/staff/:eventId/chat', postInterviewSharedChat);
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: { message: e.message } }));
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve,reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ event: { id: 7 }, interview: { candidate_user_id: 30 }, identity: 'guest-iv-applicant' });
  m.room.mockResolvedValue(); m.user.mockResolvedValue({ first_name: 'Jamie', last_name: 'Applicant' });
  m.event.mockResolvedValue({ id: 7, meeting_subtype: 'interview' }); m.interview.mockResolvedValue({ id: 9 });
  m.requireStaff.mockResolvedValue(); m.create.mockResolvedValue(42);
  m.list.mockResolvedValue([
    { id: 1, activityType: 'chat', payload: { text: 'Legacy private message' } },
    { id: 2, activityType: 'chat', payload: { audience: 'interview_shared', text: 'Welcome', authorName: 'Interviewer', roleLabel: 'Interviewer' } },
    { id: 3, activityType: 'question', payload: { audience: 'interview_shared', text: 'Internal evaluation' } }
  ]);
});
describe('HTTP applicant boundary and shared chat', () => {
  it.each([{}, { Cookie: 'authToken=stale-onboarding-cookie', Authorization: 'Bearer expired-staff-token' }])('issues applicant credentials independently of login headers', async headers => {
    const response = await fetch(`${base}/applicant/${'a'.repeat(32)}/video-token`, { headers });
    expect(response.status).toBe(200); expect(m.actor).toHaveBeenCalledWith(undefined);
    expect(await response.json()).toEqual({ token: 'video', sessionId: 'room', displayName: 'Jamie', roleLabel: 'Applicant', roomMode: 'lobby' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('removes staff waiting-room material from admission responses', async () => {
    const response = await fetch(`${base}/applicant/token/admission-status`);
    expect(await response.json()).toEqual({ admitted: true, token: 'admitted-video', roomMode: 'main' });
  });
  it('does not expose any staff workspace or management endpoint', async () => {
    for (const path of ['workspace', 'artifacts', 'attendance', 'complete', 'transcript-control']) {
      expect((await fetch(`${base}/applicant/token/${path}`)).status).toBe(404);
    }
  });
  it('only returns explicitly shared messages and no author account data', async () => {
    const response = await fetch(`${base}/applicant/token/chat`);
    expect(await response.json()).toEqual({ messages: [{ id: 2, text: 'Welcome', authorName: 'Interviewer', roleLabel: 'Interviewer' }] });
  });
  it('ignores forged identity, audience and private-chat payloads', async () => {
    const response = await fetch(`${base}/applicant/token/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', authorName: 'Host', userId: 99, audience: 'team_private', teamMessage: 'private' }) });
    expect(response.status).toBe(200);
    expect(m.create).toHaveBeenCalledWith({ eventId: 7, userId: null, participantIdentity: 'guest-iv-applicant', activityType: 'chat',
      payload: { audience: 'interview_shared', text: 'Hello', authorName: 'Jamie Applicant', roleLabel: 'Applicant' } });
  });
  it('denies chat before admission and after ending access without reading messages', async () => {
    m.room.mockRejectedValue(Object.assign(new Error('Wait for admission'), { status: 403 }));
    expect((await fetch(`${base}/applicant/token/chat`)).status).toBe(403); expect(m.list).not.toHaveBeenCalled();
    m.access.mockRejectedValue(Object.assign(new Error('Interview ended'), { status: 410 }));
    expect((await fetch(`${base}/applicant/token/video-token`)).status).toBe(410); expect(m.actor).not.toHaveBeenCalled();
  });
  it('checks interviewer authority before shared chat access too', async () => {
    m.requireStaff.mockRejectedValue(Object.assign(new Error('Access denied'), { status: 403 }));
    expect((await fetch(`${base}/staff/7/chat`)).status).toBe(403); expect(m.list).not.toHaveBeenCalled();
  });
});
