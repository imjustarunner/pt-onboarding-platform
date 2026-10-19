import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), event: vi.fn(), member: vi.fn(), complete: vi.fn(), video: vi.fn(), cohost: false }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { findById: m.event } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: async () => [{ id: 2 }] } }));
vi.mock('../../services/meetingJoinPolicy.service.js', () => ({ hasActiveMeetingMembership: m.member, canJoinTeamMeeting: vi.fn(), roomUnavailable: vi.fn() }));
vi.mock('../../services/meetingAttendanceSegments.service.js', () => ({ isAttendanceTrackingEnabledForEvent: () => true, completeMeetingSession: m.complete }));
vi.mock('../../services/teamMeetingTranscriptSummary.service.js', () => ({ triggerTeamMeetingSummaryFromTranscript: async () => ({ ok: true }) }));
vi.mock('../../services/video.service.js', () => ({ isVideoConfigured: () => true, createOrGetRoomByUniqueName: vi.fn(), createAccessTokenAsync: vi.fn(), completeRoom: m.video, setHostOnlyRecordingRules: vi.fn(), setRecordAllRecordingRules: vi.fn(), resolveVideoProjectId: () => 'project', getVideoClientDiagnostics: vi.fn() }));
vi.mock('../interviewHub.controller.js', () => ({ buildInterviewEndedGuestPayload: vi.fn() }));
import { completeTeamMeetingSession } from '../teamMeetings.controller.js';
const event = { id: 101, agency_id: 2, provider_id: 7, created_by_user_id: 8, kind: 'TEAM_MEETING', twilio_room_sid: 'video' };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
async function invoke(id, role = 'provider') {
  const res = response(), next = vi.fn();
  await completeTeamMeetingSession({ params: { eventId: '101' }, user: { id, role } }, res, next);
  expect(next).not.toHaveBeenCalled(); return res;
}
beforeEach(() => {
  vi.clearAllMocks(); m.cohost = false; m.member.mockResolvedValue(true);
  m.complete.mockResolvedValue({ ok: true });
  m.execute.mockImplementation(async sql => [sql.includes('pref.is_cohost') || sql.includes('p.is_cohost') ? (m.cohost ? [{ allowed: 1 }] : []) : [{ allowed: 1 }]]);
});
describe.each(['general', 'training', 'leadership_circle'])('%s closing authority', subtype => {
  beforeEach(() => { m.event.mockResolvedValue({ ...event, meeting_subtype: subtype }); });
  it('does not let an unassigned admin or the scheduler end the room', async () => {
    const res = await invoke(8, 'admin');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(m.complete).not.toHaveBeenCalled(); expect(m.video).not.toHaveBeenCalled();
  });
  it.each([7, 9])('lets assigned host/cohost %s explicitly end for everyone', async userId => {
    m.cohost = userId === 9;
    await invoke(userId);
    expect(m.complete).toHaveBeenCalledWith({ eventId: 101, actorUserId: userId });
    expect(m.video).toHaveBeenCalledWith('video', expect.any(Object));
  });
  it('denies a former host whose agency membership has ended', async () => {
    m.member.mockResolvedValue(false); const res = await invoke(7);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(m.complete).not.toHaveBeenCalled();
  });
});
