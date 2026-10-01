import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
import { canJoinTeamMeeting, canJoinSupervision, roomUnavailable, requirePersonalSupervisionInvitation } from '../meetingJoinPolicy.service.js';
beforeEach(() => { vi.clearAllMocks(); m.execute.mockResolvedValue([[]]); });
describe('current meeting room access', () => {
  const event = { id: 1, agency_id: 2, provider_id: 3 };
  it('denies a stale owner or attendee when agency membership was revoked', async () => {
    expect(await canJoinTeamMeeting(event, 3)).toBe(false);
    expect(m.execute.mock.calls[0][0]).toContain('ua.is_active=1');
    expect(m.execute.mock.calls[0][0]).toContain('org.is_active=1');
  });
  it('allows an active owner and a currently invited participant', async () => {
    m.execute.mockResolvedValue([[{ allowed: 1 }]]);
    expect(await canJoinTeamMeeting(event, 3)).toBe(true);
    expect(await canJoinTeamMeeting(event, 4)).toBe(true);
  });
  it('does not grant room access merely because an account can manage schedules', async () => {
    m.execute.mockResolvedValueOnce([[{ active: 1 }]]).mockResolvedValueOnce([[]]);
    expect(await canJoinTeamMeeting(event, 8)).toBe(false);
  });
  it.each(['WITHDRAWN', 'REMOVED', 'DECLINED', 'CANCELLED'])('revokes %s supervision invitees even in an open group', async status => {
    m.execute.mockResolvedValueOnce([[{ active: 1 }]]).mockResolvedValueOnce([[{ status }]]);
    const open = vi.fn().mockResolvedValue(true);
    expect(await canJoinSupervision({ id: 1, agency_id: 2, supervisor_user_id: 3 }, 4, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
  it('preserves authorized open-enrollment supervision', async () => {
    m.execute.mockResolvedValueOnce([[{ active: 1 }]]);
    expect(await canJoinSupervision({ id: 1, agency_id: 2 }, 4, async () => true)).toBe(true);
  });
  it.each(['CANCELLED','COMPLETED','FINALIZED','RESCHEDULED'])('blocks new room credentials for %s meetings', status => {
    expect(roomUnavailable({ status }).status).toBe(410);
  });
  it('blocks ended and non-platform rooms but preserves legacy platform defaults', () => {
    expect(roomUnavailable({ meeting_completed_at: '2026-10-01' }).status).toBe(410);
    expect(roomUnavailable({ live_ended_at: '2026-10-01' }, 'supervision').status).toBe(410);
    expect(roomUnavailable({ platform_video_link: 0, google_meet_link: 'https://meet.google.com/example' }).status).toBe(400);
    expect(roomUnavailable({ modality: 'IN_PERSON' }, 'supervision').status).toBe(400);
    expect(roomUnavailable({ platform_video_link: null })).toBeNull();
  });
  it('retires anonymous supervision access with an explicit sign-in response', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    requirePersonalSupervisionInvitation({}, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requiresSignIn: true }));
  });
});
