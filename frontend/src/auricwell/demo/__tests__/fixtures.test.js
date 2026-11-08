import { describe, expect, it } from 'vitest';
import { actor, clients, demoResponse, practice, providers, staff } from '../fixtures.js';
import { createDemoNoteFixtures } from '../notes.js';
import { demoClientRecordIds } from '../recordIds.js';

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
      summary.scheduleEvents=summary.scheduleEvents.filter(event=>event.clientId);
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

  it.each(providers)('fits the expanded $name roster into working hours without overlapping visits', provider => {
    const scheduleEvents = demoResponse(`/users/${provider.id}/schedule-summary`, { params: { weekStart: '2026-11-02' } }).scheduleEvents.filter(event=>event.clientId);
    const { blocks } = demoResponse(`/users/${provider.id}/work-schedule`);
    const minute = value => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
      return Number(parts.hour) * 60 + Number(parts.minute);
    };
    const days = [...new Set(scheduleEvents.map(event => localDay(event.startAt)))];
    for (const day of days) {
      const block = blocks.find(item => item.dayOfWeek === new Date(`${day}T12:00:00Z`).getUTCDay());
      expect(block).toBeDefined();
      const [startHour, startMinute] = block.startTime.split(':').map(Number);
      const [endHour, endMinute] = block.endTime.split(':').map(Number);
      const events = scheduleEvents.filter(event => localDay(event.startAt) === day).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
      expect(events).toHaveLength(4);
      expect(minute(events[0].startAt)).toBeGreaterThanOrEqual(startHour * 60 + startMinute);
      expect(minute(events.at(-1).endAt)).toBeLessThanOrEqual(endHour * 60 + endMinute);
      for (let index = 1; index < events.length; index++) expect(Date.parse(events[index].startAt)).toBeGreaterThanOrEqual(Date.parse(events[index - 1].endAt));
    }
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

describe('expanded fictional client records', () => {
  const originalIds = [990121, 990122, 990123, 990124, 990125, 990126, 990127, 990128];
  const addedIds = [991021, 991022, 991023, 991024, 991025, 991026, 991027, 991028];
  const noteFixtures = createDemoNoteFixtures({ practice, actor, clients, providers, weekStart: '2026-11-02' });

  it('preserves original cases and provides a complete, searchable roster of four clients per provider', () => {
    expect(clients.map(client => client.id)).toEqual([...originalIds, ...addedIds]);
    expect(new Set(clients.map(client => client.full_name)).size).toBe(16);
    expect(demoResponse('/auricwell-preview/directory', { params: { scope: 'practice' } }).total).toBe(16);
    for (const provider of providers) {
      const roster = demoResponse('/auricwell-preview/directory', { params: { providerId: provider.id } });
      expect(roster.clients).toHaveLength(4);
      expect(roster.clients.length).toBeLessThanOrEqual(provider.capacity);
      expect(roster.clients.every(client => client.provider_id === provider.id)).toBe(true);
    }
    for (const client of clients.filter(person => addedIds.includes(person.id))) {
      const found = demoResponse('/auricwell-preview/directory', { params: { search: client.full_name } });
      expect(found.clients.map(person => person.id)).toEqual([client.id]);
      expect(client.email).toMatch(/@example\.invalid$/);
      expect(client.phone).toMatch(/^\(303\) 555-01\d{2}$/);
      for (const field of ['service', 'frequency', 'diagnosis', 'focus', 'goal', 'objective', 'payer', 'consent', 'portal', 'location', 'session_summary', 'intervention_summary', 'next_steps']) expect(client[field], `${client.full_name}: ${field}`).toBeTruthy();
      expect(client).toMatchObject({ agency_id: practice.id, status: 'ACTIVE', plan_status: 'Active', note_status: 'Up to date' });
      expect(client.rating).toBeGreaterThanOrEqual(client.baseline);
      expect(client.rating).toBeLessThanOrEqual(client.target);
    }
    expect(clients.filter(client => client.age < 18).map(client => client.id)).toEqual([990125, 991025, 991027]);
    for (const client of clients.filter(person => person.age < 18)) {
      expect(client.guardian_names).toHaveLength(2);
      expect(client.portal).toContain('2 separate guardian accounts');
      expect(client.recording_consent).toBe(false);
    }
  });

  it('keeps existing case identities stable and expanded histories distinct from drafts and supervisor reviews', () => {
    expect(noteFixtures.drafts.map(note => note.id)).toEqual([990131, 990132, 990133]);
    expect(noteFixtures.cosignNotes.map(note => note.id)).toEqual([990181, 990182]);
    expect(noteFixtures.cosignNotes.map(note => note.client_id)).toEqual([990124, 990125]);
    expect(noteFixtures.historicalNotes.slice(0, 8).map(note => note.id)).toEqual([990171, 990172, 990173, 990174, 990175, 990176, 990177, 990178]);
    expect(noteFixtures.historicalNotes.slice(0, 8).map(note => note.clinical_session_id)).toEqual([990291, 990292, 990293, 990294, 990295, 990296, 990297, 990298]);
    expect(noteFixtures.historicalNotes.slice(0, 8).map(note => note.office_event_id)).toEqual([990241, 990242, 990243, 990244, 990245, 990246, 990247, 990248]);
    const allNotes = [...noteFixtures.drafts, ...noteFixtures.historicalNotes, ...noteFixtures.cosignNotes];
    for (const key of ['id', 'clinical_session_id', 'office_event_id']) expect(new Set(allNotes.map(note => note[key])).size, key).toBe(allNotes.length);
    for (const clientId of [1, 990129, 991020, 991029, 991021.5]) expect(() => demoClientRecordIds(clientId)).toThrow(/outside this fictional demo/i);
  });

  it('opens each added client’s own signed history, care plan, rated objective, session and claim without creating work', () => {
    const { claims } = demoResponse('/medical-billing/workspace');
    const recent = demoResponse('/clinical-notes/recent');
    expect(recent.signedSessions).toHaveLength(16);
    expect(recent.drafts).toHaveLength(3);
    expect(new Set(claims.map(claim => claim.id)).size).toBe(16);
    for (const client of clients.filter(person => addedIds.includes(person.id))) {
      const chart = demoResponse(`/medical-billing/clients/${client.id}/chart`);
      expect(chart.notes).toHaveLength(1);
      expect(chart.sessions).toHaveLength(1);
      const history = chart.notes[0];
      expect(history).toMatchObject({ client_id: client.id, provider_id: client.provider_id, status: 'signed' });
      expect(history.output_json.sections.Subjective).toBe(client.session_summary);
      expect(history.output_json.sections.Interventions).toBe(client.intervention_summary);
      expect(history.output_json.sections.Plan).toBe(client.next_steps);
      expect(Date.parse(history.created_at)).toBeLessThanOrEqual(Date.parse(history.provider_signed_at));
      const detail = demoResponse(`/medical-billing/notes/${history.id}`);
      expect(detail.note).toMatchObject({ clientId: client.id, clientName: client.full_name, providerSignedByUserId: client.provider_id });
      expect(detail.note.structuredChart.clientId).toBe(client.id);
      expect(chart.latestPlan.goals[0].objectives[0]).toMatchObject({ objective_text: client.objective, scale_start: client.baseline, scale_current: client.rating, scale_target: client.target });
      expect(chart.objectiveRatings[0].objective_id).toBe(chart.latestPlan.goals[0].objectives[0].id);
      expect(chart.sessions[0]).toMatchObject({ id: detail.session.id, client_id: client.id, note_id: history.id, status: 'completed', documentation_status: 'signed', modality: 'VIRTUAL' });
      const claim = claims.find(row => row.client_id === client.id);
      expect(claim.clinical_note_id).toBe(history.id);
      expect(demoResponse(`/medical-billing/claimmd/claims/${claim.id}/draft`).claim.client_id).toBe(client.id);
      expect(recent.drafts.some(draft => draft.client_id === client.id)).toBe(false);
      for (const method of ['post', 'put', 'patch', 'delete']) expect(() => demoResponse(`/medical-billing/notes/${history.id}/sign`, { method })).toThrow(/nothing was saved, signed, submitted or sent/i);
    }
    expect(demoResponse('/medical-billing/notes/990181').note.clientName).toBe('Finley Sage');
    expect(demoResponse('/medical-billing/notes/990182').note.clientName).toBe('Rowan Ellis');
  });
});

describe('billing fixture coverage', () => {
  it('counts all sixteen claims and keeps filtered queues consistent with organization totals', () => {
    const workspace = demoResponse('/medical-billing/workspace');
    expect(workspace.claims).toHaveLength(16);
    expect(workspace.total).toBe(16);
    expect(workspace.organizations[0].counts).toEqual({ draft: 6, ready: 5, rejected: 5 });
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
