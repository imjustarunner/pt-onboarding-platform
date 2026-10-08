import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), allowed: vi.fn(), events: vi.fn(), remove: vi.fn(), google: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => ({ execute: async () => [[{ acquired: 1 }]], release() {} }) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async id => ({ id }) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, slug: 'itsco', custom_domain: 'app.itsco.health' }) } }));
vi.mock('../scheduleCalendarPolicy.service.js', () => ({ usesGoogleSchedule: m.allowed }));
vi.mock('../familyAuth.service.js', () => ({ requireHousehold: vi.fn(), assertFamilyBenefit: vi.fn() }));
vi.mock('../calendarEvents.service.js', () => ({ workCalendarEvents: m.events, familyCalendarEvents: m.events }));
vi.mock('../googleWorkspaceAuth.service.js', () => ({ buildImpersonatedJwtClient: m.google }));
vi.mock('googleapis', () => ({ google: { calendar: () => ({ calendars: { delete: m.remove } }) } }));
import { publicationStatus, issueSubscription, revokeSubscription, subscriptionFeed, createGooglePublication, syncGooglePublication, addPublicationReader, syncDueCalendarPublications } from '../calendarPublication.service.js';
const session = { userId: 7, agencyId: 2 };
let publication;
beforeEach(() => {
  vi.clearAllMocks(); m.allowed.mockResolvedValue(false);
  publication = { id: 12, user_id: 7, agency_id: 2, household_id: null, calendar_kind: 'work', token_hash: null };
  m.events.mockResolvedValue([]);
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('JOIN user_agencies')) return [[{ id: 7 }]];
    if (sql.includes('SET token_hash=?')) { publication.token_hash = args[0]; return [{}]; }
    if (sql.includes('SET token_hash=NULL')) { publication.token_hash = null; return [{}]; }
    if (sql.includes('WHERE token_hash=?')) return [publication.token_hash === args[0] ? [publication] : []];
    if (sql.startsWith('SELECT * FROM calendar_publications')) return [[publication]];
    return [[]];
  });
});
describe('work calendar subscriptions for password accounts', () => {
  it('offers subscriptions without Google setup and reports the correct eligibility', async () => {
    expect(await publicationStatus(session)).toMatchObject({ googleEnabled: false, hasSubscription: false });
    const { url } = await issueSubscription(session);
    expect(url).toMatch(/^https:\/\/app.itsco.health\/api\/calendar-sharing\/feed\/[\w-]{43}\.ics$/);
    expect(m.google).not.toHaveBeenCalled();
  });
  it('keeps issued links live, replaces them, and revokes them without deleting app events', async () => {
    const token = url => url.split('/').pop().replace('.ics', '');
    const first = token((await issueSubscription(session)).url);
    expect(await subscriptionFeed(first)).toContain('BEGIN:VCALENDAR');
    const second = token((await issueSubscription(session)).url);
    await expect(subscriptionFeed(first)).rejects.toMatchObject({ status: 404 });
    expect(await subscriptionFeed(second)).toContain('BEGIN:VCALENDAR');
    await revokeSubscription(session);
    await expect(subscriptionFeed(second)).rejects.toMatchObject({ status: 404 });
    expect(m.execute.mock.calls.some(([sql]) => /DELETE FROM (provider_schedule_events|appointments|office_events)/.test(sql))).toBe(false);
  });
  it.each([createGooglePublication, syncGooglePublication, addPublicationReader])('rejects attempts to reconnect work Google sharing', async operation => {
    await expect(operation(session, null, 'personal@example.com')).rejects.toMatchObject({ status: 403 });
    expect(m.google).not.toHaveBeenCalled();
  });
  it('retires an existing managed Google mirror but preserves the private feed', async () => {
    publication.google_calendar_id = 'old-work-copy'; publication.google_subject = 'automation@example.com'; publication.token_hash = 'retained';
    await syncDueCalendarPublications();
    expect(m.remove).toHaveBeenCalledWith({ calendarId: 'old-work-copy' });
    expect(m.events).not.toHaveBeenCalled();
    expect(publication.token_hash).toBe('retained');
  });
});
