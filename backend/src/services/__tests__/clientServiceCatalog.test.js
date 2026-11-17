import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { clientServiceKindsForAgency } from '../clientServiceCatalog.service.js';

it('offers counseling only for a clinical agency with no extra service types', async () => {
  const db = { execute: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ organization_type: 'agency' }]]) };
  expect(await clientServiceKindsForAgency(6, db)).toEqual(['counseling']);
});
it('uses configured service types independently for each agency', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ business_type: 'mental_health', is_enabled: 1 }, { business_type: 'tutoring', is_enabled: 1 }, { business_type: 'coaching', is_enabled: 0 }]]) };
  expect(await clientServiceKindsForAgency(6, db)).toEqual(['counseling', 'tutoring']);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE agency_id = ?'), [6]);
});
it('keeps disabled catalogs disabled and maps consulting to the client service name', async () => {
  const db = { execute: vi.fn().mockResolvedValueOnce([[{ business_type: 'mental_health', is_enabled: 0 }]]).mockResolvedValueOnce([[{ business_type: 'consulting', is_enabled: 1 }]]) };
  expect(await clientServiceKindsForAgency(6, db)).toEqual([]);
  expect(await clientServiceKindsForAgency(7, db)).toEqual(['consultation']);
});
