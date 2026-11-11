import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { assertEventAgencyScope, hasPersonDisplayName, listCompanyEventStaff, resolveCompanyEventAudienceUserIds, validateCompanyEventAudience } from '../companyEventAudience.service.js';
import { normalizeEventOperations } from '../../utils/companyEventOperations.js';
import { makeGoogleCalendarUrl, buildEventIcs, computeNextOccurrence } from '../companyEvents.service.js';

const staff = [
  { id: 7, first_name: 'Ana María', last_name: 'Del Río', role: 'provider', agency_id: 2, agency_name: 'Inner Strength' },
  { id: 7, first_name: 'Ana María', last_name: 'Del Río', role: 'provider', agency_id: 3, agency_name: 'Next Level Up' },
  { id: 8, first_name: 'Kai', last_name: 'Chen', role: 'staff', agency_id: 3, agency_name: 'Next Level Up' }
];
const dbFor = (rows = staff) => ({ execute: vi.fn(async sql => sql.includes('FROM users u') ? [rows] : [[]]) });

describe('company event audiences', () => {
  it('deduplicates people across invited agencies and provides identifying metadata', async () => {
    const db = dbFor(), result = await listCompanyEventStaff([2, 3], db);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 7, agencyId: 2, agencyIds: [2, 3], agencyNames: ['Inner Strength', 'Next Level Up'], firstName: 'Ana María' });
    const sql = db.execute.mock.calls[0][0];
    expect(sql).toContain('COALESCE(ua.is_active, 1) = 1');
    expect(sql).toContain('u.terminated_at IS NULL');
    expect(sql).toContain('COALESCE(u.is_archived, 0) = 0');
    expect(sql).toContain('COALESCE(u.is_demo, 0) = 0');
    expect(sql).toContain('PREHIRE_OPEN');
    expect(sql).not.toContain('u.*');
  });
  it('omits unmistakable prose while retaining international and multipart names', () => {
    expect(hasPersonDisplayName({ first_name: 'A calmer evening routine helped a little, but the big feelings are still there. Sleep has been off for a few weeks and mornings are harder.' })).toBe(false);
    expect(hasPersonDisplayName({ first_name: 'Ana María', last_name: 'de la Cruz Del Río' })).toBe(true);
    expect(hasPersonDisplayName({ first_name: '李', last_name: '小明' })).toBe(true);
  });
  it('denies cross agency invitations without event management access', async () => {
    const db = { execute: vi.fn(async () => [[{ id: 2, name: 'Inner Strength' }]]) };
    await expect(assertEventAgencyScope({ actor: { id: 7, role: 'admin' }, agencyId: 2, invitedAgencyIds: [3], db })).rejects.toMatchObject({ status: 403 });
    await expect(assertEventAgencyScope({ actor: { id: 7, role: 'provider' }, agencyId: 2, invitedAgencyIds: [3], db })).rejects.toMatchObject({ status: 403 });
    expect(await assertEventAgencyScope({ actor: { id: 7, role: 'admin' }, agencyId: 2, invitedAgencyIds: [2], db })).toEqual([2]);
  });
  it('resolves selected people and roles only within active invited staff', async () => {
    const db = dbFor(), event = { id: 12, agencyId: 2, invitedAgencyIds: [3] };
    expect(await resolveCompanyEventAudienceUserIds({ event, audience: { userIds: [99], groupIds: [], roleKeys: ['provider'] }, db })).toEqual([7]);
    expect(await resolveCompanyEventAudienceUserIds({ event, audience: { userIds: [], groupIds: [], roleKeys: [] }, db })).toEqual([7, 8]);
  });
  it('requires mandatory people to be included in the effective event audience', async () => {
    await expect(validateCompanyEventAudience({ event: { id: 12, agencyId: 2 }, audience: { userIds: [7] }, mandatoryUserIds: [8], db: dbFor() })).rejects.toThrow('Mandatory attendees');
    expect(normalizeEventOperations({}).mandatoryUserIds).toEqual([]);
  });
  it('rejects invalid announcement windows and duplicate identifiers', () => {
    expect(() => normalizeEventOperations({ dashboardAnnouncements: [{ id: 'one', content: 'Join us', scheduledAt: '2026-11-12T10:00:00Z', endsAt: '2026-11-12T09:00:00Z' }] })).toThrow('start and end');
    const item = { id: 'one', content: 'Join us', scheduledAt: '2026-11-12T10:00:00Z', endsAt: '2026-11-13T10:00:00Z' };
    expect(() => normalizeEventOperations({ dashboardAnnouncements: [item, item] })).toThrow('unique');
  });
  it('does not invent calendar dates for an event still being planned', () => {
    const event = { id: 12, title: 'Our second anniversary', startsAt: null, endsAt: null, dateToBeDecided: true };
    expect(makeGoogleCalendarUrl(event)).toBeNull();
    expect(buildEventIcs(event)).toBeNull();
    expect(computeNextOccurrence(event)).toBeNull();
  });
});
