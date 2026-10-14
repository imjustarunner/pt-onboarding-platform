import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), membershipOffices: vi.fn(), ownedOffices: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/OfficeLocation.model.js', () => ({ default: { findByAgencyMembership: mocks.membershipOffices, findByAgency: mocks.ownedOffices } }));
vi.mock('../../models/HiringResumeParse.model.js', () => ({ default: { findLatestStructuredByCandidateUserId: async () => null } }));
vi.mock('../../models/PayrollCompensationLevel.model.js', () => ({ default: { getForUser: async () => null } }));
import { autofillTokensForCandidate, getAgencyBuilderDefaults } from '../contractMerge.service.js';
import { jobLocationOffice } from '../../utils/contractPresentation.js';

const springs = { id: 1, name: 'Windchime', street_address: '437 Windchime Place', city: 'Colorado Springs', state: 'CO', postal_code: '80919' };
const denver = { id: 2, name: 'Denver Office', street_address: '200 Denver St', city: 'Denver', state: 'CO', postal_code: '80201' };
let job;
beforeEach(() => {
  vi.clearAllMocks();
  job = { title: 'Mental Health Provider', city: 'Colorado Springs', state: 'CO' };
  mocks.membershipOffices.mockResolvedValue([springs, denver]);
  mocks.ownedOffices.mockResolvedValue([]);
  mocks.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT user_id')) return [[{ user_id: 2 }]];
    if (sql.includes('FROM users WHERE')) return [[{ first_name: 'Test', last_name: 'Candidate' }]];
    if (sql.includes('FROM agencies')) return [[{ id: 1, name: 'Agency', street_address: '100 Headquarters Rd', city: 'Denver', state: 'CO', postal_code: '80202' }]];
    if (sql.includes('FROM hiring_profiles')) return [[job]];
    if (sql.includes('FROM user_office_locations')) return [[springs]];
    return [[]];
  });
});
const autofill = officeLocationId => autofillTokensForCandidate({ agencyId: 1, candidateUserId: 2, officeLocationId });
describe('agency place of business and job office selection', () => {
  it('uses the agency address and automatically assigns the sole office in the posting city', async () => {
    expect(await autofill()).toMatchObject({ COMPANY_ADDRESS: '100 Headquarters Rd, Denver, CO 80202', ASSIGNED_OFFICE_ID: '1', ASSIGNED_OFFICE_NAME: 'Windchime', ASSIGNED_OFFICE_ADDRESS: '437 Windchime Place, Colorado Springs, CO 80919' });
  });
  it('requires an explicit office for a multiple-city internship even if the candidate already has an office', async () => {
    job.city = 'Colorado Springs & Denver';
    expect(await autofill()).toMatchObject({ ASSIGNED_OFFICE_ID: '', ASSIGNED_OFFICE_NAME: '', ASSIGNED_OFFICE_ADDRESS: '' });
    expect((await autofill(2)).ASSIGNED_OFFICE_ID).toBe('2');
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('FROM user_office_locations'))).toBe(false);
  });
  it('does not automatically pick the only configured office for a multiple-city posting', async () => {
    job.city = 'Colorado Springs & Denver';
    mocks.membershipOffices.mockResolvedValue([springs]);
    expect((await autofill()).ASSIGNED_OFFICE_ID).toBe('');
  });
  it('requires selection when the city has more than one office', async () => {
    mocks.ownedOffices.mockResolvedValue([{ ...springs, id: 3, name: 'Second Springs Office' }]);
    expect((await autofill()).ASSIGNED_OFFICE_ID).toBe('');
    expect((await autofill(3)).ASSIGNED_OFFICE_NAME).toBe('Second Springs Office');
  });
  it('rejects offices outside the agency or the posting city', async () => {
    await expect(autofill(99)).rejects.toThrow('job posting’s locations');
    await expect(autofill(2)).rejects.toThrow('job posting’s locations');
  });
  it('lists both directly owned and shared offices without duplicates', async () => {
    mocks.ownedOffices.mockResolvedValue([springs, { ...springs, id: 3 }]);
    expect((await getAgencyBuilderDefaults(1)).offices.map(office => office.id)).toEqual([1, 2, 3]);
  });
  it('recognizes common multiple-city separators without guessing an office', () => {
    for (const city of ['Colorado Springs and Denver', 'Colorado Springs / Denver', 'Colorado Springs, Denver']) {
      expect(jobLocationOffice([springs], { city, state: 'CO' })).toBeNull();
    }
  });
});
