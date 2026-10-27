import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), user: vi.fn(), rate: vi.fn(), card: vi.fn(), attendees: vi.fn(), window: vi.fn(), types: vi.fn(), conn: { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m.conn }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.user } }));
vi.mock('../../models/PayrollRate.model.js', () => ({ default: { findBestRate: m.rate } }));
vi.mock('../../models/PayrollRateCard.model.js', () => ({ default: { findForUser: m.card } }));
vi.mock('../../models/PayrollIndirectServiceType.model.js', () => ({ default: { ensureDefaults: vi.fn(), listForAgency: m.types } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: { listAttendees: m.attendees } }));
vi.mock('../../utils/payrollSubmissionWindow.js', () => ({ computeSubmissionWindow: m.window }));
import { resolveHourlySuperviseePay } from '../hourlySupervisionPay.service.js';
import { createSuperviseeSupervisionTimeClaim } from '../supervisionFinalizePipeline.service.js';
import { buildResolvedSupervisionUnitsByUserCode, computeDefaultAppliedAmountForTimeClaim } from '../../controllers/payroll.controller.js';
const session = { id: 778, agency_id: 6, supervisee_user_id: 488, supervisor_user_id: 528, session_type: 'individual', status: 'FINALIZED', start_at: '2026-10-19 14:00:00', end_at: '2026-10-19 15:02:00' };
let claims;
const generate = () => createSuperviseeSupervisionTimeClaim({ session, rollups: [{ user_id: 488, total_seconds: 3720 }] });
beforeEach(() => {
  vi.clearAllMocks(); claims = [];
  m.user.mockResolvedValue({ is_hourly_worker: 1, credential: 'BA', role: 'provider' });
  m.execute.mockResolvedValue([[{ supervision_is_prelicensed: 0 }]]);
  m.rate.mockResolvedValue(null); m.card.mockResolvedValue({ indirect_rate: 21 });
  m.attendees.mockResolvedValue([]); m.types.mockResolvedValue([{ id: 55, typeKey: 'supervision' }]);
  m.window.mockResolvedValue({ ok: true, suggestedPayrollPeriodId: 911 });
  m.conn.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT id, status FROM supervision_sessions')) return [[{ id: 778, status: 'FINALIZED' }]];
    if (sql.includes('FROM payroll_time_claims c')) return [claims];
    if (sql.startsWith('INSERT INTO payroll_time_claims')) {
      claims.push({ id: 80, status: 'submitted', payload_json: JSON.parse(args[4]) }); return [{ insertId: 80 }];
    }
    if (sql.startsWith('UPDATE payroll_time_claims SET payload_json')) { claims[0].payload_json = JSON.parse(args[0]); return [{ affectedRows: 1 }]; }
    throw new Error(sql);
  });
});
it('uses the existing agency hourly rate without requiring a new pay-system activation or candidate start date', async () => {
  expect(await resolveHourlySuperviseePay({ agencyId: 6, userId: 488 })).toMatchObject({ payable: true, rateAmount: 21, rateSource: 'hourly_indirect_rate' });
  const result = await generate(); expect(result).toMatchObject({ created: true, minutes: 62 });
  expect(claims[0].payload_json).toMatchObject({ source: 'supervision_session_finalize', hourlySupervision: true, participantRole: 'supervisee', supervisionSessionId: 778, totalMinutes: 62 });
  expect(await generate()).toMatchObject({ skipped: true, claimId: 80, reason: 'duplicate_found' });
  expect(claims).toHaveLength(1);
});
it('links an exact existing manual entry and preserves its approved dollars and payload', async () => {
  claims = [{ id: 726, status: 'approved', applied_amount: 21.63, payload_json: { totalMinutes: 62, startTime: '08:00', endTime: '09:02', categoryGroup: 'support_activity', allocations: [{ serviceTypeKey: 'clinical_supervision_sa' }] } }];
  expect(await generate()).toMatchObject({ reason: 'manual_claim_linked', claimId: 726 });
  expect(claims).toHaveLength(1); expect(claims[0]).toMatchObject({ status: 'approved', applied_amount: 21.63, payload_json: { supervisionSessionId: 778, categoryGroup: 'support_activity' } });
  expect(await generate()).toMatchObject({ reason: 'duplicate_found' });
});
it('holds ambiguous manual supervision for review and does not rewrite a posted claim', async () => {
  claims = [{ id: 1, payload_json: { totalMinutes: 60, allocations: [{ serviceTypeKey: 'supervision' }] } }];
  expect(await generate()).toMatchObject({ reason: 'existing_manual_supervision_needs_review' });
  claims[0] = { ...claims[0], status: 'approved', period_status: 'posted', payload_json: { totalMinutes: 62, startTime: '08:00', endTime: '09:02', allocations: [{ serviceTypeKey: 'supervision' }] } };
  expect(await generate()).toMatchObject({ reason: 'existing_posted_manual_claim' });
  expect(m.conn.execute.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
});
it.each([{ role: 'provider', title: 'Clinical intern' }, { credential: 'LPCC' }, { credential: 'LPCC', title: 'Facilitator' }, { title: 'Counselor candidate' }])('pays hourly staff regardless of candidate status or internship title: %j', async identity => {
  m.user.mockResolvedValue({ is_hourly_worker: 1, credential: 'BA', role: 'provider', ...identity });
  m.execute.mockResolvedValue([[{ user_id: 488, supervision_is_prelicensed: 1 }]]);
  expect(await generate()).toMatchObject({ created: true, minutes: 62 });
  expect(claims[0].payload_json).toMatchObject({ hourlySupervision: true });
});
it.each([{ credential: 'LPCC' }, { title: 'Clinical intern' }, { credential: 'BA' }])('does not use hourly compensation for non-hourly staff: %j', async identity => {
  m.user.mockResolvedValue({ is_hourly_worker: 0, role: 'provider', ...identity });
  expect(await generate()).toMatchObject({ skipped: true }); expect(m.conn.beginTransaction).not.toHaveBeenCalled();
});
it('preserves a deliberately zero meeting rate and requires agency membership', async () => {
  m.rate.mockResolvedValue({ rate_amount: 0 });
  expect(await generate()).toMatchObject({ skipped: true }); expect(claims).toHaveLength(0);
  m.rate.mockResolvedValue(null); m.execute.mockResolvedValue([[]]);
  expect(await generate()).toMatchObject({ skipped: true });
});
it('requires actual attendance and mandatory group participation', async () => {
  expect(await createSuperviseeSupervisionTimeClaim({ session, rollups: [] })).toMatchObject({ reason: 'no_attendance' });
  expect(await createSuperviseeSupervisionTimeClaim({ session: { ...session, session_type: 'group' }, rollups: [{ user_id: 488, total_seconds: 3600 }] })).toMatchObject({ reason: 'optional_group_attendance' });
});
it('calculates the automatic claim at the hourly rate before any provider-update rollout', async () => {
  m.execute.mockImplementation(async sql => sql.includes('FROM user_agencies') ? [[{ user_id: 488 }]] : [[]]);
  const amount = await computeDefaultAppliedAmountForTimeClaim({ claim: { agency_id: 6, user_id: 488, claim_type: 'indirect_time', claim_date: '2026-10-19', credits_hours: 1.03,
    payload: { source: 'supervision_session_finalize', participantRole: 'supervisee', hourlySupervision: true, totalMinutes: 62, serviceCode: 'MEETING' } }, rateCard: { indirect_rate: 21 }, approveCreditsHours: 1.03 });
  expect(amount).toBe(21.63);
});
it('does not also add hourly supervisee attendance to staged payroll', async () => {
  m.execute.mockImplementation(async sql => sql.includes('AS is_hourly_worker') ? [[{ user_id: 488, service_date: '2026-10-19', session_type: 'individual', participant_role: 'supervisee', participant_user_role: 'provider', is_hourly_worker: 1, total_seconds: 3720 }]] : [[]]);
  const units = await buildResolvedSupervisionUnitsByUserCode({ payrollPeriodId: 911, agencyId: 6, periodStart: '2026-10-10', periodEnd: '2026-10-23' });
  expect(units.size).toBe(0);
});

it('matches manual supervision on the local event date across UTC midnight', async () => {
  claims = [{ id: 9, status: 'approved', payload_json: { totalMinutes: 62, startTime: '20:00', endTime: '21:02', allocations: [{ serviceTypeKey: 'supervision' }] } }];
  expect(await createSuperviseeSupervisionTimeClaim({ session: { ...session, start_at: '2026-10-20 02:00:00', end_at: '2026-10-20 03:02:00' }, rollups: [{ user_id: 488, total_seconds: 3720 }] })).toMatchObject({ reason: 'manual_claim_linked' });
  const query = m.conn.execute.mock.calls.find(([sql]) => sql.includes('FROM payroll_time_claims c'));
  expect(query[1][2]).toBe('2026-10-19');
});

it('does not double-pay hourly candidates through staged payroll after they reach 100 hours', async () => {
  m.execute.mockImplementation(async sql => {
    if (sql.includes('FROM user_agencies ua')) return [[{ user_id: 488, is_hourly_worker: 1, credential: 'LPCC', supervision_is_prelicensed: 1, supervision_start_date: '2025-01-01', supervision_start_individual_hours: 50, supervision_start_group_hours: 50 }]];
    if (sql.includes('AS is_hourly_worker')) return [[{ user_id: 488, service_date: '2026-10-19', session_type: 'individual', participant_role: 'supervisee', participant_user_role: 'provider', is_hourly_worker: 1, total_seconds: 3720 }]];
    return [[]];
  });
  const units = await buildResolvedSupervisionUnitsByUserCode({ payrollPeriodId: 911, agencyId: 6, periodStart: '2026-10-10', periodEnd: '2026-10-23' });
  expect(units.size).toBe(0);
});
