import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import { upsertAgencyPtoPolicy, manualLineUsesAppSickLeave } from '../payrollPto.service.js';
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T18:00:00Z')); Agency.findById.mockResolvedValue({ pto_policy_json: { sickFfsMultiplier: 0.04, sickHourlyMultiplier: 0.034, trainingMaxBalance: 30 } }); pool.execute.mockImplementation(async sql => sql.includes('SELECT id FROM payroll_periods') ? [[{ id: 10 }]] : [[]]); });
afterEach(() => vi.useRealTimers());

it('requires a prospective existing pay-period start and preserves prior policy terms', async () => {
  await upsertAgencyPtoPolicy({ agencyId: 6, policy: { sickLeaveHoursEffectiveOn: '2026-11-07' }, ptoEnabled: true });
  const [sql, values] = pool.execute.mock.calls.find(([sql]) => sql.includes('UPDATE agencies'));
  const policy = JSON.parse(values[0]);
  expect(policy).toMatchObject({ sickLeaveHoursEffectiveOn: '2026-11-07', sickFfsMultiplier: 0.04, sickHourlyMultiplier: 0.034, trainingMaxBalance: 30 });
});

it('rejects retroactive conversion and a date that splits existing periods', async () => {
  await expect(upsertAgencyPtoPolicy({ agencyId: 6, policy: { sickLeaveHoursEffectiveOn: '2026-10-29' } })).rejects.toThrow('prospectively');
  pool.execute.mockResolvedValue([[]]);
  await expect(upsertAgencyPtoPolicy({ agencyId: 6, policy: { sickLeaveHoursEffectiveOn: '2026-11-01' } })).rejects.toThrow('existing pay-period start');
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('UPDATE agencies'))).toBe(false);
});

it('does not allow removing an already effective policy', async () => {
  Agency.findById.mockResolvedValue({ pto_policy_json: { sickLeaveHoursEffectiveOn: '2026-10-24' } });
  await expect(upsertAgencyPtoPolicy({ agencyId: 2, policy: { sickLeaveHoursEffectiveOn: null } })).rejects.toThrow('cannot be removed');
});


it('manual pay lines follow their payroll period, never a later payment date',async()=>{
 const args={agencyId:2,payrollPeriodId:148,policy:{sickLeaveHoursEffectiveOn:'2026-11-07'}};
 pool.execute.mockResolvedValue([[{period_start:'2026-10-24'}]]);
 expect(await manualLineUsesAppSickLeave(args)).toBe(false);
 expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining('id=? AND agency_id=?'),[148,2]);
 pool.execute.mockResolvedValue([[{period_start:'2026-11-07'}]]);
 expect(await manualLineUsesAppSickLeave({...args,payrollPeriodId:149})).toBe(true);
 pool.execute.mockResolvedValue([[]]);
 expect(await manualLineUsesAppSickLeave(args)).toBe(false);
 expect(await manualLineUsesAppSickLeave({...args,payrollPeriodId:null})).toBe(false);
});
