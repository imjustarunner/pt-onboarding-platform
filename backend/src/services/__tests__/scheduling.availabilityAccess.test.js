import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { requireProviderAvailabilityAccess as check } from '../providerAvailabilityAccess.service.js';
beforeEach(() => { pool.execute.mockReset().mockResolvedValue([[{ present: 1 }]]); });
describe('availability on behalf of another provider', () => {
  it.each(['super_admin', 'superadmin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus'])('allows %s within the target tenant', async role => {
    expect(await check({ actor: { id: 1, role }, agencyId: 2, providerId: 485 })).toBe(485);
  });
  it('does not let a provider edit a colleague', async () => {
    await expect(check({ actor: { id: 1, role: 'provider' }, agencyId: 2, providerId: 485 })).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a target outside the tenant even for a superadmin', async () => {
    pool.execute.mockResolvedValue([[]]);
    await expect(check({ actor: { id: 1, role: 'super_admin' }, agencyId: 2, providerId: 485 })).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a staff member outside the tenant', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    await expect(check({ actor: { id: 1, role: 'support' }, agencyId: 2, providerId: 485 })).rejects.toMatchObject({ status: 403 });
  });
  it('limits supervisor edits to assigned supervisees in the same tenant', async () => {
    pool.execute.mockImplementation(async sql => [sql.includes('supervisor_assignments') ? [] : [{ present: 1 }]]);
    await expect(check({ actor: { id: 1, role: 'supervisor' }, agencyId: 2, providerId: 485 })).rejects.toMatchObject({ status: 403 });
  });
  it('preserves self-service', async () => {
    expect(await check({ actor: { id: 485, role: 'provider' }, agencyId: 2, providerId: 485 })).toBe(485);
  });
});
