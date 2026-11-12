import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ onTableWrite: () => () => {}, default: { execute: vi.fn() } }));
import { filterServiceLocationsForProvider } from '../officeBillingSites.service.js';
import Location from '../../models/AgencyServiceLocation.model.js';
import pool from '../../config/database.js';

beforeEach(() => vi.clearAllMocks());
it('keeps the selected agency’s billing identity when the provider is assigned to its shared physical building', async () => {
  pool.execute.mockResolvedValue([[{ id: 44, agency_id: 377, name: 'Office', place_of_service: '11', billing_office_location_id: 8, physical_office_location_id: 1, is_provider_visible: 1 }]]);
  const locations = await Location.listByAgency(377);
  expect(filterServiceLocationsForProvider(locations, [1])).toEqual([expect.objectContaining({ id: 44, agency_id: 377, billing_office_location_id: 8 })]);
  expect(filterServiceLocationsForProvider(locations, [2])).toEqual([]);
});

it('retains configured home locations while excluding hidden locations and unrelated schools or offices', () => {
  const rows = [
    { id: 44, billing_office_location_id: 8, physical_office_location_id: 1 },
    { id: 47, place_of_service: '12', billing_office_location_id: 8, physical_office_location_id: 1 },
    { id: 48, billing_office_location_id: 8, physical_office_location_id: 1, is_provider_visible: 0 },
    { id: 49, billing_office_location_id: 9, physical_office_location_id: 2 },
    { id: 50, billing_office_location_id: 8, physical_office_location_id: 1, school_organization_id: 20 }
  ];
  expect(filterServiceLocationsForProvider(rows, [1], []).map(row => row.id)).toEqual([44, 47]);
});
