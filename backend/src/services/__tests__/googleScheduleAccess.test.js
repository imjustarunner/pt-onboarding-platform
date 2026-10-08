import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ allowed: vi.fn(), client: vi.fn(), execute: vi.fn(), freebusy: vi.fn() }));
vi.mock('../scheduleCalendarPolicy.service.js', () => ({
  googleScheduleAllowedForEmail: m.allowed,
  GOOGLE_SCHEDULE_DISABLED: { ok: false, skipped: true, reason: 'non_sso_calendar_subscription', busy: [], events: [] }
}));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../googleWorkspaceAuth.service.js', () => ({ GOOGLE_WORKSPACE_SCOPES: [], parseGoogleWorkspaceServiceAccountFromEnv: vi.fn(), getWorkspaceClientsForEmployee: m.client, logGoogleUnauthorizedHint: vi.fn() }));
vi.mock('../googleMeetTranscript.service.js', () => ({ ensureMeetAutoTranscriptionEnabled: vi.fn() }));
import Google from '../googleCalendar.service.js';
beforeEach(() => {
  vi.clearAllMocks(); m.allowed.mockResolvedValue(false);
  m.client.mockResolvedValue({ calendar: { freebusy: { query: m.freebusy } } });
  m.freebusy.mockResolvedValue({ data: { calendars: { primary: { busy: [{ start: '2030-01-01T10:00Z', end: '2030-01-01T11:00Z' }] } } } });
});
describe('non-SSO schedule integrations', () => {
  const args = { subjectEmail: 'password@example.com', hostEmail: 'password@example.com', eventId: 'event', googleEventId: 'event', appendText: 'note', timeMin: '2030-01-01', timeMax: '2030-01-02' };
  it.each(['freeBusy', 'listEvents', 'getEvent', 'patchEvent', 'deleteEvent', 'patchEventDetails', 'patchEventTimes', 'createProviderScheduleEvent', 'appendToEventDescription', 'upsertProviderPrimaryCalendarEvent', 'cancelProviderPrimaryCalendarEvent', 'upsertSupervisionSession', 'createTimeClaimMeetEvent', 'cancelSupervisionSessionGoogleEvent'])('%s skips Google before creating credentials', async method => {
    const build = vi.spyOn(Google, 'buildCalendarClientForSubject');
    expect(await Google[method](args)).toMatchObject({ skipped: true, reason: 'non_sso_calendar_subscription' });
    expect(build).not.toHaveBeenCalled(); expect(m.client).not.toHaveBeenCalled();
  });
  it('still reads busy times for SSO users', async () => {
    m.allowed.mockResolvedValue(true); vi.spyOn(Google, 'isConfigured').mockReturnValue(true);
    expect(await Google.freeBusy(args)).toMatchObject({ ok: true, busy: [{ startAt: '2030-01-01T10:00Z', endAt: '2030-01-01T11:00Z' }] });
    expect(m.client).toHaveBeenCalledOnce();
  });
  it('skips existing office links without changing sync metadata', async () => {
    m.execute.mockResolvedValue([[{ id: 4, google_provider_event_id: 'old', google_provider_calendar_id: 'password@example.com' }]]);
    expect(await Google.cancelBookedOfficeEvent({ officeEventId: 4 })).toMatchObject({ skipped: true });
    expect(m.execute).toHaveBeenCalledOnce();
  });
});
