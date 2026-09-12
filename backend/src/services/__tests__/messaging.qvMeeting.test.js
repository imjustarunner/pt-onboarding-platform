import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { findById: vi.fn(), findByJoinToken: vi.fn(), listForUserInWindow: vi.fn() } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => [{ id: 2 }]) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, slug: 'itsco' })) } }));
import Schedule from '../../models/ProviderScheduleEvent.model.js';
import { getQuickMeetingLink } from '../../controllers/quickViewMeeting.controller.js';
const req = { quickView: { userId: 5, agencyId: 2 }, params: { type: 'team-meeting', ref: '10' } };
const event = { id: 10, agency_id: 2, provider_id: 6, kind: 'TEAM_MEETING', platform_video_link: 1, start_at: '2026-09-11', end_at: '2026-09-12', host_join_token: 'host', participant_join_token: 'guest' };
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() });
beforeEach(() => { vi.clearAllMocks(); Schedule.findById.mockResolvedValue(event); Schedule.listForUserInWindow.mockResolvedValue([event]); });
it('resolves a participant’s invitation to the portal guest link', async () => {
  const res = response(); await getQuickMeetingLink(req, res, vi.fn());
  expect(res.json).toHaveBeenCalledWith({ joinUrl: 'https://app.itsco.health/join/team-meeting/guest' });
});
it('does not reveal a meeting token to an agency member who is not a participant', async () => {
  Schedule.listForUserInWindow.mockResolvedValue([]);
  const res = response(); await getQuickMeetingLink(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
});
it('does not reveal a meeting from another tenant', async () => {
  Schedule.findById.mockResolvedValue({ ...event, agency_id: 3 });
  const res = response(); await getQuickMeetingLink(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(404); expect(Schedule.listForUserInWindow).not.toHaveBeenCalled();
});
