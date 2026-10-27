import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { resolveEventVenueAddress } from '../companyEventVenue.service.js';

describe('saved event venue addresses', () => {
  it('retains an explicit venue address and reuses public addresses when needed', async () => {
    expect(await resolveEventVenueAddress({ eventLocationAddress: '10 Event St', publicLocationAddress: '20 Public St' })).toBe('10 Event St');
    expect(await resolveEventVenueAddress({ eventLocationAddress: '  ', publicLocationAddress: '20 Public St' })).toBe('20 Public St');
  });
  it('uses the linked school’s saved street address', async () => {
    const db = { execute: vi.fn(async () => [[{ street_address: '30 School St', city: 'Denver', state: 'CO', postal_code: '80201' }]]) };
    expect(await resolveEventVenueAddress({ organizationId: 12, db })).toBe('30 School St, Denver, CO, 80201');
    expect(db.execute.mock.calls[0][1]).toEqual([12]);
  });
  it('requires an address for named venues and in-person public events', async () => {
    for (const input of [{ eventLocationName: 'Community center' }, { inPersonPublic: true }]) {
      await expect(resolveEventVenueAddress(input)).rejects.toMatchObject({ status: 400 });
    }
  });
  it('does not treat a school city alone as its venue address', async () => {
    await expect(resolveEventVenueAddress({ organizationId: 12, db: { execute: async () => [[{ city: 'Denver' }]] } })).rejects.toThrow('full street address');
  });
  it('does not require a venue for a poll or event without a physical location', async () => {
    expect(await resolveEventVenueAddress({})).toBeNull();
  });
});
