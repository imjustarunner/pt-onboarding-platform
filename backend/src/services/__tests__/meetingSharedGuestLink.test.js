import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), resolve: vi.fn(), host: vi.fn(), calendar: vi.fn(), invited: vi.fn(), member: vi.fn(), roster: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { resolveByJoinRef: m.resolve } }));
vi.mock('../meetingCalendarGuest.service.js', () => ({ assertCalendarHost: m.host, calendarMeeting: m.calendar }));
vi.mock('../meetingJoinPolicy.service.js', async importOriginal => ({ ...await importOriginal(), canJoinTeamMeeting: m.invited, hasActiveMeetingMembership: m.member }));
vi.mock('../scheduledTraining.service.js', () => ({ activeTrainingStaff: m.roster }));
vi.mock('../../utils/tenantMeetingUrl.js', () => ({ tenantMeetingBase: async () => 'https://tenant.example' }));
import { shareTeamMeetingGuestLink, teamMeetingGuestLinkStatus, enterSharedTeamMeetingLink } from '../teamMeetingGuestLink.service.js';
const event = { id: 9, kind: 'TEAM_MEETING', agency_id: 2, provider_id: 7, waiting_room_enabled: 1, participant_join_token: 'p'.repeat(32), host_join_token: 'h'.repeat(32) };
beforeEach(() => { vi.clearAllMocks(); m.resolve.mockResolvedValue({ ...event }); m.calendar.mockResolvedValue({ ...event, guest_link_shared_at: new Date() }); m.invited.mockResolvedValue(false); m.member.mockResolvedValue(true); m.roster.mockResolvedValue([{id:8}]); m.host.mockResolvedValue(); m.execute.mockResolvedValue([{ affectedRows: 1 }]); });
it('shares an opaque guest URL without changing waiting-room admission or exposing a personal identity', async () => {
  const result = await shareTeamMeetingGuestLink('9', 7);
  expect(result).toEqual({ joinUrl: `https://tenant.example/join/team-meeting/${event.participant_join_token}`, guestLinkEnabled: true, waitingRoomEnabled: true, roomOpen: false });
  expect(m.host).toHaveBeenCalledWith('team-meeting', event, 7);
  expect(m.execute).toHaveBeenCalledTimes(1);
  expect(m.execute.mock.calls[0][0]).not.toMatch(/waiting_room_enabled|attendees|admissions|attendance/);
});
it('requires host authority before generating a shared link', async () => {
  m.host.mockRejectedValue(Object.assign(new Error('Host access required'), { status: 403 }));
  await expect(shareTeamMeetingGuestLink('9', 8)).rejects.toMatchObject({ status: 403 });
  expect(m.execute).not.toHaveBeenCalled();
});
it.each([{ meeting_subtype: 'interview' }, { meeting_completed_at: new Date() }, { status: 'CANCELLED' }])('does not share applicant or closed meeting links: %j', async change => {
  m.resolve.mockResolvedValue({ ...event, ...change });
  await expect(shareTeamMeetingGuestLink('9', 7)).rejects.toHaveProperty('status');
  expect(m.execute).not.toHaveBeenCalled();
});
it('only describes the room as open when the waiting room has been disabled', () => {
  expect(teamMeetingGuestLinkStatus({ ...event, guest_link_shared_at: new Date() })).toMatchObject({ roomOpen: false });
  expect(teamMeetingGuestLinkStatus({ ...event, waiting_room_enabled: 0 })).toEqual({ guestLinkEnabled: false, waitingRoomEnabled: false, roomOpen: true });
});
it('identifies an active member joining with the shared link without bypassing admission or granting host rights', async () => {
  await expect(enterSharedTeamMeetingLink(event.participant_join_token, {id:8,role:'provider'})).resolves.toEqual({ identified: true });
  expect(m.calendar).toHaveBeenCalledWith('team-meeting', event.participant_join_token);
  expect(m.execute).toHaveBeenCalledExactlyOnceWith('INSERT IGNORE INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)', [9, 8]);
});
it('preserves an invited member without rewriting their preferences', async () => {
  m.invited.mockResolvedValue(true); await expect(enterSharedTeamMeetingLink(event.participant_join_token, {id:8,role:'provider'})).resolves.toEqual({ identified: true }); expect(m.execute).not.toHaveBeenCalled();
});
it.each(['cross-agency', 'inactive'])('keeps %s accounts untracked rather than granting meeting attendance', async () => {
  m.member.mockResolvedValue(false); await expect(enterSharedTeamMeetingLink(event.participant_join_token, {id:8,role:'provider'})).resolves.toMatchObject({ identified: false }); expect(m.execute).not.toHaveBeenCalled();
});
it.each([['9', 404], [event.host_join_token, 404], [event.participant_join_token, 410]])('does not enroll with an invalid or closed guest reference (%s / %s)', async (ref, status) => {
  m.calendar.mockRejectedValue(Object.assign(new Error('Meeting unavailable'), { status }));
  await expect(enterSharedTeamMeetingLink(ref, {id:8,role:'provider'})).rejects.toMatchObject({ status });
  expect(m.execute).not.toHaveBeenCalled();
});
it('does not self-enroll users through a URL the host has not enabled for sharing', async () => {
  m.calendar.mockResolvedValue(event); await expect(enterSharedTeamMeetingLink(event.participant_join_token, {id:8,role:'provider'})).resolves.toMatchObject({ identified: false }); expect(m.execute).not.toHaveBeenCalled();
});

it('does not enroll a non-staff account or bypass the active training roster', async () => {
  await expect(enterSharedTeamMeetingLink(event.participant_join_token, {id:8,role:'client'})).resolves.toMatchObject({identified:false});
  m.calendar.mockResolvedValue({...event,guest_link_shared_at:new Date(),meeting_subtype:'training'});m.roster.mockResolvedValue([]);
  await expect(enterSharedTeamMeetingLink(event.participant_join_token, {id:8,role:'provider'})).resolves.toMatchObject({identified:false});
  expect(m.execute).not.toHaveBeenCalled();
});
