import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
import { activeMeetingAgencyIds, hasActiveMeetingMembership, canJoinTeamMeeting, canJoinSupervision, roomUnavailable, requirePersonalSupervisionInvitation } from '../meetingJoinPolicy.service.js';
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

it('discovers only server-authorized active agencies within the candidate list',async()=>{
 m.execute.mockResolvedValue([[{id:2}]]);
 expect(await activeMeetingAgencyIds([2,'2',445,null,-1,'bad'],5)).toEqual([2]);
 const [sql,params]=m.execute.mock.calls[0];expect(params).toEqual([5,2,445]);
 expect(sql).toContain('org.is_active=1');expect(sql).toContain('ua.is_active=1');expect(sql).toContain('u.status');
 expect(sql).toContain("u.role IN ('super_admin','superadmin')");
});
it('does not query a tenant catalog without candidates or an authenticated user',async()=>{
 expect(await activeMeetingAgencyIds([],5)).toEqual([]);expect(await activeMeetingAgencyIds([2],0)).toEqual([]);expect(m.execute).not.toHaveBeenCalled();
});

describe('isolated QA supervision membership',()=>{
 const qa={agency_id:450,slug:'auricwell-qa-demo',agency_active:1,agency_archived:0,
  id:1438,email:'qa.provider.supervisor.auricwell@example.com',role:'provider',status:'ACTIVE_EMPLOYEE',is_demo:1,is_active:1,is_archived:0,
  feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders:[{id:1438,email:'qa.provider.supervisor.auricwell@example.com'}]}}};
 const membership=row=>m.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([row?[row]:[]]);
 it('admits the listed demo clinician with current membership and discovers only the QA agency',async()=>{
  membership(qa);expect(await hasActiveMeetingMembership(450,1438)).toBe(true);
  expect(m.execute.mock.calls[1][0]).toContain('ua.is_active=1');expect(m.execute.mock.calls[1][1]).toEqual([450,1438]);
  membership(qa);expect(await activeMeetingAgencyIds([2,450],1438)).toEqual([450]);
 });
 it.each([
  {agency_id:2},{slug:'itsco'},{feature_flags:{}},{agency_active:0},{agency_archived:1},
  {is_active:0},{is_archived:1},{is_demo:0},{status:'TERMINATED_PENDING'},
  {role:'support'},{role:'admin'},{id:9999},{email:'real@agency.example'}
 ])('denies changed scope or provider identity %j',async patch=>{
  membership({...qa,...patch});expect(await hasActiveMeetingMembership(450,1438)).toBe(false);
 });
 it('denies revoked membership and never considers the QA exception for another tenant',async()=>{
  membership(null);expect(await hasActiveMeetingMembership(450,1438)).toBe(false);
  m.execute.mockClear();expect(await hasActiveMeetingMembership(2,1438)).toBe(false);expect(m.execute).toHaveBeenCalledTimes(1);
 });
 it('still requires an invitation or ownership after QA membership is verified',async()=>{
  membership(qa);expect(await canJoinTeamMeeting({id:1,agency_id:450,provider_id:1439},1438)).toBe(false);
 });
});
