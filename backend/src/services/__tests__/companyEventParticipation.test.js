import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { eventTravelInterval, validateEventTravelPayload, employeeAssignedToEvent, loadEmployeeEvent, isEmployeeEventDay, getEmployeeEventParticipation, recordEmployeeEventParticipation } from '../companyEventParticipation.service.js';
import PayrollTimeClaim from '../../models/PayrollTimeClaim.model.js';
import { recordSkillBuilderEventClockIn, recordSkillBuilderEventClockOut } from '../skillBuildersEventKioskPunch.service.js';
import { loadEventPayrollContext } from '../eventPayrollRate.service.js';
import { saveEventOperations } from '../companyEventOperations.service.js';
after(() => pool.end());

const event = { id: 4, agency_id: 2, title: 'School Outreach', timezone: 'America/Denver', is_active: 1, starts_at: '2026-10-24T16:00:00Z', ends_at: '2026-10-24T20:00:00Z' };
const payload = { companyEventId: 4, eventWorkType: 'travel', categoryGroup: 'support_activity', travelStartedAt: '2026-10-24T15:00:00Z', travelEndedAt: '2026-10-24T15:30:00Z', totalMinutes: 30, allocations: [{ serviceTypeId: 8, minutes: 30 }], attestation: true };
const fakeDb = ({ overlap = [], claims = [], assigned = true, foundEvent = event } = {}) => ({ execute: async (sql) => {
  if (sql.includes('FROM company_events e')) return [foundEvent ? [foundEvent] : []];
  if (sql.includes('FROM company_event_provider_assignments')) return [assigned ? [{ assigned: 1 }] : []];
  if (sql.includes('SELECT session_date')) return [[{ session_date: '2026-10-24' }]];
  if (sql.includes('FROM payroll_indirect_service_types')) return [[{ id: 8, label: 'Approved Travel' }]];
  if (sql.includes('SELECT p.id')) return [overlap];
  if (sql.includes('FROM payroll_time_claims')) return [claims];
  throw new Error(`Unexpected query: ${sql}`);
} });
const validate = (changes = {}) => validateEventTravelPayload({ agencyId: 2, userId: 9, claimDate: '2026-10-24', payload, now: new Date('2026-10-25T00:00:00Z'), db: fakeDb(), ...changes });

test('travel interval requires real instants, positive duration and actual past work', () => {
  assert.equal(eventTravelInterval(payload, new Date('2026-10-25')).minutes, 30);
  assert.throws(() => eventTravelInterval({ ...payload, travelStartedAt: '2026-10-24T09:00' }), /timezone/);
  assert.throws(() => eventTravelInterval({ ...payload, travelEndedAt: payload.travelStartedAt }), /Arrival must be after departure/);
  assert.throws(() => eventTravelInterval(payload, new Date('2026-10-24T15:00Z')), /future/);
});
test('travel retains event association and canonical support activity type', async () => {
  const result = await validate();
  assert.equal(result.companyEventId, 4); assert.equal(result.source, 'company_event_travel');
  assert.equal(result.categoryGroup, 'support_activity'); assert.equal(result.allocations[0].serviceTypeKey, 'approved_travel');
});
test('travel records either direction at the support rate and rejects unknown directions', async () => {
  for (const travelDirection of ['to_event', 'from_event']) {
    const result = await validate({ payload: { ...payload, travelDirection } });
    assert.equal(result.travelDirection, travelDirection);
    assert.equal(result.allocations[0].payBucket, 'support');
  }
  await assert.rejects(validate({ payload: { ...payload, travelDirection: 'elsewhere' } }), /to or from/);
});
test('a replayed SMS cannot create another punch even after a later checkout', async (t) => {
  const actions = [];
  const db = { beginTransaction: async () => actions.push('begin'), commit: async () => actions.push('commit'), rollback: async () => actions.push('rollback'), release: () => actions.push('release'), execute: async sql => {
    if (sql.includes('FOR UPDATE')) { actions.push('lock'); return [[{ id: 9 }]]; }
    if (sql.includes('FROM company_events e')) return [[event]];
    if (sql.includes('INSERT IGNORE INTO company_event_checkin_sms_receipts')) return [{ affectedRows: 0 }];
    throw new Error(`Replay must not write attendance: ${sql}`);
  } };
  t.mock.method(pool, 'getConnection', async () => db);
  const result = await recordEmployeeEventParticipation({ eventId: 4, userId: 9, action: 'check-in', source: 'employee_event_sms', idempotencyKey: 'original-message' });
  assert.equal(result.alreadyProcessed, true);
  assert.deepEqual(actions, ['begin', 'lock', 'commit', 'release']);
});
test('travel rejects cross-agency or unassigned event claims', async () => {
  await assert.rejects(validate({ agencyId: 99 }), /organization/);
  await assert.rejects(validate({ db: fakeDb({ assigned: false }) }), /coordinator assignment/);
});
test('overlapping event attendance or pending travel cannot be paid twice', async () => {
  await assert.rejects(validate({ db: fakeDb({ overlap: [{ id: 6 }] }) }), /already recorded/);
  await assert.rejects(validate({ db: fakeDb({ claims: [{ payload_json: { ...payload, travelStartedAt: '2026-10-24T15:15Z', travelEndedAt: '2026-10-24T15:45Z' } }] }) }), /time claim/);
  await validate({ db: fakeDb({ claims: [{ payload_json: { travelStartedAt: '2026-10-24T14:30Z', travelEndedAt: payload.travelStartedAt } }] }) });
});
test('travel category, minutes and local claim date cannot be changed by the caller', async () => {
  await assert.rejects(validate({ payload: { ...payload, categoryGroup: 'indirect_service' } }), /Support Activity/);
  await assert.rejects(validate({ payload: { ...payload, totalMinutes: 45 } }), /allocation/);
  await assert.rejects(validate({ claimDate: '2026-10-23' }), /event timezone/);
});
test('attendance requires finalized session assignment for the selected date', async () => {
  const db = { execute: async (sql, params) => {
    assert.match(sql, /sp\.assignment_status = 'finalized'/);
    assert.match(sql, /sd\.session_date = \?/);
    assert.equal(params[5], '2026-10-24');
    assert.doesNotMatch(sql, /session_provider_requests/);
    return [[{ assigned: 1 }]];
  } };
  assert.equal(await employeeAssignedToEvent({ event, userId: 9, date: '2026-10-24', db }), true);
});
test('employee access requires active membership and event days honor session dates', async () => {
  await assert.rejects(loadEmployeeEvent({ eventId: 4, userId: 9, db: fakeDb({ foundEvent: null }) }), /not found/);
  assert.equal(await isEmployeeEventDay({ event, date: '2026-10-23', db: fakeDb() }), false);
  assert.equal(await isEmployeeEventDay({ event, date: '2026-10-24', db: fakeDb() }), true);
});
test('kiosk payroll claims and updates use the supplied transaction connection', async () => {
  const queries = [];
  const db = { execute: async (sql) => { queries.push(sql); return sql.startsWith('INSERT') ? [{ insertId: 21 }] : [[{ id: 21, payload_json: '{}' }]]; } };
  assert.equal((await PayrollTimeClaim.create({ agencyId: 2, userId: 9, claimType: 'skill_builder_event', claimDate: '2026-10-24', db })).id, 21);
  await PayrollTimeClaim.updatePayload({ id: 21, payload: { siblingClaimId: 22 }, db });
  await PayrollTimeClaim.resubmit({ id: 21, payload: {}, db });
  assert.equal(queries.length, 6);
});

test('legacy kiosks acquire the same transaction lock without nested pool reads and roll back duplicate taps', async (t) => {
  t.mock.method(pool, 'execute', async () => { throw new Error('Nested pool acquisition'); });
  const actions = [];
  const db = { beginTransaction: async () => actions.push('begin'), commit: async () => actions.push('commit'), rollback: async () => actions.push('rollback'), release: () => actions.push('release'), execute: async (sql) => {
    if (sql.includes('FOR UPDATE')) { actions.push('lock'); return [[{ id: 9 }]]; }
    if (sql.includes('FROM skills_group_providers')) return [[{ ok: 1 }]];
    if (sql.includes('SELECT id, punched_at, session_id')) return [[]];
    if (sql.includes('SELECT punch_type')) return [[{ punch_type: 'clock_in' }]];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const result = await recordSkillBuilderEventClockIn({ getConnection: async () => db }, { agencyId: 2, eventId: 4, userId: 9 });
  assert.equal(result.error.status, 409);
  assert.deepEqual(actions, ['begin', 'lock', 'rollback', 'release']);
});

test('event payroll rate context keeps all reads in the supplied transaction', async (t) => {
  t.mock.method(pool, 'execute', async () => { throw new Error('Nested pool acquisition'); });
  const db = { execute: async (sql) => {
    if (sql.includes('FROM company_events')) return [[{ ...event, event_type: 'school_outreach', skill_builder_direct_hours: 0 }]];
    if (sql.includes('FROM payroll_other_rate_titles')) return [[{ title_1: 'Outreach' }]];
    if (sql.includes('FROM payroll_event_type_rate_maps')) return [[{ id: 1, agency_id: 2, event_type: 'school_outreach', rate_slot: 'other_1', use_direct_indirect_split: 0 }]];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const result = await loadEventPayrollContext({ agencyId: 2, eventId: 4, db });
  assert.equal(result.rateSlot, 'other_1'); assert.equal(result.eventTitle, 'School Outreach');
});

test('school event checkout generates only indirect pay for actual event time', async (t) => {
  const claims = [];
  t.mock.method(PayrollTimeClaim, 'create', async args => { claims.push(args); return { id: 88 }; });
  const db = { execute: async sql => {
    if (sql.includes('SELECT id, punched_at, client_id')) return [[{ id: 44, punched_at: new Date('2026-10-24T16:00Z') }]];
    if (sql.includes('FROM skills_group_providers')) return [[{ ok: 1 }]];
    if (sql.includes("punch_type = 'clock_out'")) return [[]];
    if (sql.includes('FROM company_events')) return [[{ ...event, event_type: 'school_open_house', skill_builder_direct_hours: 3 }]];
    if (sql.includes('FROM payroll_other_rate_titles') || sql.includes('FROM payroll_event_type_rate_maps') || sql.includes('FROM payroll_periods')) return [[]];
    if (sql.includes('INSERT INTO skill_builders_event_kiosk_punches')) return [{ insertId: 45 }];
    if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    throw new Error(sql);
  } };
  const result = await recordSkillBuilderEventClockOut(db, { agencyId: 2, eventId: 4, userId: 9, clockOutAt: new Date('2026-10-24T18:00Z'), source: 'employee_event_sms' });
  assert.equal(result.directHours, 0); assert.equal(result.indirectHours, 2);
  assert.equal(claims.length, 1); assert.equal(claims[0].payload.payrollRateSlot, 'indirect');
  assert.equal(claims[0].payload.directHours, 0); assert.equal(claims[0].payload.workedHours, 2);
  assert.equal(claims[0].db, db);
});

test('school detail edits preserve existing coordinator attribution when the public actor is absent', async (t) => {
  const statements = [];
  const db = { beginTransaction: async () => {}, commit: async () => statements.push('commit'), rollback: async () => statements.push('rollback'), release: () => {}, execute: async (sql) => {
    statements.push(sql);
    if (sql.startsWith('UPDATE company_events')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT user_id')) return [[{ user_id: 7 }]];
    throw new Error('Coordinator attribution was unexpectedly rewritten');
  } };
  t.mock.method(pool, 'getConnection', async () => db);
  await saveEventOperations({ eventId: 4, agencyId: 2, actorUserId: null, operations: { coordinatorUserIds: [7] } });
  assert.equal(statements.at(-1), 'commit');
  assert.equal(statements.some((sql) => sql.startsWith('INSERT') || sql.startsWith('DELETE')), false);
});

test('a public school edit cannot persist a new coordinator without an authenticated assigning actor', async (t) => {
  const actions = [];
  const db = { beginTransaction: async () => {}, commit: async () => actions.push('commit'), rollback: async () => actions.push('rollback'), release: () => actions.push('release'), execute: async (sql) => {
    if (sql.startsWith('UPDATE company_events')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT user_id')) return [[]];
    throw new Error('Unexpected coordinator write');
  } };
  t.mock.method(pool, 'getConnection', async () => db);
  await assert.rejects(saveEventOperations({ eventId: 4, agencyId: 2, actorUserId: null, operations: { coordinatorUserIds: [7] } }), /signed-in agency event manager/);
  assert.deepEqual(actions, ['rollback', 'release']);
});

test('keeps travel entry available after an assigned date without opening check-in on a different date', async () => {
  const db = { execute: async (sql, args) => {
    if (sql.includes('FROM company_events e')) return [[{ ...event, user_role: 'admin' }]];
    if (sql.includes('FROM company_event_provider_assignments')) return [sql.includes('sd.session_date = ?') ? [] : [{ assigned: 1 }]];
    if (sql.includes('SELECT id, punch_type')) return [[]];
    if (sql.includes('SELECT session_date')) return [[{ session_date: '2026-10-24' }]];
    throw new Error(sql);
  } };
  const p = await getEmployeeEventParticipation({ eventId: 4, userId: 9, db, now: new Date('2026-10-26T18:00:00Z') });
  assert.equal(p.assigned, false); assert.equal(p.canSubmitTravel, true); assert.equal(p.canCheckIn, false);
});
