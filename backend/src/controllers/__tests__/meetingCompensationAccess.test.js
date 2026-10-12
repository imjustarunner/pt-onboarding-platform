import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), event: vi.fn(), member: vi.fn(), attendance: vi.fn(), summary: vi.fn(), save: vi.fn(), claim: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { findById: m.event } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: async () => [{ id: 2 }] } }));
vi.mock('../../models/PayrollTimeClaim.model.js', () => ({ default: { findById: m.claim } }));
vi.mock('../../services/meetingJoinPolicy.service.js', () => ({ hasActiveMeetingMembership: m.member, canJoinTeamMeeting: vi.fn(), roomUnavailable: vi.fn() }));
vi.mock('../../services/meetingAttendanceSegments.service.js', () => ({ isAttendanceTrackingEnabledForEvent: () => true, rebuildAttendanceRollupsFromSegments: vi.fn(), listAttendanceSummary: m.attendance }));
vi.mock('../../services/meetingClaimRate.service.js', () => ({ canManageMeetingCompensation: user => ['admin', 'super_admin', 'superadmin'].includes(user?.role), meetingClaimCompensation: m.summary, saveMeetingClaimRate: m.save, meetingClaimHourlyRate: vi.fn(), getMeetingClaimRateOverride: async () => null, MEETING_RATE_TYPES: {} }));
vi.mock('../interviewHub.controller.js', () => ({ buildInterviewEndedGuestPayload: vi.fn() }));
import { getTeamMeetingTimeClaims, patchTeamMeetingClaimRate } from '../teamMeetings.controller.js';
import { getTimeClaimMeetingAttendance } from '../payroll.controller.js';
const event = { id: 339, agency_id: 2, provider_id: 501, kind: 'TEAM_MEETING', meeting_subtype: 'admin' };
const claim = { id: 611, agency_id: 2, user_id: 465, status: 'submitted', claim_type: 'meeting_training', payload: { source: 'meeting_compensation_auto', scheduleEventId: 339, totalMinutes: 30, serviceCode: 'MEETING' } };
const req = role => ({ params: { eventId: '339', claimId: '611', id: '611' }, user: { id: role === 'provider' ? 465 : 501, role }, body: { rateType: 'admin_time', reason: 'Agreed administrative duties' } });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks(); m.event.mockResolvedValue(event); m.member.mockResolvedValue(true); m.claim.mockResolvedValue(claim);
  m.attendance.mockResolvedValue({ participants: [{ userId: 465, name: 'Sample Attendee', role: 'provider', totalMinutes: 30 }, { userId: 501, name: 'Sample Host', isHost: true, totalMinutes: 30 }] });
  m.summary.mockResolvedValue({ hourlyRate: 25, estimatedAmount: 12.5 });
  m.execute.mockImplementation(async sql => sql.includes('FROM payroll_time_claims') ? [[{ ...claim, payload_json: claim.payload }]] : sql.includes('provider_schedule_event_attendees') || sql.includes('SELECT 1 FROM user_agencies') ? [[{ allowed: 1 }]] : sql.includes('SELECT id, organization_type') ? [[{ id: 2, organization_type: 'agency' }]] : sql.includes('FROM agency_meeting_attendance_rollups') ? [[{ user_id: 465, first_name: 'Sample', last_name: 'Attendee', provider_id: 501, event_timezone: 'America/Denver' }, { user_id: 501, first_name: 'Sample', last_name: 'Host', provider_id: 501 }]] : [[]]);
});
it.each(['admin', 'super_admin', 'superadmin'])('shows compensation to authorized %s', async role => {
  const res = response(), next = vi.fn(); await getTeamMeetingTimeClaims(req(role), res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canManageCompensation: true, rows: expect.arrayContaining([expect.objectContaining({ compensation: { hourlyRate: 25, estimatedAmount: 12.5 } })]) }));
});
it('returns only the employee’s own time claim and no compensation amounts for regular attendees', async () => {
  const res = response(), next = vi.fn(); await getTeamMeetingTimeClaims(req('provider'), res, next);
  expect(next).not.toHaveBeenCalled(); const result = res.json.mock.calls[0][0];
  expect(result.canManageCompensation).toBe(false); expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).not.toHaveProperty('compensation'); expect(result.rows[0]).not.toHaveProperty('appliedAmount'); expect(m.summary).not.toHaveBeenCalled();
});
it('blocks a cross-agency admin from reading or writing compensation', async () => {
  m.member.mockResolvedValue(false);
  for (const handler of [getTeamMeetingTimeClaims, patchTeamMeetingClaimRate]) { const res = response(); await handler(req('admin'), res, vi.fn()); expect(res.status).toHaveBeenCalledWith(403); }
  expect(m.save).not.toHaveBeenCalled(); expect(m.summary).not.toHaveBeenCalled();
});
it('does not allow non-admin payroll staff to change compensation', async () => {
  const res = response(); await patchTeamMeetingClaimRate(req('staff'), res, vi.fn()); expect(res.status).toHaveBeenCalledWith(403); expect(m.save).not.toHaveBeenCalled();
});
it('passes an authorized administrator’s change to the protected rate service', async () => {
  const res = response(), next = vi.fn(); await patchTeamMeetingClaimRate(req('admin'), res, next);
  expect(next).not.toHaveBeenCalled(); expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ actor: { id: 501, role: 'admin' }, event, claimId: 611, rateType: 'admin_time' }));
});
it('lets the claim owner see who attended without exposing emails or transcripts', async () => {
  const res = response(), next = vi.fn(); await getTimeClaimMeetingAttendance(req('provider'), res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ attendees: [{ userId: 465, name: 'Sample Attendee', isHost: false }, { userId: 501, name: 'Sample Host', isHost: true }] }));
});
it('blocks another employee from opening the claim attendance', async () => {
  const request = req('provider'); request.user.id = 999;
  const res = response(), next = vi.fn(); await getTimeClaimMeetingAttendance(request, res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(403);
  expect(m.execute.mock.calls.some(([sql]) => sql.includes('FROM agency_meeting_attendance_rollups'))).toBe(false);
});
