import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { requireClientChartImportAccess } from '../clientChartImportAccess.service.js';
beforeEach(() => { vi.resetAllMocks(); pool.execute.mockResolvedValue([[{ id:12, agency_id:2 }]]); });
it.each(['school_staff','client_guardian','guardian','client','staff','supervisor','billing','scheduler','clinical_practice_assistant'])('denies %s before reading any private records', async role => {
  await expect(requireClientChartImportAccess({ id:10, role }, 12)).rejects.toMatchObject({ status:403 });
  expect(pool.execute).not.toHaveBeenCalled();
});
it.each(['admin','support','provider','provider_plus'])('checks current membership or direct assignment for %s', async role => {
  await expect(requireClientChartImportAccess({ id:10, role }, 12, 2)).resolves.toEqual({ clientId:12, agencyId:2 });
  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('ua.is_active=1'); expect(sql).toContain('p.is_active=1'); expect(sql).toContain('c.provider_id=?');
  expect(sql).not.toContain('provider_school_assignments'); expect(params).toEqual([12,role,role,10,role,10,10]);
});
it('denies an unassigned provider or revoked agency membership', async () => {
  pool.execute.mockResolvedValue([[]]);
  await expect(requireClientChartImportAccess({ id:10, role:'provider' },12)).rejects.toMatchObject({ status:403 });
});
it('rejects a conflicting agency context even when the client ID is authorized', async () => {
  await expect(requireClientChartImportAccess({ id:10, role:'admin' },12,999)).rejects.toMatchObject({ status:403 });
});
