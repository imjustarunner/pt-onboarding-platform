import { beforeEach, describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: { execute } }));
import { meetingEndPermission, assertMeetingEndAllowed, closeMeetingAsHost } from '../meetingEndPermission.service.js';
beforeEach(() => { execute.mockReset(); });
describe.each(['supervision', 'team-meeting'])('%s explicit host closure', type => {
  it('allows an assigned host even when other hosts remain connected', async () => {
    execute.mockResolvedValue([[{ id: 101 }]]);
    expect((await meetingEndPermission(type, 101, 7)).canEndForEveryone).toBe(true);
    const [sql, args] = execute.mock.calls[0];
    expect(args).toEqual([101, 7]);
    expect(sql).not.toContain('join_presence');
    expect(sql).toContain('ua.is_active=1');
    if (type === 'supervision') {
      expect(sql).toContain('u.id=e.supervisor_user_id');
      expect(sql).not.toContain('co_facilitator_user_id');
      expect(sql).not.toContain('presenters');
    } else {
      expect(sql).toContain('u.id=e.provider_id');
      expect(sql).toContain('pref.is_cohost=1');
      expect(sql).toContain('provider_schedule_event_attendees');
      expect(sql).not.toContain('created_by_user_id');
    }
  });
  it('denies an attendee or unassigned administrator before transcript finishing', async () => {
    execute.mockResolvedValue([[]]);
    expect((await meetingEndPermission(type, 101, 8)).canEndForEveryone).toBe(false);
    await expect(assertMeetingEndAllowed(type, 101, 8)).rejects.toMatchObject({ status: 403, code: 'MEETING_END_FORBIDDEN' });
  });
  it('rechecks the assigned host and active membership in the closure write', async () => {
    execute.mockResolvedValue([{ affectedRows: 1 }]);
    await closeMeetingAsHost(type, 101, 7);
    const [sql, args] = execute.mock.calls[0];
    expect(sql).toContain('AND EXISTS (SELECT 1 FROM users u');
    expect(sql).toContain('ua.is_active=1');
    expect(sql).not.toContain('join_presence');
    expect(args.slice(-2)).toEqual([101, 7]);
  });
  it('does not close from a stale button after permission changes or the meeting ends', async () => {
    execute.mockResolvedValue([{ affectedRows: 0 }]);
    await expect(closeMeetingAsHost(type, 101, 7)).rejects.toMatchObject({ status: 409, code: 'MEETING_END_UNAVAILABLE' });
  });
  it('fails closed on database errors', async () => {
    execute.mockRejectedValue(new Error('unavailable'));
    await expect(closeMeetingAsHost(type, 101, 7)).rejects.toThrow('unavailable');
  });
});
