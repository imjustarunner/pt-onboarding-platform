import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks, onTableWrite: vi.fn() }));
import { listAgencyPtoSheet, isPtoSheetEligibleUser } from '../payrollPto.service.js';
import { canMatchPayrollUser } from '../payrollProviderMatching.service.js';
import { materializeRecurring } from '../recurringPayroll.service.js';
import UserPresenceStatus from '../../models/UserPresenceStatus.model.js';

beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue([[]]); });
describe('assistants stay outside employee and presence rosters', () => {
  it('does not treat a group work email as evidence that an assistant is a PTO employee', async () => {
    const human = { user_id: 2, role: 'provider', status: 'ACTIVE_EMPLOYEE', work_email: 'human@agency.invalid', is_archived: 0 };
    mocks.execute.mockResolvedValue([[human,
      { user_id: 81, role: 'assistant', status: 'ACTIVE_EMPLOYEE', work_email: 'payroll-assistant@agency.invalid' },
      { user_id: 82, role: 'support', is_assistant_account: 1, status: 'ACTIVE_EMPLOYEE', work_email: 'marked@agency.invalid' }
    ]]);
    expect(await listAgencyPtoSheet({ agencyId: 2 })).toEqual([human]);
    mocks.execute.mockResolvedValue([[{ role: 'assistant', work_email: 'payroll-assistant@agency.invalid' }]]);
    expect(await isPtoSheetEligibleUser({ agencyId: 2, userId: 81 })).toBe(false);
  });
  it('never matches a payroll import to a machine identity', () => {
    expect(canMatchPayrollUser({ role: 'provider', is_archived: 0, status: 'ACTIVE_EMPLOYEE' })).toBe(true);
    expect(canMatchPayrollUser({ role: 'assistant', status: 'ACTIVE_EMPLOYEE' })).toBe(false);
    expect(canMatchPayrollUser({ role: 'admin', is_assistant_account: 1, status: 'ACTIVE_EMPLOYEE' })).toBe(false);
  });
  it('includes durable machine exclusions in the Team Board database roster', async () => {
    await UserPresenceStatus.findAllWithUsers();
    const query = mocks.execute.mock.calls.map(([sql]) => sql).find(sql => sql.includes('FROM users u'));
    expect(query).toContain("COALESCE(u.role,'') <> 'assistant'");
    expect(query).toContain('COALESCE(u.is_assistant_account,0)=0');
  });
  it('does not materialize recurring pay for a machine account', async () => {
    const c = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
      execute: vi.fn(async sql => sql.includes('FROM payroll_periods')
        ? [[{ id: 10, status: 'draft', period_start: '2026-10-24', period_end: '2026-11-06' }]] : [[]]) };
    mocks.getConnection.mockResolvedValue(c);
    await materializeRecurring({ agencyId: 2, payrollPeriodId: 10 });
    const query = c.execute.mock.calls.map(([sql]) => sql).find(sql => sql.includes('FROM payroll_recurring_payments'));
    expect(query).toContain("COALESCE(u.role,'') <> 'assistant'");
    expect(query).toContain('COALESCE(u.is_assistant_account,0)=0');
    expect(c.commit).toHaveBeenCalledOnce();
  });
});
