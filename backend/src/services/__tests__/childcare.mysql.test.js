import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
const state = vi.hoisted(() => ({ connection: null, schema: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => state.connection.execute(...args), getConnection: async () => ({ execute: (...args) => state.connection.execute(...args), beginTransaction: () => state.connection.beginTransaction(), commit: () => state.connection.commit(), rollback: () => state.connection.rollback(), release() {} }) } }));
vi.mock('../appointmentConflict.service.js', () => ({ assertAppointmentWindowAvailable: async () => {} }));
vi.mock('../agencyAccessProfiles.service.js', () => ({ readAgencyAccess: async userId => ({ role: Number(userId) === 900001 ? 'admin' : 'staff', capabilities: {} }) }));
vi.mock('../employmentAgreementPolicy.service.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, effectiveCompensationAgreement: async ({ userId }) => ({ id: Number(userId) + 100, effectiveOn: '2026-11-12', data: { schedule: { nluCompensationPolicyVersion: 'nlu-four-category-2026-11-21', category: 2, level: 3, childcareLevel: 3, childcareRatesByBand: { 1: 25, 2: 31, 3: 36, 4: 40 } } } }) };
});
import { saveChildcareGrant, createChildcareShift, updateChildcareShift, recordChildcareAction, previewChildcarePay } from '../childcare.service.js';

// This optional integration creates its own uniquely named schema, copies table
// definitions only, and drops that owned schema. It never changes app records.
describe.runIf(process.env.CHILDCARE_MYSQL_TESTS === '1')('childcare SQL and payroll integration in an isolated test schema', () => {
  beforeAll(async () => {
    if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_NAME !== 'onboarding_stage') throw new Error('Use the reviewed local proxy and source table definitions for isolated-schema validation.');
    const mysql = await import('mysql2/promise');
    state.connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, timezone: 'Z', dateStrings: true });
    const schema = `nlu_childcare_test_${Date.now()}_${process.pid}`;
    if (!/^nlu_childcare_test_[0-9]+_[0-9]+$/.test(schema)) throw new Error('Invalid test schema name.');
    await state.connection.query(`CREATE DATABASE ${schema}`); state.schema = schema; console.info(`Created isolated schema ${schema}; application data is untouched.`);
    await state.connection.changeUser({ database: schema });
    for (const table of ['agencies', 'users', 'user_agencies', 'company_events', 'company_event_provider_assignments', 'company_event_audiences', 'skill_builders_event_kiosk_punches', 'payroll_time_claims', 'user_activity_log']) {
      const [[definition]] = await state.connection.query(`SHOW CREATE TABLE onboarding_stage.${table}`);
      const sql = definition['Create Table'].split('\n').filter(line => !line.includes('FOREIGN KEY')).join('\n').replace(/,\s*\)/g, ')');
      await state.connection.query(sql);
    }
    let migration = await fs.readFile(new URL('../../../../database/migrations/1814_childcare_shifts_and_pay_snapshots.sql', import.meta.url), 'utf8');
    for (const statement of migration.split(';').map(s => s.trim()).filter(Boolean)) await state.connection.query(statement);
    await state.connection.execute('INSERT INTO agencies(id,name,slug,is_active,feature_flags) VALUES (453,?,?,1,JSON_OBJECT())', ['NLU TEMPORARY TEST ONLY', 'nlu-qa-demo']);
    for (const [id, role] of [[900001, 'admin'], [900002, 'staff']]) {
      await state.connection.execute('INSERT INTO users(id,email,first_name,last_name,role,status,is_active) VALUES (?,?,?,?,?,\'ACTIVE_EMPLOYEE\',1)', [id, `temporary-${id}@example.com`, 'Temporary', 'QA', role]);
      await state.connection.execute('INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES (?,453,1)', [id]);
    }
  }, 60000);
  afterAll(async () => { try { if (state.schema) { await state.connection.query(`DROP DATABASE ${state.schema}`); console.info(`Removed isolated schema ${state.schema}.`); } } finally { await state.connection?.end(); } }, 30000);
  it('creates a scoped shift, records actual time once and produces a linked employee-override claim', async () => {
    await saveChildcareGrant({ agencyId: 453, userId: 900001, targetUserId: 900002, enabled: true, selfSchedule: true });
    const result = await createChildcareShift({ agencyId: 453, userId: 900001, startsAt: '2026-11-19T16:00:00-07:00', endsAt: '2026-11-19T19:00:00-07:00', timezone: 'America/Denver', plannedChildren: 3, providerUserIds: [900002], minimumHourlyRate: 20, wageFloorJurisdiction: 'Synthetic test jurisdiction' });
    const shiftId = result.shift.id;
    await recordChildcareAction({ shiftId, userId: 900002, action: 'clock-in', actualChildren: 3, idempotencyKey: 'temporary-clock-in', now: new Date('2026-11-19T23:00:00Z') });
    for (let attempt = 0; attempt < 2; attempt++) await recordChildcareAction({ shiftId, userId: 900002, action: 'clock-out', actualChildren: 3, idempotencyKey: 'temporary-clock-out', now: new Date('2026-11-20T02:00:00Z') });
    const pay = await previewChildcarePay({ shiftId, userId: 900002 });
    expect(pay).toMatchObject({ totalMinutes: 180, totalAmount: 108, reviewRequired: false });
    expect(pay.segments).toHaveLength(1);
    expect(pay.segments[0]).toMatchObject({ band: 3, children: 3, caregivers: 1, rate: 36, amount: 108, rateSource: 'individual_band_override' });
    const [[punches]] = await state.connection.query('SELECT COUNT(*) AS total FROM skill_builders_event_kiosk_punches');
    const [[claims]] = await state.connection.query('SELECT COUNT(*) AS total FROM payroll_time_claims');
    expect(Number(punches.total)).toBe(2); expect(Number(claims.total)).toBe(1);
    await updateChildcareShift({ shiftId, agencyId: 453, userId: 900001, startsAt: result.shift.startsAt, endsAt: result.shift.endsAt, timezone: result.shift.timezone, title: result.shift.title, plannedChildren: 3, providerUserIds: [900002], minimumHourlyRate: 40, wageFloorJurisdiction: 'Synthetic corrected test jurisdiction', locationName: '', note: 'Verified pay-setting correction; actual work unchanged.' });
    expect(await previewChildcarePay({ shiftId, userId: 900002 })).toMatchObject({ totalMinutes: 180, totalAmount: 120, reviewRequired: false });
  }, 30000);
});
