import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { getCompanyEventGuestAttendance, recordCompanyEventGuestAttendance } from '../companyEventGuestAttendance.service.js';
after(() => pool.end());

const token = 'a'.repeat(64);
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const event = { id: 12, agency_id: 2, is_active: 1, timezone: 'America/Denver', starts_at: '2026-10-24T15:00:00Z', ends_at: '2026-10-24T22:00:00Z', operations_json: { attendeeCheckInEnabled: true } };
const guest = { id: 31, response: 'yes', management_token_hash: tokenHash };
const input = { eventId: 12, email: 'Guest@Example.test ', managementToken: token, now: new Date('2026-10-24T16:00:00Z') };

function fakeConnection({ eventRow = event, guestRow = guest, sessions = [], attendance = null } = {}) {
  const queries = [], transactions = [];
  const conn = { beginTransaction: async () => transactions.push('begin'), commit: async () => transactions.push('commit'), rollback: async () => transactions.push('rollback'), release: () => transactions.push('release'),
    execute: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('FROM company_events')) return [eventRow ? [eventRow] : []];
      if (sql.includes('FROM company_event_guest_registrations')) return [guestRow ? [guestRow] : []];
      if (sql.includes('FROM company_event_session_dates')) return [sessions];
      if (sql.includes('FROM company_event_guest_attendance')) return [attendance ? [attendance] : []];
      if (sql.startsWith('INSERT INTO company_event_guest_attendance')) return [{ insertId: 71 }];
      if (sql.startsWith('UPDATE company_event_guest_attendance') || sql.startsWith('UPDATE company_event_guest_registrations')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    } };
  return { conn, queries, transactions };
}
const record = (fake, args = {}) => recordCompanyEventGuestAttendance({ ...input, action: 'check-in', db: { getConnection: async () => fake.conn }, ...args });
const writes = (fake) => fake.queries.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql));

test('guest check-in locks event then guest and writes only the daily guest register and latest roster pair', async () => {
  const fake = fakeConnection();
  assert.deepEqual(await record(fake), { checkedInAt: input.now.toISOString(), checkedOutAt: null });
  assert.match(fake.queries[0].sql, /FROM company_events.*FOR UPDATE/s);
  assert.match(fake.queries[1].sql, /FROM company_event_guest_registrations.*FOR UPDATE/s);
  assert.deepEqual(fake.queries[1].params, [12, 2, 'guest@example.test']);
  assert.equal(writes(fake).length, 2);
  assert.doesNotMatch(fake.queries.map(q => q.sql).join('\n'), /payroll|event_day_kiosk|skill_builders|company_event_responses/);
  assert.deepEqual(fake.transactions, ['begin', 'commit', 'release']);
});
test('repeat check-in and check-out preserve the original timestamps', async () => {
  const attendance = { id: 71, checked_in_at: '2026-10-24T15:45:00.000Z', checked_out_at: '2026-10-24T15:55:00.000Z' };
  for (const action of ['check-in', 'check-out']) {
    const fake = fakeConnection({ attendance });
    assert.deepEqual(await record(fake, { action }), { checkedInAt: attendance.checked_in_at, checkedOutAt: attendance.checked_out_at });
    assert.equal(writes(fake).length, 0);
  }
});
test('check-out closes an existing check-in and synchronizes the latest roster pair', async () => {
  const fake = fakeConnection({ attendance: { id: 71, checked_in_at: '2026-10-24T15:45:00Z', checked_out_at: null } });
  const response = await record(fake, { action: 'check-out' });
  assert.equal(response.checkedOutAt, input.now.toISOString());
  assert.equal(writes(fake).length, 2);
});
test('check-out without check-in rolls back without attendance writes', async () => {
  const fake = fakeConnection();
  await assert.rejects(record(fake, { action: 'check-out' }), /Check in before/);
  assert.equal(writes(fake).length, 0); assert.deepEqual(fake.transactions, ['begin', 'rollback', 'release']);
});
test('guest token must match the registered email and event, with no fallback to an account', async () => {
  for (const guestRow of [null, { ...guest, management_token_hash: null }, { ...guest, management_token_hash: 'f'.repeat(64) }]) {
    const fake = fakeConnection({ guestRow });
    await assert.rejects(record(fake), { status: 404 }); assert.equal(writes(fake).length, 0);
  }
});
test('a yes RSVP and enabled active event are required', async () => {
  for (const eventRow of [null, { ...event, is_active: 0 }, { ...event, school_event_status: 'canceled' }, { ...event, operations_json: { attendeeCheckInEnabled: false } }]) {
    const fake = fakeConnection({ eventRow });
    await assert.rejects(record(fake), { status: 404 }); assert.equal(writes(fake).length, 0);
  }
  for (const response of ['no', 'maybe']) await assert.rejects(record(fakeConnection({ guestRow: { ...guest, response } })), { status: 409 });
});
test('event-day gate uses the event timezone rather than UTC midnight', async () => {
  const fake = fakeConnection();
  await record(fake, { now: new Date('2026-10-25T01:30:00Z') });
  const insert = writes(fake)[0];
  assert.equal(insert.params[2], '2026-10-24');
  await assert.rejects(record(fakeConnection(), { now: new Date('2026-10-25T07:00:00Z') }), /event date/);
});
test('future attendees can read a friendly not-yet-open state without recording attendance', async () => {
  const fake = fakeConnection();
  assert.deepEqual(await getCompanyEventGuestAttendance({ ...input, now: new Date('2026-10-13T16:00:00Z'), db: fake.conn }), {
    checkedInAt: null, checkedOutAt: null, isEventDay: false
  });
  assert.equal(writes(fake).length, 0);
});
test('materialized recurrence dates take precedence over the event range and keep each day separate', async () => {
  const sessions = [{ session_date: '2026-10-24' }, { session_date: '2026-10-31' }];
  const fake = fakeConnection({ sessions });
  await record(fake, { now: new Date('2026-10-31T16:00:00Z') });
  assert.equal(writes(fake)[0].params[2], '2026-10-31');
  await assert.rejects(record(fakeConnection({ sessions }), { now: new Date('2026-10-25T16:00:00Z') }), /event date/);
});
test('read-only attendance state repeats the token/day guards and never starts a transaction', async () => {
  const fake = fakeConnection({ attendance: { id: 71, checked_in_at: '2026-10-24T15:45:00Z', checked_out_at: null } });
  assert.deepEqual(await getCompanyEventGuestAttendance({ ...input, db: fake.conn }), { checkedInAt: '2026-10-24T15:45:00.000Z', checkedOutAt: null });
  assert.equal(writes(fake).length, 0); assert.equal(fake.transactions.length, 0);
  await assert.rejects(getCompanyEventGuestAttendance({ ...input, managementToken: 'b'.repeat(64), db: fake.conn }), { status: 404 });
});
test('invalid actions and malformed tokens cannot open a database connection', async () => {
  const db = { getConnection: async () => { throw new Error('Unexpected connection'); } };
  await assert.rejects(recordCompanyEventGuestAttendance({ ...input, action: 'register', db }), { status: 400 });
  await assert.rejects(recordCompanyEventGuestAttendance({ ...input, action: 'check-in', managementToken: '', db }), { status: 404 });
});
test('a confirmed registration may check in after the RSVP deadline and state is empty before arrival', async () => {
  const fake = fakeConnection({ eventRow: { ...event, rsvp_deadline: '2026-10-01', public_registration_status: 'closed' } });
  assert.deepEqual(await getCompanyEventGuestAttendance({ ...input, db: fake.conn }), { checkedInAt: null, checkedOutAt: null });
  await record(fake);
  assert.equal(writes(fake).length, 2);
});
test('attendance write failure rolls back the whole daily and latest-roster update', async () => {
  const fake = fakeConnection();
  const original = fake.conn.execute;
  fake.conn.execute = async (sql, values) => {
    if (sql.startsWith('UPDATE company_event_guest_registrations')) throw new Error('storage failure');
    return original(sql, values);
  };
  await assert.rejects(record(fake), /storage failure/);
  assert.deepEqual(fake.transactions, ['begin', 'rollback', 'release']);
});
