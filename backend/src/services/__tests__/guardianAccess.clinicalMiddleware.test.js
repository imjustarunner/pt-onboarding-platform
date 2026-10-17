import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: vi.fn() }));
vi.mock('../medicalBillingFlags.service.js', () => ({ getMedicalBillingFlags: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { listBillingAgencyIds: vi.fn() } }));
import pool from '../../config/database.js';
import { getMedicalBillingFlags } from '../medicalBillingFlags.service.js';
import { requireClinicalChart } from '../../middleware/medicalBilling.middleware.js';
let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  req = { user: { id: 10, role: 'client_guardian' }, body: { agencyId: 2 } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  pool.execute.mockResolvedValue([[{ id: 2 }]]);
  getMedicalBillingFlags.mockReturnValue({ medicalBillingEnabled: true, clinicalChartEnabled: true });
});
it.each(['client_guardian', 'guardian', 'client', 'student', 'school_staff'])('rejects %s before reading staff chart data', async role => {
  req.user.role = role;
  await requireClinicalChart(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(pool.execute).not.toHaveBeenCalled();
});
it('preserves enabled clinical chart access for staff', async () => {
  req.user.role = 'provider';
  await requireClinicalChart(req, res, next);
  expect(next).toHaveBeenCalledWith();
  expect(req.medicalBillingAgencyId).toBe(2);
});
it('keeps feature flags enforced after the staff role check', async () => {
  req.user.role = 'provider';
  getMedicalBillingFlags.mockReturnValue({ medicalBillingEnabled: true, clinicalChartEnabled: false });
  await requireClinicalChart(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});
