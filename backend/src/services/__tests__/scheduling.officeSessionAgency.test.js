import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ providerAgencies: vi.fn(), officeAgencies: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.providerAgencies } }));
vi.mock('../../models/OfficeLocationAgency.model.js', () => ({ default: { listAgenciesForOffice: m.officeAgencies } }));
import { resolveOfficeSessionAgency } from '../officeSessionAgency.service.js';
beforeEach(() => {
  vi.clearAllMocks(); m.providerAgencies.mockResolvedValue([{ id: 2 }, { id: 377 }]);
  m.officeAgencies.mockResolvedValue([{ id: 2 }, { id: 377 }]);
});
it('checks the selected practice rather than the organization that owns a shared office', async () => {
  expect(await resolveOfficeSessionAgency({ providerId: 501, officeLocationId: 1, agencyId: 377 })).toBe(377);
});
it('rejects a foreign or ambiguous practice rather than guessing the office owner', async () => {
  for (const agencyId of [450, null]) await expect(resolveOfficeSessionAgency({ providerId: 501, officeLocationId: 1, agencyId })).rejects.toThrow();
  m.providerAgencies.mockResolvedValue([{ id: 377 }]);
  expect(await resolveOfficeSessionAgency({ providerId: 501, officeLocationId: 1 })).toBe(377);
  m.officeAgencies.mockResolvedValue([{ id: 2 }]);
  await expect(resolveOfficeSessionAgency({ providerId: 501, officeLocationId: 1, agencyId: 377 })).rejects.toMatchObject({ status: 403 });
});
