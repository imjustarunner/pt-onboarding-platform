import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), query: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/PayrollPeriod.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/PayrollSummary.model.js', () => ({ default: { listForPeriod: vi.fn() } }));
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollSummary from '../../models/PayrollSummary.model.js';
import { downloadPayrollExportCsv } from '../payroll.controller.js';

beforeEach(() => {
  vi.clearAllMocks();
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
  expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="2026-10-10-2026-10-23.csv"');
});
