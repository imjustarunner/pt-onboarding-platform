import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), profile: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: { getForProvider: mocks.profile } }));
import { listOfficeIntakeProviders, scopeLearningIntakeProviders } from '../officeIntakeProviders.service.js';

const rows = [
  { id: 1, first_name: 'Open', last_name: 'Person', accepting: 1, open_virtual_slots: 1, open_slots: 1 },
  { id: 2, first_name: 'Waitlist', last_name: 'Person', accepting: 0, open_virtual_slots: 20, open_slots: 20 },
  { id: 3, first_name: 'Closed', last_name: 'Person', accepting: 0 },
  { id: 4, first_name: 'Office', last_name: 'Person', accepting: 1, in_office_available: 1 }
];
const status = { 1: { IN_PERSON: 'unavailable', VIRTUAL: 'accepting' }, 2: { IN_PERSON: 'unavailable', VIRTUAL: 'waitlist' }, 3: { IN_PERSON: 'unavailable', VIRTUAL: 'unavailable' }, 4: { IN_PERSON: 'accepting', VIRTUAL: 'unavailable' } };

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.execute.mockImplementation(async sql => sql.includes('FROM users u') ? [rows] : [[]]);
  mocks.profile.mockReset();
  mocks.profile.mockImplementation(async ({ providerUserId, agencyId }) => {
    expect(agencyId).toBe(2);
    return { publicBlurb: `Public introduction ${providerUserId}`, insurances: ['Example plan'],
      agencyAvailability: { seesClients: true, inPerson: true, virtual: true, intakeStatusByFormat: status[providerUserId] },
      details: { languages: ['English'], clinicalFocus: { excluded: { specialties: providerUserId === 1 ? ['Depression'] : [] }, top: {} } } };
  });
});

describe('full enrollment eligible provider directory', () => {
  it('lists Open first, then Waitlist, and excludes closed formats even for legacy includeNotAccepting callers', async () => {
    const result = await listOfficeIntakeProviders(2, { programType: 'VIRTUAL', includeNotAccepting: true });
    expect(result.map(row => row.id)).toEqual([1, 2]);
    expect(result[0]).toMatchObject({ publicBlurb: 'Public introduction 1', intakeStatusByFormat: status[1], acceptingNewClients: true, waitlist: false, virtualAvailable: true });
    expect(result[1].waitlist).toBe(true);
  });
  it('allows either format without hiding an otherwise open in-person clinician', async () => {
    const result = await listOfficeIntakeProviders(2, { programType: 'ALL', includeNotAccepting: false, includeWaitlist: true });
    expect(result.map(row => row.id)).toEqual([1, 4, 2]);
  });
  it('honors declared exclusions from presenting needs rather than suggesting an incompatible clinician', async () => {
    const result = await listOfficeIntakeProviders(2, { programType: 'VIRTUAL', includeWaitlist: true, matchingPreferences: { specialties: ['Depression'] } });
    expect(result.map(row => row.id)).toEqual([2]);
  });
  it('keeps waitlist opt-in for callers that explicitly ask for only open providers', async () => {
    expect((await listOfficeIntakeProviders(2, { programType: 'VIRTUAL', includeNotAccepting: false })).map(row => row.id)).toEqual([1]);
  });
  it('applies the same tenant format gate to learning providers without treating every closed tutor as waitlisted', async () => {
    const result = await scopeLearningIntakeProviders(2, rows.map(row => ({ id: row.id, displayName: row.first_name, acceptingNewClients: true })), 'VIRTUAL');
    expect(result.map(row => row.id)).toEqual([1, 2]);
    expect(result[1]).toMatchObject({ waitlist: true, acceptingNewClients: false });
  });
});
