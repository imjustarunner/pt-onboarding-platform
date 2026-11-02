import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/AgencyMedicalServiceCode.model.js', () => ({ default: { findByAgencyAndCode: vi.fn(), listByAgency: vi.fn(), upsert: vi.fn() } }));
vi.mock('../../models/TenantService.model.js', () => ({ default: { listForAgency: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/PayrollServiceCodeRule.model.js', () => ({ default: { listForAgency: vi.fn(), upsert: vi.fn() } }));
import Medical from '../../models/AgencyMedicalServiceCode.model.js';
import Tenant from '../../models/TenantService.model.js';
import Payroll from '../../models/PayrollServiceCodeRule.model.js';
import pool from '../../config/database.js';
import { syncClinicalCodePresent, ensureAgencyPayrollDictionary } from '../agencyServiceCodeCatalog.service.js';
beforeEach(() => {
  vi.resetAllMocks();
  Medical.findByAgencyAndCode.mockResolvedValue({ isActive: true, minMinutes: 45, allowed_credential_tiers_json: '["intern_plus"]', sessionMode: 'individual' });
  Payroll.listForAgency.mockResolvedValue([{ service_code: '90791' }]);
  Tenant.listForAgency.mockResolvedValue([{ id: 10, serviceCode: '90791', businessType: 'mental_health', isActive: true }]);
  pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
});
it('fills scheduling gaps without replacing saved clinical settings or service overrides', async () => {
  await syncClinicalCodePresent(377, '90791');
  expect(Medical.upsert).not.toHaveBeenCalled();
  expect(Tenant.update).not.toHaveBeenCalled();
  expect(pool.execute).toHaveBeenCalled();
});
it('does not reactivate a disabled medical or booking code during reconciliation', async () => {
  Medical.findByAgencyAndCode.mockResolvedValueOnce({ isActive: false });
  await syncClinicalCodePresent(377, '90791');
  expect(pool.execute).not.toHaveBeenCalled();
  Tenant.listForAgency.mockResolvedValue([{ id: 10, serviceCode: '90791', businessType: 'mental_health', isActive: false }]);
  await syncClinicalCodePresent(377, '90791');
  expect(Tenant.update).not.toHaveBeenCalled();
  expect(Tenant.create).not.toHaveBeenCalled();
});
it('all concurrent callers wait for completion and receive the failure', async () => {
  let reject;
  pool.execute.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const first = syncClinicalCodePresent(377, '90791');
  const second = syncClinicalCodePresent(377, '90791');
  const settled = Promise.allSettled([first, second]);
  await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
  reject(new Error('sync failed'));
  expect((await settled).map(row => row.status)).toEqual(['rejected', 'rejected']);
  expect(pool.execute).toHaveBeenCalledTimes(1);
});
it('does not resurrect removed clinical payroll entries when seeding defaults', async () => {
  Payroll.listForAgency.mockResolvedValue([]);
  Medical.listByAgency.mockResolvedValue([{ serviceCode: '90791', isActive: false }]);
  await ensureAgencyPayrollDictionary(377);
  expect(Payroll.upsert.mock.calls.map(([row]) => row.serviceCode)).not.toContain('90791');
});
