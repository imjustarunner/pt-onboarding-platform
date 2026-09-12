import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ conn: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn() }, event: vi.fn(), interview: vi.fn(), user: vi.fn(), calendar: vi.fn(), delivery: vi.fn(), access: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => m.conn } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.user } }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { findById: m.event } }));
vi.mock('../../models/HiringInterview.model.js', () => ({ default: { findById: m.interview } }));
vi.mock('../googleCalendar.service.js', () => ({ default: { patchEventDetails: m.calendar } }));
vi.mock('../hiringInterviewAccess.service.js', () => ({ canAccessHiringInterview: m.access }));
vi.mock('../hiringInterviewSchedule.service.js', () => ({ parseInterviewStart: (s, tz) => ({ startDate: new Date(tz === 'America/Denver' ? s + '-06:00' : s + 'Z') }) }));
vi.mock('../hiringInterviewDelivery.service.js', () => ({ interviewDate: s => new Date(String(s).replace(' ', 'T') + 'Z'), deliverExistingInterview: m.delivery }));
import { rescheduleHiringInterview } from '../hiringInterviewReschedule.service.js';
const interview = { id: 5, status: 'scheduled', agency_id: 4, candidate_user_id: 30, provider_schedule_event_id: 2, interviewer_user_ids_json: [11,22], calendar_sender_email: 'po@tenant.org', public_join_url: 'https://tenant.org/join/guest' };
beforeEach(() => { vi.clearAllMocks(); m.conn.execute.mockResolvedValue([{}]); m.event.mockResolvedValue({ id: 2, agency_id: 4, provider_id: 11, meeting_subtype: 'interview', start_at: '2026-10-01 19:00:00', end_at: '2026-10-01 20:00:00', google_event_id: 'calendar' }); m.interview.mockResolvedValue(interview); m.access.mockResolvedValue(true); m.user.mockImplementation(async id => ({ id, email: `${id}@tenant.org` })); m.calendar.mockResolvedValue({ ok: true }); m.delivery.mockResolvedValue({ sent: true }); });
describe('rescheduling an interview', () => {
  it('updates both records in UTC, preserves duration, replaces attendees, and updates the PO calendar', async () => {
    const result = await rescheduleHiringInterview(interview, { startsAt: '2026-10-02T13:00:00', timezone: 'America/Denver', interviewerUserIds: [33] });
    expect(m.conn.execute.mock.calls[0][1]).toEqual(['2026-10-02 19:00:00', '2026-10-02 20:00:00', 'America/Denver', 2]);
    expect(m.conn.execute.mock.calls.some(([sql]) => sql.includes('DELETE FROM provider_schedule_event_attendees'))).toBe(true);
    expect(m.calendar.mock.calls[0][0]).toMatchObject({ subjectEmail: 'po@tenant.org', startAt: '2026-10-02T19:00:00.000Z', endAt: '2026-10-02T20:00:00.000Z' });
    expect(m.calendar.mock.calls[0][0].description).not.toContain('host');
    expect(m.conn.commit).toHaveBeenCalledOnce(); expect(result.delivery.sent).toBe(true);
  });
  it('does not send legacy calendar updates from a personal mailbox', async () => { const result = await rescheduleHiringInterview({ ...interview, calendar_sender_email: null }, { startsAt: '2026-10-02T13:00:00', timezone: 'America/Denver' }); expect(m.calendar).not.toHaveBeenCalled(); expect(result.calendarWarning).toContain('staff mailbox'); expect(m.delivery).toHaveBeenCalledOnce(); });
  it('rolls back database failures and does not email a false update', async () => { m.conn.execute.mockRejectedValue(new Error('Database unavailable')); await expect(rescheduleHiringInterview(interview, { startsAt: '2026-10-02T13:00:00' })).rejects.toThrow('Database unavailable'); expect(m.conn.rollback).toHaveBeenCalledOnce(); expect(m.delivery).not.toHaveBeenCalled(); });
  it('rejects closed interviews and unavailable staff before mutations', async () => { await expect(rescheduleHiringInterview({ ...interview, guest_access_ended_at: 'ended' }, {})).rejects.toMatchObject({ status: 409 }); m.access.mockResolvedValue(false); await expect(rescheduleHiringInterview(interview, { startsAt: '2026-10-02T13:00:00' })).rejects.toMatchObject({ status: 400 }); expect(m.conn.beginTransaction).not.toHaveBeenCalled(); });
});
