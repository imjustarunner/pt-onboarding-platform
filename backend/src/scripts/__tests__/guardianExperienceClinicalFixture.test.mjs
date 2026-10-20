import assert from 'node:assert/strict';
import test from 'node:test';
import { guardianExperienceAppointmentDates, seedGuardianExperienceClinical } from '../guardianExperienceClinicalFixture.mjs';

const asUtc = value => new Date(`${value.replace(' ', 'T')}Z`);
const inputs = {
  actorId: 1, guardianId: 2, run: 'fixture_test',
  guardianPlanRevision: () => 'unused',
  clients: [
    { id: 3, agencyId: 2, setting: 'office', name: 'A Demo' },
    { id: 4, agencyId: 6, setting: 'office', name: 'B Demo' },
    { id: 5, agencyId: 2, setting: 'school', name: 'C Demo' }
  ]
};

test('keeps seven Denver visits at the same local hour across the DST change', () => {
  const visits = guardianExperienceAppointmentDates({ now: new Date('2026-10-20T15:00:00Z'), weekday: 4, hour: 15 });
  assert.equal(visits.filter(visit => visit.status === 'completed').length, 3);
  assert.equal(visits.filter(visit => visit.status !== 'completed').length, 4);
  for (const visit of visits) {
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', hourCycle: 'h23' }).format(asUtc(visit.startAt));
    assert.equal(hour, '15');
    assert.equal(+asUtc(visit.endAt) - +asUtc(visit.startAt), 45 * 60000);
  }
  assert.match(visits.at(-1).startAt, /22:00:00$/);
});

test('never labels a future appointment completed when seeded before its weekday start time', () => {
  const now = new Date('2026-10-22T15:00:00Z');
  const visits = guardianExperienceAppointmentDates({ now, weekday: 4, hour: 15 });
  assert.equal(new Set(visits.map(visit => visit.startAt)).size, 7);
  for (const visit of visits) {
    assert.equal(asUtc(visit.startAt) < now, visit.status === 'completed');
  }
});

test('refuses a real guardian before any data mutation', async () => {
  const queries = [];
  const db = { execute: async sql => {
    queries.push(sql);
    return [[{ id: 2, is_demo: 0, role: 'client_guardian', email: 'real@example.com' }]];
  } };
  await assert.rejects(seedGuardianExperienceClinical({ ...inputs, db, clinicalDb: db }), /non-demo guardian/);
  assert.equal(queries.length, 1);
  assert.ok(queries.every(sql => sql.startsWith('SELECT')));
});

test('refuses an unrelated or real child before any data mutation', async () => {
  const queries = [];
  const db = { execute: async sql => {
    queries.push(sql);
    if (sql.includes('FROM users')) return [[{ id: 2, is_demo: 1, role: 'client_guardian', email: 'guardian-test-fixture@example.com' }]];
    if (sql.includes('FROM clients')) return [[{ id: 3, is_demo: 0, agency_id: 2, organization_id: 2 }]];
    if (sql.includes('FROM client_guardians')) return [[{ id: 6 }]];
    throw new Error('Unexpected query');
  } };
  await assert.rejects(seedGuardianExperienceClinical({ ...inputs, db, clinicalDb: db }), /real, differently scoped, or unrelated client/);
  assert.ok(queries.every(sql => sql.startsWith('SELECT')));
});
