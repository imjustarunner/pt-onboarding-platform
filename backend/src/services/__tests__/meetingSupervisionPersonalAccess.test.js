import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
const m = vi.hoisted(() => ({ execute: vi.fn(), events: vi.fn(), canJoin: vi.fn(), authenticate: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../config/config.js', () => ({ default: { jwt: { secret: 'test-only-app-secret' } } }));
vi.mock('../meetingInvitations.service.js', () => ({ invitationEvents: m.events }));
vi.mock('../meetingJoinPolicy.service.js', async original => ({ ...await original(), canJoinSupervision: m.canJoin }));
vi.mock('../../utils/tenantMeetingUrl.js', () => ({ tenantMeetingBase: async () => 'https://tenant.example' }));
vi.mock('../../middleware/auth.middleware.js', () => ({ authenticate: m.authenticate }));
import { resolveSupervisionInvitationAccess, validateSupervisionAccess, supervisionSessionRequest } from '../supervisionInvitationAccess.service.js';
import { authenticateSupervisionSession, authenticateSupervisionAgenda } from '../../middleware/supervisionInvitationAccess.middleware.js';

const personalToken = 'a'.repeat(32);
let invitation, session;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T15:00:00Z'));
  invitation = { id: 3, user_id: 8, agency_id: 2, provider_id: 7, event_id: 9, meeting_type: 'supervision', join_token: personalToken };
  session = { id: 9, agency_id: 2, supervisor_user_id: 7, supervisee_user_id: 8, status: 'SCHEDULED', start_at: '2026-10-01 15:00:00', end_at: '2026-10-01 16:00:00', modality: 'VIRTUAL' };
  m.events.mockImplementation(async () => [session]); m.canJoin.mockResolvedValue(true);
  m.execute.mockImplementation(async sql => {
    if (sql.includes('meeting_email_invitations')) return [[invitation]];
    if (sql.includes('SELECT s.*')) return [[session]];
    if (sql.includes('SELECT id,first_name')) return [[{ id: invitation.user_id, first_name: 'Rachel', last_name: 'Example' }]];
    if (sql.includes('meeting_agendas')) return [[{ meeting_type: 'supervision_session', meeting_id: 9 }]];
    if (sql.includes('supervision_presentation_slides')) return [[{ session_id: 9 }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
});
afterEach(() => { vi.useRealTimers(); });
const grant = async () => (await resolveSupervisionInvitationAccess(personalToken)).supervisionAccess.token;
const response = () => ({ set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() });

describe('personal supervision invitation without app sign-in', () => {
  it.each([7, 8])('resolves invitee %s as an identified user without an app login', async userId => {
    invitation.user_id = userId;
    const result = await resolveSupervisionInvitationAccess(personalToken);
    expect(result.joinUrl).toBe('https://tenant.example/join/supervision/9');
    const access = await validateSupervisionAccess(result.supervisionAccess.token, { sessionId: 9, action: 'video-token' });
    expect(access.user.id).toBe(userId); expect(access.user.role).toBe('provider');
    expect(m.canJoin).toHaveBeenCalledWith(session, userId);
    expect(() => jwt.verify(result.supervisionAccess.token, 'test-only-app-secret')).toThrow();
  });
  it('does not exchange a team meeting link for anonymous access', async () => {
    invitation.meeting_type = 'team_meeting'; expect(await resolveSupervisionInvitationAccess(personalToken)).toBeNull();
  });
  it('allows rejoining an active session after its scheduled end', async () => {
    session.end_at = '2026-10-01 14:59:00'; session.has_live_presence = 1;
    expect((await resolveSupervisionInvitationAccess(personalToken)).supervisionAccess.sessionId).toBe(9);
  });
  it('does not issue credentials for an ended or uninvited session', async () => {
    session.live_ended_at = '2026-10-01 14:59:00';
    await expect(grant()).rejects.toMatchObject({ status: 410 });
    session.live_ended_at = null; m.canJoin.mockResolvedValue(false);
    await expect(grant()).rejects.toMatchObject({ status: 410 });
  });
  it('returns in-person details without a video credential', async () => {
    session.modality = 'IN_PERSON'; expect(await resolveSupervisionInvitationAccess(personalToken)).toMatchObject({ joinUrl: null });
    expect((await resolveSupervisionInvitationAccess(personalToken)).supervisionAccess).toBeUndefined();
  });
  it('rejects another room, app-wide routes and forged app JWTs', async () => {
    const token = await grant();
    await expect(validateSupervisionAccess(token, { sessionId: 10, action: 'video-token' })).rejects.toMatchObject({ status: 403 });
    await expect(validateSupervisionAccess(token, null)).rejects.toMatchObject({ status: 403 });
    await expect(validateSupervisionAccess(jwt.sign({ sessionId: 9 }, 'test-only-app-secret'), { sessionId: 9 })).rejects.toMatchObject({ status: 401 });
  });
  it.each(['membership', 'rotated-link', 'cancelled', 'wrong-agency', 'missing-session'])('rechecks %s on every request', async change => {
    const token = await grant();
    if (change === 'membership') m.canJoin.mockResolvedValue(false);
    if (change === 'rotated-link') invitation.join_token = 'b'.repeat(32);
    if (change === 'cancelled') session.status = 'CANCELLED';
    if (change === 'wrong-agency') session.agency_id = 99;
    if (change === 'missing-session') session = null;
    await expect(validateSupervisionAccess(token, { sessionId: 9, action: 'video-token' })).rejects.toMatchObject({ status: 410 });
  });
  it('expires the session grant', async () => {
    const token = await grant(); vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
    await expect(validateSupervisionAccess(token, { sessionId: 9, action: 'video-token' })).rejects.toMatchObject({ status: 401 });
  });
  it('permits only attendance leave briefly after the host ends', async () => {
    const token = await grant(); session.live_ended_at = '2026-10-01 14:59:00';
    await expect(validateSupervisionAccess(token, { sessionId: 9, action: 'client-transcript' }, { final: true })).rejects.toMatchObject({ status: 410 });
    await expect(validateSupervisionAccess(token, { sessionId: 9, action: 'join-presence' }, { action: 'leave' })).resolves.toMatchObject({ sessionId: 9 });
    await expect(validateSupervisionAccess(token, { sessionId: 9, action: 'video-token' })).rejects.toMatchObject({ status: 410 });
    vi.advanceTimersByTime(5 * 60 * 1000);
    await expect(validateSupervisionAccess(token, { sessionId: 9, action: 'client-transcript' }, { final: true })).rejects.toMatchObject({ status: 410 });
  });
  it.each(['/sessions', '/sessions/9/finalize', '/sessions/9/meeting-lifecycle', '/sessions/9/cancel', '/supervisee/8/hours-summary'])('does not permit personal access to %s', path => {
    expect(supervisionSessionRequest('POST', path)).toBeNull();
  });
  it('uses the link recipient even when another account is signed in', async () => {
    const token = await grant(), res = response(), next = vi.fn();
    const req = { get: () => token, method: 'GET', path: '/sessions/9/video-token', user: { id: 999, role: 'admin' } };
    await authenticateSupervisionSession(req, res, next);
    expect(next).toHaveBeenCalledWith(); expect(req.user.id).toBe(8); expect(req.user.role).toBe('provider'); expect(m.authenticate).not.toHaveBeenCalled();
  });
  it('retains normal authentication for requests without a personal grant', async () => {
    const req = { get: () => null }, res = response(), next = vi.fn();
    await authenticateSupervisionSession(req, res, next); expect(m.authenticate).toHaveBeenCalledWith(req, res, next);
  });
  it.each([['PATCH', '/presentation-slides/23', authenticateSupervisionSession], ['PATCH', '/12/items/23', authenticateSupervisionAgenda]])('checks the actual parent session of %s %s', async (method, path, middleware) => {
    const token = await grant(), res = response(), next = vi.fn();
    await middleware({ get: () => token, method, path }, res, next); expect(next).toHaveBeenCalledWith();
    m.execute.mockImplementation(async () => [[{ session_id: 99, meeting_type: 'supervision_session', meeting_id: 99 }]]);
    await middleware({ get: () => token, method, path }, res, next); expect(res.status).toHaveBeenCalledWith(403);
  });
});
