import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../googleMeetTranscript.service.js', () => ({ ensureMeetAutoTranscriptionEnabled: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: {
  findById: vi.fn(),
  findByEmail: vi.fn().mockResolvedValue({ id: 7, role: 'provider' }),
  getAgencies: vi.fn().mockResolvedValue([{ feature_flags: { googleSsoEnabled: true, googleSsoRequiredRoles: ['provider'] } }])
} }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({
  default: { listByGoogleEventIds: vi.fn().mockResolvedValue([]), updateForProvider: vi.fn() }
}));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: {} }));

import GoogleCalendarService from '../googleCalendar.service.js';
import ProviderScheduleEvent from '../../models/ProviderScheduleEvent.model.js';
import { reconcileGoogleLinkedSchedule } from '../googleScheduleInboundSync.service.js';
import { providerScheduleCalendarTiming } from '../../utils/providerScheduleCalendar.js';
import { clientScheduleInstantToUtcMysql } from '../../utils/zonedWallTime.util.js';
import { interviewCalendar } from '../../utils/interviewCalendar.js';
import { supervisionEmailBody } from '../../utils/supervisionEmailBody.js';
import { meetingReminderSchedule } from '../meetingReminderPolicy.js';

const patch = vi.fn();
const timeZone = 'America/Denver';
beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue({ data: { id: 'google-meeting' } });
  vi.spyOn(GoogleCalendarService, 'isConfigured').mockReturnValue(true);
  vi.spyOn(GoogleCalendarService, 'buildCalendarClientForSubject').mockReturnValue({ events: { patch } });
});

async function syncSavedEvent(event) {
  const result = await GoogleCalendarService.upsertProviderPrimaryCalendarEvent({
    subjectEmail: 'host@example.test',
    existingGoogleEventId: 'google-meeting',
    summary: 'Mentor meeting',
    sendUpdates: 'none',
    disableReminders: true,
    ...providerScheduleCalendarTiming(event)
  });
  expect(result.ok).toBe(true);
  return patch.mock.calls.at(-1)[0].requestBody;
}

describe('saved meeting times through Google sync and notifications', () => {
  it.each([
    ['10:30', '11:00', '10:30 AM MDT', '16:25'],
    ['11:15', '11:45', '11:15 AM MDT', '17:10']
  ])('keeps an October 9 %s Mountain mentorship meeting unchanged after an edit and calendar refresh', async (start, end, label, reminder) => {
    const event = {
      id: 1, provider_id: 7, kind: 'HUDDLE', all_day: 0,
      start_at: clientScheduleInstantToUtcMysql(`2026-10-09T${start}:00`, timeZone),
      end_at: clientScheduleInstantToUtcMysql(`2026-10-09T${end}:00`, timeZone),
      event_timezone: timeZone, reminder_minutes: 5
    };
    const timing = providerScheduleCalendarTiming(event);
    const google = await syncSavedEvent(event);
    expect(google.start).toEqual({ dateTime: `2026-10-09T${start}:00`, timeZone });
    expect(google.end).toEqual({ dateTime: `2026-10-09T${end}:00`, timeZone });

    const summary = { id: 1, providerId: 7, kind: 'HUDDLE', googleEventId: 'google-meeting', startAt: timing.startAt, endAt: timing.endAt };
    const refreshed = await reconcileGoogleLinkedSchedule({
      viewedProviderId: 7, viewedProviderEmail: 'host@example.test', scheduleEvents: [summary],
      googleEvents: [{ id: 'google-meeting', startAt: `${google.start.dateTime}-06:00`, endAt: `${google.end.dateTime}-06:00` }]
    });
    expect(refreshed.updatedCount).toBe(0);
    expect(refreshed.scheduleEvents[0]).toEqual(summary);
    expect(ProviderScheduleEvent.updateForProvider).not.toHaveBeenCalled();

    const calendar = interviewCalendar({ startsAt: event.start_at, endsAt: event.end_at, timezone: timeZone, title: 'Mentorship Meeting', publicJoinUrl: 'https://tenant.example/join/team-meeting/test' });
    const email = supervisionEmailBody({ session: event, recipientName: 'Host', hostNames: ['Host'], people: [], calendar, meetingTitle: 'Mentorship Meeting', hostLabel: 'Internship Mentor', kind: 'reminder', isHost: true });
    expect(email.html).toContain(label);
    expect(calendar.ics).toContain(`DTSTART:${timing.startAt.replace(/[-:]/g, '').replace('.000', '')}`);
    expect(meetingReminderSchedule(event)[0].at.toISOString()).toBe(`2026-10-09T${reminder}:00.000Z`);
  });

  it('preserves Date values returned by MySQL on metadata-only edits', async () => {
    const google = await syncSavedEvent({
      start_at: new Date('2026-10-09T17:15:00Z'), end_at: new Date('2026-10-09T17:45:00Z'), event_timezone: timeZone
    });
    expect(google.start.dateTime).toBe('2026-10-09T11:15:00');
    expect(google.end.dateTime).toBe('2026-10-09T11:45:00');
  });

  it('syncs each saved recurring occurrence on its own date across daylight saving time', async () => {
    for (const day of ['2026-10-30', '2026-11-06']) {
      const google = await syncSavedEvent({
        start_at: clientScheduleInstantToUtcMysql(`${day}T11:15:00`, timeZone),
        end_at: clientScheduleInstantToUtcMysql(`${day}T11:45:00`, timeZone), event_timezone: timeZone
      });
      expect(google.start.dateTime).toBe(`${day}T11:15:00`);
      expect(google.end.dateTime).toBe(`${day}T11:45:00`);
    }
  });

  it('uses the persisted event zone and preserves all-day exclusive dates', async () => {
    expect(providerScheduleCalendarTiming({ start_at: '2026-10-09 17:15:00', end_at: '2026-10-09 17:45:00', event_timezone: timeZone }, 'America/New_York').timeZone).toBe(timeZone);
    const google = await syncSavedEvent({ all_day: 1, start_date: new Date('2026-10-09T00:00:00Z'), end_date: '2026-10-10' });
    expect(google.start).toEqual({ date: '2026-10-09' });
    expect(google.end).toEqual({ date: '2026-10-10' });
  });
});
