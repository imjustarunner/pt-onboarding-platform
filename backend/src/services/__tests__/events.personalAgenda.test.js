import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
const m = vi.hoisted(() => ({ audience: vi.fn() }));
vi.mock('../companyEventAudience.service.js', () => ({ resolveCompanyEventAudienceUserIds: m.audience }));
import { acceptedCompanyEventCalendar, companyEventScheduleVisibility, isCompanyGathering, listCurrentCompanyGatherings, loadCompanyEventRsvpMap, normalizeCompanyEventRsvp } from '../companyEventPersonalAgenda.service.js';
import { googleEventBody, renderCalendar } from '../calendarPublicationPolicy.js';

const base = { agency_id: 2, event_type: 'company_event', organization_id: null, is_active: 1, title: 'Anniversary celebration',
  starts_at: '2030-02-01T18:00:00Z', ends_at: '2030-02-01T20:00:00Z', staff_link_token: 'a'.repeat(48), timezone: 'America/Denver',
  event_location_name: 'Private celebration venue', operations_json: { mandatoryUserIds: [7] } };
const rows = [
  { ...base, id: 1 }, { ...base, id: 2, agency_id: 3, operations_json: { invitedAgencyIds: [2] } },
  { ...base, id: 3 }, { ...base, id: 4 },
  { ...base, id: 5, starts_at: null, ends_at: null, operations_json: { dateToBeDecided: true } },
  { ...base, id: 6 }, { ...base, id: 7, event_type: 'program_event' }
];
function fixture() {
  const responses = ['yes','maybe','no',null,'yes','yes','yes'].map((response_key, index) => ({ company_event_id: index + 1, response_key }));
  return { execute: vi.fn(async sql => sql.startsWith('SELECT ce.* FROM company_events ce') ? [rows]
    : sql.startsWith('SELECT ce.id AS company_event_id') ? [responses]
      : sql.includes('FROM company_event_session_dates') ? [[]] : Promise.reject(new Error(`Unexpected query: ${sql}`))) };
}
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z')); m.audience.mockImplementation(async ({ event }) => Number(event.id) === 6 ? [] : [7]); });
afterEach(() => vi.useRealTimers());

describe('personal company event calendar projection', () => {
  it('preserves affiliated club calendars while allowing an employee book club to use company invitations', () => {
    expect(isCompanyGathering({ ...base, event_type: 'book_club', host_organization_type: 'affiliation' })).toBe(false);
    expect(isCompanyGathering({ ...base, event_type: 'book_club', host_organization_type: 'agency', host_club_kind: 'book_club' })).toBe(false);
    expect(isCompanyGathering({ ...base, event_type: 'book_club', host_organization_type: 'agency' })).toBe(true);
    expect(isCompanyGathering({ ...base, organization_id: 20 })).toBe(false);
  });
  it('projects only current Yes/Maybe invitees, including other invited agencies, without creating schedule or payroll records', async () => {
    const db = fixture(), args = { userId: 7, agencyId: 2, from: '2030-02-01', to: '2030-02-02', db };
    const events = await acceptedCompanyEventCalendar(args);
    expect(events.map(event => event.companyEventId)).toEqual([1, 2]);
    expect(events[0]).toMatchObject({ kind: 'COMPANY_EVENT_INVITATION', isInvitedCompanyEvent: true, myRsvp: 'yes', mandatory: true,
      startAt: base.starts_at.replace('Z','.000Z'), canEdit: false, canReschedule: false });
    expect(events[0].id).toBeLessThan(0); expect(events[0].staffPageUrl).toContain('/company-events/1/staff/');
    expect(events[1]).toMatchObject({ myRsvp: 'maybe', agencyId: 3, calendarStatus: 'tentative' });
    expect((await acceptedCompanyEventCalendar(args)).map(event => event.id)).toEqual(events.map(event => event.id));
    expect(db.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it('retains all ordinary company candidates independently of the legacy school-calendar limit', async () => {
    const db = { execute: vi.fn(async () => [Array.from({ length: 450 }, (_, index) => ({ ...base, id: index + 1 }))]) };
    expect(await listCurrentCompanyGatherings({ userId: 7, db })).toHaveLength(450);
    expect(db.execute.mock.calls[0][0]).not.toContain('LIMIT');
  });
  it('normalizes historical RSVP keys and prefers the newest invitation or in-app response', async () => {
    const db = { execute: vi.fn(async () => [[
      { company_event_id: 1, response_key: '1', response_label: 'Yes' },
      { company_event_id: 2, response_key: '2', response_label: 'No' },
      { company_event_id: 3, response_key: 'M' },
      { company_event_id: 4, response_key: 'no', received_at: '2030-01-03T00:00:00Z', invitation_response: 'yes', responded_at: '2030-01-02T00:00:00Z' },
      { company_event_id: 5, response_key: 'yes', received_at: '2030-01-02T00:00:00Z', invitation_response: 'no', responded_at: '2030-01-03T00:00:00Z' }
    ]]) };
    expect([...(await loadCompanyEventRsvpMap({ eventIds: [1,2,3,4,5], userId: 7, db })).values()]).toEqual(['yes','no','maybe','no','no']);
    expect(normalizeCompanyEventRsvp({ response_key: '1', response_label: 'Pizza' })).toBeNull();
  });
  it('does not expose event identity, RSVP, mandatory status or private links to a peer viewing the schedule', async () => {
    const [owner] = await acceptedCompanyEventCalendar({ userId: 7, agencyId: 2, from: '2030-02-01', to: '2030-02-02', db: fixture() });
    const peer = companyEventScheduleVisibility(owner, false);
    expect(peer).toMatchObject({ id: owner.id, title: 'Busy', isPrivate: true, canEdit: false });
    for (const field of ['companyEventId','isInvitedCompanyEvent','myRsvp','mandatory','canRsvp','staffPageUrl','scheduleSource','calendarStatus','agencyId']) expect(peer).not.toHaveProperty(field);
    expect(JSON.stringify(peer)).not.toContain(base.title); expect(JSON.stringify(peer)).not.toContain(base.staff_link_token);
    expect(companyEventScheduleVisibility(owner, true)).toBe(owner);
  });
  it('publishes Maybe as tentative and Yes as confirmed without inventing dates', () => {
    const event = { key: 'company-event:1:2030-02-01', title: base.title, start: base.starts_at, end: base.ends_at, calendarStatus: 'tentative' };
    expect(googleEventBody(event).status).toBe('tentative'); expect(renderCalendar('Work', [event])).toContain('STATUS:TENTATIVE');
    expect(googleEventBody({ ...event, calendarStatus: 'confirmed' }).status).toBe('confirmed');
  });
});
