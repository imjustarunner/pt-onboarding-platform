import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), resolve: vi.fn(), interview: vi.fn(), access: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { resolveByJoinRef: m.resolve, classifyJoinTokenRole: () => 'participant' } }));
vi.mock('../../models/HiringInterview.model.js', () => ({ default: { findByScheduleEventId: m.interview } }));
vi.mock('../hiringInterviewAccess.service.js', () => ({ canAccessHiringInterview: m.access }));
vi.mock('../../controllers/interviewHub.controller.js', () => ({ buildInterviewEndedGuestPayload: async () => ({ headline: 'Thank you for meeting with us', contactEmail: 'po@tenant.org' }) }));
import { getTeamMeetingAdmissionStatus } from '../../controllers/teamMeetings.controller.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.resolve.mockResolvedValue({ id: 7, meeting_subtype: 'interview', provider_id: 11, participant_join_token: 'opaque-token', waiting_room_enabled: 1 });
  m.interview.mockResolvedValue({ id: 9, agency_id: 4, candidate_user_id: 30, guest_access_ended_at: '2026-09-19 20:00:00' });
  m.access.mockImplementation(async actor => actor.id === 11 || actor.id === 22);
  m.execute.mockResolvedValue([[]]);
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
