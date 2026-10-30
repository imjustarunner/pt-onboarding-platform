import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), query: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/PayrollPeriod.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/PayrollSummary.model.js', () => ({ default: { listForPeriod: vi.fn() } }));
vi.mock('../../services/payrollPto.service.js', async importOriginal => ({ ...await importOriginal(), getAgencyPtoPolicy: vi.fn() }));
import { getAgencyPtoPolicy } from '../../services/payrollPto.service.js';
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollSummary from '../../models/PayrollSummary.model.js';
import { downloadPayrollExportCsv } from '../payroll.controller.js';

beforeEach(() => {
  vi.clearAllMocks();
  getAgencyPtoPolicy.mockResolvedValue({policy:{sickLeaveHoursEffectiveOn:"2026-11-07"}});
  PayrollPeriod.findById.mockResolvedValue({ id: 147, agency_id: 2, status: 'ran', period_start: new Date('2026-10-10T00:00:00Z'), period_end: new Date('2026-10-23T00:00:00Z') });
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT id, organization_type FROM agencies')) return [[{ id: 2, organization_type: 'agency' }]];
    if (sql.includes('payroll_adjustments')) return [[{ user_id: 7, sick_pto_hours: 2, training_pto_hours: 3, pto_rate: 44, other_taxable_amount: 36 }]];
    if (sql.includes('payroll_pto_requests')) throw Error('Requests are not approved payroll amounts');
    return [[]];
  });
});
it('exports applied sick/training hours and correct dates without querying pending requests', async () => {
  PayrollSummary.listForPeriod.mockResolvedValue([{ user_id: 7, first_name: 'Test', last_name: 'Staff', total_amount: 256, breakdown: { __adjustments: { sickPtoHours: 2, trainingPtoHours: 3, ptoHours: 5, otherTaxableAmount: 36, lines: [{ type: 'pto', amount: 220 }] } } }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn(), send: vi.fn() }, next = vi.fn();
  await downloadPayrollExportCsv({ params: { id: '147' }, user: { id: 1, role: 'super_admin' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.send).toHaveBeenCalledOnce();
  expect(res.send.mock.calls[0][0]).toContain('36.00,220.00,2.00,3.00');
  expect(res.send.mock.calls[0][0]).toContain('2026-10-10,2026-10-23');
  expect(res.send.mock.calls[0][0]).toContain('Direct Hour Credits,Direct Hourly Rate,Indirect Hour Credits,Indirect Hourly Rate');
  expect(res.send.mock.calls[0][0]).not.toContain('Sick Leave Hours (Accrual Basis)');
  expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="2026-10-10-2026-10-23.csv"');
});

it('exports future-period app calculations including automatic indirect once', async () => {
  PayrollPeriod.findById.mockResolvedValue({id:149,agency_id:2,status:'ran',period_start:'2026-11-07',period_end:'2026-11-20'});
  PayrollSummary.listForPeriod.mockResolvedValue([{ user_id: 7, first_name: 'Test', last_name: 'Staff', total_amount: 236, direct_hours: 2.5, indirect_hours: 1, breakdown: {
    'AUTO INDIRECT':{hours:0.25,amount:5,category:'indirect'}, '90837': { hours: 1, amount: 44 }, H2014: { hours: 1, amount: 22 }, H0031: { hours: 0.5, amount: 10 }, INDIRECT: { hours: 0.75, amount: 15, category: 'indirect' },
    __adjustments: { sickPtoHours: 0, trainingPtoHours: 0, ptoHours: 0, mileageAmount: 58, bonusAmount: 25, lines: [
      { type: 'time_claim', taxable: true, amount: 32, meta: { creditsHours: 0 } },
      { type: 'bonus', taxable: true, amount: 25 }, { type: 'holiday_bonus', taxable: true, amount: 25 },
      { type: 'mileage', taxable: false, amount: 58 }
    ] }
  } }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn(), send: vi.fn() }, next = vi.fn();
  await downloadPayrollExportCsv({ params: { id: '147' }, user: { id: 1, role: 'super_admin' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  const csv = res.send.mock.calls[0][0];
  expect(csv).toContain('Sick Leave Hours (Accrual Basis),ADP Earnings Allocation Rate,Ordinary Earnings');
  expect(csv).toContain('3.700000,25.945946,96.00,32.00,0.00,0.00,0.00,50.00,0.00,58.00');
  expect(csv).toContain('2026-11-07,2026-11-20,,YES,0.123333,NO,0.00');
  expect(csv).toContain('Review earning-code mapping before ADP import.');
  expect(csv).not.toContain('Direct Hourly Rate');
});
