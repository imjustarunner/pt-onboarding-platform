import { beforeEach, describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: { execute } }));
import { meetingEndPermission, assertMeetingEndAllowed, closeMeetingAsHost } from '../meetingEndPermission.service.js';
beforeEach(() => { execute.mockReset(); execute.mockResolvedValueOnce([[]]); });
describe.each(['supervision', 'team-meeting'])('%s explicit host closure', type => {
  it('allows an assigned host even when other hosts remain connected', async () => {
    execute.mockResolvedValue([[{ id: 101 }]]);
    expect((await meetingEndPermission(type, 101, 7)).canEndForEveryone).toBe(true);
    const [sql, args] = execute.mock.calls[1];
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
    const [sql, args] = execute.mock.calls[1];
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
it('permits only the verified QA roster snapshot and binds its current flags into the closing write',async()=>{
  execute.mockReset();
  const flags={qaSandbox:{syntheticOnly:true,exchangeProviders:[{id:1438,email:'qa.provider.supervisor@example.com'}]}};
  const actor={agency_id:450,slug:'auricwell-qa-demo',feature_flags:flags,id:1438,email:'qa.provider.supervisor@example.com',role:'provider',status:'ACTIVE_EMPLOYEE',is_demo:1};
  execute.mockResolvedValueOnce([[actor]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValue([[]]);
  await closeMeetingAsHost('supervision',1344,1438);
  const [sql,args]=execute.mock.calls[1];
  expect(sql).toContain("u.status='ACTIVE_EMPLOYEE'");expect(sql).toContain('CAST(? AS JSON)');
  expect(args.slice(-4)).toEqual(['auricwell-qa-demo',JSON.stringify(flags),actor.email,'provider']);
});
it.each([{syntheticOnly:'true'},{syntheticOnly:true,exchangeProviders:[]},{syntheticOnly:true,exchangeProviders:[{id:1439,email:'qa.provider.other@example.com'}]}])('does not grant End from an invalid or unrelated QA roster %j',async sandbox=>{
  execute.mockReset();execute.mockResolvedValueOnce([[{agency_id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:sandbox},id:1438,email:'qa.provider.supervisor@example.com',role:'provider',is_demo:1}]]).mockResolvedValueOnce([[]]);
  expect((await meetingEndPermission('supervision',1344,1438)).canEndForEveryone).toBe(false);
  expect(execute.mock.calls[1][0]).not.toContain('CAST(? AS JSON)');
});
