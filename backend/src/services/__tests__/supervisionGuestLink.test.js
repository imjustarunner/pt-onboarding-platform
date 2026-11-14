import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ meeting: vi.fn(), host: vi.fn(), base: vi.fn() }));
vi.mock('../meetingCalendarGuest.service.js', () => ({ calendarMeeting: m.meeting, assertCalendarHost: m.host }));
vi.mock('../../utils/tenantMeetingUrl.js', () => ({ tenantMeetingBase: m.base }));
import { supervisionGuestLink } from '../supervisionGuestLink.service.js';
beforeEach(() => { vi.clearAllMocks(); m.meeting.mockResolvedValue({ id: 9, agency_id: 4, participant_join_token: 's'.repeat(32) }); m.host.mockResolvedValue(); m.base.mockResolvedValue('https://app.itsco.health'); });
it('gives the facilitator an explicit guest link without changing admission settings', async () => {
  expect(await supervisionGuestLink(9, 7)).toEqual({ joinUrl: `https://app.itsco.health/join/supervision/${'s'.repeat(32)}?guest=1` });
  expect(m.host).toHaveBeenCalledWith('supervision', expect.objectContaining({ id: 9 }), 7);
});
it('denies link creation to someone who is not a current facilitator', async () => {
  m.host.mockRejectedValue(Object.assign(new Error('Host access required.'), { status: 403 }));
  await expect(supervisionGuestLink(9, 12)).rejects.toMatchObject({ status: 403 });
  expect(m.base).not.toHaveBeenCalled();
});
