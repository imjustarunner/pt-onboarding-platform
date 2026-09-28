import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/PayrollPeriod.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/PayrollSummary.model.js', () => ({ default: { listForPeriod: vi.fn() } }));
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollSummary from '../../models/PayrollSummary.model.js';
import { downloadPayrollExportCsv, requestAdpExport } from '../payroll.controller.js';
import { enforceActivityProtection } from '../../middleware/activityProtection.middleware.js';

let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  req = { method: 'GET', originalUrl: '/api/payroll/periods/42/export.csv', params: { id: '42' }, user: { id: 9, role: 'super_admin' }, authClaims: { authMethod: 'google' } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
  next = vi.fn();
  PayrollPeriod.findById.mockResolvedValue({ id: 42, agency_id: 7, status: 'ran', period_start: '2026-09-01', period_end: '2026-09-15' });
  PayrollSummary.listForPeriod.mockResolvedValue([{ user_id: 12, first_name: 'Example', last_name: 'Employee', total_amount: 120, direct_hours: 2, indirect_hours: 0 }]);
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM agencies WHERE id')) return [[{ id: 7, organization_type: 'agency' }]];
    if (sql.includes('FROM user_agencies')) return [[]];
    if (sql.includes('FROM payroll_adjustments') || sql.includes('FROM payroll_pto_requests')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  });
});

describe('payroll export authorization after client-file classification', () => {
  it('delivers the employee CSV for a Google SSO superadmin without consulting client-file quotas', async () => {
    const proceed = vi.fn();
    await enforceActivityProtection(req, res, proceed);
    expect(proceed).toHaveBeenCalledWith();
    await downloadPayrollExportCsv(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Employee, Example'));
    expect(PayrollSummary.listForPeriod).toHaveBeenCalledWith(42);
  });
  it.each([downloadPayrollExportCsv, requestAdpExport])('still denies an actor without payroll access before reading summaries', async handler => {
    req.user.role = 'provider';
    if (handler === requestAdpExport) { req.method = 'POST'; req.originalUrl = '/api/payroll/periods/42/adp/export'; }
    await enforceActivityProtection(req, res, next);
    expect(next).toHaveBeenCalledWith();
    next.mockClear();
    await handler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Payroll access required' } });
    expect(PayrollSummary.listForPeriod).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
  it('still requires Run Payroll before the export', async () => {
    PayrollPeriod.findById.mockResolvedValue({ id: 42, agency_id: 7, status: 'draft' });
    await downloadPayrollExportCsv(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(PayrollSummary.listForPeriod).not.toHaveBeenCalled();
  });
});
