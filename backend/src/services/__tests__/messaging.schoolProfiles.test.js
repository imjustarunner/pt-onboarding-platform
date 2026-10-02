import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { enrichHubSchoolStaff } from '../hubSchoolProfiles.service.js';
beforeEach(() => vi.clearAllMocks());
it('shows assigned schools instead of the tenant and does not mix another tenant or sender', async () => {
  pool.execute.mockResolvedValue([[{ user_id: 7, school_id: 41, school_name: 'Cheyenne El', tenant_id: 2 },
    { user_id: 7, school_id: 90, school_name: 'Other tenant school', tenant_id: 3 },
    { user_id: 8, school_id: 42, school_name: 'Second school', tenant_id: 2 }]]);
  const people = await enrichHubSchoolStaff([{ userId: 7, agencyId: 2, kinds: ['school_staff'], agencyName: 'ITSCO' },
    { userId: 8, agencyId: 2, kinds: ['school_staff'] }]);
  expect(people[0]).toMatchObject({ agencyName: 'ITSCO', schoolNames: ['Cheyenne El'], relationshipMeta: 'School staff · Cheyenne El' });
  expect(people[1].schoolNames).toEqual(['Second school']);
  expect(pool.execute.mock.calls[0][0]).toContain('oa.is_active = 1');
  expect(pool.execute.mock.calls[0][0]).toContain('ua.is_active = 1');
});
it('avoids school lookups for non-school contacts', async () => {
  const people = [{ userId: 7, agencyId: 2, kinds: ['guardian'] }];
  expect(await enrichHubSchoolStaff(people)).toEqual(people);expect(pool.execute).not.toHaveBeenCalled();
});

it('preserves readable messages when optional school metadata cannot load', async () => {
  pool.execute.mockRejectedValue(new Error('connection unavailable'));
  const people=[{userId:7,agencyId:2,kinds:['school_staff'],displayName:'School sender'}];
  expect(await enrichHubSchoolStaff(people)).toEqual(people);
});
