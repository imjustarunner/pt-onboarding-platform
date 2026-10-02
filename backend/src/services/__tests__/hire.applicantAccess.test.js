import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), resolve: vi.fn(), interview: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { resolveByJoinRef: m.resolve,
  classifyJoinTokenRole: (row, ref) => row.host_join_token === ref ? 'host' : [row.join_token, row.participant_join_token].includes(ref) ? 'participant' : 'legacy' } }));
vi.mock('../../models/HiringInterview.model.js', () => ({ default: { findByScheduleEventId: m.interview } }));
import { interviewApplicantAccess, requireApplicantInRoom } from '../interviewApplicantAccess.service.js';
const token = 'a'.repeat(32);
let event, interview;
beforeEach(() => {
  vi.clearAllMocks();
  event = { id: 7, agency_id: 4, kind: 'TEAM_MEETING', meeting_subtype: 'interview', participant_join_token: token,
    host_join_token: 'h'.repeat(32), status: 'ACTIVE', platform_video_link: 1, waiting_room_enabled: 1 };
  interview = { id: 9, agency_id: 4, candidate_user_id: 30, status: 'scheduled' };
  m.resolve.mockImplementation(async () => event); m.interview.mockImplementation(async () => interview);
  m.execute.mockResolvedValue([[{ id: 4 }]]);
});
describe('applicant-only invitation authority', () => {
  it('binds a personal invitation to the applicant without staff activation or tenant membership', async () => {
    const access = await interviewApplicantAccess(token);
    expect(access.interview.candidate_user_id).toBe(30); expect(access.identity).toMatch(/^guest-iv-/);
    expect(m.execute.mock.calls.every(([sql]) => !sql.includes('users'))).toBe(true);
  });
  it.each(['7', 'c-calendar-link', 'h'.repeat(32), 'x'.repeat(32)])('rejects numeric, calendar, host and other tokens: %s', async ref => {
    await expect(interviewApplicantAccess(ref)).rejects.toMatchObject({ status: 404 });
  });
  it('rejects a token after rotation', async () => {
    await interviewApplicantAccess(token); event.participant_join_token = 'b'.repeat(32);
    await expect(interviewApplicantAccess(token)).rejects.toMatchObject({ status: 404 });
  });
  it.each(['general', 'evaluation'])('cannot grant applicant entry to a %s meeting', async type => {
    event.meeting_subtype = type; await expect(interviewApplicantAccess(token)).rejects.toMatchObject({ status: 404 });
  });
  it.each(['completed', 'cancelled'])('revokes %s interviews', async status => {
    interview.status = status; await expect(interviewApplicantAccess(token)).rejects.toMatchObject({ status: 410 });
  });
  it('revokes candidate access when interviewers continue privately', async () => {
    interview.guest_access_ended_at = new Date(); await expect(interviewApplicantAccess(token)).rejects.toMatchObject({ status: 410 });
  });
  it('rejects cancelled meetings, orphan interviews and inactive tenants', async () => {
    event.status = 'CANCELLED'; await expect(interviewApplicantAccess(token)).rejects.toMatchObject({ status: 410 });
    event.status = 'ACTIVE'; interview = null; await expect(interviewApplicantAccess(token)).rejects.toMatchObject({ status: 404 });
    interview = { agency_id: 4, candidate_user_id: 30 }; m.execute.mockResolvedValue([[]]);
    await expect(interviewApplicantAccess(token)).rejects.toMatchObject({ status: 404 });
  });
  it('does not let someone in the lobby or who left read or write shared chat', async () => {
    const access = await interviewApplicantAccess(token); m.execute.mockResolvedValue([[]]);
    await expect(requireApplicantInRoom(access)).rejects.toMatchObject({ status: 403 });
    const [sql, params] = m.execute.mock.calls.at(-1);
    expect(sql).toContain('p.left_at IS NULL'); expect(sql).toContain('video_admissions');
    expect(params).toEqual([7, access.identity, 1]);
  });
  it.each([undefined,null,1,'1'])('keeps default waiting rooms gated for %s',async flag=>{
    event.waiting_room_enabled=flag;const access=await interviewApplicantAccess(token);await requireApplicantInRoom(access);
    expect(m.execute.mock.calls.at(-1)[1][2]).toBe(1);
  });
});
