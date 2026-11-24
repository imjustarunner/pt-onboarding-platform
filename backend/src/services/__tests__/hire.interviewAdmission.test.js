import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), resolve: vi.fn(), interview: vi.fn(), access: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { resolveByJoinRef: m.resolve, classifyJoinTokenRole: () => 'participant' } }));
vi.mock('../../models/HiringInterview.model.js', () => ({ default: { findByScheduleEventId: m.interview } }));
vi.mock('../hiringInterviewAccess.service.js', () => ({ canAccessHiringInterview: m.access }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => null } }));
vi.mock('../meetingAttendanceSegments.service.js', async importOriginal => ({ ...await importOriginal(), pruneStaleJoinPresenceForEvent: vi.fn(), openAttendanceSegment: vi.fn(), rebuildAttendanceRollupsFromSegments: vi.fn() }));
vi.mock('../../controllers/interviewHub.controller.js', () => ({ buildInterviewEndedGuestPayload: async () => ({ headline: 'Thank you for meeting with us', contactEmail: 'po@tenant.org' }) }));
import { getTeamMeetingAdmissionStatus, getTeamMeetingLobbyParticipants, admitTeamMeetingParticipant } from '../../controllers/teamMeetings.controller.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.resolve.mockResolvedValue({ id: 7, meeting_subtype: 'interview', provider_id: 11, participant_join_token: 'opaque-token', waiting_room_enabled: 1 });
  m.interview.mockResolvedValue({ id: 9, agency_id: 4, candidate_user_id: 30, guest_access_ended_at: '2026-09-19 20:00:00' });
  m.access.mockImplementation(async actor => actor?.id === 11 || actor?.id === 22);
  m.execute.mockResolvedValue([[]]);
});

describe('interview admission without the scheduled host', () => {
  beforeEach(() => {
    m.interview.mockResolvedValue({ id: 9, agency_id: 4, candidate_user_id: 30, guest_access_ended_at: null });
  });
  it.each([11, 22])('lets authorized interviewer %s see the waiting candidate', async id => {
    m.execute.mockImplementation(async sql => [sql.includes('SELECT p.join_identity')
      ? [{ join_identity: 'guest-iv-candidate', display_name: 'Applicant', is_guest: 1 }] : []]);
    const res = response();
    await getTeamMeetingLobbyParticipants({ params: { eventId: 'opaque-token' }, user: { id } }, res, e => { throw e; });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ participants: [expect.objectContaining({ joinIdentity: 'guest-iv-candidate', isGuest: true })] }));
  });

  it.each(['guest-iv-candidate', '30'])('lets an additional interviewer admit candidate %s', async candidate => {
    const res = response();
    await admitTeamMeetingParticipant({ params: { eventId: 'opaque-token', userId: candidate }, user: { id: 22 } }, res, e => { throw e; });
    expect(res.status).not.toHaveBeenCalled();
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO provider_schedule_event_video_admissions'),
      [7, candidate === '30' ? 30 : null, candidate === '30' ? 'user-30' : candidate]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, meetingCommenced: true }));
  });

  it.each([undefined, 30, 90])('denies lobby access and admission to unauthorized account %s', async id => {
    const req = { params: { eventId: 'opaque-token', userId: 'guest-iv-candidate' }, user: id ? { id } : undefined };
    for (const action of [getTeamMeetingLobbyParticipants, admitTeamMeetingParticipant]) {
      const res = response();
      await action(req, res, e => { throw e; });
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(m.execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO provider_schedule_event_video_admissions'), expect.anything());
  });

  it('keeps ordinary meeting admission restricted to hosts and cohosts', async () => {
    m.resolve.mockResolvedValue({ id: 7, meeting_subtype: 'general', provider_id: 11 });
    const res = response();
    await admitTeamMeetingParticipant({ params: { eventId: '7', userId: '30' }, user: { id: 22 } }, res, e => { throw e; });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(m.access).not.toHaveBeenCalled();
  });
});
const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
describe('candidate-only closure survives a missed video signal', () => {
  it.each([undefined, { id: 30 }])('ends anonymous and signed-in candidate access on the next poll', async user => {
    const res = response();
    await getTeamMeetingAdmissionStatus({ params: { eventId: 'opaque-token' }, user }, res, e => { throw e; });
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ interviewGuestEnded: true, contactEmail: 'po@tenant.org' }));
  });
  it.each([11, 22])('keeps the host and additional assigned interviewer in the room', async id => {
    const res = response();
    await getTeamMeetingAdmissionStatus({ params: { eventId: 'opaque-token' }, user: { id } }, res, e => { throw e; });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ admitted: true, roomMode: 'main', meetingCompleted: false }));
  });
  it('does not treat an unrelated signed-in account as an interviewer', async () => {
    const res = response();
    await getTeamMeetingAdmissionStatus({ params: { eventId: 'opaque-token' }, user: { id: 90 } }, res, e => { throw e; });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
