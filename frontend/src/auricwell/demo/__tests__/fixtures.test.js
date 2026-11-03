import { describe, expect, it } from 'vitest';
import { actor, clients, demoResponse, practice, providers, staff } from '../fixtures.js';

const denverClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true
});
const denverDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit'
});
function localDay(instant) {
  const parts = Object.fromEntries(denverDay.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const compactWhitespace = value => value.replace(/\s+/gu, ' ').trim();

describe('demo scope and mutation boundary', () => {
  it.each(['post', 'put', 'patch', 'delete'])('rejects %s before any clinical, booking, billing or preference action', method => {
    for (const url of [
      '/clinical-notes/drafts', '/clinical-notes/generate', '/medical-billing/notes/990171/sign',
      '/medical-billing/notes/990181/cosign', '/appointments', '/appointments/990200/cancel',
      '/medical-billing/claimmd/claims/990141/submit', `/users/${actor.id}/preferences`
    ]) {
      expect(() => demoResponse(url, { method, data: { schedule_display_prefs: { hideWeekend: false } } }), url)
        .toThrow(/nothing was saved, signed, submitted or sent/i);
    }
  });

  it('rejects substituted clients, users, claims and practices with no unknown-route fallback', () => {
    for (const url of [
      '/clients/1', '/medical-billing/clients/1/chart', '/users/1/schedule-summary',
      '/medical-billing/claimmd/claims/1/draft'
    ]) expect(() => demoResponse(url), url).toThrow(/outside this fictional demo/i);
    for (const key of ['agencyId', 'agency_id', 'organizationId', 'organization_id']) {
      expect(() => demoResponse('/clients', { params: { [key]: 1 } }), key).toThrow(/outside this fictional demo/i);
    }
    expect(() => demoResponse('/unconfigured-demo-route')).toThrow(/not included in the fictional demo/i);
  });
});

describe('calendar fixture contract', () => {
  const seasons = [
    { label: 'winter', weekStart: '2026-11-02', emersonStart: '2026-11-02T17:00:00.000Z' },
    { label: 'summer', weekStart: '2026-07-06', emersonStart: '2026-07-06T16:00:00.000Z' }
  ];

  it.each(seasons)('preserves 10 AM Denver across $label daylight offsets instead of treating wall digits as UTC', ({ weekStart, emersonStart }) => {
    const summary = demoResponse(`/users/${actor.id}/schedule-summary`, { params: { weekStart } });
    const emerson = summary.scheduleEvents.find(event => event.clientId === 990121);
    expect(emerson).toBeDefined();
    expect(emerson.startAt).toBe(emersonStart);
    expect(compactWhitespace(denverClock.format(new Date(emerson.startAt)))).toBe('10:00 AM');
  });

  for (const season of seasons) {
    it.each(providers)(`keeps $name at saved ${season.label} local times with only assigned clients`, provider => {
      const summary = demoResponse(`/users/${provider.id}/schedule-summary`, { params: { weekStart: season.weekStart } });
      const assigned = clients.filter(client => client.provider_id === provider.id);
      expect(summary).toMatchObject({ providerId: provider.id, agencyId: practice.id, weekStart: season.weekStart });
      expect(summary.scheduleEvents.length).toBeGreaterThan(0);
      expect([...new Set(summary.scheduleEvents.map(event => event.clientId))].sort()).toEqual(assigned.map(client => client.id).sort());
      for (const event of summary.scheduleEvents) {
        const client = assigned.find(person => person.id === event.clientId);
        expect(client).toBeDefined();
        expect(event.userId).toBe(provider.id);
        expect(event.agencyId).toBe(practice.id);
        expect(event.startAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(event.endAt).toMatch(/Z$/);
        expect(compactWhitespace(denverClock.format(new Date(event.startAt)))).toBe(client.time);
        const savedMinutes = Number(client.frequency.match(/(\d+) minutes/)?.[1]);
        expect((new Date(event.endAt) - new Date(event.startAt)) / 60_000).toBe(savedMinutes);
        expect(Date.parse(localDay(event.startAt))).toBeGreaterThanOrEqual(Date.parse(season.weekStart));
        const end = new Date(`${season.weekStart}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 7);
        expect(Date.parse(localDay(event.startAt))).toBeLessThan(Date.parse(end.toISOString().slice(0, 10)));
      }
      const selectable = demoResponse(`/users/${provider.id}/virtual-session-clients`).clients;
      expect(selectable.map(client => client.id).sort()).toEqual(assigned.map(client => client.id).sort());
    });
  }

  it('keeps appointment identities distinct when switching provider calendars', () => {
    const events = providers.flatMap(provider => demoResponse(`/users/${provider.id}/schedule-summary`, { params: { weekStart: '2026-11-02' } }).scheduleEvents);
    expect(new Set(events.map(event => event.id)).size).toBe(events.length);
  });

  it.each(providers)('exposes booking and auxiliary reads for $name without enabling mutations', provider => {
    expect(demoResponse('/appointments/booking-access', { params: { providerUserId: provider.id, agencyId: practice.id } })).toMatchObject({ enabled: true });
    expect(demoResponse('/appointments/staff-alerts', { params: { providerId: provider.id } })).toEqual({ alerts: [] });
    expect(demoResponse(`/availability/providers/${provider.id}/enrollment-waitlist`)).toMatchObject({ waitlistEnabled: false, requests: [] });
    expect(demoResponse(`/users/${provider.id}/preferences`).schedule_display_prefs).toMatchObject({ layoutDefaultsVersion: 2, schedulePaletteVersion: 2 });
  });

  it.each([1, ...staff.filter(person => !person.is_provider).map(person => person.id)])('denies clinical calendar capabilities to unknown or non-provider user %s', userId => {
    for (const suffix of ['schedule-summary', 'work-schedule', 'virtual-session-clients']) {
      expect(() => demoResponse(`/users/${userId}/${suffix}`)).toThrow(/outside this fictional demo/i);
    }
    expect(() => demoResponse('/appointments/booking-access', { params: { providerUserId: userId } })).toThrow(/outside this fictional demo/i);
    expect(() => demoResponse('/appointments/staff-alerts', { params: { providerId: userId } })).toThrow(/outside this fictional demo/i);
    expect(() => demoResponse(`/availability/providers/${userId}/enrollment-waitlist`)).toThrow(/outside this fictional demo/i);
  });
});

describe('billing fixture coverage', () => {
  it('counts all eight claims and keeps filtered queues consistent with organization totals', () => {
    const workspace = demoResponse('/medical-billing/workspace');
    expect(workspace.claims).toHaveLength(8);
    expect(workspace.total).toBe(8);
    expect(workspace.organizations[0].counts).toEqual({ draft: 3, ready: 3, rejected: 2 });
    for (const [status, count] of Object.entries(workspace.organizations[0].counts)) {
      const queue = demoResponse('/medical-billing/workspace', { params: { status } });
      expect(queue.claims).toHaveLength(count);
      expect(queue.total).toBe(count);
      expect(queue.claims.every(claim => claim.claim_lifecycle === status)).toBe(true);
      expect(queue.organizations[0].counts).toEqual(workspace.organizations[0].counts);
    }
  });

  it('loads service changes for every displayed claim and rejects a substituted claim', () => {
    const { claims } = demoResponse('/medical-billing/workspace');
    for (const claim of claims) {
      expect(demoResponse(`/medical-billing/claimmd/claims/${claim.id}/service-changes`))
        .toEqual({ changes: [], previouslyTransmitted: false, revision: 1 });
    }
    for (const claimId of [1, 990149]) {
      expect(() => demoResponse(`/medical-billing/claimmd/claims/${claimId}/service-changes`)).toThrow(/outside this fictional demo/i);
    }
  });
});
